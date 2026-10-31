# AGENTS.md — Tree-Docs Navigation Root

[Русский](AGENTS_RU.md)

**Project:** `hermes-translate-selection-plugin` — Hermes Desktop & WebApp plugin for instant inline translation tooltip on text selection. Smart Hybrid LLM/MT routing, React JSX runtime rendering, self-contained plain ESM.

## Documentation Map (tree-docs)

```
📁 docs/          ← Project specifications and reference materials
├── plans/        ← Active plans and phase tracking
│   ├── microspec-v1.md     ← MVP scope, phases & delivery status (EN)
│   └── microspec-v1_RU.md  ← MVP scope, phases & delivery status (RU)
└── reference/    ← Upstream architecture and contract mappings
    ├── hermes-sdk-patterns.md     ← Lessons from Hermes SDK & companion plugins (EN)
    ├── hermes-sdk-patterns_RU.md  ← Lessons from Hermes SDK & companion plugins (RU)
    ├── opencode-vs-hermes.md      ← API & architectural mapping from OpenCode (EN)
    └── opencode-vs-hermes_RU.md   ← API & architectural mapping from OpenCode (RU)

📁 src/           ← Source code
└── plugin.js     ← Fully self-contained ESM plugin entrypoint

📁 test/          ← Test suite
└── unit.test.mjs ← Unit tests for core functions (node:test)

📄 README.md      ← Main user documentation (EN)
📄 README_RU.md   ← User documentation (RU)
📄 LICENSE        ← MIT License
```

## Agent Operating Guidelines

1. **Start with `docs/plans/microspec-v1.md`** — review scope, phase statuses, and architectural invariants before proposing changes.
2. **Review `docs/reference/*.md`** before touching runtime integrations — leverage verified SDK patterns and RPC contracts (`llm.oneshot`, `host.request`).
3. **Keep `src/plugin.js` self-contained** — the Hermes Desktop plugin loader evaluates code from a `blob:` URL; relative imports (`./foo.js`) are rejected.
4. **Do not mutate code for cosmetic reasons.** Changes must solve real functional, reliability, or UX requirements.
5. **Reference files as `path:line`**, avoid dumping whole files into chat.

## Key Constraints & Invariants

- **Import boundaries:** Allowed imports are strictly `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`. External npm packages cannot be imported.
- **Plain ESM:** The file is evaluated without compilation; construct UI elements using `jsx()` / `jsxs()` from `react/jsx-runtime`.
- **Plugin ID matching:** Folder name `~/.hermes/desktop-plugins/<id>/` must strictly match the exported `id: 'translate-selection'`.
- **Popup overlay:** Rendered as fixed-position element (`position: fixed`) with boundary checks against viewport edges and selection clearance.
