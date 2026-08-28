/**
 * source-note.ts — write `note:` into a card's `source:` frontmatter block.
 *
 * Shared by set-original.ts (which records the note as it inserts a text) and
 * restore-source-notes.ts (which back-filled the notes that an earlier version
 * of set-original.ts only printed to the console and never saved).
 *
 * The note is the audit trail: which edition, which scan, which OCR slips were
 * corrected, what was normalised, where the English diverges from the original.
 * It is the single most valuable thing the corpus carries beyond the texts
 * themselves, so it belongs in the card, under version control — not in a
 * console log.
 *
 * Written as a FOLDED BLOCK SCALAR (`>-`), never a quoted scalar. The notes are
 * full of colons, guillemets, apostrophes and square brackets; every quoting
 * style would need its own escaping and one missed case corrupts the
 * frontmatter. Inside a block scalar nothing needs escaping at all.
 *
 * Operates on lines rather than one big regex. The frontmatter-surgery bugs in
 * this repo have all come from `\s*` in a multiline pattern eating the newline
 * before the next key and swallowing it; splitting into lines makes the
 * boundary explicit instead of implicit.
 */

/** True for a line that belongs to the `source:` block: indented, non-empty. */
const isChild = (l: string): boolean => /^[ \t]+\S/.test(l)

/** True for a direct child key of `source:`, e.g. "  author: Ovid". */
const isChildKey = (l: string): boolean => /^ {2}\S/.test(l)

export function setSourceNote(raw: string, note: string): string {
  const oneLine = note.replace(/\s+/g, ' ').trim()
  if (!oneLine) return raw

  const lines = raw.split('\n')
  const start = lines.findIndex(l => /^source:[ \t]*$/.test(l))
  if (start < 0) return raw

  // Find the end of the block: the first line after `source:` that is not
  // indented. A blank line inside frontmatter would end it too, which is what
  // we want — `note:` must stay inside the mapping.
  let end = start + 1
  while (end < lines.length && isChild(lines[end])) end++

  const body = lines.slice(start + 1, end)

  // Drop an existing note: its own line plus any continuation lines, which are
  // indented deeper than a sibling key and so are not matched by isChildKey.
  const kept: string[] = []
  let skipping = false
  for (const l of body) {
    if (/^ {2}note:/.test(l)) { skipping = true; continue }
    if (skipping && !isChildKey(l)) continue
    skipping = false
    kept.push(l)
  }

  const block = [...kept, '  note: >-', `    ${oneLine}`]
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n')
}
