# Obsidian Vault — академические корпуса

Мета-vault для нескольких независимых исследовательских проектов. Каждый проект — отдельная папка в корне со своей структурой, шаблонами и скриптами сборки. Общими остаются только Obsidian-конфиг (`.obsidian/`) и Node-окружение (`package.json`, `node_modules/`, `tsconfig.json`).

## Проекты

- [marcus-aurelius/](marcus-aurelius/) — корпус по «Размышлениям» Марка Аврелия (пассажи, термины, догматы, упражнения по Адо).

## Открыть в Obsidian

«Open folder as vault» → выбрать корень этого репозитория. Граф связей охватывает все проекты сразу — можно ссылаться `[[Зевс]]` из заметки про Марка и наоборот.

### Рекомендованные плагины

- **Templater** — раскрывает маркеры `<% ... %>` в `*/templates/` при создании новой записи. В настройках плагина установите Template folder location на конкретный проект (`marcus-aurelius/templates`) либо используйте Folder Templates, чтобы привязать набор шаблонов к каждой проектной папке.
- **Dataview** — запросы по frontmatter (например, все пассажи Марка с дисциплиной `assent`).
- **Obsidian Git** — синхронизация со внешним репозиторием.

## Сборка

Сначала установить зависимости (один раз):

```bash
npm install
```

Затем — собрать конкретный проект:

```bash
npm run marcus:all
```

У каждого проекта свои npm-скрипты с префиксом-именем: `marcus:build`, `marcus:to-sanity`, `marcus:all`. Подробности — в README соответствующего проекта.

## Как добавить новый проект

Например, проект по античному пантеону:

1. Создать папку `pantheon/` с нужной структурой (`gods/`, `epithets/`, `cults/`, `templates/`, `scripts/`).
2. Написать `pantheon/scripts/build.ts` и `pantheon/scripts/to-sanity.ts` под схему пантеона — у богов своя модель данных, скрипты не переиспользуются между проектами.
3. Добавить в корневой `package.json` скрипты:
   ```json
   "pantheon:build": "tsx pantheon/scripts/build.ts",
   "pantheon:to-sanity": "tsx pantheon/scripts/to-sanity.ts",
   "pantheon:all": "npm run pantheon:build && npm run pantheon:to-sanity"
   ```
4. Добавить ссылку на проект в раздел «Проекты» этого README.

Шаблон `tsconfig.json` уже включает любые `.ts` под `*/scripts/`, отдельные настройки не нужны. Папки `*/build/` уже игнорируются гитом.
