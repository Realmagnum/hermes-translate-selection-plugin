# Hermes SDK Patterns — Lessons from Hermes Companion Plugins

[Русский](hermes-sdk-patterns_RU.md)

## 1. Selection Popup Pattern (from `SelectionPopupHost` in insight:829-942)

```javascript
// Key patterns for mouse gesture selection popups:

// A. Mouseup listener with debounce
const onMouseUp = () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const text = sel.toString().trim();
  if (!text.length) return;

  // Position relative to selection range
  const r = sel.getRangeAt(0).getBoundingClientRect();

  // Show popup with coordinates
  setPopup({ x: r.left + r.width / 2, y: r.top, text });
};
document.addEventListener("mouseup", onMouseUp);

// B. Selection change listener
document.addEventListener("selectionchange", () => {
  if (window.getSelection().isCollapsed) setPopup(null);
});

// C. Close on mousedown outside
const onMouseDown = (e) => {
  if (!e.target.closest("[data-translate]")) {
    setPopup(null);
  }
};
document.addEventListener("mousedown", onMouseDown);

// D. Escape key dismiss
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setPopup(null);
});
```

**Key Takeaway:** In `opencode-translate-selection`, the popup is rendered as a **fixed-position div** with calculated viewport coordinates, rather than via `<Portal>`. In Hermes Desktop Electron, the renderer has direct DOM access, so a fixed-position overlay div inside `SelectionPopupHost` works reliably without extra portal abstractions.

---

## 2. Storage Pattern (from insight:70-101)

```javascript
// atom-based state management with ctx.storage persistence
const settingsAtom = atom(DEFAULT_SETTINGS);

function loadSettings(storage) {
  try {
    const raw = storage.get("translate-selection.v1");
    if (!raw) return DEFAULT_SETTINGS;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function patchSettings(patch) {
  const next = { ...settingsAtom.get(), ...patch };
  settingsAtom.set(next);
  if (_storage) {
    try {
      _storage.set("translate-selection.v1", JSON.stringify(next));
    } catch {}
  }
  return next;
}
```

**Pattern:** Store settings under a single namespaced key in `ctx.storage` as a serialized JSON string. Manage reactive state using `nanostores`/`atom` from `@hermes/plugin-sdk`.

---

## 3. Gateway Communication & Stateless LLM Execution

```javascript
// Built-in JSON-RPC gateway methods:

// A. Provider and Model options
const r = await host.request("model.options", { explicit_only: false });

// B. Stateless one-shot LLM completion on active session model
const res = await host.request("llm.oneshot", {
  instructions: "You are a professional translator...",
  input: textToTranslate,
  session_id: host.state.focusedSessionId?.get() || null,
  temperature: 0.1,
  max_tokens: 2048,
});

// C. AbortController for bounded timeouts
const ctrl = new AbortController();
const timeout = setTimeout(() => ctrl.abort(), 3500);
```

---

## 4. Layout Pane Registration (from hermes-desktop-plugins skill)

```javascript
import { PANES_AREA, PALETTE_AREA, STATUSBAR_AREAS, host } from "@hermes/plugin-sdk";
import { jsx } from "react/jsx-runtime";

export default {
  id: "translate-selection",
  name: "Translate Selection",
  defaultEnabled: true,
  register(ctx) {
    // 1. Right rail layout pane (sidebar beside chat)
    ctx.register({
      id: "pane",
      area: PANES_AREA,
      title: "Translation",
      data: { placement: "right", width: "340px" },
      render: () => jsx(TranslationPane, { ctx }),
    });

    // 2. Command Palette actions (Ctrl+K / Cmd+K)
    ctx.register({
      id: "palette.translate",
      area: PALETTE_AREA,
      data: {
        id: "translate.clipboard",
        label: "Translate: Clipboard (Alt+T)",
        run: () => translateClipboard(),
      },
    });
  },
};
```

---

## 5. CSS Injection Pattern (from insight:811-827)

```javascript
function ensureStyles() {
  const id = "translate-popup-styles";
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = `
    @keyframes translate-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .hermes-translate-popup { animation: translate-in .12s ease-out; }
  `;
  document.head.appendChild(s);
}
```

---

## 6. Critical Invariants & Pitfalls

| Pitfall | Solution |
|---|---|
| Text selection blocked (`user-select: none`) | Always set `-webkit-user-select: text !important; user-select: text !important;` on popup root and text children. |
| Relative module imports | The Hermes Desktop loader evaluates plain ESM from a `blob:` URL. Relative imports (`./foo.js`) fail. Keep `plugin.js` completely self-contained. |
| Window title drag zones | Header elements with `-webkit-app-region: drag` intercept clicks. Render interactive buttons only within the plugin pane body. |
| Plain ESM syntax | No Babel/TS build step in Electron plugin watcher. Construct React nodes with `jsx()` from `react/jsx-runtime`. |
| Directory name mismatch | Directory `~/.hermes/desktop-plugins/<id>/` must strictly match the plugin's exported `id`. |
| Memory/DOM leaks | Unbind all event listeners and remove injected `<style>` elements via `ctx.onDispose()`. |
