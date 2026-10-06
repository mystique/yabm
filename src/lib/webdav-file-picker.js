/**
 * @file webdav-file-picker.js
 * Shared WebDAV file picker: lists a directory's files as radio options plus a
 * "create new file" option, and reports which option is selected. Callers own
 * the container lookup, the i18n label, and all user feedback.
 */

/**
 * @typedef {import("./webdav-config-session.js").WebdavConfigFile} WebdavPickerFile
 * @typedef {object} WebdavFilePicker
 * @property {(files: WebdavPickerFile[], selectedFile: string) => void} render
 * @property {() => string} readSelection
 * @typedef {object} WebdavFilePickerDeps
 * @property {HTMLElement} container - Element the options are rendered into.
 * @property {string} radioName - Radio group name, unique per page.
 * @property {() => string} createNewFileLabel - Resolves the new-file option's label.
 */

(function () {
  /**
   * Formats a byte count as a human-readable size string (B / KB / MB / GB / TB).
   * Returns `"-"` for invalid or negative values.
   * @param {number|string} sizeValue
   * @returns {string}
   */
  function formatFileSize(sizeValue) {
    const bytes = Number.parseInt(String(sizeValue), 10);
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
   * Formats a last-modified value into separate date and time strings.
   * Returns placeholder dashes when the value is missing or unparseable.
   * @param {string|number|null} lastModifiedValue
   * @returns {{ dateText: string, timeText: string }}
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
   * Builds the inner HTML string for a file-list item's metadata section.
   * @param {WebdavPickerFile} file
   * @returns {string}
   */
  function buildFileMetaHtml(file) {
    const sizeText = formatFileSize(file?.size);
    const { dateText, timeText } = formatLastModifiedParts(file?.lastModified);
    return `<span class="file-size">${sizeText}</span><span class="file-datetime"><span>${dateText}</span><span>${timeText}</span></span>`;
  }

  /**
   * Renders the picker and reads back the selection.
   * @param {WebdavFilePickerDeps} deps
   * @returns {WebdavFilePicker}
   */
  function createPicker({ container, radioName, createNewFileLabel }) {
    /**
     * Replaces the container's contents with the new-file option, one option
     * per supplied file, and checks the option matching `selectedFile`.
     * @param {WebdavPickerFile[]} files
     * @param {string} selectedFile
     */
    function render(files, selectedFile) {
      container.innerHTML = "";

      const createOption = document.createElement("div");
      createOption.className = "file-item";
      createOption.innerHTML =
        '<label><input type="radio" name="' + radioName + '" value="__new__">' +
        `<span>${createNewFileLabel()}</span></label>`;
      container.appendChild(createOption);

      for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";

        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = radioName;
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

      for (const radio of container.querySelectorAll(`input[name="${radioName}"]`)) {
        if (radio instanceof HTMLInputElement) {
          radio.checked = radio.value === selectedFile;
        }
      }
    }

    /**
     * Returns the selected radio value, or "" when nothing is selected. The
     * config session resolves the `__new__` sentinel into a file name.
     * @returns {string}
     */
    function readSelection() {
      const checked = container.querySelector(`input[name="${radioName}"]:checked`);
      return checked instanceof HTMLInputElement ? checked.value : "";
    }

    return { render, readSelection };
  }

  window.YABMWebdavFilePicker = { createPicker };
})();
