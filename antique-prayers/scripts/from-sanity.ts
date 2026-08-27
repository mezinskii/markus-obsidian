/**
 * from-sanity.ts — ONE-WAY export: Sanity `prayer` documents → Obsidian markdown.
 *
 *   Sanity (13u931c6/production)  ──▶  antique-prayers/prayers/*.md
 *
 * This is the opposite direction from everything else in the vault: the Marcus
 * pipeline goes vault → Sanity, and after this export runs once, prayers do too.
 * The vault becomes the source of truth; Sanity becomes a publishing target.
 *
 * SAFETY: an existing file is never overwritten unless --force is passed. The
 * whole point of the export is that a human then edits these files by hand, and
 * a careless second run must not be able to destroy that work.
 *
 * The Sanity `_id` is written into the frontmatter verbatim, so the return trip
 * can target the very same document instead of guessing an id from the filename.
 * All 329 ids share the (redundant) `prayer-prayer-…` shape; we keep it as is.
 *
 * Env (from .env at the vault root):
 *   SANITY_PROJECT_ID, SANITY_DATASET (default "production"), SANITY_API_TOKEN
 *
 * Run:  npx tsx antique-prayers/scripts/from-sanity.ts [--force] [--dry]
 */
import 'dotenv/config'
import {createClient} from '@sanity/client'
import {mkdir, writeFile, access} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'prayers')

const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry')

// ─── Provenance triage ────────────────────────────────────────────────────────
// Established by inspecting every distinct source: which prayers can ever have
// an ancient original, and which cannot. Only `ancient` is worth sending anyone
// to the sources for.
//
//   modern  — composed by a present-day group or author; no ancient original
//             exists, and the English may not even be freely licensed.
//   unclear — post-antique, or the attribution in the data is self-contradictory.
//   ancient — attested classical text; the original is findable.
const MODERN = new Set([
  'Hellenic Polytheism: Household Worship',
  'Harvest Prayer to Ceres (modern reconstruction)',
  'Rhizotome (lost) / Hellenic Polytheism: Household Worship',
])
const UNCLEAR = new Set([
  'Twenty-second Hymn',        // George Gemistos Plethon, 14th–15th c.
  'Flores Carmina',            // no period, anonymous
  'Hymn of Callimachus',       // attributed to "Caesius Bassius"
  'Hymn to Ceres and Libera',  // "Caesius Bassius / Philicus"
])

type Prayer = {
  _id: string
  prayerId?: string
  slug?: {current?: string}
  culture?: string
  form?: string
  period?: string
  featured?: boolean
  occasion?: string
  deities?: string[]
  sphere?: string[]
  functions?: string[]
  themes?: string[]
  createdAt?: string
  source?: {author?: string; work?: string; section?: string}
  text?: {la?: string; el?: string; en?: string; ru?: string}
}

// ─── YAML helpers ─────────────────────────────────────────────────────────────

/** Quote a scalar only when YAML would otherwise misread it. Keeping simple
 *  values unquoted matches how the Marcus frontmatter is written by hand. */
