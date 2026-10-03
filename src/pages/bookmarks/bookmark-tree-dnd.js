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

    /**
     * @typedef {'bookmark'|'folder'} DragNodeType
     */

    /**
     * Drag state snapshot passed to drop handling.
     * @typedef {Object} CapturedDragState
     * @property {string|null} nodeId - Chrome bookmark ID of the dragged node.
     * @property {DragNodeType|null} nodeType - Type of the dragged node.
     * @property {string|null} parentId - Original parent folder ID.
     */

    /**
     * Live drag state, including the currently highlighted drop target.
     * @typedef {CapturedDragState & {
     *   currentDragOverFolderId: string|null,
     *   sourceEl: HTMLElement|null
     * }} DragState
     */

    // Tracks the node currently being dragged so drop handlers can validate targets.
    /** @type {DragState} */
    const dragState = {
      nodeId: null,                  // Chrome bookmark ID of the dragged node.
      nodeType: null,                // 'bookmark' or 'folder'.
      parentId: null,                // Original parent folder ID (used to skip no-op drops).
      currentDragOverFolderId: null, // Currently highlighted drop target folder ID.
      sourceEl: null,                 // Source element carrying the drag-source class.
    };
    // Cloned ghost element appended off-screen to serve as the drag image.
    /** @type {HTMLElement|null} */
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
     * Clears the currently highlighted folder without dropping the state ID
     * before the corresponding DOM element has been found.
     */
    function clearCurrentHighlight() {
      const folderId = dragState.currentDragOverFolderId;
      if (!folderId) {
        return;
      }
      document
        .querySelector(`[data-folder-id="${folderId}"]`)
        ?.classList.remove("drag-over");
      dragState.currentDragOverFolderId = null;
    }

    /**
     * Removes every visual artefact owned by the active drag operation.
     * @param {EventTarget|null} [sourceEl]
     */
    function cleanupDragVisuals(sourceEl = null) {
      clearCurrentHighlight();
      if (dragState.sourceEl) {
        dragState.sourceEl.classList.remove("drag-source");
      }
      if (sourceEl instanceof HTMLElement) {
        sourceEl.classList.remove("drag-source");
      }
      removeDragGhost();
    }

    function resetDragState() {
      dragState.nodeId = null;
      dragState.nodeType = null;
      dragState.parentId = null;
      dragState.currentDragOverFolderId = null;
      dragState.sourceEl = null;
    }

    /**
     * Initialises drag state and attaches a styled ghost image to the drag operation.
     * @param {DragEvent} event - The native dragstart event.
     * @param {chrome.bookmarks.BookmarkTreeNode} node - The bookmark/folder being dragged.
     * @param {DragNodeType} nodeType - Type of the node being dragged.
     */
    function handleNodeDragStart(event, node, nodeType) {
      const sourceEl =
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      cleanupDragVisuals(sourceEl);
      resetDragState();

      dragState.nodeId = node.id;
      dragState.nodeType = nodeType;
      dragState.parentId = node.parentId;
      dragState.sourceEl = sourceEl;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", node.id);

      // Build a styled ghost element that tracks the cursor during the drag.
      removeDragGhost();
      if (!sourceEl) {
        return;
      }
      sourceEl.classList.add("drag-source");

      const previewSource =
        nodeType === "bookmark"
          ? sourceEl.querySelector(".bookmark-item") || sourceEl
          : sourceEl;
      if (previewSource instanceof HTMLElement && event.dataTransfer?.setDragImage) {
        const rect = previewSource.getBoundingClientRect();
        const ghost = previewSource.cloneNode(true);
        if (!(ghost instanceof HTMLElement)) {
          return;
        }
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
      cleanupDragVisuals(event.currentTarget);
      resetDragState();
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

    function getErrorMessage(error) {
      return error?.message || String(error);
    }
    /**
     * Validates whether the dragged node may be dropped into `targetFolderId`.
     * Prevents moving a folder into itself or into one of its own descendants.
     * @param {string|null} dragNodeId - ID of the node being dragged.
     * @param {DragNodeType|null} dragNodeType
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
     * @param {CapturedDragState} [capturedDragState] - Drag state captured before async operation.
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

      if (!capturedDragState) {
        cleanupDragVisuals();
        resetDragState();
      }
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
        setStatus(t("moveFailed", [getErrorMessage(error)]), "error");
      }
    }

    /**
     * Creates container-level drag event handlers using event delegation.
     * This approach eliminates flickering by tracking the current drag-over folder
     * and only updating highlights when the target actually changes.
     * @param {HTMLElement} container - The #bookmark-list container element.
     * @returns {{ attach: Function, detach: Function }}
     */
    function createContainerDragHandlers(container) {

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
        if (!(event.target instanceof Element)) {
          clearCurrentHighlight();
          return;
        }
        const folder = event.target.closest(".folder");
        if (!(folder instanceof HTMLElement)) {
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
        if (dragState.nodeType === "folder") {
          const draggedFolderEl = document.querySelector(
            `[data-folder-id="${dragState.nodeId}"]`,
          );
          if (draggedFolderEl && draggedFolderEl.contains(folder)) {
            clearCurrentHighlight();
            return;
          }
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

        if (!(event.target instanceof Element)) {
          return;
        }
        const folder = event.target.closest(".folder");
        if (!(folder instanceof HTMLElement)) {
          return;
        }

        const folderId = folder.dataset.folderId;
        if (!folderId) {
          return;
        }

        // Capture drag state before async operation to prevent race with dragend.
        const capturedDragState = {
          nodeId: dragState.nodeId,
          nodeType: dragState.nodeType,
          parentId: dragState.parentId,
        };
        event.preventDefault();
        event.stopPropagation();
        cleanupDragVisuals();
        resetDragState();

        // Fetching the target is asynchronous, so report query failures here.
        Promise.resolve()
          .then(() => chrome.bookmarks.get(folderId))
          .then(([targetFolderNode]) => {
            if (!targetFolderNode) {
              setStatus(t("moveFailed", [t("folderNotFound")]), "error");
              return;
            }
            return handleFolderDrop(event, targetFolderNode, capturedDragState);
          })
          .catch((error) => {
            setStatus(t("moveFailed", [getErrorMessage(error)]), "error");
          });
      }

      /**
       * Handles dragleave events at the container level.
       * Clears highlight when the drag leaves the container entirely.
       * @param {DragEvent} event
       */
      function handleDragLeave(event) {
        // Check if we truly left the container
        if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) {
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

      return { attach, detach };
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