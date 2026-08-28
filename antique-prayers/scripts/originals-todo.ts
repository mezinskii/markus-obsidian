/**
 * originals-todo.ts — what is still missing an original, grouped by source.
 *
 * Sourcing 288 originals one file at a time is the slow way. They cluster:
 * a single el.wikisource page carries a whole Orphic hymn, one Latin Library
 * page carries a whole book of the Fasti. Grouping by work turns a list of 288
 * files into a much shorter list of pages to fetch, and shows which groups are
 * worth doing first.
 *
 * Two kinds of card are excluded from the count that matters. `modern`
 * provenance marks present-day reconstructions, for which no original will ever
 * exist. `original_unavailable` marks a card whose original cannot be attached,
 * and its reason string says which of two quite different things is meant:
 *
 *   - no verbatim text survives — Cato gives the harvest formula to Janus and
 *     Jupiter and only an instruction for Ceres, so that card's English is a
 *     reconstruction by analogy and there is nothing to quote;
 *   - the text exists in print but no open digitisation was found — most of the
 *     Greek lyric (Campbell, Bergk) and the Latin fragment poets. These may
 *     become reachable later; the flag is reversible.
 *
 * Without the flag such a card sits in the queue for ever, and the queue stops
 * meaning "still findable".
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
  let have = 0, skipModern = 0, skipNoOriginal = 0

  for (const file of files) {
    const {data, content} = matter(await readFile(join(DIR, file), 'utf8'))
    const fm = data as Record<string, any>
    if (sect(content, 'Оригинал')) { have++; continue }
    const prov = String(fm.provenance ?? '—')
    if (prov === 'modern') { skipModern++; continue }
    if (fm.original_unavailable) { skipNoOriginal++; continue }

    const key = `${String(fm.source?.author ?? '—')} · ${String(fm.source?.work ?? '—')}`
    if (!groups.has(key)) groups.set(key, {files: [], culture: String(fm.culture ?? ''), prov})
    groups.get(key)!.files.push(file.replace(/\.md$/, ''))
  }

  const rows = [...groups.entries()].sort((a, b) => b[1].files.length - a[1].files.length)
  const total = rows.reduce((n, [, v]) => n + v.files.length, 0)
  console.log(`Оригинал уже есть: ${have}   modern (не будет никогда): ${skipModern}   дословного текста нет: ${skipNoOriginal}   нужно найти: ${total}`)
  console.log(`Источников (автор + сочинение): ${rows.length}\n`)
  for (const [key, v] of rows) {
    console.log(`${String(v.files.length).padStart(3)}  ${v.culture === 'greek' ? 'гр' : 'лат'}  ${key}`)
    if (v.files.length <= 3) console.log(`       ${v.files.join(', ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
