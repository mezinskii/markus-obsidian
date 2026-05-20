/**
 * to-sanity.ts — Phase 2 of the Marcus vault pipeline.
 *
 *   build/*.json  ──▶  build/import.ndjson
 *
 * Reads the typed JSON produced by build.ts, builds a slug→type registry,
 * converts every markdown body field to Portable Text (resolving wiki-links
 * and footnote refs against the registry), and emits one JSON document per
 * line in `build/import.ndjson`.
 *
 * Bilinguality: every PT field is emitted as `{ ru: PT[], en: PT[] }`, every
 * bilingual string as `{ ru: string, en: string }`.  Empty languages stay
 * empty (no upload-side validation forcing both to be filled).
 *
 * Output document _ids follow `{type}.{id}` convention:
 *   passageCard.02-13, term.daimon, dogma.cosmopolis, ...
 */

import {readFile, writeFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  markdownToPortableText,
  markdownToPortableTextBlocks,
  type PTBlock,
  type Registry,
  type TargetType,
} from './lib/markdownToPortableText.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BUILD = join(ROOT, 'build')

// ────────────────────────────────────────────────────────────────────────────
// Source types (mirror build.ts output)
// ────────────────────────────────────────────────────────────────────────────

type Discipline = 'assent' | 'desire' | 'action'

interface I18n<T> {
  ru: T
  en: T
}

interface PassageCard {
  id: string
  bookFolder: string
  book: number
  chapter: number
  discipline: Discipline | null
  secondaryDiscipline: Discipline | null
  exercises: string[]
  terms: string[]
  dogmas: string[]
  parallels: string[]
  motifs: string[]
  people: string[]
  place: string | null
  created: string
  status: string
  greek: string
  russian: string
  englishLong: string
  modernization: string
  commentary: I18n<string>
}

interface Term {
  id: string
  greek: string
  translit: string
  translation: I18n<string>
  partOfPhilosophy: string
  relatedTerms: string[]
  definition: I18n<string>
  source: I18n<string>
  notes: I18n<string>
}

interface Dogma {
  id: string
  title: I18n<string>
  sourceSvf: string
  sourceLs: string
  relatedTerms: string[]
  formulation: I18n<string>
  sourcesInTradition: I18n<string>
  notes: I18n<string>
}

interface Exercise {
  id: string
  title: I18n<string>
  hadotReference: string
  discipline: Discipline | null
  description: I18n<string>
  technique: I18n<string>
  examples: I18n<string>
}

interface Motif {
  id: string
  title: I18n<string>
  type: string
  relatedTerms: string[]
  relatedDogmas: string[]
  description: I18n<string>
  source: I18n<string>
  usage: I18n<string>
}

interface Person {
  id: string
  subFolder: string
  name: I18n<string>
  greekName: string
  latinName: string
  dates: I18n<string>
  birthplace: I18n<string>
  school: string
  role: I18n<string>
  biography: I18n<string>
  philosophicalSignificance: I18n<string>
  mentionsInMarcus: I18n<string>
  literature: I18n<string>
}

interface Place {
  id: string
  name: I18n<string>
  greekName: string
  latinName: string
  location: I18n<string>
  period: I18n<string>
  historicalContext: I18n<string>
  connectionToMarcus: I18n<string>
  literature: I18n<string>
}

// ────────────────────────────────────────────────────────────────────────────
// Sanity document shapes (NDJSON output)
// ────────────────────────────────────────────────────────────────────────────

interface SanityRef {
  _type: 'reference'
  _ref: string
}

interface SanityKeyedRef extends SanityRef {
  _key: string
}

interface SanityFootnote {
  _key: string
  _type: 'footnote'
  key: string
  body: I18n<PTBlock[]>
}

