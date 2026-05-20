/**
 * build.ts — Phase 1 of the Marcus vault pipeline.
 *
 * Walks every content folder under `marcus-aurelius/`, parses each markdown
 * file's YAML frontmatter and `## ...`-section bodies, and writes structured
 * JSON to `marcus-aurelius/build/*.json`.
 *
 * Bilinguality: Markdown body sections come in RU/EN pairs (e.g.
 * `## Определение` and `## Definition`).  Each canonical PT field is emitted
 * as `{ru, en}`.  Frontmatter accepts both legacy single-language keys
 * (`translation:`) and language-suffixed keys (`translation_ru:`/`_en`).
 *
 * NOTE on body content: this phase keeps markdown bodies as RAW strings.
 * Wiki-link resolution (`[[id|alias]]` -> reference) and markdown -> Portable
 * Text conversion are performed in `to-sanity.ts`, which has access to the
 * full cross-document slug registry.
 */

import {readdir, readFile, writeFile, mkdir} from 'node:fs/promises'
import {join, dirname, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BUILD = join(ROOT, 'build')

// ────────────────────────────────────────────────────────────────────────────
// Types: vault → JSON
// ────────────────────────────────────────────────────────────────────────────

type Discipline = 'assent' | 'desire' | 'action'

interface I18n<T> {
  ru: T
  en: T
}

interface PassageCard {
  id: string // '02-13'
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
  // four parallel texts — each language-keyed by name, single-string body
  greek: string
  russian: string
  englishLong: string
  modernization: string
  // bilingual commentary
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
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback

const asNumber = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

const asDiscipline = (v: unknown): Discipline | null =>
  v === 'assent' || v === 'desire' || v === 'action' ? v : null

const asDateString = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') return v
  return ''
}

/**
 * Bilingual section reader: pull RU and EN bodies from the sections map.
 */
const i18nSections = (
  sections: Record<string, string>,
  ruHeading: string,
  enHeading: string,
): I18n<string> => ({
  ru: asString(sections[ruHeading]),
  en: asString(sections[enHeading]),
})

/**
 * Bilingual frontmatter reader.  Reads `<key>_ru`/`<key>_en`, with a fallback
 * to legacy single-language `<key>` (treated as RU).
 */
const i18nFm = (fm: Record<string, unknown>, key: string): I18n<string> => ({
  ru: asString(fm[`${key}_ru`] ?? fm[key]),
  en: asString(fm[`${key}_en`]),
})

/**
 * Split markdown body at top-level `## ...` headings.  Returns map of
 * heading text -> body text (trimmed).
 */
const parseSections = (content: string): Record<string, string> => {
  const sections: Record<string, string> = {}
  const lines = content.split('\n')
  let currentHeading = ''
  let buffer: string[] = []

  const flush = (): void => {
    if (currentHeading || buffer.length > 0) {
      sections[currentHeading] = buffer.join('\n').trim()
    }
  }

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      currentHeading = match[1].trim()
      buffer = []
    } else {
      buffer.push(line)
    }
  }
  flush()

  return sections
}

interface RawFile {
  id: string
  relPath: string
  raw: string
}

const readMdFilesRecursive = async (
  baseDir: string,
  subDir: string = '',
): Promise<RawFile[]> => {
  const dirPath = join(baseDir, subDir)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dirPath, {withFileTypes: true})
  } catch {
    return []
  }

  const results: RawFile[] = []
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const sub = await readMdFilesRecursive(baseDir, join(subDir, entry.name))
      results.push(...sub)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const raw = await readFile(entryPath, 'utf8')
      results.push({
        id: entry.name.replace(/\.md$/, ''),
        relPath: relative(ROOT, entryPath).replace(/\\/g, '/'),
        raw,
      })
    }
  }
  return results
}

