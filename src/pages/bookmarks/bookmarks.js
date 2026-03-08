/**
 * @file bookmarks.js
 * Main entry point for the YABM bookmarks page.
 * Initialises all sub-modules, wires DOM event listeners, manages the
 * WebDAV status bar, and coordinates language switching.
 *
 * Depends on the following globals (loaded via <script> tags before this file):
 *   - window.YABMI18n          (i18n.js)
 *   - window.YABMSync          (sync-utils.js)
 *   - window.YABMNotificationsModule
 *   - window.YABMScrollbarModule
 *   - window.YABMFaviconCacheModule
 *   - window.YABMModalsModule
 *   - window.YABMBookmarkTreeModule
 */

/** Shorthand wrapper around the active i18n translation function. */
const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);

/**
 * Available UI language options shown in the language picker menu.
 * Each entry maps a BCP-47-style locale value to a human-readable label and flag emoji.
 */
const LANGUAGE_OPTIONS = [
  { value: window.YABMI18n.AUTO_LANGUAGE, label: "Auto (Browser)", flag: "🌐" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "zh_CN", label: "Chinese (Simplified)", flag: "🇨🇳" },
  { value: "zh_TW", label: "Chinese (Traditional)", flag: "🇹🇼" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "es", label: "Espanol", flag: "🇪🇸" },
  { value: "fr", label: "Francais", flag: "🇫🇷" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "ja", label: "Japanese", flag: "🇯🇵" },
  { value: "ko", label: "Korean", flag: "🇰🇷" },
  { value: "pt", label: "Portugues", flag: "🇵🇹" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
];

/** Available UI theme options shown in the theme picker menu. */
const THEME_OPTIONS = [
  { value: window.YABMTheme.LIGHT_THEME, labelKey: "themeLight", iconFile: "light_mode" },
  { value: window.YABMTheme.DARK_THEME, labelKey: "themeDark", iconFile: "dark_mode" },
  { value: window.YABMTheme.SYSTEM_THEME, labelKey: "themeSystem", iconFile: "desktop_windows" },
];

/** LRU-style cache mapping flag emoji strings to their resolved Twemoji asset URLs. */
const flagIconCache = new Map();
/** Base path for Twemoji SVG assets relative to the extension root. */
const TWEMOJI_BASE_PATH = "assets/twemoji";
/** Base path for individually downloaded Material Symbols SVG assets. */
const MATERIAL_SYMBOLS_BASE_PATH = "assets/material-symbols";
/**
 * Maps logical WebDAV status keys to their CSS class, Twemoji codepoint, and text fallback.
 * The fallback text is shown when the icon image fails to load.
 */
const WEBDAV_ICON_STATES = {
  notConfigured: {
    cssClass: "is-not-configured",
    codepoint: "26aa",
    fallback: "?",
  },
  checking: { cssClass: "is-checking", codepoint: "23f3", fallback: "..." },
  ready: { cssClass: "is-ready", codepoint: "1f7e2", fallback: "OK" },
  error: { cssClass: "is-error", codepoint: "1f534", fallback: "!" },
};
/** Flat array of all WebDAV indicator CSS state classes for bulk removal. */
const WEBDAV_ICON_STATE_CLASSES = Object.values(WEBDAV_ICON_STATES).map(
  (item) => item.cssClass,
);

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
 * Returns the chrome-extension URL for a flag emoji's Twemoji SVG asset,
 * caching the result to avoid repeated codepoint conversions.
 * @param {string} flagEmoji
 * @returns {string}
 */
function getFlagIconSrc(flagEmoji) {
  if (flagIconCache.has(flagEmoji)) {
    return flagIconCache.get(flagEmoji);
  }
  const code = emojiToCodepoints(flagEmoji || "🌐");
  const url = chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${code}.svg`);
  flagIconCache.set(flagEmoji, url);
  return url;
}

/**
 * Returns the chrome-extension URL for a Twemoji SVG identified by its
 * raw Unicode codepoint string (e.g. `"1f7e2"` for 🟢).
 * @param {string} codepoint
 * @returns {string}
 */
function getTwemojiIconSrcByCodepoint(codepoint) {
  return chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${codepoint}.svg`);
}

/**
 * Returns the chrome-extension URL for a locally stored Material Symbols SVG.
 * @param {string} iconName
 * @returns {string}
 */
function getMaterialSymbolIconSrc(iconName) {
  return chrome.runtime.getURL(`${MATERIAL_SYMBOLS_BASE_PATH}/${iconName}.svg`);
}

/**
 * Returns the human-readable label for a language option value.
 * Falls back to `"Auto (Browser)"` when the value is not found.
 * @param {string} value - Locale value, e.g. `"en"` or `"auto"`.
 * @returns {string}
 */
function getLanguageOptionLabel(value) {
  const option = LANGUAGE_OPTIONS.find((item) => item.value === value);
  return option ? option.label : "Auto (Browser)";
}

/**
 * Returns the localised label for a theme option value.
 * Falls back to the system theme label when the value is not found.
 * @param {string} value
 * @returns {string}
 */
function getThemeOptionLabel(value) {
  const option = THEME_OPTIONS.find((item) => item.value === value);
  return option ? t(option.labelKey) : t("themeSystem");
}

