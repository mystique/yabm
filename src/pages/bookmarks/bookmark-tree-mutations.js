/**
 * @file bookmark-tree-mutations.js
 * CRUD operations for bookmarks and folders: add, edit, delete, and favicon refresh.
 * Each mutation is wrapped in a shared error-handling helper.
 * Exposed as `window.YABMBookmarkTreeMutationsModule`.
 */
(function () {
  /**
   * Factory that creates the mutations module.
   * @param {{ t: Function, setStatus: Function, getNameForNode: Function, getFolderStats: Function, getOpenFolderIds: Function, getBookmarkNodesInFolder: Function, removeFaviconsByBookmarkIds: Function, ensureValidUrl: Function, refreshBookmarkFavicon: Function, openPromptModal: Function, openEditorModal: Function, rerenderAfterTreeChange: Function, renderBookmarks: Function }} deps
   * @returns {{ addBookmarkNode: Function, addFolderNode: Function, deleteBookmarkNode: Function, deleteFolderNode: Function, editBookmarkNode: Function, editFolderNode: Function, refreshBookmarkFaviconWithStatus: Function, runBookmarkMutation: Function }}
   */
  function createBookmarkTreeMutationsModule(deps) {
    const {
      t,
      setStatus,
      getNameForNode,
      getFolderStats,
      getOpenFolderIds,
      getBookmarkNodesInFolder,
      removeFaviconsByBookmarkIds,
      ensureValidUrl,
      refreshBookmarkFavicon,
      openPromptModal,
      openEditorModal,
      rerenderAfterTreeChange,
      renderBookmarks,
    } = deps;

    /**
     * Runs an async bookmark mutation, automatically reporting success and error
     * states to the status bar. An optional `afterSuccess` callback executes
     * (e.g. re-render) only when the mutation completes without throwing.
     * @param {() => Promise<void>} run - The async mutation to execute.
     * @param {{ successKey?: string, errorKey?: string, afterSuccess?: Function }} [options]
     * @returns {Promise<void>}
     */
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

    /**
     * Refreshes the favicon for a single bookmark and reports any error via the
     * status bar. A thin wrapper around `refreshBookmarkFavicon` using `runBookmarkMutation`.
     * @param {chrome.bookmarks.BookmarkTreeNode} node
     * @returns {Promise<void>}
     */
    async function refreshBookmarkFaviconWithStatus(node) {
      await runBookmarkMutation(() => refreshBookmarkFavicon(node), {
        errorKey: "faviconUpdateFailed",
      });
    }

    /**
     * Asks the user to confirm deletion, then removes the bookmark and its
     * cached favicon entry before re-rendering the tree.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The bookmark to delete.
     * @returns {Promise<void>}
     */
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

    /**
     * Asks for one or two confirmations (the second if the folder contains bookmarks),
     * then recursively removes the folder and purges its cached favicons.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The folder to delete.
     * @returns {Promise<void>}
     */
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

    /**
     * Opens the editor modal to collect a folder name, then creates a new
     * Chrome bookmark folder as a child of `parentNode`.
     * @param {chrome.bookmarks.BookmarkTreeNode} parentNode - Destination parent folder.
     * @returns {Promise<void>}
     */
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

    /**
     * Opens the editor modal pre-filled with the folder's current title and
     * saves the updated name via the Chrome bookmarks API.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The folder to rename.
     * @returns {Promise<void>}
     */
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

    /**
     * Opens the editor modal to collect a title and URL, validates the URL,
     * then creates a new bookmark as a child of `parentNode`.
     * @param {chrome.bookmarks.BookmarkTreeNode} parentNode - Destination parent folder.
     * @returns {Promise<void>}
     */
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

    /**
     * Opens the editor modal pre-filled with the bookmark's current title and URL.
     * If the URL changes, the stale favicon cache entry is removed before saving.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The bookmark to edit.
     * @returns {Promise<void>}
     */
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

    return {
      addBookmarkNode,
      addFolderNode,
      deleteBookmarkNode,
      deleteFolderNode,
      editBookmarkNode,
      editFolderNode,
      refreshBookmarkFaviconWithStatus,
      runBookmarkMutation,
    };
  }

  window.YABMBookmarkTreeMutationsModule = {
    createBookmarkTreeMutationsModule,
  };
})();
