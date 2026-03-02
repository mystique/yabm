/**
 * @file bookmark-tree-state.js
 * UI state helpers for the bookmark tree: folder statistics, open/close animations,
 * summary counts, and action-button creation.
 * Exposed as `window.YABMBookmarkTreeStateModule`.
 */
(function () {
  /**
   * Factory that creates the bookmark tree state module.
   * @param {{ t: Function, updateBookmarkListScrollbar: Function }} deps
   * @returns {{ applyOpenFolderIds: Function, createActionButton: Function, getFolderStats: Function, getNameForNode: Function, getOpenFolderIds: Function, getTopLevelFolders: Function, setAllFoldersOpen: Function, setFolderOpen: Function, toggleFolder: Function, updateTreeSummaryStats: Function }}
   */
  function createBookmarkTreeStateModule(deps) {
    const { t, updateBookmarkListScrollbar } = deps;

    /**
     * Recursively counts the direct and nested bookmarks and sub-folders inside a node.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - A folder node with a `children` array.
     * @returns {{ bookmarkCount: number, folderCount: number }}
     */
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

    /**
     * Counts all bookmarks and folders across the full set of top-level folders.
     * Used to populate the global summary stats in the page header.
     * @param {chrome.bookmarks.BookmarkTreeNode[]} folders
     * @returns {{ folderCount: number, bookmarkCount: number }}
     */
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

    /**
     * Computes summary statistics for `folders` and writes the totals into the
     * corresponding header DOM elements.
     * @param {chrome.bookmarks.BookmarkTreeNode[]} folders
     */
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

    /**
     * Returns the best display name for a bookmark tree node.
     * Falls back to the URL for bookmark nodes without a title, and to a
     * translated "(untitled)" string when neither title nor URL is available.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {string}
     */
    function getNameForNode(node) {
      return node.title || (node.url ? node.url : t("untitled"));
    }

    /**
     * Extracts the top-level folder nodes from the Chrome bookmark tree.
     * The Chrome tree root always has a single root node whose direct children
     * are the built-in top-level folders (Bookmarks Bar, Other Bookmarks, etc.).
     * @param {chrome.bookmarks.BookmarkTreeNode[]} tree - Result of `chrome.bookmarks.getTree()`.
     * @returns {chrome.bookmarks.BookmarkTreeNode[]}
     */
    function getTopLevelFolders(tree) {
      const root = tree?.[0];
      if (!root?.children) {
        return [];
      }

      return root.children.filter((node) => node.children);
    }

    /**
     * Maps logical icon keys used throughout the UI to their Material Symbols codepoint names.
     * @type {Record<string, string>}
     */
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

    /**
     * Creates a styled icon button for the folder/bookmark action bar.
     * @param {{ ariaLabel: string, icon: string, onClick: (event: MouseEvent) => Promise<void>, danger?: boolean }} options
     * @returns {HTMLButtonElement}
     */
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

    /** Duration in milliseconds for the folder expand/collapse CSS transition. */
    const FOLDER_TOGGLE_ANIM_MS = 150;

    /**
     * Opens or closes a folder `<details>` element, optionally with a CSS animation.
     * When `animate` is true the folder content transitions via inline `max-height`,
     * `opacity`, and `translateY` styles that are cleared once the animation finishes.
     * @param {HTMLDetailsElement} details - The folder element to toggle.
     * @param {boolean} open - `true` to open, `false` to close.
     * @param {boolean} [animate=true] - Whether to run the expand/collapse animation.
     */
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

    /**
     * Toggles a folder between its open and closed states with animation.
     * @param {HTMLDetailsElement} details
     */
    function toggleFolder(details) {
      setFolderOpen(details, !details.open, true);
    }

    /**
     * Opens or closes every folder in the bookmark list.
     * @param {boolean} open - `true` to expand all folders, `false` to collapse.
     */
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

    /**
     * Returns a `Set` of `data-folder-id` values for every currently open folder.
     * Used to preserve open state across re-renders.
     * @returns {Set<string>}
     */
    function getOpenFolderIds() {
      return new Set(
        Array.from(document.querySelectorAll("#bookmark-list details.folder[open]"))
          .map((el) => el.dataset.folderId)
          .filter(Boolean),
      );
    }

    /**
     * Re-opens folders whose IDs are present in `openFolderIds` after a re-render.
     * Uses non-animated open to avoid visible layout jumps during restore.
     * @param {Set<string>|null} openFolderIds
     */
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
