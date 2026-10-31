/**
 * Translate Selection — Hermes Desktop Plugin
 *
 * Instant inline translation tooltip on text selection for Hermes Desktop.
 * Smart Hybrid LLM/MT routing across all languages:
 * - Simple phrases -> Fast Multi-tier MT (Google gtx -> dict-chrome-ex -> MyMemory)
 * - Complex/structured/code text -> Session LLM via native gateway `llm.oneshot`
 * - Automatic fail-safe fallback to Token-Shielded MT if LLM times out or errors
 *
 * Fully self-contained ECMAScript Module (ESM) compatible with Hermes Desktop plugin loader.
 *
 * @module hermes-translate-selection-plugin
 * @author Realmagnum
 * @license MIT
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
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
import { jsx, jsxs } from "react/jsx-runtime";

/* ══════════════════════════════════════════════════════════════════════════
   1. CONSTANTS & THEMES
   ══════════════════════════════════════════════════════════════════════════ */

const PLUGIN_ID = "translate-selection";
const PLUGIN_NAME = "Translate Selection";
const STORAGE_KEY = "translate-selection.v1";
const POPUP_CLASS = "hermes-translate-popup";

const DEFAULT_SETTINGS = {
  engineMode: "auto", // 'auto' | 'fast' | 'llm'
  llmTimeoutMs: 3500,
  maxHeight: 420,
  targets: "ru, en",
  clearance: 52,
  bgColor: "#2b220a",
  bgOpacity: 97,
  textColor: "#ffd75e",
  accentColor: "#c9a83f",
  borderRadius: 10,
  fontSize: 12.5,
  maxWidth: 560,
  debounceMs: 140,
  maxChars: 1500,
  dropSourceLang: true,
  themePreset: "amber",
  keyClipboard: "alt+t",
  keyLastTurn: "alt+shift+t",
  keyPanel: "alt+p",
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

const LABELS = {
  loading: "Перевод…",
  failed: "Не удалось перевести",
  truncated: "Обрезано",
  copy: "Клик — копировать",
  copied: "✓ Скопировано в буфер",
  emptyPanel: "Выделите любой текст в чате",
  emptyDesc: "Результаты мгновенного перевода отобразятся здесь.",
  history: "История переводов",
  clearHistory: "Очистить историю",
  modeAuto: "Auto (Smart Hybrid)",
  modeFast: "Fast MT Only (без LLM)",
  modeLlm: "Session LLM Only",
  targetLangs: "Целевые языки (через запятую)",
  theme: "Цветовая тема",
  settings: "Настройки",
  save: "Сохранить",
  close: "Закрыть",
};

/* ══════════════════════════════════════════════════════════════════════════
   2. REACTIVE STATE & STORAGE
   ══════════════════════════════════════════════════════════════════════════ */

let _storage = null;
let _os = null;

const settingsAtom = atom(DEFAULT_SETTINGS);
const panelOpenAtom = atom(false);
const historyAtom = atom([]); // Array<{ id, sourceText, detected, results: Array<{lang, text, engineUsed}>, time }>
const activeTranslateRequestAtom = atom(0);

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
  const list = historyAtom.get();
  const next = [
    { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time: new Date(), ...entry },
    ...list.slice(0, 49), // retain up to 50 items
  ];
  historyAtom.set(next);
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

function targetLangName(code) {
  const norm = code.toLowerCase().trim().split("-")[0];
  return LANGUAGE_NAMES[norm] ?? code.toUpperCase();
}

/**
 * Token Shielding: protects code, function calls, and markdown code spans
 * from being mangled or translated by machine translation engines.
 */
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
    // Accommodate potential whitespace injected by MT engines
    const pattern = new RegExp(`\u27A6\\s*${index}\\s*\u27A7`, "g");
    out = out.replace(pattern, token);
  });
  return out;
}

/**
 * Complexity detector: returns true if the snippet has structured lists,
 * code blocks, function calls, or multiple paragraphs worth preserving with LLM.
 */
