/**
 * @file i18n.js
 * Internationalisation library for YABM Classic.
 *
 * Loads locale message bundles from `_locales/<locale>/messages.json` at
 * runtime via the Fetch API, caches them in memory, and exposes a
 * translation function `t(key, substitutions)` with `$1`/`$2` placeholder
 * support. Language preference is persisted in `chrome.storage.local`.
 *
 * Exposes: `window.YABMI18n`
 *
 * @module lib/i18n
 */

(() => {
  const STORAGE_KEY = "uiLanguage";
  const AUTO_LANGUAGE = "auto";
  const SUPPORTED_LOCALES = [
    "en",
    "zh_CN",
    "zh_TW",
    "de",
    "es",
    "fr",
    "it",
    "pt",
    "ja",
    "ko",
    "ru",
  ];

  /** Locale message bundles keyed by resolved locale code. */
  const localeMessagesCache = new Map();
  /** Persisted language preference; either a locale code or {@link AUTO_LANGUAGE}. */
  let preferredLanguage = AUTO_LANGUAGE;
  /** Currently active resolved locale code (never "auto"). */
  let activeLocale = "en";

  /**
   * Maps an arbitrary browser locale tag (e.g. `"zh-TW"`, `"en-US"`) to
   * a supported locale code. Falls back to `"en"` for unrecognised locales.
   *
   * @param {string} locale - Raw locale string from the browser or storage.
   * @returns {string} A locale code present in {@link SUPPORTED_LOCALES}, or `"en"`.
   */
  function normalizeLocale(locale) {
    const raw = String(locale || "").trim().replace("-", "_");
    if (!raw) {
      return "en";
    }
    const lower = raw.toLowerCase();
    if (
      lower.startsWith("zh_tw") ||
      lower.startsWith("zh_hk") ||
      lower.startsWith("zh_mo")
    ) {
      return "zh_TW";
    }
    if (lower.startsWith("zh")) {
      return "zh_CN";
    }
    const base = lower.split("_")[0];
    return SUPPORTED_LOCALES.includes(base) ? base : "en";
  }

  /**
   * Returns the current browser UI language tag. Prefers
   * `chrome.i18n.getUILanguage()` and falls back to `navigator.language`
   * for environments where the Chrome API is unavailable.
   *
   * @returns {string} BCP 47 language tag, e.g. `"en-US"` or `"zh-TW"`.
   */
  function getUiLanguage() {
    try {
      return chrome.i18n.getUILanguage();
    } catch {
      return navigator.language || "en";
    }
  }

  /**
   * Fetches and caches the message bundle for the given locale. Returns
   * the cached bundle on subsequent calls without re-fetching.
   *
   * On network or parse errors the function stores an empty object so that
   * `t()` gracefully falls back to the Chrome i18n API.
   *
   * @param {string} locale - Locale code to load (will be normalised).
   * @returns {Promise<Object>} Parsed `messages.json` object, or `{}` on failure.
   */
  async function loadLocaleMessages(locale) {
    const targetLocale = normalizeLocale(locale);
    if (localeMessagesCache.has(targetLocale)) {
      return localeMessagesCache.get(targetLocale);
    }
    try {
      const url = chrome.runtime.getURL(`_locales/${targetLocale}/messages.json`);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      localeMessagesCache.set(targetLocale, json || {});
      return json || {};
    } catch {
      const fallback = {};
      localeMessagesCache.set(targetLocale, fallback);
      return fallback;
    }
  }

  /**
   * Replaces `$1`, `$2`, … positional placeholders and the `$$` escape
   * sequence in a message string with the provided substitution values.
   *
   * @param {string} message - Raw message string with optional placeholders.
   * @param {string|string[]|undefined|null} substitutions - One or more
   *     substitution values. A single string is treated as `$1`.
   * @returns {string} The message with all placeholders replaced.
   */
  function applySubstitutions(message, substitutions) {
    if (substitutions === undefined || substitutions === null) {
      return message;
    }
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    return String(message).replace(/\$(\$|\d)/g, (full, token) => {
      if (token === "$") {
        return "$";
      }
      const idx = Number(token) - 1;
      return idx >= 0 && idx < values.length ? String(values[idx]) : "";
    });
  }

  /**
   * Retrieves a translated message from the currently active locale's
   * in-memory cache and applies any placeholder substitutions.
   * Returns an empty string when the key is missing or the bundle is not
   * yet loaded.
   *
   * @param {string} key - Message key as defined in `messages.json`.
   * @param {string|string[]|undefined} substitutions - Substitution values.
   * @returns {string} Translated string, or `""` if the key is not found.
   */
  function getMessageFromActiveLocale(key, substitutions) {
    const bundle = localeMessagesCache.get(activeLocale);
    const entry = bundle?.[key];
    if (!entry || typeof entry.message !== "string") {
      return "";
    }
    return applySubstitutions(entry.message, substitutions);
  }

  /**
   * Returns the translated string for `key`, with optional substitutions.
   *
   * Lookup order:
   *  1. Active locale cache (loaded via `loadLocaleMessages`).
   *  2. `chrome.i18n.getMessage` (extension's built-in i18n).
   *  3. The raw `key` itself as a last resort.
   *
   * @param {string} key - Message key as defined in `messages.json`.
   * @param {string|string[]|undefined} substitutions - Substitution values.
   * @returns {string} Translated message, or `key` if no translation exists.
   */
  function t(key, substitutions) {
    const localized = getMessageFromActiveLocale(key, substitutions);
    if (localized) {
      return localized;
    }
    try {
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch {
      return key;
    }
  }

  /**
   * Initialises the library by reading the stored language preference and
   * loading the corresponding locale message bundle. Must be called (and
   * awaited) before `t()` returns meaningful translations.
   *
   * Falls back to {@link AUTO_LANGUAGE} and the browser locale if storage
   * access fails.
   *
   * @returns {Promise<void>}
   */
  async function init() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const candidate = stored?.[STORAGE_KEY];
      if (
        candidate === AUTO_LANGUAGE ||
        SUPPORTED_LOCALES.includes(candidate)
      ) {
        preferredLanguage = candidate;
      } else {
        preferredLanguage = AUTO_LANGUAGE;
      }
    } catch {
      preferredLanguage = AUTO_LANGUAGE;
    }

    activeLocale =
      preferredLanguage === AUTO_LANGUAGE
        ? normalizeLocale(getUiLanguage())
        : normalizeLocale(preferredLanguage);
    await loadLocaleMessages(activeLocale);
  }

  /**
   * Persists a new language preference to `chrome.storage.local` and
   * immediately switches the active locale, loading its bundle as needed.
   * Passing an unrecognised value silently coerces to {@link AUTO_LANGUAGE}.
   *
   * @param {string} language - A locale code from {@link SUPPORTED_LOCALES},
   *     or `"auto"` to follow the browser language.
   * @returns {Promise<void>}
   */
  async function setLanguagePreference(language) {
    const next =
      language === AUTO_LANGUAGE || SUPPORTED_LOCALES.includes(language)
        ? language
        : AUTO_LANGUAGE;
    preferredLanguage = next;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    activeLocale =
      next === AUTO_LANGUAGE ? normalizeLocale(getUiLanguage()) : normalizeLocale(next);
    await loadLocaleMessages(activeLocale);
  }

  /**
   * Translates all `data-i18n-*` attributes within a DOM subtree.
   *
   * Supported attributes:
   * - `data-i18n` → sets `textContent`
   * - `data-i18n-placeholder` → sets the `placeholder` attribute
   * - `data-i18n-title` → sets the `title` attribute
   * - `data-i18n-aria-label` → sets the `aria-label` attribute
   * - `data-i18n-tooltip` → sets `dataset.tooltip`
   *
   * @param {Document|Element} [root=document] - Root element to walk.
   */
  function applyI18n(root = document) {
    for (const el of root.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
      el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
    }
    for (const el of root.querySelectorAll("[data-i18n-title]")) {
      el.setAttribute("title", t(el.dataset.i18nTitle));
    }
    for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
      el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
    }
    for (const el of root.querySelectorAll("[data-i18n-tooltip]")) {
      el.dataset.tooltip = t(el.dataset.i18nTooltip);
    }
  }

  window.YABMI18n = {
    init,
    t,
    apply: applyI18n,
    setLanguagePreference,
    getLanguagePreference: () => preferredLanguage,
    getActiveLocale: () => activeLocale,
    getSupportedLocales: () => [...SUPPORTED_LOCALES],
    AUTO_LANGUAGE,
  };
})();
