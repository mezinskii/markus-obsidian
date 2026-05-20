/**
 * markdownToPortableText.ts
 *
 * Converts the Obsidian-flavor markdown we use in the Marcus vault into
 * Sanity Portable Text blocks.
 *
 * Handles:
 *  - paragraphs, headings (## h2, ### h3, #### h4)
 *  - bullet / numbered lists (nested levels supported)
 *  - strong (**), em (*), inline code (`)
 *  - external links [text](url) — produce `link` annotation
 *  - wiki-links [[id|alias]] — resolved against a slug-to-type registry,
 *    produce `crossRef` annotation pointing to the target document
 *  - inline footnote refs [^id] — produce `footnoteRef` annotation
 *  - footnote definitions [^id]: body — extracted and returned separately,
 *    body recursively converted to Portable Text
 *
 * Does NOT handle: tables, blockquotes, raw HTML, definition lists,
 * frontmatter (assumed already stripped).
 */

import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type TargetType =
  | 'term'
  | 'dogma'
  | 'exercise'
  | 'motif'
  | 'person'
  | 'place'
  | 'passageCard'

export type Registry = Map<string, TargetType>

export interface PTSpan {
  _key: string
  _type: 'span'
  text: string
  marks: string[]
}

export interface PTMarkDef {
  _key: string
  _type: string
  // shape depends on _type:
  //   crossRef   -> { target: { _type: 'reference', _ref: '<type>.<slug>' } }
  //   footnoteRef -> { key: string }
  //   link       -> { href: string }
  [key: string]: unknown
}

export interface PTBlock {
  _key: string
  _type: 'block'
  style: string
  listItem?: 'bullet' | 'number'
  level?: number
  markDefs: PTMarkDef[]
  children: PTSpan[]
}

export interface PTFootnote {
  key: string
  body: PTBlock[]
}

export interface ConvertResult {
  blocks: PTBlock[]
  footnotes: PTFootnote[]
}

// ────────────────────────────────────────────────────────────────────────────
// Key generation
// ────────────────────────────────────────────────────────────────────────────

let keyCounter = 0
const nextKey = (prefix: string): string => `${prefix}${(++keyCounter).toString(36)}`

// ────────────────────────────────────────────────────────────────────────────
// Pre-processing
// ────────────────────────────────────────────────────────────────────────────

const URL_SCHEME_XREF = 'xref://'
const URL_SCHEME_FN = 'fn://'

interface PreprocessResult {
  text: string
  rawFootnotes: Record<string, string>
}

/**
 * Pre-process raw markdown:
 *   1. Pull out `[^id]: definition` lines into a separate map.
 *   2. Replace `[[id|alias]]` and `[[id]]` with `[alias](xref://id)`.
 *   3. Replace inline `[^id]` with `[](fn://id)` (empty link text).
 */
const preprocess = (input: string): PreprocessResult => {
  const rawFootnotes: Record<string, string> = {}

  // Footnote definitions: single-line for now.
  let text = input.replace(
    /^\[\^([^\]]+)\]:[ \t]*(.+?)[ \t]*$/gm,
    (_match, key: string, body: string) => {
      rawFootnotes[key.trim()] = body.trim()
      return ''
    },
  )

  // Wiki-links inside a backticked code span — substitute the WHOLE span with
  // the alias text wrapped in backticks (drop the link). markdown-it does not
  // parse markdown syntax inside code spans, so converting these to
  // `[alias](xref://id)` would leave raw markdown leaking through. Authors who
  // write `` `[[term|alias]]` `` mean "render this term name as code"; the link
  // to the entity page is redundant with the related-concepts sidebar.
  text = text.replace(
    /`\[\[([^|\]\n]+?)(?:\|([^\]\n]+?))?\]\]`/g,
    (_match, rawId: string, rawAlias?: string) => {
      const alias = (rawAlias ?? rawId).trim()
      return `\`${alias}\``
    },
  )

  // Wiki-links: [[id|alias]] or [[id]]
  text = text.replace(
    /\[\[([^|\]\n]+?)(?:\|([^\]\n]+?))?\]\]/g,
    (_match, rawId: string, rawAlias?: string) => {
      const id = rawId.trim()
      const alias = (rawAlias ?? rawId).trim()
      // Encode parts that confuse markdown link parsing
      const encodedId = encodeURIComponent(id)
      // Alias may contain markdown formatting — preserve it literally.
      // We escape only the closing bracket to keep the link well-formed.
      const safeAlias = alias.replace(/]/g, '\\]')
      return `[${safeAlias}](${URL_SCHEME_XREF}${encodedId})`
    },
  )

  // Inline footnote refs: [^id] -> link with a zero-width-space placeholder
  // text. CommonMark allows empty link text, but markdown-it then emits a
  // link_open/link_close pair with no inline tokens between, so the inline
  // walker never creates a span carrying the footnoteRef mark — the marker
  // ends up "orphaned" and the renderer falls back to appending it at the
  // block end. Inserting a ZWSP gives the walker a real (invisible) span to
  // attach the mark to; the <sup>N</sup> then renders precisely where the
  // [^id] sat in the source text.
  text = text.replace(/\[\^([^\]\n]+)\]/g, (_match, key: string) => {
    const encoded = encodeURIComponent(key.trim())
    return `[​](${URL_SCHEME_FN}${encoded})`
  })

  // Collapse blank-line runs created by removed footnote defs
  text = text.replace(/\n{3,}/g, '\n\n')

  return {text, rawFootnotes}
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown-it instance
// ────────────────────────────────────────────────────────────────────────────

