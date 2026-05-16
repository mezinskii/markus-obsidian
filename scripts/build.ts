import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

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

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const asNumber = (v: unknown): number =>
  typeof v === 'number' ? v : 0;

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const asDiscipline = (v: unknown): Discipline =>
  v === 'assent' || v === 'desire' || v === 'action' ? v : 'assent';

const asPartOfPhilosophy = (v: unknown): PartOfPhilosophy =>
  v === 'logic' || v === 'physics' || v === 'ethics' ? v : 'ethics';

const asDateString = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v;
  return '';
};

const parseSections = (content: string): Record<string, string> => {
  const parts = content.split(/^## /m).slice(1);
  return Object.fromEntries(
    parts.map((part): [string, string] => {
      const newlineIdx = part.indexOf('\n');
      const heading = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
      const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1)).trim();
      return [heading, body];
    }),
  );
};

interface RawFile {
  id: string;
  raw: string;
}

const readMdFiles = async (dir: string): Promise<RawFile[]> => {
  const entries = await readdir(join(ROOT, dir));
  const mdFiles = entries.filter((f) => f.endsWith('.md'));
  return Promise.all(
    mdFiles.map(async (file): Promise<RawFile> => ({
      id: file.replace(/\.md$/, ''),
      raw: await readFile(join(ROOT, dir, file), 'utf8'),
    })),
  );
};

const parseFrontmatter = (raw: string): { fm: Record<string, unknown>; sections: Record<string, string> } => {
  const parsed = matter(raw);
  return {
    fm: parsed.data as Record<string, unknown>,
    sections: parseSections(parsed.content),
  };
};

const buildPassage = ({ id, raw }: RawFile): Passage => {
  const { fm, sections } = parseFrontmatter(raw);
  return {
    id,
    book: asNumber(fm.book),
    chapter: asNumber(fm.chapter),
    discipline: asDiscipline(fm.discipline),
    exercises: asStringArray(fm.exercises),
    terms: asStringArray(fm.terms),
    dogmas: asStringArray(fm.dogmas),
    parallels: asStringArray(fm.parallels),
    images: asStringArray(fm.images),
    created: asDateString(fm.created),
    greek: asString(sections['Греческий']),
    russian: asString(sections['Русский']),
    english: asString(sections['Английский']),
    commentary: asString(sections['Комментарий']),
  };
};

const buildTerm = ({ id, raw }: RawFile): Term => {
  const { fm, sections } = parseFrontmatter(raw);
  return {
    id,
    greek: asString(fm.greek),
    translit: asString(fm.translit),
    translation: asString(fm.translation),
    part_of_philosophy: asPartOfPhilosophy(fm.part_of_philosophy),
    related_terms: asStringArray(fm.related_terms),
    definition: asString(sections['Определение']),
    source: asString(sections['Источник определения']),
    notes: asString(sections['Примечания']),
  };
};

const buildDogma = ({ id, raw }: RawFile): Dogma => {
  const { fm, sections } = parseFrontmatter(raw);
  return {
    id,
    title: asString(fm.title),
    source_svf: asString(fm.source_svf),
    source_ls: asString(fm.source_ls),
    related_terms: asStringArray(fm.related_terms),
    formulation: asString(sections['Формулировка']),
    sources_in_tradition: asString(sections['Источники в традиции']),
    notes: asString(sections['Примечания']),
  };
};

const buildExercise = ({ id, raw }: RawFile): Exercise => {
  const { fm, sections } = parseFrontmatter(raw);
  return {
    id,
    title: asString(fm.title),
    hadot_reference: asString(fm.hadot_reference),
    discipline: asDiscipline(fm.discipline),
    description: asString(sections['Описание']),
    technique: asString(sections['Техника']),
    examples: asString(sections['Примеры у Марка']),
  };
};

const writeJson = (name: string, data: unknown): Promise<void> =>
  writeFile(join(BUILD, `${name}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8');

const main = async (): Promise<void> => {
  await mkdir(BUILD, { recursive: true });
  const [passageFiles, termFiles, dogmaFiles, exerciseFiles] = await Promise.all([
    readMdFiles('passages'),
    readMdFiles('terms'),
    readMdFiles('dogmas'),
    readMdFiles('exercises'),
  ]);
  const passages = passageFiles.map(buildPassage);
  const terms = termFiles.map(buildTerm);
  const dogmas = dogmaFiles.map(buildDogma);
  const exercises = exerciseFiles.map(buildExercise);
  await Promise.all([
    writeJson('passages', passages),
    writeJson('terms', terms),
    writeJson('dogmas', dogmas),
    writeJson('exercises', exercises),
  ]);
  console.log(
    `built: ${passages.length} passages, ${terms.length} terms, ${dogmas.length} dogmas, ${exercises.length} exercises`,
  );
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
