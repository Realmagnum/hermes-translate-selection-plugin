# Translate Selection — Hermes Desktop Plugin

[![Hermes Desktop](https://img.shields.io/badge/Hermes_Desktop-Plugin-blue.svg)](https://hermes-agent.nousresearch.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-8%20passed-brightgreen.svg)](#тестирование)

[English](README.md) · [Микроспецификация](docs/plans/microspec-v1_RU.md) · [Архитектура](docs/reference/opencode-vs-hermes_RU.md)

Мгновенный inline-перевод при выделении текста для **Hermes Desktop** и веб-клиента Hermes с интеллектуальной гибридной маршрутизацией (Smart Hybrid LLM/MT) на все языки.

Портирован с [opencode-translate-selection](https://github.com/Realmagnum/opencode-translate-selection) специально под архитектуру и SDK Hermes Desktop.

---

## ✨ Возможности

- **Перевод по выделению текста:** Выделите любой текст в чате или интерфейсе — сразу всплывает компактный тултип с переводом.
- **Интеллектуальная гибридная маршрутизация (Smart Hybrid Routing):**
  - **Простые фразы и отдельные слова:** Мгновенный многоуровневый машинный перевод (Google MT Tier 1 `gtx` → Tier 2 `dict-chrome-ex` → Tier 3 `MyMemory API`).
  - **Сложный текст и код:** Автоматическое распознавание списков, блоков кода, заголовков и вызовов функций → перевод через нативный RPC шлюза `llm.oneshot` без загрязнения истории переписки.
- **Индикация источника (Source Badges):** Четкие бейджи провайдера (`Google`, `LLM`, `MyMemory`) в строках тултипа и на карточках сайдбара.
- **Приоритет русского языка:** Умная детекция кириллицы предотвращает ложное определение коротких русских слов (например, *правая*) как белорусских (`be`) или украинских (`uk`).
- **Слияние двойного клика и драга (Coalescing):** Дебаунс 280 мс и алгоритм слияния объединяют клик по первому слову с последующим выделением всей фразы, предотвращая появление дубликатов и обрывков.
- **Token Shielding (экранирование токенов):** Идентификаторы кода, вызовы API, markdown-инлайн код и URL защищаются маркерами и не ломаются машинными переводчиками.
- **Боковая панель истории (`PANES_AREA`):** Полноценная правая панель с автоматической перемоткой к новым карточкам, кнопкой закрытия (`[X]`), ручным полем перевода и расширенными настройками.
- **Горячие клавиши и быстрое управление:**
  - `Alt+T` — перевести текст из буфера обмена (с автоматическим копированием перевода).
  - `Alt+Shift+T` — перевести последний ответ ассистента в боковую панель.
  - `Alt+P` — открыть / скрыть боковую панель перевода.
  - `Alt+Shift+O` — мгновенное включение / выключение автоперевода при выделении.
  - **Интерактивный чип в статус-баре:** Переключатель в нижнем правом углу (`● Перевод: Вкл` / `○ Перевод: Пауза`) для управления в 1 клик.
- **Синхронная мультиязычность:** Полная интеграция с `ctx.i18n` и `usePluginI18n` — интерфейс плагина синхронно меняет язык при переключении языка в Hermes Desktop (EN / RU).
- **Режимы истории:** Вся история (до 50 записей), Только последний перевод (1 карточка без накопления) или Отключена.
- **5 цветовых тем:** Amber Gold, Midnight OLED, Cyberpunk, Nordic Slate, Paper Light с поддержкой темы оформления Hermes.

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
curl -fsSL https://raw.githubusercontent.com/Realmagnum/hermes-translate-selection-plugin/master/src/plugin.js -o ~/.hermes/desktop-plugins/translate-selection/plugin.js
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$HOME\.hermes\desktop-plugins\translate-selection"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Realmagnum/hermes-translate-selection-plugin/master/src/plugin.js" -OutFile "$HOME\.hermes\desktop-plugins\translate-selection\plugin.js"
```

После копирования нажмите `Ctrl+K` (или `Cmd+K`) в Hermes Desktop → **Reload desktop plugins**.

---

## ⚙️ Настройки

Настройки открываются прямо в заголовке боковой панели (иконка шестеренки):
- **Целевые языки:** `ru, en`, либо любой список кодов через запятую (`ru, en, de, zh, ja`).
- **Режим работы:** Auto (Smart Hybrid), Fast MT Only, Session LLM Only.
- **Режим истории:** Вся история (до 50), Только последний, Отключена.
- **Задержка дебаунса:** 150 мс (быстро), 280 мс (оптимально), 450 мс (защита от двойного клика).
- **Авто-всплывание:** Включение/выключение всплывания тултипа при выделении мыши.
- **Темы оформления:** выбор из 5 палитр с автоматическим полупрозрачным блюром.

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
