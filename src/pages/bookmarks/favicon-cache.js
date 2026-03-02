/**
 * @file favicon-cache.js
 * Manages a persistent favicon cache stored in `chrome.storage.local`.
 * Handles loading, saving, pruning stale entries, and fetching fresh favicons
 * from multiple fallback sources (chrome://favicon2, Google S2, etc.).
 * Exposed as `window.YABMFaviconCacheModule`.
 */
(function () {
  /**
   * Factory that creates the favicon cache module.
   * @param {{ t: Function, setStatus: Function, showTopToast: Function, showTopProgress: Function, hideTopProgress: Function, updateTopProgress: Function, rerenderAfterTreeChange: Function }} deps
   * @returns {{ ensureFaviconCacheLoaded: Function, getCachedFaviconForBookmark: Function, getBookmarkNodesInFolder: Function, pruneFaviconCacheForTree: Function, refreshBookmarkFavicon: Function, refreshFolderFavicons: Function, removeFaviconsByBookmarkIds: Function, ensureValidUrl: Function }}
   */
  function createFaviconCacheModule(deps) {
    const {
      t,
      setStatus,
      showTopToast,
      showTopProgress,
      hideTopProgress,
      updateTopProgress,
      rerenderAfterTreeChange,
    } = deps;

    /** `chrome.storage.local` key under which the favicon map is persisted. */
    const FAVICON_CACHE_KEY = "bookmarkFavicons";
    /**
     * In-memory favicon cache.
     * @type {{ loaded: boolean, map: Record<string, { url: string, dataUrl: string, updatedAt: number }> }}
     */
    const faviconCacheState = {
      loaded: false,
      map: {},
    };
    // Prevents concurrent favicon fetch operations from overlapping.
    let faviconUpdateInFlight = false;

    /**
     * Lazily loads the favicon map from `chrome.storage.local` into memory.
     * Subsequent calls are no-ops once the cache has been loaded.
     * @returns {Promise<void>}
     */
    async function ensureFaviconCacheLoaded() {
      if (faviconCacheState.loaded) {
        return;
      }
      try {
        const stored = await chrome.storage.local.get(FAVICON_CACHE_KEY);
        faviconCacheState.map = stored?.[FAVICON_CACHE_KEY] || {};
      } catch {
        faviconCacheState.map = {};
      }
      faviconCacheState.loaded = true;
    }

    /**
     * Persists the current in-memory favicon map back to `chrome.storage.local`.
     * @returns {Promise<void>}
     */
    async function persistFaviconCache() {
      await chrome.storage.local.set({
        [FAVICON_CACHE_KEY]: faviconCacheState.map,
      });
    }

    /**
     * Returns the cached favicon data URL for a bookmark node if it exists and
     * is still valid (i.e. its stored URL matches the node's current URL).
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {string|null} A data URL string, or `null` if no valid entry exists.
     */
    function getCachedFaviconForBookmark(node) {
      const cached = faviconCacheState.map?.[node.id];
      if (!cached || !cached.dataUrl || cached.url !== node.url) {
        return null;
      }
      return cached.dataUrl;
    }

    /**
     * Recursively collects all bookmark (non-folder) nodes within `node`.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - A folder node to walk.
     * @returns {chrome.bookmarks.BookmarkTreeNode[]}
     */
    function getBookmarkNodesInFolder(node) {
      const bookmarks = [];
      const walk = (cur) => {
        for (const child of cur?.children || []) {
          if (child.url) {
            bookmarks.push(child);
          } else if (child.children) {
            walk(child);
          }
        }
      };
      walk(node);
      return bookmarks;
    }

    /**
     * Walks the full bookmark tree and collects every bookmark node's ID.
     * Used to identify which favicon cache entries are still referenced.
     * @param {chrome.bookmarks.BookmarkTreeNode[]} tree - Root array from `chrome.bookmarks.getTree()`.
     * @returns {Set<string>}
     */
    function collectBookmarkIds(tree) {
      const ids = new Set();
      const walk = (nodes) => {
        for (const node of nodes || []) {
          if (node?.url) {
            ids.add(String(node.id));
          } else if (node?.children) {
            walk(node.children);
          }
        }
      };
      walk(tree);
      return ids;
    }

    /**
     * Removes favicon cache entries for bookmarks that no longer exist in the tree.
     * Persists the updated cache only if at least one entry was removed.
     * @param {chrome.bookmarks.BookmarkTreeNode[]} tree - Result of `chrome.bookmarks.getTree()`.
     * @returns {Promise<void>}
     */
    async function pruneFaviconCacheForTree(tree) {
      await ensureFaviconCacheLoaded();
      const cache = faviconCacheState.map || {};
      const cachedIds = Object.keys(cache);
      if (!cachedIds.length) {
        return;
      }

      const validIds = collectBookmarkIds(tree);
      let changed = false;
      for (const id of cachedIds) {
        if (!validIds.has(id)) {
          delete cache[id];
          changed = true;
        }
      }

      if (changed) {
        await persistFaviconCache();
      }
    }

    async function loadImageAsDataUrl(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        // Keep image loading permissive. Some favicon endpoints do not provide CORS
        // headers, which blocks canvas export but still allows direct image display.
        img.onload = () => {
          try {
            const width = img.naturalWidth || 32;
            const height = img.naturalHeight || 32;
            const size = Math.max(32, Math.min(64, Math.max(width, height)));
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error(t("noCanvasContext"));
            }
            ctx.clearRect(0, 0, size, size);
            const scale = Math.min(size / width, size / height);
            const drawW = Math.max(1, Math.round(width * scale));
            const drawH = Math.max(1, Math.round(height * scale));
            const drawX = Math.round((size - drawW) / 2);
            const drawY = Math.round((size - drawH) / 2);
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            const dataUrl = canvas.toDataURL("image/png");
            if (!dataUrl || dataUrl === "data:,") {
              throw new Error(t("emptyFaviconData"));
            }
            resolve(dataUrl);
          } catch {
            // Fallback for cross-origin/tainted canvas: use original source URL.
            // This preserves favicon rendering even when data URL conversion is blocked.
            resolve(src);
          }
        };
        img.onerror = () => reject(new Error("favicon load failed"));
        img.src = src;
      });
    }

    /**
     * Validates and normalises a raw URL string.
     * Throws a translated error if the value is empty, malformed, or non-HTTP(S).
     * @param {string} rawUrl
     * @returns {string} The normalised absolute URL.
     * @throws {Error}
     */
    function ensureValidUrl(rawUrl) {
      const value = (rawUrl || "").trim();
      if (!value) {
        throw new Error(t("urlRequired"));
      }
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(t("urlInvalid"));
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(t("urlOnlyHttpHttps"));
      }
      return parsed.toString();
    }

    /**
     * Attempts to fetch a favicon for `node.url` from a prioritised list of sources:
     *   1. `chrome://favicon2` (highest quality via browser cache)
     *   2. `chrome://favicon` legacy API
     *   3. Google S2 favicon service (public fallback)
     * Returns the first successfully loaded image as a data URL.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {Promise<string>} Resolves with a data URL.
     * @throws {Error} If all sources fail.
     */
    async function fetchFaviconDataUrlForBookmark(node) {
      const url = ensureValidUrl(node.url);
      const sources = [
        `chrome://favicon2/?size=64&pageUrl=${encodeURIComponent(url)}`,
        `chrome://favicon/size/64@1x/${url}`,
        `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`,
      ];

      for (const src of sources) {
        try {
          const dataUrl = await loadImageAsDataUrl(src);
          if (dataUrl) {
            return dataUrl;
          }
        } catch {
          // try next source
        }
      }

      throw new Error(t("faviconFetchFailed"));
    }

    /**
     * Fetches and caches a fresh favicon for a single bookmark.
     * Skips if another favicon update is already in flight.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The bookmark to update.
     * @param {{ silent?: boolean }} [options]
     * @param {boolean} [options.silent=false] - When true, suppresses the status message and re-render.
     * @returns {Promise<void>}
     */
    async function refreshBookmarkFavicon(node, { silent = false } = {}) {
      if (faviconUpdateInFlight) {
        setStatus(t("faviconUpdateInProgress"), "");
        showTopToast(t("faviconUpdateInProgress"), "");
        return;
      }
      faviconUpdateInFlight = true;
      showTopProgress();
      try {
        await ensureFaviconCacheLoaded();
        const dataUrl = await fetchFaviconDataUrlForBookmark(node);
        faviconCacheState.map[node.id] = {
          url: node.url,
          dataUrl,
          updatedAt: Date.now(),
        };
        await persistFaviconCache();
        if (!silent) {
          setStatus(t("faviconUpdated"), "success");
          await rerenderAfterTreeChange([node.parentId].filter(Boolean));
        }
      } finally {
        faviconUpdateInFlight = false;
        hideTopProgress();
      }
    }

    /**
     * Fetches and caches favicons for every bookmark in a folder, showing a
     * determinate progress bar. Reports per-item success/failure counts.
     * @param {chrome.bookmarks.BookmarkTreeNode} folderNode
     * @returns {Promise<void>}
     */
    async function refreshFolderFavicons(folderNode) {
      if (faviconUpdateInFlight) {
        setStatus(t("faviconUpdateInProgress"), "");
        showTopToast(t("faviconUpdateInProgress"), "");
        return;
      }
      faviconUpdateInFlight = true;
      await ensureFaviconCacheLoaded();
      const bookmarks = getBookmarkNodesInFolder(folderNode);
      if (!bookmarks.length) {
        setStatus(t("noBookmarksInFolder"), "error");
        faviconUpdateInFlight = false;
        return;
      }

      showTopProgress({ mode: "determinate", value: 0 });
      try {
        let success = 0;
        let failed = 0;
        let completed = 0;
        const total = bookmarks.length;
        for (const bookmark of bookmarks) {
          try {
            const dataUrl = await fetchFaviconDataUrlForBookmark(bookmark);
            faviconCacheState.map[bookmark.id] = {
              url: bookmark.url,
              dataUrl,
              updatedAt: Date.now(),
            };
            success += 1;
          } catch {
            failed += 1;
          }
          completed += 1;
          updateTopProgress(completed / total);
        }

        if (success > 0) {
          await persistFaviconCache();
        }
        if (failed > 0 && success === 0) {
          setStatus(t("faviconUpdateFailedCount", [String(failed)]), "error");
        } else if (failed > 0) {
          setStatus(
            t("faviconsUpdatedSuccessFail", [String(success), String(failed)]),
            "success",
          );
        } else {
          setStatus(t("faviconsUpdatedSuccess", [String(success)]), "success");
        }
        await rerenderAfterTreeChange([folderNode.id]);
      } finally {
        faviconUpdateInFlight = false;
        hideTopProgress();
      }
    }

    /**
     * Removes favicon cache entries for the given bookmark IDs and persists
     * the cache if any entries were actually deleted.
     * @param {string[]} ids - Chrome bookmark node IDs whose cache entries should be removed.
     * @returns {Promise<void>}
     */
    async function removeFaviconsByBookmarkIds(ids) {
      await ensureFaviconCacheLoaded();
      let changed = false;
      for (const id of ids) {
        if (faviconCacheState.map[id]) {
          delete faviconCacheState.map[id];
          changed = true;
        }
      }
      if (changed) {
        await persistFaviconCache();
      }
    }

    return {
      ensureFaviconCacheLoaded,
      getCachedFaviconForBookmark,
      getBookmarkNodesInFolder,
      pruneFaviconCacheForTree,
      refreshBookmarkFavicon,
      refreshFolderFavicons,
      removeFaviconsByBookmarkIds,
      ensureValidUrl,
    };
  }

  window.YABMFaviconCacheModule = {
    createFaviconCacheModule,
  };
})();