const parseFrontmatter = (
  raw: string,
): {fm: Record<string, unknown>; sections: Record<string, string>} => {
  const parsed = matter(raw)
  return {
    fm: parsed.data as Record<string, unknown>,
    sections: parseSections(parsed.content),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Builders
// ────────────────────────────────────────────────────────────────────────────

const buildPassageCard = ({id, relPath, raw}: RawFile): PassageCard => {
  const {fm, sections} = parseFrontmatter(raw)
  const parts = relPath.split('/')
  const bookFolder = parts.length >= 3 ? parts[1] : ''

  return {
    id,
    bookFolder,
    book: asNumber(fm.book),
    chapter: asNumber(fm.chapter),
    discipline: asDiscipline(fm.discipline),
    secondaryDiscipline: asDiscipline(fm.secondary_discipline),
    exercises: asStringArray(fm.exercises),
    terms: asStringArray(fm.terms),
    dogmas: asStringArray(fm.dogmas),
    parallels: asStringArray(fm.parallels),
    motifs: asStringArray(fm.images ?? fm.motifs),
    people: asStringArray(fm.people),
    place: typeof fm.place === 'string' ? fm.place : null,
    created: asDateString(fm.created),
    status: asString(fm.status, 'draft'),
    greek: asString(sections['Греческий']),
    russian: asString(sections['Русский']),
    englishLong: asString(sections['Английский']),
    modernization: asString(sections['Английский Long Modernization']),
    commentary: i18nSections(sections, 'Комментарий', 'Commentary'),
  }
}

const buildTerm = ({id, raw}: RawFile): Term => {
  const {fm, sections} = parseFrontmatter(raw)
  return {
    id,
    greek: asString(fm.greek),
    translit: asString(fm.translit),
    translation: i18nFm(fm, 'translation'),
    partOfPhilosophy: asString(fm.part_of_philosophy),
    relatedTerms: asStringArray(fm.related_terms),
    definition: i18nSections(sections, 'Определение', 'Definition'),
    source: i18nSections(sections, 'Источник определения', 'Source'),
    notes: i18nSections(sections, 'Примечания', 'Notes'),
  }
}

const buildDogma = ({id, raw}: RawFile): Dogma => {
  const {fm, sections} = parseFrontmatter(raw)
  return {
    id,
    title: i18nFm(fm, 'title'),
    sourceSvf: asString(fm.source_svf),
    sourceLs: asString(fm.source_ls),
    relatedTerms: asStringArray(fm.related_terms),
    formulation: i18nSections(sections, 'Формулировка', 'Formulation'),
    sourcesInTradition: i18nSections(
      sections,
      'Источники в традиции',
      'Sources in tradition',
    ),
    notes: i18nSections(sections, 'Примечания', 'Notes'),
  }
}

const buildExercise = ({id, raw}: RawFile): Exercise => {
  const {fm, sections} = parseFrontmatter(raw)
  return {
    id,
    title: i18nFm(fm, 'title'),
    hadotReference: asString(fm.hadot_reference),
    discipline: asDiscipline(fm.discipline),
    description: i18nSections(sections, 'Описание', 'Description'),
    technique: i18nSections(sections, 'Техника', 'Technique'),
    examples: i18nSections(sections, 'Примеры у Марка', 'Examples'),
  }
}

const buildMotif = ({id, raw}: RawFile): Motif => {
  const {fm, sections} = parseFrontmatter(raw)
  return {
    id,
    title: i18nFm(fm, 'title'),
    type: asString(fm.type, 'image'),
    relatedTerms: asStringArray(fm.related_terms),
    relatedDogmas: asStringArray(fm.related_dogmas),
    description: i18nSections(sections, 'Образ', 'Image'),
    source: i18nSections(sections, 'Источник', 'Source'),
    usage: i18nSections(sections, 'Использование', 'Usage'),
  }
}

const buildPerson = ({id, relPath, raw}: RawFile): Person => {
  const {fm, sections} = parseFrontmatter(raw)
  const parts = relPath.split('/')
  const subFolder = parts.length >= 3 ? parts[1] : ''

  return {
    id,
    subFolder,
    name: i18nFm(fm, 'name'),
    greekName: asString(fm.greek_name),
    latinName: asString(fm.latin_name),
    dates: i18nFm(fm, 'dates'),
    birthplace: i18nFm(fm, 'birthplace'),
    school: asString(fm.school),
    role: i18nFm(fm, 'role'),
    biography: i18nSections(sections, 'Биография', 'Biography'),
    philosophicalSignificance: i18nSections(
      sections,
      'Философское значение',
      'Philosophical significance',
    ),
    mentionsInMarcus: i18nSections(
      sections,
      'Цитируется/упоминается у Марка',
      'Mentions in Marcus',
    ),
    literature: i18nSections(sections, 'Литература', 'Literature'),
  }
}

const buildPlace = ({id, raw}: RawFile): Place => {
  const {fm, sections} = parseFrontmatter(raw)
  return {
    id,
    name: i18nFm(fm, 'name'),
    greekName: asString(fm.greek_name),
    latinName: asString(fm.latin_name),
    location: i18nFm(fm, 'location'),
    period: i18nFm(fm, 'period'),
    historicalContext: i18nSections(
      sections,
      'Историческая справка',
      'Historical context',
    ),
    connectionToMarcus: i18nSections(
      sections,
      'Связь с Марком и *Размышлениями*',
      'Connection to Marcus',
    ),
    literature: i18nSections(sections, 'Литература', 'Literature'),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

const writeJson = (name: string, data: unknown): Promise<void> =>
  writeFile(join(BUILD, `${name}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8')

const main = async (): Promise<void> => {
  await mkdir(BUILD, {recursive: true})

  const [
    passageFiles,
    termFiles,
    dogmaFiles,
    exerciseFiles,
    motifFiles,
    personFiles,
    placeFiles,
  ] = await Promise.all([
    readMdFilesRecursive(join(ROOT, 'passages')),
    readMdFilesRecursive(join(ROOT, 'terms')),
    readMdFilesRecursive(join(ROOT, 'dogmas')),
    readMdFilesRecursive(join(ROOT, 'exercises')),
    readMdFilesRecursive(join(ROOT, 'images')),
    readMdFilesRecursive(join(ROOT, 'people')),
    readMdFilesRecursive(join(ROOT, 'places')),
  ])

  const passageCards = passageFiles.map(buildPassageCard)
  const terms = termFiles.map(buildTerm)
  const dogmas = dogmaFiles.map(buildDogma)
  const exercises = exerciseFiles.map(buildExercise)
  const motifs = motifFiles.map(buildMotif)
  const people = personFiles.map(buildPerson)
  const places = placeFiles.map(buildPlace)

  await Promise.all([
    writeJson('passageCards', passageCards),
    writeJson('terms', terms),
    writeJson('dogmas', dogmas),
    writeJson('exercises', exercises),
    writeJson('motifs', motifs),
    writeJson('people', people),
    writeJson('places', places),
  ])

  console.log(
    `built: ${passageCards.length} passages, ` +
      `${terms.length} terms, ${dogmas.length} dogmas, ` +
      `${exercises.length} exercises, ${motifs.length} motifs, ` +
      `${people.length} people, ${places.length} places`,
  )
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
