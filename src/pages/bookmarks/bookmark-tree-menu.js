/**
 * @file bookmark-tree-menu.js
 * Context menu and sort-menu management for the bookmark tree.
 * Builds the menu contents and delegates positioning, open state, and
 * dismissal to the overlay module. Exposed as `window.YABMBookmarkTreeMenuModule`.
 */
/**
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlay} BookmarkOverlay
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlayModule} BookmarkOverlayModule
 */
/**
 * @typedef {Object} MenuModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(run: () => Promise<any>, options?: { successKey?: string, errorKey?: string, afterSuccess?: () => Promise<void> | void }) => Promise<void>} runBookmarkMutation
 * @property {(extraOpenFolderIds?: string[]) => Promise<void>} rerenderAfterTreeChange
 * @property {BookmarkOverlayModule["createOverlay"]} createOverlay - Registers this module's menus as viewport-anchored overlays.
 * @property {BookmarkOverlay} editContextMenu - The bookmark edit overlay, owned by the bookmarks page; closed alongside the tree menus.
 */

/**
 * A single entry in the tree context menu; `type: "divider"` renders a separator.
 * @typedef {Object} TreeContextMenuItem
 * @property {string} [label]
 * @property {string} [icon]
 * @property {boolean} [danger]
 * @property {string} [type]
 * @property {() => void | Promise<void>} [onClick]
 */

/**
 * Public API returned by `createBookmarkTreeMenuModule`.
 * @typedef {Object} MenuModule
 * @property {() => void} closeAllMenus
 * @property {() => void} closeSortMenu
 * @property {() => void} closeTreeContextMenu
 * @property {(descending: boolean) => Promise<void>} handleSortMenuApply
 * @property {(folderNode: chrome.bookmarks.BookmarkTreeNode, anchorEl: HTMLElement) => void} openSortMenu
 * @property {(options: { x: number, y: number, items: TreeContextMenuItem[] }) => void} openTreeContextMenu
 * @property {(folderId: string, descending: boolean) => Promise<void>} sortFolderAndRerender
 */

