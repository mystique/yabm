# Agent Guide for YABM Classic
This file is for coding agents operating in this repository.
Follow repo-specific behavior over generic best practices.
## 1) Repository Snapshot
- Product: Chrome Extension (Manifest V3), plain JS/CSS/HTML.
- No bundler, no transpiler, no package manager, no test runner.
- Extension loads directly from `src/` in Chrome Developer Mode.
- Main feature area: bookmark management plus optional WebDAV sync.
Key paths:
- `src/manifest.json` - manifest, permissions, entry points.
- `src/background/service-worker.js` - toolbar click opens bookmarks page.
- `src/pages/bookmarks/` - main app UI and modularized bookmark logic.
- `src/pages/options/` - standalone WebDAV config page.
- `src/lib/i18n.js` - i18n loader and translator (`window.YABMI18n`).
- `src/lib/sync-utils.js` - WebDAV + import/export (`window.YABMSync`).
- `src/_locales/` - locale message bundles.
- `src/assets/` - icons/twemoji/static assets.
## 2) Build / Lint / Test Commands
Reality in this repo:
- Build: `npm run build` (copies `src/` to `dist/` and transpiles JS with esbuild, no runtime architecture change).
- Lint: `npm run lint`.
- Typecheck: `npm run typecheck` (TypeScript `checkJs` for shared libs, background scripts, and tooling).
- Unit/integration test runner: none configured.
Local development flow:
1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Run `npm install` once.
4. Click Load unpacked.
5. Select `src/` for direct source loading, or `dist/` after `npm run build` when validating the build artifact.
Syntax validation (run from repo root):
```powershell
npm run lint
npm run typecheck
npm run build
node --check src/pages/bookmarks/bookmarks.js
node --check src/pages/options/options.js
node --check src/lib/sync-utils.js
node --check src/lib/i18n.js
node --check src/background/service-worker.js
```
Single-test execution guidance:
- Not available because no automated tests exist.
- "Run one test" equivalent is `node --check <modified-file.js>` for the specific file.
When changing JS, run `node --check` on each modified JS file.
When changing shared libraries, background scripts, or tooling files, also run `npm run typecheck`.
When changing UI behavior, also manually verify in Chrome.
## 3) Architecture and Runtime Contracts
Manifest/runtime:
- `manifest_version` is `3`.
- Optional host permissions are HTTPS only: `https://*/*`.
- Host access is requested at runtime via `chrome.permissions.request`.
Script loading model:
- Do not introduce ESM import/export unless project is explicitly migrated.
- Scripts are loaded via `<script>` tags and global namespaces.
- In pages, `i18n.js` must load before `sync-utils.js`.
Module exposure pattern:
- Shared libs expose `window.YABM...` globals.
- Feature modules in bookmarks page use factory style, e.g. `createXModule(...)`.
- Keep public surface explicit; avoid hidden cross-file coupling.
## 4) Code Style Conventions (Observed)
Formatting:
- 2-space indentation in JS, HTML, and CSS.
- Semicolons are consistently used.
- Prefer trailing commas in multiline objects/arrays/params.
- Keep line length readable; use multiline formatting for long expressions.
Declarations and functions:
- Use `const` by default; use `let` only when reassignment is required.
- Avoid `var`.
- Use named `function` declarations for top-level reusable logic.
- Use arrow functions for short callbacks and local adapters.
Naming:
- `camelCase` for variables and functions.
- `UPPER_SNAKE_CASE` for constants (especially shared/static maps).
- `PascalCase` for constructor-like entities (rare in current code).
- Use verb-led handler names: `handleUpload`, `renderFileList`, `setStatus`.
Control flow:
- Favor guard clauses and early returns.
- Keep async flows readable with `async/await`.
- Prefer `Promise.all` where independent async work can run in parallel.
## 5) Imports, Globals, and Cross-File Interaction
There are no JS imports today.
Instead:
- Access shared libraries through `window.YABMI18n` and `window.YABMSync`.
- In bookmarks modules, pass dependencies into factory creators instead of reading many globals inside modules.
- When adding a new bookmarks module, wire it in `bookmarks.html` script order intentionally.
Do not:
- Add npm-only import patterns without introducing full tooling.
- Assume module scope isolation across script tags.
## 6) Types and Documentation Expectations
Type system:
- Project is JavaScript, not TypeScript.
- Use JSDoc where it adds clarity (typedefs, function contracts, non-obvious return shapes).
Good JSDoc use cases in this repo:
- State object schema.
- File metadata structures.
- Functions with non-trivial parameters/return data.
Do not over-document trivial one-liners.
## 7) Error Handling and User Feedback
Error handling patterns to follow:
- Wrap user-triggered async operations in `try/catch`.
- Throw `Error` with useful, user-oriented messages.
- Prefer translated messages using `t("messageKey")`.
- Use UI status/toast updates for failures and success states.
Avoid:
- Silent failures.
- Swallowing errors without user-visible signal.
- Logging secrets or WebDAV credentials.
## 8) i18n Rules
- Use `window.YABMI18n.t(key, substitutions)` for user-facing strings.
- Keep text keys in locale files under `src/_locales/<locale>/messages.json`.
- Use `$1`, `$2`, ... placeholders in message strings when needed.
- If adding UI text, update locale bundles accordingly.
## 9) Security and Permissions
- Enforce HTTPS for WebDAV URLs.
- Do not reintroduce URL-embedded credentials.
- Keep credentials in `chrome.storage.local` only as currently designed.
- Avoid emitting credentials in logs, errors, toasts, or telemetry.
- If permissions change, update `src/manifest.json` and mention in PR notes.
## 10) Verification Checklist for Agents
Before finishing code changes:
1. Run `node --check` on every modified JS file.
2. Reload extension in Chrome (`chrome://extensions/`, Reload button).
3. Manually test affected flows in UI.
4. Confirm no regressions in bookmarks page startup.
5. Confirm no regressions in WebDAV config/test/upload/download paths if touched.
## 11) Git / PR Conventions
- Commit style in history: Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.).
- Keep commits focused and explain user-facing impact.
- PR should include:
  - What changed and why.
  - Verification steps actually performed.
  - UI screenshots/GIFs for visible changes.
## 12) Cursor / Copilot Rules Detection
Agent scan result in this repository:
- `.cursorrules`: not found.
- `.cursor/rules/`: not found.
- `.github/copilot-instructions.md`: not found.
If any of these files are added later, treat them as higher-priority agent instructions and merge their guidance with this document.

## 13) Evidence Pointers (Where Rules Came From)
Use these files when validating assumptions before edits:
- `README.md` - confirms no build step and manual Chrome loading flow.
- `CLAUDE.md` - documents runtime architecture and script load ordering.
- `src/manifest.json` - canonical permission and entry-point definitions.
- `src/pages/bookmarks/bookmarks.html` - actual script tag order and module wiring.
- `src/pages/options/options.html` - standalone options page loading pattern.
- `src/lib/i18n.js` - i18n API surface and locale resolution behavior.
- `src/lib/sync-utils.js` - WebDAV permission model and HTTPS constraints.
- `src/pages/bookmarks/bookmarks.js` - naming, event, and async handling style.
- `src/pages/options/options.js` - JSDoc usage and form-state conventions.

When guidance conflicts, prioritize in this order:
1. Direct code behavior in `src/`.
2. `manifest.json` runtime constraints.
3. This file (`AGENTS.md`).
4. Generic tooling assumptions.
