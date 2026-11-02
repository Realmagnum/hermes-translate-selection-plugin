/**
 * Translate Selection — Hermes Desktop Plugin
 *
 * Instant inline translation tooltip on text selection for Hermes Desktop.
 * Smart Hybrid LLM/MT routing across all languages:
 * - Simple phrases -> Fast Multi-tier MT (Google gtx -> dict-chrome-ex -> MyMemory)
 * - Complex/structured/code text -> Session LLM via native gateway `llm.oneshot`
 * - Automatic fail-safe fallback to Token-Shielded MT if LLM times out or errors
 *
 * Tiled Sidebar Architecture (PANES_AREA, placement: "right"):
 * - Tiles side-by-side with the chat session, never overlaps conversation text
 * - Responsive header: controls never squeezed out in narrow viewports
 * - Short badges in tooltip and sidebar: GGL, MYM, LLM
 * - Direct mode toggle button in sidebar header (AUTO ⇄ GGL ⇄ MYM ⇄ LLM)
 * - Guaranteed close button [X], status bar sync, and Alt+P toggle
 *
 * Fully self-contained ECMAScript Module (ESM) compatible with Hermes Desktop.
 *
 * @module hermes-translate-selection-plugin
 * @author Realmagnum
 * @license MIT
 */

import React from "react";

const { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } = React;
import {
  host,
  atom,
  useValue,
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Separator,
  Badge,
  Loader,
  EmptyState,
  ErrorState,
  Codicon,
  PANES_AREA,
  PALETTE_AREA,
  STATUSBAR_AREAS,
} from "@hermes/plugin-sdk";

const h = React.createElement;

/* ══════════════════════════════════════════════════════════════════════════
   1. CONSTANTS, THEMES & LOCALIZATION
   ══════════════════════════════════════════════════════════════════════════ */

const PLUGIN_ID = "translate-selection";
const PLUGIN_NAME = "Translate Selection";
const STORAGE_KEY = "translate-selection.v1";
const POPUP_CLASS = "hermes-translate-popup";

const DEFAULT_SETTINGS = {
  autoPopup: true,           // Quick toggle for mouse selection popup
  engineMode: "auto",        // 'auto' | 'google' | 'mymemory' | 'llm'
  targets: "ru, en",         // Target languages
  debounceMs: 280,           // Debounce delay to prevent premature triggers
  historyMode: "all",        // 'all' | 'latest' | 'off'
  historyLimit: 50,          // Max items in history
  llmTimeoutMs: 60000,       // 60s timeout for LLM reasoning models
  maxChars: 1500,            // Character truncation threshold
  maxHeight: 420,            // Popup height cap
  maxWidth: 560,             // Popup width cap
  fontSize: 12.5,            // Popup font size
  clearance: 52,             // Viewport clearance
  dropSourceLang: true,      // Suppress target language matching detected source
  themePreset: "amber",      // Active color preset
  uiLang: "auto",            // 'auto' | 'ru' | 'en'
  bgColor: "#2b220a",
  bgOpacity: 97,
  textColor: "#ffd75e",
  accentColor: "#c9a83f",
  borderRadius: 10,
  keyClipboard: "alt+t",
  keyLastTurn: "alt+shift+t",
  keyPanel: "alt+p",
  keyToggle: "alt+shift+o",
};

const THEME_PRESETS = [
  {
    id: "amber",
    name: "Amber Gold",
    bgColor: "#2b220a",
    bgOpacity: 97,
    textColor: "#ffd75e",
    accentColor: "#c9a83f",
  },
  {
    id: "midnight",
    name: "Midnight OLED",
    bgColor: "#090d16",
    bgOpacity: 98,
    textColor: "#6ee7b7",
    accentColor: "#38bdf8",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    bgColor: "#1a1a1a",
    bgOpacity: 97,
    textColor: "#facc15",
    accentColor: "#a3e635",
  },
  {
    id: "nordic",
    name: "Nordic Slate",
    bgColor: "#242933",
    bgOpacity: 97,
    textColor: "#eceff4",
    accentColor: "#88c0d0",
  },
  {
    id: "light",
    name: "Paper Light",
    bgColor: "#f8fafc",
    bgOpacity: 98,
    textColor: "#0f172a",
    accentColor: "#3b82f6",
  },
];

const LOCALES = {
  en: {
    loading: "Translating…",
    failed: "Translation failed",
    truncated: "Truncated",
    copy: "Click to copy",
    copied: "✓ Copied to clipboard",
    copyAll: "Copy all",
    emptyPanel: "Select text in chat",
    emptyDesc: "Instant translation results will appear here.",
    panelTitle: "Translation",
    clearHistory: "Clear history",
    closePanel: "Close panel",
    openPanel: "Panel",
    hidePanel: "Hide panel",
    settings: "Settings",
    save: "Save",
    saved: "Settings saved",
    close: "Close",
    targetLangs: "Target languages",
    langCodesLink: "ISO 639-1 language codes ↗",
    selectedLangs: "Active:",
    engineMode: "Engine mode",
    modeAuto: "Auto (Smart Hybrid)",
    modeGoogle: "Google MT Only",
    modeMyMemory: "MyMemory Only",
    modeLlm: "Session LLM Only",
    theme: "Color theme",
    debounceMs: "Selection debounce delay",
    llmTimeout: "LLM timeout",
    historyMode: "History mode",
    historyAll: "Full history (up to 50)",
    historyLatest: "Keep latest only",
    historyOff: "Disabled",
    autoPopup: "Auto-popup on selection",
    uiLang: "Interface language",
    uiLangAuto: "Auto (Follow Hermes)",
    uiLangRu: "Русский (Russian)",
    uiLangEn: "English",
    enabled: "Enabled",
    disabled: "Disabled",
    statusChipOn: "Translate: On",
    statusChipOff: "Translate: Off",
    statusChipTip: "Toggle translation and sidebar (Alt+Shift+O)",
    original: "Original",
    manualInputPlaceholder: "Paste text to translate (Ctrl+Enter to send)...",
    translateBtn: "Translate",
    sourceProvider: "Source",
    historyCleared: "History cleared",
  },
  ru: {
    loading: "Перевод…",
    failed: "Не удалось перевести",
    truncated: "Обрезано",
    copy: "Клик — копировать",
    copied: "✓ Скопировано в буфер",
    copyAll: "Копировать всё",
    emptyPanel: "Выделите любой текст в чате",
    emptyDesc: "Результаты мгновенного перевода отобразятся здесь.",
    panelTitle: "Перевод",
    clearHistory: "Очистить историю",
    closePanel: "Закрыть панель",
    openPanel: "Панель",
    hidePanel: "Скрыть панель",
    settings: "Настройки",
    save: "Сохранить",
    saved: "Настройки сохранены",
    close: "Закрыть",
    targetLangs: "Целевые языки",
    langCodesLink: "Коды языков (ISO 639-1) ↗",
    selectedLangs: "Выбрано:",
    engineMode: "Режим перевода",
    modeAuto: "Auto (Smart Hybrid)",
    modeGoogle: "Только Google MT",
    modeMyMemory: "Только MyMemory",
    modeLlm: "Session LLM Only",
    theme: "Цветовая тема",
    debounceMs: "Задержка выделения",
    llmTimeout: "Таймаут LLM",
    historyMode: "Режим истории",
    historyAll: "Вся история (до 50)",
    historyLatest: "Только последний",
    historyOff: "Отключена",
    autoPopup: "Авто-всплывание при выделении",
    uiLang: "Язык интерфейса",
    uiLangAuto: "Авто (как в Hermes)",
    uiLangRu: "Русский",
    uiLangEn: "English",
    enabled: "Включен",
    disabled: "Выключен",
    statusChipOn: "Перевод: Вкл",
    statusChipOff: "Перевод: Выкл",
    statusChipTip: "Переключить перевод и боковую панель (Alt+Shift+O)",
    original: "Оригинал",
    manualInputPlaceholder: "Вставьте текст для перевода (Ctrl+Enter для отправки)...",
    translateBtn: "Перевести",
    sourceProvider: "Источник",
    historyCleared: "История очищена",
  },
};