(function () {
  /**
   * Factory that creates the bookmark tree menu module.
   * @param {MenuModuleDeps} deps
   * @returns {MenuModule}
   */
  function createBookmarkTreeMenuModule(deps) {
    const { t, runBookmarkMutation, rerenderAfterTreeChange, createOverlay, editContextMenu } = deps;

    // Stores the folder ID of the currently open sort menu, or null when closed.
    /** @type {{ folderId: string } | null} */
    let sortMenuContext = null;

    const treeContextMenu = createOverlay({
      id: "treeContextMenu",
      getElement: () => document.getElementById("tree-context-menu"),
      fallbackSize: { width: 220, height: 180 },
      clearContent: true,
    });

    const sortMenu = createOverlay({
      id: "sortMenu",
      getElement: () => document.getElementById("folder-sort-menu"),
      fallbackSize: { width: 180, height: 90 },
      anchorGap: 6,
      // PRESERVED DIFFERENCE: scroll and resize leave this menu open. Every
      // other overlay dismisses on both, and this looks like an oversight, but
      // the refactor is behaviour-preserving, so it is kept as-is and made
      // explicit rather than silently unified. Worth a follow-up decision.
      dismissOnViewportChange: false,
      onClose: () => {
        sortMenuContext = null;
      },
    });

    /**
     * Closes and empties the bookmark tree context menu.
     */
    function closeTreeContextMenu() {
      treeContextMenu.close();
    }

    /**
     * Builds and displays the right-click context menu at the given screen coordinates.
     * Closes any open sort menu before rendering the new menu items.
     * The menu is clamped to the viewport edges to prevent overflow.
     * @param {{ x: number, y: number, items: Array<{label?: string, icon?: string, danger?: boolean, type?: string, onClick?: Function}> }} options
     */
    function openTreeContextMenu({ x, y, items }) {
      const menu = document.getElementById("tree-context-menu");
      if (!menu) {
        return;
      }

      closeSortMenu();
      menu.innerHTML = "";

      for (const item of items || []) {
        if (item?.type === "divider") {
          const divider = document.createElement("div");
          divider.className = "tree-context-divider";
          menu.appendChild(divider);
          continue;
        }

        const button = document.createElement("button");
        button.className = item.danger
          ? "tree-context-item tree-context-item-danger"
          : "tree-context-item";
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.innerHTML = `
      <span class="icon-font" aria-hidden="true">${item.icon || "edit"}</span>
      <span>${item.label || t("actionDefault")}</span>
    `;
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeTreeContextMenu();
          if (typeof item.onClick === "function") {
            await item.onClick();
          }
        });
        menu.appendChild(button);
      }

      treeContextMenu.openAt(x, y);
    }

    /**
     * Closes the folder sort menu and clears its context.
     */
    function closeSortMenu() {
      sortMenu.close();
    }

    /**
     * Closes every menu the tree layer can have open, so a caller that is about
     * to replace the tree DOM does not have to know which menus exist.
     */
    function closeAllMenus() {
      editContextMenu.close();
      treeContextMenu.close();
      sortMenu.close();
    }

    /**
     * Opens the sort menu anchored to `anchorEl`.
     * If the same folder's sort menu is already open, calling this toggles it closed.
     * The menu is clamped to the viewport to avoid overflow.
     * @param {chrome.bookmarks.BookmarkTreeNode} folderNode - The folder to sort.
     * @param {HTMLElement} anchorEl - The button that triggered the menu.
     */
    function openSortMenu(folderNode, anchorEl) {
      if (!anchorEl) {
        return;
      }

      if (sortMenu.isOpen() && sortMenuContext?.folderId === folderNode.id) {
        closeSortMenu();
        return;
      }
      closeTreeContextMenu();

      sortMenuContext = sortMenu.openBelow(anchorEl)
        ? { folderId: folderNode.id }
        : null;
    }

    /**
     * Sorts the direct children of a folder alphabetically.
     * Folders always appear before bookmarks; ties use locale-aware, numeric comparison.
     * Moves each child to its new index via the Chrome bookmarks API sequentially.
     * @param {string} folderId - Chrome bookmark ID of the folder to sort.
     * @param {boolean} descending - When true, sorts Z → A instead of A → Z.
     * @returns {Promise<void>}
     */
    async function sortFolderChildren(folderId, descending) {
      const [folderNode] = await chrome.bookmarks.get(folderId);
      if (!folderNode) {
        throw new Error(t("folderNotFound"));
      }

      const children = await chrome.bookmarks.getChildren(folderId);
      if (!children.length) {
        return;
      }

      const sorted = [...children].sort((a, b) => {
        const typeA = a.url ? 1 : 0;
        const typeB = b.url ? 1 : 0;
        if (typeA !== typeB) {
          return typeA - typeB;
        }
        const cmp = (a.title || "").localeCompare(b.title || "", undefined, {
          sensitivity: "base",
          numeric: true,
        });
        return descending ? -cmp : cmp;
      });

      for (let i = 0; i < sorted.length; i += 1) {
        await chrome.bookmarks.move(sorted[i].id, { parentId: folderId, index: i });
      }
    }

    /**
     * Wraps `sortFolderChildren` in the shared mutation helper, which handles
     * status reporting and triggers a re-render after a successful sort.
     * @param {string} folderId
     * @param {boolean} descending
     * @returns {Promise<void>}
     */
    async function sortFolderAndRerender(folderId, descending) {
      await runBookmarkMutation(() => sortFolderChildren(folderId, descending), {
        successKey: descending ? "folderSortedDesc" : "folderSortedAsc",
        errorKey: "sortFailed",
        afterSuccess: () => rerenderAfterTreeChange([folderId]),
      });
    }

    /**
     * Called when the user clicks an Ascending/Descending button in the sort menu.
     * Closes the menu and runs the sort operation for the currently open folder context.
     * @param {boolean} descending
     * @returns {Promise<void>}
     */
    async function handleSortMenuApply(descending) {
      if (!sortMenuContext?.folderId) {
        closeSortMenu();
        return;
      }
      const folderId = sortMenuContext.folderId;
      closeSortMenu();
      await sortFolderAndRerender(folderId, descending);
    }

    return {
      closeAllMenus,
      closeSortMenu,
      closeTreeContextMenu,
      handleSortMenuApply,
      openSortMenu,
      openTreeContextMenu,
      sortFolderAndRerender,
    };
  }

  window.YABMBookmarkTreeMenuModule = {
    createBookmarkTreeMenuModule,
  };
})();
