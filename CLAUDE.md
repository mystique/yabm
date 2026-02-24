# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Yet Another Bookmark Manager — a Chrome Extension (Manifest V3) for visual bookmark management with optional WebDAV sync. No build step, no package manager, no bundler: plain JS/CSS/HTML loaded directly by Chrome.

## Development Commands

**Syntax check** (run from repo root):

```powershell
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
node --check src/lib/i18n.js
```

**Load extension in Chrome**: open `chrome://extensions/`, enable Developer mode, click "Load unpacked", select the `src/` directory.

## Architecture

### Entry points

- `src/background/service-worker.js` — minimal service worker; opens `pages/bookmarks/bookmarks.html` when the toolbar icon is clicked.
- `src/manifest.json` sets `options_page` to `pages/bookmarks/bookmarks.html?openConfig=1`, so "Extension options" in Chrome opens the main page with the config modal pre-opened, not the separate `pages/options/` page.

### Page: bookmarks (`src/pages/bookmarks/`)

The main UI (~3200 lines in `bookmarks.js`). Responsibilities: render the full bookmark tree from the Chrome Bookmarks API, all CRUD + drag-and-drop operations, favicon caching, modal/dialog lifecycle, toast notifications, WebDAV status indicator state machine, and language switching.

The page loads two shared libs as `<script>` tags before `bookmarks.js`, so they must appear in this order in the HTML:
1. `../../lib/i18n.js` → exposes `window.YABMI18n`
2. `../../lib/sync-utils.js` → exposes `window.YABMSync`

### Page: options (`src/pages/options/`)

A standalone WebDAV configuration page (separate from the bookmarks page config modal). Same lib load order applies. Not referenced as `options_page` in the manifest.

### Library: `src/lib/i18n.js`

Exposes `window.YABMI18n`. Supports 11 locales: `en`, `zh_CN`, `zh_TW`, `de`, `es`, `fr`, `it`, `pt`, `ja`, `ko`, `ru`. Loads locale JSON from `src/_locales/{locale}/messages.json` at runtime via `fetch`. Language preference is persisted in `chrome.storage.local` under the key `uiLanguage` (value `"auto"` means browser language).

### Library: `src/lib/sync-utils.js`

Exposes `window.YABMSync`. Contains all WebDAV logic (PROPFIND listing, GET download, PUT upload), Basic Auth header construction (manual `TextEncoder` + `btoa`, no `atob`), runtime host permission requests via `chrome.permissions.request()`, and bookmark HTML export/import in Netscape format (parsed with `DOMParser`).

### Storage keys (`chrome.storage.local`)

| Key | Contents |
|---|---|
| `webdavConfig` | `{ directoryUrl, fileName, username, password }` |
| `uiLanguage` | locale string or `"auto"` |
| `bookmarkFavicons` | `{ [url]: dataURL }` favicon cache map |

### Permissions

Only `bookmarks` and `storage` are declared in the manifest. WebDAV host access uses `optional_host_permissions: ["https://*/*"]` and is requested at runtime per-origin via `chrome.permissions.request()` — no `permissions` permission declaration is needed in MV3.

### Locale message format

Each `messages.json` entry follows Chrome's i18n schema:
```json
"keyName": { "message": "Text with $1 placeholder", "description": "..." }
```
Substitution placeholders are `$1`, `$2`, etc. The `i18n.js` library handles substitution; `sync-utils.js` falls back to `chrome.i18n.getMessage()` if `YABMI18n` is unavailable.
