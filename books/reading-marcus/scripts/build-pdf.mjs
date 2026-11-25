// Сборка PDF книги «Читая Марка Аврелия» через Typst (оформление: scripts/pdf/template.typ).
// Запуск: npm run book:pdf  [-- --only 4]  [-- --print]
//   --only N  собрать только содержание и книгу N (пробные страницы)
//   --print   вариант для печати: акцент чёрным, без ссылок
//   --format ridero|kdp  формат страницы: ridero (A5, по умолчанию) или kdp (6×9, для английского издания)
//   --en      английская версия (главы en/, текст Лонга); по умолчанию формат kdp
// Выход: books/reading-marcus/dist/chitaya-marka-avreliya.pdf (или -print.pdf)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const BOOKDIR = path.join(ROOT, 'books/reading-marcus');
const EN = process.argv.includes('--en');
const BOOK = path.join(BOOKDIR, EN ? 'en' : 'ru');
const pad0 = (n) => String(n).padStart(2, '0');
// всё, что зависит от языка: файлы, заголовки разделов, подписи
const L = EN ? {
  intro: '00-introduction.md', chap: (b) => `book-${pad0(b)}.md`,
  apps: [['A', 'app-a-text-and-translation.md'], ['B', 'app-b-glossary.md'], ['C', 'app-c-names.md'], ['D', 'app-d-map-of-practice.md'], ['E', 'app-e-chronology.md']],
  appTitles: [['A', 'The Text and the Translation'], ['B', 'Glossary of Terms'], ['C', 'Index of Names'], ['D', 'A Map of Practice'], ['E', 'Chronology of the Life of Marcus Aurelius']],
  back: [['literatura', 'bibliography.md', 'Bibliography'], ['ob-avtore', 'about-the-author.md', 'About the Author']],
  mapFile: 'app-d-map-of-practice', section: 'Английский', attribution: /^\*\(Long\)\*\s*$/m,
  line: 'The Thread of the Book', brief: 'The Book in Brief', commentary: '**Commentary.**', doctrines: 'Doctrines.',
  introWord: 'Introduction', introSub: 'How to Read Marcus Aurelius', book: (r) => `Book ${r}`, appendix: (k) => `Appendix ${k}`,
  meditations: 'The Meditations', appendices: 'Appendices', out: 'reading-marcus-aurelius',
} : {
  intro: '00-vvedenie.md', chap: (b) => `kniga-${pad0(b)}.md`,
  apps: [['A', 'pril-a-o-tekste.md'], ['B', 'pril-b-slovar.md'], ['C', 'pril-c-imena.md'], ['D', 'pril-d-karta-praktiki.md'], ['E', 'pril-e-hronologiya.md']],
  appTitles: [['A', 'О тексте и переводе'], ['B', 'Словарь терминов'], ['C', 'Указатель имён'], ['D', 'Карта практики'], ['E', 'Хронология жизни Марка Аврелия']],
  back: [['literatura', 'literatura.md', 'Литература'], ['ob-avtore', 'ob-avtore.md', 'Об авторе']],
  mapFile: 'pril-d-karta-praktiki', section: 'Русский', attribution: /^\*\(пер\.[^)]*\)\*\s*$/m,
  line: 'Линия главы', brief: 'Главное в книге', commentary: '**Комментарий.**', doctrines: 'Догматы.',
  introWord: 'Введение', introSub: 'Как читать Марка Аврелия', book: (r) => `Книга ${r}`, appendix: (k) => `Приложение ${k}`,
  meditations: 'Размышления', appendices: 'Приложения', out: 'chitaya-marka-avreliya',
};
const PASS = path.join(ROOT, 'marcus-aurelius/passages');
const OUT_DIR = path.join(BOOKDIR, 'dist');
const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
const PRINT = args.includes('--print');
const FORMAT = args.includes('--format') ? args[args.indexOf('--format') + 1] : (EN ? 'kdp' : 'ridero');
if (!['ridero', 'kdp'].includes(FORMAT)) throw new Error('--format: ridero или kdp');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const BOOKS = ONLY || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

let noteNo = 0; // нумерация сносок в главе
// ручные переносы: фрагмент начинается с новой страницы, если сноски предыдущей не помещаются на поле
// (проверка: scratchpad overflow.ps1 по PNG страниц)
const BREAK_BEFORE = { ridero: new Set(['1.4', '1.6', '7.66']), kdp: new Set(['1.6']) }[FORMAT];
const md = new MarkdownIt({ html: true, typographer: false, breaks: false }).use(footnote);
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const pad = (n) => String(n).padStart(2, '0');
const fid = (b, m) => `f-${pad(b)}-${pad(m)}`;

