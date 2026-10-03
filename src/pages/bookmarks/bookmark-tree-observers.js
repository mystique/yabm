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
    let treeChangeRefreshPromise = null;
    let pendingOpenFolderIds = new Set();

    /**
     * Coordinates every tree refresh, keeping requests received during an
     * in-flight render for a follow-up pass.
     * @param {string[]} [extraOpenFolderIds=[]]
     * @returns {Promise<void>}
     */
    function rerenderAfterTreeChange(extraOpenFolderIds = []) {
      const openFolderIds = getOpenFolderIds();
      for (const folderId of extraOpenFolderIds) {
        openFolderIds.add(folderId);
      }
      for (const folderId of openFolderIds) {
        pendingOpenFolderIds.add(folderId);
      }
      if (!treeChangeRefreshPromise) {
        treeChangeRefreshPromise = (async () => {
          try {
            do {
              const foldersToOpen = pendingOpenFolderIds;
              pendingOpenFolderIds = new Set();
              await renderBookmarks(foldersToOpen);
              await refreshWebdavStatusBar();
            } while (pendingOpenFolderIds.size > 0);
          } finally {
            treeChangeRefreshPromise = null;
          }
        })();
      }
      return treeChangeRefreshPromise;
    }

    // Debounce external events while routing the actual refresh through the
    // same coordinator used by page actions.
    let treeChangeDebounceTimer = null;


    /**
     * Refreshes for an external event and keeps failures visible to the user.
     * @returns {Promise<void>}
     */
    async function refreshAfterExternalTreeChange() {
      try {
        await rerenderAfterTreeChange();
      } catch (error) {
        setStatus(t("loadBookmarksFailed", [error.message]), "error");
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
     * Event payloads are ignored; every event only schedules a refresh.
     *
     * @returns {void}
     */
    function bindBookmarkTreeObservers() {
      const onCreated = chrome?.bookmarks?.onCreated;
      if (!onCreated?.addListener) {
        return;
      }

      /**
       * Shared listener that ignores event parameters and triggers a debounced refresh.
       * All bookmark events use the same refresh logic regardless of event-specific data.
       * @type {(...args: any[]) => void}
       */
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