const md = new MarkdownIt({
  html: false, // no raw HTML
  linkify: false, // do not autolink bare URLs
  typographer: false, // keep punctuation literal
  breaks: false, // single \n is not a hard break
})

// ────────────────────────────────────────────────────────────────────────────
// Inline walker
// ────────────────────────────────────────────────────────────────────────────

interface InlineCtx {
  markDefs: PTMarkDef[]
  registry: Registry
  warnings: string[]
}

const inlineTokensToSpans = (tokens: readonly Token[], ctx: InlineCtx): PTSpan[] => {
  const spans: PTSpan[] = []
  const activeMarks: string[] = []

  const emit = (text: string): void => {
    if (text.length === 0) return
    spans.push({
      _key: nextKey('s'),
      _type: 'span',
      text,
      marks: [...activeMarks],
    })
  }

  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        emit(tok.content)
        break
      case 'strong_open':
        activeMarks.push('strong')
        break
      case 'strong_close':
        // pop the last 'strong' (assumes well-formed input)
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          if (activeMarks[i] === 'strong') {
            activeMarks.splice(i, 1)
            break
          }
        }
        break
      case 'em_open':
        activeMarks.push('em')
        break
      case 'em_close':
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          if (activeMarks[i] === 'em') {
            activeMarks.splice(i, 1)
            break
          }
        }
        break
      case 's_open': // strikethrough not enabled, but defend
      case 's_close':
        break
      case 'code_inline':
        spans.push({
          _key: nextKey('s'),
          _type: 'span',
          text: tok.content,
          marks: [...activeMarks, 'code'],
        })
        break
      case 'softbreak':
      case 'hardbreak':
        emit('\n')
        break
      case 'link_open': {
        const href = tok.attrGet('href') ?? ''
        if (href.startsWith(URL_SCHEME_XREF)) {
          const id = decodeURIComponent(href.slice(URL_SCHEME_XREF.length))
          const targetType = ctx.registry.get(id)
          if (targetType) {
            const markKey = nextKey('m')
            ctx.markDefs.push({
              _key: markKey,
              _type: 'crossRef',
              target: {_type: 'reference', _ref: `${targetType}.${id}`},
            })
            activeMarks.push(markKey)
          } else {
            ctx.warnings.push(`unresolved wiki-link: [[${id}]]`)
            // push a no-op mark so close still pops cleanly
            activeMarks.push('__unresolved')
          }
        } else if (href.startsWith(URL_SCHEME_FN)) {
          const key = decodeURIComponent(href.slice(URL_SCHEME_FN.length))
          const markKey = nextKey('m')
          ctx.markDefs.push({
            _key: markKey,
            _type: 'footnoteRef',
            key,
          })
          activeMarks.push(markKey)
        } else {
          const markKey = nextKey('m')
          ctx.markDefs.push({
            _key: markKey,
            _type: 'link',
            href,
          })
          activeMarks.push(markKey)
        }
        break
      }
      case 'link_close': {
        const last = activeMarks.pop()
        if (last === '__unresolved') {
          // already removed; nothing else to do
        }
        break
      }
      default:
        // ignore unsupported inline tokens (image, html_inline, etc.)
        break
    }
  }

  // Merge adjacent spans that share identical marks.  This keeps the
  // resulting PT compact (Sanity Studio displays it cleaner).
  const merged: PTSpan[] = []
  for (const span of spans) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      prev.marks.length === span.marks.length &&
      prev.marks.every((m, i) => m === span.marks[i])
    ) {
      prev.text += span.text
    } else {
      merged.push(span)
    }
  }
  return merged.filter((s) => s.text.length > 0 || s.marks.length > 0)
}

