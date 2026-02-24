(function initYABMSync() {
  const t = (key, substitutions) =>
    window.YABMI18n?.t(key, substitutions) ||
    chrome.i18n.getMessage(key, substitutions) ||
    key;
  const WEBDAV_LIST_BODY =
    '<?xml version="1.0" encoding="utf-8" ?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/>' +
    "<d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>";

  function getConfig() {
    return chrome.storage.local
      .get(["webdavConfig"])
      .then((data) => data.webdavConfig || null);
  }

  function saveConfig(config) {
    return chrome.storage.local.set({ webdavConfig: config });
  }

  function clearConfig() {
    return chrome.storage.local.remove("webdavConfig");
  }

  function createAuthHeader(username, password) {
    if (!username) {
      return null;
    }
    const rawAuth = `${username}:${password || ""}`;
    const bytes = new TextEncoder().encode(rawAuth);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const token = btoa(binary);
    return `Basic ${token}`;
  }

  function buildOriginPermissionPattern(rawUrl) {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}/*`;
  }

  async function ensureHostPermission(rawUrl, { interactive = true } = {}) {
    if (!chrome?.permissions?.contains) {
      return;
    }

    const origins = [buildOriginPermissionPattern(rawUrl)];
    const hasPermission = await chrome.permissions.contains({ origins });
    if (hasPermission) {
      return;
    }

    if (!interactive || !chrome?.permissions?.request) {
      throw new Error(t("hostPermissionRequired", [origins[0]]));
    }

    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      throw new Error(t("hostPermissionDenied", [origins[0]]));
    }
  }

  function normalizeDirectoryUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new Error(t("invalidUrlFormat"));
    }

    if (parsed.protocol !== "https:") {
      throw new Error(t("webdavMustUseHttps"));
    }

    // Avoid browser-managed HTTP auth prompts from URL-embedded credentials.
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";

    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }

    return parsed.toString();
  }

  function joinDirectoryAndFile(directoryUrl, fileName) {
    const cleanName = (fileName || "").trim().replace(/^\/+/, "");
    if (!cleanName) {
      throw new Error(t("fileNameEmpty"));
    }
    if (cleanName.includes("/")) {
      throw new Error(t("fileNameNoPathSeparators"));
    }
    return new URL(cleanName, directoryUrl).toString();
  }

  async function webDavRequest(url, method, options) {
    const headers = new Headers(options?.headers || {});
    const authHeader = createAuthHeader(options?.username, options?.password);
    if (authHeader) {
      headers.set("Authorization", authHeader);
    }

    return fetch(url, {
      method,
      headers,
      body: options?.body,
      credentials: "omit",
    });
  }

  function getElementsByLocalName(root, localName) {
    return Array.from(root.getElementsByTagName("*")).filter(
      (el) => el.localName === localName,
    );
  }

  function getFirstTextByLocalName(root, localName) {
    const node = getElementsByLocalName(root, localName)[0];
    return node ? node.textContent || "" : "";
  }

  function responseIsCollection(responseEl) {
    const resourcetype = getElementsByLocalName(responseEl, "resourcetype")[0];
    if (!resourcetype) {
      return false;
    }
    return getElementsByLocalName(resourcetype, "collection").length > 0;
  }

  function decodeHref(hrefText) {
    try {
      return decodeURIComponent(hrefText);
    } catch {
      return hrefText;
    }
  }

  function hrefToPathname(hrefText, fallbackBase) {
    try {
      return new URL(hrefText, fallbackBase).pathname;
    } catch {
      return hrefText;
    }
  }

  function parsePropfindResponse(xmlText, directoryUrl) {
    const parsed = new DOMParser().parseFromString(xmlText, "text/xml");
    const responses = getElementsByLocalName(parsed, "response");
    if (!responses.length) {
      throw new Error(t("parseWebdavResponseFailed"));
    }

    const dirPath = new URL(directoryUrl).pathname.replace(/\/+$/, "/");
    let dirIsCollection = false;
    const files = [];

    for (const responseEl of responses) {
      const hrefText = getFirstTextByLocalName(responseEl, "href");
      if (!hrefText) {
        continue;
      }

      const decodedHref = decodeHref(hrefText.trim());
      const hrefPath = hrefToPathname(decodedHref, directoryUrl);
      const normalizedPath = hrefPath.replace(/\/+$/, "/");
      const isCollection = responseIsCollection(responseEl);

      if (normalizedPath === dirPath) {
        dirIsCollection = isCollection;
        continue;
      }

      if (isCollection) {
        continue;
      }

      const leaf = hrefPath.split("/").filter(Boolean).pop() || "";
      if (!leaf) {
        continue;
      }

      files.push({
        name: decodeHref(leaf),
        href: new URL(leaf, directoryUrl).toString(),
        size: getFirstTextByLocalName(responseEl, "getcontentlength"),
        lastModified: getFirstTextByLocalName(responseEl, "getlastmodified"),
      });
    }

    if (!dirIsCollection) {
      throw new Error(t("urlNotWebdavDirectory"));
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function listDirectoryFiles(input, requestOptions = {}) {
    const directoryUrl = normalizeDirectoryUrl(input.directoryUrl);
    await ensureHostPermission(directoryUrl, {
      interactive: requestOptions.interactive !== false,
    });
    const response = await webDavRequest(directoryUrl, "PROPFIND", {
      username: input.username,
      password: input.password,
      headers: {
        Depth: "1",
        "Content-Type": "text/xml; charset=utf-8",
      },
      body: WEBDAV_LIST_BODY,
    });

    if (response.status !== 207 && response.status !== 200) {
      throw new Error(t("connectionFailedHttp", [String(response.status)]));
    }

    const xmlText = await response.text();
    const files = parsePropfindResponse(xmlText, directoryUrl);

    return {
      directoryUrl,
      files,
    };
  }

  function escapeHtml(text) {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bookmarksNodesToHtml(nodes, depth) {
    const indent = "  ".repeat(depth);
    let out = `${indent}<DL><p>\n`;

    for (const node of nodes || []) {
      if (node.url) {
        out += `${indent}  <DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title || node.url)}</A>\n`;
      } else if (node.children) {
        out += `${indent}  <DT><H3>${escapeHtml(node.title || t("unnamedFolder"))}</H3>\n`;
        out += bookmarksNodesToHtml(node.children, depth + 1);
      }
    }

    out += `${indent}</DL><p>\n`;
    return out;
  }

  async function exportBookmarksHtml() {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];
    const lines = [
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      "<TITLE>Bookmarks</TITLE>",
      "<H1>Bookmarks</H1>",
      "<DL><p>",
    ];

    for (const root of roots) {
      lines.push(`  <DT><H3>${escapeHtml(root.title || t("rootFolder"))}</H3>`);
      lines.push(bookmarksNodesToHtml(root.children || [], 2).trimEnd());
    }

    lines.push("</DL><p>");
    return `${lines.join("\n")}\n`;
  }

  function isBookmarkBarName(name) {
    const text = (name || "").toLowerCase();
    return (
      text.includes("bookmark bar") ||
      text.includes("bookmarks bar") ||
      text.includes("favorites bar")
    );
  }

  function isOtherBookmarksName(name) {
    const text = (name || "").toLowerCase();
    return text.includes("other bookmarks") || text.includes("other favorites");
  }

  function isMobileBookmarksName(name) {
    const text = (name || "").toLowerCase();
    return text.includes("mobile bookmarks") || text.includes("mobile");
  }

  function parseDlElement(dlEl) {
    const items = [];
    let cursor = dlEl.firstElementChild;

    while (cursor) {
      if (cursor.tagName === "DT") {
        const folderEl = cursor.querySelector(":scope > H3");
        const linkEl = cursor.querySelector(":scope > A");

        if (folderEl) {
          // Different bookmark exporters may place nested <DL> either inside
          // the current <DT> or as the next sibling of <DT>.
          const childDl = cursor.querySelector(":scope > DL");
          let sibling = cursor.nextElementSibling;
          while (sibling && sibling.tagName === "P") {
            sibling = sibling.nextElementSibling;
          }
          const siblingDl =
            sibling && sibling.tagName === "DL" ? sibling : null;
          const nestedDl = childDl || siblingDl;
          const folderNode = {
            title: folderEl.textContent || t("unnamedFolder"),
            children: nestedDl ? parseDlElement(nestedDl) : [],
          };

          if (folderEl.hasAttribute("PERSONAL_TOOLBAR_FOLDER")) {
            folderNode.target = "toolbar";
          }
          if (folderEl.hasAttribute("UNFILED_BOOKMARKS_FOLDER")) {
            folderNode.target = "other";
          }
          if (folderEl.hasAttribute("MOBILE_BOOKMARKS_FOLDER")) {
            folderNode.target = "mobile";
          }

          items.push(folderNode);
        } else if (linkEl) {
          const href = linkEl.getAttribute("HREF") || "";
          if (href) {
            items.push({
              title: linkEl.textContent || href,
              url: href,
            });
          }
        }
      }
      cursor = cursor.nextElementSibling;
    }

    return items;
  }

  function parseBookmarksHtml(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const rootDl = doc.querySelector("DL");
    if (!rootDl) {
      throw new Error(
        t("downloadedFileInvalidBookmarks"),
      );
    }
    return parseDlElement(rootDl);
  }

  function countImportedEntries(nodes) {
    let total = 0;
    for (const node of nodes || []) {
      total += 1;
      if (!node.url) {
        total += countImportedEntries(node.children || []);
      }
    }
    return total;
  }

  function countBookmarkUrlEntries(nodes) {
    let total = 0;
    for (const node of nodes || []) {
      if (node.url) {
        total += 1;
        continue;
      }
      total += countBookmarkUrlEntries(node.children || []);
    }
    return total;
  }

  async function clearFolderChildren(folderId) {
    const children = await chrome.bookmarks.getChildren(folderId);
    for (const child of children) {
      if (child.url) {
        await chrome.bookmarks.remove(child.id);
      } else {
        await chrome.bookmarks.removeTree(child.id);
      }
    }
  }

  async function createNode(parentId, node) {
    if (node.url) {
      await chrome.bookmarks.create({
        parentId,
        title: node.title || node.url,
        url: node.url,
      });
      return;
    }

    const folder = await chrome.bookmarks.create({
      parentId,
      title: node.title || t("unnamedFolder"),
    });

    for (const child of node.children || []) {
      await createNode(folder.id, child);
    }
  }

  function cloneBookmarkNodes(nodes) {
    return (nodes || []).map((node) => {
      if (node.url) {
        return {
          title: node.title || node.url,
          url: node.url,
        };
      }

      return {
        title: node.title || t("unnamedFolder"),
        children: cloneBookmarkNodes(node.children || []),
      };
    });
  }

  async function snapshotRootChildren(rootChildren) {
    const snapshot = {};
    for (const folder of rootChildren) {
      const subtree = await chrome.bookmarks.getSubTree(folder.id);
      snapshot[folder.id] = cloneBookmarkNodes(subtree[0]?.children || []);
    }
    return snapshot;
  }

  async function restoreRootChildren(rootChildren, snapshot) {
    for (const folder of rootChildren) {
      await clearFolderChildren(folder.id);
      for (const node of snapshot[folder.id] || []) {
        await createNode(folder.id, node);
      }
    }
  }

  function resolveRootIds(rootChildren) {
    const result = {
      toolbar: rootChildren[0]?.id || null,
      other: rootChildren[1]?.id || rootChildren[0]?.id || null,
      mobile:
        rootChildren[2]?.id ||
        rootChildren[1]?.id ||
        rootChildren[0]?.id ||
        null,
    };

    for (const folder of rootChildren) {
      if (isBookmarkBarName(folder.title)) {
        result.toolbar = folder.id;
      } else if (isOtherBookmarksName(folder.title)) {
        result.other = folder.id;
      } else if (isMobileBookmarksName(folder.title)) {
        result.mobile = folder.id;
      }
    }

    return result;
  }

  async function overwriteWithBookmarksHtml(htmlText) {
    const importedNodes = parseBookmarksHtml(htmlText);
    const tree = await chrome.bookmarks.getTree();
    const rootChildren = tree[0]?.children || [];
    if (!rootChildren.length) {
      throw new Error(t("bookmarkRootNotFound"));
    }
    if (!importedNodes.length || countImportedEntries(importedNodes) === 0) {
      throw new Error(
        t("downloadedFileNoEntries"),
      );
    }

    const rootIds = resolveRootIds(rootChildren);
    const backupSnapshot = await snapshotRootChildren(rootChildren);
    let hasClearedRoots = false;

    try {
      for (const folder of rootChildren) {
        await clearFolderChildren(folder.id);
      }
      hasClearedRoots = true;

      for (const node of importedNodes) {
        let parentId = rootIds.toolbar;

        if (!node.url) {
          if (node.target === "other") {
            parentId = rootIds.other;
          } else if (node.target === "mobile") {
            parentId = rootIds.mobile;
          } else if (
            node.target === "toolbar" ||
            isBookmarkBarName(node.title) ||
            isOtherBookmarksName(node.title) ||
            isMobileBookmarksName(node.title)
          ) {
            if (isOtherBookmarksName(node.title)) {
              parentId = rootIds.other;
            } else if (isMobileBookmarksName(node.title)) {
              parentId = rootIds.mobile;
            } else {
              parentId = rootIds.toolbar;
            }

            for (const child of node.children || []) {
              await createNode(parentId, child);
            }
            continue;
          }
        }

        await createNode(parentId, node);
      }
    } catch (error) {
      if (hasClearedRoots) {
        try {
          await restoreRootChildren(rootChildren, backupSnapshot);
        } catch (restoreError) {
          throw new Error(
            `${error.message} Automatic restore also failed: ${restoreError.message}`,
          );
        }
      }
      throw error;
    }
  }

  async function uploadBookmarksToWebDav(config, requestOptions = {}) {
    const directoryUrl = normalizeDirectoryUrl(config.directoryUrl);
    await ensureHostPermission(directoryUrl, {
      interactive: requestOptions.interactive !== false,
    });
    const fileUrl = joinDirectoryAndFile(directoryUrl, config.fileName);
    const htmlText = await exportBookmarksHtml();

    const response = await webDavRequest(fileUrl, "PUT", {
      username: config.username,
      password: config.password,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      body: htmlText,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(t("uploadFailedHttp", [String(response.status)]));
    }
  }

  async function downloadBookmarksFromWebDav(config, requestOptions = {}) {
    const directoryUrl = normalizeDirectoryUrl(config.directoryUrl);
    await ensureHostPermission(directoryUrl, {
      interactive: requestOptions.interactive !== false,
    });
    const fileUrl = joinDirectoryAndFile(directoryUrl, config.fileName);
    const response = await webDavRequest(fileUrl, "GET", {
      username: config.username,
      password: config.password,
    });

    if (!response.ok) {
      throw new Error(t("downloadFailedHttp", [String(response.status)]));
    }

    const htmlText = await response.text();
    await overwriteWithBookmarksHtml(htmlText);
  }

  async function getWebDavBookmarkEntryCount(config, requestOptions = {}) {
    const directoryUrl = normalizeDirectoryUrl(config.directoryUrl);
    await ensureHostPermission(directoryUrl, {
      interactive: requestOptions.interactive !== false,
    });
    const fileUrl = joinDirectoryAndFile(directoryUrl, config.fileName);
    const response = await webDavRequest(fileUrl, "GET", {
      username: config.username,
      password: config.password,
    });

    if (!response.ok) {
      throw new Error(t("readFailedHttp", [String(response.status)]));
    }

    const htmlText = await response.text();
    const importedNodes = parseBookmarksHtml(htmlText);
    return countBookmarkUrlEntries(importedNodes);
  }

  window.YABMSync = {
    getConfig,
    saveConfig,
    clearConfig,
    listDirectoryFiles,
    normalizeDirectoryUrl,
    joinDirectoryAndFile,
    uploadBookmarksToWebDav,
    downloadBookmarksFromWebDav,
    getWebDavBookmarkEntryCount,
  };
})();
