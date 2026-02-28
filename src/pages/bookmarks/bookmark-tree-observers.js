(function () {
  function createBookmarkTreeObserversModule(deps) {
    const {
      t,
      setStatus,
      getOpenFolderIds,
      renderBookmarks,
      refreshWebdavStatusBar,
    } = deps;

    async function rerenderAfterTreeChange(extraOpenFolderIds = []) {
      const openFolderIds = getOpenFolderIds();
      for (const folderId of extraOpenFolderIds) {
        openFolderIds.add(folderId);
      }
      await renderBookmarks(openFolderIds);
      await refreshWebdavStatusBar();
    }

    let treeChangeDebounceTimer = null;
    let treeChangeRefreshInFlight = false;
    let treeChangeRefreshPending = false;

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

    function queueExternalTreeRefresh() {
      if (treeChangeDebounceTimer) {
        clearTimeout(treeChangeDebounceTimer);
      }
      treeChangeDebounceTimer = setTimeout(() => {
        treeChangeDebounceTimer = null;
        refreshAfterExternalTreeChange();
      }, 120);
    }

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
