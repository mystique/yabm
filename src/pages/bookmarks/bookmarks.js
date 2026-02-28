const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);

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

const flagIconCache = new Map();
const TWEMOJI_BASE_PATH = "assets/twemoji";
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
const WEBDAV_ICON_STATE_CLASSES = Object.values(WEBDAV_ICON_STATES).map(
  (item) => item.cssClass,
);

function emojiToCodepoints(emoji) {
  return Array.from(emoji || "")
    .map((ch) => ch.codePointAt(0).toString(16))
    .join("-");
}

function getFlagIconSrc(flagEmoji) {
  if (flagIconCache.has(flagEmoji)) {
    return flagIconCache.get(flagEmoji);
  }
  const code = emojiToCodepoints(flagEmoji || "🌐");
  const url = chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${code}.svg`);
  flagIconCache.set(flagEmoji, url);
  return url;
}

function getTwemojiIconSrcByCodepoint(codepoint) {
  return chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${codepoint}.svg`);
}

function getLanguageOptionLabel(value) {
  const option = LANGUAGE_OPTIONS.find((item) => item.value === value);
  return option ? option.label : "Auto (Browser)";
}

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

function getWebdavIndicatorTooltip(text) {
  const detail = (text || "").trim();
  return detail ? `${t("webdavLabel")}: ${detail}` : t("webdavLabel");
}

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
let handleBookmarkListDragOver;
let handleSortMenuApply;
let isTreeContextMenuOpen;
let renderBookmarks;
let setAllFoldersOpen;

({
  bindBookmarkTreeObservers,
  closeSortMenu,
  closeTreeContextMenu,
  handleBookmarkListDragOver,
  handleSortMenuApply,
  isTreeContextMenuOpen,
  renderBookmarks,
  rerenderAfterTreeChange,
  setAllFoldersOpen,
} = treeModule);

let editContextMenuOpen = false;
let editContextTarget = null;

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

function setSyncButtonsDisabled(disabled) {
  const ids = ["upload-bookmarks", "download-bookmarks", "webdav-refresh"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disabled;
    }
  }
}

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

function bindTreeActions() {
  const expandAllBtn = document.getElementById("expand-all");
  const collapseAllBtn = document.getElementById("collapse-all");
  const openConfigBtn = document.getElementById("open-config");
  const openLanguageMenuBtn = document.getElementById("open-language-menu");
  const languageMenu = document.getElementById("language-menu");
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

  const positionLanguageMenu = () => {
    if (!languageMenu || !openLanguageMenuBtn) {
      return;
    }
    const rect = openLanguageMenuBtn.getBoundingClientRect();
    const width = languageMenu.offsetWidth || 220;
    const left = Math.min(
      window.innerWidth - width - 10,
      Math.max(10, rect.right - width),
    );
    const top = Math.min(window.innerHeight - 10, rect.bottom + 8);
    languageMenu.style.left = `${left}px`;
    languageMenu.style.top = `${top}px`;
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

  const updatePageLanguage = async (language) => {
    await window.YABMI18n.setLanguagePreference(language);
    window.YABMI18n.apply();
    renderLanguageMenu();
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

  const openLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    renderLanguageMenu();
    languageMenu.classList.remove("hidden");
    languageMenuOpen = true;
    positionLanguageMenu();
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
  bookmarkListEl?.addEventListener("dragover", handleBookmarkListDragOver);
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
      hideAppTooltip();
    }
  });
  window.addEventListener("resize", () => {
    closeEditContextMenu();
    closeLanguageMenu();
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
}

async function initPage() {
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
