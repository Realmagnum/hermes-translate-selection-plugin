/**
 * Translate Selection — Hermes Desktop Plugin
 * 
 * Instant inline translation tooltip on text selection.
 * Smart Hybrid LLM/MT routing across all languages.
 * 
 * @module plugin
 * @file src/plugin.js
 */

import { jsx, jsxs } from 'react/jsx-runtime'
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
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
} from '@hermes/plugin-sdk'

/* ──────────────────────── Constants ──────────────────────── */

const STORAGE_KEY = 'translate-settings.v1'
const TERM_CAP = 200
const MT_TIMEOUT_MS = 8000
const LLM_TIMEOUT_MS = 3500
const POPUP_CLEARANCE = 52

const DEFAULT_SETTINGS = {
  engineMode: 'auto',        // 'auto' | 'fast' | 'llm'
  llmTimeoutMs: LLM_TIMEOUT_MS,
  maxHeight: 420,
  targets: 'ru, en',
  clearance: POPUP_CLEARANCE,
  bgColor: '#2b220a',
  bgOpacity: 97,
  textColor: '#ffd75e',
  accentColor: '#c9a83f',
  borderRadius: 10,
  fontSize: 12.5,
  maxWidth: 560,
  debounceMs: 140,
  maxChars: 1500,
  dropSourceLang: true,
  keyClipboard: 'alt+t',
  keyLastTurn: 'alt+shift+t',
  keyPanel: 'alt+p',
}

// Color presets for theme selector
const PRESETS = [
  { id: 'amber', name: 'Amber Gold',   bgColor: '#2b220a', bgOpacity: 97, textColor: '#ffd75e', accentColor: '#c9a83f' },
  { id: 'midnight', name: 'Midnight OLED', bgColor: '#090d16', bgOpacity: 98, textColor: '#6ee7b7', accentColor: '#38bdf8' },
  { id: 'cyberpunk', name: 'Cyberpunk', bgColor: '#1a1a1a', bgOpacity: 97, textColor: '#facc15', accentColor: '#a3e635' },
  { id: 'nordic', name: 'Nordic Slate', bgColor: '#242933', bgOpacity: 97, textColor: '#eceff4', accentColor: '#88c0d0' },
  { id: 'light', name: 'Paper Light',  bgColor: '#f8fafc', bgOpacity: 98, textColor: '#0f172a', accentColor: '#3b82f6' },
]

/* ──────────────────────── State Management ──────────────────────── */

let _storage = null
let _os = null

const settingsAtom = atom(DEFAULT_SETTINGS)

