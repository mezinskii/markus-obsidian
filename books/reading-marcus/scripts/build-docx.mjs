// Сборка DOCX для загрузки в редактор Ridero (он принимает текстовые документы, а не EPUB).
// Структура: Заголовок 1 — введение, книги, приложения; Заголовок 2 — разделы и номера фрагментов;
// сноски — настоящие сноски Word. Титул, оглавление и нумерацию Ridero делает сам.
// Запуск: npm run book:docx  →  books/reading-marcus/dist/chitaya-marka-avreliya-ridero.docx

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const BOOK = path.join(ROOT, 'books/reading-marcus/ru');
const PASS = path.join(ROOT, 'marcus-aurelius/passages');
const OUT_DIR = path.join(ROOT, 'books/reading-marcus/dist');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const pad = (n) => String(n).padStart(2, '0');

// одиночный перевод строки в Obsidian — новый абзац
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
// вики-ссылки → текст (в бумажной книге ссылок нет)
function plain(s) {
  return obsidianParagraphs(s).replace(/\[\[([^\]|#]*)(#\^?([^\]|]*))?(\|([^\]]*))?\]\]/g, (all, target, _h, _a, _p, alias) => {
    const m = target.match(/^(\d\d)-(\d\d)$/);
    if (m && !alias) return `${+m[1]}.${+m[2]}`;
    return alias ?? target;
  });
}
// сноски: метки уникальны во всём документе
const uniq = (s, prefix) => s.replace(/\[\^([\w-]+)\]/g, `[^${prefix}-$1]`);

function fragment(id) {
  const t = read(path.join(PASS, `book ${+id.slice(0, 2)}`, `${id}.md`));
  let s = (t.split(/^## Русский\s*$/m)[1] || '').split(/^## /m)[0];
  s = s.replace(/^\*\(пер\.[^)]*\)\*\s*$/m, '').trim();
  return uniq(plain(s), id);
}

let out = '';

// введение
{
  const { data, content } = matter(read(path.join(BOOK, '00-vvedenie.md')));
  const sub = String(data.title).replace(/^Введение:\s*/, '');
  out += `# Введение\n\n*${sub[0].toUpperCase() + sub.slice(1)}*\n\n`;
  out += uniq(plain(content), 'intro').replace(/^### /gm, '## ') + '\n\n';
}

// книги
for (let b = 1; b <= 12; b++) {
  const { content } = matter(read(path.join(BOOK, `kniga-${pad(b)}.md`)));
  const parts = content.split(/^## /m).slice(1);
  let title = '';
  let body = '';
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl).trim();
    let rest = p.slice(nl + 1).trim();
    const fm = head.match(/^(\d+)\.(\d+)$/);
    if (head === 'Линия главы') {
      const t = rest.match(/^\s*\*\*([^*]+?)\.?\*\*\s*/);
      if (t) { title = t[1]; rest = rest.slice(t[0].length); }
      body += `## Линия главы\n\n*${plain(rest).trim().split(/\n\n+/).join('*\n\n*')}*\n\n`;
    } else if (fm) {
      const id = `${pad(+fm[1])}-${pad(+fm[2])}`;
      body += `## ${+fm[1]}.${+fm[2]}\n\n${fragment(id)}\n\n`;
      rest = rest.replace(/^!\[\[[^\]]*#Русский\]\]\s*$/m, '').trim();
      if (rest.includes('**Комментарий.**')) {
        body += uniq(plain(rest), `c${id}`).replace(/^\*\*Комментарий\.\*\*\s*/m, '**Комментарий.**\n\n') + '\n\n';
      }
    } else {
      body += `## ${head}\n\n${uniq(plain(rest), `k${b}`)}\n\n`;
    }
  }
  out += `# Книга ${ROMAN[b]}${title ? `. ${title}` : ''}\n\n${body}`;
}

// приложения; в карте практики после каждой статьи — места по разметке карточек
const tagMap = new Map();
for (let b = 1; b <= 12; b++) {
  for (const f of fs.readdirSync(path.join(PASS, `book ${b}`)).filter((f) => /^\d\d-\d\d\.md$/.test(f)).sort()) {
    const { data } = matter(read(path.join(PASS, `book ${b}`, f)));
    for (const slug of [...(data.dogmas || []), ...(data.exercises || [])]) {
      if (!tagMap.has(slug)) tagMap.set(slug, []);
      tagMap.get(slug).push(f.slice(0, 5).split('-').map(Number).join('.'));
    }
  }
}
for (const file of ['pril-a-o-tekste.md', 'pril-b-slovar.md', 'pril-c-imena.md', 'pril-d-karta-praktiki.md', 'pril-e-hronologiya.md', 'literatura.md', 'ob-avtore.md']) {
  const { data, content } = matter(read(path.join(BOOK, file)));
  let src = content;
  if (file.startsWith('pril-d')) {
    src = src.replace(/^### (.*?)\s+\^([\w-]+)\s*\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm, (all, t, slug, b) => {
      const ids = tagMap.get(slug) || [];
      return `### ${t}\n\n${b.trim()}\n\n*Места (${ids.length}):* ${ids.join(', ')}\n\n`;
    });
  }
  out += `# ${String(data.title).replace(/\s*:.*$/, '')}\n\n${uniq(plain(src), file.startsWith('pril-') ? file.slice(5, 6) : file.slice(0, 3))}\n\n`;
}

// символы, которых нет в шрифте Ridero (PT Sans): кавычки ʽ…ʼ → «…», греческий апостроф ’ → обычный
out = out.replace(/ʽ([^ʼ]*)ʼ/g, '«$1»').replace(/[ʽʼ]/g, "'").replace(/([Ͱ-Ͽἀ-῿])’/g, "$1'");
const odd = [...new Set(out.match(/[ὙὛὝὟʼʽ]/g) || [])];
if (odd.length) console.warn(`Внимание: символы не из шрифта Ridero: ${odd.join(' ')}`);

// Ridero начинает каждый заголовок с новой страницы: заголовками остаются только введение, книги и приложения,
// всё прочее (номера фрагментов, разделы глав, статьи приложений) — жирная строка
out = out.replace(/^#{2,4} (.+)$/gm, '**$1**');
// импорт Ridero теряет часть заголовков первого уровня; явный разрыв страницы перед каждым помогает их распознать
const PAGE_BREAK = '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n';
out = out.replace(/\n+(?=^# )/gm, `\n\n${PAGE_BREAK}`);

fs.mkdirSync(path.join(OUT_DIR, 'docx'), { recursive: true });
const mdFile = path.join(OUT_DIR, 'docx', 'book.md');
fs.writeFileSync(mdFile, out);
const docx = path.join(OUT_DIR, 'chitaya-marka-avreliya-ridero.docx');
const pandoc = process.env.PANDOC || [path.join(process.env.LOCALAPPDATA || '', 'Pandoc/pandoc.exe')].find((p) => fs.existsSync(p)) || 'pandoc';
execFileSync(pandoc, [mdFile, '-f', 'markdown-smart-auto_identifiers', '-t', 'docx', '-o', docx,
  '--metadata', 'lang=ru-RU'], { stdio: 'inherit' });
const notes = (out.match(/^\[\^[\w-]+\]:/gm) || []).length;
console.log(`DOCX: ${path.relative(ROOT, docx)}  (${(fs.statSync(docx).size / 1024).toFixed(0)} КБ; сносок ${notes})`);
