/**
 * merge-duplicates.ts — fold a duplicate prayer into the record that is kept.
 *
 * A duplicate pair is never a clean "one is redundant". The record with the
 * better translation usually has the poorer taxonomy, because the two batches
 * were compiled by different hands: the author-prefixed batch carries fuller
 * texts and long theme lists, the bare `<deity>-NNN` batch carries deities the
 * other one missed. Deleting the loser outright throws that away.
 *
 * So: union the deities and themes into the keeper, take the fuller original if
 * only the loser has one, then retire the loser to `_removed/` with a
 * `superseded_by` pointer rather than deleting it. Nothing is lost, the removal
 * is reversible, and `delete-in-sanity.ts` later reads `_removed/` to do the
 * matching deletion in the dataset — which is where deletion is irreversible
 * and therefore gated on its own explicit flag.
 *
 * The pairs live in duplicates.json next to this script, so the judgement calls
 * are reviewable as data instead of buried in code.
 *
 * Run: npx tsx antique-prayers/scripts/merge-duplicates.ts [--dry]
 */
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', 'prayers')
const GONE = join(HERE, '..', '_removed')
const DRY = process.argv.includes('--dry')

type Pair = {keep: string; remove: string; reason: string; section?: string}

const sect = (c: string, h: string) => {
  const m = new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(c)
  return (m?.[1] ?? '').trim()
}

/** Fold the spelling variants the two batches disagree on, so a union does not
 *  produce "Neptunus, Neptune" or "Iuppiter, Jupiter" in the same list:
 *  classical I for J, no doubled consonants, no -us/-e/-os ending.
 *    Neptunus / Neptune → neptun      Iuppiter / Jupiter → iupiter
 *    Ianus / Janus      → ian         Aesculapius / Aesculapius → aesculapi */
const fold = (s: string): string =>
  s.toLowerCase().replace(/j/g, 'i').replace(/(.)\1+/g, '$1').replace(/(us|os|e)$/, '')

/** Union preserving the keeper's order and its spelling of any shared name. */
function union(a: string[], b: string[], variants = false): string[] {
  const key = variants ? fold : (x: string) => x.toLowerCase()
  const seen = new Set(a.map(key))
  const out = [...a]
  for (const x of b) if (!seen.has(key(x))) { out.push(x); seen.add(key(x)) }
  return out
}

/** Quote a scalar only when YAML would otherwise misread it — same rule as
 *  from-sanity.ts, so a merged file is byte-compatible with an exported one. */
const yamlScalar = (v: string): string => {
  const s = v.replace(/\r?\n/g, ' ').trim()
  if (s === '') return "''"
  if (/^[\w .,()\/–—-]+$/u.test(s) && !/^[-?:]|: |\s#/.test(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

/** Rewrite one list in the frontmatter block, leaving the rest byte-identical.
 *  The trailing matcher is `[ \t]*`, never `\s*`: `\s` eats the newline before
 *  the first `- item`, after which the item matcher (which needs that newline)
 *  matches nothing and the whole old list survives as a tail. */
function setList(fmText: string, key: string, values: string[]): string {
  const yaml = values.map(v => `\n  - ${yamlScalar(v)}`).join('')
  const block = new RegExp(`^${key}:[ \\t]*(?:\\[[^\\]]*\\]|(?:\\r?\\n[ \\t]+-[^\\n]*)*)`, 'm')
  if (block.test(fmText)) return fmText.replace(block, `${key}:${yaml}`)
  return `${fmText}\n${key}:${yaml}`
}

async function main() {
  const pairs: Pair[] = JSON.parse(await readFile(join(HERE, 'duplicates.json'), 'utf8'))
  if (!DRY) await mkdir(GONE, {recursive: true})

  for (const p of pairs) {
    const keepPath = join(DIR, `${p.keep}.md`)
    const remPath = join(DIR, `${p.remove}.md`)

    // duplicates.json is an append-only record of the judgement calls, so most
    // entries are already applied on any later run. Skip those instead of
    // failing, and re-merging is then safe.
    if (await readFile(join(GONE, `${p.remove}.md`), 'utf8').then(() => true, () => false)) {
      console.log(`· ${p.remove} — уже изъят, пропуск`)
      continue
    }

    const keepRaw = await readFile(keepPath, 'utf8')
    const remRaw = await readFile(remPath, 'utf8')
    const K = matter(keepRaw), R = matter(remRaw)

    const deities = union((K.data.deities ?? []) as string[], (R.data.deities ?? []) as string[], true)
    const themes = union((K.data.themes ?? []) as string[], (R.data.themes ?? []) as string[])
    // The frontmatter key is `sphere`, singular — `spheres` is always undefined.
    const spheres = union((K.data.sphere ?? []) as string[], (R.data.sphere ?? []) as string[])

    // Frontmatter is edited as text, not re-serialised, so untouched fields keep
    // their exact formatting and the diff stays readable.
    // Slice from 3, not 4: the newline after the opening `---` belongs to the
    // block being rebuilt, and dropping it welds the fence to the first key.
    const fmEnd = keepRaw.indexOf('\n---', 4)
    let fmText = keepRaw.slice(3, fmEnd)
    fmText = setList(fmText, 'deities', deities)
    fmText = setList(fmText, 'themes', themes)
    if (spheres.length) fmText = setList(fmText, 'sphere', spheres)
    if (p.section) fmText = fmText.replace(/^(\s*)section:.*$/m, `$1section: ${JSON.stringify(p.section)}`)

    let body = keepRaw.slice(fmEnd + 4)

    // If only the retired record carried an original, it moves across.
    const kOrig = sect(K.content, 'Оригинал'), rOrig = sect(R.content, 'Оригинал')
    let tookOriginal = false
    if (!kOrig && rOrig) {
      const m = /(^## Оригинал\s*$)([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)
      if (m) {
        body = body.slice(0, m.index) + m[1] + `\n\n${rOrig}\n\n` + body.slice(m.index + m[0].length)
        const lang = String(R.data.original_lang ?? 'la')
        fmText = /^original_lang:/m.test(fmText)
          ? fmText.replace(/^original_lang:.*$/m, `original_lang: ${lang}`)
          : `${fmText}\noriginal_lang: ${lang}`
        tookOriginal = true
      }
    }

    const out = `---${fmText}\n---${body}`
    // The retired file is kept verbatim with two lines added, so `git log -p`
    // shows exactly what left the corpus and `superseded_by` says where it went.
    const rEnd = remRaw.indexOf('\n---', 4)
    const retired = `---${remRaw.slice(3, rEnd)}\n` +
      `superseded_by: ${K.data.sanity_id}\n` +
      `removed_reason: ${JSON.stringify(p.reason)}\n---${remRaw.slice(rEnd + 4)}`

    console.log(`${p.keep}  ←  ${p.remove}`)
    console.log(`   ${p.reason}`)
    console.log(`   deities ${(K.data.deities ?? []).length}→${deities.length}   themes ${(K.data.themes ?? []).length}→${themes.length}` +
      (p.section ? `   section → ${p.section}` : '') + (tookOriginal ? `   +оригинал ${rOrig.length} симв.` : ''))

    if (!DRY) {
      await writeFile(keepPath, out, 'utf8')
      await writeFile(join(GONE, `${p.remove}.md`), retired, 'utf8')
      await rm(remPath)
    }
  }
  console.log(`\n${DRY ? 'Would merge' : 'Merged'}: ${pairs.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
