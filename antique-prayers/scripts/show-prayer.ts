/**
 * show-prayer.ts — print the full record of the named prayers, side by side.
 *
 * The duplicate reports print a 130-character head, which is enough to spot a
 * candidate and not enough to decide which of a pair to keep. That decision
 * needs the whole thing: how complete the translation is, whether an original
 * is already attached, how rich the taxonomy is.
 *
 * Run: npx tsx antique-prayers/scripts/show-prayer.ts flora-001 ovid-flora-001
 */
import {readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const sect = (c: string, h: string) => {
  const m = new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(c)
  return (m?.[1] ?? '').trim()
}

async function main() {
  for (const name of process.argv.slice(2)) {
    const raw = await readFile(join(DIR, `${name.replace(/\.md$/, '')}.md`), 'utf8')
    const {data, content} = matter(raw)
    const fm = data as Record<string, any>
    console.log(`\n${'='.repeat(72)}\n${name}   id=${fm.sanity_id}`)
    console.log(`  work=${fm.source?.work} | author=${fm.source?.author} | section=${fm.source?.section}`)
    console.log(`  provenance=${fm.provenance}  original_lang=${fm.original_lang ?? '—'}`)
    console.log(`  deities: ${(fm.deities ?? []).join(', ')}`)
    console.log(`  spheres: ${(fm.spheres ?? []).join(', ')}`)
    console.log(`  themes(${(fm.themes ?? []).length}): ${(fm.themes ?? []).slice(0, 14).join(', ')}`)
    const orig = sect(content, 'Оригинал')
    console.log(`  --- ОРИГИНАЛ (${orig.length}) ---\n${orig || '(пусто)'}`)
    console.log(`  --- EN ---\n${sect(content, 'Английский')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
