# Translate Selection — Hermes Desktop Plugin

[![Hermes Desktop](https://img.shields.io/badge/Hermes_Desktop-Plugin-blue.svg)](https://hermes-agent.nousresearch.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-6%20passed-brightgreen.svg)](#тестирование)

[English](README.md) · [Микроспецификация](docs/plans/microspec-v1_RU.md) · [Архитектура](docs/reference/opencode-vs-hermes_RU.md)

Мгновенный inline-перевод при выделении текста для **Hermes Desktop** и веб-клиента Hermes с интеллектуальной гибридной маршрутизацией (Smart Hybrid LLM/MT) на все языки.

Портирован с [opencode-translate-selection](https://github.com/Realmagnum/opencode-translate-selection) специально под архитектуру и SDK Hermes Desktop.

---

## ✨ Возможности

- **Перевод по выделению текста:** Выделите любой текст в чате или интерфейсе — сразу всплывает компактный тултип с переводом.
- **Интеллектуальная гибридная маршрутизация (Smart Hybrid Routing):**
  - **Простые фразы и отдельные слова:** Мгновенный многоуровневый машинный перевод (Google MT Tier 1 `gtx` → Tier 2 `dict-chrome-ex` → Tier 3 `MyMemory API`).
  - **Сложный текст и код:** Автоматическое распознавание списков, блоков кода, заголовков и вызовов функций → перевод через нативный RPC шлюза `llm.oneshot` без загрязнения истории переписки.
- **Token Shielding (экранирование токенов):** Идентификаторы кода, вызовы API, markdown-инлайн код и URL защищаются маркерами и не ломаются машинными переводчиками.
- **Параллельный мультиязычный перевод:** Одновременный перевод на несколько языков (по умолчанию `ru, en`).
- **Автоотсечение исходного языка:** Если текст уже на русском — переводит только на английский; если на английском — только на русский.
- **Боковая панель истории (`PANES_AREA`):** Полноценная правая панель с лентой истории, бейджами используемого движка (`LLM`/`MT`) и ручным полем перевода.
- **Горячие клавиши (Hotkeys):**
  - `Alt+T` — перевести текст из буфера обмена (с автоматическим копированием перевода).
  - `Alt+Shift+T` — перевести последний ответ ассистента в боковую панель.
  - `Alt+P` — открыть / скрыть боковую панель перевода.
- **5 цветовых тем:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light с поддержкой темы оформления Hermes.
- **Копирование в 1 клик:** Клик по строке перевода мгновенно копирует результат в буфер обмена.

---

## 📦 Установка

### Вариант 1. Установка через каталог плагинов Hermes

```bash
hermes plugins install Realmagnum/hermes-translate-selection-plugin
hermes plugins enable translate-selection
```

### Вариант 2. Локальная разработка и ручная установка

Скопируйте `src/plugin.js` в папку десктоп-плагинов:

**Linux / macOS:**
```bash
mkdir -p ~/.hermes/desktop-plugins/translate-selection
cp src/plugin.js ~/.hermes/desktop-plugins/translate-selection/plugin.js
```

**Windows:**
```powershell
New-Item -ItemType Directory -Force "$HOME\.hermes\desktop-plugins\translate-selection"
Copy-Item src\plugin.js "$HOME\.hermes\desktop-plugins\translate-selection\plugin.js"
```

После копирования нажмите `Ctrl+K` (или `Cmd+K`) в Hermes Desktop → **Reload desktop plugins**.

---

## ⌨️ Команды палитры (Command Palette)

Все действия доступны через палитру `Ctrl+K` / `Cmd+K`:
- `Translate: Перевести буфер обмена (Alt+T)`
- `Translate: Перевести последний ответ ассистента (Alt+Shift+T)`
- `Translate: Открыть / закрыть панель перевода (Alt+P)`

---

## ⚙️ Настройки

Настройки открываются прямо в заголовке боковой панели (иконка шестеренки):
- **Целевые языки:** `ru, en`, либо любой список кодов через запятую (`ru, en, de, zh, ja`).
- **Режим работы:**
  - `Auto (Smart Hybrid)` — автоматический выбор (LLM для кода/списков, MT для короткого текста).
  - `Fast MT Only` — быстрый перевод только через сетевые MT (без обращения к LLM).
  - `Session LLM Only` — перевод строго через языковую модель сессии.
- **Темы оформления:** выбор из 5 палитр с автоматическим полупрозрачным блюром.

---

## 🛠️ Архитектура и Tree-Docs

Проект организован по стандартам документации **tree-docs** и **microspec**:

```
📁 hermes-translate-selection-plugin/
├── AGENTS.md                  # Точка входа для AI-ассистентов (EN)
├── AGENTS_RU.md               # Точка входа для AI-ассистентов (RU)
├── README.md                  # Основное руководство (EN)
├── README_RU.md               # Руководство на русском языке (RU)
├── docs/
│   ├── plans/
│   │   ├── microspec-v1.md    # Микроспецификация и этапы разработки (EN)
│   │   └── microspec-v1_RU.md # Микроспецификация и этапы разработки (RU)
│   └── reference/
│       ├── hermes-sdk-patterns.md     # Паттерны Hermes SDK (EN)
│       ├── hermes-sdk-patterns_RU.md  # Паттерны Hermes SDK (RU)
│       ├── opencode-vs-hermes.md      # Маппинг контрактов и архитектурных различий (EN)
│       └── opencode-vs-hermes_RU.md   # Маппинг контрактов и архитектурных различий (RU)
├── src/
│   └── plugin.js              # Самодостаточный чистый ESM модуль плагина
└── test/
    └── unit.test.mjs          # Модульные тесты для чистых функций ядра
```

---

## 🧪 Тестирование

Запуск модульных тестов:
```bash
node --test test/unit.test.mjs
```

Проверка синтаксиса модуля:
```bash
node -c src/plugin.js
```

---

## 📄 Лицензия

MIT License © 2026 [Realmagnum](https://github.com/Realmagnum).
