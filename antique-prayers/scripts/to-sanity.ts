/**
 * to-sanity.ts — the return trip: Obsidian markdown → Sanity `prayer` documents.
 *
 *   antique-prayers/prayers/*.md  ──▶  Sanity (13u931c6/production)
 *
 * The vault is the source of truth; this pushes it back to the publishing target.
 *
 * Three deliberate safety properties, because these documents already exist and
 * carry 329 English texts that took real work:
 *
 *  1. PATCH, never createOrReplace. Only the fields the vault owns are set, so
 *     anything added in the Studio later survives a round trip.
 *  2. NO SILENT CLEARING. If the vault would empty a field that currently has
 *     content in Sanity, the run aborts and lists every case. Pass --allow-clear
 *     once you have looked at that list and meant it.
 *  3. --dry prints exactly what would change and writes nothing.
 *
 * `sanity_id` in the frontmatter is what each file targets — never the filename.
 *
 * Env (.env at the vault root): SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 *
 * Run:  npx tsx antique-prayers/scripts/to-sanity.ts --dry
 *       npx tsx antique-prayers/scripts/to-sanity.ts
 */
import 'dotenv/config'
import {createClient} from '@sanity/client'
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')
const DRY = process.argv.includes('--dry')
const ALLOW_CLEAR = process.argv.includes('--allow-clear')
const BATCH = 50

/** Fields this pipeline owns. Anything else in the document is left alone. */
const OWNED = [
  'prayerId', 'slug', 'title', 'culture', 'form', 'period', 'provenance',
  'source', 'occasion', 'deities', 'sphere', 'functions', 'themes',
  'featured', 'text', 'commentary',
] as const

type Json = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => str(x)).filter(Boolean) : []

/** Compare by value, not by key order. Sanity returns object keys in its own
 *  order (`source` comes back author/section/work), so a plain JSON.stringify
 *  marks every document as changed even when nothing differs. Used only for the
 *  diff — what actually gets written is the un-canonicalised value. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const o = v as Json
    return Object.keys(o).sort().reduce<Json>((acc, k) => {
      if (k.startsWith('_') && k !== '_type') return acc
      acc[k] = canon(o[k]) as never
      return acc
    }, {})
  }
  return v
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

/** Pull a `## Heading` section out of the markdown body.
 *
 *  The end anchor is `(?![\s\S])` — a real end-of-input assertion. It must NOT
 *  be `\z`: JavaScript has no `\z`, so the escape degrades to the literal letter
 *  "z" and the lazy body stops at the first z in the text. That silently
 *  truncated a 1726-character Latin prayer to 1590. */
