# Translate Selection — Hermes Desktop Plugin

[![Hermes Desktop](https://img.shields.io/badge/Hermes_Desktop-Plugin-blue.svg)](https://hermes-agent.nousresearch.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-6%20passed-brightgreen.svg)](#testing)

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
- **Token Shielding:** Code identifiers, API calls, inline code spans, and URLs are shielded with mathematical markers (`\u27A6N\u27A7`) to prevent machine translation engines from corrupting technical syntax.
- **Multi-Target Parallel Translation:** Translates simultaneously to multiple target languages (default: `ru, en`).
- **Source Language Auto-Filtering:** Automatically suppresses target languages matching the detected source (e.g. Russian text translates only to English; English translates only to Russian).
- **Persistent Side Panel (`PANES_AREA`):** Right-rail panel (340px) featuring a translation history feed, engine badges (`LLM`/`MT`), manual translation input, and settings controls.
- **Conflict-Free Hotkeys:**
  - `Alt+T` — Translate clipboard text (and automatically copies the translated result).
  - `Alt+Shift+T` — Translate the last assistant message into the side panel.
  - `Alt+P` — Toggle the persistent translation side panel.
- **5 Theme Presets:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, and Paper Light with native Hermes app theme blur and styling.
- **1-Click Copy:** Click any translation row to instantly copy its text to the clipboard.

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
cp src/plugin.js ~/.hermes/desktop-plugins/translate-selection/plugin.js
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$HOME\.hermes\desktop-plugins\translate-selection"
Copy-Item src\plugin.js "$HOME\.hermes\desktop-plugins\translate-selection\plugin.js"
```

After copying, press `Ctrl+K` (or `Cmd+K`) in Hermes Desktop → **Reload desktop plugins**.

---

## ⌨️ Command Palette

All commands are registered in the palette (`Ctrl+K` / `Cmd+K`):
- `Translate: Translate clipboard (Alt+T)`
- `Translate: Translate last assistant message (Alt+Shift+T)`
- `Translate: Toggle translation panel (Alt+P)`

---

## ⚙️ Settings

Configure the plugin directly from the side panel header (gear icon):
- **Target Languages:** Comma-separated list of language codes (default: `ru, en`, or e.g. `ru, en, de, zh, ja`).
- **Engine Mode:**
  - `Auto (Smart Hybrid)` — Automatic routing (LLM for structured text/code, MT for simple phrases).
  - `Fast MT Only` — Fast multi-tier machine translation without calling LLM.
  - `Session LLM Only` — Translates strictly using the active session language model.
- **Theme Preset:** Switch between 5 high-contrast presets with translucent background blur.

All settings are persisted in namespaced storage via `ctx.storage` (`translate-selection.v1`).

---

## 🛠️ Architecture & Tree-Docs

Organized according to **tree-docs** and **microspec** standards:

```
📁 hermes-translate-selection-plugin/
├── AGENTS.md                  # Agent entrypoint and navigation map (EN)
├── AGENTS_RU.md               # Agent entrypoint and navigation map (RU)
├── README.md                  # Main project guide (EN)
├── README_RU.md               # Project guide in Russian (RU)
├── docs/
│   ├── plans/
│   │   ├── microspec-v1.md    # Micro-specification and implementation phases (EN)
│   │   └── microspec-v1_RU.md # Micro-specification and implementation phases (RU)
│   └── reference/
│       ├── hermes-sdk-patterns.md     # Hermes SDK architectural lessons (EN)
│       ├── hermes-sdk-patterns_RU.md  # Hermes SDK architectural lessons (RU)
│       ├── opencode-vs-hermes.md      # Contract & API mapping from OpenCode (EN)
│       └── opencode-vs-hermes_RU.md   # Contract & API mapping from OpenCode (RU)
├── src/
│   └── plugin.js              # Fully self-contained ESM desktop plugin bundle
└── test/
    └── unit.test.mjs          # Automated unit test suite
```

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
