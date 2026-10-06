/**
 * @file bookmark-tooltip.js
 * The shared tooltip for every `[data-tooltip]` element on the bookmarks page.
 *
 * Elements describe themselves with a `data-tooltip` attribute and this module
 * turns that attribute into one visible tooltip, driven by hover and by focus.
 * The hover/focus bookkeeping, the follow-the-cursor behaviour, and the rules
 * for when the tooltip must disappear are all internal: callers only bind the
 * listeners once and write the attributes they want described.
 *
 * Exposed as `window.YABMTooltipModule`.
 */

/**
 * @typedef {import("./bookmark-overlay.js").BookmarkOverlayModule} BookmarkOverlayModule
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} TooltipModuleDeps
 * @property {BookmarkOverlayModule["createOverlay"]} createOverlay
 */

/**
 * Public API returned by `createTooltipModule`.
 * @typedef {Object} TooltipModule
 * @property {() => void} bindEvents
 */

(function () {
  /**
   * Factory that creates the shared tooltip module.
   * @param {TooltipModuleDeps} deps
   * @returns {TooltipModule}
   */
  function createTooltipModule(deps) {
    const { createOverlay } = deps;

    // The element the tooltip currently describes; null while it is hidden.
    /** @type {HTMLElement | null} */
    let tooltipTarget = null;

    /**
     * @returns {HTMLElement | null}
     */
    function getTooltipElement() {
      return document.getElementById("app-tooltip");
    }

    const appTooltip = createOverlay({
      id: "appTooltip",
      getElement: getTooltipElement,
      fallbackSize: { width: 180, height: 36 },
      offset: { x: 12, y: 12 },
      clearContent: true,
      // A tooltip is dismissed by leaving the element it describes, not by an
      // outside click: that click is frequently the click on the described
      // element itself, which would blank the text mid-hover.
      dismissOnOutsideClick: false,
      onClose: () => {
        tooltipTarget = null;
      },
    });

    /**
     * Shows the tooltip described by `target`, or hides it when the target has
     * no tooltip text.
     * @param {HTMLElement} target - The element carrying `data-tooltip`.
     * @param {number} x - Horizontal viewport position.
     * @param {number} y - Vertical viewport position.
     * @returns {void}
     */
    function showAppTooltip(target, x, y) {
      const text = target?.dataset?.tooltip?.trim();
      const appTooltipEl = getTooltipElement();
      if (!text || !appTooltipEl) {
        appTooltip.close();
        return;
      }
      tooltipTarget = target;
      appTooltipEl.textContent = text;
      appTooltip.openAt(x, y);
    }

    /**
     * Attaches the hover and focus listeners that drive the shared tooltip.
     * Must be called once, after the DOM is ready.
     * @returns {void}
     */
    function bindEvents() {
      document.addEventListener("mouseover", (event) => {
        const target = /** @type {HTMLElement|null|undefined} */ (
          /** @type {Element|null} */ (event.target)?.closest?.("[data-tooltip]")
        );
        if (!target) {
          return;
        }
        showAppTooltip(target, event.clientX, event.clientY);
      });

      document.addEventListener("mousemove", (event) => {
        if (!tooltipTarget) {
          return;
        }
        appTooltip.reposition(event.clientX, event.clientY);
      });

      document.addEventListener("mouseout", (event) => {
        if (!tooltipTarget) {
          return;
        }
        const related = /** @type {Node|null} */ (event.relatedTarget);
        if (related && tooltipTarget.contains(related)) {
          return;
        }
        const target = /** @type {Node|null} */ (event.target);
        if (target && tooltipTarget.contains(target)) {
          appTooltip.close();
        }
      });

      document.addEventListener("focusin", (event) => {
        const target = /** @type {HTMLElement|null|undefined} */ (
          /** @type {Element|null} */ (event.target)?.closest?.("[data-tooltip]")
        );
        if (!target) {
          return;
        }
        const rect = target.getBoundingClientRect();
        showAppTooltip(target, rect.left + rect.width / 2, rect.bottom);
      });

      document.addEventListener("focusout", (event) => {
        const target = /** @type {Node|null} */ (event.target);
        if (tooltipTarget && target && tooltipTarget.contains(target)) {
          appTooltip.close();
        }
      });
    }

    return { bindEvents };
  }

  window.YABMTooltipModule = {
    createTooltipModule,
  };
})();