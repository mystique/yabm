/**
 * @file bookmark-webdav-status.js
 * WebDAV connection status and sync actions for the bookmarks page.
 *
 * The status bar, the connection chip, and the upload/download actions are one
 * concern: each sync action disables the sync buttons, drives the chip through
 * its states, and refreshes the bar afterwards, and each configuration change
 * repaints the same bar. Splitting them would leave the caller holding the
 * ordering rules, so this module owns all of them together.
 *
 * The composition root injects the collaborators; this module reads no
 * `window.YABM*` global. Exposed as `window.YABMWebdavStatusModule`.
 */

/**
 * @typedef {import("./modals.js").WebdavConfig} WebdavConfig
 */

/**
 * Visual states the WebDAV connection chip can be in.
 * @typedef {'notConfigured'|'checking'|'ready'|'error'} WebdavIndicatorState
 */

/**
 * Subset of the `window.YABMSync` service used by this module.
 * @typedef {Object} WebdavStatusSyncService
 * @property {() => Promise<WebdavConfig | null>} getConfig
 * @property {(directoryUrl: string) => string} normalizeDirectoryUrl
 * @property {(directoryUrl: string, fileName: string) => string} joinDirectoryAndFile
 * @property {(input: WebdavConfig, options?: { interactive?: boolean }) => Promise<number>} getWebDavBookmarkEntryCount
 * @property {(config: WebdavConfig) => Promise<void>} uploadBookmarksToWebDav
 * @property {(config: WebdavConfig) => Promise<void>} downloadBookmarksFromWebDav
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} WebdavStatusModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(message: string, type?: 'success'|'error'|'') => void} setStatus
 * @property {WebdavStatusSyncService} sync
 * @property {() => void} showTopProgress
 * @property {() => void} hideTopProgress
 * @property {(options: { title?: string, message?: string, confirmLabel?: string, cancelLabel?: string }) => Promise<boolean>} openPromptModal
 * @property {() => Promise<void>} renderBookmarks
 * @property {() => void} updateMainLayoutMetrics
 */

/**
 * Public API returned by `createWebdavStatusModule`.
 * @typedef {Object} WebdavStatusModule
 * @property {(stateKey: WebdavIndicatorState, tooltipText: string) => void} setStatusIndicator
 * @property {(options?: { interactive?: boolean }) => Promise<void>} refreshStatusBar
 * @property {() => Promise<void>} uploadBookmarks
 * @property {() => Promise<void>} downloadBookmarks
 */

/**
 * Maps logical WebDAV status keys to their CSS class, Twemoji codepoint, and text fallback.
 * The fallback text is shown when the icon image fails to load.
 * @type {Record<WebdavIndicatorState, { cssClass: string, codepoint: string, fallback: string }>}
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

/** IDs of the three sync action buttons, disabled together while one is running. */
const SYNC_BUTTON_IDS = ["upload-bookmarks", "download-bookmarks", "webdav-refresh"];

