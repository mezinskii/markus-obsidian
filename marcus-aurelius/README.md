# Marcus Aurelius Corpus

Академический проект-корпус по «Размышлениям» Марка Аврелия. Один из проектов мета-vault'а (см. [корневой README](../README.md)).

## Структура

```
passages/   — пассажи «Размышлений» (NN-NN.md, напр. 04-03.md)
terms/      — греческие стоические термины
dogmas/     — стоические догматы
exercises/  — духовные упражнения по Адо
images/     — образы и метафоры Марка
people/     — биографические карточки людей, упоминаемых у Марка
              или формирующих философский фон. Подпапки:
                stoics/                       (Зенон, Клеанф, Хрисипп, Эпиктет, Сенека…)
                peripatetics/                 (Аристотель, Феофраст…)
                cynics/                       (Диоген, Кратет, Моним…)
                presocratics-and-platonists/  (Гераклит, Платон, Сократ…)
                teachers-and-family/          (для Книги I: Антонин, Рустик, Секст…)
                historical-figures/           (Александр, Цезарь, Помпей…)
places/     — географические карточки мест, упоминаемых у Марка
              или связанных с историей создания «Размышлений»
              (Карнунт, Гран­уя, Рим, Афины…)
sources/    — текстовые источники и доксографии (DL, SVF, Stobaeus, LS, Long-Sedley)
templates/  — Obsidian-шаблоны для новых записей
scripts/    — TypeScript-скрипты сборки
build/      — генерируемые JSON и NDJSON (в .gitignore)
```

**Различие `people/` vs `sources/`:** `people/` — биографические справки и роль каждой фигуры для Марка; `sources/` — описание самих текстов и доксографических собраний (Стобей, SVF Арнима, *Беседы* Эпиктета и т. д.). Они дополняют друг друга: карточка `people/stoics/epictetus.md` — про Эпиктета как философа; карточка `sources/discourses.md` — про *Беседы* как текст.

## Сборка

Команды запускаются **из корня vault'а**:

```bash
npm run marcus:all
```

`marcus:all` выполняет два шага последовательно:

1. `marcus:build` — парсит `passages/`, `terms/`, `dogmas/`, `exercises/` и пишет JSON в `marcus-aurelius/build/`.
2. `marcus:to-sanity` — превращает JSON в NDJSON-документы Sanity (`marcus-aurelius/build/import.ndjson`) с детерминированными `_id` и `reference`-связями.

## Импорт в Sanity

```bash
npx sanity dataset import marcus-aurelius/build/import.ndjson production --replace
```

`--replace` позволяет повторный импорт: `_id` стабильны (`passage-04-03`, `term-hegemonikon`, и т.д.), и существующие документы будут перезаписаны на месте.
