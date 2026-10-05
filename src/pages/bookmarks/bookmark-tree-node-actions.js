/**
 * @file bookmark-tree-node-actions.js
 * Per-node action catalogue for the bookmark tree: builds the inline action bar
 * and the right-click context menu for a bookmark row or a folder row, and wires
 * every entry to the mutation or menu behaviour it triggers.
 * Rows are built elsewhere; this module owns only the actions a row offers.
 * Exposed as `window.YABMBookmarkTreeNodeActionsModule`.
 */

/** @typedef {import("./bookmark-tree-menu.js").TreeContextMenuItem} TreeContextMenuItem */

/**
 * Node mutations invoked by the action bar and context menu entries.
 * @typedef {Object} NodeActionMutations
 * @property {(parentNode: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} addBookmarkNode
 * @property {(parentNode: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} addFolderNode
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} copyBookmarkUrl
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} deleteBookmarkNode
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} deleteFolderNode
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} editBookmarkNode
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} editFolderNode
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} refreshBookmarkFaviconWithStatus
 * @property {(folderNode: chrome.bookmarks.BookmarkTreeNode) => Promise<void>} refreshFolderFavicons
 */

/**
 * Tree menu services invoked by the action bar and context menu entries.
 * @typedef {Object} NodeActionMenus
 * @property {(folderNode: chrome.bookmarks.BookmarkTreeNode, anchorEl: HTMLElement) => void} openSortMenu
 * @property {(options: { x: number, y: number, items: TreeContextMenuItem[] }) => void} openTreeContextMenu
 * @property {(folderId: string, descending: boolean) => Promise<void>} sortFolderAndRerender
 */

/**
 * @typedef {Object} NodeActionsModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(options: { ariaLabel: string, icon: string, onClick: (event: MouseEvent) => Promise<void> | void, danger?: boolean }) => HTMLButtonElement} createActionButton
 * @property {(details: HTMLDetailsElement, open: boolean, animate?: boolean) => void} setFolderOpen
 * @property {NodeActionMutations} mutations
 * @property {NodeActionMenus} menus
 */

/**
 * Where the caller wants a node's context menu to appear.
 * @typedef {Object} NodeContextMenuRequest
 * @property {chrome.bookmarks.BookmarkTreeNode} node
 * @property {number} x
 * @property {number} y
 * @property {HTMLDetailsElement} [details] - Required for folder rows: the `<details>` whose open state the expand/collapse entry reflects.
 */

/**
 * Public API returned by `createBookmarkTreeNodeActionsModule`.
 * @typedef {Object} NodeActionsModule
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => HTMLDivElement} createActionBar
 * @property {(request: NodeContextMenuRequest) => void} openNodeContextMenu
 */

