# Microspec v1 — hermes-translate-selection-plugin

## Scope (MVP)

**Что:** Inline-перевод при выделении текста в Hermes Desktop (webapp + electron client).
**Чего нет:** TUI/terminal support, browser extensions, mobile.

### User Stories

1. **Выделил текст → появился popup** с быстрым переводом на 2 целевых языка (по умолчанию `ru, en`)
2. **Клик на результат → скопировал** в буфер обмена
3. **Закрепил popup** (mouseenter/pin), не закрывается при уходе мыши
4. **Горячие клавиши:** `Alt+T` (перевода clipboard), `Alt+Shift+T` (перевода последнего ответа ассистента), `Alt+P` (боковая панель)
5. **Команды палитры:** `/translate`, `/translate-last`, `/translate-panel`
6. **Панель настроек** (Settings > Translation): режим маршрутизации (Auto/Fast/LLM), языки, timeout LLM, темы, горячие клавиши

## Architecture Overview

```
┌─────────────────────┬──────────────────┬─────────────────┐
│   Selection Popup   │  Side Panel      │  Command Palette│
│   (mouse gesture)   │  (persistent)    │  (hotkeys/cmd)  │
│   ─────────────     │                  │                 │
│  selection.js       │  panel.js        │  plugin.js      │
│                     │                  │  - hotkey map   │
│  └─ detects text    │  └─ side-by-side │  - palette cmds │
│  └─ fixed-position  │  └─ shows result │  - keybind cfg  │
│  └─ shows results   │  └─ copy button  │                 │
└──────────┬──────────┴──────────────────┴─────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                    translate.js                           │
│  Hybrid Engine: Auto / Fast / LLM routing                │
│  - Google gtx (tier 1) -> dict-chrome-ex (tier 2)         │
│  - MyMemory fallback (tier 3)                            │
│  - Session LLM for complex/formatted text                │
│  - Token shielding (U+27A6 for code/URLs)                │
│  - Language detection (script heuristics)                 │
└──────────┬────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                   host.request() / cli.exec               │
│  Gateway communication: no direct server daemon           │
│  - model.options (provider listing via gateway)          │
│  - session.generate({ sessionID, prompt }) for LLM       │
└──────────────────────────────────────────────────────────┘
```

## Phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **P0: Skeleton** | planned | skeleton `plugin.js`, registers pane+palette, `node --check` passes |
| **P1: Selection Popup** | planned | mouseup/selectionchange handlers, fixed-position popup, basic MT (Google gtx fallback) |
| **P2: Hybrid Routing** | planned | detectComplex() -> LLM or MT, token shielding, multi-lang targets |
| **P3: Side Panel** | planned | persistent right-rail pane, in-place updates from popup, hotkey toggles |
| **P4: Hotkeys & Commands** | planned | Alt+T clipboard, Alt+Shift+T last-message, Alt+P panel toggle, palette commands |
| **P5: Settings UI** | planned | modal/settings form in panel, engine mode picker, target langs, themes, keybinds |
| **P6: Polish & Ship** | planned | cleanup, error states, loading spinners, README, catalog metadata |

## Key Design Decisions

1. **React, не SolidJS.** Hermes SDK даёт React; porting Solid->React добавляет риск. Перепишем popup из SolidJS (`popup.tsx`) на React с `jsx()` runtime.
2. **host.request("cli.exec", ...) vs direct HTTP.** Как в `hermes-insight`: используем `cli.exec` для LLM (через текущую сессию), и `fetch()` напрямую для MT endpoints (они открытые API, без auth).
3. **ctx.storage.set("settings.v1", JSON.stringify(cfg))** - как insight, единый JSON ключ.
4. **Selection popup rendering - fixed div**, не `<Portal>`. В Hermes Desktop popup рисуется как фиксированный элемент поверх контента (как в opencode).
5. **Session context для LLM:** берём ID текущей сессии через `host.session?.id` или из глобального состояния Hermes.

## Success Criteria (Definition of Done)

- [ ] `node --check src/plugin.js` проходит без ошибок
- [ ] Плагин загружается в Hermes Desktop автоматически через `~/.hermes/desktop-plugins/`
- [ ] Выделение текста -> popup с результатами перевода (Google MT + LLM fallback)
- [ ] Копирование результата по клику
- [ ] Горячие клавиши Alt+T / Alt+Shift+T / Alt+P работают
- [ ] Боковая панель показывает последние переводы
- [ ] Команды палитры `/translate` etc. работают
- [ ] Настройки сохраняются в ctx.storage

## Files Requiring Porting (from opencode-translate-selection)

| Source file | Hermes equivalent | Notes |
|------------|-------------------|-------|
| `src/index.ts` | `src/plugin.js` | Реестр, точки входа |
| `src/popup.tsx` (SolidJS) | `src/selection.js` (React) | **Основной порт** - переписать SolidJS на React + `jsx()` |
| `src/translate.ts` | `src/translate.js` | **Бизнес-логика** - почти чистый JS, минимальные правки |
| `src/contract.ts` (Effect Schema) | **удалить** | Hermes использует `host.request()` напрямую |
| `src/detector.ts` | `src/detector.js` | Чистый JS, 1 к 1 |
| `src/shield.ts` | `src/shield.js` | Чистый JS, 1 к 1 |
| `src/llm-engine.ts` | `src/llm-engine.js` | Заменить `client.session.generate()` на `host.request()` |
| `src/settings.ts` | `src/storage.js` | Удалить Effect Schema, использовать ctx.storage |
| `src/gui.tsx` | `src/settings.js` | React-формы для настроек, без Electron IPC |
| `src/formatter-view.tsx` | **объединить с selection.js** | Inline-rendering переведённого текста |
| `src/tui.tsx` | **отложить до P6** | Терминальный интерфейс пока не делаем |
| `src/i18n.ts` | `src/i18n.js` | Минималистичная мультиязычность |

