/**
 * options.js
 * 
 * WebDAV configuration page for Yet Another Bookmark Manager.
 * Manages connection settings, directory browsing, and file selection.
 * Loaded directly by the extension as a standalone page.
 */

/**
 * @typedef {object} FileMetadata
 * @property {string} name - File name
 * @property {string} lastModified - ISO 8601 date string
 * @property {number|string} size - File size in bytes
 */

/**
 * State object to track test results and available files
 * @type {{ tested: boolean, directoryUrl: string, files: FileMetadata[] }}
 */
const state = {
  tested: false,           // Whether connection test succeeded
  directoryUrl: "",        // Normalized WebDAV directory URL from last test
  files: []                // Array of file metadata from directory listing
};

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
 * Set the status message and visibility
 * @param {string} message - Status text to display
 * @param {string} type - CSS class: "success", "error", or empty string
 */
function setStatus(message, type) {
  const el = $("status");
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
 * Normalize a file name to standard Netscape bookmark HTML format
 * @param {string} fileName - Input file name
 * @returns {string} - Normalized file name (lowercase, .html extension)
 */
function normalizeFileName(fileName) {
  const value = (fileName || "").trim();
  if (!value) {
    return "bookmarks.html";
  }
  return value.toLowerCase().endsWith(".html") ? value : `${value}.html`;
}

/**
 * Format byte size to human-readable string (B, KB, MB, GB, TB)
 * @param {number|string} sizeValue - Size in bytes
 * @returns {string} - Formatted size string
 */
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

/**
 * Parse ISO date string and format as date and time components
 * @param {string} lastModifiedValue - ISO 8601 date string
 * @returns {object} - { dateText: "YYYY-MM-DD", timeText: "HH:MM:SS" }
 */
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

/**
 * Build HTML fragment for file size and modification timestamp
 * @param {object} file - File metadata object with size and lastModified
 * @returns {string} - HTML string with file-size and file-datetime spans
 */
function buildFileMetaHtml(file) {
  const sizeText = formatFileSize(file?.size);
  const { dateText, timeText } = formatLastModifiedParts(file?.lastModified);
  return `<span class="file-size">${sizeText}</span><span class="file-datetime"><span>${dateText}</span><span>${timeText}</span></span>`;
}

/**
 * Render the file list UI with radio buttons for selection
 * @param {FileMetadata[]} files - Array of file metadata objects
 * @param {string} [selectedName] - File name to pre-select (if present)
 */
function renderFileList(files, selectedName) {
  const container = $("files-container");
  container.innerHTML = "";

  // Create a new file entry
  const createOption = document.createElement("div");
  createOption.className = "file-item";
  createOption.innerHTML =
    '<label><input type="radio" name="file-select" value="__new__">' +
    `<span>${t("createNewFile")}</span></label>`;
  container.appendChild(createOption);

  // List each discovered file from the directory
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "file-item";

    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "file-select";
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

  // Set the default selection logic
  const target = selectedName || "bookmarks.html";
  const radios = container.querySelectorAll('input[name="file-select"]');
  let selected = false;

  // Try to find the exact file name
  for (const radio of radios) {
    if (radio.value === target) {
      radio.checked = true;
      selected = true;
      break;
    }
  }

  // Fallback to "Create New" option if target file is not found
  if (!selected) {
    const newRadio = container.querySelector('input[value="__new__"]');
    if (newRadio) {
      newRadio.checked = true;
    }
  }
}

/**
 * Get the currently selected file name from the radio button group
 * @returns {string} - Selected file name (normalized if creating new)
 */
function getSelectedFileName() {
  const checked = document.querySelector('input[name="file-select"]:checked');
  if (!checked) {
    return "";
  }

  if (checked.value === "__new__") {
    return normalizeFileName($("new-file-name").value);
  }

  return checked.value;
}

/**
 * Load saved WebDAV configuration from chrome.storage.local
 */
async function loadSavedConfig() {
  const config = await window.YABMSync.getConfig();
  if (!config) {
    return;
  }

  $("directory-url").value = config.directoryUrl || "";
  $("username").value = config.username || "";
  $("password").value = config.password || "";
  $("new-file-name").value = config.fileName || "bookmarks.html";
}

/**
 * Test WebDAV connection and list available files
 */
async function testConnection() {
  const testBtn = $("test-connection");
  testBtn.disabled = true;
  setStatus(t("testingConnection"), "");

  try {
    const directoryUrl = $("directory-url").value.trim();
    const username = $("username").value.trim();
    const password = $("password").value;

    const result = await window.YABMSync.listDirectoryFiles({
      directoryUrl,
      username,
      password
    });

    state.tested = true;
    state.directoryUrl = result.directoryUrl;
    state.files = result.files;

    $("file-section").classList.remove("hidden");
    renderFileList(result.files, normalizeFileName($("new-file-name").value));

    if (!result.files.length) {
      setStatus(t("connSuccessNoFiles"), "success");
    } else {
      setStatus(t("connSuccessFoundFiles", [String(result.files.length)]), "success");
    }
  } catch (error) {
    state.tested = false;
    state.directoryUrl = "";
    state.files = [];
    $("file-section").classList.add("hidden");
    setStatus(t("connectionFailed", [error.message]), "error");
  } finally {
    testBtn.disabled = false;
  }
}

/**
 * Save the WebDAV configuration to chrome.storage.local
 * Requires a successful connection test first
 */
async function saveConfig() {
  if (!state.tested) {
    setStatus(t("testBeforeSave"), "error");
    return;
  }

  const fileName = getSelectedFileName();
  if (!fileName) {
    setStatus(t("selectOrEnterFile"), "error");
    return;
  }

  const payload = {
    directoryUrl: state.directoryUrl,
    username: $("username").value.trim(),
    password: $("password").value,
    fileName
  };

  try {
    await window.YABMSync.saveConfig(payload);
    setStatus(t("configurationSaved"), "success");
  } catch (error) {
    setStatus(t("saveFailed", [error.message]), "error");
  }
}

/**
 * Attach event listeners to form controls for interactivity
 */
function bindEvents() {
  $("test-connection").addEventListener("click", testConnection);
  $("save-config").addEventListener("click", saveConfig);

  // Auto-switch radio when typing in new file name input
  $("new-file-name").addEventListener("input", () => {
    const newRadio = document.querySelector('input[value="__new__"]');
    if (newRadio) {
      newRadio.checked = true;
    }
  });

  /**
   * Reset test status when settings are manually changed
   * Prevents saving outdated connection state.
   */
  const invalidate = () => {
    state.tested = false;
    state.directoryUrl = "";
    state.files = [];
    $("file-section").classList.add("hidden");
  };

  $("directory-url").addEventListener("input", invalidate);
  $("username").addEventListener("input", invalidate);
  $("password").addEventListener("input", invalidate);
}

/**
 * Initialize the page: load i18n, bind events, restore saved config
 */
async function init() {
  await window.YABMI18n.init();
  window.YABMI18n.apply();
  bindEvents();
  await loadSavedConfig();
}

// Entry point
init().catch((error) => {
  setStatus(t("initializationFailed", [error.message]), "error");
});