function isComplexFormattedText(raw) {
  if (!raw) return false;
  const trimmed = raw.trim();

  // Short single-line snippets under 40 chars without code, brackets, or fences are simple
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

  // 1. Multi-line structures
  if (lines.length >= 2) {
    // Bullet or numbered lists: •, -, *, +, 1., 1)
    if (lines.some((l) => /^([•\-*+]|\d+[.)]|\d+-\d+)\s/.test(l))) return true;
    // Markdown headers
    if (lines.some((l) => /^#{1,6}\s/.test(l))) return true;
    // Markdown blockquotes
    if (lines.some((l) => /^>\s?/.test(l))) return true;
  }

  // 2. Code fences or inline code
  if (/`{1,3}[^`]+`{1,3}/.test(trimmed)) return true;

  // 3. Technical calls / identifiers (e.g. tools.opencode.models({ ... }))
  if (/\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(/.test(trimmed)) return true;

  // 4. Key-value / JSON parameter syntax
  if (/\{[\s\S]*:[ \t]*[\s\S]*\}/.test(trimmed)) return true;

  // 5. Paragraph structure with 3 or more lines
  if (lines.length >= 3) return true;

  return false;
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
  return { text: translated, detected, engineUsed: clientName };
}

async function fetchMyMemory(text, to, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text,
  )}&langpair=autodetect|${encodeURIComponent(to)}`;
  const body = await requestJson(url, signal);

  const translated = body?.responseData?.translatedText;
  if (typeof translated !== "string" || !translated.trim()) {
    throw new Error(body?.responseDetails || "MyMemory returned empty result");
  }

  const detected =
    typeof body?.matches?.[0]?.["source-language"] === "string"
      ? body.matches[0]["source-language"]
      : detectScriptLanguage(text);

  return { text: unescapeHtml(translated.trim()), detected, engineUsed: "mymemory" };
}

async function translateWithMtFallback(text, to, signal) {
  const key = `mt\0${to}\0${text}`;
  const hit = memoryCache.get(key);
  if (hit !== undefined) return hit;

  // Tier 1: Google gtx
  try {
    const entry = await fetchGoogle(text, to, "gtx", signal);
    rememberCache(key, entry);
    return entry;
  } catch (errGtx) {}

  // Tier 2: Google dict-chrome-ex
  try {
    const entry = await fetchGoogle(text, to, "dict-chrome-ex", signal);
    rememberCache(key, entry);
    return entry;
  } catch (errDict) {}

  // Tier 3: MyMemory API fallback
  try {
    const entry = await fetchMyMemory(text, to, signal);
    rememberCache(key, entry);
    return entry;
  } catch (errMyMem) {
    throw new Error(`All MT backends failed: ${errMyMem?.message || String(errMyMem)}`);
  }
}

/**
 * LLM translation via native Hermes gateway `llm.oneshot` RPC
 */
function buildLlmPrompt(text, targetLang) {
  const lang = targetLangName(targetLang);
  return `Translate the following text to ${lang}.
Strict requirements:
1. Preserve all structural formatting exactly: bullet lists (•, -, *), numbered steps, indentations, line breaks, and Markdown.
2. DO NOT translate, change, or rename code, function calls, parameters, variable names, URLs, or technical identifiers.
3. Return ONLY the translated content. No explanations, no introductory text, no conversational phrases.

Text to translate:
${text}`;
}

function cleanLlmOutput(output, originalText) {
  let text = output.trim();
  // Strip outer ```markdown ... ``` wrapper if the source text was not a code block
  if (!originalText.trim().startsWith("```") && text.startsWith("```") && text.endsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
  }
  // Strip conversational intros if the model added any
  text = text.replace(/^(?:Here is the translation|Вот перевод|Translation|Перевод):\s*\r?\n?/i, "").trim();
  return text;
}

async function translateWithLlmOneshot(text, targetLang, sessionId, timeoutMs, signal) {
  if (!host || typeof host.request !== "function") {
    throw new Error("Hermes host.request RPC unavailable");
  }

  const prompt = buildLlmPrompt(text, targetLang);
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs || 3500);

  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error("LLM translation aborted"));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    timeoutCtrl.signal.addEventListener("abort", () => reject(new Error("LLM translation timed out")), {
      once: true,
    });
  });

  try {
    const rpcPromise = host.request("llm.oneshot", {
      instructions: "You are a professional, accurate technical translator.",
      input: prompt,
      session_id: sessionId || null,
      temperature: 0.1,
      max_tokens: 2048,
    });

    const res = await Promise.race([rpcPromise, abortPromise]);
    const payload = res?.result || res || {};
    const rawText = payload.text || payload.output || "";
    if (!rawText.trim()) throw new Error("Empty translation from LLM oneshot");

    return cleanLlmOutput(rawText, text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main Translation Coordinator with Smart Hybrid Routing
 */
async function executeTranslate(input, signal) {
  const rawText = input.text.replace(/\r/g, "").trim();
  const targets = [...new Set(input.targets.map((lang) => lang.trim().toLowerCase()).filter(Boolean))];

  if (!rawText) return { detected: "", results: [] };

  const mode = input.engineMode ?? "auto";
  const isComplex = isComplexFormattedText(rawText);
  const shouldTryLlm = mode === "llm" || (mode === "auto" && isComplex);

  const detectedSource = detectScriptLanguage(rawText);
  const dropSource = input.dropSourceLang !== false;
  const activeTargets = dropSource
    ? targets.filter((t) => t.toLowerCase().split("-")[0] !== detectedSource)
    : targets;
  const targetsToTranslate = activeTargets.length > 0 ? activeTargets : targets;

  // ──────────────────────────── 1. LLM Translation Path ────────────────────────────
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
          const entry = { text: translatedText, detected: detectedSource, engineUsed: "llm" };
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
          return { lang, text: "", error: r.reason?.message || String(r.reason) };
        });
        return { detected: detectedSource, results };
      }

      if (mode === "llm") {
        // If mode was strictly LLM, don't fall back, report failure
        return {
          detected: detectedSource,
          results: targetsToTranslate.map((lang) => ({
            lang,
            text: "",
            error: "LLM translation failed",
          })),
        };
      }
    } catch (llmErr) {
      if (mode === "llm") {
        return {
          detected: detectedSource,
          results: targetsToTranslate.map((lang) => ({
            lang,
            text: "",
            error: llmErr?.message || String(llmErr),
          })),
        };
      }
    }
  }

  // ──────────────────────── 2. MT Pipeline (with Token Shielding) ───────────────────
  const { shielded, tokens } = shieldTokens(rawText);

  const settled = await Promise.allSettled(
    targetsToTranslate.map((lang) => translateWithMtFallback(shielded, lang, signal)),
  );

  const detected =
    settled
      .map((result) => (result.status === "fulfilled" ? result.value.detected : ""))
      .find(Boolean) || detectedSource;

  const results = settled.map((result, index) => {
    const lang = targetsToTranslate[index] ?? "";
    if (result.status === "fulfilled") {
      const unshielded = unshieldTokens(result.value.text, tokens);
      return { lang, text: unshielded, engineUsed: result.value.engineUsed };
    }
    return { lang, text: "", error: result.reason?.message || "Translation failed" };
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
  const borderCol = hexToRgba(settings.accentColor, 0.45);

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
      padding: 3px 5px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .hermes-tr-row:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .hermes-tr-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(128, 128, 128, 0.2);
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
    }
    .hermes-tr-btn-ghost:hover {
      color: var(--ui-text-primary);
      background: rgba(128, 128, 128, 0.15);
    }
  `;
  document.head.appendChild(s);
}

/** FormattedText: renders bold, code spans, linebreaks safely */
function FormattedTranslation({ text, settings }) {
  if (!text) return null;
  const lines = text.split("\n");

  return jsx("div", {
    style: {
      color: settings.textColor,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      lineHeight: 1.45,
    },
    children: lines.map((line, lIdx) => {
      // Parse markdown inline bold **...** and `code`
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
            jsx(
              "strong",
              {
                key: `b-${lIdx}-${match.index}`,
                style: { fontWeight: 650, color: settings.accentColor },
                children: tok.slice(2, -2),
              },
            ),
          );
        } else if (tok.startsWith("`") && tok.endsWith("`")) {
          parts.push(
            jsx(
              "code",
              {
                key: `c-${lIdx}-${match.index}`,
                className: "hermes-tr-code",
                children: tok.slice(1, -1),
              },
            ),
          );
        }
        lastIndex = match.index + tok.length;
      }
      if (lastIndex < line.length) {
        parts.push(line.slice(lastIndex));
      }

      return jsx(
        "div",
        {
          key: lIdx,
          style: { minHeight: line.trim() === "" ? "0.6em" : "auto" },
          children: parts.length > 0 ? parts : "\u00A0",
        },
      );
    }),
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   6. SELECTION POPUP HOST & COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

function isEditableElement(node) {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return false;
  return !!el.closest('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

function SelectionPopupHost() {
  const settings = useValue(settingsAtom);
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
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const focusedSid =
        host?.state?.focusedSessionId?.get?.() || host?.state?.activeSessionId?.get?.() || undefined;

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
          error: output.results.length === 0 ? LABELS.failed : undefined,
        });

        // Record in side panel history
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
    [],
  );

  const readSelection = useCallback(() => {
    const currentCfg = settingsAtom.get();
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

  // Event listeners for selection detection & dismiss
  useEffect(() => {
    ensurePopupStyles(settings);

    const onMouseUp = (e) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(readSelection, settingsAtom.get().debounceMs || 140);
    };

    const onMouseDown = (e) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      hide();
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") hide();
    };

    const onScrollOrResize = () => {
      if (!pinnedRef.current) hide();
    };

    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    return () => {
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize, true);
      clearTimeout(debounceTimerRef.current);
      abortCtrlRef.current?.abort();
    };
  }, [readSelection, hide, settings]);

  if (!view) return null;

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

  return jsx("div", {
    ref: (el) => (rootRef.current = el),
    className: POPUP_CLASS,
    style: shellStyle,
    onMouseDown: (e) => {
      pinnedRef.current = true;
      e.stopPropagation();
    },
    onMouseEnter: () => (pinnedRef.current = true),
    onMouseLeave: () => (pinnedRef.current = false),
    children: [
      // 1. Loading State
      view.loading &&
        jsx("div", {
          className: "hermes-tr-row",
          style: { color: settings.accentColor, gap: "8px" },
          children: [
            jsx(Loader, { className: "size-3", label: LABELS.loading }),
            jsx("span", { children: LABELS.loading }),
          ],
        }),

      // 2. Error State
      !view.loading &&
        view.error &&
        jsx("div", {
          className: "hermes-tr-row",
          style: { color: "#f0a35e", gap: "8px" },
          children: [
            jsx("span", { style: langTagStyle, children: "!" }),
            jsx("span", { children: `${LABELS.failed}: ${view.error}` }),
          ],
        }),

      // 3. Translation Results
      !view.loading &&
        !view.error &&
        (view.results || []).map((result, idx) =>
          jsx(
            "div",
            {
              key: idx,
              className: "hermes-tr-row",
              title: "Нажмите, чтобы скопировать",
              onClick: () => {
                if (!result.text) return;
                writeClipboardText(result.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              children: [
                jsx("div", {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                  },
                  children: [
                    jsx("span", { style: langTagStyle, children: result.lang }),
                    result.engineUsed === "llm" &&
                      jsx("span", {
                        style: {
                          fontSize: "8px",
                          fontWeight: "700",
                          padding: "0 3px",
                          borderRadius: "3px",
                          background: "rgba(255, 215, 94, 0.18)",
                          color: settings.accentColor,
                          letterSpacing: "0.05em",
                          lineHeight: "1.2",
                        },
                        children: "LLM",
                      }),
                  ],
                }),
                jsx("div", {
                  style: { flex: 1, minWidth: 0 },
                  children: result.error
                    ? jsx("span", { style: { color: "#f0a35e" }, children: result.error })
                    : jsx(FormattedTranslation, { text: result.text, settings }),
                }),
              ],
            },
          ),
        ),

      // 4. Meta Footer: Copy feedback, Truncated indicator, Panel button
      jsx("div", {
        style: metaStyle,
        children: [
          jsx("span", {
            children: copied
              ? LABELS.copied
              : `${LABELS.copy}${view.truncated ? ` · ${LABELS.truncated}` : ""}`,
          }),
          jsx(
            "button",
            {
              className: "hermes-tr-btn-ghost",
              onClick: () => panelOpenAtom.set(true),
              title: "Открыть в боковой панели",
            },
            [jsx(Codicon, { key: "icon", name: "layout-sidebar-right", size: 12 }), "Панель"],
          ),
        ],
      }),
    ],
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   7. TRANSLATION SIDE PANEL (PERSISTENT RIGHT RAIL)
   ══════════════════════════════════════════════════════════════════════════ */

function TranslationPane({ ctx }) {
  const settings = useValue(settingsAtom);
  const history = useValue(historyAtom);
  const [inputText, setInputText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Settings form draft state
  const [targetDraft, setTargetDraft] = useState(settings.targets);
  const [modeDraft, setModeDraft] = useState(settings.engineMode);
  const [themeDraft, setThemeDraft] = useState(settings.themePreset || "amber");

  const runManualTranslate = async () => {
    if (!inputText.trim()) return;
    setTranslating(true);
    const targets = settings.targets
      .split(/[,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const focusedSid =
      host?.state?.focusedSessionId?.get?.() || host?.state?.activeSessionId?.get?.() || undefined;

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
      host?.notify?.({ kind: "error", message: `Ошибка перевода: ${e.message || String(e)}` });
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

  return jsx("div", {
    className: "flex flex-col h-full overflow-hidden p-3 space-y-3",
    style: {
      color: "var(--ui-text-primary)",
      fontFamily: "var(--font-sans, inherit)",
      fontSize: "0.8125rem",
    },
    children: [
      // 1. Header Toolbar
      jsx("div", {
        className: "flex items-center justify-between pb-2 border-b border-[var(--ui-stroke-secondary)]",
        children: [
          jsx("div", {
            className: "flex items-center gap-1.5 font-semibold text-xs tracking-wide uppercase",
            children: [
              jsx(Codicon, { name: "globe", size: 14 }),
              "Перевод",
              jsx(Badge, {
                variant: settings.engineMode === "llm" ? "default" : "outline",
                className: "ml-1 text-[10px]",
                children: settings.engineMode.toUpperCase(),
              }),
            ],
          }),
          jsx("div", {
            className: "flex items-center gap-1",
            children: [
              jsx(
                Button,
                {
                  size: "sm",
                  variant: showSettings ? "default" : "ghost",
                  title: "Настройки плагина",
                  onClick: () => setShowSettings(!showSettings),
                },
                jsx(Codicon, { name: "settings-gear", size: 13 }),
              ),
              history.length > 0 &&
                jsx(
                  Button,
                  {
                    size: "sm",
                    variant: "ghost",
                    title: LABELS.clearHistory,
                    onClick: () => historyAtom.set([]),
                  },
                  jsx(Codicon, { name: "clear-all", size: 13 }),
                ),
            ],
          }),
        ],
      }),

      // 2. Settings Collapsible Section
      showSettings &&
        jsx("div", {
          className: "p-2.5 rounded-lg border border-[var(--ui-stroke-secondary)] bg-[var(--muted)] space-y-2.5 text-xs",
          children: [
            jsx("div", {
              className: "space-y-1",
              children: [
                jsx("label", { className: "font-medium text-[var(--ui-text-secondary)]", children: LABELS.targetLangs }),
                jsx(Input, {
                  className: "h-7 text-xs",
                  value: targetDraft,
                  placeholder: "ru, en, de, zh",
                  onChange: (e) => setTargetDraft(e.target.value),
                }),
              ],
            }),
            jsx("div", {
              className: "space-y-1",
              children: [
                jsx("label", { className: "font-medium text-[var(--ui-text-secondary)]", children: "Режим перевода" }),
                jsx(
                  Select,
                  {
                    value: modeDraft,
                    onValueChange: (v) => setModeDraft(v),
                  },
                  [
                    jsx(SelectTrigger, { className: "h-7 text-xs w-full" }, jsx(SelectValue, null)),
                    jsx(SelectContent, null, [
                      jsx(SelectItem, { value: "auto" }, LABELS.modeAuto),
                      jsx(SelectItem, { value: "fast" }, LABELS.modeFast),
                      jsx(SelectItem, { value: "llm" }, LABELS.modeLlm),
                    ]),
                  ],
                ),
              ],
            }),
            jsx("div", {
              className: "space-y-1",
              children: [
                jsx("label", { className: "font-medium text-[var(--ui-text-secondary)]", children: LABELS.theme }),
                jsx(
                  Select,
                  {
                    value: themeDraft,
                    onValueChange: (v) => {
                      setThemeDraft(v);
                      applyThemePreset(v);
                    },
                  },
                  [
                    jsx(SelectTrigger, { className: "h-7 text-xs w-full" }, jsx(SelectValue, null)),
                    jsx(
                      SelectContent,
                      null,
                      THEME_PRESETS.map((p) => jsx(SelectItem, { key: p.id, value: p.id }, p.name)),
                    ),
                  ],
                ),
              ],
            }),
            jsx("div", {
              className: "flex justify-end gap-2 pt-1",
              children: [
                jsx(
                  Button,
                  {
                    size: "sm",
                    variant: "default",
                    onClick: () => {
                      patchSettings({ targets: targetDraft, engineMode: modeDraft });
                      setShowSettings(false);
                      host?.notify?.({ kind: "success", message: "Настройки перевода сохранены" });
                    },
                  },
                  LABELS.save,
                ),
                jsx(
                  Button,
                  {
                    size: "sm",
                    variant: "ghost",
                    onClick: () => setShowSettings(false),
                  },
                  LABELS.close,
                ),
              ],
            }),
          ],
        }),

      // 3. Quick Input / Translate Field
      jsx("div", {
        className: "space-y-1.5",
        children: [
          jsx(Textarea, {
            className: "text-xs resize-none font-sans",
            style: { minHeight: "68px" },
            placeholder: "Вставьте текст для перевода или нажмите Alt+T (буфер)...",
            value: inputText,
            onChange: (e) => setInputText(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                runManualTranslate();
              }
            },
          }),
          jsx("div", {
            className: "flex justify-between items-center",
            children: [
              jsx("span", {
                className: "text-[10px] text-[var(--ui-text-tertiary)]",
                children: "Ctrl+Enter или кнопка →",
              }),
              jsx(
                Button,
                {
                  size: "sm",
                  variant: "default",
                  disabled: translating || !inputText.trim(),
                  onClick: runManualTranslate,
                },
                translating ? [jsx(Loader, { key: "l", className: "size-3 mr-1" }), "Перевод…"] : "Перевести",
              ),
            ],
          }),
        ],
      }),

      jsx(Separator, null),

      // 4. History Feed
      jsx("div", {
        className: "flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1",
        children:
          history.length === 0
            ? jsx(EmptyState, {
                title: LABELS.emptyPanel,
                description: LABELS.emptyDesc,
              })
            : history.map((item) =>
                jsx(
                  "div",
                  {
                    key: item.id,
                    className: "p-2.5 rounded-lg border border-[var(--ui-stroke-secondary)] bg-[var(--muted)] space-y-1.5 text-xs",
                  },
                  [
                    // Item Header
                    jsx("div", {
                      className: "flex items-center justify-between text-[10px] text-[var(--ui-text-tertiary)]",
                      children: [
                        jsx("span", {
                          className: "font-mono font-semibold uppercase text-[var(--ui-accent)]",
                          children: item.detected ? `${item.detected} → ${item.results.map((r) => r.lang).join(", ")}` : "перевод",
                        }),
                        jsx(
                          "button",
                          {
                            className: "hermes-tr-btn-ghost text-[10px]",
                            onClick: () => {
                              const fullText = item.results.map((r) => `[${r.lang.toUpperCase()}]\n${r.text}`).join("\n\n");
                              copyItemText(fullText, item.id);
                            },
                          },
                          copiedId === item.id ? "✓ Скопировано" : "Копировать всё",
                        ),
                      ],
                    }),

                    // Source preview
                    jsx("div", {
                      className: "line-clamp-2 italic text-[var(--ui-text-secondary)] opacity-80 border-l-2 border-[var(--ui-stroke-secondary)] pl-2",
                      children: item.sourceText,
                    }),

                    // Translated targets
                    jsx("div", {
                      className: "space-y-1.5 pt-1",
                      children: item.results.map((r, rIdx) =>
                        jsx(
                          "div",
                          {
                            key: rIdx,
                            className: "p-1.5 rounded bg-[var(--background)] border border-[var(--ui-stroke-secondary)] cursor-pointer hover:border-[var(--ui-accent)] transition-colors",
                            onClick: () => copyItemText(r.text, `${item.id}-${r.lang}`),
                            title: "Клик — копировать",
                          },
                          [
                            jsx("div", {
                              className: "flex justify-between items-center text-[10px] font-semibold text-[var(--ui-accent)] mb-0.5",
                              children: [
                                jsx("span", { children: r.lang.toUpperCase() }),
                                jsx("div", {
                                  className: "flex items-center gap-1",
                                  children: [
                                    r.engineUsed === "llm" &&
                                      jsx(Badge, { variant: "outline", className: "text-[8px] py-0 px-1" }, "LLM"),
                                    jsx("span", {
                                      className: "text-[9px] text-[var(--ui-text-tertiary)]",
                                      children: copiedId === `${item.id}-${r.lang}` ? "✓" : "копия",
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            jsx("div", {
                              className: "whitespace-pre-wrap leading-relaxed text-[var(--ui-text-primary)]",
                              children: r.error
                                ? jsx("span", { className: "text-[#f0a35e]", children: r.error })
                                : r.text,
                            }),
                          ],
                        ),
                      ),
                    }),
                  ],
                ),
              ),
      }),
    ],
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   8. HOTKEYS & COMMAND PALETTE HANDLERS
   ══════════════════════════════════════════════════════════════════════════ */

async function translateClipboard() {
  let clipText = "";
  try {
    if (navigator?.clipboard?.readText) {
      clipText = await navigator.clipboard.readText();
    }
  } catch {}

  const text = (clipText || "").trim();
  if (!text) {
    host?.notify?.({ kind: "info", message: "Буфер обмена пуст. Открываю панель перевода…" });
    panelOpenAtom.set(true);
    return;
  }

  const currentCfg = settingsAtom.get();
  const targets = currentCfg.targets
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const focusedSid =
    host?.state?.focusedSessionId?.get?.() || host?.state?.activeSessionId?.get?.() || undefined;

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
      // Copy primary translated result directly to clipboard
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

async function translateLastAssistantMessage() {
  // Find last assistant message in DOM
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
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const focusedSid =
    host?.state?.focusedSessionId?.get?.() || host?.state?.activeSessionId?.get?.() || undefined;

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
      panelOpenAtom.set(true);
      host?.notify?.({ kind: "success", message: "✓ Ответ ассистента переведён в панели" });
    }
  } catch (err) {
    host?.notify?.({ kind: "error", message: `Ошибка перевода: ${err.message}` });
  }
}

function setupGlobalHotkeys() {
  const onKeyDown = (e) => {
    // Alt+T: Translate clipboard
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyT") {
      e.preventDefault();
      translateClipboard();
      return;
    }

    // Alt+Shift+T: Translate last assistant message
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyT") {
      e.preventDefault();
      translateLastAssistantMessage();
      return;
    }

    // Alt+P: Toggle persistent side panel
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyP") {
      e.preventDefault();
      panelOpenAtom.set(!panelOpenAtom.get());
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}

/* ══════════════════════════════════════════════════════════════════════════
   9. PLUGIN LIFECYCLE & REGISTRATION
   ══════════════════════════════════════════════════════════════════════════ */

export default {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  defaultEnabled: true,
  register(ctx) {
    _storage = ctx.storage;
    _os = ctx.os || null;

    // Load persisted settings
    const initialSettings = loadSettings(ctx.storage);
    settingsAtom.set(initialSettings);

    // 1. Register global SelectionPopupHost via statusbar right
    ctx.register({
      id: "selection-popup-host",
      area: STATUSBAR_AREAS.right,
      render: () => jsx(SelectionPopupHost, null),
    });

    // 2. Register persistent Layout Pane (right rail sidebar)
    ctx.register({
      id: "pane",
      area: PANES_AREA,
      title: "Перевод",
      data: { placement: "right", width: "340px" },
      render: () => jsx(TranslationPane, { ctx }),
    });

    // 3. Register Palette Commands
    ctx.register({
      id: "palette.translate-clipboard",
      area: PALETTE_AREA,
      data: {
        id: "translate.clipboard",
        label: "Translate: Перевести буфер обмена (Alt+T)",
        keywords: ["translate", "clipboard", "буфер", "перевод"],
        run: () => translateClipboard(),
      },
    });

    ctx.register({
      id: "palette.translate-last",
      area: PALETTE_AREA,
      data: {
        id: "translate.last",
        label: "Translate: Перевести последний ответ ассистента (Alt+Shift+T)",
        keywords: ["translate", "last", "assistant", "ответ"],
        run: () => translateLastAssistantMessage(),
      },
    });

    ctx.register({
      id: "palette.toggle-panel",
      area: PALETTE_AREA,
      data: {
        id: "translate.panel",
        label: "Translate: Открыть / закрыть панель перевода (Alt+P)",
        keywords: ["translate", "panel", "sidebar", "боковая", "панель"],
        run: () => panelOpenAtom.set(!panelOpenAtom.get()),
      },
    });

    // 4. Setup global hotkeys listener
    const removeHotkeys = setupGlobalHotkeys();

    // 5. Cleanup on dispose
    ctx.onDispose(() => {
      removeHotkeys();
      const styleEl = document.getElementById("hermes-translate-selection-styles");
      if (styleEl) styleEl.remove();
    });
  },
};
