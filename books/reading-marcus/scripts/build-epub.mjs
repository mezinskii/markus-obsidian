// Сборка EPUB 3 книги «Читая Марка Аврелия» из глав vault.
// Запуск: npm run book:epub  →  books/reading-marcus/dist/chitaya-marka-avreliya.epub
// Образец оформления: Standard Ebooks (сквозные примечания с обратными ссылками, nav + toc.ncx, семантика epub:type).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { buildFb2 } from './fb2.mjs';
import { buildLinkMaps, linkify, wrapEntries } from './links.mjs';
import footnote from 'markdown-it-footnote';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BOOK = path.join(ROOT, 'books/reading-marcus/ru');
const PASS = path.join(ROOT, 'marcus-aurelius/passages');
const CORPUS = path.join(ROOT, 'marcus-aurelius');
const OUT_DIR = path.join(ROOT, 'books/reading-marcus/dist');
const OUT = path.join(OUT_DIR, 'chitaya-marka-avreliya.epub');
const LINKS = buildLinkMaps({ BOOK, CORPUS });

const TITLE = 'Читая Марка Аврелия';
const SUBTITLE = '«Размышления» полностью, с комментарием';
const AUTHOR = 'Ян Мезинский';
const TRANSLATOR = 'С. М. Роговина';
const TRANSLATOR_NAME = 'С. М. Роговин';
const YEAR = '2026';
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const APPENDICES = [
  ['pril-a-o-tekste.md', 'o-tekste.xhtml'],
  ['pril-b-slovar.md', 'slovar.xhtml'],
  ['pril-c-imena.md', 'imena.xhtml'],
  ['pril-d-karta-praktiki.md', 'karta-praktiki.xhtml'],
  ['pril-e-hronologiya.md', 'hronologiya.xhtml'],
];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const md = new MarkdownIt({ html: true, xhtmlOut: true, typographer: false, breaks: false }).use(footnote);

// ---------- утилиты ----------
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const fid = (b, m) => `f-${pad(b)}-${pad(m)}`;
const bookFile = (b) => `kniga-${pad(b)}.xhtml`;

// где какой фрагмент: id → файл
const fragmentFile = new Map();
for (let b = 1; b <= 12; b++) {
  for (const f of fs.readdirSync(path.join(PASS, `book ${b}`))) {
    const m = f.match(/^(\d\d)-(\d\d)\.md$/);
    if (m) fragmentFile.set(`${m[1]}-${m[2]}`, bookFile(b));
  }
}

// В Obsidian одиночный перевод строки между строками прозы виден как новый абзац.
// Делаем его настоящим абзацем; списки, цитаты, таблицы, HTML и строки с двумя пробелами в конце (стихи) не трогаем.
function obsidianParagraphs(s) {
  const lines = s.split('\n');
  const special = (l) => /^\s*([-*+]\s|\d+[.)]\s|>|\||#|<|\[\^|!\[\[)/.test(l);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const a = lines[i], b = lines[i + 1];
    if (b === undefined || !a.trim() || !b.trim()) continue;
    if (/ {2}$/.test(a) || special(a) || special(b)) continue;
    out.push('');
  }
  return out.join('\n');
}

