(function () {
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