/**
 * Updates a status element's text, visibility, and type modifier class.
 * Passing an empty or whitespace-only message hides the element.
 * @param {HTMLElement|null} statusEl
 * @param {string} baseClassName - Reset value applied before type modifiers.
 * @param {string} message - Status text; empty = hidden.
 * @param {'success'|'error'|''} type - Optional CSS modifier class.
 */
function updateStatusElement(statusEl, baseClassName, message, type) {
  if (!statusEl) {
    return;
  }
  const hasMessage = Boolean(message && String(message).trim());
  statusEl.className = baseClassName;
  if (!hasMessage) {
    statusEl.classList.add("is-hidden");
    statusEl.setAttribute("aria-hidden", "true");
    statusEl.textContent = "";
    return;
  }
  statusEl.textContent = message;
  statusEl.removeAttribute("aria-hidden");
  if (type) {
    statusEl.classList.add(type);
  }
}

const notificationsModule = window.YABMNotificationsModule.createNotificationsModule();
const {
  showTopToast,
  hideTopToast,
  showTopProgress,
  hideTopProgress,
  updateTopProgress,
} = notificationsModule;

/**
 * Sets the global sync status bar message and optionally shows a toast.
 * @param {string} message - Status text to display.
 * @param {'success'|'error'|''} type - Visual style class.
 */
function setStatus(message, type) {
  const statusEl = document.getElementById("sync-status");
  updateStatusElement(statusEl, "sync-status", message, type);
  if (message && (type === "success" || type === "error")) {
    showTopToast(message, type);
  }
}

const scrollbarModule = window.YABMScrollbarModule.createScrollbarModule();
const {
  updateBookmarkListScrollbar,
  startBookmarkScrollHold,
  stopBookmarkScrollHold,
  startBookmarkTrackPressScroll,
  handleBookmarkThumbPointerDown,
  handleBookmarkThumbPointerMove,
  stopBookmarkThumbDrag,
  isGlobalEventsBound,
  setGlobalEventsBound,
} = scrollbarModule;

// Proxy so sub-module factories (faviconModule, etc.) can reference rerenderAfterTreeChange
// before the tree module assigns the real implementation.
let rerenderAfterTreeChange = async () => {};

const faviconModule = window.YABMFaviconCacheModule.createFaviconCacheModule({
  t,
  setStatus,
  showTopToast,
  showTopProgress,
  hideTopProgress,
  updateTopProgress,
  rerenderAfterTreeChange: (...args) => rerenderAfterTreeChange(...args),
});

const {
  getCachedFaviconForBookmark,
  getBookmarkNodesInFolder,
  refreshBookmarkFavicon,
  refreshFolderFavicons,
  removeFaviconsByBookmarkIds,
  ensureValidUrl,
  ensureFaviconCacheLoaded,
  pruneFaviconCacheForTree,
} = faviconModule;

/**
 * Copies `text` to the clipboard using the modern Clipboard API when available,
 * with a hidden textarea fallback for environments that block it.
 * @param {string} text
 * @returns {Promise<void>}
 * @throws {Error} If both methods fail.
 */
async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "true");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  temp.style.left = "-9999px";
  temp.style.top = "-9999px";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(temp);
  if (!copied) {
    throw new Error(t("copyBookmarkUrlFailedUnknown"));
  }
}

/**
 * Copies a bookmark's URL to the clipboard and reports the outcome via the status bar.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @returns {Promise<void>}
 */
async function copyBookmarkUrl(node) {
  try {
    await copyTextToClipboard(node.url || "");
    setStatus(t("bookmarkUrlCopied"), "success");
  } catch (error) {
    setStatus(
      t("copyBookmarkUrlFailed", [
        error?.message || t("copyBookmarkUrlFailedUnknown"),
      ]),
      "error",
    );
  }
}

/**
 * Builds a tooltip string for the WebDAV status indicator.
 * Prepends the localised "WebDAV" label when detail text is provided.
 * @param {string} text
 * @returns {string}
 */
function getWebdavIndicatorTooltip(text) {
  const detail = (text || "").trim();
  return detail ? `${t("webdavLabel")}: ${detail}` : t("webdavLabel");
}

/**
 * Updates the WebDAV connection status indicator icon and tooltip.
 * Switches the icon element's CSS class, tooltip text, and Twemoji image src.
 * @param {'notConfigured'|'checking'|'ready'|'error'} stateKey
 * @param {string} tooltipText - Detail text appended to the label.
 */
function setWebdavStatusIndicator(stateKey, tooltipText) {
  const indicator = document.getElementById("webdav-status-indicator");
  const icon = document.getElementById("webdav-status-icon");
  if (!indicator || !icon) {
    return;
  }

  const state =
    WEBDAV_ICON_STATES[stateKey] || WEBDAV_ICON_STATES.notConfigured;
  indicator.classList.remove(...WEBDAV_ICON_STATE_CLASSES);
  indicator.classList.add(state.cssClass);
  indicator.dataset.tooltip = getWebdavIndicatorTooltip(tooltipText);
  indicator.setAttribute("aria-label", indicator.dataset.tooltip);
  indicator.textContent = "";
  indicator.appendChild(icon);
  icon.hidden = false;
  icon.dataset.fallback = state.fallback;
  icon.src = getTwemojiIconSrcByCodepoint(state.codepoint);
}