// вики-ссылки → markdown-ссылки или текст
function wikiLinks(s) {
  s = obsidianParagraphs(s);
  return s.replace(/\[\[([^\]|#]*)(#\^?([^\]|]*))?(\|([^\]]*))?\]\]/g, (all, target, _h, anchor, _p, alias) => {
    const text = alias ?? target;
    const m = target.match(/^(\d\d)-(\d\d)$/);
    if (m && fragmentFile.has(target)) {
      const label = alias ?? `${+m[1]}.${+m[2]}`;
      return `[${label}](${fragmentFile.get(target)}#${fid(+m[1], +m[2])})`;
    }
    if (target === 'pril-d-karta-praktiki') return `[${text}](karta-praktiki.xhtml${anchor ? '#d-' + anchor : ''})`;
    return text; // термины, люди, догматы корпуса: в книге просто текст
  });
}

// русский текст фрагмента из карточки (с её сносками)
function fragmentText(id) {
  const [b] = id.split('-');
  const t = read(path.join(PASS, `book ${+b}`, `${id}.md`));
  let s = (t.split(/^## Русский\s*$/m)[1] || '').split(/^## /m)[0];
  s = s.replace(/^\*\(пер\.[^)]*\)\*\s*$/m, '').trim();
  // уникальные метки сносок
  s = s.replace(/\[\^(\w+)\]/g, `[^${id}-$1]`);
  return wikiLinks(s);
}

// греческий: lang="grc" для переноса и шрифта
function tagGreek(html) {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (all, tag, text) => {
    if (tag) return tag;
    return text.replace(/[Ͱ-Ͽἀ-῿](?:[Ͱ-Ͽἀ-῿̀-ͯ’ʼ']|\s(?=[Ͱ-Ͽἀ-῿]))*/g,
      (g) => `<span xml:lang="grc" lang="grc">${g}</span>`);
  });
}

// ---------- примечания: всплывающие сноски ----------
// Ссылка epub:type="noteref" ведёт на <aside epub:type="footnote"> в том же файле: Kobo, PocketBook, ONYX,
// KOReader и Apple Books показывают такую сноску окном поверх текста, и читатель остаётся на своей странице.
// Нумерация в каждой главе своя; сами сноски стоят в конце главы (Apple Books их там прячет).
const endnotes = []; // для статистики
function renderWithNotes(src, fileName) {
  let html = md.render(src);
  const notesSec = html.match(/<hr class="footnotes-sep" \/>\s*<section class="footnotes">([\s\S]*?)<\/section>\s*$/);
  const local = new Map(); // номер markdown-it → номер в главе
  const notes = [];
  if (notesSec) {
    html = html.slice(0, notesSec.index);
    for (const li of notesSec[1].matchAll(/<li id="fn(\d+)" class="footnote-item">([\s\S]*?)<\/li>/g)) {
      const n = notes.length + 1;
      local.set(li[1], n);
      const body = li[2].replace(/\s*<a href="#fnref[^"]*" class="footnote-backref">[^<]*<\/a>/g, '').trim();
      notes.push({ n, body });
      endnotes.push(1);
    }
  }
  html = html.replace(/<sup class="footnote-ref"><a href="#fn(\d+)" id="fnref(\d+)(?::(\d+))?">\[[^\]]*\]<\/a><\/sup>/g, (all, a, b, c) => {
    const n = local.get(a);
    const id = c ? `noteref-${n}-${c}` : `noteref-${n}`;
    return `<a href="#note-${n}" id="${id}" class="noteref" epub:type="noteref" role="doc-noteref">${n}</a>`;
  });
  if (notes.length) {
    const asides = notes.map(({ n, body }) => {
      const withNum = body.replace(/^<p>/, `<p><a href="#noteref-${n}" class="note-num" role="doc-backlink">${n}.</a> `);
      return `<aside id="note-${n}" class="footnote" epub:type="footnote" role="doc-footnote">\n${withNum}\n</aside>`;
    }).join('\n');
    html += `\n<section class="chapter-notes">\n<h2 class="notes-title">Примечания</h2>\n${asides}\n</section>\n`;
  }
  return tagGreek(html);
}

// ---------- XHTML-обёртка ----------
function page(title, body, { bodyType = 'bodymatter', cls = '' } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body epub:type="${bodyType}"${cls ? ` class="${cls}"` : ''}>
${body}
</body>
</html>
`;
}

// ---------- главы ----------
const toc = []; // {file, title, children:[{href,title}]}
const commented = []; // {b, m, file}
const files = []; // {name, content, id, props?}

function buildIntro() {
  const { data, content } = matter(read(path.join(BOOK, '00-vvedenie.md')));
  const src = wikiLinks(content).replace(/^### /gm, '## ');
  let body = linkify(renderWithNotes(src, 'vvedenie.xhtml'), { maps: LINKS });
  const children = [];
  let k = 0;
  body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, (a, t) => { const id = `s-${++k}`; children.push({ href: `vvedenie.xhtml#${id}`, title: t.replace(/<[^>]+>/g, '') }); return `<h2 id="${id}">${t}</h2>`; });
  const title = 'Введение';
  files.push({ name: 'vvedenie.xhtml', content: page(title, `<section id="vvedenie" epub:type="introduction" role="doc-introduction">\n<h1>Введение</h1>\n<p class="subtitle">${esc(String(data.title).replace(/^Введение:\s*/, ''))}</p>\n${body}</section>`) });
  toc.push({ file: 'vvedenie.xhtml', title, children });
}

function buildBook(b) {
  const { content } = matter(read(path.join(BOOK, `kniga-${pad(b)}.md`)));
  const file = bookFile(b);
  const parts = content.split(/^## /m);
  let src = '';
  const children = [];
  for (const p of parts) {
    if (!p.trim()) continue;
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl).trim();
    let rest = p.slice(nl + 1);
    const fm = head.match(/^(\d+)\.(\d+)$/);
    if (fm) {
      const m = +fm[2];
      const id = `${pad(b)}-${pad(m)}`;
      rest = rest.replace(/^!\[\[[^\]]*#Русский\]\]\s*$/m, '').trim();
      const hasCom = rest.includes('**Комментарий.**');
      src += `<section class="fragment${hasCom ? ' has-commentary' : ''}" id="${fid(b, m)}">\n<h3 class="fnum">${b}.${m}</h3>\n<div class="marcus">\n\n${fragmentText(id)}\n\n</div>\n`;
      if (hasCom) {
        commented.push({ b, m, file });
        const com = rest.replace(/^\*\*Комментарий\.\*\*\s*/m, '');
        src += `<aside class="commentary" aria-label="Комментарий">\n<p class="label">Комментарий</p>\n\n${wikiLinks(com)}\n\n</aside>\n`;
      }
      src += `</section>\n\n`;
    } else {
      const slug = { 'Линия главы': 'liniya', 'Вступление': 'vstuplenie', 'Главное в книге': 'glavnoe' }[head] || `h-${children.length}`;
      children.push({ href: `${file}#${slug}-${b}`, title: head });
      src += `<section class="part ${slug}" id="${slug}-${b}">\n<h2>${esc(head)}</h2>\n\n${wikiLinks(rest)}\n\n</section>\n\n`;
    }
  }
  // сноски карточек: определения уже внутри текста фрагментов; markdown-it соберёт их в конец
  const body = linkify(renderWithNotes(src, file), { maps: LINKS, book: b });
  const title = `Книга ${ROMAN[b]}`;
  files.push({ name: file, content: page(title, `<section id="kniga-${b}" epub:type="chapter" role="doc-chapter">\n<hgroup><p class="book-label">Книга</p><h1>${ROMAN[b]}</h1></hgroup>\n${body}</section>`) });
  toc.push({ file, title, children });
}

// ---------- приложения ----------
// Обычное приложение: markdown файла pril-*.md, заголовок из фронтматтера.
function appendixPage(fileMd, fileOut, transform) {
  const { data, content } = matter(read(path.join(BOOK, fileMd)));
  const title = String(data.title || fileOut).replace(/^Приложение\s+([A-ZА-Я])\.\s*/, (a, l) => `Приложение ${l}. `);
  let src = wikiLinks(content);
  if (transform) src = transform(src);
  if (fileOut === 'slovar.xhtml') src = wrapEntries(src, 'terms', LINKS);
  if (fileOut === 'imena.xhtml') src = wrapEntries(src, 'people', LINKS);
  let body = renderWithNotes(src, fileOut);
  const children = [];
  let k = 0;
  body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, (a, t) => { const id = `a-${++k}`; children.push({ href: `${fileOut}#${id}`, title: t.replace(/<[^>]+>/g, '') }); return `<h2 id="${id}">${t}</h2>`; });
  const [label, ...rest] = title.split('. ');
  const head = rest.length ? `<hgroup><p class="book-label">${esc(label)}</p><h1>${esc(rest.join('. '))}</h1></hgroup>` : `<h1>${esc(title)}</h1>`;
  files.push({ name: fileOut, content: page(title, `<section id="${fileOut.replace('.xhtml', '')}" epub:type="appendix" role="doc-appendix">\n${head}\n${body}</section>`, { bodyType: 'backmatter' }) });
  toc.push({ file: fileOut, title, children: children.length > 1 ? children : [] });
}

// Карта практики: суть каждого догмата и упражнения пишется в pril-d (### Название ^slug),
// а полный список мест сборщик добавляет сам по разметке карточек.
function buildKarta() {
  const tagMap = new Map();
  const comSet = new Set(commented.map((c) => `${pad(c.b)}-${pad(c.m)}`));
  for (let b = 1; b <= 12; b++) {
    for (const f of fs.readdirSync(path.join(PASS, `book ${b}`)).filter((f) => /^\d\d-\d\d\.md$/.test(f)).sort()) {
      const { data } = matter(read(path.join(PASS, `book ${b}`, f)));
      for (const slug of [...(data.dogmas || []), ...(data.exercises || [])]) {
        if (!tagMap.has(slug)) tagMap.set(slug, []);
        tagMap.get(slug).push(f.slice(0, 5));
      }
    }
  }
  const list = (ids) => ids.map((id) => { const [b, m] = id.split('-').map(Number); const a = `<a href="${bookFile(b)}#${fid(b, m)}">${b}.${m}</a>`; return comSet.has(id) ? `<b>${a}</b>` : a; }).join(', ');
  appendixPage('pril-d-karta-praktiki.md', 'karta-praktiki.xhtml', (src) => {
    // ### Название ^slug  →  статья с якорем; после сути — все места
    const parts = src.split(/^(?=### |## )/m);
    return parts.map((p) => {
      const m = p.match(/^### (.*?)\s+\^([\w-]+)\s*\n([\s\S]*)$/);
      if (!m) return p;
      const [, t, slug, body] = m;
      const ids = tagMap.get(slug) || [];
      return `<section class="entry" id="d-${slug}">\n\n### ${t}\n\n${body.trim()}\n\n<p class="places"><span class="places-label">Места (${ids.length}):</span> ${list(ids)}</p>\n\n</section>\n\n`;
    }).join('');
  });
}

// прежняя автоматическая карта (запасной вариант, если в pril-d нет статей с якорями)
function buildKartaAuto() {
  const tagMap = { dogmas: new Map(), exercises: new Map() };
  const comSet = new Set(commented.map((c) => `${pad(c.b)}-${pad(c.m)}`));
  for (let b = 1; b <= 12; b++) {
    for (const f of fs.readdirSync(path.join(PASS, `book ${b}`)).filter((f) => /^\d\d-\d\d\.md$/.test(f)).sort()) {
      const { data } = matter(read(path.join(PASS, `book ${b}`, f)));
      for (const k of ['dogmas', 'exercises']) for (const slug of data[k] || []) {
        if (!tagMap[k].has(slug)) tagMap[k].set(slug, []);
        tagMap[k].get(slug).push(f.slice(0, 5));
      }
    }
  }
  const title = (dir, slug) => { const p = path.join(CORPUS, dir, `${slug}.md`); return fs.existsSync(p) ? String(matter(read(p)).data.title_ru || slug) : slug; };
  const list = (ids) => ids.map((id) => { const [b, m] = id.split('-').map(Number); const a = `<a href="${bookFile(b)}#${fid(b, m)}">${b}.${m}</a>`; return comSet.has(id) ? `<b>${a}</b>` : a; }).join(', ');
  const block = (k, dir, prefix) => [...tagMap[k].entries()].map(([slug, ids]) => [title(dir, slug), slug, ids]).sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .map(([t, slug, ids]) => `<section class="entry" id="${prefix}-${slug}">\n<h3>${esc(t)}</h3>\n<p class="places">${list(ids)}</p>\n</section>`).join('\n');
  const body = `<section id="karta" epub:type="appendix" role="doc-appendix">
<h1>Карта практики</h1>
<p class="lead">Все места, где Марк возвращается к одному догмату или упражнению. Жирным отмечены фрагменты с комментарием в этой книге.</p>
<h2>Догматы</h2>
${block('dogmas', 'dogmas', 'd')}
<h2>Упражнения</h2>
${block('exercises', 'exercises', 'e')}
</section>`;
  files.push({ name: 'karta-praktiki.xhtml', content: page('Карта практики', tagGreek(body), { bodyType: 'backmatter' }) });
  toc.push({ file: 'karta-praktiki.xhtml', title: 'Карта практики', children: [] });
}

function buildIndex() {
  const rows = [];
  for (let b = 1; b <= 12; b++) {
    const items = commented.filter((c) => c.b === b).map((c) => `<a href="${c.file}#${fid(c.b, c.m)}">${c.b}.${c.m}</a>`);
    if (items.length) rows.push(`<p><span class="idx-book">Книга ${ROMAN[b]}.</span> ${items.join(', ')}</p>`);
  }
  files.push({ name: 'kommentarii.xhtml', content: page('Указатель комментариев', `<section id="kommentarii" epub:type="index" role="doc-index">\n<h1>Указатель комментариев</h1>\n<p class="lead">Фрагменты, к которым в книге есть комментарий.</p>\n${rows.join('\n')}\n</section>`, { bodyType: 'backmatter' }) });
  toc.push({ file: 'kommentarii.xhtml', title: 'Указатель комментариев', children: [] });
}


// ---------- обложка, титул ----------
const COVER_SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 2100" width="1400" height="2100">
<rect width="1400" height="2100" fill="#1d1b19"/>
<rect x="90" y="90" width="1220" height="1920" fill="none" stroke="#b9a37a" stroke-width="4"/>
<text x="700" y="560" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="64" letter-spacing="12" fill="#b9a37a">ΤΑ ΕΙΣ ΕΑΥΤΟΝ</text>
<text x="700" y="900" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="128" fill="#f2ebe0">Читая</text>
<text x="700" y="1060" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="128" fill="#f2ebe0">Марка Аврелия</text>
<line x1="560" y1="1180" x2="840" y2="1180" stroke="#b9a37a" stroke-width="3"/>
<text x="700" y="1290" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="52" fill="#d9cfbf">«Размышления» полностью,</text>
<text x="700" y="1360" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="52" fill="#d9cfbf">с комментарием</text>
<text x="700" y="1820" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="60" fill="#f2ebe0">${AUTHOR}</text>
</svg>
`;

function buildFront(dateStr) {
  files.push({ name: 'cover.xhtml', content: page('Обложка', `<section epub:type="cover" class="cover"><img src="cover.svg" alt="${TITLE}" /></section>`, { bodyType: 'frontmatter', cls: 'cover-page' }) });
  files.push({ name: 'titlepage.xhtml', content: page(TITLE, `<section epub:type="titlepage" class="titlepage">
<p class="t-author">${AUTHOR}</p>
<h1 class="t-title">${TITLE}</h1>
<p class="t-sub">${SUBTITLE}</p>
<p class="t-trans">Перевод «Размышлений» ${TRANSLATOR}</p>
</section>`, { bodyType: 'frontmatter' }) });
  files.push({ name: 'colophon.xhtml', content: page('О книге', `<section epub:type="colophon" class="colophon">
<p>© ${AUTHOR}, ${YEAR}. Комментарий, введение, приложения.</p>
<p>Текст «Размышлений» дан полностью в переводе ${TRANSLATOR} (1914), сверенном с греческим по изданию Леопольда (Oxford, 1908). Нумерация фрагментов каноническая.</p>
<p>Подробный комментарий к каждому фрагменту: <a href="https://readaurelius.org/ru">readaurelius.org/ru</a>.</p>
<p>Греческий набран шрифтом Gentium Plus © SIL International, лицензия SIL Open Font License 1.1.</p>
<p class="build">Сборка от ${dateStr.replace(/\.$/, "")}.</p>
</section>`, { bodyType: 'frontmatter' }) });
}

// ---------- навигация ----------
function navXhtml() {
  const li = (t) => `<li><a href="${t.file}">${esc(t.title)}</a>${t.children.length ? `\n<ol>\n${t.children.map((c) => `<li><a href="${c.href}">${esc(c.title)}</a></li>`).join('\n')}\n</ol>` : ''}</li>`;
  return page('Содержание', `<nav epub:type="toc" role="doc-toc" id="toc">
<h1>Содержание</h1>
<ol>
${toc.map(li).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>Ориентиры</h2>
<ol>
<li><a epub:type="cover" href="cover.xhtml">Обложка</a></li>
<li><a epub:type="toc" href="nav.xhtml">Содержание</a></li>
<li><a epub:type="bodymatter" href="vvedenie.xhtml">Начало</a></li>
</ol>
</nav>`, { bodyType: 'frontmatter' });
}

function tocNcx(uid) {
  let order = 0;
  const pt = (t) => `<navPoint id="np-${++order}" playOrder="${order}"><navLabel><text>${esc(t.title)}</text></navLabel><content src="${t.href || t.file}"/>${(t.children || []).map(pt).join('')}</navPoint>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ru">
<head><meta name="dtb:uid" content="${uid}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${TITLE}</text></docTitle>
<navMap>${toc.map(pt).join('')}</navMap>
</ncx>
`;
}

function opf(uid, modified) {
  const items = files.map((f, i) => `<item id="i${i}" href="${f.name}" media-type="application/xhtml+xml"${f.name === 'nav.xhtml' ? ' properties="nav"' : ''}/>`).join('\n');
  const spine = files.filter((f) => f.name !== 'nav.xhtml').map((f) => `<itemref idref="i${files.indexOf(f)}"${f.name === 'cover.xhtml' ? ' linear="yes"' : ''}/>`);
  const navIdx = files.findIndex((f) => f.name === 'nav.xhtml');
  spine.splice(3, 0, `<itemref idref="i${navIdx}"/>`); // содержание после обложки, титула и колофона
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ru">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title id="title">${TITLE}</dc:title>
<meta refines="#title" property="title-type">main</meta>
<dc:title id="subtitle">${SUBTITLE}</dc:title>
<meta refines="#subtitle" property="title-type">subtitle</meta>
<dc:creator id="author">${AUTHOR}</dc:creator>
<meta refines="#author" property="role" scheme="marc:relators">aut</meta>
<dc:contributor id="marcus">Марк Аврелий</dc:contributor>
<meta refines="#marcus" property="role" scheme="marc:relators">aut</meta>
<dc:contributor id="trl">${TRANSLATOR_NAME}</dc:contributor>
<meta refines="#trl" property="role" scheme="marc:relators">trl</meta>
<dc:language>ru</dc:language>
<dc:date>${YEAR}</dc:date>
<dc:rights>© ${AUTHOR}, ${YEAR}</dc:rights>
<dc:subject>Стоицизм</dc:subject>
<dc:subject>Античная философия</dc:subject>
<meta property="dcterms:modified">${modified}</meta>
<meta name="cover" content="cover-image"/>
<meta property="schema:accessMode">textual</meta>
<meta property="schema:accessModeSufficient">textual</meta>
<meta property="schema:accessibilityFeature">structuralNavigation</meta>
<meta property="schema:accessibilityFeature">tableOfContents</meta>
<meta property="schema:accessibilityFeature">readingOrder</meta>
<meta property="schema:accessibilityHazard">none</meta>
<meta property="schema:accessibilitySummary">Книга размечена семантически: главы, примечания со ссылками туда и обратно, языковая разметка греческих слов.</meta>
</metadata>
<manifest>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${FONTS.map((f, i) => `<item id="font${i}" href="fonts/${f}" media-type="font/ttf"/>`).join('\n')}
${items}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>
`;
}

// ---------- zip (mimetype первым, без сжатия) ----------
function zip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const { name, data, store } of entries) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = store ? buf : zlib.deflateRawSync(buf, { level: 9 });
    const crc = zlib.crc32(buf);
    const nameBuf = Buffer.from(name, 'utf8');
    const method = store ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(buf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(buf.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}

// ---------- проверка корректности XML (баланс тегов) ----------
function checkXml(name, s) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g;
  let m;
  const body = s.replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(body))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) { const top = stack.pop(); if (top !== tag) throw new Error(`${name}: </${tag}> закрывает <${top}>`); }
    else stack.push(tag);
  }
  if (stack.length) throw new Error(`${name}: не закрыты ${stack.join(', ')}`);
  const bad = body.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i);
  if (bad) throw new Error(`${name}: неэкранированный &`);
}

// ---------- сборка ----------
const FONTS = fs.existsSync(FONTS_DIR) ? fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith(".ttf")).sort() : [];
const now = new Date();
const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const uid = 'urn:uuid:' + crypto.createHash('sha1').update(TITLE + AUTHOR).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');

buildFront(dateStr);
buildIntro();
for (let b = 1; b <= 12; b++) buildBook(b);
for (const [src, out] of APPENDICES) (out === "karta-praktiki.xhtml" ? buildKarta() : appendixPage(src, out));
buildIndex();
files.splice(3, 0, { name: 'nav.xhtml', content: navXhtml() });

const css = read(path.join(path.dirname(fileURLToPath(import.meta.url)), 'epub.css'));
for (const f of files) checkXml(f.name, f.content);

const entries = [
  { name: 'mimetype', data: 'application/epub+zip', store: true },
  { name: 'META-INF/container.xml', data: `<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n` },
  { name: 'OEBPS/content.opf', data: opf(uid, now.toISOString().replace(/\.\d+Z$/, 'Z')) },
  { name: 'OEBPS/toc.ncx', data: tocNcx(uid) },
  { name: 'OEBPS/style.css', data: css },
  { name: 'OEBPS/cover.svg', data: COVER_SVG },
  ...FONTS.map((f) => ({ name: `OEBPS/fonts/${f}`, data: fs.readFileSync(path.join(FONTS_DIR, f)) })),
  ...files.map((f) => ({ name: `OEBPS/${f.name}`, data: f.content })),
];
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, zip(entries));
console.log(`EPUB: ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} КБ; файлов ${entries.length}; примечаний ${endnotes.length}; комментариев ${commented.length})`);