(function () {
  /**
   * Factory that creates the WebDAV status and sync action module.
   * `sync` is the page's `window.YABMSync` service, injected by bookmarks.js so this
   * module does not read the shared-library global directly.
   * @param {WebdavStatusModuleDeps} deps
   * @returns {WebdavStatusModule}
   */
  function createWebdavStatusModule(deps) {
    const {
      t,
      setStatus,
      sync,
      showTopProgress,
      hideTopProgress,
      openPromptModal,
      renderBookmarks,
      updateMainLayoutMetrics,
    } = deps;

    // The chip's icon falls back to a text glyph when the Twemoji asset cannot
    // be fetched; `setStatusIndicator` records that glyph in `dataset.fallback`.
    const statusIconEl = /** @type {HTMLImageElement|null} */ (
      document.getElementById("webdav-status-icon")
    );
    statusIconEl?.addEventListener("error", () => {
      const indicator = document.getElementById("webdav-status-indicator");
      if (!indicator) {
        return;
      }
      indicator.textContent = statusIconEl.dataset.fallback || "?";
    });

    /**
     * Returns the CDN URL for a Twemoji SVG identified by its
     * raw Unicode codepoint string (e.g. `"1f7e2"` for 🟢).
     * @param {string} codepoint
     * @returns {string}
     */
    function getTwemojiIconSrcByCodepoint(codepoint) {
      return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoint}.svg`;
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
     * @param {WebdavIndicatorState} stateKey
     * @param {string} tooltipText - Detail text appended to the label.
     * @returns {void}
     */
    function setStatusIndicator(stateKey, tooltipText) {
      const indicator = document.getElementById("webdav-status-indicator");
      const icon = /** @type {HTMLImageElement|null} */ (
        document.getElementById("webdav-status-icon")
      );
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

    /**
     * Enables or disables the three WebDAV sync action buttons simultaneously.
     * Used to prevent repeated invocations while an upload/download is in progress.
     * @param {boolean} disabled
     * @returns {void}
     */
    function setSyncButtonsDisabled(disabled) {
      for (const id of SYNC_BUTTON_IDS) {
        const el = /** @type {HTMLButtonElement|null} */ (
          document.getElementById(id)
        );
        if (el) {
          el.disabled = disabled;
        }
      }
    }

    /**
     * Updates the WebDAV status bar's URL label, entry counts, and refresh-button state.
     * Passing `undefined` for any string field leaves that element unchanged.
     * @param {{ urlText?: string, countText?: string, browserCountText?: string, refreshDisabled?: boolean }} options
     * @returns {void}
     */
    function setStatusBarState({
      urlText,
      countText,
      browserCountText,
      refreshDisabled = false,
    }) {
      const urlEl = document.getElementById("webdav-url");
      const countEl = document.getElementById("webdav-count");
      const browserCountEl = document.getElementById("browser-count");
      const refreshBtn = /** @type {HTMLButtonElement|null} */ (
        document.getElementById("webdav-refresh")
      );

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

    /**
     * Repaints the whole WebDAV status bar and connection chip: reads the saved
     * config, counts local and remote bookmark entries, and reports the outcome
     * through the chip's state and tooltip.
     * @param {{ interactive?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async function refreshStatusBar({ interactive = false } = {}) {
      const refreshBtn = /** @type {HTMLButtonElement|null} */ (
        document.getElementById("webdav-refresh")
      );
      if (refreshBtn) {
        refreshBtn.disabled = true;
      }
      setStatusIndicator("checking", t("webdavEntriesRefreshing"));

      try {
        const config = await sync.getConfig();
        if (!config?.directoryUrl || !config?.fileName) {
          const browserCount = await getBrowserBookmarkEntryCount();
          setStatusBarState({
            urlText: t("notConfigured"),
            countText: t("webdavEntriesDash"),
            browserCountText: t("browserEntries", [String(browserCount)]),
          });
          setStatusIndicator("notConfigured", t("notConfigured"));
          return;
        }

        let webdavDisplayUrl = config.directoryUrl;
        try {
          const normalizedDirectoryUrl = sync.normalizeDirectoryUrl(
            config.directoryUrl,
          );
          webdavDisplayUrl = config.fileName
            ? sync.joinDirectoryAndFile(normalizedDirectoryUrl, config.fileName)
            : normalizedDirectoryUrl;
        } catch {
          webdavDisplayUrl = config.directoryUrl;
        }

        setStatusBarState({
          urlText: webdavDisplayUrl,
          countText: t("webdavEntriesRefreshing"),
          browserCountText: t("browserEntriesRefreshing"),
          refreshDisabled: true,
        });

        const [browserCount, webdavEntries] = await Promise.all([
          getBrowserBookmarkEntryCount(),
          sync.getWebDavBookmarkEntryCount(
            {
              directoryUrl: config.directoryUrl,
              fileName: config.fileName,
              username: config.username || "",
              password: config.password || "",
            },
            { interactive },
          ),
        ]);

        setStatusBarState({
          urlText: webdavDisplayUrl,
          countText: t("webdavEntries", [String(webdavEntries)]),
          browserCountText: t("browserEntries", [String(browserCount)]),
        });
        setStatusIndicator("ready", t("webdavEntries", [String(webdavEntries)]));
      } catch {
        const browserCount = await getBrowserBookmarkEntryCount().catch(() => null);
        setStatusBarState({
          countText: t("webdavEntriesError"),
          browserCountText:
            browserCount === null
              ? t("browserEntriesError")
              : t("browserEntries", [String(browserCount)]),
        });
        setStatusIndicator("error", t("webdavEntriesError"));
      } finally {
        if (refreshBtn) {
          refreshBtn.disabled = false;
        }
      }
    }

    /**
     * Uploads the current Chrome bookmark tree to the configured WebDAV location
     * after prompting the user for confirmation.
     * @returns {Promise<void>}
     */
    async function uploadBookmarks() {
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
      setStatusIndicator("checking", t("uploadingBookmarks"));
      showTopProgress();

      try {
        const config = await sync.getConfig();
        if (!config?.directoryUrl || !config?.fileName) {
          setStatus(t("configureWebdavFirst"), "error");
          return;
        }

        await sync.uploadBookmarksToWebDav(config);
        setStatus(t("uploadSuccessful", [config.fileName]), "success");
      } catch (error) {
        setStatus(t("uploadFailed", [error.message]), "error");
      } finally {
        setSyncButtonsDisabled(false);
        await refreshStatusBar();
        hideTopProgress();
      }
    }

    /**
     * Downloads the bookmark file from WebDAV and imports it into Chrome after
     * prompting the user for confirmation.
     * @returns {Promise<void>}
     */
    async function downloadBookmarks() {
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
      setStatusIndicator("checking", t("downloadingBookmarks"));
      showTopProgress();

      try {
        const config = await sync.getConfig();
        if (!config?.directoryUrl || !config?.fileName) {
          setStatus(t("configureWebdavFirst"), "error");
          return;
        }

        await sync.downloadBookmarksFromWebDav(config);
        setStatus(t("downloadSuccessful", [config.fileName]), "success");
        await renderBookmarks();
      } catch (error) {
        setStatus(t("downloadFailed", [error.message]), "error");
      } finally {
        setSyncButtonsDisabled(false);
        await refreshStatusBar();
        hideTopProgress();
      }
    }

    return {
      setStatusIndicator,
      refreshStatusBar,
      uploadBookmarks,
      downloadBookmarks,
    };
  }

  window.YABMWebdavStatusModule = {
    createWebdavStatusModule,
  };
})();