interface SanityPassageCard {
  _id: string
  _type: 'passageCard'
  cardId: string
  work: SanityRef
  book: number
  chapter: number
  discipline?: Discipline
  secondaryDiscipline?: Discipline
  greekText: PTBlock[]
  russianText: PTBlock[]
  russianTranslator: I18n<string>
  englishText: PTBlock[]
  englishTranslator: I18n<string>
  modernizationText: PTBlock[]
  modernizationNote: I18n<string>
  commentary: I18n<PTBlock[]>
  terms: SanityKeyedRef[]
  dogmas: SanityKeyedRef[]
  exercises: SanityKeyedRef[]
  motifs: SanityKeyedRef[]
  people: SanityKeyedRef[]
  place?: SanityRef
  parallels: string[]
  footnotes: SanityFootnote[]
  status: string
  createdAt?: string
}

interface SanityTerm {
  _id: string
  _type: 'term'
  termId: string
  greek: string
  translit?: string
  translation?: I18n<string>
  partOfPhilosophy?: string
  relatedTerms: SanityKeyedRef[]
  definition: I18n<PTBlock[]>
  source: I18n<PTBlock[]>
  notes: I18n<PTBlock[]>
}

interface SanityDogma {
  _id: string
  _type: 'dogma'
  dogmaId: string
  title: I18n<string>
  sourceSvf?: string
  sourceLs?: string
  relatedTerms: SanityKeyedRef[]
  formulation: I18n<PTBlock[]>
  sourcesInTradition: I18n<PTBlock[]>
  notes: I18n<PTBlock[]>
}

interface SanityExercise {
  _id: string
  _type: 'exercise'
  exerciseId: string
  title: I18n<string>
  hadotReference?: string
  discipline?: Discipline
  description: I18n<PTBlock[]>
  technique: I18n<PTBlock[]>
  examples: I18n<PTBlock[]>
}

interface SanityMotif {
  _id: string
  _type: 'motif'
  motifId: string
  title: I18n<string>
  relatedTerms: SanityKeyedRef[]
  relatedDogmas: SanityKeyedRef[]
  description: I18n<PTBlock[]>
  source: I18n<PTBlock[]>
  usage: I18n<PTBlock[]>
}

interface SanityPerson {
  _id: string
  _type: 'person'
  personId: string
  name: I18n<string>
  greekName?: string
  latinName?: string
  dates?: I18n<string>
  birthplace?: I18n<string>
  school?: string
  role?: I18n<string>
  biography: I18n<PTBlock[]>
  philosophicalSignificance: I18n<PTBlock[]>
  mentionsInMarcus: I18n<PTBlock[]>
  literature: I18n<PTBlock[]>
}

interface SanityPlace {
  _id: string
  _type: 'place'
  placeId: string
  name: I18n<string>
  greekName?: string
  latinName?: string
  location?: I18n<string>
  period?: I18n<string>
  historicalContext: I18n<PTBlock[]>
  connectionToMarcus: I18n<PTBlock[]>
  literature: I18n<PTBlock[]>
}

type SanityDoc =
  | SanityPassageCard
  | SanityTerm
  | SanityDogma
  | SanityExercise
  | SanityMotif
  | SanityPerson
  | SanityPlace

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const readJson = async <T>(name: string): Promise<T> => {
  const text = await readFile(join(BUILD, `${name}.json`), 'utf8')
  return JSON.parse(text) as T
}

/**
 * Drop empty/null/undefined.  For bilingual string objects, keeps the object
 * even if both langs are empty — frontend can show a fallback.  For other
 * undefined values, removes them.
 */
const undef = <T>(value: T | '' | null | undefined): T | undefined =>
  value === '' || value === null || value === undefined ? undefined : (value as T)

/** Convert each language slot of an I18n<string> via markdown→PT-blocks. */
const i18nBlocks = (
  src: I18n<string>,
  registry: Registry,
  warnings: string[],
): I18n<PTBlock[]> => ({
  ru: markdownToPortableTextBlocks(src.ru, registry, warnings),
  en: markdownToPortableTextBlocks(src.en, registry, warnings),
})

