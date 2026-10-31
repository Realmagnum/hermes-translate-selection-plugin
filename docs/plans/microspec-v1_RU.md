# Microspec v1 — hermes-translate-selection-plugin

[English](microspec-v1.md)

## Scope & Target Platforms

**Что:** Instant inline translation tooltip on text selection for Hermes Desktop (Electron) and Hermes WebApp.
**Поддерживаемые режимы:**
1. Mouse selection popup (выделил текст -> всплывает тултип с мгновенным переводом)
2. Persistent side panel (боковая панель в правой рейке `PANES_AREA` с историей переводов и ручным вводом)
3. Conflict-free hotkeys (`Alt+T` для буфера обмена, `Alt+Shift+T` для ответа ассистента, `Alt+P` для переключения панели)
4. Command Palette (`/translate`, `/translate-last`, `/translate-panel`)
5. Smart Hybrid Routing (Google MT Tier 1 -> Google MT Tier 2 -> MyMemory Tier 3 -> Session LLM `llm.oneshot`)

---

## Архитектура реализации

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Hermes Desktop Shell                               │
├─────────────────────────────────────┬───────────────────────────────────────┤
│    SelectionPopupHost               │   TranslationPane                     │
│    (STATUSBAR_AREAS.right)          │   (PANES_AREA, right rail 340px)      │
│    - Global mouseup/mousedown/key   │   - Persistent history feed           │
│    - Room-above clearance check     │   - In-place reactive updates         │
│    - Debounced read (140ms default) │   - Manual translate input            │
│    - Pin on hover/click             │   - Theme & target language settings  │
│    - Fast click-to-copy             │   - One-click copy for past results   │
├─────────────────────────────────────┴───────────────────────────────────────┤
│                          Hybrid Translation Engine                          │
│                                                                             │
│   Input Text ──► isComplexFormattedText() ?                                 │
│                     │                                                       │
│                     ├── YES (code blocks, lists, APIs)                      │
│                     │     └──► host.request("llm.oneshot", { ... })         │
│                     │             │                                         │
│                     │             ├── Success: cleanLlmOutput()             │
│                     │             └── Fail/Timeout: Token-Shielded MT       │
│                     │                                                       │
│                     └── NO (simple words, short phrases)                    │
│                           └──► Token Shielding (\u27A6N\u27A7)              │
│                                   │                                         │
│                                   ├── Tier 1: Google gtx                    │
│                                   ├── Tier 2: Google dict-chrome-ex         │
│                                   └── Tier 3: MyMemory API                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Статус фаз разработки

| Фаза | Статус | Достигнутый результат |
|------|--------|-----------------------|
| **P0: Скелет & контракт** | ✅ Готово | Инициализация репо, дерево tree-docs, архитектурный маппинг OpenCode -> Hermes SDK. |
| **P1: Selection Popup** | ✅ Готово | `SelectionPopupHost` в `STATUSBAR_AREAS.right`, глобальные слушатели mouseup/mousedown/keydown/scroll/resize, расчет координат с учетом clearance, дебаунс, защита от инпутов (`textarea, input, contenteditable`). |
| **P2: Hybrid Routing & LLM** | ✅ Готово | Определение сложности текста `isComplexFormattedText`, токен-шилдинг `shieldTokens`, нативный шлюзовый вызов `host.request("llm.oneshot")` с сессионным контекстом и таймаутом, каскадный откат на MT (Google gtx -> dict-chrome-ex -> MyMemory). |
| **P3: Side Panel** | ✅ Готово | Боковая панель в `PANES_AREA` (размещение `right`, ширина 340px), автонакопление истории, статус-индикаторы (LLM/MT), быстрое копирование. |
| **P4: Hotkeys & Palette** | ✅ Готово | Горячие клавиши `Alt+T` (перевод буфера), `Alt+Shift+T` (перевод ответа ассистента), `Alt+P` (панель). Команды в `PALETTE_AREA`. |
| **P5: Settings UI** | ✅ Готово | Редактирование целевых языков, выбор режима (Auto/Fast MT/LLM), переключение 5 цветовых тем (Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light), сохранение в `ctx.storage`. |
| **P6: Тестирование & Релиз** | ✅ Готово | Модульные тесты `test/unit.test.mjs` (6/6 pass), проверка синтаксиса `node -c`, документация README и AGENTS.md. |

---

## Проверенные инварианты

1. **Self-contained ESM:** Файл `src/plugin.js` не содержит относительных импортов, проходящих через runtime-loader в виде blob-URL. Допустимы только `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
2. **Безопасность буфера и стилей:** Стили инжектируются один раз с проверкой ID элемента; при `ctx.onDispose()` все глобальные обработчики событий и инжектированные теги `<style>` удаляются.
3. **Защита фокуса пользователя:** Плагин не перехватывает клики внутри редактируемых полей и не уводит фокус.
4. **Неблокирующий UI:** Все сетевые запросы снабжены `AbortController` и таймаутами; гонки запросов нейтрализуются монотонным счетчиком `sequenceRef`.
