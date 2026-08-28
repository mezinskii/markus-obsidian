/**
 * restore-source-notes.ts — back-fill `source.note` from the original batch files.
 *
 * Why this exists: the first version of set-original.ts took a `source` field in
 * each batch entry and only ECHOED it to the console. Every note about which
 * edition a text came from, which OCR slips were corrected, what was normalised
 * and where the English diverges was therefore written, reviewed — and thrown
 * away. 243 of them, some forty thousand characters, survived only in the batch
 * JSON files sitting in a scratch directory that any cleanup would erase.
 *
 * This reads those batch files and writes each note into its card. Running it
 * again is harmless: setSourceNote replaces an existing note rather than
 * appending, and identical input produces an identical file.
 *
 * Usage:
 *   npx tsx antique-prayers/scripts/restore-source-notes.ts <dir-with-batch-json> [--dry]
 *
 * A batch entry contributes a note when it has both `file` and `source`.
 * Later files win on conflict, so pass the directory in its natural order and
 * corrections written later override the first attempt — which is what the
 * chronology of those batches means.
 */
import {readdir, readFile, writeFile} from 'node:fs/promises'
import {join, dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {setSourceNote} from './source-note.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const batchDir = args.find(a => !a.startsWith('--'))
if (!batchDir) { console.error('usage: restore-source-notes.ts <dir> [--dry]'); process.exit(1) }

type Entry = {file?: string; source?: string}

async function main() {
  const files = (await readdir(resolve(batchDir!))).filter(f => f.endsWith('.json')).sort()
  const notes = new Map<string, string>()
  let unparsed = 0

  for (const f of files) {
    let batch: Entry[]
    try { batch = JSON.parse(await readFile(join(resolve(batchDir!), f), 'utf8')) } catch { unparsed++; continue }
    if (!Array.isArray(batch)) continue
    for (const e of batch) {
      if (e.file && e.source) notes.set(e.file.replace(/\.md$/, ''), e.source)
    }
  }

  console.log(`партий прочитано: ${files.length - unparsed}${unparsed ? ` (не разобрано: ${unparsed})` : ''}`)
  console.log(`заметок собрано:  ${notes.size}\n`)

  let written = 0, unchanged = 0, missing = 0
  for (const [id, note] of [...notes].sort()) {
    const path = join(DIR, `${id}.md`)
    let raw: string
    try { raw = await readFile(path, 'utf8') } catch { console.error(`  ✗ ${id}: карточки нет`); missing++; continue }

    const out = setSourceNote(raw, note)
    if (out === raw) { unchanged++; continue }
    if (!DRY) await writeFile(path, out, 'utf8')
    written++
  }

  console.log(`${DRY ? 'записал бы' : 'записано'}: ${written}   без изменений: ${unchanged}   карточка не найдена: ${missing}`)
}

main().catch(err => { console.error(err); process.exit(1) })
