# AGENTS_RU.md — Точка входа для AI-ассистентов (Tree-Docs)

[English](AGENTS.md)

**Проект:** `hermes-translate-selection-plugin` — плагин для Hermes Desktop и веб-клиента для мгновенного inline-перевода при выделении текста. Smart Hybrid LLM/MT routing, React JSX-рендеринг, чистый самодостаточный ESM.

## Карта документов (tree-docs)

```
📁 docs/          ← все артефакты проекта
├── plans/        ← текущие планы и спецификации
│   ├── microspec-v1.md     ← MVP план и статус фаз (EN)
│   └── microspec-v1_RU.md  ← MVP план и статус фаз (RU)
└── reference/    ← технические референсы из анализа upstream
    ├── hermes-sdk-patterns.md     ← паттерны Hermes SDK (EN)
    ├── hermes-sdk-patterns_RU.md  ← паттерны Hermes SDK (RU)
    ├── opencode-vs-hermes.md      ← маппинг API OpenCode → Hermes (EN)
    └── opencode-vs-hermes_RU.md   ← маппинг API OpenCode → Hermes (RU)

📁 src/           ← исходный код плагина
└── plugin.js     ← точка входа и самодостаточный ESM модуль

📁 test/          ← модульные тесты
└── unit.test.mjs ← автотесты чистых функций ядра (node:test)

📄 README.md      ← руководство пользователя (EN)
📄 README_RU.md   ← руководство пользователя (RU)
📄 LICENSE        ← лицензия MIT
```

## Принцип работы агентов

1. **Начни с `docs/plans/microspec-v1_RU.md`** — скоуп, фазы, архитектура и статус закрытия задач.
2. **Читай `docs/reference/*_RU.md`** перед внесением изменений — готовые паттерны Hermes SDK и маппинг контрактов.
3. **Проверяй код в `src/plugin.js`** — файл является самодостаточным модулем, без относительных импортов (ограничение загрузчика десктоп-плагинов).
4. **Не меняй поведение ради структуры.** Документация объясняет решения, а не управляет кодом напрямую.
5. **Ссылки на файлы давай как `путь:line`**, не копируй целиком в ответ.

## Ключевые ограничения

- Только `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`. Никаких сторонних npm-пакетов.
- `plugin.js` загружается без компиляции (plain ESM). Разметка через `jsx()`/`jsxs()`.
- Имя каталога `~/.hermes/desktop-plugins/<id>/` строго совпадает с `id: 'translate-selection'` в экспорте.
- Selection popup рендерится как фиксированный оверлей (`position: fixed`) с расчетом координат относительно выделения.
