/**
 * @file bookmark-tree.js
 * Orchestrator module that wires together all bookmark tree sub-modules:
 * state, observers, drag-and-drop, mutations, menu, and rendering.
 * Provides a single entry point (`createBookmarkTreeModule`) consumed by bookmarks.js.
 * Exposed as `window.YABMBookmarkTreeModule`.
 */
(function () {
  /**
   * Factory that instantiates and composes all bookmark tree sub-modules.
   * The `renderBookmarks` function is late-bound via a proxy so that sub-modules
   * (observers, mutations) can reference it before the render module is created.
   *
   * @param {{ t: Function, getCachedFaviconForBookmark: Function, getBookmarkNodesInFolder: Function, copyBookmarkUrl: Function, refreshBookmarkFavicon: Function, refreshFolderFavicons: Function, removeFaviconsByBookmarkIds: Function, ensureValidUrl: Function, ensureFaviconCacheLoaded: Function, pruneFaviconCacheForTree: Function, setStatus: Function, openPromptModal: Function, openEditorModal: Function, closeEditContextMenu: Function, updateMainLayoutMetrics: Function, updateBookmarkListScrollbar: Function, refreshWebdavStatusBar: Function }} deps
   * @returns {{ bindBookmarkTreeObservers: Function, closeTreeContextMenu: Function, closeSortMenu: Function, createContainerDragHandlers: Function, handleSortMenuApply: Function, isTreeContextMenuOpen: Function, renderBookmarks: Function, rerenderAfterTreeChange: Function, setAllFoldersOpen: Function }}
   */
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

    // Placeholder replaced after the render module is created.
    // Using an indirect reference like this avoids circular initialisation
    // when observers and mutations need to trigger re-renders.
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
      createContainerDragHandlers,
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
      createContainerDragHandlers,
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