/**
 * @file bookmark-tree-render.js
 * DOM rendering for the bookmark tree: builds `<div>` rows for bookmarks and
 * `<details>` nodes for folders, wires all event listeners, and manages the
 * full render cycle (favicon cache load, tree fetch, fragment swap).
 * Row construction, favicon resolution, drag wiring, and the per-node action
 * catalogue all live behind this module's interface; callers only supply
 * collaborators and call `renderBookmarks`.
 * Exposed as `window.YABMBookmarkTreeRenderModule`.
 */

/**
 * Favicon cache services the render cycle needs. Grouped into one collaborator
 * so the renderer depends on favicon behaviour, not on individual cache calls.
 * @typedef {Object} RenderFavicons
 * @property {() => Promise<void>} ensureFaviconCacheLoaded
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => string | null} getCachedFaviconForBookmark
 * @property {(tree: chrome.bookmarks.BookmarkTreeNode[]) => Promise<void>} pruneFaviconCacheForTree
 */

/** @typedef {import("./bookmark-tree-node-actions.js").NodeActionsModule} NodeActionsModule */

/**
 * @typedef {Object} RenderModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(openFolderIds: Set<string> | null) => void} applyOpenFolderIds
 * @property {(node: chrome.bookmarks.BookmarkTreeNode) => { bookmarkCount: number, folderCount: number }} getFolderStats
 * @property {() => Set<string>} getOpenFolderIds
 * @property {(tree: chrome.bookmarks.BookmarkTreeNode[]) => chrome.bookmarks.BookmarkTreeNode[]} getTopLevelFolders
 * @property {(details: HTMLDetailsElement) => void} toggleFolder
 * @property {(folders: chrome.bookmarks.BookmarkTreeNode[]) => void} updateTreeSummaryStats
 * @property {() => void} updateMainLayoutMetrics
 * @property {() => void} closeAllMenus - Closes every open menu before the DOM is swapped.
 * @property {RenderFavicons} favicons
 * @property {NodeActionsModule} nodeActions
 * @property {(element: HTMLElement, node: chrome.bookmarks.BookmarkTreeNode, nodeType: 'bookmark' | 'folder') => void} attachNodeDragHandlers
 */

(function () {
  /**
   * Factory that creates the bookmark tree render module.
   * @param {RenderModuleDeps} deps - Collaborators injected by the orchestrator.
   * @returns {{ renderBookmarks: (openFolderIds?: Set<string> | null) => Promise<void> }}
   */
  function createBookmarkTreeRenderModule(deps) {
    const {
      t,
      applyOpenFolderIds,
      getFolderStats,
      getOpenFolderIds,
      getTopLevelFolders,
      toggleFolder,
      updateTreeSummaryStats,
      updateMainLayoutMetrics,
      closeAllMenus,
      favicons,
      nodeActions,
      attachNodeDragHandlers,
    } = deps;

    /**
     * Builds the favicon `<img>` plus its fallback glyph for a bookmark, wiring
     * the error path so a missing or broken favicon reveals the fallback instead.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - A bookmark node (has `url`).
     * @returns {Array<HTMLImageElement | HTMLSpanElement>} - The favicon image, then its fallback glyph.
     */
    function createFaviconCell(node) {
      const favicon = document.createElement("img");
      favicon.className = "bookmark-favicon";
      favicon.alt = "";
      favicon.width = 22;
      favicon.height = 22;
      favicon.loading = "lazy";
      const cachedFavicon = favicons.getCachedFaviconForBookmark(node);
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

      return [favicon, fallbackFavicon];
    }

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
      attachNodeDragHandlers(row, node, "bookmark");
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        nodeActions.openNodeContextMenu({
          node,
          x: event.clientX,
          y: event.clientY,
        });
      });

      const a = document.createElement("a");
      a.className = "bookmark-item";
      a.href = node.url || "";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.tooltip = node.url || "";

      const main = document.createElement("div");
      main.className = "bookmark-main";

      const [favicon, fallbackFavicon] = createFaviconCell(node);

      const textWrap = document.createElement("div");
      textWrap.className = "bookmark-text";

      const title = document.createElement("span");
      title.className = "bookmark-title";
      title.textContent = node.title || node.url || "";

      const url = document.createElement("span");
      url.className = "bookmark-url";
      url.textContent = node.url || "";

      textWrap.append(title, url);
      main.append(favicon, fallbackFavicon, textWrap);
      a.append(main);

      row.append(a, nodeActions.createActionBar(node));
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
      attachNodeDragHandlers(summary, node, "folder");
      summary.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        nodeActions.openNodeContextMenu({
          node,
          x: event.clientX,
          y: event.clientY,
          details,
        });
      });

      const left = document.createElement("div");
      left.className = "folder-left";

      const chevron = document.createElement("span");
      chevron.className = "folder-chevron icon-font";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "arrow_right";

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
      right.appendChild(nodeActions.createActionBar(node));
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
      closeAllMenus();
      await favicons.ensureFaviconCacheLoaded();
      const container = document.getElementById("bookmark-list");
      if (!container) {
        throw new Error("Missing element #bookmark-list");
      }
      const tree = await chrome.bookmarks.getTree();
      await favicons.pruneFaviconCacheForTree(tree);
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
