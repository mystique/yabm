# Yet Another Bookmark Manager

A Chrome extension for visual bookmark management with optional WebDAV sync.

## Features

- Bookmark tree management
- Create, edit, delete, and move bookmarks/folders
- Drag-and-drop for bookmark organization
- Folder sorting (ascending/descending)
- Favicon refresh and local favicon cache
- Multi-language UI (11 locales: English, Chinese Simplified/Traditional, Japanese, Korean, Russian, German, Spanish, French, Italian, Portuguese)
- WebDAV configuration and connection test
- Upload bookmarks to WebDAV
- Download bookmarks from WebDAV and overwrite local bookmarks
- WebDAV status bar and top action status indicator
- Custom scrollbar styling
- Toast notifications

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
|  |  |  |- bookmarks.js      # Entry point and coordination
|  |  |  |- bookmarks.css
|  |  |  |- bookmark-tree.js  # Main tree module factory
|  |  |  |- bookmark-tree-mutations.js   # CRUD operations
|  |  |  |- bookmark-tree-observers.js   # Chrome bookmark change listeners
|  |  |  |- bookmark-tree-render.js      # DOM rendering
|  |  |  |- bookmark-tree-menu.js        # Context menu handling
|  |  |  |- bookmark-tree-dnd.js         # Drag-and-drop logic
|  |  |  |- bookmark-tree-state.js       # Tree state utilities
|  |  |  |- modals.js         # Modal dialogs
|  |  |  |- favicon-cache.js  # Local favicon storage
|  |  |  |- custom-scrollbar.js
|  |  |  `- notifications.js  # Toast notification system
|  |  `- options/             # Standalone WebDAV config page
|  |     |- options.html
|  |     |- options.js
|  |     `- options.css
|  |- lib/
|  |  |- i18n.js              # i18n loader and translator (window.YABMI18n)
|  |  `- sync-utils.js        # WebDAV + import/export (window.YABMSync)
|  |- assets/
|  |  |- icons/               # Extension icons
|  |  |- fonts/               # Custom fonts (Space Grotesk, Material Symbols)
|  |  `- twemoji/             # Twemoji SVGs for locale/status icons
|  `- _locales/               # i18n message bundles (11 languages)
|- README.md
|- AGENTS.md                  # Agent/coding assistant instructions
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
1. Click the extension icon to open bookmark manager page
2. View your bookmarks in a collapsible tree structure
3. Right-click on bookmarks/folders for context menu actions:
   - Edit, delete, copy URL
   - Refresh favicon
   - Create new bookmarks/folders
4. Drag and drop to reorganize

### WebDAV Sync Setup
1. Open configuration (gear icon or via options page)
2. Set WebDAV directory URL (HTTPS only)
3. Enter credentials (username/password)
4. Click `Test` to verify connection
5. Select or enter target file name from the dropdown
6. Save configuration
7. Use `Upload` to push local bookmarks to WebDAV
8. Use `Download` to pull and overwrite local bookmarks from WebDAV

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

The UI language follows Chrome's display language setting.

## Permissions

Declared in `manifest.json`:

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read and modify browser bookmarks |
| `storage` | Save local extension settings and cache |
| `optional_host_permissions: https://*/*` | Request access to specific HTTPS WebDAV host at runtime |

## Data & Security

- WebDAV URL, username, password, and selected file name are stored in `chrome.storage.local`
- Credentials are used only to build request `Authorization` headers for WebDAV calls
- WebDAV sync is limited to HTTPS URLs (no HTTP)
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

- Manifest V3 extension
- Scripts load via `<script>` tags (no ESM imports)
- Global namespaces: `window.YABMI18n`, `window.YABMSync`
- Module pattern via factory functions (e.g., `createBookmarkTreeModule`)

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
- `npm run typecheck` runs TypeScript in `checkJs` mode for the shared libraries, background scripts, and tooling layer.
- `npm run check` runs lint, typecheck, and build in sequence.

Load `src/` in Chrome for the legacy direct-edit flow, or load `dist/` when you want to verify the tooling build output.

### Quick Syntax Check

```powershell
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
node --check src/lib/i18n.js
node --check src/background/service-worker.js
```

### Manual Testing

1. Load extension in Chrome Developer Mode
2. Verify bookmark tree renders correctly
3. Test CRUD operations (create/edit/delete/move)
4. Test WebDAV connection and sync
5. Test locale switching via Chrome language settings

For detailed development conventions, see [AGENTS.md](./AGENTS.md).

## Versioning

- Current version: `0.1.0`
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT License. See [LICENSE](./LICENSE).
