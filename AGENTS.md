# Agent Guide for YABM Classic
This file is for coding agents operating in this repository.
Follow repo-specific behavior over generic best practices.
## 1) Repository Snapshot
- Product: Chrome Extension (Manifest V3), plain JS/CSS/HTML at runtime.
- npm dev tooling only: esbuild (transpile to `dist/`, no bundling), ESLint, TypeScript `checkJs`. No test runner.
- Extension loads directly from `src/` in Chrome Developer Mode (or `dist/` after a build).
- Main feature area: bookmark management plus optional WebDAV sync.
Key paths:
- `src/manifest.json` - manifest, permissions, entry points.
- `src/background/service-worker.js` - toolbar click opens bookmarks page.
- `src/pages/bookmarks/` - main app UI and modularized bookmark logic.
- `src/pages/options/` - standalone WebDAV config page.
- `src/lib/i18n.js` - i18n loader and translator (`window.YABMI18n`).
- `src/lib/theme.js` - theme loading and application (`window.YABMTheme`).
- `src/lib/sync-utils.js` - WebDAV + import/export (`window.YABMSync`).
- `src/_locales/` - locale message bundles.
- `src/assets/` - icons/twemoji/static assets.
- `tsconfig.json` - `checkJs` scope; `types/yabm-globals.d.ts` - `window.YABM*` declarations.
- `tools/build.cjs` - build script.
- `docs/modernization/` - modernization roadmap and status tracker.
## 2) Build / Lint / Test Commands
Reality in this repo:
- Build: `npm run build` (copies `src/` to `dist/` and transpiles JS with esbuild, no runtime architecture change).
- Lint: `npm run lint`.
- Typecheck: `npm run typecheck` (TypeScript `checkJs` for shared libs, background scripts, the whole page layer, and tooling).
- All of the above: `npm run check` (lint, typecheck, build in sequence).
- Unit/integration test runner: none configured.
Local development flow:
1. Run `npm install` once.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
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
When changing JS, run `node --check` on each modified JS file and `npm run typecheck`.
When adding a bookmarks page JS file, add it to the `tsconfig.json` `include` list (bookmarks files are listed individually).
When changing UI behavior, also manually verify in Chrome.
## 3) Architecture and Runtime Contracts
Manifest/runtime:
- `manifest_version` is `3`.
- Optional host permissions are HTTPS only: `https://*/*`.
- Host access is requested at runtime via `chrome.permissions.request`.
Script loading model:
- Do not introduce ESM import/export. Runtime ESM migration is deliberately deferred; see the ESM Deferral section in `docs/modernization/STATUS.md` for the conditions to revisit it.
- Scripts are loaded via `<script>` tags and global namespaces.
- In pages, shared libs load first in this order: `i18n.js`, `theme.js`, `sync-utils.js`. Then page scripts; on the bookmarks page, feature modules load before `bookmark-tree.js`, and `bookmarks.js` loads last.
Module exposure pattern:
- Shared libs expose `window.YABM...` globals; each bookmarks feature module exposes its factory as `window.YABM*Module`.
- Feature modules in bookmarks page use factory style, e.g. `createXModule(deps)`, with a JSDoc `@typedef` for the deps object.
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
- Read shared library services (`window.YABMI18n`, `window.YABMTheme`, `window.YABMSync`) only in the page bootstraps (`bookmarks.js`, `options.js`).
- In bookmarks modules, receive services through the factory `deps` object instead of reading `window.YABM*` globals (e.g. `modals.js` gets `deps.sync`).
- Allowed direct access in feature modules: Chrome platform APIs (`chrome.bookmarks`, `chrome.storage`), DOM/browser globals, and the module factories read by `bookmark-tree.js` as the tree composition root. See "Page Global Boundaries" in `docs/modernization/STATUS.md`.
- When adding a new bookmarks module, wire it in `bookmarks.html` script order intentionally, declare its global in `types/yabm-globals.d.ts`, and add it to `tsconfig.json`.
Do not:
- Add npm-only import patterns without introducing full tooling.
- Assume module scope isolation across script tags.
## 6) Types and Documentation Expectations
Type system:
- Project is JavaScript, not TypeScript.
- Use JSDoc where it adds clarity (typedefs, function contracts, non-obvious return shapes).
- All JS under `src/` is typechecked (`checkJs`, non-strict). Keep `npm run typecheck` green.
Good JSDoc use cases in this repo:
- State object schema.
- File metadata structures.
- Functions with non-trivial parameters/return data.
- Factory `deps` objects and returned module APIs, declared at file scope (outside the IIFE) so other files can reference them via `import("./file.js").TypeName`.
Typing DOM access:
- Narrow at the point of use with `instanceof` checks rather than broad `/** @type */` casts.
- Do not satisfy the typechecker with `if (!el) return;` on user-visible paths. If a required element is missing, throw so the existing error path shows it (e.g. `requireElement` / `requireInput` in `options.js`).
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
1. Run `node --check` on every modified JS file, then `npm run check`.
2. Reload extension in Chrome (`chrome://extensions/`, Reload button).
3. Manually test affected flows in UI.
4. Confirm no regressions in bookmarks page startup.
5. Confirm no regressions in WebDAV config/test/upload/download paths if touched.
## 11) Git / PR Conventions
- Commit style in history: Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.).
- Keep commits focused and explain user-facing impact.
- Stage files by explicit path; do not use `git add -A` / `git add .`, especially when several agents share the working tree.
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
- `README.md` - tooling commands and manual Chrome loading flow.
- `docs/modernization/STATUS.md` - current typecheck scope, global boundary audit, and ESM deferral.
- `tsconfig.json` - actual typecheck scope.
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

## Agent skills

### Issue tracker

Issues and specs live as local Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/` when those documents exist. See `docs/agents/domain.md`.
