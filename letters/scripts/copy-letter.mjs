// Готовит текст письма для вставки в блок текста MailerLite.
// npm run letter:copy -- 22 ru   → тема и прехедер в консоль, текст письма в буфер обмена (как HTML)
// npm run letter:copy -- 22 en
// На бесплатном тарифе MailerLite текст письма через API не передать, поэтому кампания
// дублируется руками, а текст вставляется отсюда: без лишних ссылок, с курсивом и рабочей ссылкой.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';

const [num, lang = 'ru'] = process.argv.slice(2);
if (!num || !['ru', 'en'].includes(lang)) {
  console.error('Использование: npm run letter:copy -- <номер> <ru|en>');
  process.exit(1);
}

const dir = path.resolve(import.meta.dirname, '..');
const file = fs.readdirSync(dir).find((f) => f.startsWith(`letter-${String(num).padStart(2, '0')}-`));
if (!file) {
  console.error(`Письмо ${num} не найдено в ${dir}`);
  process.exit(1);
}
const src = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');

// раздел нужного языка до следующего заголовка второго уровня
const head = lang === 'ru' ? '## Русский' : '## Английский';
const start = src.indexOf(`${head}\n`);
if (start < 0) {
  console.error(`В ${file} нет раздела «${head}»`);
  process.exit(1);
}
const rest = src.slice(start + head.length + 1);
const end = rest.search(/^## /m);
let section = end < 0 ? rest : rest.slice(0, end);

const field = (name) => (section.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
const subject = field('Subject');
const preheader = field('Preheader');

// тело письма: всё после разделителя «---»
const sep = section.search(/^---\s*$/m);
let body = (sep < 0 ? section : section.slice(sep).replace(/^---\s*\n/, '')).trim();
// вики-ссылки Obsidian превращаем в обычный текст
body = body.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');

const html = new MarkdownIt({ html: false, linkify: false, typographer: false }).render(body);

// Формат буфера «HTML Format» (CF_HTML): смещения в заголовке считаются в байтах UTF-8.
// Set-Clipboard -AsHtml в Windows PowerShell 5.1 считает их неверно для не-латиницы, поэтому собираем сами.
const pre = '<html><body><!--StartFragment-->';
const post = '<!--EndFragment--></body></html>';
const headerTpl = 'Version:0.9\r\nStartHTML:SSSSSSSSSS\r\nEndHTML:EEEEEEEEEE\r\nStartFragment:FFFFFFFFFF\r\nEndFragment:GGGGGGGGGG\r\n';
const len = (s) => Buffer.byteLength(s, 'utf8');
const pad = (n) => String(n).padStart(10, '0');
const startHtml = len(headerTpl);
const startFrag = startHtml + len(pre);
const endFrag = startFrag + len(html);
const endHtml = endFrag + len(post);
const cfHtml = headerTpl
  .replace('SSSSSSSSSS', pad(startHtml)).replace('EEEEEEEEEE', pad(endHtml))
  .replace('FFFFFFFFFF', pad(startFrag)).replace('GGGGGGGGGG', pad(endFrag))
  + pre + html + post;

const base = path.join(os.tmpdir(), `letter-${num}-${lang}`);
fs.writeFileSync(`${base}.cfhtml`, cfHtml, 'utf8');
fs.writeFileSync(`${base}.txt`, body, 'utf8');
execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', [
  'Add-Type -AssemblyName System.Windows.Forms',
  `$bytes = [IO.File]::ReadAllBytes('${base}.cfhtml')`,
  '$o = New-Object Windows.Forms.DataObject',
  "$o.SetData('HTML Format', (New-Object IO.MemoryStream(,$bytes)))",
  `$o.SetData('UnicodeText', [IO.File]::ReadAllText('${base}.txt', [Text.Encoding]::UTF8))`,
  '[Windows.Forms.Clipboard]::SetDataObject($o, $true)',
].join('; ')]);

console.log(`Письмо ${num} (${lang}), ${file}`);
console.log(`Subject:   ${subject}`);
console.log(`Preheader: ${preheader}`);
console.log('Текст письма скопирован в буфер обмена: вставьте его в блок текста кампании (Ctrl+V).');
