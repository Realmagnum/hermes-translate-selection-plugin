# OpenCode → Hermes Desktop API & Architectural Mapping

[Русский](opencode-vs-hermes_RU.md)

## Direct Call & Hook Mapping

| OpenCode Translate Component | Hermes Desktop Equivalent | Source in OpenCode |
|---|---|---|
| `Plugin.define({ id, setup })` | `export default { id, name, defaultEnabled, register(ctx) }` | `src/index.ts:8-10` |
| `@opencode/plugin/gui.Ipc.define` | **Removed** (Hermes Desktop operates in a unified renderer context) | `src/contract.ts` (Effect Schema) |
| `Ipc.call("translate-selection.translate", ...)` | Native in-process `executeTranslate()` + direct `fetch()` for MT | `src/popup.tsx:194` |
| `client.session.generate({ sessionID, prompt })` | `host.request("llm.oneshot", { instructions, input, session_id })` | `src/llm-engine.ts:81` |
| `Store.global.get/set` | `ctx.storage.get/set` via `atom()` | `src/settings.ts` |
| SolidJS `<Portal>` | Standard fixed-position `<div>` with viewport boundary clamping | `src/popup.tsx:328-415` |
| `clipboard.writeText()` | `navigator.clipboard.writeText()` + `ctx.os.writeClipboard()` | `src/clipboard.ts` |
| Custom terminal TUI (`@opentui/solid`) | Side layout panel (`PANES_AREA`) + Command Palette (`PALETTE_AREA`) | `src/tui.tsx` |

---

## Architectural Differences

### OpenCode Desktop Plugin Architecture
- **Multi-Process Model:** GUI renderer process ↔ Main Electron process connected via an IPC bridge (`Ipc.define`).
- **Heavy Schema Validation:** Used `@effect/schema` for runtime contract enforcement between processes.
- **UI Framework:** SolidJS reactive primitives (`createSignal`, `<For>`, `<Show>`, `<Portal>`).
- **LLM Access:** Routed through OpenCode client SDK (`client.session.generate()`).

### Hermes Desktop Plugin Architecture
- **Unified Renderer Model:** The desktop plugin is loaded directly into the Electron client window as a plain ECMAScript Module (ESM).
- **Direct Network Access:** Standard `fetch()` calls execute directly in the renderer without requiring backend proxy shims for public MT APIs.
- **Native Gateway RPC:** The agent gateway provides `host.request("llm.oneshot", ...)` for stateless out-of-band completions on the active model.
- **UI Framework:** Standard React with `jsx()`/`jsxs()` runtime calls (no JSX transpilation step required).
- **Namespaced Storage:** Built-in isolated persistence via `ctx.storage.get()` / `ctx.storage.set()`.

---

## Porting Breakdown: 1-to-1 Logic vs Rewritten

### Ported 1-to-1 (Pure JavaScript Logic)
- **`detector.ts` → `isComplexFormattedText()`:** Pure regex heuristics analyzing code fences, markdown lists, headings, and API identifiers.
- **`shield.ts` → `shieldTokens()` & `unshieldTokens()`:** Mathematical marker shielding (`\u27A6N\u27A7`) preventing MT engines from corrupting code syntax.
- **`translate.ts` MT pipeline:** Cascaded fallback (Google MT `gtx` → Google `dict-chrome-ex` → `MyMemory API`) with memory caching and language heuristics.

### Rewritten for Hermes SDK
- **`popup.tsx` (SolidJS) → `SelectionPopupHost` (React):** Converted signals to React hooks (`useState`, `useRef`, `useCallback`) and DOM listeners to `useEffect` with cleanup on unmount.
- **`llm-engine.ts`:** Replaced `@opencode/plugin` session calls with native Hermes gateway `host.request("llm.oneshot")`.
- **`settings.ts` & `settings-view.tsx`:** Consolidated into reactive atoms (`nanostores`) backed by `ctx.storage` with collapsible controls inside the persistent side panel.
- **`index.ts` & `gui.tsx`:** Replaced by `src/plugin.js` registering layout panes in `PANES_AREA`, global statusbar listeners in `STATUSBAR_AREAS.right`, and keyboard commands in `PALETTE_AREA`.
