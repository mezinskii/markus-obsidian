// Преобразование уже собранных XHTML-страниц книги в один файл FictionBook 2.
// Сноски → родной механизм FB2 (<a type="note">, <body name="notes">); ссылки на фрагменты → внутренние l:href.
// В FB2 нет CSS, списков и встроенных шрифтов: комментарий отделяется подзаголовком, пункты списков идут абзацами.

const pad2 = (n) => String(n).padStart(2, '0');

function inner(xhtml) {
  const m = xhtml.match(/<body[^>]*>([\s\S]*)<\/body>/);
  return m ? m[1] : '';
}

// одна страница → разметка FB2 + её сноски
function convert(html, slug, notes) {
  // 1. сноски главы
  html = html.replace(/<section class="chapter-notes">([\s\S]*?)<\/section>\s*/g, (all, body) => {
    for (const a of body.matchAll(/<aside id="note-(\d+)"[^>]*>([\s\S]*?)<\/aside>/g)) {
      const text = a[2].replace(/<a href="#noteref-\d+" class="note-num"[^>]*>[^<]*<\/a>\s*/g, '');
      notes.push({ id: `n-${slug}-${a[1]}`, num: a[1], html: text });
    }
    return '';
  });
  // 1а. страницы со статьями-секциями (карта практики): в FB2 нельзя смешивать абзацы и подсекции,
  // поэтому вступление уходит в <annotation>, а каждая группа «## …» становится своей секцией.
  if (html.includes('<section class="entry"')) {
    const first = html.indexOf('<h2');
    const close = html.lastIndexOf('</section>');
    const headEnd = html.includes('</hgroup>') ? html.indexOf('</hgroup>') : html.indexOf('</h1>');
    if (first > 0 && close > first && headEnd > 0) {
      const endTag = html.slice(headEnd).match(/^<\/(h1|hgroup)>/)[0];
      const headStop = headEnd + endTag.length;
      const intro = html.slice(headStop, first).trim();
      const groups = html.slice(first, close).split(/(?=<h2)/).map((g) => `<section>${g}</section>`).join('\n');
      html = html.slice(0, headStop) + (intro ? `<annotation>${intro}</annotation>` : '') + groups + html.slice(close);
    } else if (first < 0 && headEnd > 0) {
      // без групп (словарь): вступление в <annotation>, дальше одни статьи-секции
      const endTag = html.slice(headEnd).match(/^<\/(h1|hgroup)>/)[0];
      const headStop = headEnd + endTag.length;
      const firstEntry = html.indexOf('<section class="entry"');
      const intro = html.slice(headStop, firstEntry).trim();
      html = html.slice(0, headStop) + (intro ? `<annotation>${intro}</annotation>` : '') + html.slice(firstEntry);
    }
  }
  // 2. заголовки-группы и подписи
  html = html.replace(/<hgroup><p class="book-label">([\s\S]*?)<\/p><h1>([\s\S]*?)<\/h1><\/hgroup>/g, '<h1>$1 $2</h1>');
  html = html.replace(/<p class="label">([\s\S]*?)<\/p>/g, '<subtitle>$1</subtitle>');
  // 3. блоки, которых в FB2 нет
  html = html.replace(/<\/?(div|aside|nav|hgroup)\b[^>]*>/g, '');
  // 4. списки → абзацы
  html = html.replace(/<li>\s*<p>/g, '<p>• ').replace(/<\/p>\s*<\/li>/g, '</p>').replace(/<li>([\s\S]*?)<\/li>/g, '<p>• $1</p>');
  html = html.replace(/<\/?(ul|ol)\b[^>]*>/g, '');
  // 5. строчная разметка
  html = html.replace(/<em>/g, '<emphasis>').replace(/<\/em>/g, '</emphasis>');
  html = html.replace(/<(b|strong)>/g, '<strong>').replace(/<\/(b|strong)>/g, '</strong>');
  html = html.replace(/<span[^>]*>|<\/span>/g, '');
  html = html.replace(/<br\s*\/>/g, '</p><p>');
  html = html.replace(/<blockquote>/g, '<cite>').replace(/<\/blockquote>/g, '</cite>');
  html = html.replace(/<hr\s*\/>/g, '<empty-line/>');
  // 6. ссылки
  html = html.replace(/<a href="#note-(\d+)"[^>]*>([^<]*)<\/a>/g, (a, n, t) => `<a l:href="#n-${slug}-${n}" type="note">[${t}]</a>`);
  html = html.replace(/<a href="[^"#]*\.xhtml#([^"]+)"[^>]*>/g, '<a l:href="#$1">');
  html = html.replace(/<a href="([^"#]*)\.xhtml"[^>]*>/g, '<a l:href="#$1">');
  html = html.replace(/<a href="(https?:[^"]+)"[^>]*>/g, '<a l:href="$1">');
  html = html.replace(/<a href="#([^"]+)"[^>]*>/g, '<a l:href="#$1">');
  // 7. абзацы и секции без классов/ролей
  html = html.replace(/<p\b[^>]*>/g, '<p>');
  html = html.replace(/<section\b[^>]*?(?:\sid="([^"]+)")?[^>]*>/g, (a) => {
    const id = a.match(/\sid="([^"]+)"/);
    return id ? `<section id="${id[1]}">` : '<section>';
  });
  // 8. заголовки: сразу после начала секции → <title>, иначе → <subtitle>
  html = html.replace(/(<section[^>]*>\s*)<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g, '$1<title><p>$2</p></title>');
  html = html.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g, '<subtitle>$1</subtitle>');
  return html.trim();
}

