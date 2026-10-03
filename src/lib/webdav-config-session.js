/**
 * @file webdav-config-session.js
 * Shared, DOM-free WebDAV configuration rules for both configuration forms.
 */

/**
 * @typedef {{ directoryUrl: string, username: string, password: string }} WebdavCredentials
 * @typedef {WebdavCredentials & { newFileName: string }} WebdavConfigForm
 * @typedef {WebdavCredentials & { fileName: string }} WebdavSavedConfig
 * @typedef {{ name: string, size?: number|string, lastModified?: string }} WebdavConfigFile
 * @typedef {{ directoryUrl: string, files: WebdavConfigFile[] }} WebdavConfigListing
 * @typedef {object} WebdavConfigSessionDeps
 * @property {{ listDirectoryFiles: (credentials: WebdavCredentials) => Promise<WebdavConfigListing>, saveConfig: (config: WebdavSavedConfig) => Promise<void>, clearConfig: () => Promise<void> }} sync
 * @property {() => WebdavConfigForm} readForm
 * @typedef {object} WebdavConfigSession
 * @property {() => void} invalidate
 * @property {() => Promise<{ files: WebdavConfigFile[], selectedFile: string }|null>} test
 * @property {(selectedFile: string) => Promise<'testBeforeSave'|'selectOrEnterFile'|null>} save
 * @property {() => Promise<void>} clear
 */

(function () {
  /**
   * Preserves the entered case and supplies the default name / HTML extension.
   * @param {string} fileName
   * @returns {string}
   */
  function normalizeFileName(fileName) {
    const value = (fileName || "").trim();
    return value
      ? (value.toLowerCase().endsWith(".html") ? value : `${value}.html`)
      : "bookmarks.html";
  }

  /**
   * Owns test eligibility and persistence; callers retain DOM and feedback.
   * A superseded test returns null (including failures), never changing eligibility.
   * @param {WebdavConfigSessionDeps} deps
   * @returns {WebdavConfigSession}
   */
  function createSession({ sync, readForm }) {
    let revision = 0;
    /** @type {{ credentials: WebdavCredentials, directoryUrl: string }|null} */
    let successfulTest = null;

    function invalidate() {
      revision += 1;
      successfulTest = null;
    }

    /** @param {WebdavCredentials} credentials */
    function matchesCurrentCredentials(credentials) {
      const current = readForm();
      return current.directoryUrl === credentials.directoryUrl &&
        current.username === credentials.username &&
        current.password === credentials.password;
    }

    async function test() {
      invalidate();
      const testRevision = revision;
      const { directoryUrl, username, password } = readForm();
      const credentials = { directoryUrl, username, password };
      let result;
      try {
        result = await sync.listDirectoryFiles({
          directoryUrl: directoryUrl.trim(),
          username: username.trim(),
          password,
        });
      } catch (error) {
        if (testRevision !== revision || !matchesCurrentCredentials(credentials)) {
          return null;
        }
        throw error;
      }
      if (testRevision !== revision || !matchesCurrentCredentials(credentials)) {
        return null;
      }

      successfulTest = { credentials, directoryUrl: result.directoryUrl };
      const target = normalizeFileName(readForm().newFileName);
      return {
        files: result.files,
        selectedFile: result.files.some((file) => file.name === target) ? target : "__new__",
      };
    }

    /**
     * Validation keys let each page keep its existing unprefixed feedback.
     * Storage failures are thrown to the page's normal save-error path.
     * @param {string} selectedFile
     * @returns {Promise<'testBeforeSave'|'selectOrEnterFile'|null>}
     */
    async function save(selectedFile) {
      if (!successfulTest || !matchesCurrentCredentials(successfulTest.credentials)) {
        invalidate();
        return "testBeforeSave";
      }
      if (!selectedFile) {
        return "selectOrEnterFile";
      }
      const fileName = selectedFile === "__new__"
        ? normalizeFileName(readForm().newFileName)
        : selectedFile;
      await sync.saveConfig({
        directoryUrl: successfulTest.directoryUrl,
        username: successfulTest.credentials.username.trim(),
        password: successfulTest.credentials.password,
        fileName,
      });
      return null;
    }

    async function clear() {
      await sync.clearConfig();
      invalidate();
    }

    return { invalidate, test, save, clear };
  }

  window.YABMWebdavConfigSession = { createSession };
})();
