/**
 * @file bookmark-tree.js
 * Orchestrator module that wires together all bookmark tree sub-modules:
 * state, observers, drag-and-drop, mutations, menu, and rendering.
 * Provides a single entry point (`createBookmarkTreeModule`) consumed by bookmarks.js.
 * Exposed as `window.YABMBookmarkTreeModule`.
 */

/**
 * @typedef {import("./bookmark-tree-render.js").RenderModuleDeps} RenderModuleDeps
 * @typedef {import("./bookmark-tree-menu.js").MenuModuleDeps} MenuModuleDeps
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} BookmarkTreeModuleDeps
 * @property {RenderModuleDeps["t"]} t
 * @property {RenderModuleDeps["getCachedFaviconForBookmark"]} getCachedFaviconForBookmark
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => chrome.bookmarks.BookmarkTreeNode[]} getBookmarkNodesInFolder
 * @property {RenderModuleDeps["copyBookmarkUrl"]} copyBookmarkUrl
 * @property {(node: chrome.bookmarks.BookmarkTreeNode, options?: { silent?: boolean }) => Promise<void>} refreshBookmarkFavicon
 * @property {RenderModuleDeps["refreshFolderFavicons"]} refreshFolderFavicons
 * @property {(ids: string[]) => Promise<void>} removeFaviconsByBookmarkIds
 * @property {(rawUrl: string) => string} ensureValidUrl
 * @property {RenderModuleDeps["ensureFaviconCacheLoaded"]} ensureFaviconCacheLoaded
 * @property {RenderModuleDeps["pruneFaviconCacheForTree"]} pruneFaviconCacheForTree
 * @property {(message: string, type: 'success'|'error'|'') => void} setStatus
 * @property {(options: { title?: string, message?: string, confirmLabel?: string, cancelLabel?: string }) => Promise<boolean>} openPromptModal
 * @property {(options: { title?: string, nameLabel?: string, nameValue?: string, urlValue?: string, urlVisible?: boolean, saveLabel?: string }) => Promise<{ name: string, url: string } | null>} openEditorModal
 * @property {RenderModuleDeps["closeEditContextMenu"]} closeEditContextMenu
 * @property {RenderModuleDeps["updateMainLayoutMetrics"]} updateMainLayoutMetrics
 * @property {() => void} updateBookmarkListScrollbar
 * @property {(options?: { interactive?: boolean }) => Promise<void>} refreshWebdavStatusBar
 */

/**
 * Public API returned by `createBookmarkTreeModule`.
 * @typedef {Object} BookmarkTreeModule
 * @property {() => void} bindBookmarkTreeObservers
 * @property {RenderModuleDeps["closeTreeContextMenu"]} closeTreeContextMenu
 * @property {RenderModuleDeps["closeSortMenu"]} closeSortMenu
 * @property {(container: HTMLElement) => { attach: Function, detach: Function }} createContainerDragHandlers
 * @property {(descending: boolean) => Promise<void>} handleSortMenuApply
 * @property {() => boolean} isTreeContextMenuOpen
 * @property {(openFolderIds?: Set<string> | null) => Promise<void>} renderBookmarks
 * @property {MenuModuleDeps["rerenderAfterTreeChange"]} rerenderAfterTreeChange
 * @property {(open: boolean) => void} setAllFoldersOpen
 */

(function () {
  /**
   * Factory that instantiates and composes all bookmark tree sub-modules.
   * The `renderBookmarks` function is late-bound via a proxy so that sub-modules
   * (observers, mutations) can reference it before the render module is created.
   *
   * @param {BookmarkTreeModuleDeps} deps
   * @returns {BookmarkTreeModule}
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
    /** @type {BookmarkTreeModule["renderBookmarks"]} */
    let renderBookmarks = async () => {};

    const observersModule =
      window.YABMBookmarkTreeObserversModule.createBookmarkTreeObserversModule({
        t,
        setStatus,
        getOpenFolderIds,
        renderBookmarks: (
          /** @type {Parameters<BookmarkTreeModule["renderBookmarks"]>} */ ...args
        ) => renderBookmarks(...args),
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
        getBookmarkNodesInFolder,
        removeFaviconsByBookmarkIds,
        ensureValidUrl,
        refreshBookmarkFavicon,
        openPromptModal,
        openEditorModal,
        rerenderAfterTreeChange,
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