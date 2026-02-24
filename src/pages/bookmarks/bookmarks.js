const FAVICON_CACHE_KEY = "bookmarkFavicons";
const faviconCacheState = {
  loaded: false,
  map: {},
};
let faviconUpdateInFlight = false;
const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);
const LANGUAGE_OPTIONS = [
  { value: window.YABMI18n.AUTO_LANGUAGE, label: "Auto (Browser)", flag: "🌐" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "zh_CN", label: "Chinese (Simplified)", flag: "🇨🇳" },
  { value: "zh_TW", label: "Chinese (Traditional)", flag: "🇹🇼" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "es", label: "Espanol", flag: "🇪🇸" },
  { value: "fr", label: "Francais", flag: "🇫🇷" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "ja", label: "Japanese", flag: "🇯🇵" },
  { value: "ko", label: "Korean", flag: "🇰🇷" },
  { value: "pt", label: "Portugues", flag: "🇵🇹" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
];
const flagIconCache = new Map();
const TWEMOJI_BASE_PATH = "assets/twemoji";
const WEBDAV_ICON_STATES = {
  notConfigured: {
    cssClass: "is-not-configured",
    codepoint: "26aa",
    fallback: "?",
  },
  checking: { cssClass: "is-checking", codepoint: "23f3", fallback: "..." },
  ready: { cssClass: "is-ready", codepoint: "1f7e2", fallback: "OK" },
  error: { cssClass: "is-error", codepoint: "1f534", fallback: "!" },
};
const WEBDAV_ICON_STATE_CLASSES = Object.values(WEBDAV_ICON_STATES).map(
  (item) => item.cssClass,
);

function emojiToCodepoints(emoji) {
  return Array.from(emoji || "")
    .map((ch) => ch.codePointAt(0).toString(16))
    .join("-");
}

function getFlagIconSrc(flagEmoji) {
  if (flagIconCache.has(flagEmoji)) {
    return flagIconCache.get(flagEmoji);
  }
  const code = emojiToCodepoints(flagEmoji || "🌐");
  const url = chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${code}.svg`);
  flagIconCache.set(flagEmoji, url);
  return url;
}

function getTwemojiIconSrcByCodepoint(codepoint) {
  return chrome.runtime.getURL(`${TWEMOJI_BASE_PATH}/${codepoint}.svg`);
}

function getLanguageOptionLabel(value) {
  const option = LANGUAGE_OPTIONS.find((item) => item.value === value);
  return option ? option.label : "Auto (Browser)";
}

async function ensureFaviconCacheLoaded() {
  if (faviconCacheState.loaded) {
    return;
  }
  try {
    const stored = await chrome.storage.local.get(FAVICON_CACHE_KEY);
    faviconCacheState.map = stored?.[FAVICON_CACHE_KEY] || {};
  } catch {
    faviconCacheState.map = {};
  }
  faviconCacheState.loaded = true;
}

async function persistFaviconCache() {
  await chrome.storage.local.set({
    [FAVICON_CACHE_KEY]: faviconCacheState.map,
  });
}

async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "true");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  temp.style.left = "-9999px";
  temp.style.top = "-9999px";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(temp);
  if (!copied) {
    throw new Error(t("copyBookmarkUrlFailedUnknown"));
  }
}

async function copyBookmarkUrl(node) {
  try {
    await copyTextToClipboard(node.url || "");
    setStatus(t("bookmarkUrlCopied"), "success");
  } catch (error) {
    setStatus(
      t("copyBookmarkUrlFailed", [
        error?.message || t("copyBookmarkUrlFailedUnknown"),
      ]),
      "error",
    );
  }
}

function getCachedFaviconForBookmark(node) {
  const cached = faviconCacheState.map?.[node.id];
  if (!cached || !cached.dataUrl || cached.url !== node.url) {
    return null;
  }
  return cached.dataUrl;
}

function getBookmarkNodesInFolder(node) {
  const bookmarks = [];
  const walk = (cur) => {
    for (const child of cur?.children || []) {
      if (child.url) {
        bookmarks.push(child);
      } else if (child.children) {
        walk(child);
      }
    }
  };
  walk(node);
  return bookmarks;
}

function collectBookmarkIds(tree) {
  const ids = new Set();
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node?.url) {
        ids.add(String(node.id));
      } else if (node?.children) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return ids;
}

async function pruneFaviconCacheForTree(tree) {
  await ensureFaviconCacheLoaded();
  const cache = faviconCacheState.map || {};
  const cachedIds = Object.keys(cache);
  if (!cachedIds.length) {
    return;
  }

  const validIds = collectBookmarkIds(tree);
  let changed = false;
  for (const id of cachedIds) {
    if (!validIds.has(id)) {
      delete cache[id];
      changed = true;
    }
  }

  if (changed) {
    await persistFaviconCache();
  }
}

async function loadImageAsDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    // Keep image loading permissive. Some favicon endpoints do not provide CORS
    // headers, which blocks canvas export but still allows direct image display.
    img.onload = () => {
      try {
        const width = img.naturalWidth || 32;
        const height = img.naturalHeight || 32;
        const size = Math.max(32, Math.min(64, Math.max(width, height)));
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error(t("noCanvasContext"));
        }
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / width, size / height);
        const drawW = Math.max(1, Math.round(width * scale));
        const drawH = Math.max(1, Math.round(height * scale));
        const drawX = Math.round((size - drawW) / 2);
        const drawY = Math.round((size - drawH) / 2);
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        const dataUrl = canvas.toDataURL("image/png");
        if (!dataUrl || dataUrl === "data:,") {
          throw new Error(t("emptyFaviconData"));
        }
        resolve(dataUrl);
      } catch {
        // Fallback for cross-origin/tainted canvas: use original source URL.
        // This preserves favicon rendering even when data URL conversion is blocked.
        resolve(src);
      }
    };
    img.onerror = () => reject(new Error("favicon load failed"));
    img.src = src;
  });
}

async function fetchFaviconDataUrlForBookmark(node) {
  const url = ensureValidUrl(node.url);
  const sources = [
    `chrome://favicon2/?size=64&pageUrl=${encodeURIComponent(url)}`,
    `chrome://favicon/size/64@1x/${url}`,
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`,
  ];

  for (const src of sources) {
    try {
      const dataUrl = await loadImageAsDataUrl(src);
      if (dataUrl) {
        return dataUrl;
      }
    } catch {
      // try next source
    }
  }

  throw new Error(t("faviconFetchFailed"));
}

async function refreshBookmarkFavicon(node, { silent = false } = {}) {
  if (faviconUpdateInFlight) {
    setStatus(t("faviconUpdateInProgress"), "");
    showTopToast(t("faviconUpdateInProgress"), "");
    return;
  }
  faviconUpdateInFlight = true;
  showTopProgress();
  try {
    await ensureFaviconCacheLoaded();
    const dataUrl = await fetchFaviconDataUrlForBookmark(node);
    faviconCacheState.map[node.id] = {
      url: node.url,
      dataUrl,
      updatedAt: Date.now(),
    };
    await persistFaviconCache();
    if (!silent) {
      setStatus(t("faviconUpdated"), "success");
      await rerenderAfterTreeChange([node.parentId].filter(Boolean));
    }
  } finally {
    faviconUpdateInFlight = false;
    hideTopProgress();
  }
}

async function refreshFolderFavicons(folderNode) {
  if (faviconUpdateInFlight) {
    setStatus(t("faviconUpdateInProgress"), "");
    showTopToast(t("faviconUpdateInProgress"), "");
    return;
  }
  faviconUpdateInFlight = true;
  await ensureFaviconCacheLoaded();
  const bookmarks = getBookmarkNodesInFolder(folderNode);
  if (!bookmarks.length) {
    setStatus(t("noBookmarksInFolder"), "error");
    faviconUpdateInFlight = false;
    return;
  }

  showTopProgress({ mode: "determinate", value: 0 });
  try {
    let success = 0;
    let failed = 0;
    let completed = 0;
    const total = bookmarks.length;
    for (const bookmark of bookmarks) {
      try {
        const dataUrl = await fetchFaviconDataUrlForBookmark(bookmark);
        faviconCacheState.map[bookmark.id] = {
          url: bookmark.url,
          dataUrl,
          updatedAt: Date.now(),
        };
        success += 1;
      } catch {
        failed += 1;
      }
      completed += 1;
      updateTopProgress(completed / total);
    }

    if (success > 0) {
      await persistFaviconCache();
    }
    if (failed > 0 && success === 0) {
      setStatus(t("faviconUpdateFailedCount", [String(failed)]), "error");
    } else if (failed > 0) {
      setStatus(
        t("faviconsUpdatedSuccessFail", [String(success), String(failed)]),
        "success",
      );
    } else {
      setStatus(t("faviconsUpdatedSuccess", [String(success)]), "success");
    }
    await rerenderAfterTreeChange([folderNode.id]);
  } finally {
    faviconUpdateInFlight = false;
    hideTopProgress();
  }
}

async function removeFaviconsByBookmarkIds(ids) {
  await ensureFaviconCacheLoaded();
  let changed = false;
  for (const id of ids) {
    if (faviconCacheState.map[id]) {
      delete faviconCacheState.map[id];
      changed = true;
    }
  }
  if (changed) {
    await persistFaviconCache();
  }
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
          onClick: async () => {
            try {
              await refreshBookmarkFavicon(node);
            } catch (error) {
              setStatus(t("faviconUpdateFailed", [error.message]), "error");
            }
          },
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
      onClick: async () => {
        try {
          await refreshBookmarkFavicon(node);
        } catch (error) {
          setStatus(t("faviconUpdateFailed", [error.message]), "error");
        }
      },
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
    folderCountEl.textContent = t("summaryFolders", [
      String(stats.folderCount),
    ]);
  }
  if (bookmarkCountEl) {
    bookmarkCountEl.textContent = t("summaryBookmarks", [
      String(stats.bookmarkCount),
    ]);
  }
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
          onClick: async () => {
            try {
              await sortFolderChildren(node.id, false);
              setStatus(t("folderSortedAsc"), "success");
              await rerenderAfterTreeChange([node.id]);
            } catch (error) {
              setStatus(t("sortFailed", [error.message]), "error");
            }
          },
        },
        {
          label: t("sortDescending"),
          icon: "arrow_downward",
          onClick: async () => {
            try {
              await sortFolderChildren(node.id, true);
              setStatus(t("folderSortedDesc"), "success");
              await rerenderAfterTreeChange([node.id]);
            } catch (error) {
              setStatus(t("sortFailed", [error.message]), "error");
            }
          },
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

const dragState = {
  nodeId: null,
  nodeType: null,
  parentId: null,
};
let dragGhostEl = null;

function removeDragGhost() {
  if (dragGhostEl?.parentNode) {
    dragGhostEl.parentNode.removeChild(dragGhostEl);
  }
  dragGhostEl = null;
}

function clearFolderDragOverStyles() {
  for (const folder of document.querySelectorAll(
    "#bookmark-list .folder.drag-over",
  )) {
    folder.classList.remove("drag-over");
  }
}

function handleNodeDragStart(event, node, nodeType) {
  dragState.nodeId = node.id;
  dragState.nodeType = nodeType;
  dragState.parentId = node.parentId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", node.id);
  const sourceEl = event.currentTarget;
  sourceEl?.classList.add("drag-source");

  removeDragGhost();
  const previewSource =
    nodeType === "bookmark"
      ? sourceEl?.querySelector(".bookmark-item") || sourceEl
      : sourceEl;
  if (previewSource && event.dataTransfer?.setDragImage) {
    const rect = previewSource.getBoundingClientRect();
    const ghost = previewSource.cloneNode(true);
    ghost.classList.remove("drag-source", "drag-over");
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${Math.max(140, Math.round(rect.width))}px`;
    ghost.style.position = "fixed";
    ghost.style.top = "-10000px";
    ghost.style.left = "-10000px";
    document.body.appendChild(ghost);
    dragGhostEl = ghost;
    event.dataTransfer.setDragImage(
      ghost,
      Math.min(26, Math.round(rect.width * 0.2)),
      14,
    );
  }
}

