import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUILD = join(ROOT, 'build');

type Discipline = 'assent' | 'desire' | 'action';
type PartOfPhilosophy = 'logic' | 'physics' | 'ethics';

interface Passage {
  id: string;
  book: number;
  chapter: number;
  discipline: Discipline;
  exercises: string[];
  terms: string[];
  dogmas: string[];
  parallels: string[];
  images: string[];
  created: string;
  greek: string;
  russian: string;
  english: string;
  commentary: string;
}

interface Term {
  id: string;
  greek: string;
  translit: string;
  translation: string;
  part_of_philosophy: PartOfPhilosophy;
  related_terms: string[];
  definition: string;
  source: string;
  notes: string;
}

interface Dogma {
  id: string;
  title: string;
  source_svf: string;
  source_ls: string;
  related_terms: string[];
  formulation: string;
  sources_in_tradition: string;
  notes: string;
}

interface Exercise {
  id: string;
  title: string;
  hadot_reference: string;
  discipline: Discipline;
  description: string;
  technique: string;
  examples: string;
}

interface Reference {
  _type: 'reference';
  _ref: string;
  _key: string;
}

interface SanityPassage {
  _id: string;
  _type: 'passage';
  book: number;
  chapter: number;
  discipline: Discipline;
  exercises: Reference[];
  terms: Reference[];
  dogmas: Reference[];
  parallels: string[];
  images: string[];
  created: string;
  greek: string;
  russian: string;
  english: string;
  commentary: string;
}

interface SanityTerm {
  _id: string;
  _type: 'term';
  greek: string;
  translit: string;
  translation: string;
  part_of_philosophy: PartOfPhilosophy;
  related_terms: Reference[];
  definition: string;
  source: string;
  notes: string;
}

interface SanityDogma {
  _id: string;
  _type: 'dogma';
  title: string;
  source_svf: string;
  source_ls: string;
  related_terms: Reference[];
  formulation: string;
  sources_in_tradition: string;
  notes: string;
}

interface SanityExercise {
  _id: string;
  _type: 'exercise';
  title: string;
  hadot_reference: string;
  discipline: Discipline;
}

type SanityDocument = SanityPassage | SanityTerm | SanityDogma | SanityExercise;

const toRef = (prefix: string) => (slug: string): Reference => ({
  _type: 'reference',
  _ref: `${prefix}-${slug}`,
  _key: slug,
});

const passageToSanity = (p: Passage): SanityPassage => ({
  _id: `passage-${p.id}`,
  _type: 'passage',
  book: p.book,
  chapter: p.chapter,
  discipline: p.discipline,
  exercises: p.exercises.map(toRef('exercise')),
  terms: p.terms.map(toRef('term')),
  dogmas: p.dogmas.map(toRef('dogma')),
  parallels: p.parallels,
  images: p.images,
  created: p.created,
  greek: p.greek,
  russian: p.russian,
  english: p.english,
  commentary: p.commentary,
});

const termToSanity = (t: Term): SanityTerm => ({
  _id: `term-${t.id}`,
  _type: 'term',
  greek: t.greek,
  translit: t.translit,
  translation: t.translation,
  part_of_philosophy: t.part_of_philosophy,
  related_terms: t.related_terms.map(toRef('term')),
  definition: t.definition,
  source: t.source,
  notes: t.notes,
});

const dogmaToSanity = (d: Dogma): SanityDogma => ({
  _id: `dogma-${d.id}`,
  _type: 'dogma',
  title: d.title,
  source_svf: d.source_svf,
  source_ls: d.source_ls,
  related_terms: d.related_terms.map(toRef('term')),
  formulation: d.formulation,
  sources_in_tradition: d.sources_in_tradition,
  notes: d.notes,
});

const exerciseToSanity = (e: Exercise): SanityExercise => ({
  _id: `exercise-${e.id}`,
  _type: 'exercise',
  title: e.title,
  hadot_reference: e.hadot_reference,
  discipline: e.discipline,
});

const readJson = async <T>(name: string): Promise<T> => {
  const text = await readFile(join(BUILD, `${name}.json`), 'utf8');
  return JSON.parse(text) as T;
};

const main = async (): Promise<void> => {
  const [passages, terms, dogmas, exercises] = await Promise.all([
    readJson<Passage[]>('passages'),
    readJson<Term[]>('terms'),
    readJson<Dogma[]>('dogmas'),
    readJson<Exercise[]>('exercises'),
  ]);

  const documents: SanityDocument[] = [
    ...passages.map(passageToSanity),
    ...terms.map(termToSanity),
    ...dogmas.map(dogmaToSanity),
    ...exercises.map(exerciseToSanity),
  ];

  const ndjson = documents.map((doc) => JSON.stringify(doc)).join('\n') + '\n';
  await writeFile(join(BUILD, 'import.ndjson'), ndjson, 'utf8');
  console.log(`wrote ${documents.length} documents to build/import.ndjson`);
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