// ────────────────────────────────────────────────────────────────────────────
// Block walker
// ────────────────────────────────────────────────────────────────────────────

interface ListFrame {
  type: 'bullet' | 'number'
  level: number
}

const HEADING_STYLE: Record<string, string> = {
  h1: 'h2', // demote h1 → h2 (page title comes from elsewhere)
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'normal',
  h6: 'normal',
}

const walkTokens = (
  tokens: Token[],
  registry: Registry,
  warnings: string[],
): PTBlock[] => {
  const blocks: PTBlock[] = []
  const listStack: ListFrame[] = []
  let inBlockquote = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok.type === 'heading_open') {
      const inlineTok = tokens[i + 1]
      const markDefs: PTMarkDef[] = []
      const children =
        inlineTok?.type === 'inline'
          ? inlineTokensToSpans(inlineTok.children ?? [], {markDefs, registry, warnings})
          : []
      blocks.push({
        _key: nextKey('b'),
        _type: 'block',
        style: HEADING_STYLE[tok.tag] ?? 'normal',
        markDefs,
        children,
      })
      i += 2 // skip inline + heading_close
      continue
    }

    if (tok.type === 'paragraph_open') {
      const inlineTok = tokens[i + 1]
      const markDefs: PTMarkDef[] = []
      const children =
        inlineTok?.type === 'inline'
          ? inlineTokensToSpans(inlineTok.children ?? [], {markDefs, registry, warnings})
          : []
      const inList = listStack[listStack.length - 1]
      const block: PTBlock = {
        _key: nextKey('b'),
        _type: 'block',
        style: inBlockquote > 0 ? 'blockquote' : 'normal',
        markDefs,
        children,
      }
      if (inList) {
        block.listItem = inList.type
        block.level = inList.level
      }
      blocks.push(block)
      i += 2
      continue
    }

    if (tok.type === 'bullet_list_open') {
      listStack.push({type: 'bullet', level: listStack.length + 1})
      continue
    }
    if (tok.type === 'ordered_list_open') {
      listStack.push({type: 'number', level: listStack.length + 1})
      continue
    }
    if (tok.type === 'bullet_list_close' || tok.type === 'ordered_list_close') {
      listStack.pop()
      continue
    }

    if (tok.type === 'blockquote_open') {
      inBlockquote++
      continue
    }
    if (tok.type === 'blockquote_close') {
      inBlockquote--
      continue
    }

    if (tok.type === 'fence' || tok.type === 'code_block') {
      blocks.push({
        _key: nextKey('b'),
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _key: nextKey('s'),
            _type: 'span',
            text: tok.content.trimEnd(),
            marks: ['code'],
          },
        ],
      })
      continue
    }

    // list_item_open / list_item_close are bracketing; paragraphs inside
    // already handle listItem/level via the listStack.  Skip them.
    // hr (thematic_break), tables, html_block — ignored.
  }

  return blocks
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export const markdownToPortableText = (
  source: string,
  registry: Registry,
  warnings: string[] = [],
): ConvertResult => {
  const {text, rawFootnotes} = preprocess(source)

  const tokens = md.parse(text, {})
  const blocks = walkTokens(tokens, registry, warnings)

  const footnotes: PTFootnote[] = Object.entries(rawFootnotes).map(([key, body]) => {
    // Recursive conversion: a footnote body may contain wiki-links.
    // We do not allow nested footnote definitions inside a footnote body.
    const inner = markdownToPortableText(body, registry, warnings)
    if (inner.footnotes.length > 0) {
      warnings.push(`nested footnote definitions ignored inside [^${key}]`)
    }
    return {key, body: inner.blocks}
  })

  return {blocks, footnotes}
}

/** Convert a markdown body that should NOT contain any footnote definitions. */
export const markdownToPortableTextBlocks = (
  source: string,
  registry: Registry,
  warnings: string[] = [],
): PTBlock[] => markdownToPortableText(source, registry, warnings).blocks
