/**
 * merge-taxonomy.ts — fold stray vocabulary values into the controlled ones.
 *
 * The literary imports — homeric-*, orphic-*, callimachus-*, ovid-* — were
 * tagged with a finer vocabulary than the eight spheres and seven functions the
 * site publishes. The extra values were never labelled anywhere, so about fifty
 * cards showed a raw English word where the filter list shows a translation,
 * and none of them could be reached from a filter at all.
 *
 * Four of the seven are the same thing under another name and are merged here.
 * Three are real distinctions the corpus makes and the site did not — they are
 * added to the site's vocabulary instead, not merged away:
 *
 *   fertility   17 cards  Aphrodite, Priapus, Dionysus. Neither `agricultural`
 *                         (crops) nor `family` (household) covers it.
 *   wilderness   5 cards  Artemis and the hunt: the uncultivated, which is the
 *                         opposite of `agricultural` rather than a kind of it.
 *   atonement    1 card   Expiation. Thin now, but piaculum is a real category
 *                         and merging it into `gratitude` would be false.
 *
 * The merges are lossy: `domestic` and `family` were distinguishable before
 * this ran, and afterwards they are not. That is deliberate — a reader's filter
 * with two neighbouring labels is worse than one honest one — but it is a
 * judgement, and it lives in one commit if it needs undoing.
 *
 * Run: npx tsx antique-prayers/scripts/merge-taxonomy.ts [--dry]
 */
import {readdir, readFile, writeFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const DRY = process.argv.includes('--dry')

/** field → { stray value: value it becomes } */
const MERGES: Record<'sphere' | 'functions', Record<string, string>> = {
  sphere: {
    // Two names for the sea; `navigation` is the one the site publishes.
    maritime: 'navigation',
    // The hearth is part of the household, and a filter does not need both.
    domestic: 'family',
    // Not a sphere of life at all — it duplicates the `form: literary` field.
    // These are prayers embedded in poetry, which is what `arts` means here.
    literary: 'arts',
  },
  functions: {
    thanksgiving: 'gratitude',
  },
}

/** Rewrite one YAML list block, merging values and dropping duplicates. */
function mergeBlock(raw: string, field: string, map: Record<string, string>) {
  const re = new RegExp(`(^${field}:[^\\S\\n]*\\n)((?:[ \\t]+-[^\\n]*\\n)+)`, 'm')
  const m = re.exec(raw)
  if (!m) return {text: raw, changed: [] as string[]}

  const changed: string[] = []
  const seen = new Set<string>()
  const kept: string[] = []

  for (const line of m[2].split('\n')) {
    const item = /^[ \t]+-[ \t]+(.*?)[ \t]*$/.exec(line)
    if (!item) continue
    const from = item[1]
    const to = map[from]
    if (to) changed.push(`${from}→${to}`)
    const value = to ?? from
    // A card tagged both `maritime` and `navigation` must not end up with
    // `navigation` twice.
    if (seen.has(value)) continue
    seen.add(value)
    kept.push(`  - ${value}`)
  }

  if (changed.length === 0) return {text: raw, changed}
  return {text: raw.replace(re, `${m[1]}${kept.join('\n')}\n`), changed}
}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  let touched = 0
  const tally: Record<string, number> = {}

  for (const file of files) {
    let raw = await readFile(join(DIR, file), 'utf8')
    const all: string[] = []

    for (const field of ['sphere', 'functions'] as const) {
      const {text, changed} = mergeBlock(raw, field, MERGES[field])
      raw = text
      all.push(...changed)
    }

    if (all.length === 0) continue
    for (const c of all) tally[c] = (tally[c] ?? 0) + 1
    console.log(`  ~ ${file.replace(/\.md$/, '')}: ${all.join(', ')}`)
    if (!DRY) await writeFile(join(DIR, file), raw, 'utf8')
    touched++
  }

  console.log('')
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${k}`)
  }
  console.log(`\n${DRY ? 'Dry run — ' : ''}${touched} card(s)${DRY ? ' would be' : ''} changed.`)
}

main().catch(e => { console.error(e); process.exit(1) })
