# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

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
