/**
 * @file modals.js
 * Modal dialog management for the bookmarks page.
 * Handles config/WebDAV setup, confirmation prompts, and the bookmark/folder editor.
 * Each modal uses a CSS open/close animation; a WeakMap tracks pending close timers.
 * Exposed as `window.YABMModalsModule`.
 */

/**
 * Stored WebDAV configuration, as persisted by `YABMSync.saveConfig`.
 * @typedef {Object} WebdavConfig
 * @property {string} directoryUrl
 * @property {string} fileName
 * @property {string} username
 * @property {string} password
 */

/**
 * File entry returned by a WebDAV directory listing.
 * @typedef {Object} WebdavFileMetadata
 * @property {string} name
 * @property {number|string} [size]
 * @property {string} [lastModified]
 */

/**
 * Subset of the `window.YABMSync` service used by the modals.
 * @typedef {Object} ModalsSyncService
 * @property {() => Promise<WebdavConfig | null>} getConfig
 * @property {(config: WebdavConfig) => Promise<void>} saveConfig
 * @property {() => Promise<void>} clearConfig
 * @property {(input: { directoryUrl: string, username?: string, password?: string }) => Promise<{ directoryUrl: string, files: WebdavFileMetadata[] }>} listDirectoryFiles
 */

/**
 * Dependencies injected by the bookmarks page bootstrap (bookmarks.js).
 * @typedef {Object} ModalsModuleDeps
 * @property {(key: string, substitutions?: string[]) => string} t
 * @property {(message: string, type: 'success'|'error'|'') => void} setStatus
 * @property {(message: string, type?: 'success'|'error'|'') => void} showTopToast
 * @property {(stateKey: 'notConfigured'|'checking'|'ready'|'error', tooltipText: string) => void} setWebdavStatusIndicator
 * @property {(options?: { interactive?: boolean }) => Promise<void>} refreshWebdavStatusBar
 * @property {ModalsSyncService} sync
 * @property {(deps: import("../../lib/webdav-config-session.js").WebdavConfigSessionDeps) => import("../../lib/webdav-config-session.js").WebdavConfigSession} createConfigSession
 * @property {(deps: import("../../lib/webdav-file-picker.js").WebdavFilePickerDeps) => import("../../lib/webdav-file-picker.js").WebdavFilePicker} createFilePicker
 */

/**
 * @typedef {Object} PromptModalOptions
 * @property {string} [title]
 * @property {string} [message]
 * @property {string} [confirmLabel]
 * @property {string} [cancelLabel]
 */

/**
 * @typedef {Object} EditorModalOptions
 * @property {string} [title]
 * @property {string} [nameLabel]
 * @property {string} [nameValue]
 * @property {string} [urlValue]
 * @property {boolean} [urlVisible]
 * @property {string} [saveLabel]
 */

/**
 * Public API returned by `createModalsModule`.
 * @typedef {Object} ModalsModule
 * @property {(modal: HTMLElement | null) => void} openModal
 * @property {(modal: HTMLElement | null) => void} closeModal
 * @property {() => Promise<void>} openConfigModal
 * @property {() => void} closeConfigModal
 * @property {(options: PromptModalOptions) => Promise<boolean>} openPromptModal
 * @property {(options: EditorModalOptions) => Promise<{ name: string, url: string } | null>} openEditorModal
 * @property {() => Promise<void>} testConfigConnection
 * @property {() => Promise<void>} saveConfigFromModal
 * @property {() => Promise<void>} clearConfigFromModal
 * @property {() => void} invalidateConfigTest
 */

