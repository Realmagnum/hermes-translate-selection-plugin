# Translate Selection — Hermes Desktop Plugin

**Instant inline translation tooltip on text selection.** Smart Hybrid LLM/MT routing across all languages.

## Features

- **Mouse gesture translate:** Select any text in the chat → popup appears with translation results
- **Hybrid routing:** Auto-detects complex/formatted text → uses LLM; simple text → fast MT (Google gtx/dict-chrome-ex/MyMemory)
- **Token shielding:** Protects code, URLs, and technical identifiers from being mangled by MT engines
- **Multi-target:** Translate to multiple languages simultaneously (default: `ru, en`)
- **Persistent panel:** Side-by-side pane for tracking translation history
- **Hotkeys:** `Alt+T` (clipboard), `Alt+Shift+T` (last message), `Alt+P` (panel toggle)
- **Theme presets:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light

## Installation

```bash
hermes plugins install Realmagnum/hermes-translate-selection-plugin
hermes plugins enable translate-selection
```

## Structure

```
src/
├── plugin.js          # Entry point, registers pane + palette commands
├── selection.js       # Text selection detection & popup rendering (React)
├── translate.js       # Hybrid LLM/MT engine (port from opencode-translate-selection)
├── storage.js         # Settings persistence via ctx.storage
└── settings.js        # React forms for configuration modal

docs/plans/
└── microspec-v1.md    # MVP plan, phases, architecture

reference/
├── hermes-sdk-patterns.md  # Lessons from hermes-insight analysis
└── opencode-vs-hermes.md   # OpenCode→Hermes API mapping
```

## Development

Edit `src/plugin.js` directly — it loads as plain ESM without compilation. Hermes Desktop watches for changes and hot-reloads automatically.

To test locally:
```bash
cp src/plugin.js ~/.hermes/desktop-plugins/translate-selection/plugin.js
# Then ⌘K / Ctrl+K → Reload desktop plugins in Hermes Desktop
```

## License

MIT — see LICENSE file. Forks and modifications welcome.

## Acknowledgements

Based on [opencode-translate-selection](https://github.com/Realmagnum/opencode-translate-selection). Adapted for Hermes Desktop using patterns from [hermes-insight](https://github.com/BrokeSkill/Hermes-Insight).