interface PTResult {
  blocks: PTBlock[]
  footnotes: Array<{key: string; body: PTBlock[]}>
}

/**
 * Convert slugs[] from a frontmatter array field into Sanity reference objects.
 * Drops any slug that does not exist in the registry (with a warning).
 *
 * `expected` is either:
 *   - a single TargetType (strict)
 *   - an array of TargetTypes (lenient; the actual type must be one of them)
 */
const slugsToRefs = (
  slugs: string[],
  expected: TargetType | TargetType[],
  registry: Registry,
  warnings: string[],
  context: string,
): SanityKeyedRef[] => {
  const allowed = new Set(Array.isArray(expected) ? expected : [expected])
  const refs: SanityKeyedRef[] = []

  for (const slug of slugs) {
    const actualType = registry.get(slug)
    if (!actualType) {
      const expectedLabel = Array.isArray(expected) ? expected.join('|') : expected
      warnings.push(`${context}: unknown reference "${slug}" (expected ${expectedLabel})`)
      continue
    }
    if (!allowed.has(actualType)) {
      const expectedLabel = Array.isArray(expected) ? expected.join('|') : expected
      warnings.push(
        `${context}: reference "${slug}" resolves to ${actualType}, expected ${expectedLabel}`,
      )
    }
    refs.push({
      _key: `r_${slug.replace(/[^a-z0-9]/gi, '_')}`,
      _type: 'reference',
      _ref: `${actualType}.${slug}`,
    })
  }
  return refs
}

const CONCEPT_TYPES: TargetType[] = ['term', 'dogma', 'exercise', 'motif']