function loadSettings(storage) {
  try {
    const raw = storage.get(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function patchSettings(patch) {
  const next = { ...settingsAtom.get(), ...patch }
  settingsAtom.set(next)
  if (_storage) {
    try { _storage.set(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }
  return next
}

/* ──────────────────────── Language Detection ──────────────────────── */

function detectScriptLanguage(text) {
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return 'zh'
  if (/[[\u3040-\u30ff]/.test(text)) return 'ja'
  if (/[[\uac00-\ud7af]/.test(text)) return 'ko'
  if (/[[а-яё]/i.test(text)) return 'ru'
  return 'en'
}

function targetLangName(code) {
  const langNames = { ru: 'Russian', en: 'English', de: 'German', fr: 'French', es: 'Spanish', zh: 'Chinese', ja: 'Japanese', it: 'Italian', pt: 'Portuguese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', uk: 'Ukrainian', pl: 'Polish' }
  const norm = code.toLowerCase().trim().split('-')[0]
  return langNames[norm] ?? code.toUpperCase()
}

/* ──────────────────────── Token Shielding ──────────────────────── */

const SHIELD_RE = /(`{1,3}[^`]+`{1,3}|\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+\([^)]*\)|\b(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*)/g

function shieldTokens(text) {
  const tokens = []
  const shielded = text.replace(SHIELD_RE, (match) => {
    const index = tokens.length
    tokens.push(match)
    return `➦${index}➧`
  })
  return { shielded, tokens }
}

function unshieldTokens(text, tokens) {
  if (!tokens.length) return text
  let out = text
  tokens.forEach((token, i) => {
    out = out.replace(new RegExp(`\\u27A6\\s*${i}\\s*\\u27A7`, 'g'), token)
  })
  return out
}

/* ──────────────────────── Complexity Detector ──────────────────────── */

function isComplexFormattedText(raw) {
  if (!raw) return false
  const trimmed = raw.trim()
  if (trimmed.length < 40 && !trimmed.includes('\n') && !trimmed.includes('`') && !trimmed.includes('{') && !trimmed.includes('(')) {
    return false
  }
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length >= 2) {
    if (lines.some(l => /^([\\u2022\\-*+]|\d+[.)]|\d+-\d+)\s/.test(l))) return true
    if (lines.some(l => /^#{1,6}\s/.test(l))) return true
    if (lines.some(l => /^>\s?/.test(l))) return true
  }
  if (/`{1,3}[^`]+`{1,3}/.test(trimmed)) return true
  if (/\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(/.test(trimmed)) return true
  if (/\{[\s\S]*:[ \t]*[\s\S]*\}/.test(trimmed)) return true
  if (lines.length >= 3) return true
  return false
}

/* ──────────────────────── MT Pipeline ──────────────────────── */

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const CACHE_LIMIT = 500
const cache = new Map()
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

function remember(key, value) {
  cache.set(key, value)
  if (cache.size <= CACHE_LIMIT) return
  const oldest = cache.keys().next()
  if (!oldest.done) cache.delete(oldest.value)
}

async function fetchViaFetch(url, signal) {
  try {
    const res = await fetch(url, { signal, headers: { accept: 'application/json', 'user-agent': USER_AGENT } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch { throw new Error('fetch failed') }
}

async function fetchGoogle(text, to, clientName, signal) {
  const url = `${GOOGLE_ENDPOINT}?client=${encodeURIComponent(clientName)}&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`
  const body = await fetchViaFetch(url, signal)
  const chunks = Array.isArray(body) ? body[0] : undefined
  if (!Array.isArray(chunks)) throw new Error('unexpected response shape')
  const translated = chunks.map(c => (Array.isArray(c) && typeof c[0] === 'string') ? c[0] : '').join('').trim()
  if (!translated) throw new Error('empty translation')
  const detected = Array.isArray(body) && typeof body[2] === 'string' ? body[2] : ''
  return { text: translated, detected, engineUsed: clientName }
}

async function fetchMyMemory(text, to, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${encodeURIComponent(to)}`
  const body = await fetchViaFetch(url, signal)
  const t = body?.responseData?.translatedText
  if (typeof t !== 'string' || !t.trim()) throw new Error(body?.responseDetails || 'empty result')
  const d = typeof body?.matches?.[0]?.['source-language'] === 'string'
    ? body.matches[0]['source-language'] : detectScriptLanguage(text)
  return { text: t.trim(), detected: d, engineUsed: 'mymemory' }
}

function escapeHtml(t) {
  return t.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

async function translateWithFallback(text, to, signal) {
  const key = `mt\0${to}\0${text}`
  const hit = cache.get(key)
  if (hit) return hit
  // Tier 1: Google gtx
  try { const entry = await fetchGoogle(text, to, 'gtx', signal); remember(key, entry); return entry } catch {}
  // Tier 2: Google dict-chrome-ex
  try { const entry = await fetchGoogle(text, to, 'dict-chrome-ex', signal); remember(key, entry); return entry } catch {}
  // Tier 3: MyMemory
  const entry = await fetchMyMemory(text, to, signal)
  remember(key, entry)
  return entry
}

/* ──────────────────────── Translation Engine (Hybrid) ──────────────────────── */

async function translate(input, signal) {
  const text = input.text.replace(/\r/g, '').trim()
  const targets = [...new Set(input.targets.map(l => l.trim()).filter(Boolean))]
  if (!text) return { detected: '', results: [] }
  
  const mode = input.engineMode ?? 'auto'
  const isComplex = isComplexFormattedText(text)
  const shouldTryLlm = (mode === 'llm' || (mode === 'auto' && isComplex)) && !!input.sessionID
  
  // If session context available and should use LLM path
  if (shouldTryLlm) {
    const dropSource = input.dropSourceLang !== false
    const detectedSource = detectScriptLanguage(text)
    const activeTargets = dropSource
      ? targets.filter(t => t.toLowerCase().split('-')[0] !== detectedSource)
      : targets
    const targetsToTranslate = activeTargets.length > 0 ? activeTargets : targets
    
    if (targetsToTranslate.length > 0) {
      // For MVP, LLM path will be added in Phase P2
      // Currently falling through to MT pipeline
    }
  }
  
  // MT Pipeline with token shielding
  const { shielded, tokens } = shieldTokens(text)
  
  const settled = await Promise.allSettled(targets.map(lang => translateWithFallback(shielded, lang, signal)))
  
  const detected = settled.map(r => r.status === 'fulfilled' ? r.value.detected : '').find(Boolean) ?? ''
  
  const results = settled.map((result, index) => {
    const lang = targets[index] ?? ''
    if (result.status === 'fulfilled') {
      const unshielded = unshieldTokens(result.value.text, tokens)
      return { lang, text: unshielded, engineUsed: result.value.engineUsed }
    }
    return { lang, text: '', error: 'Translation failed' }
  })
  
  // Filter out source language from results
  const source = detected.toLowerCase().split('-')[0]
  const useful = source
    ? results.filter(r => r.lang.toLowerCase().split('-')[0] !== source || r.error)
    : results
  
  return { detected, results: useful.length > 0 ? useful : results }
}

/* ──────────────────────── Settings Helpers ──────────────────────── */

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '').trim()
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16)
  if (isNaN(num)) return hex
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildLangTagStyle(s) {
  return { flex: 'none', 'font-size': `${Math.max(9, s.fontSize - 2.5)}px`, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: s.accentColor, minWidth: '20px' }
}

function buildTextStyle(s) {
  return { color: s.textColor, 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' }
}

function buildMetaStyle(s) {
  return { marginTop: '4px', paddingTop: '4px', borderTop: `1px solid ${hexToRgba(s.accentColor, 0.16)}`, fontSize: `${Math.max(9.5, s.fontSize - 2)}px`, color: hexToRgba(s.accentColor, 0.8) }
}

/* ──────────────────────── Styles Injection ──────────────────────── */

function ensurePopupStyles(settings) {
  if (document.getElementById('translate-popup-styles')) return
  const s = document.createElement('style')
  s.id = 'translate-popup-styles'
  const bg = hexToRgba(settings.bgColor, settings.bgOpacity / 100)
  const border = hexToRgba(settings.accentColor, 0.45)
  s.textContent = `
    @keyframes translate-in{from{opacity:0;transform:translateY(4px)}to{opacity:1}}
    .translate-popup{animation:translate-in .12s ease-out;-webkit-user-select:text!important;user-select:text!important;cursor:default}
    .translate-row:hover{background:rgba(255,255,255,0.05)}
  `
  document.head.appendChild(s)
}

/* ──────────────────────── Selection Popup (React Component) ──────────────────────── */

function SelectionPopup({ settings, labels, translateFn, copyFn, currentSessionId }) {
  const [view, setView] = useState(null)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef(null)
  const pinnedRef = useRef(false)
  const sequenceRef = useRef(0)
  const controllerRef = useRef(null)
  const readTimerRef = useRef(null)
  
  const cfg = () => settingsAtom.get()
  
  const hide = useCallback(() => {
    sequenceRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    pinnedRef.current = false
    setCopied(false)
    setView(null)
  }, [])
  
  const run = useCallback(async (text, truncated, place) => {
    const id = ++sequenceRef.current
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()
    
    setCopied(false)
    setView({ ...place, text, truncated, results: [], detected: '', loading: true })
    
    const currentCfg = cfg()
    const targets = currentCfg.targets.split(/[,;\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
    
    try {
      const output = await translateFn({
        text, targets: targets.length ? targets : ['ru', 'en'],
        sessionID: currentSessionId?.(),
        engineMode: currentCfg.engineMode,
        llmTimeoutMs: currentCfg.llmTimeoutMs,
        dropSourceLang: currentCfg.dropSourceLang,
      }, controllerRef.current.signal)
      
      if (id !== sequenceRef.current) return
      
      setView({
        ...place, text, truncated, results: output.results,
        detected: output.detected, loading: false,
        error: output.results.length === 0 ? labels.failed : undefined,
      })
    } catch (err) {
      if (id !== sequenceRef.current) return
      setView({
        ...place, text, truncated, results: [], detected: '',
        loading: false, error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [cfg, labels.failed, currentSessionId, translateFn])
  
  const read = useCallback(() => {
    const currentCfg = cfg()
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return
    if (rootRef.current && selection.anchorNode && rootRef.current.contains(selection.anchorNode)) return
    
    // Skip editable fields
    const el = selection.anchorNode?.parentElement || selection.anchorNode
    if (el?.closest?.('textarea, input, [contenteditable]')) return
    
    const raw = selection.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (raw.length < 2) return
    
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return
    
    const maxChars = currentCfg.maxChars
    const truncated = raw.length > maxChars
    const text = truncated ? raw.slice(0, maxChars) : raw
    
    const left = Math.min(Math.max(8, Math.round(rect.left)), Math.max(8, Math.round(window.innerWidth - currentCfg.maxWidth - 8)))
    const roomAbove = rect.top > currentCfg.clearance + 190
    const place = roomAbove
      ? { left, bottom: Math.round(window.innerHeight - rect.top + currentCfg.clearance) }
      : { left, top: Math.round(rect.bottom + 12) }
    
    run(text, truncated, place)
  }, [cfg, run])
  
  useEffect(() => {
    const onMouseUp = () => { clearTimeout(readTimerRef.current); readTimerRef.current = setTimeout(read, cfg().debounceMs) }
    const onMouseDown = (e) => { if (rootRef.current && e.target && rootRef.current.contains(e.target)) return; hide() }
    const onKeyDown = (e) => { if (e.key === 'Escape' && view()) hide() }
    const onScrollOrResize = () => { if (view()) hide() }
    
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize, true)
    
    return () => {
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize, true)
      clearTimeout(readTimerRef.current)
      controllerRef.current?.abort()
    }
  }, [read, hide, view])
  
  if (!view) return null
  
  const c = cfg()
  ensurePopupStyles(c)
  
  const shellStyle = {
    position: 'fixed',
    left: `${view.left}px`,
    ...(view.bottom !== undefined ? { bottom: `${view.bottom}px` } : { top: `${view.top ?? 0}px` }),
    zIndex: '2147483000',
    maxWidth: `${c.maxWidth}px`,
    maxHeight: `${c.maxHeight}px`,
    overflowY: 'auto',
    boxSizing: 'border-box',
    minWidth: '220px',
    padding: '7px 10px 8px',
    borderRadius: `${c.borderRadius}px`,
    border: `1px solid ${hexToRgba(c.accentColor, 0.45)}`,
    background: hexToRgba(c.bgColor, c.bgOpacity / 100),
    boxShadow: '0 14px 34px rgba(0, 0, 0, 0.45)',
    color: c.textColor,
    font: `${c.fontSize}px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif`,
  }
  
  const rowStyle = { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '2px 2px 3px', borderRadius: '6px', cursor: 'pointer' }
  
  // Render each translation result
  const resultRows = (view.results || []).map((result, idx) => {
    if (result.error) {
      return jsx('div', { key: idx, style: { ...rowStyle, color: '#f0a35e' }, children: [
        jsx('span', { style: buildLangTagStyle(c), children: '!' }),
        jsx('span', { style: { ...buildTextStyle(c), color: '#f0a35e' }, children: `${labels.failed}: ${result.error}` }),
      ]})
    }
    return jsx('div', { 
      key: idx, 
      className: 'translate-row',
      style: rowStyle, 
      onMouseDown: () => { pinnedRef.current = true },
      onClick: () => { if (result.text) { copyFn(result.text); setCopied(true) } },
      children: [
        jsx('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }, children: [
          jsx('span', { style: buildLangTagStyle(c), children: result.lang }),
          result.engineUsed === 'llm' && jsx('span', { style: { fontSize: '8px', fontWeight: 700, padding: '0 3px', borderRadius: '3px', background: 'rgba(255,215,94,0.16)', color: c.accentColor, lineHeight: 1.2 }, children: 'LLM' }),
        ]}),
        jsx('div', { style: { flex: 1, minWidth: 0 }, children: jsx('span', { style: buildTextStyle(c), children: result.text }) }),
      ]
    })
  })
  
  return jsx('div', {
    ref: rootRef,
    className: 'translate-popup',
    style: shellStyle,
    onMouseDown: (e) => { pinnedRef.current = true; e.stopPropagation() },
    onMouseEnter: () => { pinnedRef.current = true },
    onMouseLeave: () => { if (!pinnedRef.current) {/* could add unpinned behavior */ } },
    children: [
      // Loading or Results
      view.loading && jsx('div', { style: { ...rowStyle, color: c.accentColor }, children: [
        jsx('span', { style: buildLangTagStyle(c), children: '...' }),
        jsx('span', { style: buildTextStyle(c), children: labels.loading }),
      ]}),
      ...(!view.loading && resultRows),
      // Footer
      jsx('div', { style: buildMetaStyle(c), children: [
        copied ? labels.copied : labels.copy,
        view.truncated && ` · ${labels.truncated}`,
      ]}),
    ]
  })
}

/* ──────────────────────── Translation Side Panel ──────────────────────── */

function TranslationPane({ ctx }) {
  const [history, setHistory] = useState([])
  const [copiedIdx, setCopiedIdx] = useState(-1)
  
  const copyFromPanel = useCallback((text, idx) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx) })
    }
  }, [])
  
  return jsx('div', {
    className: 'translate-panel-content',
    style: { padding: '12px', color: 'var(--ui-text-primary)' },
    children: history.length
      ? jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' }, children: history.map((item, i) => {
          return jsx('div', { key: i, style: { padding: '8px', borderRadius: '6px', background: 'var(--muted)', border: '1px solid var(--ui-stroke-secondary)' }, children: [
            jsx('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }, children: [
              jsx('span', { style: { fontSize: '10px', fontWeight: 600, color: 'var(--ui-accent)', textTransform: 'uppercase', letterSpacing: '0.09em' }, children: item.detected ? `${item.detected} → ${item.results.map(r => r.lang).join(', ')}` : 'translation' }),
              jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => copyFromPanel(item.original, i), children: copiedIdx === i ? '✓' : 'Copy' }),
            ]}),
            jsx('div', { style: { fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--ui-text-primary)' }, children: item.results.map((r, j) => {
              return jsx('div', { key: j, style: { marginBottom: '4px' }, children: [
                jsx('strong', { style: { fontSize: '0.65rem', color: 'var(--ui-accent)' }, children: `[${r.lang}] ` }),
                jsx('span', { children: r.text || r.error }),
              ]})
            }))}),
          ]})
        }))
      : jsx(EmptyState, { title: 'Select text in chat to translate', description: 'Your translations will appear here.' })
  })
}