const yamlScalar = (v: string): string => {
  const s = v.replace(/\r?\n/g, ' ').trim()
  if (s === '') return "''"
  if (/^[\w .,()\/–—-]+$/u.test(s) && !/^[-?:]|: |\s#/.test(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

const yamlList = (name: string, items: string[] | undefined): string => {
  const clean = (items ?? []).map(i => (i ?? '').trim()).filter(Boolean)
  if (clean.length === 0) return `${name}:`
  return `${name}:\n${clean.map(i => `  - ${yamlScalar(i)}`).join('\n')}`
}

const yamlField = (name: string, v: string | undefined | null): string =>
  v == null || v === '' ? `${name}:` : `${name}: ${yamlScalar(v)}`

// ─── Rendering ────────────────────────────────────────────────────────────────

const section = (heading: string, body: string | undefined, credit?: string): string => {
  const text = (body ?? '').trim()
  const foot = credit ? `\n\n*(${credit})*` : ''
  return `## ${heading}\n\n${text}${text ? '' : ''}${foot}\n`
}

function toMarkdown(p: Prayer): string {
  const provenance = MODERN.has(p.source?.work ?? '')
    ? 'modern'
    : UNCLEAR.has(p.source?.work ?? '')
      ? 'unclear'
      : 'ancient'

  const originalLang = p.text?.la?.trim() ? 'la' : p.text?.el?.trim() ? 'el' : ''
  const original = p.text?.la?.trim() || p.text?.el?.trim() || ''

  const fm = [
    '---',
    `sanity_id: ${p._id}`,
    yamlField('prayer_id', p.prayerId),
    yamlField('slug', p.slug?.current),
    yamlField('culture', p.culture),
    yamlField('form', p.form),
    yamlField('period', p.period),
    yamlField('provenance', provenance),
    // Empty when no original is present yet — the field is the to-do list.
    yamlField('original_lang', originalLang),
    'source:',
    `  ${yamlField('author', p.source?.author)}`,
    `  ${yamlField('work', p.source?.work)}`,
    `  ${yamlField('section', p.source?.section)}`,
    yamlField('occasion', p.occasion),
    yamlList('deities', p.deities),
    yamlList('sphere', p.sphere),
    yamlList('functions', p.functions),
    yamlList('themes', p.themes),
    `featured: ${p.featured ? 'true' : 'false'}`,
    yamlField('created', p.createdAt),
    'status: imported',
    '---',
    '',
  ].join('\n')

  return [
    fm,
    section('Оригинал', original),
    '',
    section('Русский', p.text?.ru),
    '',
    section('Английский', p.text?.en),
    '',
    '## Комментарий\n',
    '',
    '## Commentary\n',
  ].join('\n')
}

/** `prayer-arion-poseidon-001` → `arion-poseidon-001` */
const fileBase = (p: Prayer): string => {
  const slug = (p.slug?.current ?? p.prayerId ?? p._id).trim()
  return slug.replace(/^prayer[-_]/, '').replace(/_/g, '-')
}

const exists = async (path: string) => {
  try { await access(path); return true } catch { return false }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET ?? 'production'
  const token = process.env.SANITY_API_TOKEN
  if (!projectId) throw new Error('SANITY_PROJECT_ID is not set')

  const client = createClient({projectId, dataset, token, apiVersion: '2023-05-03', useCdn: false})

  console.log(`Project: ${projectId} · dataset: ${dataset}`)
  const prayers: Prayer[] = await client.fetch(`*[_type=="prayer"] | order(culture asc, _id asc)`)
  console.log(`Fetched ${prayers.length} prayer documents.\n`)

  await mkdir(OUT, {recursive: true})

  const seen = new Map<string, string>()
  let written = 0, skipped = 0, collisions = 0
  const counts: Record<string, number> = {ancient: 0, modern: 0, unclear: 0}

  for (const p of prayers) {
    let base = fileBase(p)
    if (seen.has(base)) {
      collisions++
      base = `${base}--${p._id.slice(-6)}`
      console.warn(`  ! filename collision, disambiguated → ${base}.md`)
    }
    seen.set(base, p._id)

    const work = p.source?.work ?? ''
    counts[MODERN.has(work) ? 'modern' : UNCLEAR.has(work) ? 'unclear' : 'ancient']++

    const path = join(OUT, `${base}.md`)
    if (!FORCE && (await exists(path))) { skipped++; continue }
    if (!DRY) await writeFile(path, toMarkdown(p), 'utf8')
    written++
  }

  console.log(`\n${DRY ? 'Would write' : 'Wrote'}: ${written}`)
  if (skipped) console.log(`Skipped (already present, no --force): ${skipped}`)
  if (collisions) console.log(`Filename collisions disambiguated: ${collisions}`)
  console.log(`\nProvenance: ancient ${counts.ancient} · modern ${counts.modern} · unclear ${counts.unclear}`)
}

main().catch(err => { console.error(err); process.exit(1) })