// ---------- FB2 из тех же страниц ----------
{
  const fb2 = buildFb2({ files, meta: { title: TITLE, subtitle: SUBTITLE, authorFirst: AUTHOR.split(" ")[0], authorLast: AUTHOR.split(" ").slice(1).join(" "), translatorGen: TRANSLATOR, year: YEAR, uid, dateStr, isoDate: now.toISOString().slice(0, 10) } });
  checkXml("fb2", fb2);
  const fb2Out = OUT.replace(/.epub$/, ".fb2");
  fs.writeFileSync(fb2Out, fb2);
  const ids = new Set([...fb2.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const broken = [...fb2.matchAll(/l:href="#([^"]+)"/g)].map((m) => m[1]).filter((h) => !ids.has(h));
  if (broken.length) console.log(`FB2: битые ссылки: ${[...new Set(broken)].slice(0, 10).join(", ")}`);
  globalThis.__fb2Out = fb2Out;
  console.log(`FB2: ${path.relative(ROOT, fb2Out)}  (${(fs.statSync(fb2Out).size / 1024).toFixed(0)} КБ)`);
}

// ---------- проверка EPUBCheck (если есть Java и books/reading-marcus/tools/epubcheck-*/epubcheck.jar) ----------
import { spawnSync } from "node:child_process";
{
  const toolsDir = path.join(ROOT, "books/reading-marcus/tools");
  const jarDir = fs.existsSync(toolsDir) ? fs.readdirSync(toolsDir).find((d) => d.startsWith("epubcheck")) : null;
  const jar = jarDir && path.join(toolsDir, jarDir, "epubcheck.jar");
  const javaCandidates = ["java", ...(process.env.JAVA_HOME ? [path.join(process.env.JAVA_HOME, "bin", "java")] : []),
    ...(fs.existsSync("C:/Program Files/Eclipse Adoptium") ? fs.readdirSync("C:/Program Files/Eclipse Adoptium").map((d) => path.join("C:/Program Files/Eclipse Adoptium", d, "bin", "java.exe")) : [])];
  const java = javaCandidates.find((j) => spawnSync(j, ["-version"]).status === 0);
  if (!jar || !java) console.log("EPUBCheck: не найден (нужны Java и tools/epubcheck-*/epubcheck.jar), проверка пропущена");
  else {
    const r = spawnSync(java, ["-jar", jar, OUT], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || "");
    const lines = out.split(/\r?\n/).filter((l) => /^(ERROR|WARNING|FATAL|USAGE)/.test(l));
    for (const l of lines.slice(0, 30)) console.log("  " + l.replace(/^.*?OEBPS\//, ""));
    const sum = out.match(/Messages:.*$/m);
    console.log("EPUBCheck: " + (sum ? sum[0] : "готово"));
    if (r.status !== 0) process.exitCode = 1;
    // FB2 по схеме FictionBook.xsd (Jing из комплекта EPUBCheck)
    const xsd = path.join(toolsDir, "fb2xsd", "FictionBook.xsd");
    if (fs.existsSync(xsd) && globalThis.__fb2Out) {
      const v = spawnSync(java, ["-cp", path.join(toolsDir, jarDir, "lib", "*"), "com.thaiopensource.relaxng.util.Driver", xsd, globalThis.__fb2Out], { encoding: "utf8" });
      const errs = ((v.stdout || "") + (v.stderr || "")).split(/\r?\n/).filter((l) => /error/.test(l) && !/cos-element-consistent/.test(l));
      for (const l of errs.slice(0, 10)) console.log("  " + l.replace(/^.*\.fb2:/, ""));
      console.log(`FB2 schema: ${errs.length} ошибок`);
      if (errs.length) process.exitCode = 1;
    }
  }
}
