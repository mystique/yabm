(function () {
  function createNotificationsModule() {
    let topToastTimer = null;
    let topToastHideTimer = null;
    let topProgressActiveCount = 0;
    let topProgressHideTimer = null;

    function getTopProgressElements() {
      const progress = document.getElementById("top-progress");
      const bar = progress?.querySelector(".top-progress-bar") || null;
      return { progress, bar };
    }

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

    function updateTopProgress(value) {
      setTopProgressValue(value);
    }

    function hideTopProgress() {
      const { progress, bar } = getTopProgressElements();
      if (!progress) {
        return;
      }
      topProgressActiveCount = Math.max(0, topProgressActiveCount - 1);
      if (topProgressActiveCount > 0) {
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