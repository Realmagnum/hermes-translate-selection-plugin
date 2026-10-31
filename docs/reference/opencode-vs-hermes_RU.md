# OpenCode → Hermes API Mapping

[English](opencode-vs-hermes.md)

## Прямой маппинг вызовов

| Opencode Translate | Hermes Equivalent | Source (opencode) |
|-------------------|-------------------|-------------------|
| `Plugin.define()` | `{ id, name, register(ctx) }` export | `index.ts:8-10` |
| `@opencode/plugin/gui.Ipc.define` | **удалить** (нет IPC в Hermes Desktop) | `contract.ts` - весь файл удалён |
| `Ipc.call("translate-selection.translate", ...)` | `host.request("cli.exec", { argv: ["translate", ...] })` или прямой fetch для MT | — |
| `client.session.generate({ sessionID, prompt })` | `host.request("session.generate", { sessionID, prompt })` или через cli.exec | `llm-engine.ts:81` |
| `Store.global.get/set` | `ctx.storage.set/get` (атомы) | `settings.ts` → `storage.js` |
| `SolidJS <Portal>` | Fixed-position div без Portal | `popup.tsx:328-415` — перестроить на React + JSX |
| `clipboard.writeText()` | `navigator.clipboard.writeText()` или `host.os.copyText()` | `src/clipboard.ts` (не читал, но стандартный API) |

## Архитектурные отличия

### Opencode Translate
- **Двухпроцессная архитектура:** GUI process (renderer) ↔ Main process (server half, index.ts:3-5)
- **IPC channel:** Ipc.define с Effect Schema валидацией (contract.ts)
- **Session access:** `client.session.generate()` из opencode SDK
- **SolidJS:** Компоненты с createSignal, For, Show (solid-js)

### Hermes Desktop (Target)
- **Один процесс:** Webview/renderer, всё в одном файле (plugin.js)
- **Нет IPC:** Прямой `fetch()` для MT endpoints, `host.request()` для LLM
- **Session access:** Через `host.request("session.options")` или `host.request("session.list")`
- **React + JSX:** Нет компиляции (plain ESM), jsx() из 'react/jsx-runtime'

## Что можно port 1:1 (чистый JS)

- `detector.ts` → `src/detector.js` — чистые хеуристики, никаких импортов кроме exports
- `shield.ts` → `src/shield.js` — regex-замена, без зависимостей
- Основная логика `translate.ts` → `src/translate.js` — почти чистый JS, только заменить `Ipc.call` на прямые вызовы

## Что переписывать

- `popup.tsx` (SolidJS) → `src/selection.js` (React): Переписать createSignal→useState, For→{list.map()}, Show→条件渲染, Solid events→React events
- `settings-view.tsx` → `src/settings.js`: React forms вместо Solid JSX
- `gui.tsx` → **удалить**: это Electron-specific popup renderer (для OpenCode Desktop); в Hermes используем встроенный pane mechanism
- `index.ts` → `src/plugin.js`: Реестр плагина + точки входа

## Что не переносим

- `tui.tsx` и `tui.ts`: Terminal UI на @opentui/solid — пока откладываем (фазы P6+)
- `build-tui.mjs`: Скрипт сборки TUI модуля — не нужен
- `vite.config.ts`, `tsconfig.json`: Конфиги опкоде, Hermes использует plain ESM без сборщика