function section(body: string, heading: string): string {
  const re = new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')
  const m = re.exec(body)
  if (!m) return ''
  // Drop a trailing translator credit line like *(пер. …)* if one is present.
  return m[1].replace(/^\s*\*\([^)]*\)\*\s*$/m, '').trim()
}

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET ?? 'production'
  const token = process.env.SANITY_API_TOKEN
  if (!projectId) throw new Error('SANITY_PROJECT_ID is not set')
  if (!token && !DRY) throw new Error('SANITY_API_TOKEN is required to write')

  const client = createClient({projectId, dataset, token, apiVersion: '2023-05-03', useCdn: false})
  console.log(`Project: ${projectId} · dataset: ${dataset}${DRY ? '  (dry run)' : ''}`)

  // Current state, to diff against.
  const remote: Array<Json & {_id: string}> = await client.fetch(`*[_type=="prayer"]`)
  const byId = new Map(remote.map(d => [d._id, d]))
  console.log(`Remote prayers: ${remote.length}`)

  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  console.log(`Local files:    ${files.length}\n`)

  const patches: Array<{id: string; set: Json; unset: string[]; file: string}> = []
  const clears: string[] = []
  const problems: string[] = []
  let unchanged = 0

  for (const file of files) {
    const raw = await readFile(join(DIR, file), 'utf8')
    const {data, content} = matter(raw)
    const fm = data as Json

    const id = str(fm.sanity_id)
    if (!id) { problems.push(`${file}: no sanity_id`); continue }
    const doc = byId.get(id)
    if (!doc) { problems.push(`${file}: no such document in Sanity (${id})`); continue }

    const original = section(content, 'Оригинал')
    const lang = str(fm.original_lang)
    if (original && !lang) problems.push(`${file}: has an Оригинал but original_lang is empty`)
    if (lang && !original) problems.push(`${file}: original_lang=${lang} but Оригинал is empty`)
    if (lang && lang !== 'la' && lang !== 'el') problems.push(`${file}: original_lang=${lang} is not la/el`)

    const text: Json = {}
    if (lang === 'la' && original) text.la = original
    if (lang === 'el' && original) text.el = original
    const ru = section(content, 'Русский'); if (ru) text.ru = ru
    const en = section(content, 'Английский'); if (en) text.en = en

    const commRu = section(content, 'Комментарий')
    const commEn = section(content, 'Commentary')
    const commentary: Json = {}
    if (commRu) commentary.ru = commRu
    if (commEn) commentary.en = commEn

    const desired: Json = {
      prayerId: str(fm.prayer_id) || undefined,
      slug: str(fm.slug) ? {_type: 'slug', current: str(fm.slug)} : undefined,
      title: {
        en: str((fm.title as Json)?.en) || undefined,
        ru: str((fm.title as Json)?.ru) || undefined,
      },
      culture: str(fm.culture) || undefined,
      form: str(fm.form) || undefined,
      period: str(fm.period) || undefined,
      provenance: str(fm.provenance) || undefined,
      source: {
        author: str((fm.source as Json)?.author) || undefined,
        work: str((fm.source as Json)?.work) || undefined,
        section: str((fm.source as Json)?.section) || undefined,
        note: str((fm.source as Json)?.note) || undefined,
      },
      occasion: str(fm.occasion) || undefined,
      deities: list(fm.deities),
      sphere: list(fm.sphere),
      functions: list(fm.functions),
      themes: list(fm.themes),
      featured: fm.featured === true,
      text: Object.keys(text).length ? text : undefined,
      commentary: Object.keys(commentary).length ? commentary : undefined,
    }

    const set: Json = {}
    const unset: string[] = []
    for (const key of OWNED) {
      const want = (desired as Json)[key]
      const have = doc[key]
      if (want === undefined || (Array.isArray(want) && want.length === 0)) {
        if (have !== undefined && have !== null && !(Array.isArray(have) && have.length === 0)) {
          // The vault says "nothing here" but Sanity holds content.
          clears.push(`${file}: would clear "${key}"`)
          unset.push(key)
        }
        continue
      }
      if (!same(want, have)) set[key] = want
    }

    // A text subfield that exists remotely but not locally is also a clear.
    const remoteText = (doc.text ?? {}) as Json
    for (const k of ['la', 'el', 'en', 'ru']) {
      if (str(remoteText[k]) && !str((text as Json)[k])) {
        clears.push(`${file}: would clear "text.${k}"`)
      }
    }

    if (Object.keys(set).length === 0 && unset.length === 0) { unchanged++; continue }
    patches.push({id, set, unset, file})
  }

  if (problems.length) {
    console.log(`Problems (${problems.length}):`)
    for (const p of problems.slice(0, 40)) console.log(`  ! ${p}`)
    if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`)
    console.log('')
  }

  console.log(`Unchanged: ${unchanged}`)
  console.log(`To patch:  ${patches.length}`)

  if (clears.length && !ALLOW_CLEAR) {
    console.error(`\nRefusing to run: ${clears.length} field(s) would be cleared.`)
    for (const c of clears.slice(0, 30)) console.error(`  ✗ ${c}`)
    if (clears.length > 30) console.error(`  … and ${clears.length - 30} more`)
    console.error(`\nIf that is genuinely intended, re-run with --allow-clear.`)
    process.exit(2)
  }
  if (clears.length) console.log(`Clearing ${clears.length} field(s) (--allow-clear).`)

  if (DRY) {
    for (const p of patches.slice(0, 10)) {
      console.log(`  ~ ${p.file}: set [${Object.keys(p.set).join(', ')}]${p.unset.length ? ` unset [${p.unset.join(', ')}]` : ''}`)
    }
    if (patches.length > 10) console.log(`  … and ${patches.length - 10} more`)
    console.log('\nDry run — nothing written.')
    return
  }

  let done = 0
  for (let i = 0; i < patches.length; i += BATCH) {
    const chunk = patches.slice(i, i + BATCH)
    let tx = client.transaction()
    for (const p of chunk) {
      let patch = client.patch(p.id).set(p.set)
      if (p.unset.length) patch = patch.unset(p.unset)
      tx = tx.patch(patch)
    }
    await tx.commit({visibility: 'async'})
    done += chunk.length
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${chunk.length} docs (${done}/${patches.length})`)
  }
  console.log(`\nDone. Patched ${done} document(s).`)
}

main().catch(err => { console.error(err); process.exit(1) })
