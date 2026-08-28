/**
 * next-commentary.ts — print the next cards that still need a commentary,
 * with everything needed to write one.
 *
 * What a commentary needs is not the same as what a translation needed. The
 * Russian text is already written and trustworthy, so it stands in for the
 * original; what matters instead is `source.note`, which carries the provenance
 * work — which edition, what was corrected, where the English diverges. That
 * note is the raw material for the third movement of every commentary ("how far
 * can you trust this"), so it is printed in full and never truncated.
 *
 * The original is printed truncated by default: enough to quote an opening line
 * from, not so much that a batch of ten becomes unreadable. `--full` prints it
 * whole for the cards where the argument turns on the wording.
 *
 * Order: by original language, then by filename — the same order the
 * translation ran in, so the two passes stay in step and vocabulary settled in
 * one sitting carries into the next.
 *
 * Run:
 *   npx tsx antique-prayers/scripts/next-commentary.ts            # next 8
 *   npx tsx antique-prayers/scripts/next-commentary.ts 12 --full
 *   npx tsx antique-prayers/scripts/next-commentary.ts --lang el
 *   npx tsx antique-prayers/scripts/next-commentary.ts --ids robigo-001,tellus-001
 *   npx tsx antique-prayers/scripts/next-commentary.ts --count
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
const FULL = args.includes('--full')
const LANG = flag('lang')
const IDS = flag('ids')?.split(',').map(s => s.trim()).filter(Boolean)
const SKIP = Number(flag('skip') ?? 0)
const N = Number(args.find(a => /^\d+$/.test(a)) ?? 8)
const CAP = 420

const section = (body: string, h: string): string => {
  /** `(?![\s\S])` for end-of-input, never `\z` — see set-original.ts. */
  const m = new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body)
  return m ? m[1].trim() : ''
}
const clip = (s: string): string => (FULL || s.length <= CAP ? s : `${s.slice(0, CAP)} …`)

type Card = {
  id: string; lang: string; prov: string; period: string
  src: string; note: string; occasion: string; deities: string
  orig: string; ru: string
}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md'))
  const pending: Card[] = []
  let done = 0

  for (const f of files.sort()) {
    const {data, content} = matter(await readFile(join(DIR, f), 'utf8'))
    if (section(content, 'Комментарий') && section(content, 'Commentary')) { done++; continue }

    const s = (data.source ?? {}) as Record<string, unknown>
    const orig = section(content, 'Оригинал')
    pending.push({
      id: f.replace(/\.md$/, ''),
      lang: orig ? String(data.original_lang ?? 'la') : 'en',
      prov: String(data.provenance ?? ''),
      period: String(data.period ?? ''),
      src: [s.author, s.work, s.section].filter(Boolean).join(' / '),
      note: String(s.note ?? ''),
      occasion: String(data.occasion ?? ''),
      deities: (Array.isArray(data.deities) ? data.deities : []).join(', '),
      orig,
      ru: section(content, 'Русский'),
    })
  }

  const rank: Record<string, number> = {la: 0, el: 1, en: 2}
  pending.sort((a, b) => (rank[a.lang] - rank[b.lang]) || a.id.localeCompare(b.id))

  const by = (l: string) => pending.filter(p => p.lang === l).length
  console.log(
    `с комментарием: ${done}   осталось: ${pending.length}` +
    `   (латынь ${by('la')} · греческий ${by('el')} · без оригинала ${by('en')})\n`,
  )
  if (COUNT_ONLY) return

  let queue = pending
  if (IDS) queue = pending.filter(p => IDS.includes(p.id))
  else if (LANG) queue = pending.filter(p => p.lang === LANG)
  queue = queue.slice(SKIP, SKIP + N)

  for (const c of queue) {
    console.log(`${'='.repeat(72)}\n${c.id}   [${c.lang}]  prov=${c.prov}${c.period ? `  ${c.period}` : ''}`)
    console.log(`ИСТОЧНИК : ${c.src || '—'}`)
    if (c.occasion) console.log(`ПОВОД    : ${c.occasion}`)
    if (c.deities) console.log(`БОЖЕСТВА : ${c.deities}`)
    if (c.note) console.log(`\n--- ЗАМЕТКА ОБ ИСТОЧНИКЕ\n${c.note}`)
    if (c.orig) console.log(`\n--- ОРИГИНАЛ\n${clip(c.orig)}`)
    console.log(`\n--- РУССКИЙ\n${clip(c.ru)}\n`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
