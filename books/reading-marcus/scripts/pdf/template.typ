// Оформление PDF-версии «Читая Марка Аврелия». Образец: «The 48 Laws of Power», «The Concise Mastery» (Profile Books):
// один акцентный цвет, заметки на внешнем поле, разреженные прописные в заголовках, колонтитул внизу.
// Формат страницы задаётся параметром format (см. formats ниже).

#import "@preview/marginalia:0.3.1" as marginalia: note

// для печати: build-pdf.mjs --print подставляет чёрный акцент и запас под обрез
#let print = sys.inputs.at("print", default: "0") == "1"
#let accent = if print { luma(25%) } else { rgb("#8A4535") }
#let ink = rgb("#1E1A17")
#let serif = ("EB Garamond", "Gentium Plus")
#let display = ("Cormorant", "EB Garamond", "Gentium Plus")

// сноски: короткие на внешнем поле, длинные внизу страницы; номер общий, его даёт сборщик
#let notemark(n) = text(fill: accent, size: 6.8pt, weight: "semibold", baseline: -0.32em, str(n))
#let sn(n, body) = [#notemark(n)#note(counter: none,
  text-style: (size: 7.2pt, style: "italic", fill: accent),
  par-style: (spacing: 0.35em, leading: 0.36em, hanging-indent: 0pt, justify: false, first-line-indent: 0pt),
)[#text(style: "normal", weight: "semibold", str(n))#h(0.25em)#body]]
#let fnote(n, body) = footnote(numbering: (..) => str(n), body)

// разреженные прописные (кириллических капителей в шрифте нет)
#let caps(body, size: 0.82em, track: 0.14em) = text(size: size, tracking: track, upper(body))

// Форматы: ridero — A5 145×205 мм (русское издание), kdp — 6×9 дюймов 152×229 мм (Amazon KDP и западные площадки).
// build-pdf.mjs --format ridero|kdp
#let formats = (
  ridero: (w: 145mm, h: 205mm, inner: 15mm, far: 5mm, note: 31mm, sep: 4mm, top: 16mm, bottom: 19mm, size: 10pt),
  kdp: (w: 152mm, h: 229mm, inner: 16mm, far: 6mm, note: 34mm, sep: 4mm, top: 18mm, bottom: 22mm, size: 10.5pt),
)
#let fmt = formats.at(sys.inputs.at("format", default: "ridero"))

