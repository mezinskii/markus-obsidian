/**
 * originals-todo.ts — what is still missing an original, grouped by source.
 *
 * Sourcing 288 originals one file at a time is the slow way. They cluster:
 * a single el.wikisource page carries a whole Orphic hymn, one Latin Library
 * page carries a whole book of the Fasti. Grouping by work turns a list of 288
 * files into a much shorter list of pages to fetch, and shows which groups are
 * worth doing first.
 *
 * `modern` provenance is excluded from the count that matters — those are
 * present-day reconstructions and no original will ever exist for them.
 *
 * Run: npx tsx antique-prayers/scripts/originals-todo.ts
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const sect = (c: string, h: string) => {
  const m = new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(c)
  return (m?.[1] ?? '').trim()
}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  const groups = new Map<string, {files: string[]; culture: string; prov: string}>()
  let have = 0, skipModern = 0

  for (const file of files) {
    const {data, content} = matter(await readFile(join(DIR, file), 'utf8'))
    const fm = data as Record<string, any>
    if (sect(content, 'Оригинал')) { have++; continue }
    const prov = String(fm.provenance ?? '—')
    if (prov === 'modern') { skipModern++; continue }

    const key = `${String(fm.source?.author ?? '—')} · ${String(fm.source?.work ?? '—')}`
    if (!groups.has(key)) groups.set(key, {files: [], culture: String(fm.culture ?? ''), prov})
    groups.get(key)!.files.push(file.replace(/\.md$/, ''))
  }

  const rows = [...groups.entries()].sort((a, b) => b[1].files.length - a[1].files.length)
  const total = rows.reduce((n, [, v]) => n + v.files.length, 0)
  console.log(`Оригинал уже есть: ${have}   modern (не будет никогда): ${skipModern}   нужно найти: ${total}`)
  console.log(`Источников (автор + сочинение): ${rows.length}\n`)
  for (const [key, v] of rows) {
    console.log(`${String(v.files.length).padStart(3)}  ${v.culture === 'greek' ? 'гр' : 'лат'}  ${key}`)
    if (v.files.length <= 3) console.log(`       ${v.files.join(', ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
