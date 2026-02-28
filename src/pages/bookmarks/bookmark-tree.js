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
      summary.addEventListener("dragenter", (event) =>
        handleFolderDragEnter(event, details),
      );
      summary.addEventListener("dragover", (event) =>
        handleFolderDragOver(event, details),
      );
      summary.addEventListener("dragleave", (event) =>
        handleFolderDragLeave(event, details),
      );
      summary.addEventListener("drop", (event) => handleFolderDrop(event, node));
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
      content.addEventListener("dragenter", (event) =>
        handleFolderDragEnter(event, details),
      );
      content.addEventListener("dragover", (event) =>
        handleFolderDragOver(event, details),
      );
      content.addEventListener("dragleave", (event) =>
        handleFolderDragLeave(event, details),
      );
      content.addEventListener("drop", (event) => handleFolderDrop(event, node));

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

    async function renderBookmarks(openFolderIds = null) {
      const targetOpenIds = openFolderIds ?? getOpenFolderIds();
      return renderBookmarksWithOpenState(targetOpenIds);
    }

    function isTreeContextMenuOpen() {
      return treeContextMenuOpen;
    }

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
