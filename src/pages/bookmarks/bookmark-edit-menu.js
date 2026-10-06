/**
 * @file bookmark-edit-menu.js
 * The rich-text context menu for editable elements on the bookmarks page.
 *
 * Right-clicking a text field, a contenteditable region, or anything outside the
 * bookmark tree has page-level behaviour that belongs nowhere else: open the
 * cut/copy/paste menu over the focused editable, and suppress the browser's own
 * menu outside the tree. Both are driven from a single document-level handler,
 * so the module exposes exactly that handler and keeps every selection detail
 * behind it.
 *
 * The composition root injects the collaborators; this module reads no
 * `window.YABM*` global. Exposed as `window.YABMEditMenuModule`.
 */

/**
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlay} BookmarkOverlay
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} EditMenuModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(message: string, type?: 'success'|'error'|'') => void} setStatus
 * @property {BookmarkOverlay} editContextMenu - The menu's own overlay handle.
 * @property {() => void} closeTreeContextMenu
 * @property {() => void} closeSortMenu
 */

/**
 * Public API returned by `createEditMenuModule`.
 * @typedef {Object} EditMenuModule
 * @property {(event: MouseEvent) => void} handleContextMenu
 */

(function () {
  /**
   * Factory that creates the editable-element context menu module.
   * @param {EditMenuModuleDeps} deps
   * @returns {EditMenuModule}
   */
  function createEditMenuModule(deps) {
    const { t, setStatus, editContextMenu, closeTreeContextMenu, closeSortMenu } =
      deps;

    /**
     * Returns `true` if `target` is an editable text field (input, textarea, or
     * contentEditable element) that is neither read-only nor disabled.
     * Used to decide whether to show the text edit context menu on right-click.
     * @param {EventTarget|null} target
     * @returns {target is HTMLElement}
     */
    function isEditableTarget(target) {
      return Boolean(
        target &&
          ((target instanceof HTMLInputElement &&
            !target.readOnly &&
            !target.disabled &&
            (target.type === "text" ||
              target.type === "search" ||
              target.type === "url" ||
              target.type === "email" ||
              target.type === "tel" ||
              target.type === "password")) ||
            (target instanceof HTMLTextAreaElement &&
              !target.readOnly &&
              !target.disabled) ||
            /** @type {HTMLElement} */ (target).isContentEditable),
      );
    }

    /**
     * Returns the currently selected text within an editable target element.
     * @param {HTMLElement|null} target
     * @returns {string}
     */
    function getSelectionTextFromEditable(target) {
      if (!target) {
        return "";
      }
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? start;
        return target.value.slice(start, end);
      }
      const sel = window.getSelection();
      return sel ? sel.toString() : "";
    }

    /**
     * Replaces the current selection in an editable element with `text`.
     * Handles both native input/textarea elements and `contentEditable` nodes.
     * Dispatches an `input` event so dependent listeners (e.g. validators) react.
     * @param {HTMLElement|null} target
     * @param {string} text - Replacement text (empty string to delete the selection).
     * @returns {void}
     */
    function replaceSelectedTextInEditable(target, text) {
      if (!target) {
        return;
      }
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? start;
        target.setRangeText(text, start, end, "end");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      if (target.isContentEditable) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return;
        }
        selection.deleteFromDocument();
        const range = selection.getRangeAt(0);
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    /**
     * Builds and displays the rich-text context menu (cut/copy/paste/delete/select-all)
     * for an editable element at the given screen coordinates.
     * Copy/cut/delete items are disabled when there is no active selection.
     * @param {HTMLElement} target - The focused editable element.
     * @param {number} x - Horizontal screen position.
     * @param {number} y - Vertical screen position.
     * @returns {void}
     */
    function openEditContextMenu(target, x, y) {
      const menu = document.getElementById("edit-context-menu");
      if (!menu) {
        return;
      }
      if (typeof target.focus === "function") {
        target.focus();
      }
      closeTreeContextMenu();
      closeSortMenu();
      menu.innerHTML = "";

      const selectedText = getSelectionTextFromEditable(target);
      const hasSelection = selectedText.length > 0;

      const makeItem = ({ label, icon, onClick, disabled = false }) => {
        const button = document.createElement("button");
        button.className = "tree-context-item";
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.disabled = disabled;
        button.innerHTML = `
          <span class="icon-font" aria-hidden="true">${icon}</span>
          <span>${label}</span>
        `;
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          editContextMenu.close();
          if (!disabled) {
            await onClick();
          }
        });
        return button;
      };

      const addDivider = () => {
        const divider = document.createElement("div");
        divider.className = "tree-context-divider";
        menu.appendChild(divider);
      };

      menu.appendChild(
        makeItem({
          label: t("contextCut"),
          icon: "content_cut",
          disabled: !hasSelection,
          onClick: async () => document.execCommand("cut"),
        }),
      );
      menu.appendChild(
        makeItem({
          label: t("contextCopy"),
          icon: "content_copy",
          disabled: !hasSelection,
          onClick: async () => document.execCommand("copy"),
        }),
      );
      menu.appendChild(
        makeItem({
          label: t("contextPaste"),
          icon: "content_paste",
          onClick: async () => {
            try {
              const text = await navigator.clipboard.readText();
              replaceSelectedTextInEditable(target, text);
            } catch {
              setStatus(t("pastePermissionDenied"), "error");
            }
          },
        }),
      );
      menu.appendChild(
        makeItem({
          label: t("contextDelete"),
          icon: "delete",
          disabled: !hasSelection,
          onClick: async () => replaceSelectedTextInEditable(target, ""),
        }),
      );
      addDivider();
      menu.appendChild(
        makeItem({
          label: t("contextSelectAll"),
          icon: "select_all",
          onClick: async () => {
            if (
              target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement
            ) {
              target.select();
              return;
            }
            if (target.isContentEditable) {
              const range = document.createRange();
              range.selectNodeContents(target);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          },
        }),
      );

      editContextMenu.openAt(x, y);
    }

    /**
     * Document-level right-click behaviour for the whole page: open the edit
     * menu over an editable target, and suppress the browser menu everywhere
     * outside the bookmark tree.
     * @param {MouseEvent} event
     * @returns {void}
     */
    function handleContextMenu(event) {
      const target = /** @type {Element|null} */ (event.target);
      if (isEditableTarget(target)) {
        event.preventDefault();
        openEditContextMenu(target, event.clientX, event.clientY);
        return;
      }
      const isInsideTree = Boolean(
        target &&
          typeof target.closest === "function" &&
          target.closest("#bookmark-list"),
      );
      if (!isInsideTree) {
        event.preventDefault();
      }
    }

    return { handleContextMenu };
  }

  window.YABMEditMenuModule = {
    createEditMenuModule,
  };
})();