/**
 * @file bookmark-overlay.js
 * Viewport-anchored overlay primitives for the bookmarks page.
 *
 * Every floating menu and the global tooltip are overlays: an element that is
 * shown, positioned relative to a point or an anchor, and dismissed again. This
 * module owns the three concerns all of them share, so no call site has to:
 *   - placement: measure the element and clamp it fully inside the viewport;
 *   - lifecycle: show, hide, and track open state idempotently;
 *   - dismissal: outside click, Escape, page scroll, and window resize.
 *
 * Callers supply the content and the anchor; they never compute coordinates.
 * Exposed as `window.YABMBookmarkOverlayModule`.
 */

/**
 * Size used when an overlay reports a zero measurement, so a clamp never
 * collapses to the viewport edge. Safety net only: overlays are un-hidden
 * before they are measured, so a visible overlay always reports its real size.
 * @typedef {Object} OverlayFallbackSize
 * @property {number} width
 * @property {number} height
 */

/**
 * Shift applied to a point placement, e.g. to keep a tooltip off the cursor.
 * @typedef {Object} OverlayOffset
 * @property {number} x
 * @property {number} y
 */

/**
 * Registration record for one overlay: where it lives, how it is measured, and
 * which dismissal rules apply to it.
 * @typedef {Object} OverlayConfig
 * @property {string} id - Stable name, used in error messages.
 * @property {() => HTMLElement | null} getElement - Resolves the overlay element. Called on every use so a re-rendered element is never cached.
 * @property {OverlayFallbackSize} fallbackSize
 * @property {OverlayOffset} [offset] - Shift applied to point placements.
 * @property {number} [anchorGap] - Vertical gap below an anchor element for anchor placements.
 * @property {boolean} [clearContent] - Empties the element when it closes, so the next open starts from a blank menu.
 * @property {() => void} [onClose] - Releases caller state that must not outlive an open overlay.
 * @property {boolean} [dismissOnOutsideClick] - Defaults to true. The app tooltip opts out: a click elsewhere may itself be a click on the element it describes, and it already hides on mouseout/focusout.
 * @property {boolean} [dismissOnViewportChange] - Defaults to true. The folder sort menu opts out, preserving the pre-existing behaviour in which scroll and resize left it open.
 */

/**
 * Handle returned by `createOverlay`. Everything a caller needs to drive one
 * overlay: no coordinates, no class names, no listeners.
 * @typedef {Object} BookmarkOverlay
 * @property {() => void} close - Hides the overlay. A no-op when already closed.
 * @property {() => boolean} isOpen
 * @property {(x: number, y: number) => boolean} openAt - Shows the overlay with its top-left at a viewport point. Returns whether it is now open.
 * @property {(anchorEl: HTMLElement) => boolean} openBelow - Shows the overlay below an anchor, right-aligned to the anchor's right edge. Returns whether it is now open.
 * @property {(x: number, y: number) => void} reposition - Re-clamps an already-open overlay to a new viewport point.
 */

/**
 * Public API exposed as `window.YABMBookmarkOverlayModule`.
 * @typedef {Object} BookmarkOverlayModule
 * @property {(config: OverlayConfig) => BookmarkOverlay} createOverlay
 */

/**
 * One registered overlay, pairing its config with the handle callers hold.
 * @typedef {Object} OverlayEntry
 * @property {OverlayConfig} config
 * @property {BookmarkOverlay} overlay
 */

