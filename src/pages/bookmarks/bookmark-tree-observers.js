/**
 * @file bookmark-tree-observers.js
 * Listens to Chrome bookmark API events and triggers debounced re-renders
 * so the UI stays in sync with external bookmark changes.
 * Exposed as `window.YABMBookmarkTreeObserversModule`.
 */
(function () {
  /**
   * Factory that creates the bookmark tree observers module.
   * @param {{ t: Function, setStatus: Function, getOpenFolderIds: Function, renderBookmarks: Function, refreshWebdavStatusBar: Function }} deps
   * @returns {{ bindBookmarkTreeObservers: Function, rerenderAfterTreeChange: Function }}
   */
  function createBookmarkTreeObserversModule(deps) {
    const {
      t,
      setStatus,
      getOpenFolderIds,
      renderBookmarks,
      refreshWebdavStatusBar,
    } = deps;

    /**
     * Re-renders the bookmark tree, preserving the currently open folders plus
     * any additional folder IDs that should be forced open (e.g. a newly created parent).
     * Also refreshes the WebDAV status bar after the tree updates.
     * @param {string[]} [extraOpenFolderIds=[]] - Additional folder IDs to keep open.
     * @returns {Promise<void>}
     */
    async function rerenderAfterTreeChange(extraOpenFolderIds = []) {
      const openFolderIds = getOpenFolderIds();
      for (const folderId of extraOpenFolderIds) {
        openFolderIds.add(folderId);
      }
      await renderBookmarks(openFolderIds);
      await refreshWebdavStatusBar();
    }

    // Debounce timer handle; reset on each incoming bookmark event.
    let treeChangeDebounceTimer = null;
    // True while an async refresh is in progress, preventing overlapping fetches.
    let treeChangeRefreshInFlight = false;
    // Set to true when a new event arrives while a refresh is already in flight,
    // so that a follow-up refresh is scheduled once the current one finishes.
    let treeChangeRefreshPending = false;

    /**
     * Performs a full tree refresh in response to an external bookmark change.
     * If another refresh is already running, sets a pending flag so a follow-up
     * refresh is automatically queued when the current one completes.
     * @returns {Promise<void>}
     */
    async function refreshAfterExternalTreeChange() {
      if (treeChangeRefreshInFlight) {
        treeChangeRefreshPending = true;
        return;
      }

      treeChangeRefreshInFlight = true;
      try {
        await rerenderAfterTreeChange();
      } catch (error) {
        setStatus(t("loadBookmarksFailed", [error.message]), "error");
      } finally {
        treeChangeRefreshInFlight = false;
        if (treeChangeRefreshPending) {
          treeChangeRefreshPending = false;
          queueExternalTreeRefresh();
        }
      }
    }

    /**
     * Debounces external tree-change events by 120 ms to coalesce rapid bulk
     * operations (e.g. imports) into a single re-render.
     */
    function queueExternalTreeRefresh() {
      if (treeChangeDebounceTimer) {
        clearTimeout(treeChangeDebounceTimer);
      }
      treeChangeDebounceTimer = setTimeout(() => {
        treeChangeDebounceTimer = null;
        refreshAfterExternalTreeChange();
      }, 120);
    }

    /**
     * Attaches listeners to all relevant Chrome bookmark API events.
     * Each event triggers a debounced refresh so the UI reflects external changes
     * (e.g. changes made in the Chrome bookmark manager or another extension).
     * No-ops if the bookmarks API is unavailable (e.g. in non-extension contexts).
     */
    function bindBookmarkTreeObservers() {
      const onCreated = chrome?.bookmarks?.onCreated;
      if (!onCreated?.addListener) {
        return;
      }

      const listener = () => queueExternalTreeRefresh();
      chrome.bookmarks.onCreated.addListener(listener);
      chrome.bookmarks.onRemoved.addListener(listener);
      chrome.bookmarks.onChanged.addListener(listener);
      chrome.bookmarks.onMoved.addListener(listener);
      chrome.bookmarks.onChildrenReordered.addListener(listener);
      chrome.bookmarks.onImportEnded.addListener(listener);
    }

    return {
      bindBookmarkTreeObservers,
      rerenderAfterTreeChange,
    };
  }

  window.YABMBookmarkTreeObserversModule = {
    createBookmarkTreeObserversModule,
  };
})();
