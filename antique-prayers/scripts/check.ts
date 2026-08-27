/**
 * check.ts — validate the exported prayer files.
 *
 * Parses every file with the same gray-matter the vault pipeline uses, so a
 * frontmatter that breaks here would have broken the build too. Also reports
 * encoding, section presence and how much text is still missing.
 *
 * Run: npx tsx antique-prayers/scripts/check.ts
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const HEADINGS = ['Оригинал', 'Русский', 'Английский', 'Комментарий', 'Commentary']

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  let bad = 0, bom = 0, crlf = 0
  const ids = new Map<string, string>()
  const missing: Record<string, number> = {}
  const prov: Record<string, number> = {}
  let origEmpty = 0, ruEmpty = 0, enEmpty = 0

  for (const f of files) {
    const raw = await readFile(join(DIR, f))
    if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) bom++
    const text = raw.toString('utf8')
    if (text.includes('\r')) crlf++

    let fm: Record<string, unknown>
    let body: string
    try {
      const parsed = matter(text)
      fm = parsed.data as Record<string, unknown>
      body = parsed.content
    } catch (e) {
      console.error(`  ✗ ${f}: ${(e as Error).message.split('\n')[0]}`)
      bad++
      continue
    }

    const id = String(fm.sanity_id ?? '')
    if (!id) { console.error(`  ✗ ${f}: no sanity_id`); bad++ }
    else if (ids.has(id)) { console.error(`  ✗ ${f}: duplicate sanity_id (also ${ids.get(id)})`); bad++ }
    else ids.set(id, f)

    prov[String(fm.provenance ?? '—')] = (prov[String(fm.provenance ?? '—')] ?? 0) + 1

    for (const h of HEADINGS) {
      if (!body.includes(`## ${h}`)) missing[h] = (missing[h] ?? 0) + 1
    }

    const sect = (h: string) => {
      const m = body.match(new RegExp(`## ${h}\\n([\\s\\S]*?)(?=\\n## |$)`))
      return (m?.[1] ?? '').trim()
    }
    if (!sect('Оригинал')) origEmpty++
    if (!sect('Русский')) ruEmpty++
    if (!sect('Английский')) enEmpty++
  }

  console.log(`files: ${files.length}`)
  console.log(`frontmatter parse errors: ${bad}`)
  console.log(`BOM: ${bom}   CRLF: ${crlf}`)
  console.log(`unique sanity_id: ${ids.size}`)
  const miss = Object.entries(missing)
  console.log(`missing headings: ${miss.length ? miss.map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}`)
  console.log(`\nprovenance: ${Object.entries(prov).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`\nempty sections — Оригинал ${origEmpty} · Русский ${ruEmpty} · Английский ${enEmpty}`)
}

main().catch(e => { console.error(e); process.exit(1) })
