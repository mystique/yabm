/**
 * options.js
 * 
 * WebDAV configuration page for Yet Another Bookmark Manager.
 * Manages connection settings, directory browsing, and file selection.
 * Loaded directly by the extension as a standalone page.
 */

/**
 * Translate a message key using the i18n library
 * @param {string} key - The i18n message key
 * @param {string[]} [substitutions] - Optional substitutions for the message
 * @returns {string} - Translated message
 */
const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);

/**
 * Get a DOM element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Get a DOM element by ID, throwing if it is missing
 * @param {string} id - Element ID
 * @returns {HTMLElement}
 */
function requireElement(id) {
  const el = $(id);
  if (!el) {
    throw new Error(`Missing element #${id}`);
  }
  return el;
}

/**
 * Get an input element by ID, throwing if it is missing or not an input
 * @param {string} id - Element ID
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
 * Get a button element by ID, throwing if it is missing or not a button
 * @param {string} id - Element ID
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
 * @typedef {object} FormElements
 * @property {HTMLInputElement} directoryUrl - WebDAV directory URL input
 * @property {HTMLInputElement} username - Username input
 * @property {HTMLInputElement} password - Password input
 * @property {HTMLInputElement} newFileName - New file name input
 */

/**
 * Get the WebDAV form inputs, throwing if any is missing
 * @returns {FormElements}
 */
function getFormElements() {
  return {
    directoryUrl: requireInput("directory-url"),
    username: requireInput("username"),
    password: requireInput("password"),
    newFileName: requireInput("new-file-name"),
  };
}

/** @returns {import("../../lib/webdav-config-session.js").WebdavConfigForm} */
function readConfigForm() {
  const form = getFormElements();
  return {
    directoryUrl: form.directoryUrl.value,
    username: form.username.value,
    password: form.password.value,
    newFileName: form.newFileName.value,
  };
}

const configSession = window.YABMWebdavConfigSession.createSession({
  sync: window.YABMSync,
  readForm: readConfigForm,
});

const filePicker = window.YABMWebdavFilePicker.createPicker({
  container: requireElement("files-container"),
  radioName: "file-select",
  createNewFileLabel: () => t("createNewFile"),
});

/**
 * Set the status message and visibility
 * @param {string} message - Status text to display
 * @param {string} type - CSS class: "success", "error", or empty string
 */
function setStatus(message, type) {
  const el = $("status");
  if (!el) return;
  const hasMessage = Boolean(message && String(message).trim());
  el.className = "status";
  if (!hasMessage) {
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.removeAttribute("aria-hidden");
  if (type) {
    el.classList.add(type);
  }
}

/**
 * Load saved WebDAV configuration from chrome.storage.local
 */
async function loadSavedConfig() {
  const config = await window.YABMSync.getConfig();
  if (!config) {
    return;
  }

  const form = getFormElements();
  form.directoryUrl.value = config.directoryUrl || "";
  form.username.value = config.username || "";
  form.password.value = config.password || "";
  form.newFileName.value = config.fileName || "bookmarks.html";
  configSession.invalidate();
}

/**
 * Test WebDAV connection and list available files
 */
async function testConnection() {
  /** @type {HTMLButtonElement|null} */
  let testBtn = null;
  /** @type {HTMLElement|null} */
  let fileSection = null;

  try {
    // Lookups stay inside the try so a missing element surfaces in the status
    testBtn = requireButton("test-connection");
    testBtn.disabled = true;
    setStatus(t("testingConnection"), "");

    fileSection = requireElement("file-section");
    const result = await configSession.test();
    if (!result) {
      return;
    }

    fileSection.classList.remove("hidden");
    filePicker.render(result.files, result.selectedFile);

    if (!result.files.length) {
      setStatus(t("connSuccessNoFiles"), "success");
    } else {
      setStatus(t("connSuccessFoundFiles", [String(result.files.length)]), "success");
    }
  } catch (error) {
    configSession.invalidate();
    if (fileSection) {
      fileSection.classList.add("hidden");
    }
    setStatus(t("connectionFailed", [error.message]), "error");
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
    }
  }
}

/**
 * Save the WebDAV configuration to chrome.storage.local
 * Requires a successful connection test first
 */
async function saveConfig() {
  try {
    const validationError = await configSession.save(filePicker.readSelection());
    if (validationError) {
      setStatus(t(validationError), "error");
      return;
    }
    setStatus(t("configurationSaved"), "success");
  } catch (error) {
    setStatus(t("saveFailed", [error.message]), "error");
  }
}

/**
 * Attach event listeners to form controls for interactivity
 */
function bindEvents() {
  const form = getFormElements();
  const fileSection = requireElement("file-section");

  requireElement("test-connection").addEventListener("click", testConnection);
  requireElement("save-config").addEventListener("click", saveConfig);

  // Auto-switch radio when typing in new file name input
  form.newFileName.addEventListener("input", () => {
    const newRadio = document.querySelector('input[value="__new__"]');
    if (newRadio instanceof HTMLInputElement) {
      newRadio.checked = true;
    }
  });

  /**
   * Reset test status when settings are manually changed
   * Prevents saving outdated connection state.
   */
  const invalidate = () => {
    configSession.invalidate();
    fileSection.classList.add("hidden");
  };

  form.directoryUrl.addEventListener("input", invalidate);
  form.username.addEventListener("input", invalidate);
  form.password.addEventListener("input", invalidate);
}

/**
 * Initialize the page: load i18n, bind events, restore saved config
 */
async function init() {
  await window.YABMTheme.init();
  window.YABMTheme.apply();
  await window.YABMI18n.init();
  window.YABMI18n.apply();
  bindEvents();
  await loadSavedConfig();
}

// Entry point
init().catch((error) => {
  setStatus(t("initializationFailed", [error.message]), "error");
});
