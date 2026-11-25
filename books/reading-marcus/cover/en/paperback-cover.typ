// Обложка-развёртка английского paperback для KDP: задняя сторона, корешок, лицевая — одним листом.
// Сборка: npm run book:cover:en  (страниц в блоке передаётся параметром pages)
// KDP: формат 6×9", кремовая бумага, ч/б печать: корешок = страницы × 0.0025"; вылет под обрез 0.125" со всех сторон.

#let pages = int(sys.inputs.at("pages", default: "288"))
#let bleed = 0.125in
#let trim-w = 6in
#let trim-h = 9in
#let spine = pages * 0.0025in
#let full-w = 2 * bleed + 2 * trim-w + spine
#let full-h = 2 * bleed + trim-h

#let paper = rgb("#F7F3EB")   // фон лицевой обложки (снят с cover-ebook.jpg)
#let accent = rgb("#94422A")  // терракота заголовка и панели
#let ink = rgb("#1E1A17")
#let serif = ("EB Garamond", "Gentium Plus")
#let display = ("Cormorant", "EB Garamond")
#let caps(body, size: 1em, track: 0.2em) = text(size: size, tracking: track, upper(body))

#set document(title: "Reading Marcus Aurelius — paperback cover", author: "Ian Mezinskii")
#set page(width: full-w, height: full-h, margin: 0pt, fill: paper)
#set text(font: serif, fill: ink, lang: "en", hyphenate: false)
#set par(justify: false)

// x-координаты (от левого края листа, с вылетом)
#let back-x = bleed
#let spine-x = bleed + trim-w
#let front-x = bleed + trim-w + spine

// ---------- лицевая ----------
// лицевая собрана заранее (make-front.py): обложка электронной книги с плавно продолженным фоном и вылетом
#place(top + left, dx: front-x, dy: 0pt, image("/cover/en/front-print.png", width: trim-w + bleed, height: full-h))

// ---------- корешок: текст сверху вниз (как принято в англоязычных книгах) ----------
#place(top + left, dx: spine-x, dy: bleed,
  box(width: spine, height: trim-h,
    align(center + horizon, rotate(90deg, reflow: true,
      box(width: trim-h - 1in, align(center + horizon, [
        #text(font: display, fill: accent, size: 15pt, weight: "medium", tracking: 0.08em)[READING MARCUS AURELIUS]
        #h(1.4em)
        #text(fill: ink, size: 8.5pt, tracking: 0.3em)[IAN MEZINSKII]
      ]))))))

// ---------- задняя: аннотация; правый нижний угол свободен под штрих-код KDP (2" × 1.2") ----------
#place(top + left, dx: back-x + 0.6in, dy: bleed + 0.95in, box(width: trim-w - 1.2in, {
  set par(leading: 0.66em, spacing: 1.15em, justify: true)
  set text(size: 12.5pt, hyphenate: true)
  align(center, text(font: display, fill: accent, size: 26pt, weight: "medium", hyphenate: false)[
    What if the #emph[Meditations] were never meant to be read?])
  v(0.45in)
  [Marcus Aurelius wrote his notes for himself alone. He called them #emph[hypomnemata], “reminders”: short exercises written to steady his own mind against anger, fear, weariness and vanity. Read straight through like an ordinary book, they seem a scattering of repeated maxims. Read as Marcus used them, they become a practice.]
  parbreak()
  [#emph[Reading Marcus Aurelius] is a companion to the #emph[Meditations] built on this idea, which Pierre Hadot developed in #emph[The Inner Citadel]. It gives the complete text in George Long’s classic translation, book by book, with commentary on 107 key passages, a Stoic exercise for each of the twelve books, and a map of the doctrines and practices with every passage where each appears.]
  parbreak()
  [No knowledge of Greek or of Stoic philosophy is needed. The book is meant to be read slowly, a passage or two at a time, by anyone who wants not only to admire Marcus Aurelius but to do what he did.]
  v(0.45in)
  align(center, line(length: 0.9in, stroke: 0.7pt + accent))
  v(0.12in)
  align(center, text(size: 10pt, fill: accent, tracking: 0.14em)[READAURELIUS.ORG])
}))

// ---------- служебная разметка (только в пробной сборке: --input guides=1) ----------
#if sys.inputs.at("guides", default: "0") == "1" {
  let g = 0.4pt + rgb("#00A0E0")
  place(top + left, dx: bleed, dy: bleed, rect(width: full-w - 2 * bleed, height: trim-h, stroke: g))
  place(top + left, dx: spine-x, dy: 0pt, line(start: (0pt, 0pt), end: (0pt, full-h), stroke: g))
  place(top + left, dx: front-x, dy: 0pt, line(start: (0pt, 0pt), end: (0pt, full-h), stroke: g))
  // зона штрих-кода
  place(top + left, dx: spine-x - 0.25in - 2in, dy: bleed + trim-h - 0.25in - 1.2in,
    rect(width: 2in, height: 1.2in, stroke: 0.6pt + red))
}