// Proxy — replaced by the real implementation after all modules and DOM refs are ready.
let refreshWebdavStatusBar = async () => {};

const modalsModule = window.YABMModalsModule.createModalsModule({
  t,
  setStatus,
  showTopToast,
  setWebdavStatusIndicator,
  refreshWebdavStatusBar: (...args) => refreshWebdavStatusBar(...args),
});

const {
  openConfigModal,
  closeConfigModal,
  openPromptModal,
  openEditorModal,
  testConfigConnection,
  saveConfigFromModal,
  clearConfigFromModal,
  invalidateConfigTest,
} = modalsModule;

/**
 * Recalculates CSS custom properties that depend on the rendered heights of the
 * bottom status bar and panel header, then syncs the custom scrollbar position.
 * Called after renders, resizes, and any DOM change that affects these elements.
 */
function updateMainLayoutMetrics() {
  const root = document.documentElement;
  const bottomStatus = document.querySelector(".bottom-status");
  const panelHead = document.querySelector(".bookmark-panel-head");
  const footerHeight = Math.ceil(
    bottomStatus?.getBoundingClientRect().height || 56,
  );
  const headHeight = Math.ceil(panelHead?.getBoundingClientRect().height || 44);
  root.style.setProperty("--bottom-status-space", `${footerHeight + 18}px`);
  root.style.setProperty("--bookmark-head-height", `${headHeight}px`);
  updateBookmarkListScrollbar();
}

const treeModule = window.YABMBookmarkTreeModule.createBookmarkTreeModule({
  t,
  getCachedFaviconForBookmark,
  getBookmarkNodesInFolder,
  copyBookmarkUrl,
  refreshBookmarkFavicon,
  refreshFolderFavicons,
  removeFaviconsByBookmarkIds,
  ensureValidUrl,
  ensureFaviconCacheLoaded,
  pruneFaviconCacheForTree,
  setStatus,
  openPromptModal,
  openEditorModal,
  closeEditContextMenu,
  updateMainLayoutMetrics,
  updateBookmarkListScrollbar,
  refreshWebdavStatusBar: (...args) => refreshWebdavStatusBar(...args),
});

let bindBookmarkTreeObservers;
let closeSortMenu;
let closeTreeContextMenu;
let createContainerDragHandlers;
let handleSortMenuApply;
let isTreeContextMenuOpen;
let renderBookmarks;
let setAllFoldersOpen;

({
  bindBookmarkTreeObservers,
  closeSortMenu,
  closeTreeContextMenu,
  createContainerDragHandlers,
  handleSortMenuApply,
  isTreeContextMenuOpen,
  renderBookmarks,
  rerenderAfterTreeChange,
  setAllFoldersOpen,
} = treeModule);

let editContextMenuOpen = false;
let editContextTarget = null;

/**
 * Returns `true` if `target` is an editable text field (input, textarea, or
 * contentEditable element) that is neither read-only nor disabled.
 * Used to decide whether to show the text edit context menu on right-click.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  return Boolean(
    target &&
      ((target instanceof HTMLInputElement &&
        !target.readOnly &&
        !target.disabled &&
        (target.type === "text" ||
          target.type === "search" ||
          target.type === "url" ||
          target.type === "email" ||
          target.type === "tel" ||
          target.type === "password")) ||
        (target instanceof HTMLTextAreaElement &&
          !target.readOnly &&
          !target.disabled) ||
        target.isContentEditable),
  );
}

/**
 * Closes and empties the text-editing context menu (cut/copy/paste/etc.).
 */
function closeEditContextMenu() {
  const menu = document.getElementById("edit-context-menu");
  if (!menu) {
    return;
  }
  menu.classList.add("hidden");
  menu.innerHTML = "";
  editContextMenuOpen = false;
  editContextTarget = null;
}

/**
 * Returns the currently selected text within an editable target element.
 * @param {HTMLElement|null} target
 * @returns {string}
 */
function getSelectionTextFromEditable(target) {
  if (!target) {
    return "";
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(start, end);
  }
  const sel = window.getSelection();
  return sel ? sel.toString() : "";
}

/**
 * Replaces the current selection in an editable element with `text`.
 * Handles both native input/textarea elements and `contentEditable` nodes.
 * Dispatches an `input` event so dependent listeners (e.g. validators) react.
 * @param {HTMLElement|null} target
 * @param {string} text - Replacement text (empty string to delete the selection).
 */
