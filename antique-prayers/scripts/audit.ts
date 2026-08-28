/**
 * audit.ts — cross-check the commentary layer against the rest of each card.
 *
 * Written after the commentary pass closed (all 317 cards, ru+en) to find the
 * kinds of error a human proof-read misses: a cross-reference to a card that
 * does not exist, a Greek or Latin phrase quoted in the commentary that is not
 * in that card's Оригинал, a claim about provenance that contradicts the
 * frontmatter, a paragraph copied between cards.
 *
 * Everything here is a *suspicion*, not a verdict — several checks have known
 * false positives (a commentary may legitimately quote a neighbouring card's
 * text, or a word in an oblique case). Triage by hand.
 *
 * Run: npx tsx antique-prayers/scripts/audit.ts [--only A,B,C]
 */
import {readdir, readFile} from 'node:fs/promises'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import matter from 'gray-matter'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prayers')

const only = (() => {
  const i = process.argv.indexOf('--only')
  return i < 0 ? null : new Set(process.argv[i + 1].split(',').map(s => s.trim().toUpperCase()))
})()
const want = (k: string) => !only || only.has(k)

type Card = {
  id: string
  file: string
  fm: Record<string, any>
  orig: string
  ru: string
  en: string
  cru: string
  cen: string
}

function section(body: string, h: string): string {
  const m = body.match(new RegExp(`## ${h}\\n([\\s\\S]*?)(?=\\n## |$)`))
  return (m?.[1] ?? '').trim()
}

/** Fold Greek to bare lowercase letters: strip diacritics, final sigma, punctuation. */
function foldGreek(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ᷀-᷿]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^Ͱ-Ͽ]/g, '')
}

/** Fold Latin: lowercase, u=v, i=j, drop everything else. */
function foldLatin(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[uv]/g, 'v')
    .replace(/[ij]/g, 'i')
    .replace(/[^a-z]/g, '')
}

const GREEK_RE = /[Ͱ-Ͽἀ-῿]/
const CYRIL_RE = /[Ѐ-ӿ]/

async function load(): Promise<Card[]> {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()
  const out: Card[] = []
  for (const f of files) {
    const text = await readFile(join(DIR, f), 'utf8')
    const {data, content} = matter(text)
    out.push({
      id: f.replace(/\.md$/, ''),
      file: f,
      fm: data as Record<string, any>,
      orig: section(content, 'Оригинал'),
      ru: section(content, 'Русский'),
      en: section(content, 'Английский'),
      cru: section(content, 'Комментарий'),
      cen: section(content, 'Commentary'),
    })
  }
  return out
}

function report(tag: string, title: string, rows: string[]) {
  if (!want(tag)) return
  console.log(`\n=== ${tag}. ${title} — ${rows.length}`)
  for (const r of rows) console.log('  ' + r)
}

