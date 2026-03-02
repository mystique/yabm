/**
 * @file service-worker.js
 * Background service worker for YABM Classic (Manifest V3).
 *
 * Responsibilities:
 *  - Tracks the single bookmarks-page tab across browser sessions using
 *    session storage so the reference survives service-worker restarts.
 *  - Opens a new bookmarks tab, or focuses the existing one, whenever the
 *    extension toolbar action button is clicked.
 *
 * @module background/service-worker
 */

/** Full URL of the bookmarks page inside the extension. */
const BOOKMARKS_PAGE_URL = chrome.runtime.getURL("pages/bookmarks/bookmarks.html");

/** Wildcard pattern used when querying Chrome tabs for the bookmarks page. */
const BOOKMARKS_PAGE_URL_PATTERN = `${BOOKMARKS_PAGE_URL}*`;

/** Key used to persist the bookmarks tab ID in `chrome.storage.session`. */
const BOOKMARKS_TAB_ID_STORAGE_KEY = "bookmarksTabId";

/** In-memory cache of the bookmarks tab ID; `null` when not yet resolved. */
let bookmarksTabId = null;

/**
 * Deduplication guard: holds the in-flight `openOrFocusBookmarksTab`
 * promise while a tab-open operation is already running, preventing
 * race conditions from multiple rapid toolbar clicks.
 */
let openBookmarksTabInFlight = null;

/**
 * Persists the active bookmarks tab ID to session storage and updates
 * the in-memory cache. The session storage copy re-hydrates the cache
 * after the service worker restarts within the same browser session.
 *
 * @param {number} tabId - Chrome tab ID to store.
 * @returns {Promise<void>}
 */
async function setBookmarksTabId(tabId) {
  bookmarksTabId = tabId;
  await chrome.storage.session.set({
    [BOOKMARKS_TAB_ID_STORAGE_KEY]: tabId,
  });
}

/**
 * Removes the bookmarks tab ID from session storage and clears the
 * in-memory cache. Called when the tracked tab is closed or lost.
 *
 * @returns {Promise<void>}
 */
async function clearBookmarksTabId() {
  bookmarksTabId = null;
  await chrome.storage.session.remove(BOOKMARKS_TAB_ID_STORAGE_KEY);
}

/**
 * Restores the in-memory `bookmarksTabId` from session storage after a
 * service-worker restart. No-ops if the value is already loaded into
 * memory (i.e. the worker has not been recycled since the last write).
 *
 * @returns {Promise<void>}
 */
async function restoreBookmarksTabId() {
  if (typeof bookmarksTabId === "number") {
    return;
  }

  const stored = await chrome.storage.session.get(BOOKMARKS_TAB_ID_STORAGE_KEY);
  const storedTabId = stored[BOOKMARKS_TAB_ID_STORAGE_KEY];
  if (typeof storedTabId === "number") {
    bookmarksTabId = storedTabId;
  }
}

/**
 * Returns `true` if the given URL belongs to the extension's bookmarks page.
 *
 * @param {string} url - The URL string to test.
 * @returns {boolean}
 */
function isBookmarksPageUrl(url) {
  return typeof url === "string" && url.startsWith(BOOKMARKS_PAGE_URL);
}

/**
 * Returns `true` if the given Chrome tab is currently showing (or navigating
 * to) the bookmarks page. Checks both `tab.url` and `tab.pendingUrl` to
 * cover in-progress navigations.
 *
 * @param {chrome.tabs.Tab} tab - The Chrome tab object to inspect.
 * @returns {boolean}
 */
function isBookmarksPageTab(tab) {
  return isBookmarksPageUrl(tab.url) || isBookmarksPageUrl(tab.pendingUrl);
}

/**
 * Looks up the bookmarks-page tab via `chrome.runtime.getContexts`, which
 * is available in Chrome 116+. Returns the tab object and caches its ID on
 * success, or `null` if the API is unavailable or no matching context exists.
 *
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function findBookmarksTabFromContexts() {
  if (typeof chrome.runtime.getContexts !== "function") {
    return null;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [BOOKMARKS_PAGE_URL_PATTERN],
  });

  const [context] = contexts;
  if (!context || typeof context.tabId !== "number") {
    return null;
  }

  try {
    const tab = await chrome.tabs.get(context.tabId);
    await setBookmarksTabId(context.tabId);
    return tab;
  } catch {
    return null;
  }
}

/**
 * Makes a tab the active tab in its window and brings that window to the
 * foreground. Safe to call with a tab that has no `windowId`.
 *
 * @param {chrome.tabs.Tab} tab - The tab to focus.
 * @returns {Promise<void>}
 */
async function focusTab(tab) {
  if (typeof tab.id !== "number") {
    return;
  }

  await chrome.tabs.update(tab.id, {
    active: true,
  });

  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, {
      focused: true,
    });
  }
}

/**
 * Locates the existing bookmarks-page tab using a three-tier lookup:
 *  1. In-memory cached tab ID (restored from session storage if needed).
 *  2. `chrome.runtime.getContexts` API (Chrome 116+).
 *  3. `chrome.tabs.query` with URL pattern matching, including a full scan
 *     of all tabs as a last resort for unreported pending navigations.
 *
 * Returns the tab object if found, or `null` if no bookmarks tab is open.
 *
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function findExistingBookmarksTab() {
  await restoreBookmarksTabId();

  if (typeof bookmarksTabId === "number") {
    try {
      const trackedTab = await chrome.tabs.get(bookmarksTabId);
      return trackedTab;
    } catch {
      await clearBookmarksTabId();
    }
  }

  const contextTab = await findBookmarksTabFromContexts();
  if (contextTab) {
    return contextTab;
  }

  const existingTabs = await chrome.tabs.query({
    url: BOOKMARKS_PAGE_URL_PATTERN,
  });
  const [existingTab] = existingTabs;

  if (existingTab && typeof existingTab.id === "number") {
    await setBookmarksTabId(existingTab.id);
    return existingTab;
  }

  const allTabs = await chrome.tabs.query({});
  const fallbackTab = allTabs.find((tab) => isBookmarksPageTab(tab));
  if (fallbackTab && typeof fallbackTab.id === "number") {
    await setBookmarksTabId(fallbackTab.id);
    return fallbackTab;
  }

  return null;
}

// Clear the tracked tab ID when the bookmarks tab is closed so that the
// next toolbar click always opens a fresh tab rather than looking up a
// stale ID.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === bookmarksTabId) {
    void clearBookmarksTabId();
  }
});

/**
 * Opens the bookmarks page in a new tab, or focuses the existing one if it
 * is already open. Caches the new tab's ID when a fresh tab is created.
 *
 * @returns {Promise<void>}
 */
async function openOrFocusBookmarksTab() {
  const existingTab = await findExistingBookmarksTab();
  if (existingTab) {
    await focusTab(existingTab);
    return;
  }

  const createdTab = await chrome.tabs.create({
    url: BOOKMARKS_PAGE_URL,
  });
  if (typeof createdTab.id === "number") {
    await setBookmarksTabId(createdTab.id);
  }
}

// Handles toolbar action clicks. Uses a single shared promise to deduplicate
// rapid successive clicks, ensuring only one tab-open operation runs at a time.
chrome.action.onClicked.addListener(() => {
  if (!openBookmarksTabInFlight) {
    openBookmarksTabInFlight = openOrFocusBookmarksTab().finally(() => {
      openBookmarksTabInFlight = null;
    });
  }

  return openBookmarksTabInFlight;
});
