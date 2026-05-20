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

  // Upload everything in a single transaction.  Sanity validates references
  // atomically inside a transaction, so a passageCard that points at a term
  // included in the same commit doesn't trip the "non-existent document"
  // check — even though the term is technically created later in the batch.
  console.log('\nUploading (one transaction)…')
  const tx = client.transaction()
  for (const doc of selected) tx.createOrReplace(doc)
  try {
    const result = await tx.commit({visibility: 'async', autoGenerateArrayKeys: false})
    console.log(`\nDone. Transaction id: ${result.transactionId}`)
    console.log(`Mutations committed: ${selected.length}`)
  } catch (err) {
    console.error(`\nTransaction failed: ${(err as Error).message}`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
