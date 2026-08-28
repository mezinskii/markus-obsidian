/**
 * fix-sections.ts — turn `source.section` back into a locator.
 *
 * `section` should say where in the work the passage is, and nothing else. In
 * 98 cards it had grown English prose instead — "2 (to Demeter), opening and
 * closing" — which then showed up inside the Russian page title, and which
 * duplicated what `deities`, the card title, the `[…]` seams and the
 * commentary already say.
 *
 * Only prose that is genuinely redundant is removed. Left alone:
 *
 *  · the LABRYS handbook and Ritus Carmentis (~50 cards), where the English
 *    phrase IS the locator — those books have named sections and no page
 *    numbers, and a translated section name would not find the text;
 *  · Latin tags on inscriptions — "Iuno Regina", "Iuppiter O.M.",
 *    "CX matres familias", "Praefatio" — which read the same in both languages
 *    and are the only thing distinguishing four prayers cut on one stone.
 *
 * Usage: npx tsx antique-prayers/scripts/fix-sections.ts [--dry]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prayers");
const DRY = process.argv.includes("--dry");

/** Cards fixed by hand, because no rule would produce the right locator. */
const OVERRIDES: Record<string, string> = {
  // The card holds lines 23-29 of the Precatio Terrae; "herbal prayer" was a
  // description, not a place.
  "tellus-002": "23-29",
  // The work field already names the text; the phrase added nothing.
  "hippocrates-oath-001": "",
  // Work is "Hymn to Priapus, CIL XIV 3565" — the findspot is in source.note.
  "agathemerus-priapus-001": "",
  // Work is "Carmen Arvalium (CIL VI 2104)"; the date is in source.note.
  "arvales-carmen-001": "",
};

function fix(id: string, section: string): string | null {
  if (id in OVERRIDES) {
    const next = OVERRIDES[id];
    return next === section ? null : next;
  }

  // "2 (to Demeter), opening and closing" · "Homeric Hymns 28 (to Athena)"
  // · "4 (to Hermes), excerpts"  →  the hymn number alone.
  const hymn = section.match(/^(?:Homeric Hymns\s+)?(\d+)\s*\(to .*/i);
  if (hymn) return hymn[1];

  // "Fragment 937" → "fr. 937": the same abbreviation is used in both
  // scholarly traditions, so it needs no translating.
  const frag = section.match(/^Fragment\s+(\d+)$/i);
  if (frag) return `fr. ${frag[1]}`;

  return null;
}

/** Replace the `section:` line inside the `source:` block, or drop it. */
function setSection(raw: string, value: string): string {
  const lines = raw.split("\n");
  const end = lines.indexOf("---", 1);
  if (end < 0) return raw;

  const start = lines.findIndex((l, i) => i < end && /^source:[ \t]*$/.test(l));
  if (start < 0) return raw;

  let stop = start + 1;
  while (stop < end && /^[ \t]+\S/.test(lines[stop])) stop++;

  const at = lines.findIndex(
    (l, i) => i > start && i < stop && /^ {2}section:/.test(l),
  );
  if (at < 0) return raw;

  if (!value) {
    return [...lines.slice(0, at), ...lines.slice(at + 1)].join("\n");
  }
  return [
    ...lines.slice(0, at),
    `  section: ${JSON.stringify(value)}`,
    ...lines.slice(at + 1),
  ].join("\n");
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".md")).sort();
  const changes: string[] = [];

  for (const f of files) {
    const id = f.replace(/\.md$/, "");
    const path = join(DIR, f);
    const raw = await readFile(path, "utf8");
    const { data } = matter(raw);
    const section = String(
      (data.source as Record<string, unknown>)?.section ?? "",
    );
    if (!section && !(id in OVERRIDES)) continue;

    const next = fix(id, section);
    if (next === null) continue;

    const out = setSection(raw, next);
    if (out === raw) continue;
    if (!DRY) await writeFile(path, out, "utf8");
    changes.push(`  ${id.padEnd(34)} «${section}»  →  «${next}»`);
  }

  console.log(changes.join("\n"));
  console.log(`\n${DRY ? "исправил бы" : "исправлено"}: ${changes.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
