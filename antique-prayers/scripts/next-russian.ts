/**
 * next-russian.ts — print the next cards that still need a Russian translation,
 * with everything needed to make one: the original, the English, the source note
 * and the commentary.
 *
 * Translating 317 prayers means opening the same four sections over and over.
 * This puts one batch on screen with a single command, in a stable order so
 * successive runs don't reshuffle the queue.
 *
 * Order: by original language, then by filename. Latin first (221 cards), then
 * Greek (52), then the 44 that have no original and must be done from English.
 * Grouping by language keeps the vocabulary settled within a sitting.
 *
 * Run:
 *   npx tsx antique-prayers/scripts/next-russian.ts            # next 8
 *   npx tsx antique-prayers/scripts/next-russian.ts 12         # next 12
 *   npx tsx antique-prayers/scripts/next-russian.ts 10 --skip 40
 *   npx tsx antique-prayers/scripts/next-russian.ts --lang el
 *   npx tsx antique-prayers/scripts/next-russian.ts --ids apollo-001,ceres-004
 *   npx tsx antique-prayers/scripts/next-russian.ts --count    # just the tally
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const args = process.argv.slice(2)
const flag = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}
const COUNT_ONLY = args.includes('--count')
const LANG = flag('lang')
const IDS = flag('ids')?.split(',').map(s => s.trim()).filter(Boolean)
const SKIP = Number(flag('skip') ?? 0)
const N = Number(args.find(a => /^\d+$/.test(a)) ?? 8)

const section = (body: string, h: string): string => {
  /** `(?![\s\S])` for end-of-input, never `\z` — see set-original.ts. */
  const m = new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body)
  return m ? m[1].trim() : ''
}

type Card = {id: string; lang: string; orig: string; en: string; src: string; note: string}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md'))
  const pending: Card[] = []
  let done = 0

  for (const f of files.sort()) {
    const raw = await readFile(join(DIR, f), 'utf8')
    const {data, content} = matter(raw)
    if (section(content, 'Русский')) { done++; continue }

    const orig = section(content, 'Оригинал')
    const lang = orig ? String(data.original_lang ?? 'la') : 'en'
    pending.push({
      id: f.replace(/\.md$/, ''),
      lang,
      orig,
      en: section(content, 'Английский'),
      src: String((data.source as Record<string, unknown>)?.note ?? ''),
      note: section(content, 'Комментарий'),
    })
  }

  const rank: Record<string, number> = {la: 0, el: 1, en: 2}
  pending.sort((a, b) => (rank[a.lang] - rank[b.lang]) || a.id.localeCompare(b.id))

  const byLang = (l: string) => pending.filter(p => p.lang === l).length
  console.log(
    `переведено: ${done}   осталось: ${pending.length}` +
    `   (латынь ${byLang('la')} · греческий ${byLang('el')} · только английский ${byLang('en')})\n`,
  )
  if (COUNT_ONLY) return

  let queue = pending
  if (IDS) queue = pending.filter(p => IDS.includes(p.id))
  else if (LANG) queue = pending.filter(p => p.lang === LANG)
  queue = queue.slice(SKIP, SKIP + N)

  for (const c of queue) {
    console.log(`${'='.repeat(72)}\n${c.id}   [${c.lang}]`)
    console.log(`\n--- ОРИГИНАЛ\n${c.orig || '(нет — переводить с английского)'}`)
    console.log(`\n--- АНГЛИЙСКИЙ\n${c.en}`)
    if (c.note) console.log(`\n--- КОММЕНТАРИЙ\n${c.note}`)
    console.log()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
