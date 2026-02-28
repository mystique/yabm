(function () {
  function createBookmarkTreeDndModule(deps) {
    const { t, setStatus, rerenderAfterTreeChange } = deps;

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
      clearFolderDragOverStyles();
      details.classList.add("drag-over");
    }

    function handleFolderDragOver(event) {
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

    function handleBookmarkListDragOver(event) {
      if (!dragState.nodeId) {
        return;
      }
      const folder = event.target?.closest?.(".folder");
      if (!folder) {
        return;
      }
      const folderId = folder.dataset.folderId;
      if (String(folderId) === String(dragState.parentId)) {
        return;
      }
      if (
        dragState.nodeType === "folder" &&
        folder.contains(document.querySelector(`[data-folder-id="${dragState.nodeId}"]`))
      ) {
        return;
      }
      if (!folder.classList.contains("drag-over")) {
        clearFolderDragOverStyles();
        folder.classList.add("drag-over");
      }
    }

    return {
      handleBookmarkListDragOver,
      handleFolderDragEnter,
      handleFolderDragLeave,
      handleFolderDragOver,
      handleFolderDrop,
      handleNodeDragEnd,
      handleNodeDragStart,
    };
  }

  window.YABMBookmarkTreeDndModule = {
    createBookmarkTreeDndModule,
  };
})();
