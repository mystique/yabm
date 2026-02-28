(function () {
  function createModalsModule(deps) {
    const {
      t,
      setStatus,
      showTopToast,
      setWebdavStatusIndicator,
      refreshWebdavStatusBar,
    } = deps;

    const MODAL_ANIM_MS = 180;
    const modalCloseTimers = new WeakMap();

    const configState = {
      tested: false,
      directoryUrl: "",
      files: [],
    };

    function updateStatusElement(statusEl, baseClassName, message, type) {
      if (!statusEl) {
        return;
      }
      const hasMessage = Boolean(message && String(message).trim());
      statusEl.className = baseClassName;
      if (!hasMessage) {
        statusEl.classList.add("is-hidden");
        statusEl.setAttribute("aria-hidden", "true");
        statusEl.textContent = "";
        return;
      }
      statusEl.textContent = message;
      statusEl.removeAttribute("aria-hidden");
      if (type) {
        statusEl.classList.add(type);
      }
    }

    function setConfigStatus(message, type) {
      const statusEl = document.getElementById("cfg-status");
      updateStatusElement(statusEl, "sync-status", message, type);
      if (message && (type === "success" || type === "error")) {
        showTopToast(message, type);
      }
    }

    function setEditorStatus(message, type) {
      const statusEl = document.getElementById("editor-status");
      updateStatusElement(statusEl, "sync-status", message, type);
      if (message && (type === "success" || type === "error")) {
        showTopToast(message, type);
      }
    }

    function clearModalCloseTimer(modal) {
      const activeTimer = modalCloseTimers.get(modal);
      if (activeTimer) {
        window.clearTimeout(activeTimer);
        modalCloseTimers.delete(modal);
      }
    }

    function openModal(modal) {
      if (!modal) {
        return;
      }
      clearModalCloseTimer(modal);
      modal.classList.remove("hidden", "is-closing");
      requestAnimationFrame(() => {
        modal.classList.add("is-open");
      });
    }

    function closeModal(modal) {
      if (!modal || modal.classList.contains("hidden")) {
        return;
      }
      clearModalCloseTimer(modal);
      modal.classList.remove("is-open");
      modal.classList.add("is-closing");
      const timer = window.setTimeout(() => {
        modal.classList.add("hidden");
        modal.classList.remove("is-closing");
        modalCloseTimers.delete(modal);
      }, MODAL_ANIM_MS);
      modalCloseTimers.set(modal, timer);
    }

    function normalizeFileName(fileName) {
      const value = (fileName || "").trim();
      if (!value) {
        return "bookmarks.html";
      }
      return value.toLowerCase().endsWith(".html") ? value : `${value}.html`;
    }

    function formatFileSize(sizeValue) {
      const bytes = Number.parseInt(sizeValue, 10);
      if (!Number.isFinite(bytes) || bytes < 0) {
        return "-";
      }
      if (bytes < 1024) {
        return `${bytes} B`;
      }
      const units = ["KB", "MB", "GB", "TB"];
      let value = bytes / 1024;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      const text = value >= 100 ? value.toFixed(0) : value.toFixed(2);
      return `${text.replace(/\.?0+$/, "")} ${units[unitIndex]}`;
    }

    function formatLastModifiedParts(lastModifiedValue) {
      const date = new Date(lastModifiedValue);
      if (!lastModifiedValue || Number.isNaN(date.getTime())) {
        return {
          dateText: "---- -- --",
          timeText: "--:--:--",
        };
      }
      const pad = (n) => String(n).padStart(2, "0");
      return {
        dateText: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        timeText: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      };
    }

    function buildFileMetaHtml(file) {
      const sizeText = formatFileSize(file?.size);
      const { dateText, timeText } = formatLastModifiedParts(file?.lastModified);
      return `<span class="file-size">${sizeText}</span><span class="file-datetime"><span>${dateText}</span><span>${timeText}</span></span>`;
    }

    function renderConfigFileList(files, selectedName) {
      const container = document.getElementById("cfg-files");
      container.innerHTML = "";

      const createOption = document.createElement("div");
      createOption.className = "file-item";
      createOption.innerHTML = `<label><input type="radio" name="cfg-file-select" value="__new__"><span>${t("createNewFile")}</span></label>`;
      container.appendChild(createOption);

      for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";

        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "cfg-file-select";
        radio.value = file.name;

        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = file.name;

        label.append(radio, name);
        item.appendChild(label);

        const meta = document.createElement("span");
        meta.className = "file-meta";
        meta.innerHTML = buildFileMetaHtml(file);
        item.appendChild(meta);

        container.appendChild(item);
      }

      const target = selectedName || "bookmarks.html";
      const radios = container.querySelectorAll('input[name="cfg-file-select"]');
      let matched = false;

      for (const radio of radios) {
        if (radio.value === target) {
          radio.checked = true;
          matched = true;
          break;
        }
      }

      if (!matched) {
        const newRadio = container.querySelector('input[value="__new__"]');
        if (newRadio) {
          newRadio.checked = true;
        }
      }
    }

    function getSelectedConfigFileName() {
      const checked = document.querySelector(
        'input[name="cfg-file-select"]:checked',
      );
      if (!checked) {
        return "";
      }

      if (checked.value === "__new__") {
        return normalizeFileName(
          document.getElementById("cfg-new-file-name").value,
        );
      }

      return checked.value;
    }

    function invalidateConfigTest() {
      configState.tested = false;
      configState.directoryUrl = "";
      configState.files = [];
      const section = document.getElementById("cfg-file-section");
      section.classList.remove("is-open");
    }

    async function openConfigModal() {
      const modal = document.getElementById("config-modal");
      openModal(modal);

      const config = await window.YABMSync.getConfig();
      if (!config) {
        return;
      }

      document.getElementById("cfg-directory-url").value =
        config.directoryUrl || "";
      document.getElementById("cfg-username").value = config.username || "";
      document.getElementById("cfg-password").value = config.password || "";
      document.getElementById("cfg-new-file-name").value =
        config.fileName || "bookmarks.html";

      setConfigStatus("", "");
      invalidateConfigTest();
    }

    function closeConfigModal() {
      const modal = document.getElementById("config-modal");
      closeModal(modal);
    }

    async function testConfigConnection() {
      const testBtn = document.getElementById("cfg-test");
      testBtn.disabled = true;
      setConfigStatus(t("testingWebdavConnection"), "");

      try {
        const directoryUrl = document
          .getElementById("cfg-directory-url")
          .value.trim();
        const username = document.getElementById("cfg-username").value.trim();
        const password = document.getElementById("cfg-password").value;

        const result = await window.YABMSync.listDirectoryFiles({
          directoryUrl,
          username,
          password,
        });

        configState.tested = true;
        configState.directoryUrl = result.directoryUrl;
        configState.files = result.files;

        document.getElementById("cfg-file-section").classList.add("is-open");
        renderConfigFileList(
          result.files,
          normalizeFileName(document.getElementById("cfg-new-file-name").value),
        );

        if (!result.files.length) {
          setConfigStatus(t("connSuccessNoFiles"), "success");
        } else {
          setConfigStatus(
            t("connSuccessFoundFiles", [String(result.files.length)]),
            "success",
          );
        }
      } catch (error) {
        invalidateConfigTest();
        setConfigStatus(t("connectionFailed", [error.message]), "error");
      } finally {
        testBtn.disabled = false;
      }
    }

    async function saveConfigFromModal() {
      if (!configState.tested) {
        setConfigStatus(t("testBeforeSave"), "error");
        return;
      }

      const fileName = getSelectedConfigFileName();
      if (!fileName) {
        setConfigStatus(t("selectOrEnterFile"), "error");
        return;
      }

      const payload = {
        directoryUrl: configState.directoryUrl,
        username: document.getElementById("cfg-username").value.trim(),
        password: document.getElementById("cfg-password").value,
        fileName,
      };

      try {
        await window.YABMSync.saveConfig(payload);
        setConfigStatus(t("configurationSaved"), "success");
        setStatus(t("configurationSaved"), "success");
        closeConfigModal();
        await refreshWebdavStatusBar();
      } catch (error) {
        setConfigStatus(t("saveFailed", [error.message]), "error");
      }
    }

    async function clearConfigFromModal() {
      const confirmed = await openPromptModal({
        title: t("clearConfigurationTitle"),
        message: t("clearConfigurationMessage"),
        confirmLabel: t("clear"),
        cancelLabel: t("cancel"),
      });
      if (!confirmed) {
        return;
      }

      try {
        await window.YABMSync.clearConfig();
        document.getElementById("cfg-directory-url").value = "";
        document.getElementById("cfg-username").value = "";
        document.getElementById("cfg-password").value = "";
        document.getElementById("cfg-new-file-name").value = "bookmarks.html";
        invalidateConfigTest();
        setConfigStatus(t("configurationCleared"), "success");
        setStatus(t("configurationCleared"), "success");
        await refreshWebdavStatusBar();
      } catch (error) {
        setConfigStatus(t("clearFailed", [error.message]), "error");
      }
    }

    function openPromptModal({
      title,
      message,
      confirmLabel = t("promptConfirm"),
      cancelLabel = t("cancel"),
    }) {
      const modal = document.getElementById("prompt-modal");
      const titleEl = document.getElementById("prompt-title");
      const messageEl = document.getElementById("prompt-message");
      const confirmBtn = document.getElementById("prompt-confirm");
      const cancelBtn = document.getElementById("prompt-cancel");

      titleEl.textContent = title || t("promptNotice");
      messageEl.textContent = message || "";
      confirmBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;

      openModal(modal);

      return new Promise((resolve) => {
        const cleanup = () => {
          confirmBtn.removeEventListener("click", onConfirm);
          cancelBtn.removeEventListener("click", onCancel);
          closeModal(modal);
        };

        const onConfirm = () => {
          cleanup();
          resolve(true);
        };

        const onCancel = () => {
          cleanup();
          resolve(false);
        };

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
      });
    }

    function openEditorModal({
      title,
      nameLabel,
      nameValue = "",
      urlValue = "",
      urlVisible = false,
      saveLabel = t("save"),
    }) {
      const modal = document.getElementById("editor-modal");
      const titleEl = document.getElementById("editor-title");
      const nameLabelEl = document.getElementById("editor-name-label");
      const nameInput = document.getElementById("editor-name");
      const urlField = document.getElementById("editor-url-field");
      const urlInput = document.getElementById("editor-url");
      const saveBtn = document.getElementById("editor-save");
      const cancelBtn = document.getElementById("editor-cancel");

      titleEl.textContent = title || t("editorEdit");
      nameLabelEl.textContent = nameLabel || t("editorName");
      nameInput.value = nameValue || "";
      urlInput.value = urlVisible ? urlValue || "" : "";
      urlInput.disabled = !urlVisible;
      saveBtn.textContent = saveLabel;
      setEditorStatus("", "");
      urlField.classList.toggle("hidden", !urlVisible);

      openModal(modal);
      window.setTimeout(() => nameInput.focus(), 0);

      return new Promise((resolve) => {
        const cleanup = () => {
          saveBtn.removeEventListener("click", onSave);
          cancelBtn.removeEventListener("click", onCancel);
          nameInput.removeEventListener("keydown", onKeyDown);
          urlInput.removeEventListener("keydown", onKeyDown);
          closeModal(modal);
        };

        const onSave = () => {
          const name = nameInput.value.trim();
          const url = urlInput.value.trim();
          if (!name && !urlVisible) {
            setEditorStatus(t("editorNameRequired"), "error");
            return;
          }
          if (urlVisible && !url) {
            setEditorStatus(t("editorUrlRequired"), "error");
            return;
          }
          cleanup();
          resolve({ name, url: urlVisible ? url : "" });
        };

        const onCancel = () => {
          cleanup();
          resolve(null);
        };

        const onKeyDown = (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        };

        saveBtn.addEventListener("click", onSave);
        cancelBtn.addEventListener("click", onCancel);
        nameInput.addEventListener("keydown", onKeyDown);
        urlInput.addEventListener("keydown", onKeyDown);
      });
    }

    return {
      openModal,
      closeModal,
      openConfigModal,
      closeConfigModal,
      openPromptModal,
      openEditorModal,
      testConfigConnection,
      saveConfigFromModal,
      clearConfigFromModal,
      invalidateConfigTest,
    };
  }

  window.YABMModalsModule = {
    createModalsModule,
  };
})();