(function () {
  /**
   * Factory that creates the per-node action catalogue.
   * @param {NodeActionsModuleDeps} deps
   * @returns {NodeActionsModule}
   */
  function createBookmarkTreeNodeActionsModule(deps) {
    const { t, createActionButton, setFolderOpen, mutations, menus } = deps;
    const {
      addBookmarkNode,
      addFolderNode,
      copyBookmarkUrl,
      deleteBookmarkNode,
      deleteFolderNode,
      editBookmarkNode,
      editFolderNode,
      refreshBookmarkFaviconWithStatus,
      refreshFolderFavicons,
    } = mutations;
    const { openSortMenu, openTreeContextMenu, sortFolderAndRerender } = menus;

    /**
     * Builds the inline action bar for a bookmark row.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {HTMLDivElement}
     */
    function createBookmarkActionBar(node) {
      const actions = document.createElement("div");
      actions.className = "bookmark-actions";
      actions.append(
        createActionButton({
          ariaLabel: t("actionCopyBookmarkUrl"),
          icon: "copy",
          onClick: () => copyBookmarkUrl(node),
        }),
        createActionButton({
          ariaLabel: t("actionEditBookmark"),
          icon: "edit",
          onClick: () => editBookmarkNode(node),
        }),
        createActionButton({
          ariaLabel: t("actionRefreshFavicon"),
          icon: "favicon",
          onClick: () => refreshBookmarkFaviconWithStatus(node),
        }),
        createActionButton({
          ariaLabel: t("actionDeleteBookmark"),
          icon: "trash",
          danger: true,
          onClick: () => deleteBookmarkNode(node),
        }),
      );
      return actions;
    }

    /**
     * Builds the inline action bar for a folder row. The sort entry anchors the
     * sort menu to the button that opened it.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {HTMLDivElement}
     */
    function createFolderActionBar(node) {
      const actions = document.createElement("div");
      actions.className = "folder-actions";
      actions.append(
        createActionButton({
          ariaLabel: t("sortFolder"),
          icon: "sort",
          onClick: (event) => {
            const anchorEl = /** @type {HTMLElement} */ (event.currentTarget);
            openSortMenu(node, anchorEl);
          },
        }),
        createActionButton({
          ariaLabel: t("addFolder"),
          icon: "folder-plus",
          onClick: () => addFolderNode(node),
        }),
        createActionButton({
          ariaLabel: t("editFolder"),
          icon: "edit",
          onClick: () => editFolderNode(node),
        }),
        createActionButton({
          ariaLabel: t("addBookmark"),
          icon: "bookmark-plus",
          onClick: () => addBookmarkNode(node),
        }),
        createActionButton({
          ariaLabel: t("refreshFolderFavicons"),
          icon: "folder-favicon",
          onClick: () => refreshFolderFavicons(node),
        }),
        createActionButton({
          ariaLabel: t("deleteFolder"),
          icon: "trash",
          danger: true,
          onClick: () => deleteFolderNode(node),
        }),
      );
      return actions;
    }

    /**
     * Builds the action bar a node's row offers: bookmark entries for a bookmark,
     * folder entries for a folder.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {HTMLDivElement}
     */
    function createActionBar(node) {
      return node.url ? createBookmarkActionBar(node) : createFolderActionBar(node);
    }

    /**
     * Builds the context menu catalogue for a bookmark.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {TreeContextMenuItem[]}
     */
    function buildBookmarkMenuItems(node) {
      return [
        {
          label: t("menuOpenBookmark"),
          icon: "open_in_new",
          onClick: () => {
            window.open(node.url, "_blank", "noopener");
          },
        },
        {
          label: t("menuCopyBookmarkUrl"),
          icon: "content_copy",
          onClick: () => copyBookmarkUrl(node),
        },
        {
          label: t("menuEditBookmark"),
          icon: "edit",
          onClick: () => editBookmarkNode(node),
        },
        {
          label: t("menuRefreshFavicon"),
          icon: "image",
          onClick: () => refreshBookmarkFaviconWithStatus(node),
        },
        { type: "divider" },
        {
          label: t("menuDeleteBookmark"),
          icon: "delete",
          danger: true,
          onClick: () => deleteBookmarkNode(node),
        },
      ];
    }

    /**
     * Builds the context menu catalogue for a folder. The first entry collapses an
     * open folder and expands a closed one, reflecting the row's current state.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @param {HTMLDetailsElement} details - The folder's `<details>` element.
     * @returns {TreeContextMenuItem[]}
     */
    function buildFolderMenuItems(node, details) {
      return [
        details.open
          ? {
              label: t("menuCollapseFolder"),
              icon: "unfold_less",
              onClick: () => setFolderOpen(details, false, true),
            }
          : {
              label: t("menuExpandFolder"),
              icon: "unfold_more",
              onClick: () => setFolderOpen(details, true, true),
            },
        { type: "divider" },
        {
          label: t("sortAscending"),
          icon: "arrow_upward",
          onClick: () => sortFolderAndRerender(node.id, false),
        },
        {
          label: t("sortDescending"),
          icon: "arrow_downward",
          onClick: () => sortFolderAndRerender(node.id, true),
        },
        {
          label: t("menuRefreshFolderFavicons"),
          icon: "imagesmode",
          onClick: async () => {
            await refreshFolderFavicons(node);
          },
        },
        { type: "divider" },
        {
          label: t("menuAddFolder"),
          icon: "create_new_folder",
          onClick: () => addFolderNode(node),
        },
        {
          label: t("menuEditFolder"),
          icon: "edit",
          onClick: () => editFolderNode(node),
        },
        {
          label: t("menuAddBookmark"),
          icon: "bookmark_add",
          onClick: () => addBookmarkNode(node),
        },
        { type: "divider" },
        {
          label: t("menuDeleteFolder"),
          icon: "delete",
          danger: true,
          onClick: () => deleteFolderNode(node),
        },
      ];
    }

    /**
     * Opens the context menu for a node at the requested screen coordinates.
     * @param {NodeContextMenuRequest} request
     */
    function openNodeContextMenu({ node, x, y, details }) {
      openTreeContextMenu({
        x,
        y,
        items: node.url
          ? buildBookmarkMenuItems(node)
          : buildFolderMenuItems(node, /** @type {HTMLDetailsElement} */ (details)),
      });
    }

    return {
      createActionBar,
      openNodeContextMenu,
    };
  }

  window.YABMBookmarkTreeNodeActionsModule = {
    createBookmarkTreeNodeActionsModule,
  };
})();