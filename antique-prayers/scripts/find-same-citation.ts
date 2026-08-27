/**
 * find-same-citation.ts — group prayers that cite the same passage.
 *
 * Companion to find-duplicates.ts, which scores word overlap and therefore only
 * catches pairs that share a translation. A passage stored twice in *different*
 * translations has low word overlap and slips through — `flora-001` and
 * `ovid-flora-001` are the same two lines of Ovid and share barely a word.
 *
 * The reliable signal for those is the citation itself, once it is normalised:
 * roman to arabic, separators unified, ranges expanded to their endpoints, so
 * "Fasti V.377-378" and "Fasti 5.377-378" collapse to the same key.
 *
 * Reports groups only. Deleting is a human decision.
 *
 * Run: npx tsx antique-prayers/scripts/find-same-citation.ts
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15,
}

/** Every numeric component of a citation, roman or arabic, in order.
 *  "V.377-378" → [5, 377, 378];  "5.377-378" → the same. */
function numbers(s: string): number[] {
  const out: number[] = []
  for (const tok of s.split(/[^0-9a-zA-Zа-яё]+/u)) {
    if (!tok) continue
    if (/^\d+$/.test(tok)) out.push(Number(tok))
    else if (ROMAN[tok.toLowerCase()] !== undefined) out.push(ROMAN[tok.toLowerCase()])
  }
  return out
}

const normWork = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gu, '')

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  const groups = new Map<string, {file: string; work: string; section: string; enLen: number; en: string; deities: string[]}[]>()

  for (const file of files) {
    const {data, content} = matter(await readFile(join(DIR, file), 'utf8'))
    const fm = data as Record<string, any>
    const work = String(fm.source?.work ?? '')
    const section = String(fm.source?.section ?? '')
    const nums = numbers(section)
    if (!work || nums.length === 0) continue

    const m = /^## Английский\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(content)
    const en = (m?.[1] ?? '').trim()
    const key = `${normWork(work)}|${nums.join('.')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({
      file: file.replace(/\.md$/, ''), work, section,
      enLen: en.length, en: en.replace(/\s+/g, ' '),
      deities: (fm.deities ?? []) as string[],
    })
  }

  const dups = [...groups.entries()].filter(([, v]) => v.length > 1)
  console.log(`Групп с одинаковой ссылкой: ${dups.length}\n`)
  for (const [key, v] of dups) {
    console.log(`── ${key}`)
    for (const r of v) {
      console.log(`   ${r.file.padEnd(26)} [${r.work} ${r.section}]  ${r.enLen} симв.  {${r.deities.join(', ')}}`)
      console.log(`      ${r.en.slice(0, 130)}`)
    }
    console.log('')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
