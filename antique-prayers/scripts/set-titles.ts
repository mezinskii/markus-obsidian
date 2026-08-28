/**
 * set-titles.ts — give every card a short title in both languages.
 *
 * Until now `title` was empty on all 317 cards and the site fell back to a
 * hard-coded English string, so every Russian page was headed "Prayer to
 * Apollo" and some thirty pages shared one heading. A title is content, so it
 * belongs in the corpus next to everything else, in git, reviewable.
 *
 * The title is deliberately short — «Молитва Аполлону», not the whole
 * citation. The source is appended by the site when it builds the <title> tag,
 * which is what makes each page's tag unique; the heading itself stays the
 * phrase a reader would actually search for.
 *
 * Rules, in order:
 *   1. an entry in EXCEPTIONS wins (texts with a name of their own, and the
 *      nine cards that address no deity at all);
 *   2. the noun comes from the kind of text — the two hymn collections get
 *      "Hymn", everything else "Prayer". The `oath` function is deliberately
 *      NOT used: in this corpus it tags vows as well as oaths, so Romulus
 *      vowing a temple and Alcmena swearing by Juno carry the same value, and
 *      a rule built on it would mistitle the majority. The handful of texts
 *      that really are oaths are named in EXCEPTIONS instead;
 *   3. the addressee is the first deity, or the first two joined by "and";
 *      three or more and only the first is named, because the rest belong in
 *      the card, not the heading.
 *
 * Usage:
 *   npx tsx antique-prayers/scripts/set-titles.ts [--dry] [--force]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { DEITY_NAMES } from "./deity-names.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prayers");
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

interface Title {
  en: string;
  ru: string;
}

/**
 * Cards whose title cannot be derived: they address no deity, or they are
 * known by a name of their own that no rule would produce.
 */
const EXCEPTIONS: Record<string, Title> = {
  // Two hymns to the same pair of gods, cut one after the other on one stele.
  // The generated title would be identical for both, so they are numbered as
  // the stone numbers them.
  "greek-telesphoros-001": { en: "First Hymn to Telesphorus", ru: "Первый гимн Телесфору" },
  "greek-telesphoros-002": { en: "Second Hymn to Telesphorus", ru: "Второй гимн Телесфору" },
  "hippocrates-oath-001": { en: "The Hippocratic Oath", ru: "Клятва Гиппократа" },
  "livy-deciusmus-001": { en: "The devotio of Decius Mus", ru: "Девоция Деция Муса" },
  "macrobius-devotio-001": { en: "The devotio of Carthage", ru: "Девоция Карфагена" },
  "macrobius-evocatio-001": { en: "The evocatio of Carthage", ru: "Эвокация Карфагена" },
  "arvales-carmen-001": { en: "Carmen Arvale", ru: "Арвальская песнь" },
  "janus-010": { en: "The Salian Hymn", ru: "Салийская песнь" },
  "varro-meditrinalia-001": { en: "Formula for the Meditrinalia", ru: "Формула Медитриналий" },
  "pliny-sowing-001": { en: "Formula spoken at sowing", ru: "Формула при севе" },
  "cato-dislocation-charm-001": { en: "Charm for a dislocation", ru: "Заговор при вывихе" },
  "cato-grove-001": { en: "Prayer for thinning a sacred grove", ru: "Молитва при прореживании священной рощи" },
  "greek-ancestors-001": { en: "Prayer to the ancestors", ru: "Молитва предкам" },
  "greek-child-naming-001": { en: "Prayer at a child's naming", ru: "Молитва при наречении имени" },
  "livy-scipio-001": { en: "Scipio's prayer before sailing to Africa", ru: "Молитва Сципиона перед отплытием в Африку" },
  "lucan-mars-001": { en: "A prayer for war against strangers", ru: "Молитва о войне с чужими" },
  "greek-mousaios-001": { en: "The Prayer of Musaeus", ru: "Молитва Мусея" },
  "greek-plethon-001": { en: "Plethon's hymn", ru: "Гимн Плифона" },

  // Orphic hymns addressed to one god under a cult epithet. Six of them would
  // otherwise all be headed "Hymn to Dionysus"; the epithet is what tells them
  // apart, and it is what a reader searching for Liknites or Perikionios types.
  "orphic-amphietus-001": { en: "Hymn to Dionysus Amphietes", ru: "Гимн Дионису Амфиету" },
  "orphic-licnitus-001": { en: "Hymn to Dionysus Liknites", ru: "Гимн Дионису Ликниту" },
  "orphic-lysius-001": { en: "Hymn to Dionysus Lysios", ru: "Гимн Дионису Лисию" },
  "orphic-pericionius-001": { en: "Hymn to Dionysus Perikionios", ru: "Гимн Дионису Периклонию" },
  "orphic-trietericus-001": { en: "Hymn to Dionysus Trieterikos", ru: "Гимн Дионису Триетерику" },
  "orphic-dionysus-001": { en: "Hymn to Dionysus Bassareus", ru: "Гимн Дионису Бассарею" },
  "orphic-demeter-001": { en: "Hymn to Demeter of Eleusis", ru: "Гимн Деметре Элевсинской" },
  "orphic-demeter-002": { en: "Hymn to Mother Antaia", ru: "Гимн Матери Антее" },
  "orphic-hermes-chthonios-001": { en: "Hymn to Chthonic Hermes", ru: "Гимн Гермесу Подземному" },

  // Texts that are oaths proper, not prayers containing a vow.
  "virgil-aeneas-oath-001": { en: "The oath of Aeneas and Latinus", ru: "Клятва Энея и Латина" },
  "jupiter-008": { en: "The oath at Canusium", ru: "Клятва при Канузии" },
  "janus-004": { en: "The fetial declaration of war", ru: "Формула фециала при объявлении войны" },
  "juno-004": { en: "Alcmena's oath", ru: "Клятва Алкмены" },
  "vesta-005": { en: "The ordeal of the Vestal Tuccia", ru: "Испытание весталки Туккии" },
  "dionysius-aemilia-001": { en: "The Vestal Aemilia's prayer", ru: "Молитва весталки Эмилии" },
};

