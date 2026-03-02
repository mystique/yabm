/**
 * @file custom-scrollbar.js
 * Implements a fully custom scrollbar for the bookmark list panel.
 * Supports click-to-scroll, click-and-hold acceleration, and thumb drag with
 * pointer capture. The scrollbar is positioned via JavaScript because the list
 * can overlap the fixed layout sidebar.
 * Exposed as `window.YABMScrollbarModule`.
 */
(function () {
  /**
   * Factory that creates the scrollbar module.
   * @returns {{ updateBookmarkListScrollbar: Function, startBookmarkScrollHold: Function, stopBookmarkScrollHold: Function, startBookmarkTrackPressScroll: Function, handleBookmarkThumbPointerDown: Function, handleBookmarkThumbPointerMove: Function, stopBookmarkThumbDrag: Function, isGlobalEventsBound: Function, setGlobalEventsBound: Function }}
   */
  function createScrollbarModule() {
    /**
     * Layout and timing constants for the custom scrollbar.
     * @type {{ trackInset: number, thumbInsetTop: number, thumbInsetBottom: number, holdInitialDelayMs: number, holdIntervalMs: number }}
     */
    const BOOKMARK_SCROLLBAR_METRICS = {
      trackInset: 1,         // px gap between the list edge and the track ends.
      thumbInsetTop: 2,      // px gap between the track top and the thumb.
      thumbInsetBottom: 4,   // px gap between the track bottom and the thumb.
      holdInitialDelayMs: 260, // ms before scroll-hold repeat begins.
      holdIntervalMs: 60,      // ms between repeat ticks while holding.
    };

    /**
     * Mutable state for the scrollbar's hold and drag interactions.
     * @type {{ holdTimeoutId: number|null, holdIntervalId: number|null, holdDirection: number, holdTickFn: Function|null, dragPointerId: number|null, dragStartY: number, dragStartScrollTop: number, globalEventsBound: boolean }}
     */
    const bookmarkScrollbarState = {
      holdTimeoutId: null,       // setTimeout handle for the initial hold delay.
      holdIntervalId: null,      // setInterval handle for repeated hold ticks.
      holdDirection: 0,          // -1 (up) or 1 (down); 0 means idle.
      holdTickFn: null,          // Optional custom function called on each hold tick.
      dragPointerId: null,       // Active pointer ID during a thumb drag; null when idle.
      dragStartY: 0,             // clientY at drag start, used to compute delta.
      dragStartScrollTop: 0,     // scrollTop at drag start.
      globalEventsBound: false,  // True after global pointermove/pointerup listeners are attached.
    };

    /**
     * Cancels any active click-and-hold scroll timers and resets hold state.
     */
    function stopBookmarkScrollHold() {
      if (bookmarkScrollbarState.holdTimeoutId !== null) {
        window.clearTimeout(bookmarkScrollbarState.holdTimeoutId);
        bookmarkScrollbarState.holdTimeoutId = null;
      }
      if (bookmarkScrollbarState.holdIntervalId !== null) {
        window.clearInterval(bookmarkScrollbarState.holdIntervalId);
        bookmarkScrollbarState.holdIntervalId = null;
      }
      bookmarkScrollbarState.holdDirection = 0;
      bookmarkScrollbarState.holdTickFn = null;
    }

    /**
     * Scrolls the bookmark list by a single step in `direction`.
     * The step size is 16% of the visible list height, clamped to a minimum of 48 px.
     * @param {1|-1} direction - `1` to scroll down, `-1` to scroll up.
     * @param {{ behavior?: ScrollBehavior }} [options]
     */
    function scrollBookmarkListByStep(direction, { behavior = "smooth" } = {}) {
      const list = document.getElementById("bookmark-list");
      if (!list) {
        return;
      }
      const delta = Math.max(48, Math.round(list.clientHeight * 0.16));
      list.scrollBy({
        top: direction * delta,
        behavior,
      });
    }

    /**
     * Scrolls the bookmark list by roughly one page in `direction`.
     * The page size is 82% of the visible list height, clamped to a minimum of 96 px.
     * @param {1|-1} direction - `1` to scroll down, `-1` to scroll up.
     * @param {{ behavior?: ScrollBehavior }} [options]
     */
    function scrollBookmarkListByPage(direction, { behavior = "auto" } = {}) {
      const list = document.getElementById("bookmark-list");
      if (!list) {
        return;
      }
      const delta = Math.max(96, Math.round(list.clientHeight * 0.82));
      list.scrollBy({
        top: direction * delta,
        behavior,
      });
    }

    /**
     * Executes one tick of the scroll-hold loop.
     * If a custom `tickFn` is set it takes precedence; returning `false` stops the hold.
     * Otherwise the list is scrolled by one step in `holdDirection`.
     */
    function runBookmarkScrollHoldTick() {
      const tickFn = bookmarkScrollbarState.holdTickFn;
      if (typeof tickFn === "function") {
        const shouldContinue = tickFn();
        if (!shouldContinue) {
          stopBookmarkScrollHold();
        }
        return;
      }
      if (!bookmarkScrollbarState.holdDirection) {
        stopBookmarkScrollHold();
        return;
      }
      scrollBookmarkListByStep(bookmarkScrollbarState.holdDirection, {
        behavior: "auto",
      });
    }

    /**
     * Begins a click-and-hold scroll sequence: fires one immediate tick then
     * starts a repeating interval after `holdInitialDelayMs`.
     * @param {1|-1} direction - Initial scroll direction.
     * @param {{ tickFn?: (() => boolean)|null }} [options]
     * @param {Function|null} [options.tickFn] - Custom tick function; return `false` to stop early.
     */
    function startBookmarkScrollHold(direction, { tickFn = null } = {}) {
      stopBookmarkScrollHold();
      bookmarkScrollbarState.holdDirection = direction;
      bookmarkScrollbarState.holdTickFn = tickFn;
      runBookmarkScrollHoldTick();
      bookmarkScrollbarState.holdTimeoutId = window.setTimeout(() => {
        bookmarkScrollbarState.holdIntervalId = window.setInterval(() => {
          runBookmarkScrollHoldTick();
        }, BOOKMARK_SCROLLBAR_METRICS.holdIntervalMs);
      }, BOOKMARK_SCROLLBAR_METRICS.holdInitialDelayMs);
    }

    /**
     * Computes the current scrollbar geometry: thumb position, thumb height,
     * track dimensions, and the list's scroll range.
     * Returns `null` if the required DOM elements are missing or the list is not scrollable.
     * @returns {{ list: HTMLElement, track: HTMLElement, thumb: HTMLElement, trackRect: DOMRect, trackHeight: number, maxScroll: number, thumbTop: number, thumbBottom: number }|null}
     */
    function getBookmarkScrollbarGeometry() {
      const list = document.getElementById("bookmark-list");
      const track = document.getElementById("bookmark-scrollbar");
      const thumb = document.getElementById("bookmark-scrollbar-thumb");
      if (!list || !track || !thumb) {
        return null;
      }
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      if (maxScroll <= 0) {
        return null;
      }
      const trackHeight = track.clientHeight;
      const thumbTrackHeight = Math.max(
        0,
        trackHeight -
          BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop -
          BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom,
      );
      if (thumbTrackHeight <= 0) {
        return null;
      }
      const rawThumbHeight = Math.round(
        (list.clientHeight / list.scrollHeight) * thumbTrackHeight,
      );
      const thumbHeight = Math.max(24, Math.min(thumbTrackHeight, rawThumbHeight));
      const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
      const thumbOffset =
        BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop +
        Math.round((list.scrollTop / maxScroll) * maxThumbOffset);
      return {
        list,
        track,
        thumb,
        trackRect: track.getBoundingClientRect(),
        trackHeight,
        maxScroll,
        thumbTop: thumbOffset,
        thumbBottom: thumbOffset + thumbHeight,
      };
    }

    /**
     * Determines the scroll direction when the user clicks on the track outside the thumb.
     * @param {{ thumbTop: number, thumbBottom: number }} geometry
     * @param {number} targetY - Y position within the track (relative to its top).
     * @returns {-1|0|1} `-1` = above thumb, `0` = on thumb, `1` = below thumb.
     */
    function getTrackPressDirection(geometry, targetY) {
      if (targetY < geometry.thumbTop) {
        return -1;
      }
      if (targetY > geometry.thumbBottom) {
        return 1;
      }
      return 0;
    }

    /**
     * Handles a `pointerdown` on the scrollbar track (outside the thumb).
     * Starts a hold scroll that pages towards the click position and stops
     * automatically when the thumb reaches that position.
     * @param {PointerEvent} event
     */
    function startBookmarkTrackPressScroll(event) {
      if (bookmarkScrollbarState.dragPointerId !== null || event.button !== 0) {
        return;
      }
      const geometry = getBookmarkScrollbarGeometry();
      if (!geometry) {
        return;
      }
      const targetY = Math.max(
        0,
        Math.min(geometry.trackHeight, event.clientY - geometry.trackRect.top),
      );
      const initialDirection = getTrackPressDirection(geometry, targetY);
      if (initialDirection === 0) {
        return;
      }
      event.preventDefault();
      startBookmarkScrollHold(initialDirection, {
        tickFn: () => {
          const nextGeometry = getBookmarkScrollbarGeometry();
          if (!nextGeometry) {
            return false;
          }
          const currentDirection = getTrackPressDirection(nextGeometry, targetY);
          if (currentDirection === 0) {
            return false;
          }
          const before = nextGeometry.list.scrollTop;
          scrollBookmarkListByPage(currentDirection, { behavior: "auto" });
          return nextGeometry.list.scrollTop !== before;
        },
      });
    }

    /**
     * Returns the data needed to translate a thumb drag delta into a scroll delta.
     * Returns `null` if the list is not scrollable or elements are missing.
     * @returns {{ list: HTMLElement, maxScroll: number, maxThumbOffset: number }|null}
     */
    function getBookmarkScrollbarDragRange() {
      const list = document.getElementById("bookmark-list");
      const track = document.getElementById("bookmark-scrollbar");
      const thumb = document.getElementById("bookmark-scrollbar-thumb");
      if (!list || !track || !thumb) {
        return null;
      }
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      if (maxScroll <= 0) {
        return null;
      }
      const trackHeight = track.clientHeight;
      const thumbTrackHeight = Math.max(
        0,
        trackHeight -
          BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop -
          BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom,
      );
      const thumbHeight = thumb.offsetHeight || 0;
      const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
      if (maxThumbOffset <= 0) {
        return null;
      }
      return {
        list,
        maxScroll,
        maxThumbOffset,
      };
    }

    /**
     * Initiates a thumb drag operation: captures the pointer, records start
     * coordinates, and adds the dragging visual state.
     * @param {PointerEvent} event
     */
    function handleBookmarkThumbPointerDown(event) {
      const thumb = document.getElementById("bookmark-scrollbar-thumb");
      if (!thumb || event.button !== 0) {
        return;
      }
      const dragRange = getBookmarkScrollbarDragRange();
      if (!dragRange) {
        return;
      }
      event.preventDefault();
      stopBookmarkScrollHold();
      bookmarkScrollbarState.dragPointerId = event.pointerId;
      bookmarkScrollbarState.dragStartY = event.clientY;
      bookmarkScrollbarState.dragStartScrollTop = dragRange.list.scrollTop;
      thumb.classList.add("is-dragging");
      thumb.setPointerCapture(event.pointerId);
    }

    /**
     * Translates vertical pointer movement during a thumb drag into a
     * proportional scroll offset on the bookmark list.
     * @param {PointerEvent} event
     */
    function handleBookmarkThumbPointerMove(event) {
      if (bookmarkScrollbarState.dragPointerId !== event.pointerId) {
        return;
      }
      const dragRange = getBookmarkScrollbarDragRange();
      if (!dragRange) {
        return;
      }
      event.preventDefault();
      const deltaY = event.clientY - bookmarkScrollbarState.dragStartY;
      const scrollDelta = (deltaY / dragRange.maxThumbOffset) * dragRange.maxScroll;
      const nextScrollTop = Math.max(
        0,
        Math.min(
          dragRange.maxScroll,
          bookmarkScrollbarState.dragStartScrollTop + scrollDelta,
        ),
      );
      dragRange.list.scrollTop = nextScrollTop;
    }

    /**
     * Ends a thumb drag: releases pointer capture, removes the dragging class,
     * and resets drag state.
     * @param {number|null} [pointerId=null] - If provided, only stops if it matches the active drag pointer.
     */
    function stopBookmarkThumbDrag(pointerId = null) {
      if (
        bookmarkScrollbarState.dragPointerId === null ||
        (pointerId !== null && pointerId !== bookmarkScrollbarState.dragPointerId)
      ) {
        return;
      }
      const thumb = document.getElementById("bookmark-scrollbar-thumb");
      if (thumb && bookmarkScrollbarState.dragPointerId !== null) {
        try {
          thumb.releasePointerCapture(bookmarkScrollbarState.dragPointerId);
        } catch {
          // ignored
        }
        thumb.classList.remove("is-dragging");
      }
      bookmarkScrollbarState.dragPointerId = null;
      bookmarkScrollbarState.dragStartY = 0;
      bookmarkScrollbarState.dragStartScrollTop = 0;
    }

    /**
     * Synchronises the custom scrollbar's position, size, and visibility with the
     * current scroll state of the bookmark list.
     * Positions the track, up/down arrow buttons, and thumb via absolute pixel coords
     * derived from the list's bounding rect. Hides everything when the list is
     * not tall enough to overflow.
     */
    function updateBookmarkListScrollbar() {
      const list = document.getElementById("bookmark-list");
      const track = document.getElementById("bookmark-scrollbar");
      const thumb = document.getElementById("bookmark-scrollbar-thumb");
      const upArrow = document.getElementById("bookmark-scroll-up");
      const downArrow = document.getElementById("bookmark-scroll-down");
      if (!list || !track || !thumb || !upArrow || !downArrow) {
        return;
      }

      const listRect = list.getBoundingClientRect();
      const trackWidth = 8;
      const trackInset = BOOKMARK_SCROLLBAR_METRICS.trackInset;
      const trackHeight = Math.max(0, Math.round(listRect.height - trackInset * 2));
      const rawTrackLeft = Math.round(listRect.right + 28);
      const trackTop = Math.round(listRect.top + trackInset);

      const maxScroll = list.scrollHeight - list.clientHeight;
      if (maxScroll <= 0 || trackHeight <= 20) {
        track.classList.add("hidden");
        upArrow.classList.add("hidden");
        downArrow.classList.add("hidden");
        thumb.style.height = "";
        thumb.style.transform = "";
        return;
      }

      track.classList.remove("hidden");
      upArrow.classList.remove("hidden");
      downArrow.classList.remove("hidden");
      const trackVisualWidth = track.offsetWidth || trackWidth;
      const maxTrackLeft = window.innerWidth - trackVisualWidth - 4;
      const trackLeft = Math.min(rawTrackLeft, maxTrackLeft);
      track.style.top = `${trackTop}px`;
      track.style.left = `${trackLeft}px`;
      track.style.height = `${trackHeight}px`;
      const arrowWidth = upArrow.offsetWidth || 16;
      const arrowHeight = upArrow.offsetHeight || 14;
      const arrowLeft = Math.round(
        trackLeft + trackVisualWidth / 2 - arrowWidth / 2,
      );
      upArrow.style.left = `${arrowLeft - 2}px`;
      downArrow.style.left = `${arrowLeft - 2}px`;
      upArrow.style.top = `${Math.round(trackTop - arrowHeight)}px`;
      downArrow.style.top = `${Math.round(trackTop + trackHeight - 2)}px`;
      const thumbInsetTop = BOOKMARK_SCROLLBAR_METRICS.thumbInsetTop;
      const thumbInsetBottom = BOOKMARK_SCROLLBAR_METRICS.thumbInsetBottom;
      const thumbTrackHeight = Math.max(
        0,
        trackHeight - thumbInsetTop - thumbInsetBottom,
      );
      if (thumbTrackHeight <= 0) {
        track.classList.add("hidden");
        thumb.style.height = "";
        thumb.style.transform = "";
        return;
      }
      const rawThumbHeight = Math.round(
        (list.clientHeight / list.scrollHeight) * thumbTrackHeight,
      );
      const thumbHeight = Math.max(24, Math.min(thumbTrackHeight, rawThumbHeight));
      const maxThumbOffset = Math.max(0, thumbTrackHeight - thumbHeight);
      const thumbOffset =
        thumbInsetTop + Math.round((list.scrollTop / maxScroll) * maxThumbOffset);
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${thumbOffset}px)`;
    }

    /**
     * Returns whether global pointer event listeners (move/up) have been bound.
     * @returns {boolean}
     */
    function isGlobalEventsBound() {
      return bookmarkScrollbarState.globalEventsBound;
    }

    /**
     * Sets the flag that tracks whether global pointer event listeners are bound.
     * @param {boolean} value
     */
    function setGlobalEventsBound(value) {
      bookmarkScrollbarState.globalEventsBound = value;
    }

    return {
      updateBookmarkListScrollbar,
      startBookmarkScrollHold,
      stopBookmarkScrollHold,
      startBookmarkTrackPressScroll,
      handleBookmarkThumbPointerDown,
      handleBookmarkThumbPointerMove,
      stopBookmarkThumbDrag,
      isGlobalEventsBound,
      setGlobalEventsBound,
    };
  }

  window.YABMScrollbarModule = {
    createScrollbarModule,
  };
})();