# AGENTS.md — Tree-Docs Navigation Root

**Проект:** `hermes-translate-selection-plugin` — Hermes Desktop plugin для мгновенного inline-перевода при выделении текста. Hybrid LLM/MT routing, React-рендеринг, чистый ESM.

## Карта документов (tree-docs)

```
📁 docs/          ← все артефакты проекта
├── plans/        ← текущие планы и спецификации
│   └── microspec-v1.md  ← MVP план (scope, phases, architecture)
└── references/   ← технические референсы из анализа upstream
    ├── hermes-sdk-patterns.md  ← уроки из hermes-insight (popup, host.request, ctx.storage)
    └── opencode-vs-hermes.md   ← маппинг API OpenCode → Hermes

📁 src/           ← исходный код плагина
├── plugin.js     ← точка входа (register, panels, palette)
├── selection.js  ← detection popup (mouse up / selection change)
├── translate.js  ← hybrid LLM/MT engine (port from opencode)
├── storage.js    ← settings via ctx.storage
└── panel.js      ← persistent side-panel for translations

📄 README.md
📄 LICENSE
```

## Принцип работы агентов

1. **Начни с `microspec-v1.md`** — scope, фазы, архитектура. Это карта целей.
2. **Читай `references/*.md`** перед реализацией — готовые паттерны из анализа upstream плагинов.
3. **Проверяй код по `src/*.js`** — каждый файл самодостаточен, не галлюцинируй импорт SDK.
4. **Не меняй поведение ради структуры.** Документация объясняет решения, а не управляет кодом напрямую.
5. **Ссылки на файлы давай как `путь:line`**, не копируй целиком в ответ.

## Ключевые ограничения

- Только `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`. Никаких сторонних npm-пакетов.
- `plugin.js` загружается без компиляции (plain ESM). JSX через `jsx()`/`jsxs()`.
- Каталог имён папок `~/.hermes/desktop-plugins/<id>/` должен совпадать с `id` в export.
- Selection popup — fixed-position div, нет `<Portal>` (это Electron-специфика).
