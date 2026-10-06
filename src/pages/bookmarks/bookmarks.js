/**
 * @file bookmarks.js
 * Composition root for the YABM bookmarks page.
 *
 * This file has one job: build the page's collaborators, construct every
 * feature module with them, and wire the page's own event handlers and startup
 * sequence. Feature behaviour lives in the modules it constructs; see
 * bookmark-webdav-status.js (connection status and sync actions),
 * bookmark-edit-menu.js (the rich-text context menu), bookmark-appearance-menu.js
 * (language and theme pickers), and bookmark-tooltip.js (shared tooltip).
 *
 * Depends on the following globals (loaded via <script> tags before this file):
 *   - window.YABMI18n          (i18n.js)
 *   - window.YABMTheme         (theme.js)
 *   - window.YABMSync          (sync-utils.js)
 *   - window.YABMWebdavConfigSession (webdav-config-session.js)
 *   - window.YABMWebdavFilePicker (webdav-file-picker.js)
 *   - window.YABMNotificationsModule
 *   - window.YABMScrollbarModule
 *   - window.YABMFaviconCacheModule
 *   - window.YABMModalsModule
 *   - window.YABMBookmarkOverlayModule
 *   - window.YABMWebdavStatusModule
 *   - window.YABMEditMenuModule
 *   - window.YABMAppearanceMenuModule
 *   - window.YABMTooltipModule
 *   - window.YABMBookmarkTreeModule
 */

/**
 * @typedef {import("./bookmark-tree.js").BookmarkTreeModule} BookmarkTreeModule
 * @typedef {import("./bookmark-tree.js").BookmarkTreeModuleDeps} BookmarkTreeModuleDeps
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlayModule} BookmarkOverlayModule
 * @typedef {import("./modals.js").ModalsModuleDeps} ModalsModuleDeps
 */

/** Shorthand wrapper around the active i18n translation function. */
const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);

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
/** @type {BookmarkTreeModule["rerenderAfterTreeChange"]} */
let rerenderAfterTreeChange = async () => {};