/* ──────────────────────── Settings Form (Panel Footer) ──────────────────────── */

function SettingsForm({ ctx }) {
  const settings = useValue(settingsAtom)
  const [showTemplate, setShowTemplate] = useState(false)
  const [showProviders, setShowProviders] = useState(false)
  const [templateDraft, setTemplateDraft] = useState('')
  const [newProvider, setNewProvider] = useState(null)
  const [importText, setImportText] = useState('')
  const [gwModels, setGwModels] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    // Load gateway models
    ;(async () => {
      try {
        if (host && typeof host.request === 'function') {
          const r = await host.request('model.options', { explicit_only: false, include_unconfigured: true })
          const payload = r?.result || r || {}
          const list = payload.providers || payload.data || []
          if (Array.isArray(list) && list.length) {
            setGwModels({ providers: list.map(p => ({ id: p.id || p.slug || p.name, name: p.name || p.id, base_url: p.base_url || p.api_url, models: (p.models || []).map(m => typeof m === 'string' ? m : m.id || m.model) }).filter(p => p.id)) })
          }
        }
      } catch {}
    })()
  }, [])
  
  return null // Placeholder - full settings UI in P5
}

/* ──────────────────────── Main Plugin Entry ──────────────────────── */

export default {
  id: 'translate-selection',
  name: 'Translate Selection',
  defaultEnabled: true,
  register(ctx) {
    _storage = ctx.storage
    _os = ctx.os || null
    
    // Load settings
    settingsAtom.set(loadSettings(ctx.storage))
    
    // Register right-rail pane
    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'Translation',
      data: { placement: 'right', width: '340px' },
      render: () => jsx(TranslationPane, { ctx })
    })
    
    // Palette commands
    ctx.register({
      id: 'palette.translate',
      area: PALETTE_AREA,
      data: { id: 'translate.open', label: 'Translate selection', keywords: ['translate', 'translation', 'language'], run: () => {} }
    })
    
    ctx.register({
      id: 'palette.translate-last',
      area: PALETTE_AREA,
      data: { id: 'translate.last', label: 'Translate last assistant message', keywords: ['translate', 'last', 'message'], run: () => {} }
    })
    
    ctx.register({
      id: 'palette.translate-panel',
      area: PALETTE_AREA,
      data: { id: 'translate.panel', label: 'Toggle translation panel', keywords: ['panel', 'toggle'], run: () => {} }
    })
    
    // Status bar chip (shows status)
    ctx.register({
      id: 'chip',
      area: STATUSBAR_AREAS.right,
      order: 100,
      render: () => jsx('span', { style: { fontSize: '11px', color: 'var(--ui-text-tertiary)' }, children: '● Ready' })
    })
    
    // Cleanup
    ctx.onDispose(() => {
      // Clean up any injected styles
      const s = document.getElementById('translate-popup-styles')
      if (s) s.remove()
    })
  }
}

