/**
 * @file bookmark-tree-dnd.js
 * Drag-and-drop handlers for moving bookmarks and folders within the tree.
 * Exposed as `window.YABMBookmarkTreeDndModule`.
 */
(function () {
  /**
   * Factory that creates the drag-and-drop module.
   * @param {{ t: Function, setStatus: Function, rerenderAfterTreeChange: Function }} deps
   * @returns {{ handleBookmarkListDragOver: Function, handleFolderDragEnter: Function, handleFolderDragLeave: Function, handleFolderDragOver: Function, handleFolderDrop: Function, handleNodeDragEnd: Function, handleNodeDragStart: Function }}
   */
  function createBookmarkTreeDndModule(deps) {
    const { t, setStatus, rerenderAfterTreeChange } = deps;

    // Tracks the node currently being dragged so drop handlers can validate targets.
    const dragState = {
      nodeId: null,     // Chrome bookmark ID of the dragged node.
      nodeType: null,   // 'bookmark' or 'folder'.
      parentId: null,   // Original parent folder ID (used to skip no-op drops).
    };
    // Cloned ghost element appended off-screen to serve as the drag image.
    let dragGhostEl = null;

    /**
     * Removes the temporary drag-ghost element from the DOM if it exists.
     */
    function removeDragGhost() {
      if (dragGhostEl?.parentNode) {
        dragGhostEl.parentNode.removeChild(dragGhostEl);
      }
      dragGhostEl = null;
    }

    /**
     * Removes the `drag-over` highlight class from every folder in the list.
     * Called whenever the drag ends or a new folder takes over as the drop target.
     */
    function clearFolderDragOverStyles() {
      for (const folder of document.querySelectorAll(
        "#bookmark-list .folder.drag-over",
      )) {
        folder.classList.remove("drag-over");
      }
    }

    /**
     * Initialises drag state and attaches a styled ghost image to the drag operation.
     * @param {DragEvent} event - The native dragstart event.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The bookmark/folder being dragged.
     * @param {'bookmark'|'folder'} nodeType - Type of the node being dragged.
     */
    function handleNodeDragStart(event, node, nodeType) {
      dragState.nodeId = node.id;
      dragState.nodeType = nodeType;
      dragState.parentId = node.parentId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", node.id);
      const sourceEl = event.currentTarget;
      sourceEl?.classList.add("drag-source");

      // Build a styled ghost element that tracks the cursor during the drag.
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

    /**
     * Cleans up drag state and visual artefacts when a drag operation ends.
     * @param {DragEvent} event - The native dragend event.
     */
    function handleNodeDragEnd(event) {
      dragState.nodeId = null;
      dragState.nodeType = null;
      event.currentTarget?.classList.remove("drag-source");
      clearFolderDragOverStyles();
      removeDragGhost();
    }

    /**
     * Highlights a folder as the active drop target when the cursor enters it.
     * Clears any previously highlighted folder first to keep only one active.
     * @param {DragEvent} event
     * @param {HTMLDetailsElement} details - The folder `<details>` element.
     */
    function handleFolderDragEnter(event, details) {
      if (!dragState.nodeId) {
        return;
      }
      event.preventDefault();
      clearFolderDragOverStyles();
      details.classList.add("drag-over");
    }

    /**
     * Allows the drag to proceed over a folder target and sets the drop effect.
     * @param {DragEvent} event
     */
    function handleFolderDragOver(event) {
      if (!dragState.nodeId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }

    /**
     * Removes the drop-target highlight when the drag leaves a folder.
     * Ignores events where the cursor moves to a child element of the same folder.
     * @param {DragEvent} event
     * @param {HTMLDetailsElement} details - The folder `<details>` element.
     */
    function handleFolderDragLeave(event, details) {
      if (event.relatedTarget && details.contains(event.relatedTarget)) {
        return;
      }
      details.classList.remove("drag-over");
    }

    /**
     * Recursively checks whether a folder's subtree already contains a given node.
     * Used to prevent dropping a folder into one of its own descendants.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - Root of the subtree to search.
     * @param {string} targetId - ID of the node to look for.
     * @returns {boolean}
     */
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

    /**
     * Validates whether the dragged node may be dropped into `targetFolderId`.
     * Prevents moving a folder into itself or into one of its own descendants.
     * @param {string|null} dragNodeId - ID of the node being dragged.
     * @param {'bookmark'|'folder'} dragNodeType
     * @param {string|null} targetFolderId - ID of the destination folder.
     * @returns {Promise<boolean>}
     */
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

    /**
     * Handles a drop event on a folder target: validates the move, calls the
     * Chrome bookmarks API, and triggers a re-render.
     * @param {DragEvent} event
     * @param {chrome.bookmarks.BookmarkTreeNode} targetFolderNode - Destination folder.
     * @returns {Promise<void>}
     */
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

    /**
     * Handles `dragover` on the bookmark list container.
     * Highlights the folder under the cursor as a potential drop target,
     * but ignores the node's current parent folder (no-op move).
     * @param {DragEvent} event
     */
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