const faviconModule = window.YABMFaviconCacheModule.createFaviconCacheModule({
  t,
  setStatus,
  showTopToast,
  showTopProgress,
  hideTopProgress,
  updateTopProgress,
  rerenderAfterTreeChange: (
    /** @type {Parameters<BookmarkTreeModule["rerenderAfterTreeChange"]>} */ ...args
  ) => rerenderAfterTreeChange(...args),
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

/** Proxy — replaced by the WebDAV status module once it is constructed. */
/** @type {ModalsModuleDeps["setWebdavStatusIndicator"]} */
let setWebdavStatusIndicator = () => {};
/** Proxy — replaced by the WebDAV status module once it is constructed. */
/** @type {BookmarkTreeModuleDeps["refreshWebdavStatusBar"]} */
let refreshWebdavStatusBar = async () => {};

const modalsModule = window.YABMModalsModule.createModalsModule({
  t,
  setStatus,
  showTopToast,
  setWebdavStatusIndicator: (
    /** @type {Parameters<ModalsModuleDeps["setWebdavStatusIndicator"]>} */ ...args
  ) => setWebdavStatusIndicator(...args),
  refreshWebdavStatusBar: (
    /** @type {Parameters<BookmarkTreeModuleDeps["refreshWebdavStatusBar"]>} */ ...args
  ) => refreshWebdavStatusBar(...args),
  sync: window.YABMSync,
  createConfigSession: window.YABMWebdavConfigSession.createSession,
  createFilePicker: window.YABMWebdavFilePicker.createPicker,
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

/** @type {BookmarkOverlayModule["createOverlay"]} */
const createOverlay = window.YABMBookmarkOverlayModule.createOverlay;

/**
 * The bookmark edit context menu. Owned by this page but registered with the
 * overlay module, so the tree layer can close it through the same handle.
 */
const editContextMenu = createOverlay({
  id: "editContextMenu",
  getElement: () => document.getElementById("edit-context-menu"),
  fallbackSize: { width: 220, height: 260 },
  clearContent: true,
});

/** @type {BookmarkTreeModuleDeps} */
const treeModuleDeps = {
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
  createOverlay,
  editContextMenu,
  updateMainLayoutMetrics,
  updateBookmarkListScrollbar,
  refreshWebdavStatusBar: (
    /** @type {Parameters<BookmarkTreeModuleDeps["refreshWebdavStatusBar"]>} */ ...args
  ) => refreshWebdavStatusBar(...args),
};

/** @type {BookmarkTreeModule} */
const treeModule =
  window.YABMBookmarkTreeModule.createBookmarkTreeModule(treeModuleDeps);

/** @type {BookmarkTreeModule["bindBookmarkTreeObservers"]} */
let bindBookmarkTreeObservers;
/** @type {BookmarkTreeModule["closeSortMenu"]} */
let closeSortMenu;
/** @type {BookmarkTreeModule["closeTreeContextMenu"]} */
let closeTreeContextMenu;
/** @type {BookmarkTreeModule["createContainerDragHandlers"]} */
let createContainerDragHandlers;
/** @type {BookmarkTreeModule["handleSortMenuApply"]} */
let handleSortMenuApply;
/** @type {BookmarkTreeModule["renderBookmarks"]} */
let renderBookmarks;
/** @type {BookmarkTreeModule["setAllFoldersOpen"]} */
let setAllFoldersOpen;

({
  bindBookmarkTreeObservers,
  closeSortMenu,
  closeTreeContextMenu,
  createContainerDragHandlers,
  handleSortMenuApply,
  renderBookmarks,
  rerenderAfterTreeChange,
  setAllFoldersOpen,
} = treeModule);

/** @type {import("./bookmark-webdav-status.js").WebdavStatusModule} */
const webdavStatusModule =
  window.YABMWebdavStatusModule.createWebdavStatusModule({
    t,
    setStatus,
    sync: window.YABMSync,
    showTopProgress,
    hideTopProgress,
    openPromptModal,
    renderBookmarks,
    updateMainLayoutMetrics,
  });

const { uploadBookmarks, downloadBookmarks } = webdavStatusModule;

// The modals and tree modules were constructed above with forwarders for these
// two; they now resolve to the WebDAV status module's implementations.
setWebdavStatusIndicator = webdavStatusModule.setStatusIndicator;
refreshWebdavStatusBar = webdavStatusModule.refreshStatusBar;

/** @type {import("./bookmark-tooltip.js").TooltipModule} */
const tooltipModule = window.YABMTooltipModule.createTooltipModule({
  createOverlay,
});

/** @type {import("./bookmark-edit-menu.js").EditMenuModule} */
const editMenuModule = window.YABMEditMenuModule.createEditMenuModule({
  t,
  setStatus,
  editContextMenu,
  closeTreeContextMenu,
  closeSortMenu,
});

/** @type {import("./bookmark-appearance-menu.js").AppearanceMenuModule} */
const appearanceMenuModule =
  window.YABMAppearanceMenuModule.createAppearanceMenuModule({
    t,
    setStatus,
    i18n: window.YABMI18n,
    theme: window.YABMTheme,
    createOverlay,
    setAppVersion,
    rerenderAfterTreeChange,
  });

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
  const closeConfigBtn = document.getElementById("close-config");
  const cancelConfigBtn = document.getElementById("cfg-cancel");
  const configTestBtn = document.getElementById("cfg-test");
  const configSaveBtn = document.getElementById("cfg-save");
  const configClearBtn = document.getElementById("cfg-clear");
  const uploadBtn = document.getElementById("upload-bookmarks");
  const downloadBtn = document.getElementById("download-bookmarks");
  const webdavRefreshBtn = document.getElementById("webdav-refresh");
  const bookmarkListEl = document.getElementById("bookmark-list");
  const scrollbarTrack = document.getElementById("bookmark-scrollbar");
  const scrollbarUpBtn = document.getElementById("bookmark-scroll-up");
  const scrollbarDownBtn = document.getElementById("bookmark-scroll-down");
  const scrollbarThumb = document.getElementById("bookmark-scrollbar-thumb");
  const topToast = document.getElementById("top-toast");
  const sortAscBtn = document.getElementById("sort-asc");
  const sortDescBtn = document.getElementById("sort-desc");

  expandAllBtn?.addEventListener("click", () => setAllFoldersOpen(true));
  collapseAllBtn?.addEventListener("click", () => setAllFoldersOpen(false));

  openConfigBtn?.addEventListener("click", openConfigModal);
  appearanceMenuModule.bindTriggerButtons();
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
      const newRadio = /** @type {HTMLInputElement|null} */ (
        document.querySelector('input[value="__new__"]')
      );
      if (newRadio) {
        newRadio.checked = true;
      }
    });

  uploadBtn?.addEventListener("click", uploadBookmarks);
  downloadBtn?.addEventListener("click", downloadBookmarks);
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
      scrollbarThumb.contains(/** @type {Node} */ (event.target))
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
    createContainerDragHandlers(bookmarkListEl).attach();
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

  // Overlay dismissal (outside click, Escape, scroll, resize) is owned by the
  // overlay module, which installed its listeners when the first overlay was
  // registered. Only the layout recompute remains here.
  window.addEventListener("resize", () => {
    updateMainLayoutMetrics();
  });

  tooltipModule.bindEvents();

  topToast?.addEventListener("click", hideTopToast);

  bookmarkListEl?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const target = /** @type {Element|null} */ (event.target);
    const hasNodeMenu = Boolean(
      target &&
        typeof target.closest === "function" &&
        (target.closest(".folder-header") || target.closest(".bookmark-row")),
    );
    if (!hasNodeMenu) {
      closeTreeContextMenu();
    }
  });

  document.addEventListener("contextmenu", editMenuModule.handleContextMenu);

  appearanceMenuModule.refreshTriggerTooltips();
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
