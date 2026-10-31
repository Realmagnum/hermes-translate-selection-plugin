# Translate Selection — Hermes Desktop Plugin

[![Hermes Desktop](https://img.shields.io/badge/Hermes_Desktop-Plugin-blue.svg)](https://hermes-agent.nousresearch.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-8%20passed-brightgreen.svg)](#testing)

[Русский](README_RU.md) · [Micro-Spec](docs/plans/microspec-v1.md) · [Architecture](docs/reference/opencode-vs-hermes.md)

**Instant inline translation tooltip on text selection for Hermes Desktop & WebApp** with Smart Hybrid LLM/MT routing across all languages.

Ported from [opencode-translate-selection](https://github.com/Realmagnum/opencode-translate-selection) specifically for the Hermes Desktop plugin architecture and SDK.

---

## 📚 Documentation Map

| Need | Read |
|---|---|
| Installation and quick start | [Quick Start](#-installation) · [Settings](#️-settings) |
| Architecture and OpenCode contract differences | [OpenCode vs Hermes](docs/reference/opencode-vs-hermes.md) · [SDK Patterns](docs/reference/hermes-sdk-patterns.md) |
| Development phases & micro-spec | [Micro-Spec v1](docs/plans/microspec-v1.md) · [Agent Guidelines](AGENTS.md) |
| Russian documentation layer | [README (RU)](README_RU.md) · [Micro-Spec (RU)](docs/plans/microspec-v1_RU.md) · [AGENTS (RU)](AGENTS_RU.md) |

---

## ✨ Features

- **Instant Selection Tooltip:** Select any text anywhere in the chat or app — a non-intrusive floating tooltip appears instantly with translations.
- **Smart Hybrid Routing:**
  - **Simple phrases & short sentences:** Instant multi-tier machine translation (Google MT Tier 1 `gtx` → Tier 2 `dict-chrome-ex` → Tier 3 `MyMemory API`).
  - **Complex, structured & code text:** Automatic heuristic detection of lists, code blocks, function calls, headers, and parameters → routed to the session LLM via the native Hermes gateway RPC `llm.oneshot` without polluting conversation history.
- **Source Badges:** Clear indication of translation engine (`Google`, `LLM`, `MyMemory`) on both tooltip rows and sidebar cards.
- **Russian Language Priority:** Smart Cyrillic disambiguation prevents common Russian words (e.g. *правая*) from falsely detecting as Belarusian (`be`) or Ukrainian (`uk`).
- **Token Shielding:** Code identifiers, API calls, inline code spans, and URLs are shielded with mathematical markers (`\u27A6N\u27A7`) to prevent machine translation engines from corrupting technical syntax.
- **Double-Click & Drag Coalescing:** Intelligent 280ms debounce and history coalescing merge single-word clicks into extended phrase selections instead of spawning fragmented duplicate cards.
- **Persistent Side Panel (`PANES_AREA`):** Right-rail panel (340px) featuring a translation history feed with auto-scroll, close button (`[X]`), manual translation input, and rich settings.
- **Conflict-Free Hotkeys & Quick Toggles:**
  - `Alt+T` — Translate clipboard text (and automatically copies the translated result).
  - `Alt+Shift+T` — Translate the last assistant message into the side panel.
  - `Alt+P` — Toggle the persistent translation side panel.
  - `Alt+Shift+O` — Quick toggle auto-popup on selection on/off.
  - **Interactive Status Bar Chip:** Live chip in the bottom right status bar (`● Translate: On` / `○ Translate: Paused`) for 1-click toggling.
- **Synchronous i18n:** Built with `ctx.i18n` and `usePluginI18n` — seamlessly re-renders all plugin UI when Hermes Desktop switches language (EN / RU).
- **Flexible History Modes:** Full history (up to 50 entries), Latest only (single card), or Disabled.
- **5 Theme Presets:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, and Paper Light with native Hermes app theme blur and styling.

---

## 📦 Installation

### Option A: Install via Hermes Plugin Catalog

```bash
hermes plugins install Realmagnum/hermes-translate-selection-plugin
hermes plugins enable translate-selection
```

### Option B: Local Development / Manual Installation

Copy `src/plugin.js` into your Hermes desktop plugins directory:

**Linux / macOS:**
```bash
mkdir -p ~/.hermes/desktop-plugins/translate-selection
curl -fsSL https://raw.githubusercontent.com/Realmagnum/hermes-translate-selection-plugin/master/src/plugin.js -o ~/.hermes/desktop-plugins/translate-selection/plugin.js
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$HOME\.hermes\desktop-plugins\translate-selection"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Realmagnum/hermes-translate-selection-plugin/master/src/plugin.js" -OutFile "$HOME\.hermes\desktop-plugins\translate-selection\plugin.js"
```

After copying, press `Ctrl+K` (or `Cmd+K`) in Hermes Desktop → **Reload desktop plugins**.

---

## ⚙️ Settings

Configure the plugin directly from the side panel header (gear icon):
- **Target Languages:** Comma-separated list of language codes (default: `ru, en`).
- **Engine Mode:** Auto (Smart Hybrid), Fast MT Only, Session LLM Only.
- **History Mode:** Full history (up to 50), Keep latest only, or Disabled.
- **Debounce Delay:** 150ms (fast), 280ms (optimal), 450ms (double-click safe).
- **Auto-Popup:** Enable/disable auto-popup on mouse selection.
- **Theme Preset:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light.

All settings are persisted in namespaced storage via `ctx.storage` (`translate-selection.v1`).

---

## 🧪 Testing

Run automated unit tests:
```bash
node --test test/unit.test.mjs
```

Verify module syntax:
```bash
node -c src/plugin.js
```

---

## 📄 License

MIT License © 2026 [Realmagnum](https://github.com/Realmagnum).
