# Hermes SDK Patterns — уроки из hermes-insight

## 1. Selection Popup Pattern (из `SelectionPopupHost` в insight:829-942)

```javascript
// Ключевые паттерны для popup при выделении текста:

// A. Mouseup listener с debounce
const onMouseUp = () => {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const text = sel.toString().trim()
  if (!text.length) return
  
  // Позиция: относительно выделения
  const r = sel.getRangeAt(0).getBoundingClientRect()
  
  // Показываем popup с координатами
  setPopup({ x: r.left + r.width / 2, y: r.top, text })
}
document.addEventListener("mouseup", onMouseUp)

// B. Selection change listener (для отладки, если нужно)
document.addEventListener("selectionchange", () => {
  if (window.getSelection().isCollapsed) setPopup(null)
})

// C. Закрытие при клике вне popup
const onMouseDown = (e) => {
  if (!e.target.closest("[data-insight]")) {
    setPopup(null)
  }
}
document.addEventListener("mousedown", onMouseDown)

// D. Escape закрывает
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setPopup(null)
})
```

**Важно:** В opencode-translate-selection popup рисуется как **fixed-position div** с абсолютными координатами (popup.tsx:40-63), а не через `<Portal>`. Это потому что opencode плагин загружается в renderer-процесс Electron и имеет доступ к DOM напрямую. В Hermes Desktop аналогично — плагин рендерится в webview/renderer, fixed div работает.

## 2. Storage Pattern (из insight:70-101)

```javascript
// atom-based state management (hermes SDK pattern)
const settingsAtom = atom(DEFAULT_SETTINGS)

function loadSettings(storage) {
  try {
    const raw = storage.get("settings.v1")
    if (!raw) return DEFAULT_SETTINGS
    return JSON.parse(raw)
  } catch {
    return DEFAULT_SETTINGS
  }
}

function patchSettings(patch) {
  const next = { ...settingsAtom.get(), ...patch }
  settingsAtom.set(next)
  if (_storage) {
    try { _storage.set("settings.v1", JSON.stringify(next)) } catch {}
  }
  return next
}
```

**Паттерн:** Единый ключ `"settings.v1"` в `ctx.storage`, полный JSON. Атомарные обновления через `{...state, ...patch}`.

## 3. Gateway Communication (из insight:770-809, 1026-1065)

```javascript
// Два пути связи с бэкендом:

// A. Через host.request() - вызовы API шлюза Hermes
const r = await host.request("model.options", { explicit_only: false })
// Или:
const execP = host.request("cli.exec", { argv: ["insight", "--term", term], timeout: 240 })

// B. Для LLM translation: session.generate через cli.exec
// В opencode это client.session.generate({ sessionID, prompt })
// В Hermes — используем host.request("session.generate", ...) или 
//   host.request("cli.exec", { argv: ["generate", "..."] })

// C. AbortController для таймаутов
const ctrl = new AbortController()
const aborted = new Promise((_, reject) => {
  const onAbort = () => { ctrl.signal.removeEventListener("abort", onAbort); reject(new Error("Aborted")) }
  if (ctrl.signal.aborted) onAbort()
  else ctrl.signal.addEventListener("abort", onAbort)
})
await Promise.race([execP, aborted])
```

## 4. Pane Registration (из hermes-desktop-plugins skill)

```javascript
import { PANES_AREA, PALETTE_AREA, STATUSBAR_AREAS, host, jsx } from "@hermes/plugin-sdk"

export default {
  id: "translate-selection",
  name: "Translate Selection",
  defaultEnabled: true,
  register(ctx) {
    ctx.register({
      id: "pane",
      area: PANES_AREA,
      title: "Translation",
      data: { placement: "right", width: "320px" },
      render: () => jsx(TranslationPane, { ctx })
    })
    
    ctx.register({
      id: "palette.translate",
      area: PALETTE_AREA,
      data: { id: "translate.open", label: "Translate selection", run: () => {/* ... */} }
    })
  }
}
```

## 5. CSS Injection Pattern (из insight:811-827, 946-967)

```javascript
function ensureStyles() {
  if (document.getElementById("translate-styles")) return
  const s = document.createElement("style")
  s.id = "translate-styles"
  s.textContent = `
    @keyframes translate-in{from{opacity:0;transform:translateY(4px)}to{opacity:1}}
    .translate-popup{animation:translate-in .1s ease-out}
    /* ... ваши стили ... */
  `
  document.head.appendChild(s)
}
```

## 6. Pitfalls (из hermes-desktop-plugins skill)

| Проблема | Решение |
|----------|---------|
| Text selection blocked (`user-select: none`) | Добавьте `-webkit-user-select: text !important` на контейнер popup |
| Window title drag zones | Не рендерите интерактивный контент в заголовках панелей shell |
| No JSX compilation | Используйте `jsx()`/`jsxs()` из `'react/jsx-runtime'`, никаких тегов вроде `<div>` |
| Directory name mismatch | Каталог `~/.hermes/desktop-plugins/<id>/` должен совпадать с `id` в export |
| DOM leak | Все добавленные `<style>`, listeners, timers — чистить через `ctx.onDispose()` |