function replaceSelectedTextInEditable(target, text) {
  if (!target) {
    return;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (target.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    selection.deleteFromDocument();
    const range = selection.getRangeAt(0);
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Builds and displays the rich-text context menu (cut/copy/paste/delete/select-all)
 * for an editable element at the given screen coordinates.
 * Copy/cut/delete items are disabled when there is no active selection.
 * @param {HTMLElement} target - The focused editable element.
 * @param {number} x - Horizontal screen position.
 * @param {number} y - Vertical screen position.
 */
function openEditContextMenu(target, x, y) {
  const menu = document.getElementById("edit-context-menu");
  if (!menu) {
    return;
  }
  if (typeof target.focus === "function") {
    target.focus();
  }
  closeTreeContextMenu();
  closeSortMenu();
  menu.innerHTML = "";

  editContextTarget = target;
  editContextMenuOpen = true;

  const selectedText = getSelectionTextFromEditable(target);
  const hasSelection = selectedText.length > 0;

  const makeItem = ({ label, icon, onClick, disabled = false }) => {
    const button = document.createElement("button");
    button.className = "tree-context-item";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = disabled;
    button.innerHTML = `
      <span class="icon-font" aria-hidden="true">${icon}</span>
      <span>${label}</span>
    `;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeEditContextMenu();
      if (!disabled) {
        await onClick();
      }
    });
    return button;
  };

  const addDivider = () => {
    const divider = document.createElement("div");
    divider.className = "tree-context-divider";
    menu.appendChild(divider);
  };

  menu.appendChild(
    makeItem({
      label: t("contextCut"),
      icon: "content_cut",
      disabled: !hasSelection,
      onClick: async () => document.execCommand("cut"),
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextCopy"),
      icon: "content_copy",
      disabled: !hasSelection,
      onClick: async () => document.execCommand("copy"),
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextPaste"),
      icon: "content_paste",
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          replaceSelectedTextInEditable(target, text);
        } catch {
          setStatus(t("pastePermissionDenied"), "error");
        }
      },
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextDelete"),
      icon: "delete",
      disabled: !hasSelection,
      onClick: async () => replaceSelectedTextInEditable(target, ""),
    }),
  );
  addDivider();
  menu.appendChild(
    makeItem({
      label: t("contextSelectAll"),
      icon: "select_all",
      onClick: async () => {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          target.select();
          return;
        }
        if (target.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(target);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      },
    }),
  );

  menu.classList.remove("hidden");
  const width = menu.offsetWidth || 220;
  const height = menu.offsetHeight || 260;
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - height - 8, Math.max(8, y));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/**
 * Enables or disables the three WebDAV sync action buttons simultaneously.
 * Used to prevent repeated invocations while an upload/download is in progress.
 * @param {boolean} disabled
 */
function setSyncButtonsDisabled(disabled) {
  const ids = ["upload-bookmarks", "download-bookmarks", "webdav-refresh"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disabled;
    }
  }
}

/**
 * Updates the WebDAV status bar's URL label, entry counts, and refresh-button state.
 * Passing `undefined` for any string field leaves that element unchanged.
 * @param {{ urlText?: string, countText?: string, browserCountText?: string, refreshDisabled?: boolean }} options
 */
function setWebdavStatusBarState({
  urlText,
  countText,
  browserCountText,
  refreshDisabled = false,
}) {
  const urlEl = document.getElementById("webdav-url");
  const countEl = document.getElementById("webdav-count");
  const browserCountEl = document.getElementById("browser-count");
  const refreshBtn = document.getElementById("webdav-refresh");

  if (urlEl && typeof urlText === "string") {
    urlEl.textContent = urlText;
    urlEl.dataset.tooltip = urlText;
  }
  if (countEl && typeof countText === "string") {
    countEl.textContent = countText;
  }
  if (browserCountEl && typeof browserCountText === "string") {
    browserCountEl.textContent = browserCountText;
  }
  if (refreshBtn) {
    refreshBtn.disabled = refreshDisabled;
  }
  requestAnimationFrame(updateMainLayoutMetrics);
}

/**
 * Recursively counts bookmark entries (nodes with a `url`) in a subtree.
 * Folders themselves are not counted.
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
 * @returns {number}
 */
function countBrowserBookmarkEntries(nodes) {
  let total = 0;
  for (const node of nodes || []) {
    if (node.url) {
      total += 1;
      continue;
    }
    total += countBrowserBookmarkEntries(node.children || []);
  }
  return total;
}

/**
 * Fetches the full Chrome bookmark tree and returns the total number of
 * bookmark entries (excluding folders) across all top-level folders.
 * @returns {Promise<number>}
 */
async function getBrowserBookmarkEntryCount() {
  const tree = await chrome.bookmarks.getTree();
  return countBrowserBookmarkEntries(tree?.[0]?.children || []);
}

