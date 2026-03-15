# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Yet Another Bookmark Manager — a Chrome Extension (Manifest V3) for visual bookmark management with optional WebDAV sync. Runtime architecture remains plain JS/CSS/HTML loaded by Chrome, and the repository now also includes a lightweight Node-based tooling layer for build, lint, and JSDoc type checking.

**For detailed coding conventions, see [AGENTS.md](./AGENTS.md).**

## Development Commands

Tooling commands:

```powershell
npm install
npm run build
npm run lint
npm run typecheck
npm run check
```

- `npm run build` copies `src/` to `dist/` and transpiles JavaScript with esbuild without changing the runtime architecture.
- `npm run lint` runs ESLint across the repository JavaScript.
- `npm run typecheck` runs TypeScript `checkJs` for shared libraries, background scripts, and tooling files.
- `npm run check` runs lint, typecheck, and build together.

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

- `src/background/service-worker.js` — minimal service worker; opens `pages/bookmarks/bookmarks.html` when the toolbar icon is clicked. Uses `chrome.storage.session` to track the bookmarks tab across service-worker restarts.
- `src/manifest.json` sets `options_page` to `pages/bookmarks/bookmarks.html?openConfig=1`, so "Extension options" in Chrome opens the main page with the config modal pre-opened.

### Script loading model

**No ESM imports.** Scripts load via `<script>` tags and expose globals (`window.YABM...`). Feature modules use factory functions (e.g., `createBookmarkTreeModule(deps)`) with dependency injection.

**Load order in bookmarks.html** (must be preserved):
1. `lib/i18n.js` → `window.YABMI18n`
2. `lib/sync-utils.js` → `window.YABMSync`
3. Feature modules (`notifications.js`, `favicon-cache.js`, `bookmark-tree-*.js`, etc.)
4. `bookmark-tree.js` → orchestrates all tree sub-modules
5. `bookmarks.js` → main entry point, wires everything together

When adding new modules, insert them in the correct dependency order.

### Page: bookmarks (`src/pages/bookmarks/`)

The main UI. Composed of modularized files:

| File | Responsibility |
|------|----------------|
| `bookmarks.js` | Entry point; initializes all modules, wires events, manages WebDAV status |
| `bookmark-tree.js` | Orchestrator; composes state, observers, mutations, menu, dnd, render modules |
| `bookmark-tree-state.js` | Folder open/close state, tree statistics, action button rendering |
| `bookmark-tree-observers.js` | Chrome bookmark API change listeners |
| `bookmark-tree-mutations.js` | CRUD operations (create, update, delete, move, sort) |
| `bookmark-tree-render.js` | DOM rendering of the bookmark tree |
| `bookmark-tree-menu.js` | Context menu handling |
| `bookmark-tree-dnd.js` | Drag-and-drop logic |
| `favicon-cache.js` | Local favicon storage in `chrome.storage.local` |
| `modals.js` | Config, editor, and prompt modal lifecycle |
| `notifications.js` | Toast notification system |
| `custom-scrollbar.js` | Custom scrollbar implementation |

### Page: options (`src/pages/options/`)

Standalone WebDAV configuration page (separate from the bookmarks page config modal). Same lib load order applies. Not referenced as `options_page` in the manifest.

### Library: `src/lib/i18n.js`

Exposes `window.YABMI18n`. Supports 11 locales: `en`, `zh_CN`, `zh_TW`, `de`, `es`, `fr`, `it`, `pt`, `ja`, `ko`, `ru`. Loads locale JSON from `src/_locales/{locale}/messages.json` at runtime via `fetch`. Language preference persisted in `chrome.storage.local` under key `uiLanguage` (value `"auto"` means browser language).

### Library: `src/lib/sync-utils.js`

Exposes `window.YABMSync`. Contains all WebDAV logic (PROPFIND listing, GET download, PUT upload), Basic Auth header construction (manual `TextEncoder` + `btoa`), runtime host permission requests via `chrome.permissions.request()`, and bookmark HTML export/import in Netscape format (parsed with `DOMParser`).

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
