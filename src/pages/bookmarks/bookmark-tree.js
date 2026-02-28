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

    const observersModule =
      window.YABMBookmarkTreeObserversModule.createBookmarkTreeObserversModule({
        t,
        setStatus,
        getOpenFolderIds,
        renderBookmarks: (...args) => renderBookmarks(...args),
        refreshWebdavStatusBar,
      });
    const { bindBookmarkTreeObservers, rerenderAfterTreeChange } = observersModule;

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

    const mutationsModule =
      window.YABMBookmarkTreeMutationsModule.createBookmarkTreeMutationsModule({
        t,
        setStatus,
        getNameForNode,
        getFolderStats,
        getOpenFolderIds,
        getBookmarkNodesInFolder,
        removeFaviconsByBookmarkIds,
        ensureValidUrl,
        refreshBookmarkFavicon,
        openPromptModal,
        openEditorModal,
        rerenderAfterTreeChange,
        renderBookmarks: (...args) => renderBookmarks(...args),
      });
    const {
      addBookmarkNode,
      addFolderNode,
      deleteBookmarkNode,
      deleteFolderNode,
      editBookmarkNode,
      editFolderNode,
      refreshBookmarkFaviconWithStatus,
      runBookmarkMutation,
    } = mutationsModule;

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