function handleNodeDragEnd(event) {
  dragState.nodeId = null;
  dragState.nodeType = null;
  event.currentTarget?.classList.remove("drag-source");
  clearFolderDragOverStyles();
  removeDragGhost();
}

function handleFolderDragEnter(event, details) {
  if (!dragState.nodeId) {
    return;
  }
  event.preventDefault();
  // Clear other folders' highlight first
  clearFolderDragOverStyles();
  details.classList.add("drag-over");
}

function handleFolderDragOver(event, details) {
  if (!dragState.nodeId) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleFolderDragLeave(event, details) {
  if (event.relatedTarget && details.contains(event.relatedTarget)) {
    return;
  }
  details.classList.remove("drag-over");
}

function folderTreeContainsFolder(node, targetId) {
  if (!node?.children?.length) {
    return false;
  }
  for (const child of node.children) {
    if (child.id === targetId) {
      return true;
    }
    if (folderTreeContainsFolder(child, targetId)) {
      return true;
    }
  }
  return false;
}

async function canDropNodeInFolder(dragNodeId, dragNodeType, targetFolderId) {
  if (!dragNodeId || !targetFolderId) {
    return false;
  }
  if (dragNodeId === targetFolderId) {
    return false;
  }
  if (dragNodeType !== "folder") {
    return true;
  }

  const [dragSubTree] = await chrome.bookmarks.getSubTree(dragNodeId);
  return !folderTreeContainsFolder(dragSubTree, targetFolderId);
}

async function handleFolderDrop(event, targetFolderNode) {
  if (!dragState.nodeId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  clearFolderDragOverStyles();

  const dragNodeId = dragState.nodeId;
  const dragNodeType = dragState.nodeType;
  dragState.nodeId = null;
  dragState.nodeType = null;

  try {
    const canDrop = await canDropNodeInFolder(
      dragNodeId,
      dragNodeType,
      targetFolderNode.id,
    );
    if (!canDrop) {
      setStatus(t("cannotDropFolder"), "error");
      return;
    }

    const [dragNode] = await chrome.bookmarks.get(dragNodeId);
    if (!dragNode) {
      setStatus(t("dragSourceNotFound"), "error");
      return;
    }
    if (dragNode.parentId === targetFolderNode.id) {
      return;
    }

    const children = await chrome.bookmarks.getChildren(targetFolderNode.id);
    await chrome.bookmarks.move(dragNodeId, {
      parentId: targetFolderNode.id,
      index: children.length,
    });

    setStatus(t("movedSuccessfully"), "success");
    await rerenderAfterTreeChange([targetFolderNode.id]);
  } catch (error) {
    setStatus(t("moveFailed", [error.message]), "error");
  }
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

  try {
    const openFolderIds = getOpenFolderIds();
    await removeFaviconsByBookmarkIds([node.id]);
    await chrome.bookmarks.remove(node.id);
    setStatus(t("bookmarkDeleted"), "success");
    await renderBookmarks(openFolderIds);
  } catch (error) {
    setStatus(t("deleteFailed", [error.message]), "error");
  }
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

  try {
    const openFolderIds = getOpenFolderIds();
    const bookmarkIds = getBookmarkNodesInFolder(node).map((item) => item.id);
    await removeFaviconsByBookmarkIds(bookmarkIds);
    await chrome.bookmarks.removeTree(node.id);
    setStatus(t("folderDeleted"), "success");
    await renderBookmarks(openFolderIds);
  } catch (error) {
    setStatus(t("deleteFailed", [error.message]), "error");
  }
}

function getNameForNode(node) {
  return node.title || (node.url ? node.url : t("untitled"));
}

function ensureValidUrl(rawUrl) {
  const value = (rawUrl || "").trim();
  if (!value) {
    throw new Error(t("urlRequired"));
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(t("urlInvalid"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(t("urlOnlyHttpHttps"));
  }
  return parsed.toString();
}

async function rerenderAfterTreeChange(extraOpenFolderIds = []) {
  const openFolderIds = getOpenFolderIds();
  for (const folderId of extraOpenFolderIds) {
    openFolderIds.add(folderId);
  }
  await renderBookmarks(openFolderIds);
  await refreshWebdavStatusBar();
}

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

  try {
    await chrome.bookmarks.create({
      parentId: parentNode.id,
      title: result.name || t("newFolderDefault"),
    });
    setStatus(t("folderCreated"), "success");
    await rerenderAfterTreeChange([parentNode.id]);
  } catch (error) {
    setStatus(t("createFolderFailed", [error.message]), "error");
  }
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

  try {
    await chrome.bookmarks.update(node.id, {
      title: result.name || t("untitled"),
    });
    setStatus(t("folderUpdated"), "success");
    await rerenderAfterTreeChange([node.id]);
  } catch (error) {
    setStatus(t("updateFolderFailed", [error.message]), "error");
  }
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

  try {
    const url = ensureValidUrl(result.url);
    await chrome.bookmarks.create({
      parentId: parentNode.id,
      title: result.name || url,
      url,
    });
    setStatus(t("bookmarkCreated"), "success");
    await rerenderAfterTreeChange([parentNode.id]);
  } catch (error) {
    setStatus(t("createBookmarkFailed", [error.message]), "error");
  }
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

  try {
    const url = ensureValidUrl(result.url);
    if (node.url !== url) {
      await removeFaviconsByBookmarkIds([node.id]);
    }
    await chrome.bookmarks.update(node.id, {
      title: result.name || url,
      url,
    });
    setStatus(t("bookmarkUpdated"), "success");
    await rerenderAfterTreeChange();
  } catch (error) {
    setStatus(t("updateBookmarkFailed", [error.message]), "error");
  }
}

let sortMenuContext = null;
let treeContextMenuOpen = false;
let editContextMenuOpen = false;
let editContextTarget = null;

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

function isEditableTarget(target) {
  return Boolean(
    target &&
    ((target instanceof HTMLInputElement &&
      !target.readOnly &&
      !target.disabled &&
      (target.type === "text" ||
        target.type === "search" ||
        target.type === "url" ||
        target.type === "email" ||
        target.type === "tel" ||
        target.type === "password")) ||
      (target instanceof HTMLTextAreaElement &&
        !target.readOnly &&
        !target.disabled) ||
      target.isContentEditable),
  );
}

function closeEditContextMenu() {
  const menu = document.getElementById("edit-context-menu");
  if (!menu) {
    return;
  }
  menu.classList.add("hidden");
  menu.innerHTML = "";
  editContextMenuOpen = false;
  editContextTarget = null;
}

function getSelectionTextFromEditable(target) {
  if (!target) {
    return "";
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(start, end);
  }
  const sel = window.getSelection();
  return sel ? sel.toString() : "";
}

function replaceSelectedTextInEditable(target, text) {
  if (!target) {
    return;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (target.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    selection.deleteFromDocument();
    const range = selection.getRangeAt(0);
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function openEditContextMenu(target, x, y) {
  const menu = document.getElementById("edit-context-menu");
  if (!menu) {
    return;
  }
  if (typeof target.focus === "function") {
    target.focus();
  }
  closeTreeContextMenu();
  closeSortMenu();
  menu.innerHTML = "";

  editContextTarget = target;
  editContextMenuOpen = true;

  const selectedText = getSelectionTextFromEditable(target);
  const hasSelection = selectedText.length > 0;

  const makeItem = ({ label, icon, onClick, disabled = false }) => {
    const button = document.createElement("button");
    button.className = "tree-context-item";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = disabled;
    button.innerHTML = `
      <span class="icon-font" aria-hidden="true">${icon}</span>
      <span>${label}</span>
    `;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeEditContextMenu();
      if (!disabled) {
        await onClick();
      }
    });
    return button;
  };

  const addDivider = () => {
    const divider = document.createElement("div");
    divider.className = "tree-context-divider";
    menu.appendChild(divider);
  };

  menu.appendChild(
    makeItem({
      label: t("contextCut"),
      icon: "content_cut",
      disabled: !hasSelection,
      onClick: async () => document.execCommand("cut"),
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextCopy"),
      icon: "content_copy",
      disabled: !hasSelection,
      onClick: async () => document.execCommand("copy"),
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextPaste"),
      icon: "content_paste",
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          replaceSelectedTextInEditable(target, text);
        } catch {
          setStatus(t("pastePermissionDenied"), "error");
        }
      },
    }),
  );
  menu.appendChild(
    makeItem({
      label: t("contextDelete"),
      icon: "delete",
      disabled: !hasSelection,
      onClick: async () => replaceSelectedTextInEditable(target, ""),
    }),
  );
  addDivider();
  menu.appendChild(
    makeItem({
      label: t("contextSelectAll"),
      icon: "select_all",
      onClick: async () => {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          target.select();
          return;
        }
        if (target.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(target);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      },
    }),
  );

  menu.classList.remove("hidden");
  const width = menu.offsetWidth || 220;
  const height = menu.offsetHeight || 260;
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

function getTopLevelFolders(tree) {
  const root = tree?.[0];
  if (!root?.children) {
    return [];
  }

  return root.children.filter((node) => node.children);
}

function setStatus(message, type) {
  const statusEl = document.getElementById("sync-status");
  updateStatusElement(statusEl, "sync-status", message, type);
  if (message && (type === "success" || type === "error")) {
    showTopToast(message, type);
  }
}

function updateStatusElement(statusEl, baseClassName, message, type) {
  if (!statusEl) {
    return;
  }
  const hasMessage = Boolean(message && String(message).trim());
  statusEl.className = baseClassName;
  if (!hasMessage) {
    statusEl.classList.add("is-hidden");
    statusEl.setAttribute("aria-hidden", "true");
    statusEl.textContent = "";
    return;
  }
  statusEl.textContent = message;
  statusEl.removeAttribute("aria-hidden");
  if (type) {
    statusEl.classList.add(type);
  }
}

function setSyncButtonsDisabled(disabled) {
  const ids = ["upload-bookmarks", "download-bookmarks", "webdav-refresh"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disabled;
    }
  }
}

const BOOKMARK_SCROLLBAR_METRICS = {
  trackInset: 1,
  thumbInsetTop: 2,
  thumbInsetBottom: 4,
  holdInitialDelayMs: 260,
  holdIntervalMs: 60,
};

const bookmarkScrollbarState = {
  holdTimeoutId: null,
  holdIntervalId: null,
  holdDirection: 0,
  holdTickFn: null,
  dragPointerId: null,
  dragStartY: 0,
  dragStartScrollTop: 0,
  globalEventsBound: false,
};

function stopBookmarkScrollHold() {
  if (bookmarkScrollbarState.holdTimeoutId !== null) {
    window.clearTimeout(bookmarkScrollbarState.holdTimeoutId);
    bookmarkScrollbarState.holdTimeoutId = null;
  }
  if (bookmarkScrollbarState.holdIntervalId !== null) {
    window.clearInterval(bookmarkScrollbarState.holdIntervalId);
    bookmarkScrollbarState.holdIntervalId = null;
  }
  bookmarkScrollbarState.holdDirection = 0;
  bookmarkScrollbarState.holdTickFn = null;
}

function scrollBookmarkListByStep(direction, { behavior = "smooth" } = {}) {
  const list = document.getElementById("bookmark-list");
  if (!list) {
    return;
  }
  const delta = Math.max(48, Math.round(list.clientHeight * 0.16));
  list.scrollBy({
    top: direction * delta,
    behavior,
  });
}

function scrollBookmarkListByPage(direction, { behavior = "auto" } = {}) {
  const list = document.getElementById("bookmark-list");
  if (!list) {
    return;
  }
  const delta = Math.max(96, Math.round(list.clientHeight * 0.82));
  list.scrollBy({
    top: direction * delta,
    behavior,
  });
}

function runBookmarkScrollHoldTick() {
  const tickFn = bookmarkScrollbarState.holdTickFn;
  if (typeof tickFn === "function") {
    const shouldContinue = tickFn();
    if (!shouldContinue) {
      stopBookmarkScrollHold();
    }
    return;
  }
  if (!bookmarkScrollbarState.holdDirection) {
    stopBookmarkScrollHold();
    return;
  }
  scrollBookmarkListByStep(bookmarkScrollbarState.holdDirection, {
    behavior: "auto",
  });
}

function startBookmarkScrollHold(direction, { tickFn = null } = {}) {
  stopBookmarkScrollHold();
  bookmarkScrollbarState.holdDirection = direction;
  bookmarkScrollbarState.holdTickFn = tickFn;
  runBookmarkScrollHoldTick();
  bookmarkScrollbarState.holdTimeoutId = window.setTimeout(() => {
    bookmarkScrollbarState.holdIntervalId = window.setInterval(() => {
      runBookmarkScrollHoldTick();
    }, BOOKMARK_SCROLLBAR_METRICS.holdIntervalMs);
  }, BOOKMARK_SCROLLBAR_METRICS.holdInitialDelayMs);
}

function getBookmarkScrollbarGeometry() {
  const list = document.getElementById("bookmark-list");
  const track = document.getElementById("bookmark-scrollbar");
  const thumb = document.getElementById("bookmark-scrollbar-thumb");
  if (!list || !track || !thumb) {
    return null;
  }
  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  if (maxScroll <= 0) {
    return null;
  }
  const trackHeight = track.clientHeight;
  const thumbTrackHeight = Math.max(
    0,
    trackHeight -
      BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop -
      BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom,
  );
  if (thumbTrackHeight <= 0) {
    return null;
  }
  const rawThumbHeight = Math.round(
    (list.clientHeight / list.scrollHeight) * thumbTrackHeight,
  );
  const thumbHeight = Math.max(24, Math.min(thumbTrackHeight, rawThumbHeight));
  const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
  const thumbOffset =
    BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop +
    Math.round((list.scrollTop / maxScroll) * maxThumbOffset);
  return {
    list,
    track,
    thumb,
    trackRect: track.getBoundingClientRect(),
    trackHeight,
    maxScroll,
    thumbTop: thumbOffset,
    thumbBottom: thumbOffset + thumbHeight,
  };
}

function getTrackPressDirection(geometry, targetY) {
  if (targetY < geometry.thumbTop) {
    return -1;
  }
  if (targetY > geometry.thumbBottom) {
    return 1;
  }
  return 0;
}

function startBookmarkTrackPressScroll(event) {
  if (bookmarkScrollbarState.dragPointerId !== null || event.button !== 0) {
    return;
  }
  const geometry = getBookmarkScrollbarGeometry();
  if (!geometry) {
    return;
  }
  const targetY = Math.max(
    0,
    Math.min(geometry.trackHeight, event.clientY - geometry.trackRect.top),
  );
  const initialDirection = getTrackPressDirection(geometry, targetY);
  if (initialDirection === 0) {
    return;
  }
  event.preventDefault();
  startBookmarkScrollHold(initialDirection, {
    tickFn: () => {
      const nextGeometry = getBookmarkScrollbarGeometry();
      if (!nextGeometry) {
        return false;
      }
      const currentDirection = getTrackPressDirection(nextGeometry, targetY);
      if (currentDirection === 0) {
        return false;
      }
      const before = nextGeometry.list.scrollTop;
      scrollBookmarkListByPage(currentDirection, { behavior: "auto" });
      return nextGeometry.list.scrollTop !== before;
    },
  });
}

function getBookmarkScrollbarDragRange() {
  const list = document.getElementById("bookmark-list");
  const track = document.getElementById("bookmark-scrollbar");
  const thumb = document.getElementById("bookmark-scrollbar-thumb");
  if (!list || !track || !thumb) {
    return null;
  }
  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  if (maxScroll <= 0) {
    return null;
  }
  const trackHeight = track.clientHeight;
  const thumbTrackHeight = Math.max(
    0,
    trackHeight -
      BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop -
      BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom,
  );
  const thumbHeight = thumb.offsetHeight || 0;
  const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
  if (maxThumbOffset <= 0) {
    return null;
  }
  return {
    list,
    maxScroll,
    maxThumbOffset,
  };
}

function handleBookmarkThumbPointerDown(event) {
  const thumb = document.getElementById("bookmark-scrollbar-thumb");
  if (!thumb || event.button !== 0) {
    return;
  }
  const dragRange = getBookmarkScrollbarDragRange();
  if (!dragRange) {
    return;
  }
  event.preventDefault();
  stopBookmarkScrollHold();
  bookmarkScrollbarState.dragPointerId = event.pointerId;
  bookmarkScrollbarState.dragStartY = event.clientY;
  bookmarkScrollbarState.dragStartScrollTop = dragRange.list.scrollTop;
  thumb.classList.add("is-dragging");
  thumb.setPointerCapture(event.pointerId);
}

function handleBookmarkThumbPointerMove(event) {
  if (bookmarkScrollbarState.dragPointerId !== event.pointerId) {
    return;
  }
  const dragRange = getBookmarkScrollbarDragRange();
  if (!dragRange) {
    return;
  }
  event.preventDefault();
  const deltaY = event.clientY - bookmarkScrollbarState.dragStartY;
  const scrollDelta = (deltaY / dragRange.maxThumbOffset) * dragRange.maxScroll;
  const nextScrollTop = Math.max(
    0,
    Math.min(
      dragRange.maxScroll,
      bookmarkScrollbarState.dragStartScrollTop + scrollDelta,
    ),
  );
  dragRange.list.scrollTop = nextScrollTop;
}

function stopBookmarkThumbDrag(pointerId = null) {
  if (
    bookmarkScrollbarState.dragPointerId === null ||
    (pointerId !== null && pointerId !== bookmarkScrollbarState.dragPointerId)
  ) {
    return;
  }
  const thumb = document.getElementById("bookmark-scrollbar-thumb");
  if (thumb && bookmarkScrollbarState.dragPointerId !== null) {
    try {
      thumb.releasePointerCapture(bookmarkScrollbarState.dragPointerId);
    } catch {
      // ignored
    }
    thumb.classList.remove("is-dragging");
  }
  bookmarkScrollbarState.dragPointerId = null;
  bookmarkScrollbarState.dragStartY = 0;
  bookmarkScrollbarState.dragStartScrollTop = 0;
}

function updateBookmarkListScrollbar() {
  const list = document.getElementById("bookmark-list");
  const track = document.getElementById("bookmark-scrollbar");
  const thumb = document.getElementById("bookmark-scrollbar-thumb");
  const upArrow = document.getElementById("bookmark-scroll-up");
  const downArrow = document.getElementById("bookmark-scroll-down");
  if (!list || !track || !thumb || !upArrow || !downArrow) {
    return;
  }

  const listRect = list.getBoundingClientRect();
  const trackWidth = 8;
  const trackInset = BOOKMARK_SCROLLBAR_METRICS.trackInset;
  const trackHeight = Math.max(0, Math.round(listRect.height - trackInset * 2));
  const rawTrackLeft = Math.round(listRect.right + 28);
  const trackTop = Math.round(listRect.top + trackInset);

  const maxScroll = list.scrollHeight - list.clientHeight;
  if (maxScroll <= 0 || trackHeight <= 20) {
    track.classList.add("hidden");
    upArrow.classList.add("hidden");
    downArrow.classList.add("hidden");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  track.classList.remove("hidden");
  upArrow.classList.remove("hidden");
  downArrow.classList.remove("hidden");
  const trackVisualWidth = track.offsetWidth || trackWidth;
  const maxTrackLeft = window.innerWidth - trackVisualWidth - 4;
  const trackLeft = Math.min(rawTrackLeft, maxTrackLeft);
  track.style.top = `${trackTop}px`;
  track.style.left = `${trackLeft}px`;
  track.style.height = `${trackHeight}px`;
  const arrowWidth = upArrow.offsetWidth || 16;
  const arrowHeight = upArrow.offsetHeight || 14;
  const arrowLeft = Math.round(
    trackLeft + trackVisualWidth / 2 - arrowWidth / 2,
  );
  upArrow.style.left = `${arrowLeft - 2}px`;
  downArrow.style.left = `${arrowLeft - 2}px`;
  upArrow.style.top = `${Math.round(trackTop - arrowHeight)}px`;
  downArrow.style.top = `${Math.round(trackTop + trackHeight - 2)}px`;
  const thumbInsetTop = BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop;
  const thumbInsetBottom = BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom;
  const thumbTrackHeight = Math.max(
    0,
    trackHeight - thumbInsetTop - thumbInsetBottom,
  );
  if (thumbTrackHeight <= 0) {
    track.classList.add("hidden");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }
  const rawThumbHeight = Math.round(
    (list.clientHeight / list.scrollHeight) * thumbTrackHeight,
  );
  const thumbHeight = Math.max(24, Math.min(thumbTrackHeight, rawThumbHeight));
  const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
  const thumbOffset =
    thumbInsetTop + Math.round((list.scrollTop / maxScroll) * maxThumbOffset);
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${thumbOffset}px)`;
}

function updateMainLayoutMetrics() {
  const root = document.documentElement;
  const bottomStatus = document.querySelector(".bottom-status");
  const panelHead = document.querySelector(".bookmark-panel-head");
  const footerHeight = Math.ceil(
    bottomStatus?.getBoundingClientRect().height || 56,
  );
  const headHeight = Math.ceil(panelHead?.getBoundingClientRect().height || 44);
  root.style.setProperty("--bottom-status-space", `${footerHeight + 18}px`);
  root.style.setProperty("--bookmark-head-height", `${headHeight}px`);
  updateBookmarkListScrollbar();
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
      window.setTimeout(
        updateBookmarkListScrollbar,
        FOLDER_TOGGLE_ANIM_MS + 20,
      );
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

const configState = {
  tested: false,
  directoryUrl: "",
  files: [],
};

function setConfigStatus(message, type) {
  const statusEl = document.getElementById("cfg-status");
  updateStatusElement(statusEl, "sync-status", message, type);
  if (message && (type === "success" || type === "error")) {
    showTopToast(message, type);
  }
}

function setEditorStatus(message, type) {
  const statusEl = document.getElementById("editor-status");
  updateStatusElement(statusEl, "sync-status", message, type);
  if (message && (type === "success" || type === "error")) {
    showTopToast(message, type);
  }
}

function normalizeFileName(fileName) {
  const value = (fileName || "").trim();
  if (!value) {
    return "bookmarks.html";
  }
  return value.toLowerCase().endsWith(".html") ? value : `${value}.html`;
}

function formatFileSize(sizeValue) {
  const bytes = Number.parseInt(sizeValue, 10);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const text = value >= 100 ? value.toFixed(0) : value.toFixed(2);
  return `${text.replace(/\.?0+$/, "")} ${units[unitIndex]}`;
}

function formatLastModifiedParts(lastModifiedValue) {
  const date = new Date(lastModifiedValue);
  if (!lastModifiedValue || Number.isNaN(date.getTime())) {
    return {
      dateText: "---- -- --",
      timeText: "--:--:--",
    };
  }
  const pad = (n) => String(n).padStart(2, "0");
  return {
    dateText: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    timeText: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

function buildFileMetaHtml(file) {
  const sizeText = formatFileSize(file?.size);
  const { dateText, timeText } = formatLastModifiedParts(file?.lastModified);
  return `<span class="file-size">${sizeText}</span><span class="file-datetime"><span>${dateText}</span><span>${timeText}</span></span>`;
}

function renderConfigFileList(files, selectedName) {
  const container = document.getElementById("cfg-files");
  container.innerHTML = "";

  const createOption = document.createElement("div");
  createOption.className = "file-item";
  createOption.innerHTML = `<label><input type="radio" name="cfg-file-select" value="__new__"><span>${t("createNewFile")}</span></label>`;
  container.appendChild(createOption);

  for (const file of files) {
    const item = document.createElement("div");
    item.className = "file-item";

    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "cfg-file-select";
    radio.value = file.name;

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;

    label.append(radio, name);
    item.appendChild(label);

    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.innerHTML = buildFileMetaHtml(file);
    item.appendChild(meta);

    container.appendChild(item);
  }

  const target = selectedName || "bookmarks.html";
  const radios = container.querySelectorAll('input[name="cfg-file-select"]');
  let matched = false;

  for (const radio of radios) {
    if (radio.value === target) {
      radio.checked = true;
      matched = true;
      break;
    }
  }

  if (!matched) {
    const newRadio = container.querySelector('input[value="__new__"]');
    if (newRadio) {
      newRadio.checked = true;
    }
  }
}

function getSelectedConfigFileName() {
  const checked = document.querySelector(
    'input[name="cfg-file-select"]:checked',
  );
  if (!checked) {
    return "";
  }

  if (checked.value === "__new__") {
    return normalizeFileName(
      document.getElementById("cfg-new-file-name").value,
    );
  }

  return checked.value;
}

function invalidateConfigTest() {
  configState.tested = false;
  configState.directoryUrl = "";
  configState.files = [];
  const section = document.getElementById("cfg-file-section");
  section.classList.remove("is-open");
}

const MODAL_ANIM_MS = 180;
const modalCloseTimers = new WeakMap();
let topToastTimer = null;
let topToastHideTimer = null;
let topProgressActiveCount = 0;
let topProgressHideTimer = null;

function getTopProgressElements() {
  const progress = document.getElementById("top-progress");
  const bar = progress?.querySelector(".top-progress-bar") || null;
  return { progress, bar };
}

function setTopProgressValue(value) {
  const { progress, bar } = getTopProgressElements();
  if (!progress || !bar) {
    return;
  }
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
  progress.classList.add("is-determinate");
  bar.style.width = `${Math.round(normalized * 100)}%`;
}

function hideTopToast() {
  const toast = document.getElementById("top-toast");
  if (!toast) {
    return;
  }
  if (topToastTimer) {
    window.clearTimeout(topToastTimer);
    topToastTimer = null;
  }
  if (topToastHideTimer) {
    window.clearTimeout(topToastHideTimer);
    topToastHideTimer = null;
  }
  toast.classList.remove("is-open");
  topToastHideTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
    toast.textContent = "";
    toast.classList.remove("success", "error");
    topToastHideTimer = null;
  }, 220);
}

function showTopToast(message, type) {
  const toast = document.getElementById("top-toast");
  if (!toast || !message) {
    return;
  }
  if (topToastTimer) {
    window.clearTimeout(topToastTimer);
    topToastTimer = null;
  }
  if (topToastHideTimer) {
    window.clearTimeout(topToastHideTimer);
    topToastHideTimer = null;
  }

  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  if (type) {
    toast.classList.add(type);
  }
  requestAnimationFrame(() => {
    toast.classList.add("is-open");
  });

  topToastTimer = window.setTimeout(() => {
    hideTopToast();
  }, 3200);
}

function showTopProgress({ mode = "indeterminate", value = 0 } = {}) {
  const { progress, bar } = getTopProgressElements();
  if (!progress) {
    return;
  }
  topProgressActiveCount += 1;
  if (topProgressHideTimer) {
    window.clearTimeout(topProgressHideTimer);
    topProgressHideTimer = null;
  }
  if (mode === "determinate") {
    setTopProgressValue(value);
  } else {
    progress.classList.remove("is-determinate");
    if (bar) {
      bar.style.width = "";
    }
  }
  progress.classList.remove("hidden");
  requestAnimationFrame(() => {
    progress.classList.add("is-active");
  });
}

function updateTopProgress(value) {
  setTopProgressValue(value);
}

function hideTopProgress() {
  const { progress, bar } = getTopProgressElements();
  if (!progress) {
    return;
  }
  topProgressActiveCount = Math.max(0, topProgressActiveCount - 1);
  if (topProgressActiveCount > 0) {
    return;
  }
  progress.classList.remove("is-active");
  if (topProgressHideTimer) {
    window.clearTimeout(topProgressHideTimer);
  }
  topProgressHideTimer = window.setTimeout(() => {
    if (topProgressActiveCount === 0) {
      progress.classList.add("hidden");
      progress.classList.remove("is-determinate");
      if (bar) {
        bar.style.width = "";
      }
    }
    topProgressHideTimer = null;
  }, 160);
}

function clearModalCloseTimer(modal) {
  const activeTimer = modalCloseTimers.get(modal);
  if (activeTimer) {
    window.clearTimeout(activeTimer);
    modalCloseTimers.delete(modal);
  }
}

function openModal(modal) {
  if (!modal) {
    return;
  }
  clearModalCloseTimer(modal);
  modal.classList.remove("hidden", "is-closing");
  requestAnimationFrame(() => {
    modal.classList.add("is-open");
  });
}

function closeModal(modal) {
  if (!modal || modal.classList.contains("hidden")) {
    return;
  }
  clearModalCloseTimer(modal);
  modal.classList.remove("is-open");
  modal.classList.add("is-closing");
  const timer = window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
    modalCloseTimers.delete(modal);
  }, MODAL_ANIM_MS);
  modalCloseTimers.set(modal, timer);
}

async function openConfigModal() {
  const modal = document.getElementById("config-modal");
  openModal(modal);

  const config = await window.YABMSync.getConfig();
  if (!config) {
    return;
  }

  document.getElementById("cfg-directory-url").value =
    config.directoryUrl || "";
  document.getElementById("cfg-username").value = config.username || "";
  document.getElementById("cfg-password").value = config.password || "";
  document.getElementById("cfg-new-file-name").value =
    config.fileName || "bookmarks.html";

  setConfigStatus("", "");
  invalidateConfigTest();
}

function closeConfigModal() {
  const modal = document.getElementById("config-modal");
  closeModal(modal);
}

function openPromptModal({
  title,
  message,
  confirmLabel = t("promptConfirm"),
  cancelLabel = t("cancel"),
}) {
  const modal = document.getElementById("prompt-modal");
  const titleEl = document.getElementById("prompt-title");
  const messageEl = document.getElementById("prompt-message");
  const confirmBtn = document.getElementById("prompt-confirm");
  const cancelBtn = document.getElementById("prompt-cancel");

  titleEl.textContent = title || t("promptNotice");
  messageEl.textContent = message || "";
  confirmBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;

  openModal(modal);

  return new Promise((resolve) => {
    const cleanup = () => {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      closeModal(modal);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function openEditorModal({
  title,
  nameLabel,
  nameValue = "",
  urlValue = "",
  urlVisible = false,
  saveLabel = t("save"),
}) {
  const modal = document.getElementById("editor-modal");
  const titleEl = document.getElementById("editor-title");
  const nameLabelEl = document.getElementById("editor-name-label");
  const nameInput = document.getElementById("editor-name");
  const urlField = document.getElementById("editor-url-field");
  const urlInput = document.getElementById("editor-url");
  const saveBtn = document.getElementById("editor-save");
  const cancelBtn = document.getElementById("editor-cancel");

  titleEl.textContent = title || t("editorEdit");
  nameLabelEl.textContent = nameLabel || t("editorName");
  nameInput.value = nameValue || "";
  urlInput.value = urlVisible ? urlValue || "" : "";
  urlInput.disabled = !urlVisible;
  saveBtn.textContent = saveLabel;
  setEditorStatus("", "");
  urlField.classList.toggle("hidden", !urlVisible);

  openModal(modal);
  window.setTimeout(() => nameInput.focus(), 0);

  return new Promise((resolve) => {
    const cleanup = () => {
      saveBtn.removeEventListener("click", onSave);
      cancelBtn.removeEventListener("click", onCancel);
      nameInput.removeEventListener("keydown", onKeyDown);
      urlInput.removeEventListener("keydown", onKeyDown);
      closeModal(modal);
    };

    const onSave = () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name && !urlVisible) {
        setEditorStatus(t("editorNameRequired"), "error");
        return;
      }
      if (urlVisible && !url) {
        setEditorStatus(t("editorUrlRequired"), "error");
        return;
      }
      cleanup();
      resolve({ name, url: urlVisible ? url : "" });
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSave();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    saveBtn.addEventListener("click", onSave);
    cancelBtn.addEventListener("click", onCancel);
    nameInput.addEventListener("keydown", onKeyDown);
    urlInput.addEventListener("keydown", onKeyDown);
  });
}

async function testConfigConnection() {
  const testBtn = document.getElementById("cfg-test");
  testBtn.disabled = true;
  setConfigStatus(t("testingWebdavConnection"), "");

  try {
    const directoryUrl = document
      .getElementById("cfg-directory-url")
      .value.trim();
    const username = document.getElementById("cfg-username").value.trim();
    const password = document.getElementById("cfg-password").value;

    const result = await window.YABMSync.listDirectoryFiles({
      directoryUrl,
      username,
      password,
    });

    configState.tested = true;
    configState.directoryUrl = result.directoryUrl;
    configState.files = result.files;

    document.getElementById("cfg-file-section").classList.add("is-open");
    renderConfigFileList(
      result.files,
      normalizeFileName(document.getElementById("cfg-new-file-name").value),
    );

    if (!result.files.length) {
      setConfigStatus(t("connSuccessNoFiles"), "success");
    } else {
      setConfigStatus(
        t("connSuccessFoundFiles", [String(result.files.length)]),
        "success",
      );
    }
  } catch (error) {
    invalidateConfigTest();
    setConfigStatus(t("connectionFailed", [error.message]), "error");
  } finally {
    testBtn.disabled = false;
  }
}

async function saveConfigFromModal() {
  if (!configState.tested) {
    setConfigStatus(t("testBeforeSave"), "error");
    return;
  }

  const fileName = getSelectedConfigFileName();
  if (!fileName) {
    setConfigStatus(t("selectOrEnterFile"), "error");
    return;
  }

  const payload = {
    directoryUrl: configState.directoryUrl,
    username: document.getElementById("cfg-username").value.trim(),
    password: document.getElementById("cfg-password").value,
    fileName,
  };

  try {
    await window.YABMSync.saveConfig(payload);
    setConfigStatus(t("configurationSaved"), "success");
    setStatus(t("configurationSaved"), "success");
    closeConfigModal();
    await refreshWebdavStatusBar();
  } catch (error) {
    setConfigStatus(t("saveFailed", [error.message]), "error");
  }
}

async function clearConfigFromModal() {
  const confirmed = await openPromptModal({
    title: t("clearConfigurationTitle"),
    message: t("clearConfigurationMessage"),
    confirmLabel: t("clear"),
    cancelLabel: t("cancel"),
  });
  if (!confirmed) {
    return;
  }

  try {
    await window.YABMSync.clearConfig();
    document.getElementById("cfg-directory-url").value = "";
    document.getElementById("cfg-username").value = "";
    document.getElementById("cfg-password").value = "";
    document.getElementById("cfg-new-file-name").value = "bookmarks.html";
    invalidateConfigTest();
    setConfigStatus(t("configurationCleared"), "success");
    setStatus(t("configurationCleared"), "success");
    await refreshWebdavStatusBar();
  } catch (error) {
    setConfigStatus(t("clearFailed", [error.message]), "error");
  }
}

async function handleUpload() {
  const proceed = await openPromptModal({
    title: t("confirmUploadTitle"),
    message: t("confirmUploadMessage"),
    confirmLabel: t("startUpload"),
    cancelLabel: t("cancel"),
  });
  if (!proceed) {
    return;
  }

  setSyncButtonsDisabled(true);
  setStatus(t("uploadingBookmarks"), "");
  setWebdavStatusIndicator("checking", t("uploadingBookmarks"));
  showTopProgress();

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      setStatus(t("configureWebdavFirst"), "error");
      return;
    }

    await window.YABMSync.uploadBookmarksToWebDav(config);
    setStatus(t("uploadSuccessful", [config.fileName]), "success");
  } catch (error) {
    setStatus(t("uploadFailed", [error.message]), "error");
  } finally {
    setSyncButtonsDisabled(false);
    await refreshWebdavStatusBar();
    hideTopProgress();
  }
}

async function handleDownload() {
  const proceed = await openPromptModal({
    title: t("confirmDownloadTitle"),
    message: t("confirmDownloadMessage"),
    confirmLabel: t("continueDownload"),
    cancelLabel: t("cancel"),
  });
  if (!proceed) {
    return;
  }

  setSyncButtonsDisabled(true);
  setStatus(t("downloadingBookmarks"), "");
  setWebdavStatusIndicator("checking", t("downloadingBookmarks"));
  showTopProgress();

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      setStatus(t("configureWebdavFirst"), "error");
      return;
    }

    await window.YABMSync.downloadBookmarksFromWebDav(config);
    setStatus(t("downloadSuccessful", [config.fileName]), "success");
    await renderBookmarks();
  } catch (error) {
    setStatus(t("downloadFailed", [error.message]), "error");
  } finally {
    setSyncButtonsDisabled(false);
    await refreshWebdavStatusBar();
    hideTopProgress();
  }
}

function getWebdavIndicatorTooltip(text) {
  const detail = (text || "").trim();
  return detail ? `${t("webdavLabel")}: ${detail}` : t("webdavLabel");
}

function setWebdavStatusIndicator(stateKey, tooltipText) {
  const indicator = document.getElementById("webdav-status-indicator");
  const icon = document.getElementById("webdav-status-icon");
  if (!indicator || !icon) {
    return;
  }

  const state =
    WEBDAV_ICON_STATES[stateKey] || WEBDAV_ICON_STATES.notConfigured;
  indicator.classList.remove(...WEBDAV_ICON_STATE_CLASSES);
  indicator.classList.add(state.cssClass);
  indicator.dataset.tooltip = getWebdavIndicatorTooltip(tooltipText);
  indicator.setAttribute("aria-label", indicator.dataset.tooltip);
  indicator.textContent = "";
  indicator.appendChild(icon);
  icon.hidden = false;
  icon.dataset.fallback = state.fallback;
  icon.src = getTwemojiIconSrcByCodepoint(state.codepoint);
}

function setWebdavStatusBarState({
  urlText,
  countText,
  browserCountText,
  refreshDisabled = false,
}) {
  const urlEl = document.getElementById("webdav-url");
  const countEl = document.getElementById("webdav-count");
  const browserCountEl = document.getElementById("browser-count");
  const refreshBtn = document.getElementById("webdav-refresh");

  if (urlEl && typeof urlText === "string") {
    urlEl.textContent = urlText;
    urlEl.dataset.tooltip = urlText;
  }
  if (countEl && typeof countText === "string") {
    countEl.textContent = countText;
  }
  if (browserCountEl && typeof browserCountText === "string") {
    browserCountEl.textContent = browserCountText;
  }
  if (refreshBtn) {
    refreshBtn.disabled = refreshDisabled;
  }
  requestAnimationFrame(updateMainLayoutMetrics);
}

function countBrowserBookmarkEntries(nodes) {
  let total = 0;
  for (const node of nodes || []) {
    if (node.url) {
      total += 1;
      continue;
    }
    total += countBrowserBookmarkEntries(node.children || []);
  }
  return total;
}

async function getBrowserBookmarkEntryCount() {
  const tree = await chrome.bookmarks.getTree();
  return countBrowserBookmarkEntries(tree?.[0]?.children || []);
}

async function refreshWebdavStatusBar({ interactive = false } = {}) {
  const refreshBtn = document.getElementById("webdav-refresh");
  if (refreshBtn) {
    refreshBtn.disabled = true;
  }
  setWebdavStatusIndicator("checking", t("webdavEntriesRefreshing"));

  try {
    const config = await window.YABMSync.getConfig();
    if (!config?.directoryUrl || !config?.fileName) {
      const browserCount = await getBrowserBookmarkEntryCount();
      setWebdavStatusBarState({
        urlText: t("notConfigured"),
        countText: t("webdavEntriesDash"),
        browserCountText: t("browserEntries", [String(browserCount)]),
      });
      setWebdavStatusIndicator("notConfigured", t("notConfigured"));
      return;
    }

    let webdavDisplayUrl = config.directoryUrl;
    try {
      const normalizedDirectoryUrl = window.YABMSync.normalizeDirectoryUrl(
        config.directoryUrl,
      );
      webdavDisplayUrl = config.fileName
        ? window.YABMSync.joinDirectoryAndFile(
            normalizedDirectoryUrl,
            config.fileName,
          )
        : normalizedDirectoryUrl;
    } catch {
      webdavDisplayUrl = config.directoryUrl;
    }

    setWebdavStatusBarState({
      urlText: webdavDisplayUrl,
      countText: t("webdavEntriesRefreshing"),
      browserCountText: t("browserEntriesRefreshing"),
      refreshDisabled: true,
    });

    const [browserCount, webdavEntries] = await Promise.all([
      getBrowserBookmarkEntryCount(),
      window.YABMSync.getWebDavBookmarkEntryCount(
        {
          directoryUrl: config.directoryUrl,
          fileName: config.fileName,
          username: config.username || "",
          password: config.password || "",
        },
        { interactive },
      ),
    ]);

    setWebdavStatusBarState({
      urlText: webdavDisplayUrl,
      countText: t("webdavEntries", [String(webdavEntries)]),
      browserCountText: t("browserEntries", [String(browserCount)]),
    });
    setWebdavStatusIndicator(
      "ready",
      t("webdavEntries", [String(webdavEntries)]),
    );
  } catch (error) {
    const browserCount = await getBrowserBookmarkEntryCount().catch(() => null);
    setWebdavStatusBarState({
      countText: t("webdavEntriesError"),
      browserCountText:
        browserCount === null
          ? t("browserEntriesError")
          : t("browserEntries", [String(browserCount)]),
    });
    setWebdavStatusIndicator("error", t("webdavEntriesError"));
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
    }
  }
}

function setAppVersion() {
  const versionEl = document.getElementById("app-version");
  if (!versionEl) {
    return;
  }
  const version = chrome?.runtime?.getManifest?.().version || "";
  versionEl.textContent = version ? `v${version}` : "v-";
  versionEl.dataset.tooltip = version
    ? t("appVersionTooltipWithValue", [version])
    : t("appVersionTooltip");
}

function bindTreeActions() {
  const expandAllBtn = document.getElementById("expand-all");
  const collapseAllBtn = document.getElementById("collapse-all");
  const openConfigBtn = document.getElementById("open-config");
  const openLanguageMenuBtn = document.getElementById("open-language-menu");
  const languageMenu = document.getElementById("language-menu");
  const closeConfigBtn = document.getElementById("close-config");
  const cancelConfigBtn = document.getElementById("cfg-cancel");
  const configTestBtn = document.getElementById("cfg-test");
  const configSaveBtn = document.getElementById("cfg-save");
  const configClearBtn = document.getElementById("cfg-clear");
  const uploadBtn = document.getElementById("upload-bookmarks");
  const downloadBtn = document.getElementById("download-bookmarks");
  const webdavRefreshBtn = document.getElementById("webdav-refresh");
  const webdavStatusIcon = document.getElementById("webdav-status-icon");
  const bookmarkListEl = document.getElementById("bookmark-list");
  const scrollbarTrack = document.getElementById("bookmark-scrollbar");
  const scrollbarUpBtn = document.getElementById("bookmark-scroll-up");
  const scrollbarDownBtn = document.getElementById("bookmark-scroll-down");
  const scrollbarThumb = document.getElementById("bookmark-scrollbar-thumb");
  const topToast = document.getElementById("top-toast");
  const sortMenu = document.getElementById("folder-sort-menu");
  const treeContextMenu = document.getElementById("tree-context-menu");
  const editContextMenu = document.getElementById("edit-context-menu");
  const appTooltip = document.getElementById("app-tooltip");
  const sortAscBtn = document.getElementById("sort-asc");
  const sortDescBtn = document.getElementById("sort-desc");
  let tooltipTarget = null;
  let languageMenuOpen = false;

  webdavStatusIcon?.addEventListener("error", () => {
    const indicator = document.getElementById("webdav-status-indicator");
    if (!indicator) {
      return;
    }
    indicator.textContent = webdavStatusIcon.dataset.fallback || "?";
  });

  const closeLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    languageMenu.classList.add("hidden");
    languageMenuOpen = false;
  };

  const positionLanguageMenu = () => {
    if (!languageMenu || !openLanguageMenuBtn) {
      return;
    }
    const rect = openLanguageMenuBtn.getBoundingClientRect();
    const width = languageMenu.offsetWidth || 220;
    const left = Math.min(
      window.innerWidth - width - 10,
      Math.max(10, rect.right - width),
    );
    const top = Math.min(window.innerHeight - 10, rect.bottom + 8);
    languageMenu.style.left = `${left}px`;
    languageMenu.style.top = `${top}px`;
  };

  const updateLanguageButtonTooltip = () => {
    if (!openLanguageMenuBtn) {
      return;
    }
    const preferred = window.YABMI18n.getLanguagePreference();
    openLanguageMenuBtn.dataset.tooltip = t("languageCurrentTooltip", [
      getLanguageOptionLabel(preferred),
    ]);
  };

  const updatePageLanguage = async (language) => {
    await window.YABMI18n.setLanguagePreference(language);
    window.YABMI18n.apply();
    renderLanguageMenu();
    setAppVersion();
    await rerenderAfterTreeChange();
  };

  const renderLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    const preferred = window.YABMI18n.getLanguagePreference();
    languageMenu.innerHTML = "";
    for (const option of LANGUAGE_OPTIONS) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sort-menu-item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute(
        "aria-checked",
        preferred === option.value ? "true" : "false",
      );
      if (preferred === option.value) {
        item.classList.add("language-menu-item-active");
      }
      const flagClass =
        option.value === window.YABMI18n.AUTO_LANGUAGE
          ? "language-item-flag language-item-flag-auto"
          : "language-item-flag language-item-flag-country";
      item.innerHTML =
        `<span class="sort-menu-icon ${flagClass}" aria-hidden="true"><img class="language-flag-img" alt="" src="${getFlagIconSrc(option.flag || "🌐")}" data-fallback="${option.flag || "🌐"}" /></span>` +
        `<span>${option.label}</span>` +
        (preferred === option.value
          ? '<span class="language-item-check icon-font" aria-hidden="true">check</span>'
          : "");
      const flagImg = item.querySelector(".language-flag-img");
      if (flagImg) {
        flagImg.addEventListener("error", () => {
          const fallback = flagImg.dataset.fallback || "🌐";
          const holder = flagImg.closest(".language-item-flag");
          if (holder) {
            holder.textContent = fallback;
          }
        });
      }
      item.addEventListener("click", async () => {
        closeLanguageMenu();
        try {
          await updatePageLanguage(option.value);
        } catch (error) {
          setStatus(t("initializationFailed", [error.message]), "error");
        }
      });
      languageMenu.appendChild(item);
    }
    updateLanguageButtonTooltip();
  };

  const openLanguageMenu = () => {
    if (!languageMenu) {
      return;
    }
    renderLanguageMenu();
    languageMenu.classList.remove("hidden");
    languageMenuOpen = true;
    positionLanguageMenu();
  };

  const hideAppTooltip = () => {
    if (!appTooltip) {
      return;
    }
    appTooltip.classList.add("hidden");
    appTooltip.textContent = "";
    tooltipTarget = null;
  };

  const positionAppTooltip = (x, y) => {
    if (!appTooltip || appTooltip.classList.contains("hidden")) {
      return;
    }
    const width = appTooltip.offsetWidth || 180;
    const height = appTooltip.offsetHeight || 36;
    const offset = 12;
    const left = Math.min(
      window.innerWidth - width - 10,
      Math.max(10, x + offset),
    );
    const top = Math.min(
      window.innerHeight - height - 10,
      Math.max(10, y + offset),
    );
    appTooltip.style.left = `${left}px`;
    appTooltip.style.top = `${top}px`;
  };

  const showAppTooltip = (target, x, y) => {
    if (!appTooltip) {
      return;
    }
    const text = target?.dataset?.tooltip?.trim();
    if (!text) {
      hideAppTooltip();
      return;
    }
    tooltipTarget = target;
    appTooltip.textContent = text;
    appTooltip.classList.remove("hidden");
    positionAppTooltip(x, y);
  };

  expandAllBtn?.addEventListener("click", () => setAllFoldersOpen(true));
  collapseAllBtn?.addEventListener("click", () => setAllFoldersOpen(false));

  openConfigBtn?.addEventListener("click", openConfigModal);
  openLanguageMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (languageMenuOpen) {
      closeLanguageMenu();
    } else {
      openLanguageMenu();
    }
  });
  closeConfigBtn?.addEventListener("click", closeConfigModal);
  cancelConfigBtn?.addEventListener("click", closeConfigModal);
  configTestBtn?.addEventListener("click", testConfigConnection);
  configSaveBtn?.addEventListener("click", saveConfigFromModal);
  configClearBtn?.addEventListener("click", clearConfigFromModal);

  const invalidateInputs = [
    "cfg-directory-url",
    "cfg-username",
    "cfg-password",
  ];
  for (const id of invalidateInputs) {
    const el = document.getElementById(id);
    el?.addEventListener("input", invalidateConfigTest);
  }

  document
    .getElementById("cfg-new-file-name")
    ?.addEventListener("input", () => {
      const newRadio = document.querySelector('input[value="__new__"]');
      if (newRadio) {
        newRadio.checked = true;
      }
    });

  uploadBtn?.addEventListener("click", handleUpload);
  downloadBtn?.addEventListener("click", handleDownload);
  webdavRefreshBtn?.addEventListener("click", () =>
    refreshWebdavStatusBar({ interactive: true }),
  );
  scrollbarUpBtn?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    startBookmarkScrollHold(-1);
  });
  scrollbarDownBtn?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    startBookmarkScrollHold(1);
  });
  scrollbarUpBtn?.addEventListener("pointerup", stopBookmarkScrollHold);
  scrollbarDownBtn?.addEventListener("pointerup", stopBookmarkScrollHold);
  scrollbarUpBtn?.addEventListener("pointercancel", stopBookmarkScrollHold);
  scrollbarDownBtn?.addEventListener("pointercancel", stopBookmarkScrollHold);
  scrollbarUpBtn?.addEventListener("click", (event) => event.preventDefault());
  scrollbarDownBtn?.addEventListener("click", (event) =>
    event.preventDefault(),
  );
  scrollbarTrack?.addEventListener("pointerdown", (event) => {
    if (
      scrollbarThumb &&
      event.target &&
      scrollbarThumb.contains(event.target)
    ) {
      return;
    }
    startBookmarkTrackPressScroll(event);
  });
  scrollbarThumb?.addEventListener(
    "pointerdown",
    handleBookmarkThumbPointerDown,
  );
  scrollbarThumb?.addEventListener("dragstart", (event) =>
    event.preventDefault(),
  );
  bookmarkListEl?.addEventListener("scroll", updateBookmarkListScrollbar, {
    passive: true,
  });
  bookmarkListEl?.addEventListener("dragover", (event) => {
    if (!dragState.nodeId) {
      return;
    }
    const folder = event.target?.closest?.(".folder");
    if (!folder) {
      return;
    }
    const folderId = folder.dataset.folderId;
    // Skip if target is the source's own parent folder
    if (String(folderId) === String(dragState.parentId)) {
      return;
    }
    // Skip if dragging a folder into its own descendant
    if (dragState.nodeType === "folder" && folder.contains(document.querySelector(`[data-folder-id="${dragState.nodeId}"]`))) {
      return;
    }
    if (!folder.classList.contains("drag-over")) {
      clearFolderDragOverStyles();
      folder.classList.add("drag-over");
    }
  });
  if (!bookmarkScrollbarState.globalEventsBound) {
    bookmarkScrollbarState.globalEventsBound = true;
    document.addEventListener("pointermove", handleBookmarkThumbPointerMove);
    document.addEventListener("pointerup", (event) => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag(event.pointerId);
    });
    document.addEventListener("pointercancel", (event) => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag(event.pointerId);
    });
    window.addEventListener("blur", () => {
      stopBookmarkScrollHold();
      stopBookmarkThumbDrag();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopBookmarkScrollHold();
        stopBookmarkThumbDrag();
      }
    });
  }

  sortAscBtn?.addEventListener("click", async () => {
    if (!sortMenuContext?.folderId) {
      closeSortMenu();
      return;
    }
    const folderId = sortMenuContext.folderId;
    closeSortMenu();
    try {
      await sortFolderChildren(folderId, false);
      setStatus(t("folderSortedAsc"), "success");
      await rerenderAfterTreeChange([folderId]);
    } catch (error) {
      setStatus(t("sortFailed", [error.message]), "error");
    }
  });

  sortDescBtn?.addEventListener("click", async () => {
    if (!sortMenuContext?.folderId) {
      closeSortMenu();
      return;
    }
    const folderId = sortMenuContext.folderId;
    closeSortMenu();
    try {
      await sortFolderChildren(folderId, true);
      setStatus(t("folderSortedDesc"), "success");
      await rerenderAfterTreeChange([folderId]);
    } catch (error) {
      setStatus(t("sortFailed", [error.message]), "error");
    }
  });

  document.addEventListener("click", (event) => {
    if (
      editContextMenuOpen &&
      editContextMenu &&
      !editContextMenu.contains(event.target)
    ) {
      closeEditContextMenu();
    }

    if (
      treeContextMenuOpen &&
      treeContextMenu &&
      !treeContextMenu.contains(event.target)
    ) {
      closeTreeContextMenu();
    }

    if (languageMenuOpen) {
      const inLanguageMenu = Boolean(
        (languageMenu && languageMenu.contains(event.target)) ||
        (openLanguageMenuBtn && openLanguageMenuBtn.contains(event.target)),
      );
      if (!inLanguageMenu) {
        closeLanguageMenu();
      }
    }

    if (!sortMenu || sortMenu.classList.contains("hidden")) {
      return;
    }
    if (sortMenu.contains(event.target)) {
      return;
    }
    closeSortMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEditContextMenu();
      closeTreeContextMenu();
      closeSortMenu();
      closeLanguageMenu();
      hideAppTooltip();
    }
  });
  window.addEventListener("resize", () => {
    closeEditContextMenu();
    closeLanguageMenu();
    hideAppTooltip();
    updateMainLayoutMetrics();
  });
  window.addEventListener("scroll", closeEditContextMenu, true);
  window.addEventListener("resize", closeTreeContextMenu);
  window.addEventListener(
    "scroll",
    () => {
      closeTreeContextMenu();
      closeLanguageMenu();
      hideAppTooltip();
    },
    true,
  );

  document.addEventListener("mouseover", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      return;
    }
    showAppTooltip(target, event.clientX, event.clientY);
  });

  document.addEventListener("mousemove", (event) => {
    if (!tooltipTarget) {
      return;
    }
    positionAppTooltip(event.clientX, event.clientY);
  });

  document.addEventListener("mouseout", (event) => {
    if (!tooltipTarget) {
      return;
    }
    const related = event.relatedTarget;
    if (related && tooltipTarget.contains(related)) {
      return;
    }
    if (event.target && tooltipTarget.contains(event.target)) {
      hideAppTooltip();
    }
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    showAppTooltip(target, rect.left + rect.width / 2, rect.bottom);
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (tooltipTarget && target && tooltipTarget.contains(target)) {
      hideAppTooltip();
    }
  });

  topToast?.addEventListener("click", hideTopToast);

  bookmarkListEl?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const target = event.target;
    const hasNodeMenu = Boolean(
      target &&
      typeof target.closest === "function" &&
      (target.closest(".folder-header") || target.closest(".bookmark-row")),
    );
    if (!hasNodeMenu) {
      closeTreeContextMenu();
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (isEditableTarget(target)) {
      event.preventDefault();
      openEditContextMenu(target, event.clientX, event.clientY);
      return;
    }
    const isInsideTree = Boolean(
      target &&
      typeof target.closest === "function" &&
      target.closest("#bookmark-list"),
    );
    if (!isInsideTree) {
      event.preventDefault();
    }
  });

  updateLanguageButtonTooltip();
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

async function initPage() {
  await window.YABMI18n.init();
  window.YABMI18n.apply();
  bindTreeActions();
  updateMainLayoutMetrics();
  bindBookmarkTreeObservers();
  setAppVersion();
  await refreshWebdavStatusBar();
  await renderBookmarks();
  updateMainLayoutMetrics();
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get("openConfig") === "1") {
    currentUrl.searchParams.delete("openConfig");
    window.history.replaceState(
      null,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
    await openConfigModal();
  }
}

initPage().catch((error) => {
  const container = document.getElementById("bookmark-list");
  container.innerHTML = `<div class="empty">${t("loadBookmarksFailed", [error.message])}</div>`;
});