(function () {
  /**
   * Factory that creates the modals module.
   * `sync` is the page's `window.YABMSync` service, injected by bookmarks.js so this
   * module does not read the shared-library global directly.
   * @param {ModalsModuleDeps} deps
   * @returns {ModalsModule}
   */
  function createModalsModule(deps) {
    const {
      t,
      setStatus,
      showTopToast,
      refreshWebdavStatusBar,
      sync,
    } = deps;
    const configSession = deps.createConfigSession({
      sync,
      readForm: readConfigForm,
    });
    const configFilePicker = deps.createFilePicker({
      container: requireElement("cfg-files"),
      radioName: "cfg-file-select",
      createNewFileLabel: () => t("createNewFile"),
    });

    /** CSS transition duration for modal open/close animations (ms). */
    const MODAL_ANIM_MS = 180;
    // Maps each modal element to its pending close-animation cleanup timer.
    const modalCloseTimers = new WeakMap();

    /**
     * Returns the element with `id`, throwing if it is missing.
     * @param {string} id
     * @returns {HTMLElement}
     */
    function requireElement(id) {
      const el = document.getElementById(id);
      if (!el) {
        throw new Error(`Missing element #${id}`);
      }
      return el;
    }

    /**
     * Returns the input element with `id`, throwing if it is missing or not an input.
     * @param {string} id
     * @returns {HTMLInputElement}
     */
    function requireInput(id) {
      const el = requireElement(id);
      if (!(el instanceof HTMLInputElement)) {
        throw new Error(`Element #${id} is not an input`);
      }
      return el;
    }

    /**
     * Returns the button element with `id`, throwing if it is missing or not a button.
     * @param {string} id
     * @returns {HTMLButtonElement}
     */
    function requireButton(id) {
      const el = requireElement(id);
      if (!(el instanceof HTMLButtonElement)) {
        throw new Error(`Element #${id} is not a button`);
      }
      return el;
    }

    /**
     * Updates a status element's text, visibility, and type modifier class.
     * Passing an empty or whitespace-only message hides the element.
     * @param {HTMLElement|null} statusEl
     * @param {string} baseClassName - Class list reset value applied before modifiers.
     * @param {string} message - Status text; empty = hidden.
     * @param {'success'|'error'|''} type - Optional CSS modifier class.
     */
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

    /**
     * Sets the status message inside the config/WebDAV modal.
     * Also shows a toast for success and error outcomes.
     * @param {string} message
     * @param {'success'|'error'|''} type
     */
    function setConfigStatus(message, type) {
      const statusEl = document.getElementById("cfg-status");
      updateStatusElement(statusEl, "sync-status", message, type);
      if (message && (type === "success" || type === "error")) {
        showTopToast(message, type);
      }
    }

    /**
     * Sets the status message inside the bookmark/folder editor modal.
     * Also shows a toast for success and error outcomes.
     * @param {string} message
     * @param {'success'|'error'|''} type
     */
    function setEditorStatus(message, type) {
      const statusEl = document.getElementById("editor-status");
      updateStatusElement(statusEl, "sync-status", message, type);
      if (message && (type === "success" || type === "error")) {
        showTopToast(message, type);
      }
    }

    /**
     * Cancels the pending close-animation cleanup timer for `modal`, if any.
     * @param {HTMLElement} modal
     */
    function clearModalCloseTimer(modal) {
      const activeTimer = modalCloseTimers.get(modal);
      if (activeTimer) {
        window.clearTimeout(activeTimer);
        modalCloseTimers.delete(modal);
      }
    }

    /**
     * Opens a modal: removes "hidden" and "is-closing", then adds "is-open" on the
     * next animation frame so the CSS enter transition runs.
     * @param {HTMLElement|null} modal
     */
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

    /**
     * Closes a modal with a CSS exit animation, then sets "hidden" after `MODAL_ANIM_MS`.
     * @param {HTMLElement|null} modal
     */
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

    /** @returns {import("../../lib/webdav-config-session.js").WebdavConfigForm} */
    function readConfigForm() {
      return {
        directoryUrl: requireInput("cfg-directory-url").value,
        username: requireInput("cfg-username").value,
        password: requireInput("cfg-password").value,
        newFileName: requireInput("cfg-new-file-name").value,
      };
    }

    /**
     * Resets the config test state and collapses the file selection section.
     * Must be called whenever the user changes credentials so stale test results
     * cannot be used to save a config to a different server.
     */
    function invalidateConfigTest() {
      configSession.invalidate();
      const section = requireElement("cfg-file-section");
      section.classList.remove("is-open");
    }

    /**
     * Opens the WebDAV configuration modal and pre-fills it with the stored config.
     * @returns {Promise<void>}
     */
    async function openConfigModal() {
      const modal = document.getElementById("config-modal");
      openModal(modal);

      const config = await sync.getConfig();
      if (!config) {
        return;
      }

      requireInput("cfg-directory-url").value = config.directoryUrl || "";
      requireInput("cfg-username").value = config.username || "";
      requireInput("cfg-password").value = config.password || "";
      requireInput("cfg-new-file-name").value =
        config.fileName || "bookmarks.html";

      setConfigStatus("", "");
      invalidateConfigTest();
    }

    /**
     * Closes the WebDAV configuration modal.
     */
    function closeConfigModal() {
      const modal = document.getElementById("config-modal");
      closeModal(modal);
    }

    /**
     * Tests the WebDAV connection using the credentials currently entered in the form.
     * On success, populates the file selection list and marks the config as tested.
     * On failure, invalidates the test state so the user cannot save stale results.
     * @returns {Promise<void>}
     */
    async function testConfigConnection() {
      const testBtn = requireButton("cfg-test");
      testBtn.disabled = true;
      setConfigStatus(t("testingWebdavConnection"), "");

      try {
        const result = await configSession.test();
        if (!result) {
          return;
        }

        requireElement("cfg-file-section").classList.add("is-open");
        configFilePicker.render(result.files, result.selectedFile);

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

    /**
     * Saves the WebDAV config after validating that a connection test was performed
     * and a target file has been selected or entered.
     * @returns {Promise<void>}
     */
    async function saveConfigFromModal() {
      try {
        const validationError = await configSession.save(configFilePicker.readSelection());
        if (validationError) {
          setConfigStatus(t(validationError), "error");
          return;
        }
        setConfigStatus(t("configurationSaved"), "success");
        setStatus(t("configurationSaved"), "success");
        closeConfigModal();
        await refreshWebdavStatusBar();
      } catch (error) {
        setConfigStatus(t("saveFailed", [error.message]), "error");
      }
    }

    /**
     * Prompts for confirmation, then clears the stored WebDAV config and
     * resets all form fields to their defaults.
     * @returns {Promise<void>}
     */
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
        await configSession.clear();
        requireInput("cfg-directory-url").value = "";
        requireInput("cfg-username").value = "";
        requireInput("cfg-password").value = "";
        requireInput("cfg-new-file-name").value = "bookmarks.html";
        invalidateConfigTest();
        setConfigStatus(t("configurationCleared"), "success");
        setStatus(t("configurationCleared"), "success");
        await refreshWebdavStatusBar();
      } catch (error) {
        setConfigStatus(t("clearFailed", [error.message]), "error");
      }
    }

    /**
     * Shows a confirmation-style prompt modal and returns a Promise that resolves
     * to `true` (confirmed) or `false` (cancelled/dismissed).
     * One-shot: event listeners are cleaned up after the user responds.
     * @param {PromptModalOptions} options
     * @returns {Promise<boolean>}
     */
    function openPromptModal({
      title,
      message,
      confirmLabel = t("promptConfirm"),
      cancelLabel = t("cancel"),
    }) {
      const modal = document.getElementById("prompt-modal");
      const titleEl = requireElement("prompt-title");
      const messageEl = requireElement("prompt-message");
      const confirmBtn = requireElement("prompt-confirm");
      const cancelBtn = requireElement("prompt-cancel");

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

    /**
     * Shows the bookmark/folder editor modal pre-filled with the given values.
     * Returns a Promise that resolves to `{ name, url }` when saved, or `null` when cancelled.
     * Keyboard shortcuts: Enter submits the form, Escape cancels.
     * @param {EditorModalOptions} options
     * @returns {Promise<{name: string, url: string}|null>}
     */
    function openEditorModal({
      title,
      nameLabel,
      nameValue = "",
      urlValue = "",
      urlVisible = false,
      saveLabel = t("save"),
    }) {
      const modal = document.getElementById("editor-modal");
      const titleEl = requireElement("editor-title");
      const nameLabelEl = requireElement("editor-name-label");
      const nameInput = requireInput("editor-name");
      const urlField = requireElement("editor-url-field");
      const urlInput = requireInput("editor-url");
      const saveBtn = requireElement("editor-save");
      const cancelBtn = requireElement("editor-cancel");

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