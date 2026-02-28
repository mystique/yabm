(function () {
  function createBookmarkTreeModule(deps) {
    const {
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
      refreshWebdavStatusBar,
    } = deps;

    const stateModule = window.YABMBookmarkTreeStateModule.createBookmarkTreeStateModule(
      {
        t,
        updateBookmarkListScrollbar,
      },
    );
    const {
      applyOpenFolderIds,
      createActionButton,
      getFolderStats,
      getNameForNode,
      getOpenFolderIds,
      getTopLevelFolders,
      setAllFoldersOpen,
      setFolderOpen,
      toggleFolder,
      updateTreeSummaryStats,
    } = stateModule;

    let renderBookmarks = async () => {};

    async function runBookmarkMutation(run, options) {
      const { successKey, errorKey, afterSuccess } = options || {};
      try {
        await run();
        if (successKey) {
          setStatus(t(successKey), "success");
        }
        if (typeof afterSuccess === "function") {
          await afterSuccess();
        }
      } catch (error) {
        setStatus(t(errorKey, [error.message]), "error");
      }
    }

    async function refreshBookmarkFaviconWithStatus(node) {
      await runBookmarkMutation(() => refreshBookmarkFavicon(node), {
        errorKey: "faviconUpdateFailed",
      });
    }

    async function deleteBookmarkNode(node) {
      const title = getNameForNode(node);
      const confirmed = await openPromptModal({
        title: t("deleteBookmarkTitle"),
        message: t("deleteBookmarkMessage", [title]),
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) {
        return;
      }

      const openFolderIds = getOpenFolderIds();
      await runBookmarkMutation(
        async () => {
          await removeFaviconsByBookmarkIds([node.id]);
          await chrome.bookmarks.remove(node.id);
        },
        {
          successKey: "bookmarkDeleted",
          errorKey: "deleteFailed",
          afterSuccess: () => renderBookmarks(openFolderIds),
        },
      );
    }

    async function deleteFolderNode(node) {
      const folderName = getNameForNode(node);
      const firstConfirm = await openPromptModal({
        title: t("deleteFolderTitle"),
        message: t("deleteFolderMessage", [folderName]),
        confirmLabel: t("continue"),
        cancelLabel: t("cancel"),
      });
      if (!firstConfirm) {
        return;
      }

      const stats = getFolderStats(node);
      if (stats.bookmarkCount > 0) {
        const secondConfirm = await openPromptModal({
          title: t("folderContainsBookmarksTitle"),
          message: t("folderContainsBookmarksMessage", [
            String(stats.bookmarkCount),
          ]),
          confirmLabel: t("deleteAll"),
          cancelLabel: t("cancel"),
        });
        if (!secondConfirm) {
          return;
        }
      }

      const openFolderIds = getOpenFolderIds();
      await runBookmarkMutation(
        async () => {
          const bookmarkIds = getBookmarkNodesInFolder(node).map((item) => item.id);
          await removeFaviconsByBookmarkIds(bookmarkIds);
          await chrome.bookmarks.removeTree(node.id);
        },
        {
          successKey: "folderDeleted",
          errorKey: "deleteFailed",
          afterSuccess: () => renderBookmarks(openFolderIds),
        },
      );
    }

    async function rerenderAfterTreeChange(extraOpenFolderIds = []) {
      const openFolderIds = getOpenFolderIds();
      for (const folderId of extraOpenFolderIds) {
        openFolderIds.add(folderId);
      }
      await renderBookmarks(openFolderIds);
      await refreshWebdavStatusBar();
    }

    const dndModule = window.YABMBookmarkTreeDndModule.createBookmarkTreeDndModule({
      t,
      setStatus,
      rerenderAfterTreeChange,
    });
    const {
      handleBookmarkListDragOver,
      handleFolderDragEnter,
      handleFolderDragLeave,
      handleFolderDragOver,
      handleFolderDrop,
      handleNodeDragEnd,
      handleNodeDragStart,
    } = dndModule;

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

    async function addFolderNode(parentNode) {
      const result = await openEditorModal({
        title: t("addFolderTitle"),
        nameLabel: t("folderName"),
        nameValue: "",
        saveLabel: t("create"),
      });
      if (!result) {
        return;
      }

      await runBookmarkMutation(
        () =>
          chrome.bookmarks.create({
            parentId: parentNode.id,
            title: result.name || t("newFolderDefault"),
          }),
        {
          successKey: "folderCreated",
          errorKey: "createFolderFailed",
          afterSuccess: () => rerenderAfterTreeChange([parentNode.id]),
        },
      );
    }

    async function editFolderNode(node) {
      const result = await openEditorModal({
        title: t("editFolderTitle"),
        nameLabel: t("folderName"),
        nameValue: node.title || "",
        saveLabel: t("save"),
      });
      if (!result) {
        return;
      }

      await runBookmarkMutation(
        () =>
          chrome.bookmarks.update(node.id, {
            title: result.name || t("untitled"),
          }),
        {
          successKey: "folderUpdated",
          errorKey: "updateFolderFailed",
          afterSuccess: () => rerenderAfterTreeChange([node.id]),
        },
      );
    }

    async function addBookmarkNode(parentNode) {
      const result = await openEditorModal({
        title: t("addBookmarkTitle"),
        nameLabel: t("bookmarkTitle"),
        nameValue: "",
        urlValue: "",
        urlVisible: true,
        saveLabel: t("create"),
      });
      if (!result) {
        return;
      }

      await runBookmarkMutation(
        async () => {
          const url = ensureValidUrl(result.url);
          await chrome.bookmarks.create({
            parentId: parentNode.id,
            title: result.name || url,
            url,
          });
        },
        {
          successKey: "bookmarkCreated",
          errorKey: "createBookmarkFailed",
          afterSuccess: () => rerenderAfterTreeChange([parentNode.id]),
        },
      );
    }

    async function editBookmarkNode(node) {
      const result = await openEditorModal({
        title: t("editBookmarkTitle"),
        nameLabel: t("bookmarkTitle"),
        nameValue: node.title || "",
        urlValue: node.url || "",
        urlVisible: true,
        saveLabel: t("save"),
      });
      if (!result) {
        return;
      }

      await runBookmarkMutation(
        async () => {
          const url = ensureValidUrl(result.url);
          if (node.url !== url) {
            await removeFaviconsByBookmarkIds([node.id]);
          }
          await chrome.bookmarks.update(node.id, {
            title: result.name || url,
            url,
          });
        },
        {
          successKey: "bookmarkUpdated",
          errorKey: "updateBookmarkFailed",
          afterSuccess: () => rerenderAfterTreeChange(),
        },
      );
    }

    const menuModule = window.YABMBookmarkTreeMenuModule.createBookmarkTreeMenuModule(
      {
        t,
        runBookmarkMutation,
        rerenderAfterTreeChange,
      },
    );
    const {
      closeSortMenu,
      closeTreeContextMenu,
      handleSortMenuApply,
      isTreeContextMenuOpen,
      openSortMenu,
      openTreeContextMenu,
      sortFolderAndRerender,
    } = menuModule;

    const renderModule = window.YABMBookmarkTreeRenderModule.createBookmarkTreeRenderModule(
      {
        t,
        applyOpenFolderIds,
        createActionButton,
        getCachedFaviconForBookmark,
        getFolderStats,
        getOpenFolderIds,
        getTopLevelFolders,
        ensureFaviconCacheLoaded,
        pruneFaviconCacheForTree,
        closeEditContextMenu,
        closeTreeContextMenu,
        closeSortMenu,
        openTreeContextMenu,
        openSortMenu,
        handleNodeDragStart,
        handleNodeDragEnd,
        handleFolderDragEnter,
        handleFolderDragOver,
        handleFolderDragLeave,
        handleFolderDrop,
        toggleFolder,
        setFolderOpen,
        updateTreeSummaryStats,
        updateMainLayoutMetrics,
        copyBookmarkUrl,
        refreshBookmarkFaviconWithStatus,
        refreshFolderFavicons,
        deleteBookmarkNode,
        deleteFolderNode,
        addFolderNode,
        editFolderNode,
        addBookmarkNode,
        editBookmarkNode,
        sortFolderAndRerender,
      },
    );
    renderBookmarks = renderModule.renderBookmarks;

    return {
      bindBookmarkTreeObservers,
      closeTreeContextMenu,
      closeSortMenu,
      handleBookmarkListDragOver,
      handleSortMenuApply,
      isTreeContextMenuOpen,
      renderBookmarks,
      rerenderAfterTreeChange,
      setAllFoldersOpen,
    };
  }

  window.YABMBookmarkTreeModule = {
    createBookmarkTreeModule,
  };
})();
