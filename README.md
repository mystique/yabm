# Yet Another Bookmark Manager

A Chrome extension for visual bookmark management with optional WebDAV sync.

## Features

- Bookmark tree management
- Create, edit, delete, and move bookmarks/folders
- Drag-and-drop for bookmark organization
- Folder sorting (ascending/descending)
- Favicon refresh and local favicon cache
- Multi-language UI (i18n locale packs)
- WebDAV configuration and connection test
- Upload bookmarks to WebDAV
- Download bookmarks from WebDAV and overwrite local bookmarks
- WebDAV status bar and top action status indicator

## Project Structure

```text
.
|- src/
|  |- manifest.json
|  |- background/
|  |- pages/
|  |- lib/
|  |- assets/
|  `- _locales/
|- README.md
|- LICENSE
|- PRIVACY.md
`- CHANGELOG.md
```

## Requirements

- Google Chrome (Manifest V3 support required)

## Local Installation (Developer Mode)

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `src` folder (the folder containing `manifest.json`)
5. Pin and open the extension from the toolbar

## Usage

1. Click the extension icon to open bookmark manager page
2. Manage bookmarks in the tree
3. Open configuration and set WebDAV directory URL
4. Test connection
5. Select or enter target file name
6. Save configuration
7. Use `Upload` / `Download` buttons to sync

## WebDAV Status Indicator

The icon before `Upload` reflects runtime state:

- `not-configured` (white circle): missing directory URL or file name
- `checking` (hourglass): refresh/upload/download in progress
- `ready` (green circle): WebDAV file is readable
- `error` (red circle): connection/auth/permission/read error

## Permissions

Declared in `manifest.json`:

- `bookmarks`: Read and modify browser bookmarks
- `storage`: Save local extension settings and cache
- `optional_host_permissions: https://*/*`: Request access to specific HTTPS WebDAV host at runtime

## Data & Security Notes

- WebDAV URL, username, password, and selected file name are stored in `chrome.storage.local`
- Credentials are used only to build request `Authorization` headers for WebDAV calls
- WebDAV sync is limited to HTTPS URLs
- No built-in telemetry/analytics upload

See [PRIVACY.md](./PRIVACY.md) for details.

## Development

Current project is plain JS/CSS/HTML without mandatory build step.

Quick checks:

```powershell
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
```

## Versioning

- Current version: `0.1.0`
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT License. See [LICENSE](./LICENSE).
