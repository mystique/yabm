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

  const localeMessagesCache = new Map();
  let preferredLanguage = AUTO_LANGUAGE;
  let activeLocale = "en";

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

  function getUiLanguage() {
    try {
      return chrome.i18n.getUILanguage();
    } catch {
      return navigator.language || "en";
    }
  }

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

  function getMessageFromActiveLocale(key, substitutions) {
    const bundle = localeMessagesCache.get(activeLocale);
    const entry = bundle?.[key];
    if (!entry || typeof entry.message !== "string") {
      return "";
    }
    return applySubstitutions(entry.message, substitutions);
  }

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
