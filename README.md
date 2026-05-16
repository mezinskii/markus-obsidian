# Marcus Aurelius Corpus

Академический проект-корпус по «Размышлениям» Марка Аврелия: Obsidian-vault для работы с текстом + TypeScript-скрипты, собирающие материал в JSON и NDJSON для импорта в [Sanity CMS](https://www.sanity.io/).

## Структура

```
passages/   — пассажи «Размышлений» (NN-NN.md, напр. 04-03.md)
terms/      — греческие стоические термины
dogmas/     — стоические догматы
exercises/  — духовные упражнения по Адо
sources/    — античные источники и параллели (Эпиктет, Сенека и др.)
images/     — образы и метафоры Марка
templates/  — Obsidian-шаблоны для новых записей
scripts/    — TypeScript-скрипты сборки
build/      — генерируемые JSON и NDJSON (в .gitignore)
```

## Открыть в Obsidian

«Open folder as vault» → выбрать корень этого репозитория. Папка `.obsidian/` уже создана.

### Рекомендованные плагины

- **Templater** — раскрывает маркеры `<% ... %>` в `templates/` при создании новой записи.
- **Dataview** — запросы по frontmatter (напр. все пассажи с дисциплиной `assent`).
- **Obsidian Git** — синхронизация со внешним репозиторием.

## Сборка

```bash
npm install
npm run all
```

`npm run all` выполняет два шага последовательно:

1. `npm run build` — парсит `passages/`, `terms/`, `dogmas/`, `exercises/` и пишет JSON в `build/`.
2. `npm run to-sanity` — превращает JSON в NDJSON-документы Sanity (`build/import.ndjson`) с детерминированными `_id` и `reference`-связями.

## Импорт в Sanity

```bash
npx sanity dataset import build/import.ndjson production --replace
```

Флаг `--replace` позволяет повторный импорт: `_id` стабильны (`passage-04-03`, `term-hegemonikon`, и т.д.), и существующие документы будут перезаписаны на месте.
