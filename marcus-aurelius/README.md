# Marcus Aurelius Corpus

Академический проект-корпус по «Размышлениям» Марка Аврелия. Один из проектов мета-vault'а (см. [корневой README](../README.md)).

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