export function buildFb2({ files, meta }) {
  const notes = [];
  const skip = new Set(['cover.xhtml', 'titlepage.xhtml', 'colophon.xhtml', 'nav.xhtml']);
  const sections = [];
  for (const f of files) {
    if (skip.has(f.name)) continue;
    const slug = f.name.replace(/\.xhtml$/, '');
    sections.push(convert(inner(f.content), slug, notes).replace(/^<section(?: id="[^"]*")?>/, `<section id="${slug}">`));
  }
  const colophon = convert(inner(files.find((f) => f.name === 'colophon.xhtml').content), 'colophon', notes)
    .replace(/<section[^>]*>/, '<section id="o-knige"><title><p>О книге</p></title>');
  const notesBody = notes.map((n) => `<section id="${n.id}"><title><p>${n.num}</p></title>${convert(n.html, 'x', [])}</section>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>sci_philosophy</genre>
<author><first-name>${meta.authorFirst}</first-name><last-name>${meta.authorLast}</last-name></author>
<book-title>${meta.title}</book-title>
<annotation><p>${meta.subtitle}. Полный текст «Размышлений» Марка Аврелия в переводе ${meta.translatorGen} с комментарием к ключевым фрагментам.</p></annotation>
<keywords>Марк Аврелий, стоицизм, Размышления, античная философия</keywords>
<date value="${meta.year}-01-01">${meta.year}</date>
<lang>ru</lang>
<src-lang>grc</src-lang>
<translator><first-name>Семён</first-name><middle-name>Миронович</middle-name><last-name>Роговин</last-name></translator>
</title-info>
<document-info>
<author><first-name>${meta.authorFirst}</first-name><last-name>${meta.authorLast}</last-name></author>
<program-used>build-epub.mjs (markus-obsidian)</program-used>
<date value="${meta.isoDate}">${meta.dateStr}</date>
<id>${meta.uid}</id>
<version>1.0</version>
</document-info>
<publish-info>
<book-name>${meta.title}</book-name>
<year>${meta.year}</year>
</publish-info>
</description>
<body>
<title><p>${meta.authorFirst} ${meta.authorLast}</p><p>${meta.title}</p></title>
<epigraph><p>${meta.subtitle}</p></epigraph>
${colophon}
${sections.join('\n')}
</body>
<body name="notes">
<title><p>Примечания</p></title>
${notesBody}
</body>
</FictionBook>
`;
}
