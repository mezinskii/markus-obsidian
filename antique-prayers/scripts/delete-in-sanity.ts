/**
 * delete-in-sanity.ts — remove from the dataset the prayers retired to `_removed/`.
 *
 * This is the one irreversible step in the deduplication. Everything before it
 * happens in Obsidian, where a mistake is a file away from being undone; a
 * delete against `production` is not. So it is gated on its own `--confirm`,
 * separate from every other flag, and it refuses to touch a document that
 * anything still points at — a dangling reference in Sanity is worse than a
 * duplicate, and the front-ends resolve prayers by `_id`.
 *
 * The list is not hardcoded: it is read from the `sanity_id` of each file in
 * `_removed/`, so what gets deleted is exactly what merge-duplicates.ts retired,
 * and restoring a file to `prayers/` before running takes it off the list.
 *
 * Run: npx tsx antique-prayers/scripts/delete-in-sanity.ts [--confirm]
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'
import matter from 'gray-matter'
import 'dotenv/config'

const HERE = dirname(fileURLToPath(import.meta.url))
const GONE = join(HERE, '..', '_removed')
const CONFIRM = process.argv.includes('--confirm')

const projectId = process.env.SANITY_PROJECT_ID ?? '13u931c6'
const dataset = process.env.SANITY_DATASET ?? 'production'
const token = process.env.SANITY_API_TOKEN

async function main() {
  const files = (await readdir(GONE)).filter(f => f.endsWith('.md')).sort()
  const targets: {file: string; id: string; supersededBy: string}[] = []
  for (const f of files) {
    const {data} = matter(await readFile(join(GONE, f), 'utf8'))
    const fm = data as Record<string, any>
    if (fm.sanity_id) targets.push({file: f, id: String(fm.sanity_id), supersededBy: String(fm.superseded_by ?? '')})
  }

  const client = createClient({projectId, dataset, apiVersion: '2024-01-01', token, useCdn: false})
  console.log(`Project: ${projectId} · dataset: ${dataset}${CONFIRM ? '' : '  (dry run)'}\n`)

  const ids = targets.map(t => t.id)
  const present: string[] = await client.fetch('*[_id in $ids]._id', {ids})
  // A document that anything references cannot be deleted without orphaning the
  // referrer, so it is reported and skipped rather than force-deleted.
  const referenced: {_id: string; by: string[]}[] = await client.fetch(
    `*[_id in $ids]{_id, "by": *[references(^._id)]._id}`, {ids},
  )
  const blocked = new Map(referenced.filter(r => r.by.length).map(r => [r._id, r.by]))

  let ok = 0, missing = 0, held = 0
  for (const t of targets) {
    if (!present.includes(t.id)) { console.log(`  · ${t.id} — в датасете нет, пропуск`); missing++; continue }
    const by = blocked.get(t.id)
    if (by) { console.log(`  ! ${t.id} — на него ссылаются: ${by.join(', ')} — НЕ удаляю`); held++; continue }
    console.log(`  ${CONFIRM ? '✓' : '→'} ${t.id}   вместо него ${t.supersededBy}`)
    if (CONFIRM) await client.delete(t.id)
    ok++
  }

  console.log(`\n${CONFIRM ? 'Удалено' : 'Будет удалено'}: ${ok}   уже отсутствует: ${missing}   удержано ссылками: ${held}`)
  if (!CONFIRM) console.log('Сухой прогон — ничего не удалено. Для удаления: --confirm')
}

main().catch(e => { console.error(e); process.exit(1) })