(function () {
  /** Class used to hide every overlay in this page. */
  const HIDDEN_CLASS = "hidden";

  /**
   * Gap, in CSS pixels, kept between an overlay and each viewport edge.
   *
   * Standardised on 8: three of the five hand-rolled clamps already used 8
   * (both context menus and the sort menu), 8 is the same magnitude as the gap
   * the anchor-placed menus left below their trigger, and 8 keeps the breathing
   * room uniform with the rest of the page chrome.
   */
  const OVERLAY_VIEWPORT_MARGIN = 8;

  /**
   * Clamps a desired coordinate so a box of `boxExtent` pixels stays fully on
   * screen with `OVERLAY_VIEWPORT_MARGIN` pixels to spare on both sides.
   * @param {number} desired - Unclamped coordinate along this axis.
   * @param {number} viewportExtent - `window.innerWidth` or `window.innerHeight`.
   * @param {number} boxExtent - The overlay's measured extent along this axis.
   * @returns {number} The clamped coordinate, in CSS pixels.
   */
  function clampToViewport(desired, viewportExtent, boxExtent) {
    return Math.min(
      viewportExtent - boxExtent - OVERLAY_VIEWPORT_MARGIN,
      Math.max(OVERLAY_VIEWPORT_MARGIN, desired),
    );
  }

  /**
   * Every overlay registered on this page. Created together with the shared
   * listeners, so the page installs one click, one key, one scroll, and one
   * resize listener in total rather than one set per overlay.
   * @type {Set<OverlayEntry> | null}
   */
  let registry = null;

  /**
   * Closes every overlay whose element does not contain the clicked node.
   * @param {MouseEvent} event
   * @returns {void}
   */
  function handleDocumentClick(event) {
    const entries = registry;
    const target = /** @type {Node | null} */ (event.target);
    for (const entry of entries || []) {
      if (!entry.config.dismissOnOutsideClick) {
        continue;
      }
      const element = entry.config.getElement();
      if (target && element && element.contains(target)) {
        continue;
      }
      entry.overlay.close();
    }
  }

  /**
   * Escape dismisses every overlay, including the app tooltip.
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  function handleKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    for (const entry of [...(registry || [])]) {
      entry.overlay.close();
    }
  }

  /**
   * Scroll and resize dismiss every overlay that opted in, before the page can
   * move out from under an overlay anchored to a stale rectangle.
   * @returns {void}
   */
  function handleViewportChange() {
    for (const entry of [...(registry || [])]) {
      if (entry.config.dismissOnViewportChange) {
        entry.overlay.close();
      }
    }
  }

  /**
   * Creates the registry and installs the shared dismissal listeners, once.
   * @returns {Set<OverlayEntry>}
   */
  function ensureRegistry() {
    if (registry) {
      return registry;
    }
    registry = new Set();
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return registry;
  }

  /**
   * Registers a viewport-anchored overlay and returns its handle.
   * @param {OverlayConfig} config
   * @returns {BookmarkOverlay}
   */
  function createOverlay(config) {
    if (!config || !config.id) {
      throw new Error("createOverlay requires a config with an id");
    }
    const entries = ensureRegistry();
    const offset = config.offset || { x: 0, y: 0 };
    const anchorGap = config.anchorGap || 0;
    let open = false;

    /**
     * @returns {HTMLElement | null}
     */
    function getElement() {
      return config.getElement();
    }

    /**
     * @returns {boolean}
     */
    function isOpen() {
      return open;
    }

    /**
     * Reveals the overlay so it can be measured. Returns false when the element
     * is missing, leaving the overlay closed.
     * @returns {boolean}
     */
    function show() {
      const element = getElement();
      if (!element) {
        return false;
      }
      element.classList.remove(HIDDEN_CLASS);
      open = true;
      return true;
    }

    /**
     * Hides the overlay and releases whatever it was holding. Safe to call when
     * already closed.
     * @returns {void}
     */
    function close() {
      if (!open) {
        return;
      }
      open = false;
      const element = getElement();
      if (element) {
        element.classList.add(HIDDEN_CLASS);
        if (config.clearContent) {
          element.innerHTML = "";
        }
      }
      if (config.onClose) {
        config.onClose();
      }
    }

    /**
     * Measures the overlay and writes its clamped position onto the element.
     * @param {number} desiredX
     * @param {number} desiredY
     * @returns {void}
     */
    function place(desiredX, desiredY) {
      const element = getElement();
      if (!element) {
        return;
      }
      const width = element.offsetWidth || config.fallbackSize.width;
      const height = element.offsetHeight || config.fallbackSize.height;
      element.style.left = `${clampToViewport(desiredX, window.innerWidth, width)}px`;
      element.style.top = `${clampToViewport(desiredY, window.innerHeight, height)}px`;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    function openAt(x, y) {
      if (!show()) {
        return false;
      }
      place(x + offset.x, y + offset.y);
      return true;
    }

    /**
     * @param {HTMLElement | null} anchorEl
     * @returns {boolean}
     */
    function openBelow(anchorEl) {
      if (!anchorEl || !show()) {
        return false;
      }
      const element = getElement();
      if (!element) {
        return false;
      }
      const rect = anchorEl.getBoundingClientRect();
      const width = element.offsetWidth || config.fallbackSize.width;
      place(rect.right - width, rect.bottom + anchorGap);
      return true;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    function reposition(x, y) {
      if (!open) {
        return;
      }
      place(x + offset.x, y + offset.y);
    }

    /** @type {BookmarkOverlay} */
    const overlay = { close, isOpen, openAt, openBelow, reposition };
    entries.add({ config, overlay });
    return overlay;
  }

  window.YABMBookmarkOverlayModule = { createOverlay };
})();