const LANGUAGE_NAMES = {
  ru: "Russian",
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  zh: "Chinese",
  ja: "Japanese",
  it: "Italian",
  pt: "Portuguese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  uk: "Ukrainian",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  fi: "Finnish",
  no: "Norwegian",
  cs: "Czech",
  he: "Hebrew",
  el: "Greek",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
};

/* ══════════════════════════════════════════════════════════════════════════
   2. REACTIVE STATE & STORAGE
   ══════════════════════════════════════════════════════════════════════════ */

let _storage = null;
let _os = null;
let _i18n = null;

const settingsAtom = atom(DEFAULT_SETTINGS);
const historyAtom = atom([]);
const localeBumpAtom = atom(0);

function loadSettings(storage) {
  try {
    const raw = storage && typeof storage.get === "function" ? storage.get(STORAGE_KEY) : null;
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function patchSettings(patch) {
  const current = settingsAtom.get();
  const next = { ...current, ...patch };
  settingsAtom.set(next);
  if (_storage && typeof _storage.set === "function") {
    try {
      _storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}

function addHistoryEntry(entry) {
  const cfg = settingsAtom.get();
  if (cfg.historyMode === "off") return;

  const list = historyAtom.get();
  const normalizedText = (entry.sourceText || "").trim();
  if (!normalizedText) return;

  if (list.length > 0 && (list[0].sourceText || "").trim() === normalizedText) {
    return;
  }

  let updatedList = list;
  if (
    list.length > 0 &&
    Date.now() - new Date(list[0].time).getTime() < 2200 &&
    normalizedText.startsWith((list[0].sourceText || "").trim())
  ) {
    updatedList = list.slice(1);
  }

  const newEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    time: new Date(),
    ...entry,
  };

  if (cfg.historyMode === "latest") {
    historyAtom.set([newEntry]);
  } else {
    const limit = cfg.historyLimit || 50;
    historyAtom.set([newEntry, ...updatedList.slice(0, limit - 1)]);
  }
}

function useT() {
  useValue(localeBumpAtom);
  const settings = useValue(settingsAtom);

  return useCallback(
    (key) => {
      if (settings.uiLang === "ru") return LOCALES.ru[key] || LOCALES.en[key] || key;
      if (settings.uiLang === "en") return LOCALES.en[key] || LOCALES.ru[key] || key;

      if (_i18n && typeof _i18n.t === "function") {
        try {
          const val = _i18n.t(key);
          if (val && val !== key) return val;
        } catch {}
      }

      try {
        const nav = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "ru").toLowerCase();
        if (nav.startsWith("ru") || nav.startsWith("be") || nav.startsWith("uk")) {
          return LOCALES.ru[key] || LOCALES.en[key] || key;
        }
      } catch {}

      return LOCALES.en[key] || LOCALES.ru[key] || key;
    },
    [settings.uiLang],
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. LANGUAGE HEURISTICS & TOKEN SHIELDING
   ══════════════════════════════════════════════════════════════════════════ */

function detectScriptLanguage(text) {
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return "zh";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[а-яё]/i.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/[\u0370-\u03ff]/.test(text)) return "el";
  if (/[\u0590-\u05ff]/.test(text)) return "he";
  return "en";
}

function refineDetectedLanguage(text, rawDetected, targetLangs) {
  const normDetected = (rawDetected || "").toLowerCase().split("-")[0];

  if (/[а-яё]/i.test(text)) {
    const hasUk = /[іїєґ]/i.test(text);
    const hasBe = /[ў]/i.test(text);
    const hasSouthSlavic = /[ђјљњћџѓѕ]/i.test(text);

    if (!hasUk && !hasBe && !hasSouthSlavic) {
      if (["be", "uk", "bg", "mk", "sr"].includes(normDetected) || !normDetected) {
        return "ru";
      }
    } else if (hasBe && !hasUk) {
      return "be";
    } else if (hasUk) {
      return "uk";
    }
    return normDetected || "ru";
  }

  return normDetected || detectScriptLanguage(text);
}

function targetLangName(code) {
  const norm = code.toLowerCase().trim().split("-")[0];
  return LANGUAGE_NAMES[norm] ?? code.toUpperCase();
}

const SHIELD_RE =
  /(`{1,3}[^`]+`{1,3}|\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+\([^)]*\)|\b(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*)/g;

function shieldTokens(text) {
  const tokens = [];
  const shielded = text.replace(SHIELD_RE, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `\u27A6${index}\u27A7`;
  });
  return { shielded, tokens };
}

function unshieldTokens(text, tokens) {
  if (!tokens || !tokens.length) return text;
  let out = text;
  tokens.forEach((token, index) => {
    const pattern = new RegExp(`\u27A6\\s*${index}\\s*\u27A7`, "g");
    out = out.replace(pattern, token);
  });
  return out;
}

function isComplexFormattedText(raw) {
  if (!raw) return false;
  const trimmed = raw.trim();

  if (
    trimmed.length < 40 &&
    !trimmed.includes("\n") &&
    !trimmed.includes("`") &&
    !trimmed.includes("{") &&
    !trimmed.includes("(")
  ) {
    return false;
  }

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length >= 2) {
    if (lines.some((l) => /^([•\-*+]|\d+[.)]|\d+-\d+)\s/.test(l))) return true;
    if (lines.some((l) => /^#{1,6}\s/.test(l))) return true;
    if (lines.some((l) => /^>\s?/.test(l))) return true;
  }

  if (/`{1,3}[^`]+`{1,3}/.test(trimmed)) return true;
  if (/\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(/.test(trimmed)) return true;
  if (/\{[\s\S]*:[ \t]*[\s\S]*\}/.test(trimmed)) return true;
  if (lines.length >= 3) return true;

  return false;
}

/**
 * Short badges in tooltip and sidebar:
 * - GGL (Google MT)
 * - MYM (MyMemory)
 * - LLM (Hermes LLM)
 */
function formatShortBadge(engineUsed, fallback = "google-gtx") {
  const norm = String(engineUsed || fallback).toLowerCase();
  if (norm === "llm") {
    return { label: "LLM", tone: "llm" };
  }
  if (norm === "mymemory") {
    return { label: "MYM", tone: "mymemory" };
  }
  return { label: "GGL", tone: "google" };
}

/* ══════════════════════════════════════════════════════════════════════════
   4. TRANSLATION ENGINES (MT + LLM ONESHOT)
   ══════════════════════════════════════════════════════════════════════════ */

const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
const CACHE_LIMIT = 500;
const memoryCache = new Map();

function rememberCache(key, value) {
  memoryCache.set(key, value);
  if (memoryCache.size <= CACHE_LIMIT) return;
  const oldest = memoryCache.keys().next();
  if (!oldest.done) memoryCache.delete(oldest.value);
}

function unescapeHtml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function requestJson(url, signal) {
  if (signal?.aborted) throw new Error("Call aborted");
  const headers = { accept: "application/json", "user-agent": USER_AGENT };
  const res = await fetch(url, { signal, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchGoogle(text, to, clientName, signal) {
  const url = `${GOOGLE_ENDPOINT}?client=${encodeURIComponent(clientName)}&sl=auto&tl=${encodeURIComponent(
    to,
  )}&dt=t&q=${encodeURIComponent(text)}`;
  const body = await requestJson(url, signal);

  const chunks = Array.isArray(body) ? body[0] : undefined;
  if (!Array.isArray(chunks)) throw new Error("Unexpected Google MT response shape");

  const translated = chunks
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : ""))
    .join("")
    .trim();

  if (!translated) throw new Error("Empty translation from Google MT");
  const detected = Array.isArray(body) && typeof body[2] === "string" ? body[2] : "";
  return {
    text: translated,
    detected,
    engineUsed: "google-gtx",
  };
}

async function fetchMyMemory(text, to, signal, fromLang) {
  const from = fromLang || detectScriptLanguage(text) || "en";
  const langpair = `${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text,
  )}&langpair=${langpair}`;
  const body = await requestJson(url, signal);

  const translated = body?.responseData?.translatedText;
  if (typeof translated !== "string" || !translated.trim()) {
    throw new Error(body?.responseDetails || "MyMemory returned empty result");
  }

  const detected =
    typeof body?.matches?.[0]?.["source-language"] === "string"
      ? body.matches[0]["source-language"]
      : from;

  return { text: unescapeHtml(translated.trim()), detected, engineUsed: "mymemory" };
}

async function translateWithMtFallback(text, to, signal, forcedEngine) {
  const key = `mt\0${forcedEngine || "auto"}\0${to}\0${text}`;
  const hit = memoryCache.get(key);
  if (hit !== undefined) return hit;

  if (forcedEngine === "mymemory") {
    const entry = await fetchMyMemory(text, to, signal);
    entry.engineUsed = "mymemory";
    rememberCache(key, entry);
    return entry;
  }

  try {
    const entry = await fetchGoogle(text, to, "gtx", signal);
    entry.engineUsed = "google-gtx";
    rememberCache(key, entry);
    return entry;
  } catch (errGtx) {}

  try {
    const entry = await fetchGoogle(text, to, "dict-chrome-ex", signal);
    entry.engineUsed = "google-gtx";
    rememberCache(key, entry);
    return entry;
  } catch (errDict) {}

  try {
    const entry = await fetchMyMemory(text, to, signal);
    entry.engineUsed = "mymemory";
    rememberCache(key, entry);
    return entry;
  } catch (errMyMem) {
    throw new Error(`All MT backends failed: ${errMyMem?.message || String(errMyMem)}`);
  }
}

function cleanLlmOutput(output, originalText) {
  let text = output.trim();
  if (!originalText.trim().startsWith("```") && text.startsWith("```") && text.endsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
  }
  text = text.replace(/^(?:Here is the translation|Вот перевод|Translation|Перевод):\s*\r?\n?/i, "").trim();
  return text;
}

async function translateWithLlmOneshot(text, targetLang, sessionId, timeoutMs, signal) {
  if (!host || typeof host.request !== "function") {
    throw new Error("Hermes host.request RPC unavailable");
  }

  const prompt = `Translate the following text to ${targetLangName(targetLang)}. Output ONLY the translation directly without quotes, preamble, or conversational comments:\n\n${text}`;
  const timeoutLimit = Math.max(15000, timeoutMs || 60000);
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutLimit);

  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error("LLM translation aborted"));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    timeoutCtrl.signal.addEventListener("abort", () => {
      reject(new Error(`LLM translation timed out (${Math.round(timeoutLimit / 1000)}s)`));
    }, { once: true });
  });

  try {
    const rpcPromise = host.request("llm.oneshot", {
      instructions: "You are a fast, professional translator.",
      input: prompt,
      task: "translation",
      session_id: sessionId || null,
      temperature: 0.1,
      max_tokens: 2048,
    });

    const res = await Promise.race([rpcPromise, abortPromise]);
    const payload = res?.result || res || {};
    const rawText = payload.text || payload.output || "";
    if (!rawText.trim()) throw new Error("Empty translation from LLM");

    return cleanLlmOutput(rawText, text);
  } finally {
    clearTimeout(timer);
  }
}

async function executeTranslate(input, signal) {
  const rawText = input.text.replace(/\r/g, "").trim();
  const targets = [...new Set(input.targets.map((lang) => lang.trim().toLowerCase()).filter(Boolean))];

  if (!rawText) return { detected: "", results: [] };

  const mode = input.engineMode ?? "auto";
  const isComplex = isComplexFormattedText(rawText);
  const shouldTryLlm = mode === "llm" || (mode === "auto" && isComplex);

  const scriptGuess = detectScriptLanguage(rawText);
  const dropSource = input.dropSourceLang !== false;
  const initialTargets = dropSource
    ? targets.filter((t) => t.toLowerCase().split("-")[0] !== scriptGuess)
    : targets;
  const targetsToTranslate = initialTargets.length > 0 ? initialTargets : targets;

  // 1. LLM Translation Path
  if (shouldTryLlm) {
    try {
      const llmSettled = await Promise.allSettled(
        targetsToTranslate.map(async (target) => {
          const cacheKey = `llm\0${target}\0${rawText}`;
          const cached = memoryCache.get(cacheKey);
          if (cached) return cached;

          const translatedText = await translateWithLlmOneshot(
            rawText,
            target,
            input.sessionID,
            input.llmTimeoutMs,
            signal,
          );
          const entry = { text: translatedText, detected: scriptGuess, engineUsed: "llm" };
          rememberCache(cacheKey, entry);
          return entry;
        }),
      );

      const fulfilled = llmSettled.filter((r) => r.status === "fulfilled");
      if (fulfilled.length > 0) {
        const results = llmSettled.map((r, index) => {
          const lang = targetsToTranslate[index] ?? "";
          if (r.status === "fulfilled") {
            return { lang, text: r.value.text, engineUsed: "llm" };
          }
          return { lang, text: "", engineUsed: "llm", error: r.reason?.message || String(r.reason) };
        });
        return { detected: scriptGuess, results };
      }

      const firstRejected = llmSettled.find((r) => r.status === "rejected");
      const errMsg = firstRejected?.reason?.message || "LLM translation failed";

      if (mode === "llm") {
        return {
          detected: scriptGuess,
          results: targetsToTranslate.map((lang) => ({
            lang,
            text: "",
            engineUsed: "llm",
            error: errMsg,
          })),
        };
      }
    } catch (llmErr) {
      if (mode === "llm") {
        return {
          detected: scriptGuess,
          results: targetsToTranslate.map((lang) => ({
            lang,
            text: "",
            engineUsed: "llm",
            error: llmErr?.message || String(llmErr),
          })),
        };
      }
    }
  }

  // 2. MT Pipeline
  const { shielded, tokens } = shieldTokens(rawText);

  const settled = await Promise.allSettled(
    targetsToTranslate.map((lang) =>
      translateWithMtFallback(shielded, lang, signal, mode === "mymemory" ? "mymemory" : mode === "google" ? "google" : undefined)
    ),
  );

  const rawDetected =
    settled
      .map((result) => (result.status === "fulfilled" ? result.value.detected : ""))
      .find(Boolean) || scriptGuess;

  const detected = refineDetectedLanguage(rawText, rawDetected, targets);

  const results = settled.map((result, index) => {
    const lang = targetsToTranslate[index] ?? "";
    if (result.status === "fulfilled") {
      const unshielded = unshieldTokens(result.value.text, tokens);
      return { lang, text: unshielded, engineUsed: result.value.engineUsed };
    }
    return {
      lang,
      text: "",
      engineUsed: mode === "mymemory" ? "mymemory" : "google-gtx",
      error: result.reason?.message || "Translation failed",
    };
  });

  const useful = dropSource
    ? results.filter((r) => r.lang.toLowerCase().split("-")[0] !== detected.toLowerCase().split("-")[0] || r.error)
    : results;

  return { detected, results: useful.length > 0 ? useful : results };
}

/* ══════════════════════════════════════════════════════════════════════════
   5. UI UTILITIES & STYLES
   ══════════════════════════════════════════════════════════════════════════ */

function hexToRgba(hex, alpha) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (isNaN(num)) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function writeClipboardText(text) {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  if (_os && typeof _os.writeClipboard === "function") {
    try {
      _os.writeClipboard(text);
    } catch {}
  }
}

function ensurePopupStyles(settings) {
  const styleId = "hermes-translate-selection-styles";
  if (document.getElementById(styleId)) return;

  const s = document.createElement("style");
  s.id = styleId;

  s.textContent = `
    @keyframes hermes-translate-in {
      from { opacity: 0; transform: translateY(4px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .${POPUP_CLASS} {
      animation: hermes-translate-in 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      -webkit-user-select: text !important;
      user-select: text !important;
      box-shadow: 0 16px 38px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.25);
    }
    .${POPUP_CLASS} * {
      box-sizing: border-box;
    }
    .hermes-tr-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 3px 6px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .hermes-tr-row:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .hermes-tr-code {
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      padding: 1px 4px;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.18);
      border: 1px solid var(--ui-stroke-secondary, rgba(128, 128, 128, 0.25));
      color: var(--ui-accent, #38bdf8);
      font-size: 0.9em;
    }
    .hermes-tr-btn-ghost {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--ui-text-tertiary);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      transition: all 0.1s ease;
    }
    .hermes-tr-btn-ghost:hover {
      color: var(--ui-text-primary);
      background: var(--chrome-action-hover, rgba(128, 128, 128, 0.15));
    }
    .hermes-tr-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .hermes-tr-badge-google {
      background: rgba(59, 130, 246, 0.16);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }
    .hermes-tr-badge-mymemory {
      background: rgba(168, 85, 247, 0.16);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.35);
    }
    .hermes-tr-badge-llm {
      background: rgba(234, 179, 8, 0.18);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.4);
    }
    .hermes-tr-card {
      border-radius: var(--radius-lg, 8px);
      border: 1px solid var(--ui-stroke-secondary, rgba(128, 128, 128, 0.22));
      background: var(--card, var(--ui-bg-elevated, rgba(255, 255, 255, 0.04)));
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      transition: border-color 0.15s ease;
    }
    .hermes-tr-card:hover {
      border-color: var(--ui-accent, rgba(128, 128, 128, 0.4));
    }
  `;
  document.head.appendChild(s);
}

function FormattedTranslation({ text, settings }) {
  if (!text) return null;
  const lines = text.split("\n");

  return h("div", {
    style: {
      color: settings.textColor,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      lineHeight: 1.45,
    },
  }, lines.map((line, lIdx) => {
    const parts = [];
    const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match;

    while ((match = tokenRe.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const tok = match[0];
      if (tok.startsWith("**") && tok.endsWith("**")) {
        parts.push(
          h("strong", {
            key: `b-${lIdx}-${match.index}`,
            style: { fontWeight: 650, color: settings.accentColor },
          }, tok.slice(2, -2))
        );
      } else if (tok.startsWith("`") && tok.endsWith("`")) {
        parts.push(
          h("code", {
            key: `c-${lIdx}-${match.index}`,
            className: "hermes-tr-code",
          }, tok.slice(1, -1))
        );
      }
      lastIndex = match.index + tok.length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return h("div", {
      key: lIdx,
      style: { minHeight: line.trim() === "" ? "0.6em" : "auto" },
    }, parts.length > 0 ? parts : "\u00A0");
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   6. PANE REVEAL & TOGGLE HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function isPaneCurrentlyVisible() {
  if (host && typeof host.paneVisibility === "function") {
    try {
      const atom = host.paneVisibility("translate-selection:pane");
      if (atom && typeof atom.get === "function") {
        return atom.get() === true;
      }
    } catch {}
  }
  return false;
}

function revealTranslatePane(ctx) {
  if (host && typeof host.revealPane === "function") {
    try {
      host.revealPane("translate-selection:pane");
      return;
    } catch {}
  }
  if (ctx && typeof ctx.runAction === "function") {
    try { ctx.runAction("view.toggleRightSidebar"); } catch {}
  }
}

function closeTranslatePane(ctx) {
  if (ctx && typeof ctx.runAction === "function") {
    try { ctx.runAction("view.toggleRightSidebar"); } catch {}
  }
}

function toggleTranslatePane(ctx) {
  if (isPaneCurrentlyVisible()) {
    closeTranslatePane(ctx);
  } else {
    revealTranslatePane(ctx);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   7. SELECTION POPUP HOST & STATUSBAR COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

function SelectionPopupHost({ ctx }) {
  const settings = useValue(settingsAtom);
  const t = useT();

  const [view, setView] = useState(null);
  const [copied, setCopied] = useState(false);

  const rootRef = useRef(null);
  const pinnedRef = useRef(false);
  const sequenceRef = useRef(0);
  const abortCtrlRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const hide = useCallback(() => {
    sequenceRef.current++;
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    pinnedRef.current = false;
    setCopied(false);
    setView(null);
  }, []);

  const runTranslation = useCallback(
    async (text, truncated, place) => {
      const id = ++sequenceRef.current;
      abortCtrlRef.current?.abort();
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      setCopied(false);
      setView({ ...place, text, truncated, results: [], detected: "", loading: true });

      const currentCfg = settingsAtom.get();
      const targets = currentCfg.targets
        .split(/[,;\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const focusedSid =
        host?.state?.focusedSessionId?.get?.() ||
        host?.state?.activeSessionId?.get?.() ||
        host?.state?.focusedStoredSessionId?.get?.() ||
        undefined;

      try {
        const output = await executeTranslate(
          {
            text,
            targets: targets.length > 0 ? targets : ["ru", "en"],
            sessionID: focusedSid,
            engineMode: currentCfg.engineMode,
            llmTimeoutMs: currentCfg.llmTimeoutMs,
            dropSourceLang: currentCfg.dropSourceLang,
          },
          ctrl.signal,
        );

        if (id !== sequenceRef.current) return;

        setView({
          ...place,
          text,
          truncated,
          results: output.results,
          detected: output.detected,
          loading: false,
          error: output.results.length === 0 ? t("failed") : undefined,
        });

        if (output.results && output.results.length > 0) {
          addHistoryEntry({
            sourceText: text,
            detected: output.detected,
            results: output.results,
          });
        }
      } catch (err) {
        if (id !== sequenceRef.current) return;
        setView({
          ...place,
          text,
          truncated,
          results: [],
          detected: "",
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [t],
  );

  const readSelection = useCallback(() => {
    const currentCfg = settingsAtom.get();
    if (currentCfg.autoPopup === false) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    if (rootRef.current && sel.anchorNode && rootRef.current.contains(sel.anchorNode)) return;
    if (isEditableElement(sel.anchorNode)) return;

    const raw = sel
      .toString()
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    if (raw.length < 2) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    const maxChars = currentCfg.maxChars || 1500;
    const truncated = raw.length > maxChars;
    const text = truncated ? raw.slice(0, maxChars) : raw;

    const maxWidth = currentCfg.maxWidth || 560;
    const left = Math.min(
      Math.max(8, Math.round(rect.left)),
      Math.max(8, Math.round(window.innerWidth - maxWidth - 8)),
    );

    const roomAbove = rect.top > (currentCfg.clearance || 52) + 190;
    const place = roomAbove
      ? { left, bottom: Math.round(window.innerHeight - rect.top + (currentCfg.clearance || 52)) }
      : { left, top: Math.round(rect.bottom + 12) };

    pinnedRef.current = false;
    runTranslation(text, truncated, place);
  }, [runTranslation]);

  useEffect(() => {
    ensurePopupStyles(settings);

    const onMouseUp = (e) => {
      if (e.button !== 0) return;
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(readSelection, settingsAtom.get().debounceMs || 280);
    };

    const onContextMenu = () => {
      clearTimeout(debounceTimerRef.current);
    };

    const onMouseDown = (e) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      hide();
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        hide();
      }
    };

    const onScrollOrResize = (e) => {
      if (pinnedRef.current) return;
      if (e && e.target instanceof Element) {
        if (
          e.target.closest?.(`.${POPUP_CLASS}`) ||
          e.target.closest?.(".hermes-translate-panel") ||
          e.target.closest?.('[data-pane-id*="translate"]')
        ) {
          return;
        }
      }
      hide();
    };

    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    return () => {
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize, true);
      clearTimeout(debounceTimerRef.current);
      abortCtrlRef.current?.abort();
    };
  }, [readSelection, hide, settings]);

  const enabled = settings.autoPopup !== false;

  // Status Bar Chip (Item 3 & Item 10: toggles auto-popup AND toggles sidebar open/closed)
  const chipNode = h("button", {
    key: "chip",
    className: "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--chrome-action-hover,rgba(255,255,255,0.08))]",
    style: {
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: enabled ? "var(--ui-accent)" : "var(--ui-text-tertiary)",
    },
    title: t("statusChipTip"),
    onClick: () => {
      const next = !enabled;
      patchSettings({ autoPopup: next });
      if (next) {
        revealTranslatePane(ctx);
        host?.notify?.({ kind: "info", message: `${t("panelTitle")}: ${t("enabled")}` });
      } else {
        if (isPaneCurrentlyVisible()) {
          closeTranslatePane(ctx);
        }
        host?.notify?.({ kind: "info", message: `${t("panelTitle")}: ${t("disabled")}` });
      }
    },
  },
    h(Codicon, { name: enabled ? "globe" : "circle-outline", size: 12 }),
    h("span", { style: { fontWeight: enabled ? 600 : 400 } },
      enabled ? t("statusChipOn") : t("statusChipOff")
    )
  );

  // Floating Selection Popup
  let popupNode = null;
  if (view) {
    const bg = hexToRgba(settings.bgColor, settings.bgOpacity / 100);
    const border = hexToRgba(settings.accentColor, 0.45);

    const shellStyle = {
      position: "fixed",
      left: `${view.left}px`,
      ...(view.bottom !== undefined ? { bottom: `${view.bottom}px` } : { top: `${view.top ?? 0}px` }),
      zIndex: 2147483000,
      maxWidth: `${settings.maxWidth || 560}px`,
      maxHeight: `${settings.maxHeight || 420}px`,
      overflowY: "auto",
      boxSizing: "border-box",
      minWidth: "220px",
      padding: "8px 12px",
      borderRadius: `${settings.borderRadius || 10}px`,
      border: `1px solid ${border}`,
      background: bg,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      color: settings.textColor,
      font: `${settings.fontSize || 12.5}px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`,
      pointerEvents: "auto",
      cursor: "default",
    };

    const langTagStyle = {
      flex: "none",
      fontSize: `${Math.max(9, (settings.fontSize || 12.5) - 2.5)}px`,
      fontWeight: "700",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: settings.accentColor,
      minWidth: "24px",
    };

    const metaStyle = {
      marginTop: "6px",
      paddingTop: "5px",
      borderTop: `1px solid ${hexToRgba(settings.accentColor, 0.18)}`,
      fontSize: `${Math.max(9.5, (settings.fontSize || 12.5) - 2)}px`,
      color: hexToRgba(settings.accentColor, 0.8),
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    };

    popupNode = h("div", {
      key: "popup",
      ref: (el) => (rootRef.current = el),
      className: POPUP_CLASS,
      style: shellStyle,
      onMouseDown: (e) => {
        pinnedRef.current = true;
        e.stopPropagation();
      },
      onMouseEnter: () => (pinnedRef.current = true),
      onMouseLeave: () => (pinnedRef.current = false),
    },
      view.loading && h("div", {
        className: "hermes-tr-row",
        style: { color: settings.accentColor, gap: "8px" },
      },
        h(Loader, { className: "size-3", label: t("loading") }),
        h("span", null, t("loading"))
      ),

      !view.loading && view.error && h("div", {
        className: "hermes-tr-row",
        style: { color: "#f0a35e", gap: "8px" },
      },
        h("span", { style: langTagStyle }, "!"),
        h("span", null, `${t("failed")}: ${view.error}`)
      ),

      !view.loading && !view.error && (view.results || []).map((result, idx) => {
        // Short badges: GGL, MYM, LLM
        const badge = formatShortBadge(result.engineUsed);
        return h("div", {
          key: idx,
          className: "hermes-tr-row",
          title: t("copy"),
          onClick: () => {
            if (!result.text) return;
            writeClipboardText(result.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
        },
          h("div", {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
            },
          },
            h("span", { style: langTagStyle }, result.lang),
            h("span", {
              className: `hermes-tr-badge hermes-tr-badge-${badge.tone}`,
            }, badge.label)
          ),
          h("div", { style: { flex: 1, minWidth: 0 } },
            result.error
              ? h("span", { style: { color: "#f0a35e" } }, result.error)
              : h(FormattedTranslation, { text: result.text, settings })
          )
        );
      }),

      h("div", { style: metaStyle },
        h("span", null, copied ? t("copied") : `${t("copy")}${view.truncated ? ` · ${t("truncated")}` : ""}`),
        h("button", {
          className: "hermes-tr-btn-ghost",
          onClick: (e) => {
            e.stopPropagation();
            toggleTranslatePane(ctx);
          },
          title: t("openPanel"),
        },
          h(Codicon, { name: "layout-sidebar-right", size: 12 }),
          t("openPanel")
        )
      )
    );
  }

  return h(React.Fragment, null, popupNode, chipNode);
}

/* ══════════════════════════════════════════════════════════════════════════
   8. TRANSLATION PANE CONTENT (Sidebar Pane Component)
   ══════════════════════════════════════════════════════════════════════════ */

function TranslationPane({ ctx }) {
  const settings = useValue(settingsAtom);
  const history = useValue(historyAtom);
  const t = useT();

  const [inputText, setInputText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Settings form draft state
  const [targetDraft, setTargetDraft] = useState(settings.targets);
  const [modeDraft, setModeDraft] = useState(settings.engineMode);
  const [themeDraft, setThemeDraft] = useState(settings.themePreset || "amber");
  const [uiLangDraft, setUiLangDraft] = useState(settings.uiLang || "auto");
  const [debounceDraft, setDebounceDraft] = useState(String(settings.debounceMs || 280));
  const [llmTimeoutDraft, setLlmTimeoutDraft] = useState(String(settings.llmTimeoutMs || 60000));
  const [historyModeDraft, setHistoryModeDraft] = useState(settings.historyMode || "all");
  const [autoPopupDraft, setAutoPopupDraft] = useState(settings.autoPopup !== false);

  const historyListRef = useRef(null);

  useEffect(() => {
    if (historyListRef.current) {
      historyListRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [history]);

  const runManualTranslate = async () => {
    if (!inputText.trim()) return;
    setTranslating(true);
    const targets = settings.targets
      .split(/[,;\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const focusedSid =
      host?.state?.focusedSessionId?.get?.() ||
      host?.state?.activeSessionId?.get?.() ||
      host?.state?.focusedStoredSessionId?.get?.() ||
      undefined;

    try {
      const output = await executeTranslate(
        {
          text: inputText.trim(),
          targets: targets.length > 0 ? targets : ["ru", "en"],
          sessionID: focusedSid,
          engineMode: settings.engineMode,
          llmTimeoutMs: settings.llmTimeoutMs,
          dropSourceLang: settings.dropSourceLang,
        },
        null,
      );

      if (output.results && output.results.length > 0) {
        addHistoryEntry({
          sourceText: inputText.trim(),
          detected: output.detected,
          results: output.results,
        });
      }
    } catch (e) {
      host?.notify?.({ kind: "error", message: `${t("failed")}: ${e.message || String(e)}` });
    } finally {
      setTranslating(false);
    }
  };

  const applyThemePreset = (presetId) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    patchSettings({
      themePreset: preset.id,
      bgColor: preset.bgColor,
      bgOpacity: preset.bgOpacity,
      textColor: preset.textColor,
      accentColor: preset.accentColor,
    });
  };

  const copyItemText = (text, id) => {
    writeClipboardText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const activeLangsDescription = useMemo(() => {
    const list = targetDraft.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return "None";
    return list.map((c) => targetLangName(c)).join(", ");
  }, [targetDraft]);

  return h("div", {
    className: "hermes-translate-panel flex flex-col h-full overflow-hidden p-3 space-y-3",
    style: {
      color: "var(--ui-text-primary)",
      fontFamily: "var(--font-sans, inherit)",
      fontSize: "0.8125rem",
    },
  },
    // 1. Header Toolbar: Globe, Mode Pill Switcher, Auto/Pause toggle, Settings, Clear, Close [X]
    h("div", {
      className: "flex items-center justify-between gap-1 pb-2 border-b border-[var(--ui-stroke-secondary)] w-full min-w-0 shrink-0",
    },
      h("div", {
        className: "flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden",
      },
        h(Codicon, { name: "globe", size: 14, className: "shrink-0 text-[var(--ui-accent)]" }),
        h("span", {
          className: "font-bold text-xs tracking-wide uppercase truncate",
          title: t("panelTitle"),
        }, t("panelTitle")),

        // Interactive Mode Switcher Pill (Cycles: AUTO ⇄ GGL ⇄ MYM ⇄ LLM)
        h("button", {
          type: "button",
          className: "shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer font-bold uppercase",
          style: {
            background:
              settings.engineMode === "llm"
                ? "rgba(234, 179, 8, 0.16)"
                : settings.engineMode === "mymemory"
                ? "rgba(168, 85, 247, 0.16)"
                : settings.engineMode === "google"
                ? "rgba(59, 130, 246, 0.16)"
                : "rgba(34, 197, 94, 0.16)",
            borderColor:
              settings.engineMode === "llm"
                ? "rgba(234, 179, 8, 0.45)"
                : settings.engineMode === "mymemory"
                ? "rgba(168, 85, 247, 0.45)"
                : settings.engineMode === "google"
                ? "rgba(59, 130, 246, 0.45)"
                : "rgba(34, 197, 94, 0.45)",
            color:
              settings.engineMode === "llm"
                ? "#facc15"
                : settings.engineMode === "mymemory"
                ? "#c084fc"
                : settings.engineMode === "google"
                ? "#60a5fa"
                : "#4ade80",
          },
          title: "Клик: быстро переключить режим (Auto ⇄ GGL ⇄ MYM ⇄ LLM)",
          onClick: (e) => {
            e.stopPropagation();
            const modes = ["auto", "google", "mymemory", "llm"];
            const nextIdx = (modes.indexOf(settings.engineMode) + 1) % modes.length;
            const next = modes[nextIdx];
            patchSettings({ engineMode: next });
            setModeDraft(next);
            host?.notify?.({
              kind: "info",
              message: `${t("engineMode")}: ${next === "google" ? "GGL" : next === "mymemory" ? "MYM" : next === "llm" ? "LLM" : "AUTO"}`,
            });
          },
        },
          h(Codicon, {
            name:
              settings.engineMode === "llm"
                ? "sparkle"
                : settings.engineMode === "mymemory"
                ? "bookmark"
                : settings.engineMode === "google"
                ? "zap"
                : "sync",
            size: 11,
          }),
          settings.engineMode === "google"
            ? "GGL"
            : settings.engineMode === "mymemory"
            ? "MYM"
            : settings.engineMode === "llm"
            ? "LLM"
            : "AUTO"
        ),

        // Auto-popup quick toggle
        h("button", {
          className: "hermes-tr-btn-ghost text-[10px] ml-0.5 shrink-0",
          style: { padding: "1px 4px" },
          title: t("statusChipTip"),
          onClick: () => {
            const next = !settings.autoPopup;
            patchSettings({ autoPopup: next });
            setAutoPopupDraft(next);
            host?.notify?.({ kind: "info", message: `${t("autoPopup")}: ${next ? t("enabled") : t("disabled")}` });
          },
        },
          h(Codicon, { name: settings.autoPopup ? "check" : "circle-outline", size: 11 }),
          settings.autoPopup ? "Авто" : "Пауза"
        )
      ),

      // Right action buttons (Gear, Clear, Close [X])
      h("div", {
        className: "flex items-center gap-0.5 shrink-0 ml-auto",
      },
        h(Button, {
          size: "sm",
          variant: showSettings ? "default" : "ghost",
          className: "size-6 p-0 hover:bg-[var(--chrome-action-hover)]",
          title: t("settings"),
          onClick: () => setShowSettings(!showSettings),
        }, h(Codicon, { name: "settings-gear", size: 13 })),
        history.length > 0 && h(Button, {
          size: "sm",
          variant: "ghost",
          className: "size-6 p-0 hover:bg-[var(--chrome-action-hover)]",
          title: t("clearHistory"),
          onClick: () => {
            historyAtom.set([]);
            host?.notify?.({ kind: "info", message: t("historyCleared") });
          },
        }, h(Codicon, { name: "clear-all", size: 13 })),
        h(Button, {
          size: "sm",
          variant: "ghost",
          className: "size-6 p-0 hover:bg-[var(--chrome-action-hover)]",
          title: t("closePanel"),
          onClick: () => closeTranslatePane(ctx),
        }, h(Codicon, { name: "close", size: 13 }))
      )
    ),

    // 2. Settings Collapsible Section
    showSettings && h("div", {
      className: "p-3 rounded-lg border border-[var(--ui-stroke-secondary)] bg-[var(--muted)] space-y-2.5 text-xs overflow-y-auto max-h-[50vh]",
    },
      // Target languages with ISO link & quick chips
      h("div", { className: "space-y-1.5" },
        h("div", { className: "flex justify-between items-baseline" },
          h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("targetLangs")),
          h("a", {
            href: "https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes",
            target: "_blank",
            rel: "noreferrer",
            onClick: (e) => {
              e.preventDefault();
              const url = "https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes";
              if (ctx?.os?.openExternal) ctx.os.openExternal(url);
              else window.open(url, "_blank");
            },
            className: "text-[10px] text-[var(--ui-accent)] hover:underline inline-flex items-center gap-0.5 cursor-pointer",
            title: "ISO 639-1 language codes reference",
          },
            h(Codicon, { name: "link-external", size: 10 }),
            t("langCodesLink")
          )
        ),
        h(Input, {
          className: "h-7 text-xs",
          value: targetDraft,
          placeholder: "ru, en, de, zh, ja",
          onChange: (e) => setTargetDraft(e.target.value),
        }),
        h("div", { className: "text-[10px] text-[var(--ui-text-tertiary)] truncate" },
          `${t("selectedLangs")} ${activeLangsDescription}`
        ),
        // Quick-pick chips
        h("div", { className: "flex flex-wrap gap-1 pt-0.5" },
          ["ru", "en", "de", "fr", "es", "zh", "ja", "ko", "it", "tr", "uk"].map((code) => {
            const isSelected = targetDraft.toLowerCase().split(/[,;\s]+/).includes(code);
            return h("button", {
              key: code,
              type: "button",
              disabled: isSelected,
              className: `text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                isSelected
                  ? "opacity-40 border-[var(--ui-stroke-secondary)] bg-transparent text-[var(--ui-text-tertiary)] cursor-default"
                  : "border-[var(--ui-stroke-secondary)] bg-[var(--background)] text-[var(--ui-text-primary)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] cursor-pointer"
              }`,
              title: `+ ${code.toUpperCase()} (${targetLangName(code)})`,
              onClick: () => {
                const current = targetDraft.trim();
                const next = current ? `${current}, ${code}` : code;
                setTargetDraft(next);
              },
            }, `+ ${code}`);
          })
        )
      ),

      // Engine Mode
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("engineMode")),
        h(Select, {
          value: modeDraft,
          onValueChange: (v) => setModeDraft(v),
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("engineMode") })
          ),
          h(SelectContent, null,
            h(SelectItem, { value: "auto" }, t("modeAuto")),
            h(SelectItem, { value: "google" }, t("modeGoogle")),
            h(SelectItem, { value: "mymemory" }, t("modeMyMemory")),
            h(SelectItem, { value: "llm" }, t("modeLlm"))
          )
        )
      ),

      // LLM Timeout Picker
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("llmTimeout")),
        h(Select, {
          value: llmTimeoutDraft,
          onValueChange: (v) => setLlmTimeoutDraft(v),
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("llmTimeout") })
          ),
          h(SelectContent, null,
            h(SelectItem, { value: "15000" }, "15s (Fast)"),
            h(SelectItem, { value: "30000" }, "30s"),
            h(SelectItem, { value: "60000" }, "60s (Default)"),
            h(SelectItem, { value: "120000" }, "120s (Thinking models)")
          )
        )
      ),

      // History Mode
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("historyMode")),
        h(Select, {
          value: historyModeDraft,
          onValueChange: (v) => setHistoryModeDraft(v),
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("historyMode") })
          ),
          h(SelectContent, null,
            h(SelectItem, { value: "all" }, t("historyAll")),
            h(SelectItem, { value: "latest" }, t("historyLatest")),
            h(SelectItem, { value: "off" }, t("historyOff"))
          )
        )
      ),

      // Interface Language
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("uiLang")),
        h(Select, {
          value: uiLangDraft,
          onValueChange: (v) => setUiLangDraft(v),
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("uiLang") })
          ),
          h(SelectContent, null,
            h(SelectItem, { value: "auto" }, t("uiLangAuto")),
            h(SelectItem, { value: "ru" }, t("uiLangRu")),
            h(SelectItem, { value: "en" }, t("uiLangEn"))
          )
        )
      ),

      // Debounce delay
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("debounceMs")),
        h(Select, {
          value: debounceDraft,
          onValueChange: (v) => setDebounceDraft(v),
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("debounceMs") })
          ),
          h(SelectContent, null,
            h(SelectItem, { value: "150" }, "150 ms (Быстрый)"),
            h(SelectItem, { value: "280" }, "280 ms (Оптимальный)"),
            h(SelectItem, { value: "450" }, "450 ms (С защитой от двойного клика)")
          )
        )
      ),

      // Color Theme
      h("div", { className: "space-y-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("theme")),
        h(Select, {
          value: themeDraft,
          onValueChange: (v) => {
            setThemeDraft(v);
            applyThemePreset(v);
          },
        },
          h(SelectTrigger, { className: "h-7 text-xs w-full" },
            h(SelectValue, { placeholder: t("theme") })
          ),
          h(SelectContent, null,
            THEME_PRESETS.map((p) => h(SelectItem, { key: p.id, value: p.id }, p.name))
          )
        )
      ),

      // Auto-popup toggle
      h("div", { className: "flex items-center justify-between pt-1" },
        h("label", { className: "font-medium text-[var(--ui-text-secondary)]" }, t("autoPopup")),
        h(Switch, {
          checked: autoPopupDraft,
          onCheckedChange: (checked) => setAutoPopupDraft(checked),
        })
      ),

      // Action Buttons
      h("div", { className: "flex justify-end gap-2 pt-2 border-t border-[var(--ui-stroke-secondary)]" },
        h(Button, {
          size: "sm",
          variant: "default",
          onClick: () => {
            patchSettings({
              targets: targetDraft,
              engineMode: modeDraft,
              historyMode: historyModeDraft,
              uiLang: uiLangDraft,
              debounceMs: parseInt(debounceDraft, 10) || 280,
              llmTimeoutMs: parseInt(llmTimeoutDraft, 10) || 60000,
              autoPopup: autoPopupDraft,
            });
            setShowSettings(false);
            host?.notify?.({ kind: "success", message: t("saved") });
          },
        }, t("save")),
        h(Button, {
          size: "sm",
          variant: "ghost",
          onClick: () => setShowSettings(false),
        }, t("close"))
      )
    ),

    // 3. Quick Input / Translate Field
    h("div", { className: "space-y-1.5 shrink-0" },
      h(Textarea, {
        className: "text-xs resize-none font-sans",
        style: { minHeight: "68px" },
        placeholder: t("manualInputPlaceholder"),
        value: inputText,
        onChange: (e) => setInputText(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            runManualTranslate();
          }
        },
      }),
      h("div", { className: "flex justify-between items-center" },
        h("span", { className: "text-[10px] text-[var(--ui-text-tertiary)]" }, "Ctrl+Enter или кнопка →"),
        h(Button, {
          size: "sm",
          variant: "default",
          disabled: translating || !inputText.trim(),
          onClick: runManualTranslate,
        },
          translating ? [h(Loader, { key: "loader", className: "size-3 mr-1" }), t("loading")] : t("translateBtn")
        )
      )
    ),

    h(Separator, null),

    // 4. History Feed
    h("div", {
      ref: historyListRef,
      className: "flex-1 min-h-0 overflow-y-auto space-y-3 pr-1",
    },
      settings.historyMode === "off"
        ? h(EmptyState, {
            title: t("historyOff"),
            description: "История отключена в настройках плагина.",
          })
        : history.length === 0
        ? h(EmptyState, {
            title: t("emptyPanel"),
            description: t("emptyDesc"),
          })
        : history.map((item) => {
            const cardEngine = item.results[0]?.engineUsed || (settings.engineMode === "llm" ? "llm" : "google-gtx");
            const headerBadge = formatShortBadge(cardEngine, settings.engineMode === "llm" ? "llm" : "google-gtx");

            return h("div", {
              key: item.id,
              className: "hermes-tr-card p-3 space-y-2 text-xs",
            },
              // Card Header
              h("div", {
                className: "flex items-center justify-between pb-1 border-b border-[var(--ui-stroke-secondary)] text-[10px]",
              },
                h("div", { className: "flex items-center gap-1.5 font-mono font-semibold uppercase text-[var(--ui-accent)]" },
                  h("span", null, item.detected ? `${item.detected} → ${item.results.map((r) => r.lang).join(", ")}` : "Перевод"),
                  h("span", {
                    className: `hermes-tr-badge hermes-tr-badge-${headerBadge.tone}`,
                  }, headerBadge.label)
                ),
                h("button", {
                  className: "hermes-tr-btn-ghost text-[10px]",
                  onClick: () => {
                    const fullText = item.results.map((r) => `[${r.lang.toUpperCase()}]\n${r.text}`).join("\n\n");
                    copyItemText(fullText, item.id);
                  },
                }, copiedId === item.id ? "✓" : t("copyAll"))
              ),

              // Source (Original Text)
              h("div", { className: "space-y-0.5" },
                h("span", {
                  className: "text-[9px] uppercase tracking-wider font-semibold text-[var(--ui-text-tertiary)]",
                }, t("original")),
                h("div", {
                  className: "line-clamp-3 text-[11.5px] leading-relaxed text-[var(--ui-text-secondary)] pl-2 border-l-2 border-[var(--ui-stroke-secondary)]",
                }, item.sourceText)
              ),

              // Target Translations
              h("div", { className: "space-y-2 pt-1" },
                item.results.map((r, rIdx) => {
                  const badge = formatShortBadge(r.engineUsed, settings.engineMode === "llm" ? "llm" : "google-gtx");
                  return h("div", {
                    key: rIdx,
                    className: "p-2 rounded bg-[var(--background)] border border-[var(--ui-stroke-secondary)] cursor-pointer hover:border-[var(--ui-accent)] transition-all",
                    onClick: () => copyItemText(r.text, `${item.id}-${r.lang}`),
                    title: t("copy"),
                  },
                    h("div", {
                      className: "flex justify-between items-center text-[10px] font-semibold text-[var(--ui-accent)] mb-1",
                    },
                      h("div", { className: "flex items-center gap-1.5" },
                        h("span", { className: "tracking-wide" }, r.lang.toUpperCase()),
                        h("span", {
                          className: `hermes-tr-badge hermes-tr-badge-${badge.tone}`,
                        }, badge.label)
                      ),
                      h("span", { className: "text-[9px] text-[var(--ui-text-tertiary)] font-normal" },
                        copiedId === `${item.id}-${r.lang}` ? t("copied") : t("copy")
                      )
                    ),
                    h("div", {
                      className: "text-[13px] leading-relaxed text-[var(--ui-text-primary)] font-normal",
                    }, r.error ? h("span", { className: "text-[#f0a35e]" }, r.error) : r.text)
                  );
                })
              )
            );
          })
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   9. HOTKEYS & COMMAND PALETTE HANDLERS
   ══════════════════════════════════════════════════════════════════════════ */

async function translateClipboard(ctx) {
  let clipText = "";
  try {
    if (navigator?.clipboard?.readText) {
      clipText = await navigator.clipboard.readText();
    }
  } catch {}

  const text = (clipText || "").trim();
  if (!text) {
    host?.notify?.({ kind: "info", message: "Буфер обмена пуст. Открываю панель перевода…" });
    revealTranslatePane(ctx);
    return;
  }

  const currentCfg = settingsAtom.get();
  const targets = currentCfg.targets
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const focusedSid =
    host?.state?.focusedSessionId?.get?.() ||
    host?.state?.activeSessionId?.get?.() ||
    host?.state?.focusedStoredSessionId?.get?.() ||
    undefined;

  try {
    host?.notify?.({ kind: "info", message: `Перевожу буфер (${text.slice(0, 30)}…)` });
    const output = await executeTranslate(
      {
        text,
        targets: targets.length > 0 ? targets : ["ru", "en"],
        sessionID: focusedSid,
        engineMode: currentCfg.engineMode,
        llmTimeoutMs: currentCfg.llmTimeoutMs,
        dropSourceLang: currentCfg.dropSourceLang,
      },
      null,
    );

    if (output.results && output.results.length > 0) {
      addHistoryEntry({
        sourceText: text,
        detected: output.detected,
        results: output.results,
      });
      const primary = output.results.find((r) => r.text);
      if (primary) {
        writeClipboardText(primary.text);
        host?.notify?.({
          kind: "success",
          message: `✓ Переведено на ${primary.lang.toUpperCase()} и скопировано в буфер`,
        });
      }
    }
  } catch (err) {
    host?.notify?.({ kind: "error", message: `Ошибка перевода буфера: ${err.message}` });
  }
}

async function translateLastAssistantMessage(ctx) {
  const assistantEls = document.querySelectorAll('[data-role="assistant"], .assistant-message, .prose');
  let targetText = "";

  if (assistantEls && assistantEls.length > 0) {
    const lastEl = assistantEls[assistantEls.length - 1];
    targetText = (lastEl.textContent || "").trim();
  }

  if (!targetText) {
    host?.notify?.({ kind: "warning", message: "Сообщений ассистента в текущем чате не найдено" });
    return;
  }

  const currentCfg = settingsAtom.get();
  const maxChars = currentCfg.maxChars || 1500;
  const text = targetText.length > maxChars ? targetText.slice(0, maxChars) : targetText;

  const targets = currentCfg.targets
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const focusedSid =
    host?.state?.focusedSessionId?.get?.() ||
    host?.state?.activeSessionId?.get?.() ||
    host?.state?.focusedStoredSessionId?.get?.() ||
    undefined;

  try {
    host?.notify?.({ kind: "info", message: "Перевожу последний ответ ассистента…" });
    const output = await executeTranslate(
      {
        text,
        targets: targets.length > 0 ? targets : ["ru", "en"],
        sessionID: focusedSid,
        engineMode: currentCfg.engineMode,
        llmTimeoutMs: currentCfg.llmTimeoutMs,
        dropSourceLang: currentCfg.dropSourceLang,
      },
      null,
    );

    if (output.results && output.results.length > 0) {
      addHistoryEntry({
        sourceText: text,
        detected: output.detected,
        results: output.results,
      });
      revealTranslatePane(ctx);
      host?.notify?.({ kind: "success", message: "✓ Ответ ассистента переведён в панели" });
    }
  } catch (err) {
    host?.notify?.({ kind: "error", message: `Ошибка перевода: ${err.message}` });
  }
}

function setupGlobalHotkeys(ctx) {
  const onKeyDown = (e) => {
    // Alt+T: Translate clipboard
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyT") {
      e.preventDefault();
      translateClipboard(ctx);
      return;
    }

    // Alt+Shift+T: Translate last assistant message
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyT") {
      e.preventDefault();
      translateLastAssistantMessage(ctx);
      return;
    }

    // Alt+P: Toggle persistent translation sidebar pane
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyP") {
      e.preventDefault();
      toggleTranslatePane(ctx);
      return;
    }

    // Alt+Shift+O: Quick toggle auto-popup on selection
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyO") {
      e.preventDefault();
      const current = settingsAtom.get();
      const next = current.autoPopup === false;
      patchSettings({ autoPopup: next });
      if (next) revealTranslatePane(ctx);
      else if (isPaneCurrentlyVisible()) closeTranslatePane(ctx);
      host?.notify?.({
        kind: "info",
        message: `Перевод при выделении: ${next ? "Включен" : "Выключен"}`,
      });
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}

/* ══════════════════════════════════════════════════════════════════════════
   10. PLUGIN LIFECYCLE & REGISTRATION
   ══════════════════════════════════════════════════════════════════════════ */

export default {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  defaultEnabled: true,
  register(ctx) {
    _storage = ctx.storage;
    _os = ctx.os || null;
    _i18n = ctx.i18n || null;

    if (ctx.i18n && typeof ctx.i18n.register === "function") {
      try {
        ctx.i18n.register(LOCALES);
      } catch {}
    }

    if (ctx.i18n && typeof ctx.i18n.onLocaleChange === "function") {
      try {
        ctx.i18n.onLocaleChange(() => {
          localeBumpAtom.set(localeBumpAtom.get() + 1);
        });
      } catch {}
    }

    const initialSettings = loadSettings(ctx.storage);
    settingsAtom.set(initialSettings);

    // 1. Single combined contribution for popup host and status bar chip
    ctx.register({
      id: "selection-popup-host",
      area: STATUSBAR_AREAS.right,
      render: () => h(SelectionPopupHost, { ctx }),
    });

    // 2. Persistent Layout Pane (Right Sidebar zone)
    ctx.register({
      id: "pane",
      area: PANES_AREA,
      title: "Перевод",
      data: {
        placement: "right",
        width: "340px",
      },
      render: () => h(TranslationPane, { ctx }),
    });

    // 3. Register Palette Commands
    ctx.register({
      id: "palette.translate-clipboard",
      area: PALETTE_AREA,
      data: {
        id: "translate.clipboard",
        label: "Translate: Перевести буфер обмена (Alt+T)",
        keywords: ["translate", "clipboard", "буфер", "перевод"],
        run: () => translateClipboard(ctx),
      },
    });

    ctx.register({
      id: "palette.translate-last",
      area: PALETTE_AREA,
      data: {
        id: "translate.last",
        label: "Translate: Перевести последний ответ ассистента (Alt+Shift+T)",
        keywords: ["translate", "last", "assistant", "ответ"],
        run: () => translateLastAssistantMessage(ctx),
      },
    });

    ctx.register({
      id: "palette.toggle-panel",
      area: PALETTE_AREA,
      data: {
        id: "translate.panel",
        label: "Translate: Открыть / закрыть панель перевода (Alt+P)",
        keywords: ["translate", "panel", "sidebar", "боковая", "панель"],
        run: () => toggleTranslatePane(ctx),
      },
    });

    ctx.register({
      id: "palette.toggle-auto",
      area: PALETTE_AREA,
      data: {
        id: "translate.toggle-auto",
        label: "Translate: Включить / выключить автоперевод (Alt+Shift+O)",
        keywords: ["translate", "toggle", "switch", "автоперевод", "вкл", "выкл"],
        run: () => {
          const current = settingsAtom.get();
          const next = current.autoPopup === false;
          patchSettings({ autoPopup: next });
          if (next) revealTranslatePane(ctx);
          else if (isPaneCurrentlyVisible()) closeTranslatePane(ctx);
          host?.notify?.({
            kind: "info",
            message: `Перевод при выделении: ${next ? "Включен" : "Выключен"}`,
          });
        },
      },
    });

    const removeHotkeys = setupGlobalHotkeys(ctx);

    ctx.onDispose(() => {
      removeHotkeys();
      const styleEl = document.getElementById("hermes-translate-selection-styles");
      if (styleEl) styleEl.remove();
    });
  },
};
