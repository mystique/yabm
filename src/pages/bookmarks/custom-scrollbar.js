(function () {
  function createScrollbarModule() {
    const BOOKMARK_SCROLLBAR_METRICS = {
      trackInset: 1,
      thumbInsetTop: 2,
      thumbInsetBottom: 4,
      holdInitialDelayMs: 260,
      holdIntervalMs: 60,
    };

    const bookmarkScrollbarState = {
      holdTimeoutId: null,
      holdIntervalId: null,
      holdDirection: 0,
      holdTickFn: null,
      dragPointerId: null,
      dragStartY: 0,
      dragStartScrollTop: 0,
      globalEventsBound: false,
    };

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

    function getTrackPressDirection(geometry, targetY) {
      if (targetY < geometry.thumbTop) {
        return -1;
      }
      if (targetY > geometry.thumbBottom) {
        return 1;
      }
      return 0;
    }

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

    function isGlobalEventsBound() {
      return bookmarkScrollbarState.globalEventsBound;
    }

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