refreshWebdavStatusBar = async function refreshWebdavStatusBarImpl({
  interactive = false,
} = {}) {
  const refreshBtn = document.getElementById("webdav-refresh");
  if (refreshBtn) {
    refreshBtn.disabled = true;
  }
  setWebdavStatusIndicator("checking", t("webdavEntriesRefreshing"));

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      const browserCount = await getBrowserBookmarkEntryCount();
      setWebdavStatusBarState({
        urlText: t("notConfigured"),
        countText: t("webdavEntriesDash"),
        browserCountText: t("browserEntries", [String(browserCount)]),
      });
      setWebdavStatusIndicator("notConfigured", t("notConfigured"));
      return;
    }

    let webdavDisplayUrl = config.directoryUrl;
    try {
      const normalizedDirectoryUrl = window.YABMSync.normalizeDirectoryUrl(
        config.directoryUrl,
      );
      webdavDisplayUrl = config.fileName
        ? window.YABMSync.joinDirectoryAndFile(
            normalizedDirectoryUrl,
            config.fileName,
          )
        : normalizedDirectoryUrl;
    } catch {
      webdavDisplayUrl = config.directoryUrl;
    }

    setWebdavStatusBarState({
      urlText: webdavDisplayUrl,
      countText: t("webdavEntriesRefreshing"),
      browserCountText: t("browserEntriesRefreshing"),
      refreshDisabled: true,
    });

    const [browserCount, webdavEntries] = await Promise.all([
      getBrowserBookmarkEntryCount(),
      window.YABMSync.getWebDavBookmarkEntryCount(
        {
          directoryUrl: config.directoryUrl,
          fileName: config.fileName,
          username: config.username || "",
          password: config.password || "",
        },
        { interactive },
      ),
    ]);

    setWebdavStatusBarState({
      urlText: webdavDisplayUrl,
      countText: t("webdavEntries", [String(webdavEntries)]),
      browserCountText: t("browserEntries", [String(browserCount)]),
    });
    setWebdavStatusIndicator(
      "ready",
      t("webdavEntries", [String(webdavEntries)]),
    );
  } catch {
    const browserCount = await getBrowserBookmarkEntryCount().catch(() => null);
    setWebdavStatusBarState({
      countText: t("webdavEntriesError"),
      browserCountText:
        browserCount === null
          ? t("browserEntriesError")
          : t("browserEntries", [String(browserCount)]),
    });
    setWebdavStatusIndicator("error", t("webdavEntriesError"));
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
    }
  }
};

/**
 * Uploads the current Chrome bookmark tree to the configured WebDAV location
 * after prompting the user for confirmation.
 * @returns {Promise<void>}
 */
async function handleUpload() {
  const proceed = await openPromptModal({
    title: t("confirmUploadTitle"),
    message: t("confirmUploadMessage"),
    confirmLabel: t("startUpload"),
    cancelLabel: t("cancel"),
  });
  if (!proceed) {
    return;
  }

  setSyncButtonsDisabled(true);
  setStatus(t("uploadingBookmarks"), "");
  setWebdavStatusIndicator("checking", t("uploadingBookmarks"));
  showTopProgress();

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      setStatus(t("configureWebdavFirst"), "error");
      return;
    }

    await window.YABMSync.uploadBookmarksToWebDav(config);
    setStatus(t("uploadSuccessful", [config.fileName]), "success");
  } catch (error) {
    setStatus(t("uploadFailed", [error.message]), "error");
  } finally {
    setSyncButtonsDisabled(false);
    await refreshWebdavStatusBar();
    hideTopProgress();
  }
}

/**
 * Downloads the bookmark file from WebDAV and imports it into Chrome after
 * prompting the user for confirmation.
 * @returns {Promise<void>}
 */
async function handleDownload() {
  const proceed = await openPromptModal({
    title: t("confirmDownloadTitle"),
    message: t("confirmDownloadMessage"),
    confirmLabel: t("continueDownload"),
    cancelLabel: t("cancel"),
  });
  if (!proceed) {
    return;
  }

  setSyncButtonsDisabled(true);
  setStatus(t("downloadingBookmarks"), "");
  setWebdavStatusIndicator("checking", t("downloadingBookmarks"));
  showTopProgress();

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      setStatus(t("configureWebdavFirst"), "error");
      return;
    }

    await window.YABMSync.downloadBookmarksFromWebDav(config);
    setStatus(t("downloadSuccessful", [config.fileName]), "success");
    await renderBookmarks();
  } catch (error) {
    setStatus(t("downloadFailed", [error.message]), "error");
  } finally {
    setSyncButtonsDisabled(false);
    await refreshWebdavStatusBar();
    hideTopProgress();
  }
}

/**
 * Reads the extension version from the manifest and writes it into the footer
 * version element, with a tooltip showing the full version string.
 */
function setAppVersion() {
  const versionEl = document.getElementById("app-version");
  if (!versionEl) {
    return;
  }
  const version = chrome?.runtime?.getManifest?.().version || "";
  versionEl.textContent = version ? `v${version}` : "v-";
  versionEl.dataset.tooltip = version
    ? t("appVersionTooltipWithValue", [version])
    : t("appVersionTooltip");
}

/**
 * Attaches all UI event listeners for the bookmarks page:
 * toolbar buttons, scrollbar interactions, menus, context menus, tooltips,
 * keyboard shortcuts, and window-level cleanup handlers.
 * Must be called once after the DOM is ready.
 */
