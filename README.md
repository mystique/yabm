# Yet Another Bookmark Manager

A Chrome extension for visual bookmark management with optional WebDAV sync.

## Features

- Bookmark tree management
- Create, edit, delete, and move bookmarks/folders
- Drag-and-drop for bookmark organization
- Folder sorting (ascending/descending)
- Inline per-row action buttons and right-click context menus
- Favicon refresh and local favicon cache
- Light / Dark / System theme picker, shared across extension pages
- In-app language picker (11 locales: English, Chinese Simplified/Traditional, Japanese, Korean, Russian, German, Spanish, French, Italian, Portuguese)
- Tooltips and top-area toasts
- WebDAV configuration and connection test
- Upload bookmarks to WebDAV
- Download bookmarks from WebDAV and overwrite local bookmarks (**download and replace** — this is the only sync action that removes bookmarks; it snapshots the root folders first and restores them if the rebuild fails)
- WebDAV status chip in the toolbar and a bottom status bar with URL and entry counts
- Custom scrollbar styling

## Project Structure

```text
.
|- src/
|  |- manifest.json           # Extension manifest (Manifest V3)
|  |- background/
|  |  `- service-worker.js    # Toolbar action handler
|  |- pages/
|  |  |- bookmarks/           # Main bookmark manager UI
|  |  |  |- bookmarks.html
|  |  |  |- bookmarks.js      # Composition root: builds modules, wires handlers
|  |  |  |- bookmarks.css
|  |  |  |- bookmark-tree.js  # Tree composition root (constructs the tree sub-modules)
|  |  |  |- bookmark-tree-state.js        # Open-folder state, summary stats, action buttons
|  |  |  |- bookmark-tree-render.js       # DOM rendering
|  |  |  |- bookmark-tree-node-actions.js # Per-row action bar and context-menu catalogue
|  |  |  |- bookmark-tree-menu.js         # Tree context menu and sort menu
|  |  |  |- bookmark-tree-dnd.js          # Drag-and-drop lifecycle
|  |  |  |- bookmark-tree-mutations.js    # CRUD operations
|  |  |  |- bookmark-tree-observers.js    # Chrome bookmark events + refresh coordinator
|  |  |  |- bookmark-webdav-status.js     # Status chip, status bar, upload/download
|  |  |  |- bookmark-edit-menu.js         # Rich-text context menu
|  |  |  |- bookmark-appearance-menu.js   # Language and theme pickers
|  |  |  |- bookmark-overlay.js           # Viewport-anchored overlay lifecycle
|  |  |  |- bookmark-tooltip.js           # Shared [data-tooltip] behaviour
|  |  |  |- modals.js         # Config / prompt / editor modals
|  |  |  |- favicon-cache.js  # Local favicon storage
|  |  |  |- custom-scrollbar.js
|  |  |  `- notifications.js  # Toast and progress notifications
|  |  `- options/             # Standalone WebDAV config page
|  |     |- options.html
|  |     |- options.js
|  |     `- options.css
|  |- lib/
|  |  |- i18n.js                    # i18n loader and translator (window.YABMI18n)
|  |  |- theme.js                   # Theme preference (window.YABMTheme)
|  |  |- sync-utils.js              # WebDAV + import/export (window.YABMSync)
|  |  |- webdav-config-session.js   # Config session rules (window.YABMWebdavConfigSession)
|  |  `- webdav-file-picker.js      # Remote file picker (window.YABMWebdavFilePicker)
|  |- assets/
|  |  `- icons/               # Extension icons (fonts and Twemoji load from CDN)
|  `- _locales/               # i18n message bundles (11 languages)
|- tools/
|  `- build.cjs               # Build script (src/ -> dist/)
|- types/
|  `- yabm-globals.d.ts       # window.YABM* global declarations for typecheck
|- docs/
|  |- modernization/          # Modernization roadmap and status
|  `- agents/                 # Agent-facing conventions (issue tracker, triage, domain docs)
|- .scratch/                  # Feature specs and tickets
|- package.json               # Dev tooling scripts (build, lint, typecheck, check)
|- tsconfig.json              # JSDoc typecheck (checkJs) scope
|- eslint.config.cjs
|- README.md
|- AGENTS.md                  # Agent/coding assistant instructions
|- GLOSSARY.md                # Domain vocabulary
|- LICENSE
|- PRIVACY.md
`- CHANGELOG.md
```


## Requirements

- Google Chrome (Manifest V3 support required)
- Chromium-based browsers (Edge, Brave, etc.) may also work

## Local Installation (Developer Mode)

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `src` folder (the folder containing `manifest.json`)
5. Pin and open the extension from the toolbar

## Usage

### Basic Bookmark Management
1. Click the extension icon to open the bookmark manager page (a second click focuses the existing tab)
2. View your bookmarks in a collapsible tree, with live folder and bookmark counts
3. Use the row action buttons, or right-click a bookmark/folder, for actions such as edit, delete, copy URL, refresh favicon, and creating new bookmarks/folders
4. Drag and drop to reorganize
5. Use the expand-all / collapse-all controls and the per-folder sort menu
6. Use the language and theme buttons in the toolbar to switch UI language and light/dark appearance

### WebDAV Sync Setup
1. Open the configuration modal with the settings (gear) button in the toolbar
2. Set the WebDAV directory URL (HTTPS only) and, optionally, username and password
3. Click `Test connection` — the directory listing appears only after a successful test
4. Pick an existing remote file, or keep the new-file name (default `bookmarks.html`, `.html` appended if missing)
5. Click `Save configuration`. Changing the URL, username, or password invalidates a previous test; a superseded in-flight test cannot re-enable saving
6. Use `Upload` to push local bookmarks to WebDAV
7. Use `Download` to download and replace: the downloaded bookmarks file becomes the browser's bookmark set

The extension's *Options* shortcut (and `src/pages/options/options.html`) opens the bookmarks page with the configuration modal already open, via `?openConfig=1`. The standalone page at `src/pages/options/options.html` shares the same config session and file picker logic, but no manifest entry or in-page link points at it; it is reachable by opening its extension URL directly.

## WebDAV Status Indicator

The status icon reflects the current WebDAV connection state:

| State | Icon | Description |
|-------|------|-------------|
| Not Configured | ⚪ White circle | Missing directory URL or file name |
| Checking | ⏳ Hourglass | Refresh/upload/download in progress |
| Ready | 🟢 Green circle | WebDAV file is readable and synced |
| Error | 🔴 Red circle | Connection/auth/permission/read error |

## Supported Languages

| Language | Locale Code |
|----------|-------------|
| English | `en` (default) |
| Chinese (Simplified) | `zh_CN` |
| Chinese (Traditional) | `zh_TW` |
| Japanese | `ja` |
| Korean | `ko` |
| Russian | `ru` |
| German | `de` |
| Spanish | `es` |
| French | `fr` |
| Italian | `it` |
| Portuguese | `pt` |

The UI language defaults to Chrome's display language. The in-app language picker overrides it and the choice is saved in `chrome.storage.local` and shared across extension pages.

## Permissions

Declared in `src/manifest.json`:

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read and modify browser bookmarks |
| `storage` | Save local extension settings, WebDAV config, and favicon cache |
| `optional_host_permissions: https://*/*` | Request access to a specific HTTPS WebDAV host at runtime |

