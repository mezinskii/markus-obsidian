/**
 * upload.ts — Phase 3 of the Marcus vault pipeline.
 *
 *   build/import.ndjson  ──▶  Sanity (createOrReplace)
 *
 * Reads `build/import.ndjson`, line by line, parses each as a Sanity
 * document, and pushes it via `client.createOrReplace`.  Idempotent: a
 * re-run with the same input simply overwrites the existing documents.
 *
 * Requires .env at the vault root with:
 *   SANITY_PROJECT_ID
 *   SANITY_DATASET   (optional; defaults to "production")
 *   SANITY_API_TOKEN (must have write access to the dataset)
 *
 * Flags:
 *   --dry-run        Parse and validate, but don't upload.
 *   --filter=TYPE    Only upload documents of the given _type (e.g. "term").
 *   --filter-id=ID   Only upload documents whose _id matches this prefix
 *                    (e.g. "passageCard.02-13").
 */

import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const NDJSON_FILE = join(ROOT, 'build', 'import.ndjson')

// ────────────────────────────────────────────────────────────────────────────
// Args
// ────────────────────────────────────────────────────────────────────────────

interface Args {
  dryRun: boolean
  filterType?: string
  filterId?: string
}

const parseArgs = (argv: readonly string[]): Args => {
  const args: Args = {dryRun: false}
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith('--filter=')) args.filterType = arg.slice('--filter='.length)
    else if (arg.startsWith('--filter-id=')) args.filterId = arg.slice('--filter-id='.length)
  }
  return args
}

// ────────────────────────────────────────────────────────────────────────────
// Sanity client
// ────────────────────────────────────────────────────────────────────────────

const projectId = process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_DATASET ?? 'production'
const token = process.env.SANITY_API_TOKEN

if (!projectId) {
  console.error('Missing SANITY_PROJECT_ID (check .env at vault root)')
  process.exit(1)
}
if (!token) {
  console.error('Missing SANITY_API_TOKEN (check .env at vault root)')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2026-04-20',
  token,
  useCdn: false,
})

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

interface SanityDoc {
  _id: string
  _type: string
  [k: string]: unknown
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))

  const raw = await readFile(NDJSON_FILE, 'utf8')
  const lines = raw.split('\n').filter((line) => line.trim().length > 0)

  // Parse and validate
  const docs: SanityDoc[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    try {
      const doc = JSON.parse(line) as SanityDoc
      if (!doc._id || !doc._type) {
        throw new Error(`document missing _id or _type`)
      }
      docs.push(doc)
    } catch (err) {
      console.error(`Line ${i + 1}: parse error — ${(err as Error).message}`)
      process.exit(1)
    }
  }

  // Apply filters
  let selected = docs
  if (args.filterType) {
    selected = selected.filter((d) => d._type === args.filterType)
  }
  if (args.filterId) {
    selected = selected.filter((d) => d._id.startsWith(args.filterId!))
  }

  // Group by type for the summary
  const byType: Record<string, number> = {}
  for (const doc of selected) {
    byType[doc._type] = (byType[doc._type] ?? 0) + 1
  }

  console.log(`Project: ${projectId} · dataset: ${dataset}`)
  console.log(`Total documents in NDJSON: ${docs.length}`)
  console.log(`Selected for upload: ${selected.length}`)
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`  ${type}: ${count}`)
  }

  if (args.dryRun) {
    console.log('\n(dry-run) skipping upload.')
    return
  }

  if (selected.length === 0) {
    console.log('\nNothing to upload.')
    return
  }

  // Sanity caps a single mutation request body at 4 MB; the corpus no longer
  // fits in one transaction. Batch ordering alone cannot satisfy strong-
  // reference integrity, because references are bidirectional: a term's
  // "mentions" link to passageCards and passageCards link back to terms. So we
  // first bootstrap a bare {_id,_type} stub for every new document (existing
  // ones are left untouched), then write full content with createOrReplace in
  // size-bounded batches — by then every reference target already exists.
  const BUDGET = 3_500_000 // bytes of doc JSON per transaction (< 4 MB, leaves room for wrappers)

  const docSize = (d: SanityDoc): number => Buffer.byteLength(JSON.stringify(d), 'utf8')

  const packBatches = (docs: SanityDoc[]): SanityDoc[][] => {
    const batches: SanityDoc[][] = []
    let cur: SanityDoc[] = []
    let curSize = 0
    for (const doc of docs) {
      const s = docSize(doc)
      if (s > BUDGET) {
        console.error(`Document ${doc._id} is ${s} bytes — exceeds per-transaction budget ${BUDGET}.`)
        process.exit(1)
      }
      if (curSize + s > BUDGET && cur.length > 0) {
        batches.push(cur)
        cur = []
        curSize = 0
      }
      cur.push(doc)
      curSize += s
    }
    if (cur.length > 0) batches.push(cur)
    return batches
  }

  // Bootstrap: create a bare {_id,_type} stub for every document so that, once
  // we write full content in batches, every (strong) reference target already
  // exists. createIfNotExists leaves already-published documents untouched.
  console.log(`\nBootstrapping ${selected.length} document stubs…`)
  const stubTx = client.transaction()
  for (const doc of selected) stubTx.createIfNotExists({_id: doc._id, _type: doc._type})
  try {
    await stubTx.commit({visibility: 'async'})
  } catch (err) {
    console.error(`\nStub bootstrap failed: ${(err as Error).message}`)
    process.exit(1)
  }

  const batches = packBatches(selected)
  console.log(`Uploading full content in ${batches.length} batch(es) (≤ ${(BUDGET / 1e6).toFixed(1)} MB each)…`)
  let committed = 0
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const bytes = batch.reduce((n, d) => n + docSize(d), 0)
    const tx = client.transaction()
    for (const doc of batch) tx.createOrReplace(doc)
    try {
      const result = await tx.commit({visibility: 'async', autoGenerateArrayKeys: false})
      committed += batch.length
      console.log(
        `  batch ${bi + 1}/${batches.length}: ${batch.length} docs, ` +
          `~${(bytes / 1e6).toFixed(2)} MB — tx ${result.transactionId}`,
      )
    } catch (err) {
      console.error(`\nBatch ${bi + 1} failed: ${(err as Error).message}`)
      console.error(`Committed ${committed}/${selected.length} before the failure.`)
      process.exit(1)
    }
  }
  console.log(`\nDone. Mutations committed: ${committed}/${selected.length}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