async function main() {
  const cards = await load()
  const byId = new Map(cards.map(c => [c.id, c]))

  // ── A. cross-references point at cards that exist ────────────────────────
  if (want('A')) {
    const rows: string[] = []
    for (const c of cards) {
      const refs = new Set<string>()
      for (const m of (c.cru + '\n' + c.cen).matchAll(/`([a-z0-9][a-z0-9-]{4,})`/g)) {
        const r = m[1]
        if (/^[a-z-]+-\d{3}$/.test(r)) refs.add(r)
      }
      for (const r of refs) {
        if (!byId.has(r)) rows.push(`${c.id}: → ${r} (нет такого файла)`)
        else if (r === c.id) rows.push(`${c.id}: ссылается сама на себя`)
      }
    }
    report('A', 'Битые перекрёстные ссылки', rows)
  }

  // ── B. Greek/Latin quoted in the commentary is present in Оригинал ───────
  if (want('B')) {
    const rows: string[] = []
    for (const c of cards) {
      if (!c.orig) continue
      const gOrig = foldGreek(c.orig)
      const lOrig = foldLatin(c.orig)
      const quotes = [...c.cru.matchAll(/«([^»]{6,120})»/g)].map(m => m[1])
      for (const q of quotes) {
        if (CYRIL_RE.test(q)) continue // a Russian rendering, not a quotation
        const isGreek = GREEK_RE.test(q)
        const folded = isGreek ? foldGreek(q) : foldLatin(q)
        if (folded.length < 6) continue
        const hay = isGreek ? gOrig : lOrig
        if (!hay) continue
        // allow an ellipsis to split the quote into parts
        const parts = q.split(/\s*(?:…|\.\.\.)\s*/).map(p => (isGreek ? foldGreek(p) : foldLatin(p))).filter(p => p.length >= 4)
        const ok = parts.length ? parts.every(p => hay.includes(p)) : hay.includes(folded)
        if (ok) continue
        // Split the miss into two kinds. If every word of the quote does occur
        // in the original but the run does not, the commentary elided or
        // reordered something and says so nowhere — that is a real defect.
        // If words are missing outright, the quote is almost certainly pointing
        // at another card, another edition, or a rejected reading.
        const words = q.split(/[\s,.;:·]+/).filter(w => w.length > 2 && !CYRIL_RE.test(w))
        const folds = words.map(w => (isGreek ? foldGreek(w) : foldLatin(w))).filter(w => w.length >= 3)
        const present = folds.filter(w => hay.includes(w)).length
        const kind = folds.length && present === folds.length ? 'СКЛЕЙКА' : 'внешняя'
        rows.push(`[${kind}] ${c.id}: «${q}» (слов на месте ${present}/${folds.length})`)
      }
    }
    report('B', 'Цитата из оригинала не найдена в самом оригинале', rows)
  }

  // ── C. mixed Cyrillic/Latin inside one word ──────────────────────────────
  if (want('C')) {
    const rows: string[] = []
    for (const c of cards) {
      for (const [label, text] of [
        ['комм.ru', c.cru], ['комм.en', c.cen], ['Русский', c.ru],
        ['Оригинал', c.orig], ['Английский', c.en],
        ['frontmatter', JSON.stringify(c.fm)],
      ] as const) {
        for (const m of text.matchAll(/[\p{L}]{2,}/gu)) {
          const w = m[0]
          const hasCyr = CYRIL_RE.test(w)
          const hasLat = /[a-zA-Z]/.test(w)
          if (hasCyr && hasLat) rows.push(`${c.id} [${label}]: ${w}`)
        }
      }
    }
    report('C', 'Смешанная кириллица с латиницей внутри слова', rows)
  }

  // ── D. ru/en commentary structural parity ────────────────────────────────
  if (want('D')) {
    const rows: string[] = []
    for (const c of cards) {
      const pr = c.cru.split(/\n\s*\n/).filter(s => s.trim()).length
      const pe = c.cen.split(/\n\s*\n/).filter(s => s.trim()).length
      const br = (c.cru.match(/\*\*/g) ?? []).length / 2
      const be = (c.cen.match(/\*\*/g) ?? []).length / 2
      const rr = (c.cru.match(/`[a-z0-9-]+`/g) ?? []).length
      const re_ = (c.cen.match(/`[a-z0-9-]+`/g) ?? []).length
      const bad: string[] = []
      if (pr !== pe) bad.push(`абзацы ${pr}/${pe}`)
      if (br !== be) bad.push(`выделения ${br}/${be}`)
      if (rr !== re_) bad.push(`ссылки ${rr}/${re_}`)
      if (bad.length) rows.push(`${c.id}: ${bad.join(', ')}`)
    }
    report('D', 'Расхождение структуры русского и английского комментария', rows)
  }

  // ── E. commentary claims about provenance vs frontmatter ─────────────────
  if (want('E')) {
    const rows: string[] = []
    for (const c of cards) {
      const p = String(c.fm.provenance ?? '')
      const saysModern = /\*\*Современный текст|\*\*Это современный текст|помета `modern`|`provenance` стоит `modern`/i.test(c.cru)
      const saysUnclear = /provenance` стоит `unclear`|`unclear`/.test(c.cru)
      if (saysModern && p !== 'modern') rows.push(`${c.id}: комментарий говорит «современный», в поле provenance «${p}»`)
      if (saysUnclear && p !== 'unclear') rows.push(`${c.id}: комментарий говорит unclear, в поле provenance «${p}»`)
      if (p === 'modern' && !saysModern) rows.push(`${c.id}: provenance=modern, но комментарий этого не объявляет`)
      if (p === 'unclear' && !/unclear|не установлен|не удалось|сомнител/i.test(c.cru)) rows.push(`${c.id}: provenance=unclear, комментарий молчит`)
    }
    report('E', 'Провенанс: комментарий против фронтматтера', rows)
  }

  // ── F. claims about a missing source.note vs reality ─────────────────────
  if (want('F')) {
    const rows: string[] = []
    for (const c of cards) {
      const note = String(c.fm.source?.note ?? '').trim()
      const claims = /Заметк[аи][^.]{0,60}не сохранил|записан только номер|сверить не по чему|не установлен/i.test(c.cru)
      if (claims && note) rows.push(`${c.id}: комментарий говорит «заметки нет», а note есть`)
      if (!claims && !note && c.orig) rows.push(`${c.id}: оригинал есть, note нет, комментарий не оговаривает`)
    }
    report('F', 'source.note: заявленное против фактического', rows)
  }

  // ── G. paragraphs repeated across cards ──────────────────────────────────
  if (want('G')) {
    const seen = new Map<string, string[]>()
    for (const c of cards) {
      for (const p of c.cru.split(/\n\s*\n/)) {
        const norm = p.replace(/\s+/g, ' ').trim()
        if (norm.length < 120) continue
        const arr = seen.get(norm) ?? []
        arr.push(c.id)
        seen.set(norm, arr)
      }
    }
    const rows = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([p, ids]) => `${ids.join(', ')}: «${p.slice(0, 90)}…»`)
    report('G', 'Один и тот же абзац в нескольких карточках', rows)
  }

  // ── H. section number claimed in the commentary vs frontmatter ───────────
  if (want('H')) {
    const rows: string[] = []
    for (const c of cards) {
      const sec = String(c.fm.source?.section ?? '')
      for (const m of c.cru.matchAll(/исправлен[оа][^.;]{0,80}?на ([0-9IVXивх]+[.\d\-–]*)/gi)) {
        const claimed = m[1].replace(/[–]/g, '-').trim()
        if (claimed.length >= 3 && sec && !sec.replace(/[–]/g, '-').includes(claimed.split('-')[0])) {
          rows.push(`${c.id}: комментарий «исправлено на ${claimed}», в поле section «${sec}»`)
        }
      }
    }
    report('H', 'Заявленное исправление ссылки не отражено в section', rows)
  }

  // ── I. size outliers ─────────────────────────────────────────────────────
  if (want('I')) {
    const rows: string[] = []
    for (const c of cards) {
      if (!c.cru) rows.push(`${c.id}: русский комментарий пуст`)
      else if (c.cru.length < 350) rows.push(`${c.id}: русский комментарий короткий (${c.cru.length})`)
      if (!c.cen) rows.push(`${c.id}: английский комментарий пуст`)
      const ratio = c.cen.length / Math.max(1, c.cru.length)
      if (c.cru && c.cen && (ratio < 0.85 || ratio > 1.6)) {
        rows.push(`${c.id}: ru ${c.cru.length} / en ${c.cen.length} = ${ratio.toFixed(2)}`)
      }
    }
    report('I', 'Аномалии объёма', rows)
  }

  // ── J. Russian keeps the original's line division ────────────────────────
  if (want('J')) {
    const rows: string[] = []
    for (const c of cards) {
      if (!c.orig || !c.ru) continue
      // strip the Orphic fumigation rubric and seam markers before counting
      const clean = (s: string) =>
        s.split('\n')
          .map(l => l.trim())
          .filter(l => l && l !== '[…]' && !/θυμίαμα|воскурение|σπένδε γάλα|возливай молоком/.test(l)).length
      const a = clean(c.orig), b = clean(c.ru)
      if (a !== b) rows.push(`${c.id} [${c.fm.original_lang}]: оригинал ${a} строк, русский ${b}`)
    }
    report('J', 'Членение строк перевода расходится с оригиналом', rows)
  }

  // ── K. every original recorded with a source note ────────────────────────
  if (want('K')) {
    const rows: string[] = []
    for (const c of cards) {
      if (!c.orig) continue
      const note = String(c.fm.source?.note ?? '').trim()
      if (!note) rows.push(`${c.id} [${c.fm.original_lang}] ${c.fm.source?.author ?? '—'} / ${c.fm.source?.work ?? '—'} / ${c.fm.source?.section ?? '—'}`)
    }
    report('K', 'Оригинал есть, заметки об источнике нет', rows)
  }

  console.log('')
}

main().catch(e => { console.error(e); process.exit(1) })