function bindTreeActions() {
  const expandAllBtn = document.getElementById("expand-all");
  const collapseAllBtn = document.getElementById("collapse-all");
  const openConfigBtn = document.getElementById("open-config");
  const openLanguageMenuBtn = document.getElementById("open-language-menu");
  const openThemeMenuBtn = document.getElementById("open-theme-menu");
  const languageMenu = document.getElementById("language-menu");
  const themeMenu = document.getElementById("theme-menu");
  const closeConfigBtn = document.getElementById("close-config");
  const cancelConfigBtn = document.getElementById("cfg-cancel");
  const configTestBtn = document.getElementById("cfg-test");
  const configSaveBtn = document.getElementById("cfg-save");
  const configClearBtn = document.getElementById("cfg-clear");
  const uploadBtn = document.getElementById("upload-bookmarks");
  const downloadBtn = document.getElementById("download-bookmarks");
  const webdavRefreshBtn = document.getElementById("webdav-refresh");
  const webdavStatusIcon = document.getElementById("webdav-status-icon");
  const bookmarkListEl = document.getElementById("bookmark-list");
  const scrollbarTrack = document.getElementById("bookmark-scrollbar");
  const scrollbarUpBtn = document.getElementById("bookmark-scroll-up");
  const scrollbarDownBtn = document.getElementById("bookmark-scroll-down");
  const scrollbarThumb = document.getElementById("bookmark-scrollbar-thumb");
  const topToast = document.getElementById("top-toast");
  const sortMenu = document.getElementById("folder-sort-menu");
  const treeContextMenu = document.getElementById("tree-context-menu");
  const editContextMenu = document.getElementById("edit-context-menu");
  const appTooltip = document.getElementById("app-tooltip");
  const sortAscBtn = document.getElementById("sort-asc");
  const sortDescBtn = document.getElementById("sort-desc");
  let tooltipTarget = null;
  let languageMenuOpen = false;
  let themeMenuOpen = false;

  webdavStatusIcon?.addEventListener("error", () => {
    const indicator = document.getElementById("webdav-status-indicator");
    if (!indicator) {
      return;
    }
    indicator.textContent = webdavStatusIcon.dataset.fallback || "?";
  });

  const closeLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    languageMenu.classList.add("hidden");
    languageMenuOpen = false;
  };

  const closeThemeMenu = () => {
    if (!themeMenu) {
      return;
    }
    themeMenu.classList.add("hidden");
    themeMenuOpen = false;
  };

  const positionMenu = (menuEl, anchorEl) => {
    if (!menuEl || !anchorEl) {
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const width = menuEl.offsetWidth || 220;
    const left = Math.min(
      window.innerWidth - width - 10,
      Math.max(10, rect.right - width),
    );
    const top = Math.min(window.innerHeight - 10, rect.bottom + 8);
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
  };

  const positionLanguageMenu = () => {
    positionMenu(languageMenu, openLanguageMenuBtn);
  };

  const positionThemeMenu = () => {
    positionMenu(themeMenu, openThemeMenuBtn);
  };

  const updateLanguageButtonTooltip = () => {
    if (!openLanguageMenuBtn) {
      return;
    }
    const preferred = window.YABMI18n.getLanguagePreference();
    openLanguageMenuBtn.dataset.tooltip = t("languageCurrentTooltip", [
      getLanguageOptionLabel(preferred),
    ]);
  };

  const updateThemeButtonTooltip = () => {
    if (!openThemeMenuBtn) {
      return;
    }
    openThemeMenuBtn.dataset.tooltip = t("themeCurrentTooltip", [
      getThemeOptionLabel(window.YABMTheme.getThemePreference()),
    ]);
  };

  const updatePageLanguage = async (language) => {
    await window.YABMI18n.setLanguagePreference(language);
    window.YABMI18n.apply();
    renderLanguageMenu();
    renderThemeMenu();
    setAppVersion();
    await rerenderAfterTreeChange();
  };

  const renderLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    const preferred = window.YABMI18n.getLanguagePreference();
    languageMenu.innerHTML = "";
    for (const option of LANGUAGE_OPTIONS) {
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
        option.value === window.YABMI18n.AUTO_LANGUAGE
          ? "language-item-flag language-item-flag-auto"
          : "language-item-flag language-item-flag-country";
      item.innerHTML =
        `<span class="sort-menu-icon ${flagClass}" aria-hidden="true"><img class="language-flag-img" alt="" src="${getFlagIconSrc(option.flag || "🌐")}" data-fallback="${option.flag || "🌐"}" /></span>` +
        `<span>${option.label}</span>` +
        (preferred === option.value
          ? '<span class="language-item-check icon-font" aria-hidden="true">check</span>'
          : "");
      const flagImg = item.querySelector(".language-flag-img");
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
        closeLanguageMenu();
        try {
          await updatePageLanguage(option.value);
        } catch (error) {
          setStatus(t("initializationFailed", [error.message]), "error");
        }
      });
      languageMenu.appendChild(item);
    }
    updateLanguageButtonTooltip();
  };

  const updatePageTheme = async (theme) => {
    await window.YABMTheme.setThemePreference(theme);
    window.YABMTheme.apply();
    renderThemeMenu();
  };

  const renderThemeMenu = () => {
    if (!themeMenu) {
      return;
    }
    const preferred = window.YABMTheme.getThemePreference();
    themeMenu.innerHTML = "";
    for (const option of THEME_OPTIONS) {
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
        `<span class="sort-menu-icon theme-menu-icon" aria-hidden="true"><span class="theme-symbol-icon" style="--theme-symbol-icon: url('${getMaterialSymbolIconSrc(option.iconFile)}');"></span></span>` +
        `<span>${t(option.labelKey)}</span>` +
        (preferred === option.value
          ? '<span class="language-item-check icon-font" aria-hidden="true">check</span>'
          : "");
      item.addEventListener("click", async () => {
        closeThemeMenu();
        try {
          await updatePageTheme(option.value);
        } catch (error) {
          setStatus(t("initializationFailed", [error.message]), "error");
        }
      });
      themeMenu.appendChild(item);
    }
    updateThemeButtonTooltip();
  };

  const openLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    closeThemeMenu();
    renderLanguageMenu();
    languageMenu.classList.remove("hidden");
    languageMenuOpen = true;
    positionLanguageMenu();
  };

  const openThemeMenu = () => {
    if (!themeMenu) {
      return;
    }
    closeLanguageMenu();
    renderThemeMenu();
    themeMenu.classList.remove("hidden");
    themeMenuOpen = true;
    positionThemeMenu();
  };

  const hideAppTooltip = () => {
    if (!appTooltip) {
      return;
    }
    appTooltip.classList.add("hidden");
    appTooltip.textContent = "";
    tooltipTarget = null;
  };

  const positionAppTooltip = (x, y) => {
    if (!appTooltip || appTooltip.classList.contains("hidden")) {
      return;
    }
    const width = appTooltip.offsetWidth || 180;
    const height = appTooltip.offsetHeight || 36;
    const offset = 12;
    const left = Math.min(
      window.innerWidth - width - 10,
      Math.max(10, x + offset),
    );
    const top = Math.min(
      window.innerHeight - height - 10,
      Math.max(10, y + offset),
    );
    appTooltip.style.left = `${left}px`;
    appTooltip.style.top = `${top}px`;
  };

  const showAppTooltip = (target, x, y) => {
    if (!appTooltip) {
      return;
    }
    const text = target?.dataset?.tooltip?.trim();
    if (!text) {
      hideAppTooltip();
      return;
    }
    tooltipTarget = target;
    appTooltip.textContent = text;
    appTooltip.classList.remove("hidden");
    positionAppTooltip(x, y);
  };

  expandAllBtn?.addEventListener("click", () => setAllFoldersOpen(true));
  collapseAllBtn?.addEventListener("click", () => setAllFoldersOpen(false));

  openConfigBtn?.addEventListener("click", openConfigModal);
  openLanguageMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (languageMenuOpen) {
      closeLanguageMenu();
    } else {
      openLanguageMenu();
    }
  });
  openThemeMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (themeMenuOpen) {
      closeThemeMenu();
    } else {
      openThemeMenu();
    }
  });
  closeConfigBtn?.addEventListener("click", closeConfigModal);
  cancelConfigBtn?.addEventListener("click", closeConfigModal);
  configTestBtn?.addEventListener("click", testConfigConnection);
  configSaveBtn?.addEventListener("click", saveConfigFromModal);
  configClearBtn?.addEventListener("click", clearConfigFromModal);

  const invalidateInputs = [
    "cfg-directory-url",
    "cfg-username",
    "cfg-password",
  ];
  for (const id of invalidateInputs) {
    const el = document.getElementById(id);
    el?.addEventListener("input", invalidateConfigTest);
  }

  document
    .getElementById("cfg-new-file-name")
    ?.addEventListener("input", () => {
      const newRadio = document.querySelector('input[value="__new__"]');
      if (newRadio) {
        newRadio.checked = true;
      }
    });

  uploadBtn?.addEventListener("click", handleUpload);
  downloadBtn?.addEventListener("click", handleDownload);
  webdavRefreshBtn?.addEventListener("click", () =>
    refreshWebdavStatusBar({ interactive: true }),
  );
  scrollbarUpBtn?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    startBookmarkScrollHold(-1);
  });
  scrollbarDownBtn?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    startBookmarkScrollHold(1);
  });
  scrollbarUpBtn?.addEventListener("pointerup", stopBookmarkScrollHold);
  scrollbarDownBtn?.addEventListener("pointerup", stopBookmarkScrollHold);
  scrollbarUpBtn?.addEventListener("pointercancel", stopBookmarkScrollHold);
  scrollbarDownBtn?.addEventListener("pointercancel", stopBookmarkScrollHold);
  scrollbarUpBtn?.addEventListener("click", (event) => event.preventDefault());
  scrollbarDownBtn?.addEventListener("click", (event) =>
    event.preventDefault(),
  );
  scrollbarTrack?.addEventListener("pointerdown", (event) => {
    if (
      scrollbarThumb &&
      event.target &&
      scrollbarThumb.contains(event.target)
    ) {
      return;
    }
    startBookmarkTrackPressScroll(event);
  });
  scrollbarThumb?.addEventListener(
    "pointerdown",
    handleBookmarkThumbPointerDown,
  );
  scrollbarThumb?.addEventListener("dragstart", (event) =>
    event.preventDefault(),
  );
  bookmarkListEl?.addEventListener("scroll", updateBookmarkListScrollbar, {
    passive: true,
  });
  // Attach container-level drag handlers for bookmark/folder drag-and-drop
  if (bookmarkListEl && createContainerDragHandlers) {
    const containerHandlers = createContainerDragHandlers(bookmarkListEl);
    containerHandlers.attach();
  }
  if (!isGlobalEventsBound()) {
    setGlobalEventsBound(true);
    document.addEventListener("pointermove", handleBookmarkThumbPointerMove);
    document.addEventListener("pointerup", (event) => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag(event.pointerId);
    });
    document.addEventListener("pointercancel", (event) => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag(event.pointerId);
    });
    window.addEventListener("blur", () => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopBookmarkScrollHold();
        stopBookmarkThumbDrag();
      }
    });
  }

  sortAscBtn?.addEventListener("click", async () => {
    await handleSortMenuApply(false);
  });

  sortDescBtn?.addEventListener("click", async () => {
    await handleSortMenuApply(true);
  });

  document.addEventListener("click", (event) => {
    if (
      editContextMenuOpen &&
      editContextMenu &&
      !editContextMenu.contains(event.target)
    ) {
      closeEditContextMenu();
    }

    if (
      isTreeContextMenuOpen() &&
      treeContextMenu &&
      !treeContextMenu.contains(event.target)
    ) {
      closeTreeContextMenu();
    }

    if (languageMenuOpen) {
      const inLanguageMenu = Boolean(
        (languageMenu && languageMenu.contains(event.target)) ||
          (openLanguageMenuBtn && openLanguageMenuBtn.contains(event.target)),
      );
      if (!inLanguageMenu) {
        closeLanguageMenu();
      }
    }

    if (themeMenuOpen) {
      const inThemeMenu = Boolean(
        (themeMenu && themeMenu.contains(event.target)) ||
          (openThemeMenuBtn && openThemeMenuBtn.contains(event.target)),
      );
      if (!inThemeMenu) {
        closeThemeMenu();
      }
    }

    if (!sortMenu || sortMenu.classList.contains("hidden")) {
      return;
    }
    if (sortMenu.contains(event.target)) {
      return;
    }
    closeSortMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEditContextMenu();
      closeTreeContextMenu();
      closeSortMenu();
      closeLanguageMenu();
      closeThemeMenu();
      hideAppTooltip();
    }
  });
  window.addEventListener("resize", () => {
    closeEditContextMenu();
    closeLanguageMenu();
    closeThemeMenu();
    hideAppTooltip();
    updateMainLayoutMetrics();
  });
  window.addEventListener("scroll", closeEditContextMenu, true);
  window.addEventListener("resize", closeTreeContextMenu);
  window.addEventListener(
    "scroll",
    () => {
      closeTreeContextMenu();
      closeLanguageMenu();
      closeThemeMenu();
      hideAppTooltip();
    },
    true,
  );

  document.addEventListener("mouseover", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      return;
    }
    showAppTooltip(target, event.clientX, event.clientY);
  });

  document.addEventListener("mousemove", (event) => {
    if (!tooltipTarget) {
      return;
    }
    positionAppTooltip(event.clientX, event.clientY);
  });

  document.addEventListener("mouseout", (event) => {
    if (!tooltipTarget) {
      return;
    }
    const related = event.relatedTarget;
    if (related && tooltipTarget.contains(related)) {
      return;
    }
    if (event.target && tooltipTarget.contains(event.target)) {
      hideAppTooltip();
    }
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    showAppTooltip(target, rect.left + rect.width / 2, rect.bottom);
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (tooltipTarget && target && tooltipTarget.contains(target)) {
      hideAppTooltip();
    }
  });

  topToast?.addEventListener("click", hideTopToast);

  bookmarkListEl?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const target = event.target;
    const hasNodeMenu = Boolean(
      target &&
        typeof target.closest === "function" &&
        (target.closest(".folder-header") || target.closest(".bookmark-row")),
    );
    if (!hasNodeMenu) {
      closeTreeContextMenu();
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (isEditableTarget(target)) {
      event.preventDefault();
      openEditContextMenu(target, event.clientX, event.clientY);
      return;
    }
    const isInsideTree = Boolean(
      target &&
        typeof target.closest === "function" &&
        target.closest("#bookmark-list"),
    );
    if (!isInsideTree) {
      event.preventDefault();
    }
  });

  const preferred = window.YABMI18n.getLanguagePreference();
  if (openLanguageMenuBtn) {
    openLanguageMenuBtn.dataset.tooltip = t("languageCurrentTooltip", [
      getLanguageOptionLabel(preferred),
    ]);
  }
  updateThemeButtonTooltip();
}

/**
 * Initialises the bookmarks page:
 * loads i18n, applies translations, binds events, renders the bookmark tree,
 * refreshes the WebDAV status bar, and opens the config modal automatically
 * when the `?openConfig=1` query param is present (used by the options_page entry).
 * @returns {Promise<void>}
 */
async function initPage() {
  await window.YABMTheme.init();
  window.YABMTheme.apply();
  await window.YABMI18n.init();
  window.YABMI18n.apply();
  bindTreeActions();
  updateMainLayoutMetrics();
  bindBookmarkTreeObservers();
  setAppVersion();
  await refreshWebdavStatusBar();
  await renderBookmarks();
  updateMainLayoutMetrics();
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get("openConfig") === "1") {
    currentUrl.searchParams.delete("openConfig");
    window.history.replaceState(
      null,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
    await openConfigModal();
  }
}

initPage().catch((error) => {
  const container = document.getElementById("bookmark-list");
  container.innerHTML = `<div class="empty">${t("loadBookmarksFailed", [error.message])}</div>`;
});
