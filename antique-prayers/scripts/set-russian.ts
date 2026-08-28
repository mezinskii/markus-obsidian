/**
 * set-russian.ts — fill the `## Русский` section of prayer files from a batch file.
 *
 * Sibling of set-original.ts, deliberately narrower: it touches the body only.
 * There is no `russian_lang` to keep in step and no frontmatter field that
 * mirrors the translation, so unlike set-original.ts this script must leave the
 * frontmatter completely alone.
 *
 * Input: a JSON array, each entry
 *   { "file": "bacchus-001", "text": "…", "from": "la" | "el" | "en", "note": "…" }
 * `file` may be given with or without the .md extension. `from` records which
 * text the Russian was made from and is only echoed in the report — the corpus
 * rule is la/el wherever an original exists, `en` only for the 44 cards without
 * one. `note` is optional and likewise only echoed.
 *
 * Guarantees:
 *   - refuses to overwrite a non-empty Русский unless --force
 *   - touches nothing but the one section
 *   - --dry prints what it would do
 *
 * Run: npx tsx antique-prayers/scripts/set-russian.ts batch.json [--force] [--dry]
 * (never `npm run … -- --flag`: that combination swallows the flag, and a
 *  supposed dry run becomes a real write.)
 */
import {readFile, writeFile} from 'node:fs/promises'
import {join, dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const DRY = args.includes('--dry')
const batchPath = args.find(a => !a.startsWith('--'))
if (!batchPath) { console.error('usage: set-russian.ts <batch.json> [--force] [--dry]'); process.exit(1) }

type Entry = {file: string; text: string; from?: 'la' | 'el' | 'en'; note?: string}

/** End-of-input assertion is `(?![\s\S])`, never `\z` — JavaScript has no `\z`,
 *  and the degraded escape silently truncates a section at the first "z". */
const sectionRe = (h: string) =>
  new RegExp(`(^## ${h}\\s*$)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')

async function main() {
  const batch: Entry[] = JSON.parse(await readFile(resolve(batchPath!), 'utf8'))
  let written = 0, skipped = 0, failed = 0

  for (const e of batch) {
    const name = e.file.endsWith('.md') ? e.file : `${e.file}.md`
    const path = join(DIR, name)
    let raw: string
    try { raw = await readFile(path, 'utf8') } catch { console.error(`  ✗ ${name}: not found`); failed++; continue }

    const text = (e.text ?? '').trim()
    if (!text) { console.error(`  ✗ ${name}: empty text`); failed++; continue }

    const m = sectionRe('Русский').exec(raw)
    if (!m) { console.error(`  ✗ ${name}: no "## Русский" section`); failed++; continue }
    if (m[2].trim() && !FORCE) { console.log(`  · ${name}: already translated, skipped`); skipped++; continue }

    const out = raw.slice(0, m.index) + m[1] + `\n\n${text}\n\n` + raw.slice(m.index + m[0].length)

    if (!DRY) await writeFile(path, out, 'utf8')
    const lines = text.split('\n').filter(Boolean).length
    console.log(`  ✓ ${name}  ${text.length} chars, ${lines} lines${e.from ? `  ← ${e.from}` : ''}${e.note ? `  (${e.note})` : ''}`)
    written++
  }

  console.log(`\n${DRY ? 'Would write' : 'Wrote'}: ${written}   skipped: ${skipped}   failed: ${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
