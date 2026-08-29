/**
 * set-translator.ts — credit the borrowed English translations.
 *
 * The About page promises that where a recognised translation exists the site
 * uses it and names the translator. It did not: not one card carried a name.
 * Comparing every card's English against the two obvious candidates settled
 * where the text actually came from — 64% of all eight-word runs in the
 * homeric-* cards are verbatim Evelyn-White, 38% of the orphic-* cards are
 * verbatim Taylor (lower only because Taylor's 1792 verse was modernised more
 * heavily), and nothing outside those two groups matched either at all.
 *
 * Both translators are long out of copyright, so this is a credit owed, not a
 * licence problem. The English of every other card was made for this
 * collection and needs no line.
 *
 * Run: npx tsx antique-prayers/scripts/set-translator.ts [--dry]
 */
import {readdir, readFile, writeFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const DRY = process.argv.includes('--dry')

/** Prefix of the card id → who made its English. */
const CREDIT: Array<{prefix: string; en: string}> = [
  {prefix: 'homeric-', en: 'Hugh G. Evelyn-White, 1914'},
  {prefix: 'orphic-', en: 'Thomas Taylor, 1792'},
]

/**
 * Insert or replace the `translator:` block in the frontmatter.
 *
 * Line-based, like set-titles.ts: rebuilding the whole frontmatter through a
 * YAML round-trip reorders keys and reflows every quoted string, which turns a
 * two-line change into a diff across the corpus.
 */
function setTranslator(raw: string, en: string): string | null {
  const lines = raw.split('\n')
  const end = lines.indexOf('---', 1)
  if (end < 0) return null

  const block = ['translator:', `  en: ${JSON.stringify(en)}`]

  const at = lines.findIndex((l, i) => i < end && l === 'translator:')
  if (at >= 0) {
    let stop = at + 1
    while (stop < end && /^\s+\S/.test(lines[stop])) stop++
    const current = lines.slice(at, stop).join('\n')
    if (current === block.join('\n')) return null
    lines.splice(at, stop - at, ...block)
    return lines.join('\n')
  }

  // Place it after `original_lang` so the provenance of text sits together.
  const anchor = lines.findIndex((l, i) => i < end && l.startsWith('original_lang:'))
  lines.splice(anchor >= 0 ? anchor + 1 : end, 0, ...block)
  return lines.join('\n')
}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  let changed = 0

  for (const file of files) {
    const id = file.replace(/\.md$/, '')
    const credit = CREDIT.find(c => id.startsWith(c.prefix))
    if (!credit) continue

    const raw = await readFile(join(DIR, file), 'utf8')
    const next = setTranslator(raw, credit.en)
    if (!next) continue

    console.log(`  ~ ${id}: ${credit.en}`)
    if (!DRY) await writeFile(join(DIR, file), next, 'utf8')
    changed++
  }

  console.log(`\n${DRY ? 'Dry run — ' : ''}${changed} card(s)${DRY ? ' would be' : ''} credited.`)
}

main().catch(e => { console.error(e); process.exit(1) })
