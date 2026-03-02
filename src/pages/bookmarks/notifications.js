/**
 * @file notifications.js
 * Toast and top progress-bar notification helpers for the bookmarks page.
 * Exposed globally as `window.YABMNotificationsModule`.
 */
(function () {
  /**
   * Factory that creates an isolated notifications module instance.
   * @returns {{ showTopToast: Function, hideTopToast: Function, showTopProgress: Function, hideTopProgress: Function, updateTopProgress: Function }}
   */
  function createNotificationsModule() {
    // Pending auto-dismiss timer for the toast; cleared on early hide or re-show.
    let topToastTimer = null;
    // Pending CSS-transition cleanup timer that resets toast DOM after it fades out.
    let topToastHideTimer = null;
    // Reference count of concurrent callers that have requested the progress bar.
    // The bar stays visible until every caller invokes hideTopProgress().
    let topProgressActiveCount = 0;
    // Timer used to fully hide and reset the progress bar after its CSS fade-out.
    let topProgressHideTimer = null;

    /**
     * Returns the top progress bar container and its inner bar element.
     * @returns {{ progress: HTMLElement|null, bar: HTMLElement|null }}
     */
    function getTopProgressElements() {
      const progress = document.getElementById("top-progress");
      const bar = progress?.querySelector(".top-progress-bar") || null;
      return { progress, bar };
    }

    /**
     * Sets the progress bar fill ratio in determinate mode.
     * Switches the bar to determinate mode and updates its CSS width.
     * @param {number} value - Fill ratio in [0, 1]; clamped and defaults to 0 if non-finite.
     */
    function setTopProgressValue(value) {
      const { progress, bar } = getTopProgressElements();
      if (!progress || !bar) {
        return;
      }
      const normalized = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
      progress.classList.add("is-determinate");
      bar.style.width = `${Math.round(normalized * 100)}%`;
    }

    /**
     * Dismisses the toast notification immediately, clearing any pending timers.
     * Schedules CSS-class cleanup after the hide transition completes.
     */
    function hideTopToast() {
      const toast = document.getElementById("top-toast");
      if (!toast) {
        return;
      }
      if (topToastTimer) {
        window.clearTimeout(topToastTimer);
        topToastTimer = null;
      }
      if (topToastHideTimer) {
        window.clearTimeout(topToastHideTimer);
        topToastHideTimer = null;
      }
      toast.classList.remove("is-open");
      topToastHideTimer = window.setTimeout(() => {
        toast.classList.add("hidden");
        toast.textContent = "";
        toast.classList.remove("success", "error");
        topToastHideTimer = null;
      }, 220);
    }

    /**
     * Displays a temporary toast notification, replacing any currently visible one.
     * The toast auto-dismisses after ~3.2 s.
     * @param {string} message - Text content to display.
     * @param {'success'|'error'|''} [type] - Optional CSS modifier class applied to the toast.
     */
    function showTopToast(message, type) {
      const toast = document.getElementById("top-toast");
      if (!toast || !message) {
        return;
      }
      if (topToastTimer) {
        window.clearTimeout(topToastTimer);
        topToastTimer = null;
      }
      if (topToastHideTimer) {
        window.clearTimeout(topToastHideTimer);
        topToastHideTimer = null;
      }

      toast.textContent = message;
      toast.classList.remove("hidden", "success", "error");
      if (type) {
        toast.classList.add(type);
      }
      requestAnimationFrame(() => {
        toast.classList.add("is-open");
      });

      topToastTimer = window.setTimeout(() => {
        hideTopToast();
      }, 3200);
    }

    /**
     * Shows the top progress bar and increments the active-caller reference count.
     * Safe to call concurrently: the bar stays visible until every caller hides it.
     * @param {object} [options]
     * @param {'indeterminate'|'determinate'} [options.mode='indeterminate'] - Animation mode.
     * @param {number} [options.value=0] - Initial fill ratio for determinate mode.
     */
    function showTopProgress({ mode = "indeterminate", value = 0 } = {}) {
      const { progress, bar } = getTopProgressElements();
      if (!progress) {
        return;
      }
      topProgressActiveCount += 1;
      if (topProgressHideTimer) {
        window.clearTimeout(topProgressHideTimer);
        topProgressHideTimer = null;
      }
      if (mode === "determinate") {
        setTopProgressValue(value);
      } else {
        progress.classList.remove("is-determinate");
        if (bar) {
          bar.style.width = "";
        }
      }
      progress.classList.remove("hidden");
      requestAnimationFrame(() => {
        progress.classList.add("is-active");
      });
    }

    /**
     * Updates the progress bar fill ratio while it is in determinate mode.
     * @param {number} value - New fill ratio in [0, 1].
     */
    function updateTopProgress(value) {
      setTopProgressValue(value);
    }

    /**
     * Decrements the active-caller count and hides the progress bar when it reaches zero.
     * A short delay allows the CSS fade-out to complete before fully hiding the element.
     */
    function hideTopProgress() {
      const { progress, bar } = getTopProgressElements();
      if (!progress) {
        return;
      }
      topProgressActiveCount = Math.max(0, topProgressActiveCount - 1);
      if (topProgressActiveCount > 0) {
        // Other callers are still in progress; keep the bar visible.
        return;
      }
      progress.classList.remove("is-active");
      if (topProgressHideTimer) {
        window.clearTimeout(topProgressHideTimer);
      }
      topProgressHideTimer = window.setTimeout(() => {
        if (topProgressActiveCount === 0) {
          progress.classList.add("hidden");
          progress.classList.remove("is-determinate");
          if (bar) {
            bar.style.width = "";
          }
        }
        topProgressHideTimer = null;
      }, 160);
    }

    return {
      showTopToast,
      hideTopToast,
      showTopProgress,
      hideTopProgress,
      updateTopProgress,
    };
  }

  window.YABMNotificationsModule = {
    createNotificationsModule,
  };
})();