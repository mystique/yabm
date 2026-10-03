# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Dark mode with a Light / Dark / System theme picker on the bookmarks and options pages; the choice is saved and shared across extension pages
- Clicking the toolbar icon focuses an existing bookmarks tab instead of opening a duplicate
- Full translations for German, Spanish, French, Italian, Portuguese, Russian, Japanese, and Korean (these locales previously showed English text)
- Drag-and-drop visual feedback (drag source, drop target, and drag preview styling)
- Favicon refresh now reports when an update is already running instead of starting a second one
- Favicon cache entries for deleted bookmarks are pruned automatically

### Changed

- WebDAV configuration testing and saving now share one session rule across the options page and bookmarks modal, including stale-request protection.
- Bookmark tree changes use one refresh coordinator so renders, open folders, favicon state, and WebDAV status stay ordered across page actions and Chrome events.
- Drag-and-drop owns its visual cleanup through the complete drag lifecycle, including cancelled and failed asynchronous drops.
- Fonts (Space Grotesk, Material Symbols) load from Google Fonts and Twemoji icons load from jsDelivr instead of being bundled; the pages now need network access to render these assets
- Extension pages now declare an explicit Content Security Policy limited to these font/icon hosts and HTTPS connections
- Dropping an item onto a folder no longer auto-expands that folder
- Bookmarks page code is split into focused modules (tree state, rendering, menus, mutations, observers, drag-and-drop, modals, favicon cache, notifications, scrollbar)
- Developer tooling: npm scripts for build (esbuild to `dist/`), lint (ESLint), and JSDoc typecheck (TypeScript `checkJs`) covering all extension JavaScript; the runtime still uses classic script tags
- A missing required page element now shows an error message instead of silently leaving the page unresponsive

### Fixed

- A completed WebDAV request from old credentials can no longer restore save eligibility after the form changes.
- Bookmark refresh requests that arrive during another refresh are processed after the current pass.
- Drag cancellation, target lookup failures, and failed moves now clear source styling, drop highlights, and drag previews.
- Folders can no longer be dropped into their own descendants
- A race where the drag state was cleared before the drop finished, which could make a valid drop fail
- Dropping onto a folder element with no folder ID no longer triggers an unhandled error

### Removed

- Bundled font files and local Twemoji SVGs (replaced by the CDN assets above)

## [0.1.0] - 2026-02-23

### Added

- Initial Chrome extension scaffold with Manifest V3
- Bookmark manager page opened from toolbar action
- Bookmark tree rendering and summary stats
- Create, edit, delete, and move bookmarks/folders
- Drag-and-drop support for bookmark organization
- Folder sorting actions (ascending and descending)
- Favicon refresh utilities and local favicon cache
- Multi-language UI via locale messages
- WebDAV configuration flow with connection test and file selection
- Upload bookmarks to WebDAV
- Download bookmarks from WebDAV and overwrite local bookmarks
- WebDAV bottom status bar (URL, remote entry count, browser entry count)
- Top action WebDAV status indicator before Upload
  - not-configured (white circle)
  - checking (hourglass)
  - ready (green circle)
  - error (red circle)
- Local Twemoji assets for language and WebDAV status icons

### Changed

- Refined top action WebDAV indicator visual style:
  - removed hard border
  - applied softer background and subtle shadow
