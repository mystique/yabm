const BOOKMARKS_PAGE_URL = chrome.runtime.getURL("pages/bookmarks/bookmarks.html");
const BOOKMARKS_PAGE_URL_PATTERN = `${BOOKMARKS_PAGE_URL}*`;
const BOOKMARKS_TAB_ID_STORAGE_KEY = "bookmarksTabId";

let bookmarksTabId = null;
let openBookmarksTabInFlight = null;

async function setBookmarksTabId(tabId) {
  bookmarksTabId = tabId;
  await chrome.storage.session.set({
    [BOOKMARKS_TAB_ID_STORAGE_KEY]: tabId,
  });
}

async function clearBookmarksTabId() {
  bookmarksTabId = null;
  await chrome.storage.session.remove(BOOKMARKS_TAB_ID_STORAGE_KEY);
}

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

function isBookmarksPageUrl(url) {
  return typeof url === "string" && url.startsWith(BOOKMARKS_PAGE_URL);
}

function isBookmarksPageTab(tab) {
  return isBookmarksPageUrl(tab.url) || isBookmarksPageUrl(tab.pendingUrl);
}

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

  const createdTab = await chrome.tabs.create({
    url: BOOKMARKS_PAGE_URL,
  });
  if (typeof createdTab.id === "number") {
    await setBookmarksTabId(createdTab.id);
  }
}

chrome.action.onClicked.addListener(() => {
  if (!openBookmarksTabInFlight) {
    openBookmarksTabInFlight = openOrFocusBookmarksTab().finally(() => {
      openBookmarksTabInFlight = null;
    });
  }

  return openBookmarksTabInFlight;
});
