(function () {
  function createBookmarkTreeMenuModule(deps) {
    const { t, runBookmarkMutation, rerenderAfterTreeChange } = deps;

    let sortMenuContext = null;
    let treeContextMenuOpen = false;

    function closeTreeContextMenu() {
      const menu = document.getElementById("tree-context-menu");
      if (!menu) {
        return;
      }
      menu.classList.add("hidden");
      menu.innerHTML = "";
      treeContextMenuOpen = false;
    }

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

    function closeSortMenu() {
      const menu = document.getElementById("folder-sort-menu");
      if (!menu) {
        return;
      }
      menu.classList.add("hidden");
      sortMenuContext = null;
    }

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

    async function sortFolderAndRerender(folderId, descending) {
      await runBookmarkMutation(() => sortFolderChildren(folderId, descending), {
        successKey: descending ? "folderSortedDesc" : "folderSortedAsc",
        errorKey: "sortFailed",
        afterSuccess: () => rerenderAfterTreeChange([folderId]),
      });
    }

    async function handleSortMenuApply(descending) {
      if (!sortMenuContext?.folderId) {
        closeSortMenu();
        return;
      }
      const folderId = sortMenuContext.folderId;
      closeSortMenu();
      await sortFolderAndRerender(folderId, descending);
    }

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
