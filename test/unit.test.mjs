import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Read plugin.js source
const pluginSrc = fs.readFileSync(
  new URL("../src/plugin.js", import.meta.url),
  "utf8"
);

function getSandbox() {
  const code = `
    const atom = (initial) => {
      let val = initial;
      return { get: () => val, set: (v) => { val = v; } };
    };
    let host = null;
    const React = {
      createElement: () => ({}),
      useState: () => [null, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useCallback: (fn) => fn,
      useLayoutEffect: () => {},
      useMemo: (fn) => fn(),
    };

    ${pluginSrc
      .split("/* ══════════════════════════════════════════════════════════════════════════\n   5. UI UTILITIES")[0]
      .replace(/^import\s+[\s\S]*?;/gm, "")}

    return {
      detectScriptLanguage,
      refineDetectedLanguage,
      targetLangName,
      shieldTokens,
      unshieldTokens,
      isComplexFormattedText,
      cleanLlmOutput,
      formatShortBadge,
      DEFAULT_SETTINGS,
      THEME_PRESETS,
      LOCALES
    };
  `;
  return new Function(code)();
}

const sandbox = getSandbox();

test("detectScriptLanguage identifies scripts correctly", () => {
  assert.equal(sandbox.detectScriptLanguage("Привет, как дела?"), "ru");
  assert.equal(sandbox.detectScriptLanguage("Hello, how are you?"), "en");
  assert.equal(sandbox.detectScriptLanguage("你好世界"), "zh");
  assert.equal(sandbox.detectScriptLanguage("こんにちは"), "ja");
  assert.equal(sandbox.detectScriptLanguage("안녕하세요"), "ko");
  assert.equal(sandbox.detectScriptLanguage("مرحبا"), "ar");
});

test("refineDetectedLanguage prioritizes Russian over false Belarusian/Ukrainian detection", () => {
  // Case: Google MT incorrectly tags single Cyrillic word "правая" as Belarusian "be"
  assert.equal(
    sandbox.refineDetectedLanguage("правая", "be", ["ru", "en"]),
    "ru"
  );
  assert.equal(
    sandbox.refineDetectedLanguage("рендерятся", "uk", ["ru", "en"]),
    "ru"
  );
  // Case: word with unique Belarusian letter 'ў' stays Belarusian
  assert.equal(
    sandbox.refineDetectedLanguage("ўсё добра", "be", ["ru", "en"]),
    "be"
  );
  // Case: word with unique Ukrainian letter 'ї' stays Ukrainian
  assert.equal(
    sandbox.refineDetectedLanguage("Київ", "uk", ["ru", "en"]),
    "uk"
  );
});

test("formatShortBadge returns clean short badges (GGL, MYM, LLM)", () => {
  assert.deepEqual(sandbox.formatShortBadge("gtx"), { label: "GGL", tone: "google" });
  assert.deepEqual(sandbox.formatShortBadge("google-gtx"), { label: "GGL", tone: "google" });
  assert.deepEqual(sandbox.formatShortBadge("dict-chrome-ex"), { label: "GGL", tone: "google" });
  assert.deepEqual(sandbox.formatShortBadge("google-dict"), { label: "GGL", tone: "google" });
  assert.deepEqual(sandbox.formatShortBadge("llm"), { label: "LLM", tone: "llm" });
  assert.deepEqual(sandbox.formatShortBadge("mymemory"), { label: "MYM", tone: "mymemory" });
});

test("targetLangName resolves localized language names", () => {
  assert.equal(sandbox.targetLangName("ru"), "Russian");
  assert.equal(sandbox.targetLangName("en"), "English");
  assert.equal(sandbox.targetLangName("de"), "German");
  assert.equal(sandbox.targetLangName("zh"), "Chinese");
  assert.equal(sandbox.targetLangName("ja"), "Japanese");
});

test("shieldTokens and unshieldTokens protect and restore code and URLs", () => {
  const sample = "Use `const x = 42;` and visit https://example.com for details.";
  const { shielded, tokens } = sandbox.shieldTokens(sample);

  assert.equal(tokens.length, 2);
  assert.equal(tokens[0], "`const x = 42;`");
  assert.equal(tokens[1], "https://example.com");
  assert.match(shielded, /\u27A60\u27A7/);
  assert.match(shielded, /\u27A61\u27A7/);

  // Simulate machine translation altering text around tokens
  const mtTranslated = `Используйте \u27A60\u27A7 и посетите \u27A61\u27A7 для деталей.`;
  const restored = sandbox.unshieldTokens(mtTranslated, tokens);

  assert.equal(
    restored,
    "Используйте `const x = 42;` и посетите https://example.com для деталей."
  );
});

test("isComplexFormattedText identifies structured text vs simple phrases", () => {
  assert.equal(sandbox.isComplexFormattedText("Hello world"), false);
  assert.equal(sandbox.isComplexFormattedText("How are you today?"), false);

  // Lists
  assert.equal(sandbox.isComplexFormattedText("Features:\n• First item\n• Second item"), true);
  assert.equal(sandbox.isComplexFormattedText("Steps:\n1. Clone repo\n2. Run tests"), true);

  // Markdown headings
  assert.equal(sandbox.isComplexFormattedText("## Overview\nThis is a header"), true);

  // Code block or inline code
  assert.equal(sandbox.isComplexFormattedText("Call `generateToken()`"), true);
  assert.equal(sandbox.isComplexFormattedText("```js\nconsole.log(1)\n```"), true);

  // Function calls / APIs
  assert.equal(sandbox.isComplexFormattedText("Run host.request('model.options') now"), true);
});

test("cleanLlmOutput strips conversational prefix and markdown code wrappers", () => {
  const output1 = "Here is the translation:\nПривет, мир!";
  assert.equal(sandbox.cleanLlmOutput(output1, "Hello world"), "Привет, мир!");

  const output2 = "Вот перевод:\nКонструктор плагинов";
  assert.equal(sandbox.cleanLlmOutput(output2, "Plugin builder"), "Конструктор плагинов");

  // Strips outer markdown code block if original was not a code block
  const output3 = "```markdown\n# Заголовок\nТекст\n```";
  assert.equal(sandbox.cleanLlmOutput(output3, "# Header\nText"), "# Заголовок\nТекст");
});

test("DEFAULT_SETTINGS, LOCALES and THEME_PRESETS are properly structured", () => {
  assert.equal(sandbox.DEFAULT_SETTINGS.engineMode, "auto");
  assert.equal(sandbox.DEFAULT_SETTINGS.targets, "ru, en");
  assert.equal(sandbox.DEFAULT_SETTINGS.autoPopup, true);
  assert.equal(sandbox.DEFAULT_SETTINGS.debounceMs, 280);
  assert.ok(sandbox.THEME_PRESETS.length >= 5);
  assert.ok(sandbox.THEME_PRESETS.some((p) => p.id === "amber"));
  assert.ok(sandbox.THEME_PRESETS.some((p) => p.id === "midnight"));
  assert.ok(Object.keys(sandbox.LOCALES.en).length > 20);
  assert.equal(Object.keys(sandbox.LOCALES.en).length, Object.keys(sandbox.LOCALES.ru).length);
});