const toIsoDateTime = (date: string): string | undefined => {
  if (!date) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00.000Z`
  return date
}

let footnoteKeyCounter = 0

/**
 * Merge per-language footnote lists into one bilingual array, grouped by key.
 * If a key appears in both languages, both bodies are kept under the same entry.
 */
const mergeBilingualFootnotes = (
  ruList: Array<{key: string; body: PTBlock[]}>,
  enList: Array<{key: string; body: PTBlock[]}>,
): SanityFootnote[] => {
  const map = new Map<string, SanityFootnote>()

  const ensure = (key: string): SanityFootnote => {
    let entry = map.get(key)
    if (!entry) {
      entry = {
        _key: `fn_${++footnoteKeyCounter}`,
        _type: 'footnote',
        key,
        body: {ru: [], en: []},
      }
      map.set(key, entry)
    }
    return entry
  }

  for (const fn of ruList) {
    const entry = ensure(fn.key)
    if (entry.body.ru.length === 0) entry.body.ru = fn.body
  }
  for (const fn of enList) {
    const entry = ensure(fn.key)
    if (entry.body.en.length === 0) entry.body.en = fn.body
  }

  return Array.from(map.values())
}

// ────────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────────

const buildRegistry = (data: {
  passageCards: PassageCard[]
  terms: Term[]
  dogmas: Dogma[]
  exercises: Exercise[]
  motifs: Motif[]
  people: Person[]
  places: Place[]
}): Registry => {
  const registry: Registry = new Map()
  for (const it of data.terms) registry.set(it.id, 'term')
  for (const it of data.dogmas) registry.set(it.id, 'dogma')
  for (const it of data.exercises) registry.set(it.id, 'exercise')
  for (const it of data.motifs) registry.set(it.id, 'motif')
  for (const it of data.people) registry.set(it.id, 'person')
  for (const it of data.places) registry.set(it.id, 'place')
  for (const it of data.passageCards) registry.set(it.id, 'passageCard')
  return registry
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-routing
// ────────────────────────────────────────────────────────────────────────────

interface PassageRefBundle {
  terms: SanityKeyedRef[]
  dogmas: SanityKeyedRef[]
  exercises: SanityKeyedRef[]
  motifs: SanityKeyedRef[]
  people: SanityKeyedRef[]
}

const autoRouteRefs = (
  pc: PassageCard,
  registry: Registry,
  warnings: string[],
  infos: string[],
): PassageRefBundle => {
  const ctx = `passageCard.${pc.id}`

  const bucket: PassageRefBundle = {
    terms: [],
    dogmas: [],
    exercises: [],
    motifs: [],
    people: [],
  }

  const targetField: Record<TargetType, keyof PassageRefBundle | null> = {
    term: 'terms',
    dogma: 'dogmas',
    exercise: 'exercises',
    motif: 'motifs',
    person: 'people',
    place: null,
    passageCard: null,
  }

  const expectedSource: Record<TargetType, string> = {
    term: 'terms',
    dogma: 'dogmas',
    exercise: 'exercises',
    motif: 'motifs',
    person: 'people',
    place: 'place',
    passageCard: 'passageCard',
  }

  const sources: Array<{slug: string; from: string}> = [
    ...pc.terms.map((s) => ({slug: s, from: 'terms'})),
    ...pc.dogmas.map((s) => ({slug: s, from: 'dogmas'})),
    ...pc.exercises.map((s) => ({slug: s, from: 'exercises'})),
    ...pc.motifs.map((s) => ({slug: s, from: 'motifs'})),
    ...pc.people.map((s) => ({slug: s, from: 'people'})),
  ]

  for (const {slug, from} of sources) {
    const actualType = registry.get(slug)
    if (!actualType) {
      warnings.push(`${ctx}: unknown reference "${slug}" (in frontmatter '${from}')`)
      continue
    }
    const field = targetField[actualType]
    if (!field) {
      warnings.push(
        `${ctx}: cannot place "${slug}" of type ${actualType} in any passageCard array`,
      )
      continue
    }
    if (from !== expectedSource[actualType]) {
      infos.push(
        `${ctx}: auto-routed "${slug}" from frontmatter '${from}' → field '${field}' (actually ${actualType})`,
      )
    }
    bucket[field].push({
      _key: `r_${slug.replace(/[^a-z0-9]/gi, '_')}`,
      _type: 'reference',
      _ref: `${actualType}.${slug}`,
    })
  }

  for (const key of Object.keys(bucket) as Array<keyof PassageRefBundle>) {
    const seen = new Set<string>()
    bucket[key] = bucket[key].filter((r) => {
      if (seen.has(r._ref)) return false
      seen.add(r._ref)
      return true
    })
  }

  return bucket
}

// ────────────────────────────────────────────────────────────────────────────
// Converters
// ────────────────────────────────────────────────────────────────────────────

const passageCardToSanity = (
  pc: PassageCard,
  registry: Registry,
  warnings: string[],
  infos: string[],
): SanityPassageCard => {
  const ctx = `passageCard.${pc.id}`

  const greek = markdownToPortableText(pc.greek, registry, warnings) as PTResult
  const russian = markdownToPortableText(pc.russian, registry, warnings) as PTResult
  const englishLong = markdownToPortableText(pc.englishLong, registry, warnings) as PTResult
  const modernization = markdownToPortableText(pc.modernization, registry, warnings) as PTResult
  const commentaryRu = markdownToPortableText(pc.commentary.ru, registry, warnings) as PTResult
  const commentaryEn = markdownToPortableText(pc.commentary.en, registry, warnings) as PTResult

  // Route footnotes to languages based on the section they came from:
  //   greek + russian + commentary.ru → ru-side
  //   englishLong + modernization + commentary.en → en-side
  // Same key across languages merges into one bilingual entry.
  const allFootnotes = mergeBilingualFootnotes(
    [...greek.footnotes, ...russian.footnotes, ...commentaryRu.footnotes],
    [...englishLong.footnotes, ...modernization.footnotes, ...commentaryEn.footnotes],
  )

  const placeRef =
    pc.place && registry.get(pc.place) === 'place'
      ? ({_type: 'reference', _ref: `place.${pc.place}`} as SanityRef)
      : undefined
  if (pc.place && !placeRef) {
    warnings.push(`${ctx}: unknown place "${pc.place}"`)
  }

  const refs = autoRouteRefs(pc, registry, warnings, infos)

  return {
    _id: `passageCard.${pc.id}`,
    _type: 'passageCard',
    cardId: pc.id,
    work: {_type: 'reference', _ref: 'work.meditations'},
    book: pc.book,
    chapter: pc.chapter,
    discipline: pc.discipline ?? undefined,
    secondaryDiscipline: pc.secondaryDiscipline ?? undefined,
    greekText: greek.blocks,
    russianText: russian.blocks,
    russianTranslator: {ru: 'Роговин', en: 'Rogovin'},
    englishText: englishLong.blocks,
    englishTranslator: {ru: 'Джордж Лонг', en: 'George Long'},
    modernizationText: modernization.blocks,
    modernizationNote: {
      ru: 'модернизация перевода Long, 1862',
      en: 'modernized translation of Long, 1862',
    },
    commentary: {ru: commentaryRu.blocks, en: commentaryEn.blocks},
    terms: refs.terms,
    dogmas: refs.dogmas,
    exercises: refs.exercises,
    motifs: refs.motifs,
    people: refs.people,
    place: placeRef,
    parallels: pc.parallels,
    footnotes: allFootnotes,
    status: pc.status,
    createdAt: toIsoDateTime(pc.created),
  }
}

const termToSanity = (t: Term, registry: Registry, warnings: string[]): SanityTerm => {
  const ctx = `term.${t.id}`
  return {
    _id: `term.${t.id}`,
    _type: 'term',
    termId: t.id,
    greek: t.greek,
    translit: undef(t.translit),
    translation: t.translation,
    partOfPhilosophy: undef(t.partOfPhilosophy),
    relatedTerms: slugsToRefs(t.relatedTerms, CONCEPT_TYPES, registry, warnings, ctx),
    definition: i18nBlocks(t.definition, registry, warnings),
    source: i18nBlocks(t.source, registry, warnings),
    notes: i18nBlocks(t.notes, registry, warnings),
  }
}

const dogmaToSanity = (d: Dogma, registry: Registry, warnings: string[]): SanityDogma => {
  const ctx = `dogma.${d.id}`
  return {
    _id: `dogma.${d.id}`,
    _type: 'dogma',
    dogmaId: d.id,
    title: d.title,
    sourceSvf: undef(d.sourceSvf),
    sourceLs: undef(d.sourceLs),
    relatedTerms: slugsToRefs(d.relatedTerms, CONCEPT_TYPES, registry, warnings, ctx),
    formulation: i18nBlocks(d.formulation, registry, warnings),
    sourcesInTradition: i18nBlocks(d.sourcesInTradition, registry, warnings),
    notes: i18nBlocks(d.notes, registry, warnings),
  }
}

const exerciseToSanity = (
  e: Exercise,
  registry: Registry,
  warnings: string[],
): SanityExercise => ({
  _id: `exercise.${e.id}`,
  _type: 'exercise',
  exerciseId: e.id,
  title: e.title,
  hadotReference: undef(e.hadotReference),
  discipline: e.discipline ?? undefined,
  description: i18nBlocks(e.description, registry, warnings),
  technique: i18nBlocks(e.technique, registry, warnings),
  examples: i18nBlocks(e.examples, registry, warnings),
})

const motifToSanity = (m: Motif, registry: Registry, warnings: string[]): SanityMotif => {
  const ctx = `motif.${m.id}`
  return {
    _id: `motif.${m.id}`,
    _type: 'motif',
    motifId: m.id,
    title: m.title,
    relatedTerms: slugsToRefs(m.relatedTerms, CONCEPT_TYPES, registry, warnings, ctx),
    relatedDogmas: slugsToRefs(m.relatedDogmas, CONCEPT_TYPES, registry, warnings, ctx),
    description: i18nBlocks(m.description, registry, warnings),
    source: i18nBlocks(m.source, registry, warnings),
    usage: i18nBlocks(m.usage, registry, warnings),
  }
}

const personToSanity = (
  p: Person,
  registry: Registry,
  warnings: string[],
): SanityPerson => ({
  _id: `person.${p.id}`,
  _type: 'person',
  personId: p.id,
  name: {
    ru: p.name.ru || p.greekName || p.latinName || p.id,
    en: p.name.en || p.latinName || p.greekName || p.id,
  },
  greekName: undef(p.greekName),
  latinName: undef(p.latinName),
  dates: undef(p.dates),
  birthplace: undef(p.birthplace),
  school: undef(p.school),
  role: undef(p.role),
  biography: i18nBlocks(p.biography, registry, warnings),
  philosophicalSignificance: i18nBlocks(p.philosophicalSignificance, registry, warnings),
  mentionsInMarcus: i18nBlocks(p.mentionsInMarcus, registry, warnings),
  literature: i18nBlocks(p.literature, registry, warnings),
})

const placeToSanity = (pl: Place, registry: Registry, warnings: string[]): SanityPlace => ({
  _id: `place.${pl.id}`,
  _type: 'place',
  placeId: pl.id,
  name: {
    ru: pl.name.ru || pl.latinName || pl.greekName || pl.id,
    en: pl.name.en || pl.latinName || pl.greekName || pl.id,
  },
  greekName: undef(pl.greekName),
  latinName: undef(pl.latinName),
  location: undef(pl.location),
  period: undef(pl.period),
  historicalContext: i18nBlocks(pl.historicalContext, registry, warnings),
  connectionToMarcus: i18nBlocks(pl.connectionToMarcus, registry, warnings),
  literature: i18nBlocks(pl.literature, registry, warnings),
})

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

const stripUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out as T
}

const main = async (): Promise<void> => {
  const [passageCards, terms, dogmas, exercises, motifs, people, places] = await Promise.all([
    readJson<PassageCard[]>('passageCards'),
    readJson<Term[]>('terms'),
    readJson<Dogma[]>('dogmas'),
    readJson<Exercise[]>('exercises'),
    readJson<Motif[]>('motifs'),
    readJson<Person[]>('people'),
    readJson<Place[]>('places'),
  ])

  const registry = buildRegistry({passageCards, terms, dogmas, exercises, motifs, people, places})
  const warnings: string[] = []
  const infos: string[] = []

  const docs: SanityDoc[] = [
    ...terms.map((t) => termToSanity(t, registry, warnings)),
    ...dogmas.map((d) => dogmaToSanity(d, registry, warnings)),
    ...exercises.map((e) => exerciseToSanity(e, registry, warnings)),
    ...motifs.map((m) => motifToSanity(m, registry, warnings)),
    ...people.map((p) => personToSanity(p, registry, warnings)),
    ...places.map((pl) => placeToSanity(pl, registry, warnings)),
    ...passageCards.map((pc) => passageCardToSanity(pc, registry, warnings, infos)),
  ]

  const cleaned = docs.map(stripUndefined)
  const ndjson = cleaned.map((doc) => JSON.stringify(doc)).join('\n') + '\n'
  await writeFile(join(BUILD, 'import.ndjson'), ndjson, 'utf8')

  console.log(`wrote ${cleaned.length} documents to build/import.ndjson`)

  const printDeduped = (label: string, lines: string[], stream: 'log' | 'warn'): void => {
    if (lines.length === 0) return
    const seen = new Set<string>()
    const unique = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)))
    const out = stream === 'warn' ? console.warn : console.log
    out(`\n${unique.length} ${label}:`)
    for (const l of unique) out('  ' + l)
  }

  printDeduped('warning(s)', warnings, 'warn')
  printDeduped('info(s)', infos, 'log')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