type Kind = "hymn" | "prayer";

function kindOf(id: string): Kind {
  return /^(homeric|orphic)-/.test(id) ? "hymn" : "prayer";
}

/** Join up to two names; beyond that only the first is used. */
function addressee(
  deities: string[],
  pick: (n: (typeof DEITY_NAMES)[string]) => string,
  and: string,
  missing: Set<string>,
): string | null {
  const names = deities.map((d) => {
    const entry = DEITY_NAMES[d];
    if (!entry) missing.add(d);
    return entry ? pick(entry) : null;
  });
  if (!names[0]) return null;
  if (deities.length === 2 && names[1]) return `${names[0]} ${and} ${names[1]}`;
  return names[0];
}

function build(
  id: string,
  deities: string[],
  functions: string[],
  missing: Set<string>,
): Title | null {
  const preset = EXCEPTIONS[id];
  if (preset) return preset;

  const en = addressee(deities, (n) => n.en, "and", missing);
  const ru = addressee(deities, (n) => n.dat, "и", missing);
  if (!en || !ru) return null;

  if (kindOf(id) === "hymn") return { en: `Hymn to ${en}`, ru: `Гимн ${ru}` };
  return { en: `Prayer to ${en}`, ru: `Молитва ${ru}` };
}

/** Insert or replace a two-key `title:` block in the frontmatter. */
function setTitle(raw: string, title: Title): string {
  const lines = raw.split("\n");
  const end = lines.indexOf("---", 1);
  if (end < 0) return raw;

  const block = ["title:", `  en: ${JSON.stringify(title.en)}`, `  ru: ${JSON.stringify(title.ru)}`];

  const start = lines.findIndex((l, i) => i < end && /^title:/.test(l));
  if (start >= 0) {
    let stop = start + 1;
    while (stop < end && /^[ \t]+\S/.test(lines[stop])) stop++;
    return [...lines.slice(0, start), ...block, ...lines.slice(stop)].join("\n");
  }
  // Put it straight after slug so the head of the file reads id → slug → title.
  const slug = lines.findIndex((l, i) => i < end && /^slug:/.test(l));
  const at = slug >= 0 ? slug + 1 : 1;
  return [...lines.slice(0, at), ...block, ...lines.slice(at)].join("\n");
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".md")).sort();
  const missing = new Set<string>();
  const failed: string[] = [];
  const samples: string[] = [];
  let written = 0,
    skipped = 0;

  for (const f of files) {
    const id = f.replace(/\.md$/, "");
    const path = join(DIR, f);
    const raw = await readFile(path, "utf8");
    const { data } = matter(raw);

    const existing = data.title as { en?: string; ru?: string } | undefined;
    if (existing?.en && existing?.ru && !FORCE) {
      skipped++;
      continue;
    }

    const title = build(
      id,
      (data.deities ?? []) as string[],
      (data.functions ?? []) as string[],
      missing,
    );
    if (!title) {
      failed.push(id);
      continue;
    }

    const out = setTitle(raw, title);
    if (!DRY && out !== raw) await writeFile(path, out, "utf8");
    written++;
    if (written % 13 === 1) samples.push(`  ${id.padEnd(34)} ${title.en}  |  ${title.ru}`);
  }

  console.log(samples.join("\n"));
  console.log(
    `\n${DRY ? "записал бы" : "записано"}: ${written}   пропущено (уже есть): ${skipped}   без заголовка: ${failed.length}`,
  );
  if (failed.length) console.log(`  не удалось: ${failed.join(", ")}`);
  if (missing.size)
    console.log(`  НЕТ В ТАБЛИЦЕ ИМЁН (${missing.size}): ${[...missing].sort().join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