The manifest also declares an extension-pages Content Security Policy that limits scripts to `'self'` and allowlists only the asset hosts the pages need: `fonts.googleapis.com` (stylesheet), `fonts.gstatic.com` (font files), and `cdn.jsdelivr.net` (Twemoji SVGs). Connecting to WebDAV is restricted to HTTPS.

## Data & Security

- WebDAV URL, username, password, and selected file name are stored in `chrome.storage.local`
- Credentials are used only to build request `Authorization` headers for WebDAV calls
- WebDAV sync is limited to HTTPS URLs (no HTTP)
- Fonts (Google Fonts) and Twemoji icons (jsDelivr) load from CDNs, so those hosts see ordinary asset requests
- No built-in telemetry, analytics, or tracking
- No third-party SDKs

See [PRIVACY.md](./PRIVACY.md) for details.

## Development

This is a **plain JavaScript project** at runtime. The extension still uses
script-tag loading and global namespaces, but the repository now includes a
lightweight tooling layer for build, lint, and JSDoc type checking.

Modernization planning and progress tracking live in:

- [docs/modernization/ROADMAP.md](docs/modernization/ROADMAP.md)
- [docs/modernization/STATUS.md](docs/modernization/STATUS.md)

Runtime model:

- Manifest V3 extension
- Scripts load via `<script>` tags (no ESM imports; ESM migration is deliberately deferred)
- Shared library globals: `window.YABMI18n`, `window.YABMTheme`, `window.YABMSync`, `window.YABMWebdavConfigSession`, `window.YABMWebdavFilePicker`
- Bookmarks feature modules use factory functions (e.g. `createBookmarkTreeModule(deps)`, `createWebdavStatusModule(deps)`) that receive their collaborators through `deps`
- `bookmarks.js` and `options.js` are the page bootstraps and the only scripts that read `window.YABM*` services; `bookmark-tree.js` is the tree composition root and constructs the tree sub-modules

### Tooling Setup

```powershell
npm install
```

Available commands:

```powershell
npm run build
npm run lint
npm run typecheck
npm run check
```

- `npm run build` copies the extension into `dist/` and transpiles JavaScript with esbuild without changing the current runtime architecture.
- `npm run lint` runs ESLint across the repository JavaScript.
- `npm run typecheck` runs TypeScript in `checkJs` mode for the shared libraries, background scripts, all page scripts (bookmarks and options), and the tooling layer.
- `npm run check` runs lint, typecheck, and build in sequence.

Load `src/` in Chrome for the legacy direct-edit flow, or load `dist/` when you want to verify the tooling build output.

### Quick Syntax Check

Run `node --check` on each JS file you modify, for example:

```powershell
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
node --check src/lib/i18n.js
node --check src/background/service-worker.js
```

### Manual Testing

There is no automated test runner. After changes, verify in Chrome:

1. Load extension in Chrome Developer Mode
2. Verify bookmark tree renders correctly
3. Test CRUD operations (create/edit/delete/move)
4. Test WebDAV connection and sync
5. Test language switching via the in-app picker, and theme switching
6. Check the bookmarks page still starts with no console errors

A fuller smoke checklist is kept in [docs/modernization/STATUS.md](docs/modernization/STATUS.md).

For detailed development conventions, see [AGENTS.md](./AGENTS.md).

## Versioning

- Current version: `0.1.0`
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT License. See [LICENSE](./LICENSE).
