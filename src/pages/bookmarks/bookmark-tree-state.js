(function () {
  function createBookmarkTreeStateModule(deps) {
    const { t, updateBookmarkListScrollbar } = deps;

    function getFolderStats(node) {
      let bookmarkCount = 0;
      let folderCount = 0;

      for (const child of node.children || []) {
        if (child.url) {
          bookmarkCount += 1;
          continue;
        }

        if (child.children) {
          folderCount += 1;
          const nested = getFolderStats(child);
          bookmarkCount += nested.bookmarkCount;
          folderCount += nested.folderCount;
        }
      }

      return { bookmarkCount, folderCount };
    }

    function getTreeSummaryStats(folders) {
      let folderCount = 0;
      let bookmarkCount = 0;

      const visit = (node) => {
        if (!node) {
          return;
        }
        if (node.url) {
          bookmarkCount += 1;
          return;
        }
        if (node.children) {
          folderCount += 1;
          for (const child of node.children) {
            visit(child);
          }
        }
      };

      for (const folder of folders || []) {
        visit(folder);
      }

      return { folderCount, bookmarkCount };
    }

    function updateTreeSummaryStats(folders) {
      const folderCountEl = document.getElementById("tree-folder-count");
      const bookmarkCountEl = document.getElementById("tree-bookmark-count");
      const stats = getTreeSummaryStats(folders);
      if (folderCountEl) {
        folderCountEl.textContent = t("summaryFolders", [String(stats.folderCount)]);
      }
      if (bookmarkCountEl) {
        bookmarkCountEl.textContent = t("summaryBookmarks", [
          String(stats.bookmarkCount),
        ]);
      }
    }

    function getNameForNode(node) {
      return node.title || (node.url ? node.url : t("untitled"));
    }

    function getTopLevelFolders(tree) {
      const root = tree?.[0];
      if (!root?.children) {
        return [];
      }

      return root.children.filter((node) => node.children);
    }

    const ICON_NAMES = {
      trash: "delete",
      edit: "edit",
      copy: "content_copy",
      sort: "sort_by_alpha",
      "folder-plus": "create_new_folder",
      "bookmark-plus": "bookmark_add",
      favicon: "image",
      "folder-favicon": "imagesmode",
    };

    function createActionButton({ ariaLabel, icon, onClick, danger = false }) {
      const button = document.createElement("button");
      button.className = danger ? "action-btn action-btn-danger" : "action-btn";
      button.type = "button";
      button.setAttribute("aria-label", ariaLabel);
      button.dataset.tooltip = ariaLabel;
      const iconName = ICON_NAMES[icon] || ICON_NAMES.edit;
      button.innerHTML = `<span class="icon-font" aria-hidden="true">${iconName}</span>`;

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await onClick(event);
      });

      return button;
    }

    const FOLDER_TOGGLE_ANIM_MS = 150;

    function setFolderOpen(details, open, animate = true) {
      const content = details.querySelector(":scope > .folder-content");
      if (!content) {
        details.open = open;
        return;
      }

      if (details.open === open) {
        return;
      }

      if (!animate) {
        details.open = open;
        requestAnimationFrame(() => {
          updateBookmarkListScrollbar();
          window.setTimeout(updateBookmarkListScrollbar, 30);
        });
        return;
      }

      if (open) {
        details.open = true;
        content.style.maxHeight = "0px";
        content.style.opacity = "0";
        content.style.transform = "translateY(-4px)";
        requestAnimationFrame(() => {
          content.style.maxHeight = `${content.scrollHeight}px`;
          content.style.opacity = "1";
          content.style.transform = "translateY(0)";
        });
        window.setTimeout(() => {
          content.style.maxHeight = "";
          content.style.opacity = "";
          content.style.transform = "";
          updateBookmarkListScrollbar();
        }, FOLDER_TOGGLE_ANIM_MS);
        requestAnimationFrame(() => {
          updateBookmarkListScrollbar();
          window.setTimeout(updateBookmarkListScrollbar, FOLDER_TOGGLE_ANIM_MS + 20);
        });
        return;
      }

      content.style.maxHeight = `${content.scrollHeight}px`;
      content.style.opacity = "1";
      content.style.transform = "translateY(0)";
      requestAnimationFrame(() => {
        content.style.maxHeight = "0px";
        content.style.opacity = "0";
        content.style.transform = "translateY(-4px)";
      });
      window.setTimeout(() => {
        details.open = false;
        content.style.maxHeight = "";
        content.style.opacity = "";
        content.style.transform = "";
        updateBookmarkListScrollbar();
      }, FOLDER_TOGGLE_ANIM_MS);
      requestAnimationFrame(() => {
        updateBookmarkListScrollbar();
        window.setTimeout(updateBookmarkListScrollbar, FOLDER_TOGGLE_ANIM_MS + 20);
      });
    }

    function toggleFolder(details) {
      setFolderOpen(details, !details.open, true);
    }

    function setAllFoldersOpen(open) {
      const folders = document.querySelectorAll("#bookmark-list details.folder");
      for (const folder of folders) {
        setFolderOpen(folder, open, true);
      }
      requestAnimationFrame(() => {
        updateBookmarkListScrollbar();
        window.setTimeout(updateBookmarkListScrollbar, FOLDER_TOGGLE_ANIM_MS + 20);
      });
    }

    function getOpenFolderIds() {
      return new Set(
        Array.from(document.querySelectorAll("#bookmark-list details.folder[open]"))
          .map((el) => el.dataset.folderId)
          .filter(Boolean),
      );
    }

    function applyOpenFolderIds(openFolderIds) {
      if (!openFolderIds || !openFolderIds.size) {
        return;
      }

      const folders = document.querySelectorAll("#bookmark-list details.folder");
      for (const folder of folders) {
        if (openFolderIds.has(folder.dataset.folderId)) {
          setFolderOpen(folder, true, false);
        }
      }
    }

    return {
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
    };
  }

  window.YABMBookmarkTreeStateModule = {
    createBookmarkTreeStateModule,
  };
})();
