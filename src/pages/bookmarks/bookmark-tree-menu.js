/**
 * @file bookmark-tree-menu.js
 * Context menu and sort-menu management for the bookmark tree.
 * Handles rendering, positioning, open/close lifecycle, and sort operations.
 * Exposed as `window.YABMBookmarkTreeMenuModule`.
 */
(function () {
  /**
   * Factory that creates the bookmark tree menu module.
   * @param {{ t: Function, runBookmarkMutation: Function, rerenderAfterTreeChange: Function }} deps
   * @returns {{ closeSortMenu: Function, closeTreeContextMenu: Function, handleSortMenuApply: Function, isTreeContextMenuOpen: Function, openSortMenu: Function, openTreeContextMenu: Function, sortFolderAndRerender: Function }}
   */
  function createBookmarkTreeMenuModule(deps) {
    const { t, runBookmarkMutation, rerenderAfterTreeChange } = deps;

    // Stores the folder ID of the currently open sort menu, or null when closed.
    let sortMenuContext = null;
    // Tracks whether the right-click context menu is currently open.
    let treeContextMenuOpen = false;

    /**
     * Closes and empties the bookmark tree context menu.
     */
    function closeTreeContextMenu() {
      const menu = document.getElementById("tree-context-menu");
      if (!menu) {
        return;
      }
      menu.classList.add("hidden");
      menu.innerHTML = "";
      treeContextMenuOpen = false;
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

      menu.classList.remove("hidden");
      treeContextMenuOpen = true;

      const width = menu.offsetWidth || 220;
      const height = menu.offsetHeight || 180;
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, x));
      const top = Math.min(window.innerHeight - height - 8, Math.max(8, y));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    /**
     * Closes the folder sort menu and clears its context.
     */
    function closeSortMenu() {
      const menu = document.getElementById("folder-sort-menu");
      if (!menu) {
        return;
      }
      menu.classList.add("hidden");
      sortMenuContext = null;
    }

    /**
     * Opens the sort menu anchored to `anchorEl`.
     * If the same folder's sort menu is already open, calling this toggles it closed.
     * The menu is clamped to the viewport to avoid overflow.
     * @param {chrome.bookmarks.BookmarkTreeNode} folderNode - The folder to sort.
     * @param {HTMLElement} anchorEl - The button that triggered the menu.
     */
    function openSortMenu(folderNode, anchorEl) {
      const menu = document.getElementById("folder-sort-menu");
      if (!menu || !anchorEl) {
        return;
      }

      if (
        !menu.classList.contains("hidden") &&
        sortMenuContext?.folderId === folderNode.id
      ) {
        closeSortMenu();
        return;
      }
      closeTreeContextMenu();

      sortMenuContext = { folderId: folderNode.id };
      const rect = anchorEl.getBoundingClientRect();
      menu.classList.remove("hidden");

      const menuWidth = menu.offsetWidth || 180;
      const menuHeight = menu.offsetHeight || 90;
      const left = Math.min(
        window.innerWidth - menuWidth - 8,
        Math.max(8, rect.right - menuWidth),
      );
      const top = Math.min(
        window.innerHeight - menuHeight - 8,
        Math.max(8, rect.bottom + 6),
      );

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
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

    /**
     * Returns whether the right-click context menu is currently open.
     * @returns {boolean}
     */
    function isTreeContextMenuOpen() {
      return treeContextMenuOpen;
    }

    return {
      closeSortMenu,
      closeTreeContextMenu,
      handleSortMenuApply,
      isTreeContextMenuOpen,
      openSortMenu,
      openTreeContextMenu,
      sortFolderAndRerender,
    };
  }

  window.YABMBookmarkTreeMenuModule = {
    createBookmarkTreeMenuModule,
  };
})();
