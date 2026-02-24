const state = {
  tested: false,
  directoryUrl: "",
  files: []
};

const t = (key, substitutions) => window.YABMI18n.t(key, substitutions);

function $(id) {
  return document.getElementById(id);
}

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

function renderFileList(files, selectedName) {
  const container = $("files-container");
  container.innerHTML = "";

  const createOption = document.createElement("div");
  createOption.className = "file-item";
  createOption.innerHTML =
    '<label><input type="radio" name="file-select" value="__new__">' +
    `<span>${t("createNewFile")}</span></label>`;
  container.appendChild(createOption);

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

  const target = selectedName || "bookmarks.html";
  const radios = container.querySelectorAll('input[name="file-select"]');
  let selected = false;

  for (const radio of radios) {
    if (radio.value === target) {
      radio.checked = true;
      selected = true;
      break;
    }
  }

  if (!selected) {
    const newRadio = container.querySelector('input[value="__new__"]');
    if (newRadio) {
      newRadio.checked = true;
    }
  }
}

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

function bindEvents() {
  $("test-connection").addEventListener("click", testConnection);
  $("save-config").addEventListener("click", saveConfig);

  $("new-file-name").addEventListener("input", () => {
    const newRadio = document.querySelector('input[value="__new__"]');
    if (newRadio) {
      newRadio.checked = true;
    }
  });

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

async function init() {
  await window.YABMI18n.init();
  window.YABMI18n.apply();
  bindEvents();
  await loadSavedConfig();
}

init().catch((error) => {
  setStatus(t("initializationFailed", [error.message]), "error");
});
