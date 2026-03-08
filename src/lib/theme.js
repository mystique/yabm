/**
 * @file theme.js
 * Shared theme preference manager for YABM pages.
 *
 * Persists a page theme preference in `chrome.storage.local`, resolves the
 * effective theme against the system preference when needed, and applies the
 * result to the document root using `data-theme` attributes.
 *
 * Exposes: `window.YABMTheme`
 */

(() => {
  const STORAGE_KEY = "uiTheme";
  const SYSTEM_THEME = "system";
  const LIGHT_THEME = "light";
  const DARK_THEME = "dark";
  const SUPPORTED_THEMES = [LIGHT_THEME, DARK_THEME, SYSTEM_THEME];

  let preferredTheme = SYSTEM_THEME;
  let resolvedTheme = LIGHT_THEME;
  let mediaQueryList = null;
  let isInitialised = false;
  let initPromise = null;
  let storageListenerBound = false;
  let mediaListenerBound = false;

  function normalizeTheme(theme) {
    return SUPPORTED_THEMES.includes(theme) ? theme : SYSTEM_THEME;
  }

  function getSystemResolvedTheme() {
    return mediaQueryList?.matches ? DARK_THEME : LIGHT_THEME;
  }

  function apply(root = document) {
    const rootEl = root?.documentElement || document.documentElement;
    if (!rootEl) {
      return;
    }
    rootEl.dataset.themePreference = preferredTheme;
    rootEl.dataset.theme = resolvedTheme;
    rootEl.style.colorScheme = resolvedTheme;
  }

  function updateResolvedTheme() {
    resolvedTheme =
      preferredTheme === SYSTEM_THEME ? getSystemResolvedTheme() : preferredTheme;
  }

  function handleSystemThemeChange() {
    if (preferredTheme !== SYSTEM_THEME) {
      return;
    }
    updateResolvedTheme();
    apply();
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes?.[STORAGE_KEY]) {
      return;
    }
    preferredTheme = normalizeTheme(changes[STORAGE_KEY].newValue);
    updateResolvedTheme();
    apply();
  }

  async function init() {
    if (isInitialised) {
      return;
    }
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");

      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        preferredTheme = normalizeTheme(stored?.[STORAGE_KEY]);
      } catch {
        preferredTheme = SYSTEM_THEME;
      }

      updateResolvedTheme();

      if (!mediaListenerBound && mediaQueryList) {
        mediaQueryList.addEventListener("change", handleSystemThemeChange);
        mediaListenerBound = true;
      }

      if (!storageListenerBound) {
        chrome.storage.onChanged.addListener(handleStorageChange);
        storageListenerBound = true;
      }

      isInitialised = true;
      apply();
    })();

    return initPromise;
  }

  async function setThemePreference(theme) {
    const nextTheme = normalizeTheme(theme);
    preferredTheme = nextTheme;
    updateResolvedTheme();
    apply();
    await chrome.storage.local.set({ [STORAGE_KEY]: nextTheme });
  }

  function getThemePreference() {
    return preferredTheme;
  }

  function getResolvedTheme() {
    return resolvedTheme;
  }

  window.YABMTheme = {
    init,
    apply,
    setThemePreference,
    getThemePreference,
    getResolvedTheme,
    LIGHT_THEME,
    DARK_THEME,
    SYSTEM_THEME,
  };
})();
