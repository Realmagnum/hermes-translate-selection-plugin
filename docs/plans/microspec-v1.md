# Microspec v1 — hermes-translate-selection-plugin

[Русский](microspec-v1_RU.md)

## Scope & Target Platforms

**Objective:** Instant inline translation tooltip on text selection for Hermes Desktop (Electron) and Hermes WebApp.

**Supported Modalities:**
1. **Mouse selection popup:** Select text anywhere in chat or UI -> non-intrusive tooltip appears with immediate translation.
2. **Persistent side panel (`PANES_AREA`):** Right-rail panel (340px) tracking translation history with manual input.
3. **Conflict-free hotkeys:** `Alt+T` for clipboard text, `Alt+Shift+T` for last assistant response, `Alt+P` for panel toggle.
4. **Command Palette:** `/translate`, `/translate-last`, `/translate-panel`.
5. **Smart Hybrid Routing:** Multi-tier MT (Google `gtx` -> `dict-chrome-ex` -> `MyMemory`) + native gateway `llm.oneshot` with token shielding.

---

## Architectural Blueprint

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

## Implementation Phase Status

| Phase | Status | Deliverable & Proof |
|---|---|---|
| **P0: Skeleton & Contract** | ✅ Complete | Repo initialized, tree-docs structure established, OpenCode -> Hermes SDK architectural mapping drafted. |
| **P1: Selection Popup** | ✅ Complete | `SelectionPopupHost` mounted via `STATUSBAR_AREAS.right`, global mouseup/mousedown/keydown/scroll/resize listeners, clearance calculation, input suppression (`textarea`, `input`, `contenteditable`). |
| **P2: Hybrid Routing & LLM** | ✅ Complete | Complexity detector `isComplexFormattedText`, token shielding `shieldTokens`, native gateway RPC `host.request("llm.oneshot")` with session context and timeout, cascaded MT fallback. |
| **P3: Side Panel** | ✅ Complete | Persistent layout pane in `PANES_AREA` (placement `right`, width 340px), auto-accumulating history, engine badges (`LLM`/`MT`), fast copy. |
| **P4: Hotkeys & Palette** | ✅ Complete | Hotkeys `Alt+T` (clipboard), `Alt+Shift+T` (last turn), `Alt+P` (panel toggle). Commands registered in `PALETTE_AREA`. |
| **P5: Settings UI** | ✅ Complete | Editable target languages, engine mode picker (Auto/Fast MT/LLM), 5 theme presets (Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light), saved to `ctx.storage`. |
| **P6: Testing & Release** | ✅ Complete | Unit tests `test/unit.test.mjs` (6/6 passing), syntax check `node -c`, comprehensive bilingual documentation. |

---

## Verified Invariants

1. **Self-contained ESM:** `src/plugin.js` contains zero relative imports evaluated from blob URLs. Imports strictly limited to `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`.
2. **Style & Listener Isolation:** Styles injected once with element ID deduplication; `ctx.onDispose()` unbinds all window listeners and removes injected `<style>` tags.
3. **User Focus Protection:** Clicks inside editable fields are ignored; focus is never hijacked.
4. **Non-blocking UI:** All network requests wrapped with `AbortController` and deadlines; request races neutralized by monotonic sequence counter `sequenceRef`.
