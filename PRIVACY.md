# Privacy Policy

Last updated: 2026-10-06

## Overview

Yet Another Bookmark Manager is a local-first Chrome extension for bookmark management with optional WebDAV sync.

## Data We Process

The extension can process:

- Browser bookmark data (titles, URLs, folders)
- WebDAV configuration (directory URL, file name, username, password)
- Local extension preferences (language and UI-related settings)
- Local favicon cache data
- The ID of the open bookmarks tab (session storage only; discarded when the browser session ends)

## Where Data Is Stored

- `chrome.storage.local` is used for extension settings, WebDAV config, and local cache.
- `chrome.storage.session` holds only the bookmarks-tab ID used to focus an existing tab; it is cleared when the browser session ends.
- Bookmark data remains in Chrome bookmark storage unless you explicitly sync to your WebDAV server.

## Network Access

The extension performs network requests in two categories.

WebDAV operations, only when you configure and use them:

- Test WebDAV connection
- List files in WebDAV directory
- Upload bookmarks to WebDAV
- Download bookmarks from WebDAV
- Read remote bookmark file for status/count checks

WebDAV requests are limited to HTTPS endpoints.

Asset requests made by the extension pages themselves:

- Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) for the UI typeface and icon font
- jsDelivr (`cdn.jsdelivr.net`) for Twemoji SVG icons

These asset requests carry no bookmark data, no WebDAV credentials, and no identifiers. They are ordinary asset fetches that reveal your IP address and the fact that you are using this extension. Pages fall back to text glyphs when the assets are blocked.

## Permissions

The extension requests:

- `bookmarks`: read/write bookmark tree
- `storage`: store local settings and cache
- optional host permissions (`https://*/*`): requested only for selected WebDAV host

## Credential Handling

- Username/password are stored locally in `chrome.storage.local`.
- Credentials are used to generate HTTP `Authorization` headers for WebDAV requests.
- The extension does not send credentials to third-party analytics services.

## Data Sharing

- No built-in analytics, tracking, or ad SDK.
- No intentional sharing of your data with third parties by the extension itself.
- If you configure WebDAV, your bookmark data is sent to your chosen WebDAV server.

## Data Retention and Control

You can control data at any time:

- Remove WebDAV configuration from extension settings
- Uninstall the extension to remove extension-local storage
- Delete or edit bookmark data in Chrome
- Remove remote bookmark files from your WebDAV server

## Contact

For privacy questions, open an issue in this repository.
