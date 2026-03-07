/**
 * @file bookmark-tree-render.js
 * DOM rendering for the bookmark tree: builds `<div>` rows for bookmarks and
 * `<details>` nodes for folders, wires all event listeners, and manages the
 * full render cycle (favicon cache load, tree fetch, fragment swap).
 * Exposed as `window.YABMBookmarkTreeRenderModule`.
 */
(function () {
  /**
   * Factory that creates the bookmark tree render module.
   * @param {object} deps - All dependency functions injected by the orchestrator.
   * @returns {{ renderBookmarks: Function }}
   */
  function createBookmarkTreeRenderModule(deps) {
    const {
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
    } = deps;

    /**
     * Creates the DOM row for a single bookmark link, including its favicon,
     * title, URL text, action buttons, drag handles, and right-click menu.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - A bookmark node (has `url`).
     * @returns {HTMLDivElement}
     */
    function createBookmarkLink(node) {
      const row = document.createElement("div");
      row.className = "bookmark-row";
      row.draggable = true;
      row.dataset.nodeId = node.id;
      row.dataset.nodeType = "bookmark";
      row.addEventListener("dragstart", (event) =>
        handleNodeDragStart(event, node, "bookmark"),
      );
      row.addEventListener("dragend", handleNodeDragEnd);
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTreeContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label: t("menuOpenBookmark"),
              icon: "open_in_new",
              onClick: () => window.open(node.url, "_blank", "noopener"),
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
          ],
        });
      });

      const a = document.createElement("a");
      a.className = "bookmark-item";
      a.href = node.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.tooltip = node.url || "";

      const main = document.createElement("div");
      main.className = "bookmark-main";

      const favicon = document.createElement("img");
      favicon.className = "bookmark-favicon";
      favicon.alt = "";
      favicon.width = 22;
      favicon.height = 22;
      favicon.loading = "lazy";
      const cachedFavicon = getCachedFaviconForBookmark(node);
      favicon.src = cachedFavicon || "";
      favicon.addEventListener("error", () => {
        favicon.style.display = "none";
        fallbackFavicon.classList.remove("hidden");
      });

      const fallbackFavicon = document.createElement("span");
      fallbackFavicon.className = "bookmark-favicon-fallback hidden";
      fallbackFavicon.setAttribute("aria-hidden", "true");
      fallbackFavicon.innerHTML = '<span class="icon-font">language</span>';
      if (!cachedFavicon) {
        favicon.style.display = "none";
        fallbackFavicon.classList.remove("hidden");
      }

      const textWrap = document.createElement("div");
      textWrap.className = "bookmark-text";

      const title = document.createElement("span");
      title.className = "bookmark-title";
      title.textContent = node.title || node.url;

      const url = document.createElement("span");
      url.className = "bookmark-url";
      url.textContent = node.url;

      textWrap.append(title, url);
      main.append(favicon, fallbackFavicon, textWrap);
      a.append(main);
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

      row.append(a, actions);
      return row;
    }

    /**
     * Creates the collapsible `<details>` DOM node for a folder, recursively
     * rendering all child bookmarks and sub-folders.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - A folder node (has `children`).
     * @param {number} [level=0] - Nesting depth, controls the `--level` CSS variable.
     * @returns {HTMLDetailsElement}
     */
    function createFolderNode(node, level = 0) {
      const details = document.createElement("details");
      details.className = "folder";
      details.dataset.folderId = node.id;
      details.dataset.level = String(level);
      details.style.setProperty("--level", String(level));
      details.open = false;

      const summary = document.createElement("summary");
      summary.className = "folder-header";
      summary.draggable = true;
      summary.dataset.nodeId = node.id;
      summary.dataset.nodeType = "folder";
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFolder(details);
      });
      summary.addEventListener("dragstart", (event) =>
        handleNodeDragStart(event, node, "folder"),
      );
      summary.addEventListener("dragend", handleNodeDragEnd);
      summary.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTreeContextMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
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
          ],
        });
      });

      const left = document.createElement("div");
      left.className = "folder-left";

      const chevron = document.createElement("span");
      chevron.className = "folder-chevron";
      chevron.textContent = ">";

      const folderIcon = document.createElement("span");
      folderIcon.className = "folder-fixed-icon";
      folderIcon.setAttribute("aria-hidden", "true");
      folderIcon.innerHTML = '<span class="icon-font">folder</span>';

      const name = document.createElement("h3");
      name.className = "folder-name";
      name.textContent = node.title || t("unnamedFolder");

      left.append(chevron, folderIcon, name);

      const stats = getFolderStats(node);
      const right = document.createElement("div");
      right.className = "folder-meta";

      const bmCount = document.createElement("span");
      bmCount.className = "folder-count";
      bmCount.textContent = t("folderBookmarkCount", [String(stats.bookmarkCount)]);

      if (stats.folderCount > 0) {
        const fdCount = document.createElement("span");
        fdCount.className = "folder-count folder-count-soft";
        fdCount.textContent = t("folderFolderCount", [String(stats.folderCount)]);
        right.appendChild(fdCount);
      }

      right.appendChild(bmCount);
      const actions = document.createElement("div");
      actions.className = "folder-actions";
      actions.append(
        createActionButton({
          ariaLabel: t("sortFolder"),
          icon: "sort",
          onClick: (event) => openSortMenu(node, event.currentTarget),
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
      right.appendChild(actions);
      summary.append(left, right);

      const content = document.createElement("div");
      content.className = "folder-content";

      for (const child of node.children || []) {
        if (child.url) {
          content.appendChild(createBookmarkLink(child));
          continue;
        }

        if (child.children) {
          content.appendChild(createFolderNode(child, level + 1));
        }
      }

      if (!content.childNodes.length) {
        const empty = document.createElement("div");
        empty.className = "empty-subfolder";
        empty.textContent = t("emptyFolder");
        content.appendChild(empty);
      }

      details.append(summary, content);
      return details;
    }

    /**
     * Fetches the full Chrome bookmark tree, prunes the favicon cache, renders
     * all top-level folders into the list container, and restores open folder state.
     * @param {Set<string>|null} openFolderIds - IDs of folders to keep open after render.
     * @returns {Promise<void>}
     */
    async function renderBookmarksWithOpenState(openFolderIds) {
      closeEditContextMenu();
      closeTreeContextMenu();
      closeSortMenu();
      await ensureFaviconCacheLoaded();
      const container = document.getElementById("bookmark-list");
      const tree = await chrome.bookmarks.getTree();
      await pruneFaviconCacheForTree(tree);
      const folders = getTopLevelFolders(tree);
      updateTreeSummaryStats(folders);

      if (folders.length === 0) {
        container.innerHTML = `<div class="empty">${t("noBookmarkFoldersFound")}</div>`;
        updateMainLayoutMetrics();
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const folder of folders) {
        fragment.appendChild(createFolderNode(folder));
      }

      container.innerHTML = "";
      container.appendChild(fragment);
      applyOpenFolderIds(openFolderIds);
      updateMainLayoutMetrics();
    }

    /**
     * Public entry point for triggering a tree re-render, optionally with a
     * specific set of open folder IDs. Defaults to whatever is currently open.
     * @param {Set<string>|null} [openFolderIds=null]
     * @returns {Promise<void>}
     */
    async function renderBookmarks(openFolderIds = null) {
      const targetOpenIds = openFolderIds ?? getOpenFolderIds();
      return renderBookmarksWithOpenState(targetOpenIds);
    }

    return {
      renderBookmarks,
    };
  }

  window.YABMBookmarkTreeRenderModule = {
    createBookmarkTreeRenderModule,
  };
})();
