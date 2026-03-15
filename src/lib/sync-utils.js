/**
 * @file sync-utils.js
 * WebDAV synchronisation and bookmark import/export utilities for YABM Classic.
 *
 * Provides:
 *  - WebDAV configuration persistence (`getConfig`, `saveConfig`, `clearConfig`)
 *  - Directory listing via PROPFIND (`listDirectoryFiles`)
 *  - Bookmark HTML export in Netscape format (`exportBookmarksHtml`)
 *  - Bookmark HTML import with atomic roll-back on failure
 *    (`overwriteWithBookmarksHtml`)
 *  - Upload / download convenience wrappers for WebDAV
 *
 * Exposes: `window.YABMSync`
 *
 * @module lib/sync-utils
 */

(function initYABMSync() {
  /** Delegate translation to YABMI18n when available, otherwise use chrome.i18n. */
  const t = (key, substitutions) =>
    window.YABMI18n?.t(key, substitutions) ||
    chrome.i18n.getMessage(key, substitutions) ||
    key;

  /**
   * XML body sent with every WebDAV PROPFIND request. Requests the minimal
   * set of properties needed to list directory contents.
   */
  const WEBDAV_LIST_BODY =
    '<?xml version="1.0" encoding="utf-8" ?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/>' +
    "<d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>";

  /**
   * Reads the stored WebDAV configuration from `chrome.storage.local`.
   *
   * @returns {Promise<{directoryUrl: string, fileName: string, username: string, password: string}|null>}
   *     The config object, or `null` if not yet configured.
   */
  function getConfig() {
    return chrome.storage.local
      .get(["webdavConfig"])
      .then((data) => data.webdavConfig || null);
  }

  /**
   * Writes a WebDAV configuration object to `chrome.storage.local`.
   *
   * @param {{directoryUrl: string, fileName: string, username: string, password: string}} config
   * @returns {Promise<void>}
   */
  function saveConfig(config) {
    return chrome.storage.local.set({ webdavConfig: config });
  }

  /**
   * Removes the WebDAV configuration from `chrome.storage.local`.
   *
   * @returns {Promise<void>}
   */
  function clearConfig() {
    return chrome.storage.local.remove("webdavConfig");
  }

  /**
   * Builds a `Basic` HTTP Authorization header value for the given
   * credentials. Encodes the `username:password` string using `TextEncoder`
   * and manual character iteration to avoid corruption of multi-byte
   * characters that the simpler `btoa(rawAuth)` would produce.
   *
   * Returns `null` when `username` is empty (unauthenticated request).
   *
   * @param {string} username - WebDAV account username.
   * @param {string} [password] - WebDAV account password (default: `""`).
   * @returns {string|null} `"Basic <base64>"` or `null`.
   */
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

  /**
   * Derives the wildcard host-permission pattern for a URL's origin,
   * e.g. `"https://dav.example.com/*"`.
   *
   * @param {string} rawUrl - Any URL whose origin should be used.
   * @returns {string} Chrome `origins` permission pattern.
   */
  function buildOriginPermissionPattern(rawUrl) {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}/*`;
  }

  /**
   * Ensures the extension holds host permission for the origin of `rawUrl`.
   *
   * - If the permission is already granted, returns immediately.
   * - If `interactive` is `true` (default), prompts the user to grant it.
   * - If `interactive` is `false` and the permission is missing, throws.
   *
   * @param {string} rawUrl - URL whose origin requires permission.
   * @param {{ interactive?: boolean }} [options]
   * @returns {Promise<void>}
   * @throws {Error} When permission is denied or `interactive` is `false` and
   *     the permission has not been granted.
   */
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

  /**
   * Validates and sanitises a raw WebDAV directory URL:
   *  - Parses the URL and rejects non-HTTPS schemes.
   *  - Strips any embedded credentials, query string, and fragment to prevent
   *    browser-managed HTTP auth prompts and unintended cache keys.
   *  - Ensures the pathname ends with a trailing slash.
   *
   * @param {string} rawUrl - User-supplied WebDAV directory URL.
   * @returns {string} Normalised directory URL.
   * @throws {Error} If the URL is malformed or uses a non-HTTPS scheme.
   */
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

  /**
   * Appends a validated file name to a normalised directory URL, producing
   * the full URL for the target WebDAV resource.
   *
   * @param {string} directoryUrl - Normalised directory URL (with trailing `/`).
   * @param {string} fileName - File name to append; must not be empty or
   *     contain path separators.
   * @returns {string} Full URL of the target file on the WebDAV server.
   * @throws {Error} If `fileName` is empty or contains a `/`.
   */
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

  /**
   * Low-level WebDAV HTTP request helper. Attaches a `Basic` Authorization
   * header when credentials are provided and always omits cookies
   * (`credentials: "omit"`) to avoid cross-origin credential leaks.
   *
   * @param {string} url - Request URL.
   * @param {string} method - HTTP method (e.g. `"GET"`, `"PUT"`, `"PROPFIND"`).
   * @param {{ headers?: Object, username?: string, password?: string, body?: BodyInit }} [options]
   * @returns {Promise<Response>}
   */
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

  /**
   * Returns all descendant elements whose local name (namespace-stripped tag
   * name) matches `localName`. Necessary because WebDAV XML responses use
   * namespace-prefixed tags that vary across servers.
   *
   * @param {Element|Document} root - The element to search within.
   * @param {string} localName - Tag local name to match, e.g. `"href"`.
   * @returns {Element[]}
   */
  function getElementsByLocalName(root, localName) {
    return Array.from(root.getElementsByTagName("*")).filter(
      (el) => el.localName === localName,
    );
  }

  /**
   * Returns the `textContent` of the first element matching `localName`
   * within `root`, or `""` if no such element exists.
   *
   * @param {Element|Document} root
   * @param {string} localName
   * @returns {string}
   */
  function getFirstTextByLocalName(root, localName) {
    const node = getElementsByLocalName(root, localName)[0];
    return node ? node.textContent || "" : "";
  }

  /**
   * Returns `true` if the PROPFIND `<response>` element describes a WebDAV
   * collection (directory) rather than a plain file.
   *
   * @param {Element} responseEl - A `<response>` element from a PROPFIND body.
   * @returns {boolean}
   */
  function responseIsCollection(responseEl) {
    const resourcetype = getElementsByLocalName(responseEl, "resourcetype")[0];
    if (!resourcetype) {
      return false;
    }
    return getElementsByLocalName(resourcetype, "collection").length > 0;
  }

  /**
   * Percent-decodes a WebDAV `href` value. Returns the original string
   * unchanged on any decoding error.
   *
   * @param {string} hrefText - Raw href value from a PROPFIND response.
   * @returns {string} Decoded pathname string.
   */
  function decodeHref(hrefText) {
    try {
      return decodeURIComponent(hrefText);
    } catch {
      return hrefText;
    }
  }

  /**
   * Resolves a WebDAV href to an absolute URL pathname. Uses `fallbackBase`
   * when the href is a relative reference. Returns the raw href on error.
   *
   * @param {string} hrefText - Href value from a PROPFIND response.
   * @param {string} fallbackBase - Absolute base URL for relative resolution.
   * @returns {string} Absolute URL pathname (e.g. `"/dav/bookmarks.html"`).
   */
  function hrefToPathname(hrefText, fallbackBase) {
    try {
      return new URL(hrefText, fallbackBase).pathname;
    } catch {
      return hrefText;
    }
  }

  /**
   * Parses a WebDAV PROPFIND 207 XML response body into an array of file
   * metadata objects, sorted alphabetically by file name.
   *
   * Filters out the directory entry itself and any sub-collection entries,
   * returning only plain file `<response>` elements.
   *
   * @param {string} xmlText - Raw XML from the PROPFIND response body.
   * @param {string} directoryUrl - The directory URL that was queried.
   * @returns {{ name: string, href: string, size: string, lastModified: string }[]}
   * @throws {Error} If the XML contains no `<response>` elements, or if the
   *     requested URL is not a WebDAV collection.
   */
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

  /**
   * Lists files in a remote WebDAV directory. Validates and normalises the
   * directory URL, ensures host permissions are granted, issues a PROPFIND
   * request, and returns the parsed file list.
   *
   * @param {{ directoryUrl: string, username?: string, password?: string }} input
   * @param {{ interactive?: boolean }} [requestOptions]
   * @returns {Promise<{ directoryUrl: string, files: Array }>}
   * @throws {Error} On HTTP errors or permission denial.
   */
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

  /**
   * Escapes the five characters that carry special meaning in HTML
   * (`&`, `<`, `>`, `"`, `'`). Used when serialising bookmark titles
   * and URLs into the Netscape HTML export format.
   *
   * @param {string} text - Raw text to escape.
   * @returns {string} HTML-safe string.
   */
  function escapeHtml(text) {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Recursively serialises an array of Chrome bookmark tree nodes into
   * Netscape-format HTML (`<DL>/<DT>/<A>/<H3>` structure).
   *
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
   * @param {number} depth - Current nesting depth (controls indentation).
   * @returns {string} HTML fragment.
   */
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

  /**
   * Exports the full Chrome bookmark tree as a Netscape-format HTML string,
   * wrapping each top-level root folder as an `<H3>` section.
   *
   * @returns {Promise<string>} Complete Netscape bookmarks HTML document.
   */
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

  /**
   * Heuristic: returns `true` if `name` matches well-known English names for
   * Chrome's Bookmarks Bar root folder, covering common variations.
   *
   * @param {string} name - Folder title to test.
   * @returns {boolean}
   */
  function isBookmarkBarName(name) {
    const text = (name || "").toLowerCase();
    return (
      text.includes("bookmark bar") ||
      text.includes("bookmarks bar") ||
      text.includes("favorites bar")
    );
  }

  /**
   * Heuristic: returns `true` if `name` matches well-known English names for
   * Chrome's Other Bookmarks root folder.
   *
   * @param {string} name - Folder title to test.
   * @returns {boolean}
   */
  function isOtherBookmarksName(name) {
    const text = (name || "").toLowerCase();
    return text.includes("other bookmarks") || text.includes("other favorites");
  }

  /**
   * Heuristic: returns `true` if `name` matches well-known English names for
   * Chrome's Mobile Bookmarks root folder.
   *
   * @param {string} name - Folder title to test.
   * @returns {boolean}
   */
  function isMobileBookmarksName(name) {
    const text = (name || "").toLowerCase();
    return text.includes("mobile bookmarks") || text.includes("mobile");
  }

  /**
   * @typedef {{
   *   title: string,
   *   url?: string,
   *   children?: BookmarkNodeSnapshot[],
   *   target?: "toolbar"|"other"|"mobile"
   * }} BookmarkNodeSnapshot
   */

  /**
   * Recursively parses a `<DL>` element from a Netscape bookmarks HTML
   * document into an array of plain bookmark-node objects. Handles both
   * inline `<DL>` children and sibling `<DL>` elements (different exporters
   * produce different DOM structures).
   *
   * @param {Element} dlEl - The `<DL>` element to parse.
   * @returns {BookmarkNodeSnapshot[]}
   */
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

  /**
   * Parses a full Netscape bookmarks HTML string into a tree of bookmark
   * node objects by locating the root `<DL>` element and recursively
   * walking it with {@link parseDlElement}.
   *
   * @param {string} htmlText - Raw Netscape bookmarks HTML content.
  * @returns {BookmarkNodeSnapshot[]}
   * @throws {Error} If the document contains no root `<DL>` element.
   */
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

  /**
   * Counts the total number of nodes (both folders and bookmarks) in a
   * bookmark tree. Used to guard against importing empty files.
   *
   * @param {{ url?: string, children?: Array }[]} nodes
   * @returns {number}
   */
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

  /**
   * Counts only bookmark (URL) leaf nodes in a tree, excluding folder nodes.
   * Used to report the number of bookmarks stored in a remote file.
   *
   * @param {{ url?: string, children?: Array }[]} nodes
   * @returns {number}
   */
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

  /**
   * Removes all direct children of a Chrome bookmark folder (both leaf
   * bookmarks and sub-trees).
   *
   * @param {string} folderId - Chrome bookmark folder ID to clear.
   * @returns {Promise<void>}
   */
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

  /**
   * Recursively creates a bookmark node (bookmark or folder with all
   * descendants) inside a Chrome bookmark folder.
   *
   * @param {string} parentId - ID of the parent Chrome bookmark folder.
   * @param {{ title: string, url?: string, children?: Array }} node
   * @returns {Promise<void>}
   */
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

  /**
   * Creates a deep plain-object clone of an array of Chrome bookmark tree
   * nodes, retaining only `title`, `url`, and `children` fields.
   * Used to snapshot the tree before a destructive import operation.
   *
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
  * @returns {BookmarkNodeSnapshot[]}
   */
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

  /**
   * Takes a deep snapshot of the bookmark tree under each root child folder,
   * using {@link cloneBookmarkNodes} to produce pure-data copies. Used as a
   * rollback baseline before a potentially destructive import.
   *
   * @param {chrome.bookmarks.BookmarkTreeNode[]} rootChildren
   *     Direct children of the synthetic Chrome bookmark root.
   * @returns {Promise<Object.<string, BookmarkNodeSnapshot[]>>}
   *     Map of folder ID → cloned children array.
   */
  async function snapshotRootChildren(rootChildren) {
    /** @type {Object.<string, BookmarkNodeSnapshot[]>} */
    const snapshot = {};
    for (const folder of rootChildren) {
      const subtree = await chrome.bookmarks.getSubTree(folder.id);
      snapshot[folder.id] = cloneBookmarkNodes(subtree[0]?.children || []);
    }
    return snapshot;
  }

  /**
   * Replaces the entire contents of each root child folder with the
   * corresponding entries from a previous snapshot. Called to roll back
   * the bookmark tree after a failed import.
   *
   * @param {chrome.bookmarks.BookmarkTreeNode[]} rootChildren
  * @param {Object.<string, BookmarkNodeSnapshot[]>} snapshot - Map from {@link snapshotRootChildren}.
   * @returns {Promise<void>}
   */
  async function restoreRootChildren(rootChildren, snapshot) {
    for (const folder of rootChildren) {
      await clearFolderChildren(folder.id);
      for (const node of snapshot[folder.id] || []) {
        await createNode(folder.id, node);
      }
    }
  }

  /**
   * Resolves Chrome's three built-in root folders (toolbar, other, mobile)
   * to their folder IDs using both positional defaults and title-based
   * heuristics so the mapping works regardless of the browser locale.
   *
   * @param {chrome.bookmarks.BookmarkTreeNode[]} rootChildren
   * @returns {{ toolbar: string|null, other: string|null, mobile: string|null }}
   */
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

  /**
   * Replaces the entire Chrome bookmark tree with the content of a Netscape
   * bookmarks HTML string. The operation is atomic: a snapshot is taken
   * before clearing the existing tree, and the snapshot is restored if any
   * step fails.
   *
   * Imported top-level nodes are routed to the correct root folder based on
   * attributes (`PERSONAL_TOOLBAR_FOLDER`, `UNFILED_BOOKMARKS_FOLDER`,
   * `MOBILE_BOOKMARKS_FOLDER`) and title heuristics.
   *
   * @param {string} htmlText - Netscape bookmarks HTML to import.
   * @returns {Promise<void>}
   * @throws {Error} On parse failure, empty import, or unrecoverable restore
   *     error (with both the original and restore error messages).
   */
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

  /**
   * Exports the full Chrome bookmark tree as Netscape HTML and uploads it
   * to the configured WebDAV file using an HTTP PUT request.
   *
   * @param {{ directoryUrl: string, fileName: string, username?: string, password?: string }} config
   * @param {{ interactive?: boolean }} [requestOptions]
   * @returns {Promise<void>}
   * @throws {Error} On permission denial, HTTP error, or export failure.
   */
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

  /**
   * Downloads the Netscape bookmarks HTML file from WebDAV and replaces
   * the entire Chrome bookmark tree with its contents. Rolls back
   * automatically on failure (see {@link overwriteWithBookmarksHtml}).
   *
   * @param {{ directoryUrl: string, fileName: string, username?: string, password?: string }} config
   * @param {{ interactive?: boolean }} [requestOptions]
   * @returns {Promise<void>}
   * @throws {Error} On permission denial, HTTP error, or import failure.
   */
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

  /**
   * Fetches the remote Netscape bookmarks HTML file from WebDAV and returns
   * the count of bookmark URL entries it contains, without modifying the
   * local Chrome bookmark tree.
   *
   * @param {{ directoryUrl: string, fileName: string, username?: string, password?: string }} config
   * @param {{ interactive?: boolean }} [requestOptions]
   * @returns {Promise<number>} Number of URL bookmark entries in the remote file.
   * @throws {Error} On permission denial, HTTP error, or parse failure.
   */
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