// какие метки будут в документе (ссылки на отсутствующие Typst не простит)
const APPENDICES = L.apps;
// разделы после приложений: литература и «Об авторе»
const BACKMATTER = L.back;
const labels = new Set(['vvedenie', ...APPENDICES.map(([k]) => `pril-${k}`), ...BACKMATTER.map(([l]) => l)]);
// статьи карты практики: ### Название ^slug → метка d-slug
for (const m of read(path.join(BOOK, `${L.mapFile}.md`)).matchAll(/^### .*?\s+\^([\w-]+)\s*$/gm)) labels.add(`d-${m[1]}`);
for (const b of BOOKS) {
  labels.add(`kniga-${b}`);
  for (const f of fs.readdirSync(path.join(PASS, `book ${b}`))) {
    const m = f.match(/^(\d\d)-(\d\d)\.md$/);
    if (m) labels.add(fid(+m[1], +m[2]));
  }
}

// ---------- markdown → HTML ----------
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
function wikiLinks(s) {
  s = obsidianParagraphs(s);
  return s.replace(/\[\[([^\]|#]*)(#\^?([^\]|]*))?(\|([^\]]*))?\]\]/g, (all, target, _h, anchor, _p, alias) => {
    const m = target.match(/^(\d\d)-(\d\d)$/);
    if (m) return `[${alias ?? `${+m[1]}.${+m[2]}`}](#${fid(+m[1], +m[2])})`;
    // догмат или упражнение в карте практики → ссылка на статью приложения D
    if (target === L.mapFile && anchor) return `[${alias ?? target}](#d-${anchor})`;
    return alias ?? target;
  });
}
function fragmentMd(id) {
  const t = read(path.join(PASS, `book ${+id.slice(0, 2)}`, `${id}.md`));
  let s = (t.split(new RegExp(`^## ${L.section}\\s*$`, 'm'))[1] || '').split(/^## /m)[0];
  s = s.replace(L.attribution, '').trim();
  return wikiLinks(s);
}

// ---------- HTML → Typst ----------
function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function escText(s) {
  return decode(s)
    .replace(/\s+/g, ' ')
    .replace(/[\\#*_`$<>@\[\]~=+\-\/'"]/g, '\\$&')
    // диапазоны «1.1–1.4» и «12.22» не разрывать по строкам
    .replace(/(\d)–(\d)/g, '$1⁠–⁠$2');
}
function parse(html) {
  const root = { tag: 'root', attrs: '', kids: [] };
  const stack = [root];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.kids.push(m[5]); continue; }
    const [, close, tag, attrs, self] = m;
    if (close) { while (stack.length > 1 && stack.pop().tag !== tag); continue; }
    const node = { tag, attrs, kids: [] };
    top.kids.push(node);
    if (!self && !['br', 'hr', 'img'].includes(tag)) stack.push(node);
  }
  return root;
}
const attr = (n, a) => (n.attrs.match(new RegExp(`${a}="([^"]*)"`)) || [])[1];

function render(node, ctx) {
  if (typeof node === 'string') return escText(node);
  const inner = () => node.kids.map((k) => render(k, ctx)).join('');
  switch (node.tag) {
    case 'root': return inner();
    case 'p': return inner().trim() + '\n\n';
    case 'em': case 'i': return `#emph[${inner()}]`;
    case 'strong': case 'b': return `#strong[${inner()}]`;
    case 'br': return ' \\\n';
    case 'hr': return '';
    case 'blockquote': return `#quote[${inner().trim()}]\n\n`;
    case 'ul': case 'ol': {
      const mark = node.tag === 'ul' ? '- ' : '+ ';
      return node.kids.filter((k) => typeof k !== 'string').map((li) => mark + render(li, ctx).replace(/\n\n/g, ' ').trim()).join('\n') + '\n\n';
    }
    case 'li': return inner();
    case 'h2': return `#part[${inner()}]\n`;
    case 'h3': case 'h4': return `#entry-head[${inner()}]\n`;
    case 'a': {
      const href = attr(node, 'href') || '';
      const m = href.match(/#((?:f-\d\d-\d\d)|(?:d-[\w-]+))$/);
      if (m) return !PRINT && labels.has(m[1]) ? `#link(label("${m[1]}"))[${inner()}]` : inner();
      if (/^https?:/.test(href)) return PRINT ? inner() : `#link("${href}")[${inner()}]`;
      return inner();
    }
    case 'sup': {
      // сноска markdown-it → заметка на внешнем поле, рядом с навигацией
      const a = node.kids.find((k) => k.tag === 'a');
      const n = a && (attr(a, 'href') || '').match(/#fn(\d+)/);
      if (n && ctx.notes.has(n[1])) return `#sn(${++noteNo})[${ctx.notes.get(n[1])}]`;
      return inner();
    }
    default: return inner();
  }
}

// английский текст: прямые кавычки и апострофы → типографские (“…” ‘…’ ’).
// Кавычка открывающая, если перед ней (не считая * и _ разметки) начало, пробел или скобка/тире.
function curlyQuotes(src) {
  const out = [...src];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c !== '"' && c !== "'") continue;
    let j = i - 1;
    while (j >= 0 && (out[j] === '*' || out[j] === '_')) j--;
    const prev = j >= 0 ? out[j] : '';
    const next = out[i + 1] || '';
    // перед пробелом, знаком препинания или концом строки кавычка всегда закрывающая
    const open = (prev === '' || /[\s(\[{—–\-\/“‘]/.test(prev)) && next !== '' && !/[\s.,;:!?)\]]/.test(next);
    // элизии Лонга: ’scape, ’tis, ’twas
    const elision = c === "'" && /^(scape|tis|twas)/.test(out.slice(i + 1, i + 6).join(''));
    if (c === '"') out[i] = open ? '“' : '”';
    else out[i] = open && !elision && /[A-Za-z0-9]/.test(next) ? '‘' : '’';
  }
  return out.join('');
}

// markdown-фрагмент → Typst; сноски становятся заметками на поле в месте ссылки
function toTypst(src) {
  if (EN) src = curlyQuotes(src);
  let html = md.render(src);
  const notes = new Map();
  const sec = html.match(/<hr class="footnotes-sep">\s*<section class="footnotes">([\s\S]*?)<\/section>\s*$/);
  if (sec) {
    html = html.slice(0, sec.index);
    for (const li of sec[1].matchAll(/<li id="fn(\d+)" class="footnote-item">([\s\S]*?)<\/li>/g)) {
      const body = li[2].replace(/<a href="#fnref[^"]*" class="footnote-backref">[^<]*<\/a>/g, '');
      notes.set(li[1], render(parse(body), { notes: new Map() }).trim().replace(/\n\n/g, ' #parbreak() '));
    }
  }
  return render(parse(html), { notes }).trim() + '\n\n';
}

// ---------- главы ----------
function bookTitle(lineMd) {
  const m = lineMd.match(/^\s*\*\*([^*]+?)\.?\*\*/);
  return m ? m[1] : null;
}
const tocBooks = [];
function buildBook(b) {
  noteNo = 0;
  const { content } = matter(read(path.join(BOOK, L.chap(b))));
  const parts = content.split(/^## /m).slice(1);
  let out = '';
  let title = null;
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl).trim();
    let rest = p.slice(nl + 1).trim();
    const fm = head.match(/^(\d+)\.(\d+)$/);
    if (head === L.line) {
      title = bookTitle(rest);
      const line = rest.replace(/^\s*\*\*[^*]+\*\*\s*/, '');
      out += `#chapter("kniga-${b}", "${ROMAN[b]}", ${title ? `[${escText(title)}]` : 'none'}, "${L.book(ROMAN[b])}", [${toTypst(wikiLinks(line))}])\n\n`;
    } else if (head === L.brief) {
      out += `#glavnoe[${toTypst(wikiLinks(rest))}]\n\n`;
    } else if (fm) {
      const id = `${pad(+fm[1])}-${pad(+fm[2])}`;
      if (BREAK_BEFORE.has(`${+fm[1]}.${+fm[2]}`)) out += '#pagebreak(weak: true)\n';
      out += `#frag("${+fm[1]}.${+fm[2]}", "${fid(+fm[1], +fm[2])}")\n${toTypst(fragmentMd(id))}`;
      rest = rest.replace(new RegExp(`^!\\[\\[[^\\]]*#${L.section}\\]\\]\\s*$`, 'm'), '').trim();
      if (rest.includes(L.commentary)) {
        const com = rest.replace(L.commentary, '').replace(/^\s+/, '');
        // на поле напротив «Догматы.»: страницы этих догматов в карте практики
        const slugs = [...new Set([...com.matchAll(new RegExp(`\\[\\[${L.mapFile}#\\^([\\w-]+)`, 'g'))].map((x) => x[1]))].filter((s) => labels.has(`d-${s}`));
        let ct = toTypst(wikiLinks(com));
        if (slugs.length) ct = ct.replace(`#strong[${L.doctrines}]`, `#dogmaref((${slugs.map((s) => `"${s}"`).join(', ')},))#strong[${L.doctrines}]`);
        out += `#commentary-label\n${ct}`;
      }
    } else {
      out += `#part[${escText(head)}]\n${toTypst(wikiLinks(rest))}`;
    }
  }
  tocBooks.push({ b, title });
  return out;
}

// ---------- введение ----------
function buildIntro() {
  noteNo = 0;
  const { data, content } = matter(read(path.join(BOOK, L.intro)));
  const sub = String(data.title).replace(/^(Введение|Introduction):\s*/, '');
  return `#section-open("vvedenie", none, [${L.introWord}], "${L.introWord}")
#align(center, text(style: "italic", size: 11pt)[${escText(sub[0].toUpperCase() + sub.slice(1))}])
#v(1.5em)
${toTypst(wikiLinks(content).replace(/^### /gm, "## "))}`;
}

// ---------- приложения ----------
// места каждого догмата и упражнения: по разметке dogmas/exercises в карточках
function placesMap() {
  const tagMap = new Map();
  for (let b = 1; b <= 12; b++) {
    for (const f of fs.readdirSync(path.join(PASS, `book ${b}`)).filter((f) => /^\d\d-\d\d\.md$/.test(f)).sort()) {
      const { data } = matter(read(path.join(PASS, `book ${b}`, f)));
      for (const slug of [...(data.dogmas || []), ...(data.exercises || [])]) {
        if (!tagMap.has(slug)) tagMap.set(slug, []);
        tagMap.get(slug).push(f.slice(0, 5));
      }
    }
  }
  return tagMap;
}
// прокомментированные фрагменты всей книги (в списке мест они жирные)
function commentedSet() {
  const set = new Set();
  for (let b = 1; b <= 12; b++) {
    const parts = read(path.join(BOOK, L.chap(b))).split(/^## /m);
    for (const p of parts) {
      const m = p.match(/^(\d+)\.(\d+)\s*\n/);
      if (m && p.includes(L.commentary)) set.add(`${pad(+m[1])}-${pad(+m[2])}`);
    }
  }
  return set;
}
function buildAppendices() {
  const tagMap = placesMap();
  const com = commentedSet();
  const place = (id) => {
    const [b, m] = id.split('-').map(Number);
    let t = `${b}.${m}`;
    if (!PRINT && labels.has(fid(b, m))) t = `#link(label("${fid(b, m)}"))[${t}]`;
    return com.has(id) ? `#strong[${t}]` : t;
  };
  let out = '';
  for (const [k, file] of APPENDICES) {
    noteNo = 0;
    const { data, content } = matter(read(path.join(BOOK, file)));
    const title = String(data.title).replace(/^(Приложение|Appendix)\s+[A-ZА-Я]\.\s*/, '');
    out += `#section-open("pril-${k}", [${L.appendix(k)}], [${escText(title)}], "${L.appendix(k)}")\n`;
    if (k !== 'D') { out += toTypst(wikiLinks(content)); continue; }
    for (const p of content.split(/^(?=### |## )/m)) {
      const m = p.match(/^### (.*?)\s+\^([\w-]+)\s*\n([\s\S]*)$/);
      if (!m) { out += toTypst(wikiLinks(p)); continue; }
      const [, t, slug, body] = m;
      const ids = tagMap.get(slug) || [];
      out += `#entry-head-id("d-${slug}")[${escText(t)}]\n${toTypst(wikiLinks(body))}`;
      out += `#places(${ids.length})[${ids.map(place).join(', ')}]\n\n`;
    }
  }
  return out;
}

function buildBackmatter() {
  return BACKMATTER.map(([lab, file, title]) => {
    noteNo = 0;
    const { content } = matter(read(path.join(BOOK, file)));
    return `#section-open("${lab}", none, [${escText(title)}], "${title}")\n${toTypst(wikiLinks(content))}`;
  }).join('\n');
}

// ---------- сборка ----------
const chapters = BOOKS.map(buildBook).join('\n');
// содержание: все двенадцать книг (в пробной сборке страницы есть только у собранных)
const allTitles = new Map(tocBooks.map((t) => [t.b, t.title]));
for (let b = 1; b <= 12; b++) {
  if (allTitles.has(b)) continue;
  const { content } = matter(read(path.join(BOOK, L.chap(b))));
  const line = (content.split(new RegExp(`^## ${L.line}\\s*$`, 'm'))[1] || '').trim();
  allTitles.set(b, bookTitle(line));
}
const tocEntry = (kicker, title, lab) => `#toc-entry([${kicker}], ${title ? `[${escText(title)}]` : 'none'}, ${labels.has(lab) ? `label("${lab}")` : 'none'})`;
let toc = '#toc-page[\n';
toc += tocEntry(L.introWord, L.introSub, 'vvedenie') + '\n';
toc += `#toc-band[${L.meditations}]\n`;
for (let b = 1; b <= 12; b++) toc += tocEntry(L.book(ROMAN[b]), allTitles.get(b), `kniga-${b}`) + '\n';
toc += `#toc-band[${L.appendices}]\n`;
for (const [k, t] of L.appTitles) toc += tocEntry(L.appendix(k), t, `pril-${k}`) + '\n';
for (const [lab, , t] of BACKMATTER) toc += tocEntry(t, null, lab) + '\n';
toc += ']\n';

const colophon = (EN ? [
  '© Ian Mezinskii, 2026. Introduction, commentary and appendices.',
  "The complete text of the Meditations is given in the translation of George Long (1862), checked against the Greek of J. H. Leopold's edition (Oxford, 1908). The passages follow the standard numbering.",
  'A commentary on every passage: readaurelius.org.',
  'Cover: bust of Marcus Aurelius, Glyptothek, Munich.',
  'Fonts: EB Garamond (Georg Duffner, Octavio Pardo), Cormorant (Christian Thalmann), Gentium Plus (SIL International); SIL Open Font License 1.1.',
] : [
  '© Ян Мезинский, 2026. Комментарий, введение, приложения.',
  'Текст «Размышлений» дан полностью в переводе С. М. Роговина (1914), сверенном с греческим по изданию Леопольда (Oxford, 1908). Нумерация фрагментов каноническая.',
  'Подробный комментарий к каждому фрагменту: readaurelius.org/ru.',
  'На обложке бюст Марка Аврелия из Мюнхенской глиптотеки.',
  'Шрифты: EB Garamond (Georg Duffner, Octavio Pardo), Cormorant (Christian Thalmann), Gentium Plus (SIL International); лицензия SIL Open Font License 1.1.',
]).map(escText).join('\n\n');
const doc = `#import "/scripts/pdf/template.typ": *
#show: book
#set page(numbering: "i")
${PRINT ? '' : `#cover("${EN ? '/cover/en/cover-ebook.jpg' : '/cover/cover-ebook.jpg'}")\n#counter(page).update(1)`}
${EN
  ? '#titlepage([Ian Mezinskii], [Reading], [MARCUS AURELIUS], [The Meditations as Spiritual Exercises], [The Meditations in the translation of George Long])'
  : '#titlepage([Ян Мезинский], [Читая], [МАРКА  АВРЕЛИЯ], [Как читать «Размышления»], [Перевод «Размышлений» С. М. Роговина])'}
#colophon[${colophon}]
${toc}
#pagebreak(to: "odd", weak: true)
#set page(numbering: "1")
#counter(page).update(1)
${buildIntro()}
${chapters}
${buildAppendices()}
${buildBackmatter()}
`;
const work = path.join(OUT_DIR, 'pdf');
fs.mkdirSync(work, { recursive: true });
const typFile = path.join(work, 'book.typ');
fs.writeFileSync(typFile, doc);
const pdfOut = path.join(OUT_DIR, `${L.out}${ONLY ? `-kniga-${ONLY.join('-')}` : ''}-${FORMAT}${PRINT ? '-print' : ''}.pdf`);

const typst = process.env.TYPST || [
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages/Typst.Typst_Microsoft.Winget.Source_8wekyb3d8bbwe/typst-x86_64-pc-windows-msvc/typst.exe'),
].find((p) => fs.existsSync(p)) || 'typst';
const targs = ['compile', '--root', BOOKDIR, '--font-path', path.join(BOOKDIR, 'tools/fonts'), '--font-path', path.join(HERE, 'fonts'),
  '--input', `print=${PRINT ? 1 : 0}`, '--input', `format=${FORMAT}`, '--input', `lang=${EN ? 'en' : 'ru'}`, typFile, pdfOut];
execFileSync(typst, targs, { stdio: 'inherit' });
if (args.includes('--png')) {
  execFileSync(typst, [...targs.slice(0, -1), path.join(work, 'p{0p}.png'), '--ppi', '110'], { stdio: 'inherit' });
}
console.log(`PDF: ${path.relative(ROOT, pdfOut)}  (${(fs.statSync(pdfOut).size / 1024).toFixed(0)} КБ)`);