#let book(body) = {
  set document(title: "Читая Марка Аврелия", author: "Ян Мезинский")
  set page(width: fmt.w, height: fmt.h)
  show: marginalia.setup.with(
    inner: (far: fmt.inner, width: 0mm, sep: 0mm),
    outer: (far: fmt.far, width: fmt.note, sep: fmt.sep),
    top: fmt.top,
    bottom: fmt.bottom,
    book: true,
    clearance: 4pt,
  )
  set text(font: serif, size: fmt.size, lang: "ru", fill: ink, hyphenate: true)
  set smartquote(enabled: false)
  set par(justify: true, leading: 0.62em, spacing: 0.62em, first-line-indent: 1.2em)
  set quote(block: true)
  show quote.where(block: true): it => pad(left: 1.2em, y: 0.3em, text(style: "italic", it.body))
  show link: it => it
  show footnote: it => text(fill: accent, weight: "semibold", it)
  set footnote.entry(separator: line(length: 25%, stroke: 0.4pt + accent), gap: 0.4em, clearance: 0.9em)
  show footnote.entry: it => {
    set text(size: 7.6pt, style: "italic", fill: accent)
    set par(first-line-indent: 0pt, leading: 0.42em, justify: true)
    it
  }
  set list(indent: 0.6em, body-indent: 0.5em, marker: text(fill: accent)[•])

  // колонтитул внизу: «КНИГА IV │ 57» справа на нечётной, «57 │ КНИГА IV» слева на чётной
  set page(footer: context {
    let p = here().page()
    let opener = query(<chapter-open>).any(m => m.location().page() == p)
    // пустой оборот перед главой: следующая страница открывает главу, а текст кончился раньше
    let blank = query(<chapter-open>).any(m => m.location().page() == p + 1) and not query(<chapter-end>).any(m => m.location().page() == p)
    if blank { return }
    let marks = query(selector(<running>).before(here()))
    let name = if marks.len() > 0 { marks.last().value } else { none }
    let num = text(fill: accent, style: "italic", size: 10pt, counter(page).display())
    let bar = box(height: 0.9em, stroke: (left: 0.4pt + luma(60%)), inset: 0pt)
    set text(size: 8pt)
    if opener or name == none {
      align(if calc.odd(p) { right } else { left }, num)
    } else if calc.odd(p) {
      align(right, [#text(fill: accent, caps(name)) #h(0.6em) #bar #h(0.6em) #num])
    } else {
      align(left, [#num #h(0.6em) #bar #h(0.6em) #text(fill: accent, caps(name))])
    }
  })
  body
}

// ---------- содержание ----------
#let toc-entry(kicker, title, target) = {
  let pg = if target == none { [] } else { context [#h(0.35em)#text(style: "italic", size: 0.9em, fill: accent, str(counter(page).at(target).first()))] }
  let lines = (align(center, [#text(fill: accent, caps(kicker, size: 0.85em))#pg]),)
  if title != none { lines.push(align(center, text(caps(title, size: 0.9em, track: 0.08em)))) }
  block(width: 100%, above: 0pt, below: 0pt, stack(dir: ttb, spacing: 0.45em, ..lines))
  v(1.15em)
}
#let toc-band(title) = block(width: 100%, fill: accent.lighten(80%), inset: (y: 0.55em), above: 1.1em, below: 0.9em,
  align(center, text(caps(title, size: 0.95em, track: 0.18em))))
#let toc-page(body) = {
  [#metadata(none) <chapter-end>]
  pagebreak(to: "odd", weak: true)
  [#metadata(none) <chapter-open>]
  set par(first-line-indent: 0em, justify: false, leading: 0.5em)
  align(center, text(fill: accent, caps([Содержание], size: 1.05em, track: 0.2em)))
  v(1.2em)
  body
}

// ---------- глава ----------
// начало главы: с нечётной страницы; «КНИГА», большая римская цифра, название, затем «Линия главы» курсивом
#let chapter(label-id, roman, title, running, line) = {
  [#metadata(none) <chapter-end>]
  pagebreak(to: "odd", weak: true)
  [#metadata(running) <running>]
  [#metadata(roman) <chapter-open>]
  v(10mm)
  set par(first-line-indent: 0em, justify: false)
  align(center)[
    #text(fill: accent, caps([Книга], size: 1em, track: 0.3em)) #label(label-id)
    #v(0.2em)
    #text(font: display, size: 54pt, fill: accent, weight: "medium", roman)
    #if title != none {
      v(1.2em)
      text(font: serif, size: 15pt, tracking: 0.08em, upper(title))
    }
  ]
  v(2.2em)
  text(fill: accent, caps([Линия главы], size: 0.85em, track: 0.12em))
  v(0.2em)
  set par(first-line-indent: 0em, spacing: 0.9em)
  text(style: "italic", size: 10.5pt, line)
  pagebreak()
}

// раздел внутри главы: «ВСТУПЛЕНИЕ», «ГЛАВНОЕ В КНИГЕ»
#let part(title) = block(above: 1.6em, below: 1.1em, sticky: true,
  text(fill: accent, caps(title, size: 0.88em, track: 0.14em)))

// номер фрагмента: держится со следующим абзацем
#let frag(num, label-id) = [#block(above: 1.3em, below: 0.45em, sticky: true,
  text(fill: accent, size: 9.5pt, tracking: 0.06em, weight: "semibold", num))#label(label-id)]

#let commentary-label = block(above: 1.1em, below: 0.85em, sticky: true,
  text(fill: accent, caps([Комментарий], size: 0.8em, track: 0.16em)))

// «Главное в книге»: отдельный блок цвета акцента, как «Image»/«Authority» у Грина
#let glavnoe(body) = {
  v(1em)
  align(center, text(fill: accent, caps([Главное в книге], size: 0.9em, track: 0.18em)))
  v(0.4em)
  block(inset: (x: 4mm), {
    set par(first-line-indent: 0em, spacing: 0.8em)
    set text(fill: accent)
    body
  })
}

// вступительная страница (введение, приложения): заголовок по центру
#let section-open(label-id, kicker, title, running) = {
  [#metadata(none) <chapter-end>]
  pagebreak(to: "odd", weak: true)
  [#metadata(running) <running>]
  [#metadata(kicker) <chapter-open>]
  v(14mm)
  align(center)[
    #if kicker != none [#text(fill: accent, caps(kicker, size: 0.95em, track: 0.3em)) \ #v(0.6em)]
    #text(font: serif, size: 17pt, tracking: 0.08em, upper(title)) #label(label-id)
  ]
  v(2em)
}

// ---------- начало книги ----------
// обложка: во всю страницу, без колонтитула (в печатной версии обложка отдельным файлом)
#let cover(path) = page(margin: 0pt, footer: none, fill: rgb("#F1ECE2"),
  align(center + horizon, image(path, height: 100%)))

// титул и его оборот
#let titlepage(author, title, subtitle, translator) = page(footer: none, margin: (x: 18mm, top: 18mm, bottom: 22mm), {
  set par(first-line-indent: 0em, justify: false)
  set text(hyphenate: false)
  let big(w) = block(above: 0.25em, below: 0.25em,
    text(font: display, fill: accent, size: 38pt, weight: "medium", tracking: 0.04em, upper(w)))
  v(22mm)
  align(center)[
    #text(caps(author, size: 1em, track: 0.3em))
    #v(16mm)
    #text(fill: accent, size: 13pt, tracking: 0.25em, upper[Читая])
    #v(0.5em)
    #par(leading: 0.45em, text(font: display, fill: accent, size: 38pt, weight: "medium", tracking: 0.04em)[МАРКА  АВРЕЛИЯ])
    #v(0.6em)
    #v(0.4em)
    #line(length: 22mm, stroke: 0.7pt + accent)
    #v(0.4em)
    #text(style: "italic", size: 12pt, subtitle)
    #v(1fr)
    #text(size: 9pt, translator)
  ]
  v(12mm)
})
#let colophon(body) = page(footer: none, {
  set par(first-line-indent: 0em, justify: false, spacing: 0.9em)
  set text(size: 8.5pt)
  v(1fr)
  body
})


// ---------- приложения ----------
#let entry-head(body) = block(above: 1.15em, below: 0.55em, sticky: true, text(weight: "semibold", body))
#let entry-head-id(id, body) = [#entry-head(body)#label(id)]
#let places(n, body) = block(above: 0.4em, {
  set par(first-line-indent: 0em, justify: false)
  set text(size: 9pt)
  [#text(fill: accent, caps([Места], size: 0.85em, track: 0.1em)) (#n): #body]
})

// ---------- навигация на полях ----------
// напротив «Догматы.»: на какой странице карты практики разобраны эти догматы
#let dogmaref(slugs) = note(counter: none, shift: "avoid",
  text-style: (size: 7.2pt, style: "italic", fill: accent),
  par-style: (spacing: 0.4em, leading: 0.36em, hanging-indent: 0pt, justify: false, first-line-indent: 0pt),
  context {
    let pages = slugs.map(s => label("d-" + s)).map(l => (l, counter(page).at(l).first()))
    let seen = ()
    let parts = ()
    for (l, p) in pages.sorted(key: x => x.at(1)) {
      if p in seen { continue }
      seen.push(p)
      parts.push(if print { str(p) } else { link(l, str(p)) })
    }
    [Карта практики, #if parts.len() > 1 [с.] else [с.] #parts.join(", ")]
  })
