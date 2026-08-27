/**
 * find-duplicates.ts — locate prayers that are the same passage filed twice.
 *
 * The corpus holds one `text.en` per prayer, so a second translation of the same
 * passage could only be stored by creating a second prayer. Those pairs need to
 * be found before any bulk work, or the same original gets sourced twice.
 *
 * Detection is deliberately multi-signal, because the citation style is not
 * consistent — "5.377-378" and "V.377-378" are the same lines, and
 * "2.658-662; 2.673-678" and "II (Terminalia section)" overlap without matching:
 *
 *   1. same work + same normalised book.line
 *   2. same work + same book + overlapping deity set
 *   3. high word-overlap in the English, regardless of citation
 *
 * Reports candidates only. Nothing is deleted here — a human decides which of a
 * pair to keep, and that judgement is not automatable.
 *
 * Run: npx tsx antique-prayers/scripts/find-duplicates.ts
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const ROMAN: Record<string, number> = {i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10}

type Rec = {
  file: string
  id: string
  work: string
  author: string
  section: string
  book: number | null
  lines: number[]
  deities: Set<string>
  words: Set<string>
  enLen: number
  en: string
}

/** "5.377-378" → book 5, lines 377..378;  "V.377-378" → the same;
 *  "II (Terminalia section)" → book 2, no lines. */
function parseSection(s: string): {book: number | null; lines: number[]} {
  const t = s.trim()
  let book: number | null = null
  const roman = /^([ivxIVX]+)\b/.exec(t)
  const arabic = /^(\d+)\s*[.:]/.exec(t)
  if (arabic) book = Number(arabic[1])
  else if (roman && ROMAN[roman[1].toLowerCase()] !== undefined) book = ROMAN[roman[1].toLowerCase()]

  const lines: number[] = []
  for (const m of t.matchAll(/(\d+)\s*-\s*(\d+)/g)) {
    const a = Number(m[1]), b = Number(m[2])
    if (b > a && b - a < 400) for (let i = a; i <= b; i++) lines.push(i)
  }
  if (lines.length === 0) {
    // A bare line number after the book: "1.172", "V.377"
    const m = /^(?:[ivxIVX]+|\d+)\s*[.:]\s*(\d+)/.exec(t)
    if (m) lines.push(Number(m[1]))
  }
  return {book, lines}
}

const STOP = new Set('the a an and or of to in for with by on at from is are be you your thy thee o i my me we us our that this which who whose whom as it its not but so all shall will may let'.split(' '))

const words = (s: string): Set<string> =>
  new Set(
    s.toLowerCase().replace(/[^a-zа-яё\s]/gu, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w)),
  )

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

const overlap = (a: number[], b: number[]) => a.some(x => b.includes(x))
const shareDeity = (a: Set<string>, b: Set<string>) => [...a].some(d => b.has(d))

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  const recs: Rec[] = []

  for (const file of files) {
    const {data, content} = matter(await readFile(join(DIR, file), 'utf8'))
    const fm = data as Record<string, any>
    const m = /^## Английский\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(content)
    const en = (m?.[1] ?? '').trim()
    const section = String(fm.source?.section ?? '')
    const {book, lines} = parseSection(section)
    recs.push({
      file, id: String(fm.sanity_id ?? ''),
      work: String(fm.source?.work ?? ''), author: String(fm.source?.author ?? ''),
      section, book, lines,
      deities: new Set((fm.deities ?? []).map((d: string) => d.toLowerCase())),
      words: words(en), enLen: en.length, en,
    })
  }

  type Pair = {a: Rec; b: Rec; why: string[]; sim: number}
  const pairs: Pair[] = []

  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i], b = recs[j]
      const why: string[] = []
      const sameWork = a.work === b.work && a.work !== ''
      const sim = jaccard(a.words, b.words)

      if (sameWork && a.book !== null && a.book === b.book && overlap(a.lines, b.lines)) why.push('те же строки')
      if (sameWork && a.book !== null && a.book === b.book && shareDeity(a.deities, b.deities)) why.push('книга+божество')
      if (sim >= 0.34) why.push(`сходство текста ${(sim * 100).toFixed(0)}%`)

      if (why.length) pairs.push({a, b, why, sim})
    }
  }

  pairs.sort((p, q) => q.sim - p.sim)
  console.log(`Кандидатов в дубли: ${pairs.length}\n`)
  for (const p of pairs) {
    console.log(`── ${p.why.join(' · ')}`)
    for (const r of [p.a, p.b]) {
      console.log(`   ${r.file.replace(/\.md$/, '').padEnd(26)} [${r.work} ${r.section}]  ${r.enLen} симв.`)
      console.log(`      ${r.en.replace(/\s+/g, ' ').slice(0, 110)}`)
    }
    console.log('')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
