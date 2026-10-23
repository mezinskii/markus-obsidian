// Ссылки из комментариев в приложения: греческий термин → словарь, имя → указатель имён,
// название практики → карта практики. Текст Марка (div.marcus) и сноски не трогаем.
// Ссылка ставится только на первое упоминание: термин — в каждом комментарии, имя — в главе.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// основа греческого слова: без типичных окончаний (для падежных форм)
const baseOf = (w) => w.replace(/(εως|ους|ιας|ιαν|ος|ον|ις|ης|ας|ων|οι|ου|ει|ιν|αι|ως|ην|ια|α|η|ω)$/, '');
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ']/g, '').toLowerCase().trim();

// Практика каждой книги (см. CLAUDE.md, «Главное в книге»)
export const PRACTICE = { 1: 'hypomnemata', 2: 'praemeditatio', 3: 'no-more-delay', 4: 'inner-retreat', 5: 'morning-meditation', 6: 'definitio', 7: 'view-from-above', 8: 'parakolouthesis', 9: 'contemplation-of-nature', 10: 'meditatio-mortis', 11: 'prokheiron', 12: 'prosokhe' };


// Русские названия терминов, однозначные в книге (первое упоминание в комментарии → словарь)
const RU_TERMS = [
  ['hegemonikon', /руководящ[а-яё]{0,3}\s+начал[а-яё]{0,3}/u],
  ['daimon', /гени(?:й|я|ю|ем|е)(?![а-яё])/u],
  ['apatheia', /бесстрасти[а-яё]{0,2}/u],
  ['pronoia', /промыс(?:ел|л[а-яё]{0,2})(?![а-яё])/u],
  ['arete', /добродетел[а-яё]{0,3}/u],
  ['adiaphora', /безразличн[а-яё]{0,3}/u],
  ['phantasia', /представлени[а-яё]{0,3}(?![а-яё])(?![»"]?\s+(?:о|об|обо)(?![а-яё]))/u, /сцен|театр|спектакл|пляск/u],
  ['pathos', /страст(?:ь|и|ей|ям|ями|ях|ью)(?![а-яё])/u],
  ['hedone', /наслаждени[а-яё]{0,3}/u],
  ['epithymia', /вожделени[а-яё]{0,3}/u],
  ['dikaiosyne', /справедливост[а-яё]{0,3}/u],
  ['kakia', /порок(?:а|у|ом|е|и|ов|ам|ами|ах)?(?![а-яё])/u],
  ['sophrosyne', /благоразуми[а-яё]{0,2}/u],
  ['andreia', /мужеств[а-яё]{0,2}/u],
  ['prohairesis', /свободн[а-яё]{0,3}\s+выбор[а-яё]{0,3}/u],
];

export function buildLinkMaps({ BOOK, CORPUS }) {
  // --- словарь: заголовки статей pril-b → slug карточки термина
  const cards = fs.readdirSync(path.join(CORPUS, 'terms')).filter((f) => f.endsWith('.md')).map((f) => {
    const { data } = matter(fs.readFileSync(path.join(CORPUS, 'terms', f), 'utf8'));
    const all = String(data.greek || '');
    const g = all.split(/[(,;]/)[0].trim();
    const alt = (all.match(/\(([^)]+)\)/) || [])[1] || '';
    return { slug: f.replace(/\.md$/, ''), lemma: norm(g), alt: norm(alt) };
  });
  const slovar = fs.readFileSync(path.join(BOOK, 'pril-b-slovar.md'), 'utf8');
  const terms = [];
  for (const m of slovar.matchAll(/^### (.+)$/gm)) {
    const head = m[1].trim();
    const h = norm(head.split(/[(,]/)[0]);
    const card = cards.find((c) => c.lemma === h || c.alt === h) || cards.find((c) => c.lemma && (c.lemma.startsWith(h) || h.startsWith(c.lemma)));
    const slug = card ? card.slug : h.replace(/[^a-zα-ω]+/g, '-');
    const words = h.replace(/^(το|η|ο|τα)\s+/, '');
    const stem = words.length >= 6 ? words.slice(0, words.length - 2) : null;
    const bases = words.split(/\s+/).map(baseOf);
    terms.push({ head, id: `t-${slug}`, lemma: words, stem, bases });
  }
  // --- указатель имён: заголовки pril-c
  const imena = fs.readFileSync(path.join(BOOK, 'pril-c-imena.md'), 'utf8');
  const people = [];
  let i = 0;
  const heads = [...imena.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
  const firstWords = heads.map((h) => h.split(/\s+/)[0]);
  for (const head of heads) {
    const id = `p-${++i}`;
    const forms = [head];
    const w = head.split(/\s+/);
    // однословная форма только если она однозначна и не короче 5 букв
    if (w.length > 1 && w[0].length >= 5 && firstWords.filter((x) => x === w[0]).length === 1 && !/^(Марк|Луций|Фаустина|Александр|Клавдий|Катилий|Секст|Плутарх|Элий|Цинна)$/.test(w[0])) forms.push(w[0]);
    if (w.length > 1 && /^(Секст)$/.test(w[0])) forms.push(w[0]);
    people.push({ head, id, forms: forms.filter((f) => !/^(Вер|Марк|Фаустина|Александр)$/.test(f)) });
  }
  people.sort((a, b) => b.head.length - a.head.length);
  return { terms, people };
}

// оборачивает статьи приложения (### …) в секции с якорями
export function wrapEntries(src, kind, maps) {
  const list = kind === 'terms' ? maps.terms : maps.people;
  const parts = src.split(/^(?=### |## )/m);
  let k = 0;
  return parts.map((p) => {
    const m = p.match(/^### (.+)\n([\s\S]*)$/);
    if (!m) return p;
    const e = list.find((x) => x.head === m[1].trim()) || list[k];
    k++;
    return `<section class="entry" id="${e.id}">\n\n### ${m[1].trim()}\n\n${m[2].trim()}\n\n</section>\n\n`;
  }).join('');
}

// регэксп для русского имени с падежными окончаниями
function nameRe(form) {
  const words = form.split(/\s+/).map((w) => {
    const base = w.replace(/(ий|ия|ая|ой|ый|а|я|й|ь|о)$/u, '');
    return base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[а-яё]{0,3}';
  });
  return new RegExp(`(^|[^А-Яа-яЁё])(${words.join('\\s+')})(?![А-Яа-яЁё])`, 'u');
}

export function linkify(html, { maps, book }) {
  const out = [];
  const tokens = html.split(/(<[^>]+>)/);
  let skip = 0; // глубина зон без ссылок: div.marcus, section.chapter-notes, заголовки, ссылки
  const stack = [];
  let inCommentary = false;
  let termSeen = new Set();
  const peopleSeen = new Set();
  let pendingGreek = null; // открытый <span lang="grc">
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith('<')) {
      const close = t.startsWith('</');
      const tag = (t.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1];
      const selfClose = t.endsWith('/>');
      if (!close && !selfClose) {
        const isSkip = /class="marcus"/.test(t) || /class="chapter-notes"/.test(t) || /^h[1-6]$/.test(tag) || tag === 'a' || /class="fnum"/.test(t);
        stack.push({ tag, isSkip, commentary: /class="commentary"/.test(t) });
        if (isSkip) skip++;
        if (/class="commentary"/.test(t)) { inCommentary = true; termSeen = new Set(); }
      } else if (close) {
        // закрываем ближайший такой же тег
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].tag === tag) {
            const [e] = stack.splice(j, 1);
            if (e.isSkip) skip--;
            if (e.commentary) inCommentary = false;
            break;
          }
        }
      }
      // греческий термин: <span lang="grc">слово</span>
      if (!skip && t.startsWith('<span') && /lang="grc"/.test(t) && tokens[i + 2] === '</span>') {
        const word = norm(tokens[i + 1] || '');
        const scopeKey = inCommentary ? 'c' : 'g';
        const ws = word.split(/[\s,.;:·]+/).filter(Boolean);
        const wb = ws.map(baseOf);
        const baseHit = (b) => b.length >= 3 && wb.some((x) => x === b || (b.length >= 5 && x.startsWith(b) && x.length - b.length <= 2));
        const hit = (x) => (x.lemma.includes(' ') && word.includes(x.lemma)) || ws.some((w) => w === x.lemma || (x.stem && w.startsWith(x.stem) && w.length <= x.lemma.length + 3)) || (x.id !== 't-paron' && x.bases.every(baseHit)) || (x.lemma.includes(' ') && x.lemma.split(' ').every((lw) => ws.some((w) => w.startsWith(lw.slice(0, 4)))));
        const term = maps.terms.find((x) => hit(x) && !termSeen.has(scopeKey + x.id));
        if (term && !termSeen.has(scopeKey + term.id)) {
          termSeen.add(scopeKey + term.id);
          out.push(`<a href="slovar.xhtml#${term.id}" class="gloss">`, t, tokens[i + 1], '</span>', '</a>');
          i += 2;
          continue;
        }
      }
      out.push(t);
      continue;
    }
    // текст: имена людей
    let text = t;
    if (!skip) {
      for (const p of maps.people) {
        if (peopleSeen.has(p.id)) continue;
        for (const f of p.forms) {
          const re = nameRe(f);
          const m = text.match(re);
          if (m) {
            const at = m.index + m[1].length;
            text = text.slice(0, at) + `<a href="imena.xhtml#${p.id}" class="person">${m[2]}</a>` + text.slice(at + m[2].length);
            peopleSeen.add(p.id);
            break;
          }
        }
      }
    }
    if (!skip) {
      const scopeKey = inCommentary ? 'c' : 'g';
      for (const [slug, re, notIf] of RU_TERMS) {
        const id = `t-${slug}`;
        if (termSeen.has(scopeKey + id) || !maps.terms.some((x) => x.id === id)) continue;
        if (notIf && notIf.test(text)) continue;
        const full = new RegExp('(^|[^А-Яа-яЁё])(' + re.source + ')(?![А-Яа-яЁё])', 'iu');
        // ищем только вне уже вставленных ссылок
        const parts = text.split(/(<a [^>]*>.*?<\/a>)/);
        let done = false;
        for (let k = 0; k < parts.length && !done; k += 2) {
          const m = parts[k].match(full);
          if (!m) continue;
          const at = m.index + m[1].length;
          parts[k] = parts[k].slice(0, at) + `<a href="slovar.xhtml#${id}" class="gloss">${m[2]}</a>` + parts[k].slice(at + m[2].length);
          done = true;
        }
        if (done) { text = parts.join(''); termSeen.add(scopeKey + id); }
      }
    }
    out.push(text);
  }
  let res = out.join('');
  // практика книги → карта практики
  if (book && PRACTICE[book]) {
    res = res.replace(/<strong>Практика: ([^<(]+?)(\s*\(|\.)/, (a, name, tail) => `<strong>Практика: <a href="karta-praktiki.xhtml#d-${PRACTICE[book]}" class="gloss">${name}</a>${tail}`);
  }
  return res;
}
