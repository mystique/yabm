/**
 * @file bookmark-appearance-menu.js
 * The language and theme picker menus for the bookmarks page.
 *
 * Both menus are the same feature: a trigger button in the header that opens a
 * list of options, marks the current one, and applies the chosen value, plus a
 * tooltip on the trigger describing what is currently active. Applying a
 * language also repaints the page (both menus, the version footer, and the tree),
 * which is why this module needs the hooks for those three and nothing else.
 *
 * The composition root injects the collaborators; this module reads no
 * `window.YABM*` global. Exposed as `window.YABMAppearanceMenuModule`.
 */

/**
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlayModule} BookmarkOverlayModule
 */

/**
 * One selectable UI language, with its display label and flag emoji.
 * @typedef {Object} LanguageOption
 * @property {string} value
 * @property {string} label
 * @property {string} flag
 */

/**
 * One selectable UI theme, identified by its translation key and icon ligature.
 * @typedef {Object} ThemeOption
 * @property {string} value
 * @property {string} labelKey
 * @property {string} iconLigature
 */

/**
 * Subset of the `window.YABMI18n` service used by this module.
 * @typedef {Object} AppearanceI18nService
 * @property {string} AUTO_LANGUAGE
 * @property {() => string} getLanguagePreference
 * @property {(language: string) => Promise<void>} setLanguagePreference
 * @property {() => void} apply
 */

/**
 * Subset of the `window.YABMTheme` service used by this module.
 * @typedef {Object} AppearanceThemeService
 * @property {string} LIGHT_THEME
 * @property {string} DARK_THEME
 * @property {string} SYSTEM_THEME
 * @property {() => string} getThemePreference
 * @property {(theme: string) => Promise<void>} setThemePreference
 * @property {() => void} apply
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} AppearanceMenuModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(message: string, type?: 'success'|'error'|'') => void} setStatus
 * @property {AppearanceI18nService} i18n
 * @property {AppearanceThemeService} theme
 * @property {BookmarkOverlayModule["createOverlay"]} createOverlay
 * @property {() => void} setAppVersion
 * @property {() => Promise<void>} rerenderAfterTreeChange
 */

/**
 * Public API returned by `createAppearanceMenuModule`.
 * @typedef {Object} AppearanceMenuModule
 * @property {() => void} bindTriggerButtons
 * @property {() => void} refreshTriggerTooltips
 */

