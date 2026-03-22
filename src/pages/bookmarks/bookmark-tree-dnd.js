/**
 * @file bookmark-tree-dnd.js
 * Drag-and-drop handlers for moving bookmarks and folders within the tree.
 * Uses event delegation at the container level to eliminate flickering.
 * Exposed as `window.YABMBookmarkTreeDndModule`.
 */
(function () {
  /**
   * Factory that creates the drag-and-drop module.
   * @param {{ t: Function, setStatus: Function, rerenderAfterTreeChange: Function }} deps
   * @returns {{ createContainerDragHandlers: Function, handleNodeDragStart: Function, handleNodeDragEnd: Function, handleFolderDrop: Function }}
   */
  function createBookmarkTreeDndModule(deps) {
    const { t, setStatus, rerenderAfterTreeChange } = deps;

    // Tracks the node currently being dragged so drop handlers can validate targets.
    const dragState = {
      nodeId: null,                  // Chrome bookmark ID of the dragged node.
      nodeType: null,                // 'bookmark' or 'folder'.
      parentId: null,                // Original parent folder ID (used to skip no-op drops).
      currentDragOverFolderId: null, // Currently highlighted drop target folder ID.
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
     * @param {{ clearCurrentHighlight?: Function }} [containerHandlers] - Optional handlers for cleanup.
     */
    function handleNodeDragEnd(event, containerHandlers) {
      dragState.nodeId = null;
      dragState.nodeType = null;
      dragState.parentId = null;
      dragState.currentDragOverFolderId = null;
      event.currentTarget?.classList.remove("drag-source");
      containerHandlers?.clearCurrentHighlight?.();
      removeDragGhost();
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
     * @param {Object} [capturedDragState] - Drag state captured before async operation.
     * @param {string} [capturedDragState.nodeId] - ID of dragged node.
     * @param {'bookmark'|'folder'} [capturedDragState.nodeType] - Type of dragged node.
     * @param {string} [capturedDragState.parentId] - Original parent folder ID.
     * @returns {Promise<void>}
     */
    async function handleFolderDrop(event, targetFolderNode, capturedDragState) {
      const dragNodeId = capturedDragState?.nodeId ?? dragState.nodeId;
      const dragNodeType = capturedDragState?.nodeType ?? dragState.nodeType;

      if (!dragNodeId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      dragState.nodeId = null;
      dragState.nodeType = null;
      dragState.currentDragOverFolderId = null;

      // Clear visual highlight
      const folder = event.target?.closest?.(".folder");
      folder?.classList.remove("drag-over");

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
        await rerenderAfterTreeChange();
      } catch (error) {
        setStatus(t("moveFailed", [error.message]), "error");
      }
    }

    /**
     * Creates container-level drag event handlers using event delegation.
     * This approach eliminates flickering by tracking the current drag-over folder
     * and only updating highlights when the target actually changes.
     * @param {HTMLElement} container - The #bookmark-list container element.
     * @returns {{ attach: Function, detach: Function, clearCurrentHighlight: Function }}
     */
    function createContainerDragHandlers(container) {
      /**
       * Clears the highlight from the currently highlighted folder, if any.
       */
      function clearCurrentHighlight() {
        if (dragState.currentDragOverFolderId) {
          const folder = document.querySelector(
            `[data-folder-id="${dragState.currentDragOverFolderId}"]`,
          );
          folder?.classList.remove("drag-over");
          dragState.currentDragOverFolderId = null;
        }
      }

      /**
       * Handles dragover events at the container level.
       * Highlights the folder under the cursor as a potential drop target.
       * @param {DragEvent} event
       */
      function handleDragOver(event) {
        if (!dragState.nodeId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        // Find the target folder under the cursor
        const folder = event.target?.closest?.(".folder");
        if (!folder) {
          // Not over any folder, clear highlight
          clearCurrentHighlight();
          return;
        }

        const folderId = folder.dataset.folderId;

        // Skip the source node's parent folder (no-op move)
        if (folderId === dragState.parentId) {
          clearCurrentHighlight();
          return;
        }

        // Skip dropping a folder into its own subtree
        if (
          dragState.nodeType === "folder" &&
          folder.contains(document.querySelector(`[data-folder-id="${dragState.nodeId}"]`))
        ) {
          clearCurrentHighlight();
          return;
        }

        // Only update highlight if the target folder changed
        if (dragState.currentDragOverFolderId !== folderId) {
          clearCurrentHighlight();
          folder.classList.add("drag-over");
          dragState.currentDragOverFolderId = folderId;
        }
      }

      /**
       * Handles drop events at the container level.
       * Finds the target folder and delegates to handleFolderDrop.
       * Captures drag state before async operation to avoid race condition with dragend.
       * @param {DragEvent} event
       */
      function handleDrop(event) {
        if (!dragState.nodeId) return;

        const folder = event.target?.closest?.(".folder");
        if (!folder) return;

        const folderId = folder.dataset.folderId;

        // Capture drag state before async operation to prevent race with dragend
        const capturedDragState = {
          nodeId: dragState.nodeId,
          nodeType: dragState.nodeType,
          parentId: dragState.parentId,
        };

        // Fetch the folder node and call the drop handler
        chrome.bookmarks.get(folderId).then(([targetFolderNode]) => {
          if (targetFolderNode) {
            handleFolderDrop(event, targetFolderNode, capturedDragState);
          }
        });
      }

      /**
       * Handles dragleave events at the container level.
       * Clears highlight when the drag leaves the container entirely.
       * @param {DragEvent} event
       */
      function handleDragLeave(event) {
        // Check if we truly left the container
        if (event.relatedTarget && container.contains(event.relatedTarget)) {
          return;
        }
        clearCurrentHighlight();
      }

      /**
       * Attaches all event listeners to the container.
       */
      function attach() {
        container.addEventListener("dragover", handleDragOver);
        container.addEventListener("drop", handleDrop);
        container.addEventListener("dragleave", handleDragLeave);
      }

      /**
       * Removes all event listeners from the container.
       */
      function detach() {
        container.removeEventListener("dragover", handleDragOver);
        container.removeEventListener("drop", handleDrop);
        container.removeEventListener("dragleave", handleDragLeave);
      }

      return { attach, detach, clearCurrentHighlight };
    }

    return {
      createContainerDragHandlers,
      handleNodeDragStart,
      handleNodeDragEnd,
      handleFolderDrop,
    };
  }

  window.YABMBookmarkTreeDndModule = {
    createBookmarkTreeDndModule,
  };
})();