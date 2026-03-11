/**
 * Background service worker for YABM Classic (Manifest V3).
 *
 * Tracks a single bookmarks-page tab across browser sessions using session storage,
 * which survives service-worker restarts. Opens a new bookmarks tab or focuses the
 * existing one when the extension toolbar action is clicked.
 *
 * @module background/service-worker
 */

const BOOKMARKS_PAGE_URL = chrome.runtime.getURL("pages/bookmarks/bookmarks.html");
const BOOKMARKS_PAGE_URL_PATTERN = `${BOOKMARKS_PAGE_URL}*`;
const BOOKMARKS_TAB_ID_STORAGE_KEY = "bookmarksTabId";

let bookmarksTabId = null;
let pendingTabOpenPromise = null;

async function setBookmarksTabId(tabId) {
  bookmarksTabId = tabId;
  await chrome.storage.session.set({ [BOOKMARKS_TAB_ID_STORAGE_KEY]: tabId });
}

async function clearBookmarksTabId() {
  bookmarksTabId = null;
  await chrome.storage.session.remove(BOOKMARKS_TAB_ID_STORAGE_KEY);
}

async function restoreBookmarksTabId() {
  if (typeof bookmarksTabId === "number") return;

  const stored = await chrome.storage.session.get(BOOKMARKS_TAB_ID_STORAGE_KEY);
  const storedTabId = stored[BOOKMARKS_TAB_ID_STORAGE_KEY];
  if (typeof storedTabId === "number") {
    bookmarksTabId = storedTabId;
  }
}

function isBookmarksPageUrl(url) {
  return typeof url === "string" && url.startsWith(BOOKMARKS_PAGE_URL);
}

function isBookmarksPageTab(tab) {
  return isBookmarksPageUrl(tab.url) || isBookmarksPageUrl(tab.pendingUrl);
}

// Uses chrome.runtime.getContexts (Chrome 116+) to find the bookmarks tab.
// Returns the tab object and caches its ID, or null if not found.
async function findBookmarksTabFromContexts() {
  if (typeof chrome.runtime.getContexts !== "function") return null;

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [BOOKMARKS_PAGE_URL_PATTERN],
  });

  const [context] = contexts;
  if (!context || typeof context.tabId !== "number") return null;

  try {
    const tab = await chrome.tabs.get(context.tabId);
    await setBookmarksTabId(context.tabId);
    return tab;
  } catch {
    return null;
  }
}

async function focusTab(tab) {
  if (typeof tab.id !== "number") return;

  await chrome.tabs.update(tab.id, { active: true });

  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

// Three-tier lookup for the bookmarks tab:
// 1. Cached ID from memory (restored from session storage if needed)
// 2. chrome.runtime.getContexts API (Chrome 116+)
// 3. chrome.tabs.query with URL pattern, then full tab scan as fallback
async function findExistingBookmarksTab() {
  await restoreBookmarksTabId();

  if (typeof bookmarksTabId === "number") {
    try {
      return await chrome.tabs.get(bookmarksTabId);
    } catch {
      await clearBookmarksTabId();
    }
  }

  const contextTab = await findBookmarksTabFromContexts();
  if (contextTab) return contextTab;

  const [existingTab] = await chrome.tabs.query({ url: BOOKMARKS_PAGE_URL_PATTERN });
  if (existingTab?.id !== undefined) {
    await setBookmarksTabId(existingTab.id);
    return existingTab;
  }

  const allTabs = await chrome.tabs.query({});
  const fallbackTab = allTabs.find(isBookmarksPageTab);
  if (fallbackTab?.id !== undefined) {
    await setBookmarksTabId(fallbackTab.id);
    return fallbackTab;
  }

  return null;
}

// Clear tracked tab ID when closed to ensure next click opens a fresh tab.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === bookmarksTabId) {
    void clearBookmarksTabId();
  }
});

async function openOrFocusBookmarksTab() {
  const existingTab = await findExistingBookmarksTab();
  if (existingTab) {
    await focusTab(existingTab);
    return;
  }

  const createdTab = await chrome.tabs.create({ url: BOOKMARKS_PAGE_URL });
  if (typeof createdTab.id === "number") {
    await setBookmarksTabId(createdTab.id);
  }
}

// Deduplicate rapid toolbar clicks using a shared promise.
chrome.action.onClicked.addListener(() => {
  if (!pendingTabOpenPromise) {
    pendingTabOpenPromise = openOrFocusBookmarksTab().finally(() => {
      pendingTabOpenPromise = null;
    });
  }
  return pendingTabOpenPromise;
});