(function () {
  /**
   * Factory that creates the language and theme picker module.
   * `i18n` and `theme` are the page's shared-library services, injected by
   * bookmarks.js so this module does not read those globals directly.
   * @param {AppearanceMenuModuleDeps} deps
   * @returns {AppearanceMenuModule}
   */
  function createAppearanceMenuModule(deps) {
    const {
      t,
      setStatus,
      i18n,
      theme,
      createOverlay,
      setAppVersion,
      rerenderAfterTreeChange,
    } = deps;

    /**
     * Available UI language options shown in the language picker menu.
     * Each entry maps a BCP-47-style locale value to a human-readable label and flag emoji.
     * @type {LanguageOption[]}
     */
    const languageOptions = [
      { value: i18n.AUTO_LANGUAGE, label: "Auto (Browser)", flag: "🌐" },
      { value: "en", label: "English", flag: "🇺🇸" },
      { value: "zh_CN", label: "Chinese (Simplified)", flag: "🇨🇳" },
      { value: "zh_TW", label: "Chinese (Traditional)", flag: "🇭🇰" },
      { value: "de", label: "Deutsch", flag: "🇩🇪" },
      { value: "es", label: "Espanol", flag: "🇪🇸" },
      { value: "fr", label: "Francais", flag: "🇫🇷" },
      { value: "it", label: "Italiano", flag: "🇮🇹" },
      { value: "ja", label: "Japanese", flag: "🇯🇵" },
      { value: "ko", label: "Korean", flag: "🇰🇷" },
      { value: "pt", label: "Portugues", flag: "🇵🇹" },
      { value: "ru", label: "Русский", flag: "🇷🇺" },
    ];

    /**
     * Available UI theme options shown in the theme picker menu.
     * @type {ThemeOption[]}
     */
    const themeOptions = [
      { value: theme.LIGHT_THEME, labelKey: "themeLight", iconLigature: "light_mode" },
      { value: theme.DARK_THEME, labelKey: "themeDark", iconLigature: "dark_mode" },
      { value: theme.SYSTEM_THEME, labelKey: "themeSystem", iconLigature: "desktop_windows" },
    ];

    /** LRU-style cache mapping flag emoji strings to their resolved Twemoji asset URLs. */
    const flagIconCache = new Map();
    /** Base URL for Twemoji SVG assets on jsDelivr CDN. */
    const TWEMOJI_CDN_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg";

    /**
     * Converts a Unicode emoji string to a hyphen-joined hex codepoint string
     * compatible with the Twemoji file naming convention.
     * @param {string} emoji
     * @returns {string} e.g. `"1f1fa-1f1f8"` for 🇺🇸
     */
    function emojiToCodepoints(emoji) {
      return Array.from(emoji || "")
        .map((ch) => ch.codePointAt(0).toString(16))
        .join("-");
    }

    /**
     * Returns the CDN URL for a flag emoji's Twemoji SVG asset,
     * caching the result to avoid repeated codepoint conversions.
     * @param {string} flagEmoji
     * @returns {string}
     */
    function getFlagIconSrc(flagEmoji) {
      if (flagIconCache.has(flagEmoji)) {
        return flagIconCache.get(flagEmoji);
      }
      const code = emojiToCodepoints(flagEmoji || "🌐");
      const url = `${TWEMOJI_CDN_BASE}/${code}.svg`;
      flagIconCache.set(flagEmoji, url);
      return url;
    }

    /**
     * Returns the human-readable label for a language option value.
     * Falls back to `"Auto (Browser)"` when the value is not found.
     * @param {string} value - Locale value, e.g. `"en"` or `"auto"`.
     * @returns {string}
     */
    function getLanguageOptionLabel(value) {
      const option = languageOptions.find((item) => item.value === value);
      return option ? option.label : "Auto (Browser)";
    }

    /**
     * Returns the localised label for a theme option value.
     * Falls back to the system theme label when the value is not found.
     * @param {string} value
     * @returns {string}
     */
    function getThemeOptionLabel(value) {
      const option = themeOptions.find((item) => item.value === value);
      return option ? t(option.labelKey) : t("themeSystem");
    }

    /**
     * @returns {HTMLElement | null}
     */
    function getLanguageMenuButton() {
      return document.getElementById("open-language-menu");
    }

    /**
     * @returns {HTMLElement | null}
     */
    function getThemeMenuButton() {
      return document.getElementById("open-theme-menu");
    }

    /**
     * @returns {HTMLElement | null}
     */
    function getLanguageMenu() {
      return document.getElementById("language-menu");
    }

    /**
     * @returns {HTMLElement | null}
     */
    function getThemeMenu() {
      return document.getElementById("theme-menu");
    }

    const languageMenuOverlay = createOverlay({
      id: "languageMenu",
      getElement: getLanguageMenu,
      // Fallback sizes only apply to a zero measurement; the real menus are
      // taller than this once populated.
      fallbackSize: { width: 220, height: 360 },
      anchorGap: 8,
    });

    const themeMenuOverlay = createOverlay({
      id: "themeMenu",
      getElement: getThemeMenu,
      fallbackSize: { width: 220, height: 120 },
      anchorGap: 8,
    });

    /**
     * Writes the "currently active language" tooltip onto the language trigger.
     * @returns {void}
     */
    function updateLanguageButtonTooltip() {
      const openLanguageMenuBtn = getLanguageMenuButton();
      if (!openLanguageMenuBtn) {
        return;
      }
      const preferred = i18n.getLanguagePreference();
      openLanguageMenuBtn.dataset.tooltip = t("languageCurrentTooltip", [
        getLanguageOptionLabel(preferred),
      ]);
    }

    /**
     * Writes the "currently active theme" tooltip onto the theme trigger.
     * @returns {void}
     */
    function updateThemeButtonTooltip() {
      const openThemeMenuBtn = getThemeMenuButton();
      if (!openThemeMenuBtn) {
        return;
      }
      openThemeMenuBtn.dataset.tooltip = t("themeCurrentTooltip", [
        getThemeOptionLabel(theme.getThemePreference()),
      ]);
    }

    /**
     * Applies a language to the whole page and repaints everything that shows
     * localised or language-derived text.
     * @param {string} language
     * @returns {Promise<void>}
     */
    async function updatePageLanguage(language) {
      await i18n.setLanguagePreference(language);
      i18n.apply();
      renderLanguageMenu();
      renderThemeMenu();
      setAppVersion();
      await rerenderAfterTreeChange();
    }

    /**
     * Applies a theme to the whole page and repaints the theme menu.
     * @param {string} themeValue
     * @returns {Promise<void>}
     */
    async function updatePageTheme(themeValue) {
      await theme.setThemePreference(themeValue);
      theme.apply();
      renderThemeMenu();
    }

    /**
     * Rebuilds the language menu, marking the preferred language as active.
     * @returns {void}
     */
    function renderLanguageMenu() {
      const languageMenu = getLanguageMenu();
      if (!languageMenu) {
        return;
      }
      const preferred = i18n.getLanguagePreference();
      languageMenu.innerHTML = "";
      for (const option of languageOptions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sort-menu-item";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute(
          "aria-checked",
          preferred === option.value ? "true" : "false",
        );
        if (preferred === option.value) {
          item.classList.add("language-menu-item-active");
        }
        const flagClass =
          option.value === i18n.AUTO_LANGUAGE
            ? "language-item-flag language-item-flag-auto"
            : "language-item-flag language-item-flag-country";
        item.innerHTML =
          `<span class="sort-menu-icon ${flagClass}" aria-hidden="true"><img class="language-flag-img" alt="" src="${getFlagIconSrc(option.flag || "🌐")}" data-fallback="${option.flag || "🌐"}" /></span>` +
          `<span>${option.label}</span>` +
          (preferred === option.value
            ? '<span class="language-item-check icon-font" aria-hidden="true">check</span>'
            : "");
        const flagImg = /** @type {HTMLImageElement|null} */ (
          item.querySelector(".language-flag-img")
        );
        if (flagImg) {
          flagImg.addEventListener("error", () => {
            const fallback = flagImg.dataset.fallback || "🌐";
            const holder = flagImg.closest(".language-item-flag");
            if (holder) {
              holder.textContent = fallback;
            }
          });
        }
        item.addEventListener("click", async () => {
          languageMenuOverlay.close();
          try {
            await updatePageLanguage(option.value);
          } catch (error) {
            setStatus(t("initializationFailed", [error.message]), "error");
          }
        });
        languageMenu.appendChild(item);
      }
      updateLanguageButtonTooltip();
    }

    /**
     * Rebuilds the theme menu, marking the preferred theme as active.
     * @returns {void}
     */
    function renderThemeMenu() {
      const themeMenu = getThemeMenu();
      if (!themeMenu) {
        return;
      }
      const preferred = theme.getThemePreference();
      themeMenu.innerHTML = "";
      for (const option of themeOptions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sort-menu-item";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute(
          "aria-checked",
          preferred === option.value ? "true" : "false",
        );
        if (preferred === option.value) {
          item.classList.add("theme-menu-item-active");
        }
        item.innerHTML =
          `<span class="sort-menu-icon theme-menu-icon" aria-hidden="true"><span class="theme-symbol-icon">${option.iconLigature}</span></span>` +
          `<span>${t(option.labelKey)}</span>` +
          (preferred === option.value
            ? '<span class="language-item-check icon-font" aria-hidden="true">check</span>'
            : "");
        item.addEventListener("click", async () => {
          themeMenuOverlay.close();
          try {
            await updatePageTheme(option.value);
          } catch (error) {
            setStatus(t("initializationFailed", [error.message]), "error");
          }
        });
        themeMenu.appendChild(item);
      }
      updateThemeButtonTooltip();
    }

    /**
     * Opens the language menu below its trigger, closing the theme menu.
     * @returns {void}
     */
    function openLanguageMenu() {
      const languageMenu = getLanguageMenu();
      if (!languageMenu) {
        return;
      }
      themeMenuOverlay.close();
      renderLanguageMenu();
      languageMenuOverlay.openBelow(getLanguageMenuButton());
    }

    /**
     * Opens the theme menu below its trigger, closing the language menu.
     * @returns {void}
     */
    function openThemeMenu() {
      const themeMenu = getThemeMenu();
      if (!themeMenu) {
        return;
      }
      languageMenuOverlay.close();
      renderThemeMenu();
      themeMenuOverlay.openBelow(getThemeMenuButton());
    }

    /**
     * Attaches the click handlers for both picker triggers. Each trigger toggles
     * its own menu, and stops the event first so the overlay module's outside-click
     * handler does not dismiss the menu the trigger just opened.
     * @returns {void}
     */
    function bindTriggerButtons() {
      getLanguageMenuButton()?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (languageMenuOverlay.isOpen()) {
          languageMenuOverlay.close();
        } else {
          openLanguageMenu();
        }
      });
      getThemeMenuButton()?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (themeMenuOverlay.isOpen()) {
          themeMenuOverlay.close();
        } else {
          openThemeMenu();
        }
      });
    }

    /**
     * Rewrites both trigger tooltips to describe the current preferences.
     * @returns {void}
     */
    function refreshTriggerTooltips() {
      updateLanguageButtonTooltip();
      updateThemeButtonTooltip();
    }

    return { bindTriggerButtons, refreshTriggerTooltips };
  }

  window.YABMAppearanceMenuModule = {
    createAppearanceMenuModule,
  };
})();