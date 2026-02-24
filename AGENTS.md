# Repository Guidelines

## Project Structure & Module Organization

This is a Chrome Extension (Manifest V3) built with plain JS/CSS/HTML.

- `src/manifest.json`: extension manifest and permissions.
- `src/background/`: service worker entry point.
- `src/pages/`: UI pages (main bookmarks UI and options).
- `src/lib/`: shared libraries (`i18n`, `sync-utils`).
- `src/_locales/`: Chrome i18n message packs.
- `src/assets/`: icons, images, and static assets.

## Build, Test, and Development Commands

There is no build step or package manager. Load `src/` directly in Chrome:

- Open `chrome://extensions/`, enable Developer mode, click "Load unpacked", select `src/`.

Quick syntax checks (run from repo root):

```powershell
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
node --check src/lib/i18n.js
```

## Coding Style & Naming Conventions

- Indentation: 2 spaces in JS/CSS/HTML.
- Semicolons are used; keep them consistent.
- Naming: `camelCase` for functions/vars, `PascalCase` for constructors/classes, `UPPER_SNAKE_CASE` for constants.
- Keep extension entry points small; avoid adding build tooling unless necessary.

## Testing Guidelines

No automated test framework is configured. Validate changes with:

- `node --check` on modified JS files.
- Manual verification in Chrome after loading the extension.

If you add tests, document the framework and commands in this file.

## Commit & Pull Request Guidelines

Git history uses Conventional Commit style (e.g., `feat: ...`). Follow that pattern.

Pull requests should include:

- A short description of user-facing changes.
- Repro/verification steps (e.g., “Load unpacked from `src/` and open bookmarks page”).
- Screenshots or short GIFs for UI changes.

## Security & Configuration Notes

WebDAV credentials are stored in `chrome.storage.local`. Avoid logging secrets and keep WebDAV URLs HTTPS-only. Changes affecting permissions should be reflected in `src/manifest.json` and reviewed carefully.
