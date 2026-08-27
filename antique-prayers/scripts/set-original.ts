/**
 * set-original.ts — fill the `## Оригинал` section of prayer files from a batch file.
 *
 * Bulk-filling 260 originals by hand-editing markdown is where mistakes happen:
 * a section boundary gets clipped, a frontmatter field goes out of sync with the
 * body, an apostrophe breaks a quoted string. This does the mechanical part.
 *
 * Input: a JSON array, each entry
 *   { "file": "orphic-hermes-001", "lang": "el" | "la", "text": "…", "source": "…" }
 * `file` may be given with or without the .md extension. `source` is optional and
 * only echoed in the report, so the operator can see where each text came from.
 *
 * Guarantees:
 *   - refuses to overwrite a non-empty Оригинал unless --force
 *   - keeps `original_lang` in the frontmatter in step with what it writes
 *   - touches nothing else in the file
 *   - --dry prints what it would do
 *
 * Run: npx tsx antique-prayers/scripts/set-original.ts batch.json [--force] [--dry]
 */
import {readFile, writeFile} from 'node:fs/promises'
import {join, dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const DRY = args.includes('--dry')
const batchPath = args.find(a => !a.startsWith('--'))
if (!batchPath) { console.error('usage: set-original.ts <batch.json> [--force] [--dry]'); process.exit(1) }

type Entry = {file: string; lang: 'el' | 'la'; text: string; source?: string}

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

    if (e.lang !== 'el' && e.lang !== 'la') { console.error(`  ✗ ${name}: lang must be el or la`); failed++; continue }
    const text = (e.text ?? '').trim()
    if (!text) { console.error(`  ✗ ${name}: empty text`); failed++; continue }

    const m = sectionRe('Оригинал').exec(raw)
    if (!m) { console.error(`  ✗ ${name}: no "## Оригинал" section`); failed++; continue }
    if (m[2].trim() && !FORCE) { console.log(`  · ${name}: already has an original, skipped`); skipped++; continue }

    let out = raw.slice(0, m.index) + m[1] + `\n\n${text}\n\n` + raw.slice(m.index + m[0].length)

    // Keep the frontmatter flag truthful about what the body now holds.
    if (/^original_lang:.*$/m.test(out)) out = out.replace(/^original_lang:.*$/m, `original_lang: ${e.lang}`)
    else out = out.replace(/^---$/m, `---\noriginal_lang: ${e.lang}`)

    if (!DRY) await writeFile(path, out, 'utf8')
    console.log(`  ✓ ${name}  ${e.lang}  ${text.length} chars${e.source ? `  ← ${e.source}` : ''}`)
    written++
  }

  console.log(`\n${DRY ? 'Would write' : 'Wrote'}: ${written}   skipped: ${skipped}   failed: ${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
