/**
 * set-commentary.ts — fill `## Комментарий` and `## Commentary` from a batch file.
 *
 * Sibling of set-original.ts / set-russian.ts, but writes TWO sections in one
 * pass. Doing them separately would mean two runs over the same file and two
 * chances to clip a boundary, and the two texts are written together anyway —
 * the English is a translation of the Russian, not an independent note.
 *
 * Input: a JSON array, each entry
 *   { "file": "cato-mars-lustratio-001", "ru": "…", "en": "…" }
 * Either `ru` or `en` may be omitted; an omitted section is left untouched
 * rather than blanked, so a batch can top up only the missing language.
 *
 * Guarantees:
 *   - refuses to overwrite a non-empty section unless --force
 *   - touches nothing but the two sections; frontmatter is never read or written
 *   - --dry prints what it would do
 *
 * `## Commentary` is the last section in every card, so its match runs to end
 * of input. That is what the `(?![\s\S])` alternative in sectionRe is for.
 *
 * Run: npx tsx antique-prayers/scripts/set-commentary.ts batch.json [--force] [--dry]
 * (never `npm run … -- --flag`: that combination swallows the flag.)
 */
import {readFile, writeFile} from 'node:fs/promises'
import {join, dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const DRY = args.includes('--dry')
const batchPath = args.find(a => !a.startsWith('--'))
if (!batchPath) { console.error('usage: set-commentary.ts <batch.json> [--force] [--dry]'); process.exit(1) }

type Entry = {file: string; ru?: string; en?: string}

/** End-of-input assertion is `(?![\s\S])`, never `\z` — JavaScript has no `\z`,
 *  and the degraded escape silently truncates a section at the first "z". */
const sectionRe = (h: string) =>
  new RegExp(`(^## ${h}\\s*$)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')

/** Returns null when the section is absent or already filled without --force,
 *  so the caller can tell "nothing to do" from "wrote it". */
function fill(raw: string, heading: string, text: string): {out: string} | {skip: string} {
  const m = sectionRe(heading).exec(raw)
  if (!m) return {skip: `no "## ${heading}" section`}
  if (m[2].trim() && !FORCE) return {skip: `${heading} already filled`}
  return {out: raw.slice(0, m.index) + m[1] + `\n\n${text}\n\n` + raw.slice(m.index + m[0].length)}
}

async function main() {
  const batch: Entry[] = JSON.parse(await readFile(resolve(batchPath!), 'utf8'))
  let written = 0, skipped = 0, failed = 0

  for (const e of batch) {
    const name = e.file.endsWith('.md') ? e.file : `${e.file}.md`
    const path = join(DIR, name)
    let raw: string
    try { raw = await readFile(path, 'utf8') } catch { console.error(`  ✗ ${name}: not found`); failed++; continue }

    const ru = (e.ru ?? '').trim()
    const en = (e.en ?? '').trim()
    if (!ru && !en) { console.error(`  ✗ ${name}: neither ru nor en given`); failed++; continue }

    const notes: string[] = []
    let touched = false
    for (const [heading, text] of [['Комментарий', ru], ['Commentary', en]] as const) {
      if (!text) continue
      const r = fill(raw, heading, text)
      if ('skip' in r) { notes.push(r.skip); continue }
      raw = r.out; touched = true
    }

    if (!touched) { console.log(`  · ${name}: ${notes.join('; ')}`); skipped++; continue }
    if (!DRY) await writeFile(path, raw, 'utf8')
    const sizes = [ru && `ru ${ru.length}`, en && `en ${en.length}`].filter(Boolean).join(', ')
    console.log(`  ✓ ${name}  ${sizes}${notes.length ? `  (${notes.join('; ')})` : ''}`)
    written++
  }

  console.log(`\n${DRY ? 'Would write' : 'Wrote'}: ${written}   skipped: ${skipped}   failed: ${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
