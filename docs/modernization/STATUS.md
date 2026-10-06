# Modernization Status

This document is the operational tracker for the modernization effort.

Use this document for:
- current phase status
- completed work history
- next recommended tasks
- verification notes
- updating progress during future tasks

For the full plan and phase boundaries, see [docs/modernization/ROADMAP.md](docs/modernization/ROADMAP.md).

## How To Update This File

When continuing the modernization work in a new task:

1. Update `Current Phase` if the active phase changed.
2. Move completed checklist items from `Next Work Queue` into `Completed Work`.
3. Add the date and verification steps you actually ran.
4. Keep items small and concrete so the next task can resume without rereading the whole repo.
5. If scope changes, update [docs/modernization/ROADMAP.md](docs/modernization/ROADMAP.md) first, then reflect the new status here.

## Current State

- Current phase: Phase 1 complete, Phase 2 complete; Phase 3 not started
- Overall status: an architecture-deepening stream ran after Phase 2 and is merged (`9cdd526`). Its spec and tickets live in `.scratch/architecture-deepening/`; tickets 01-03 shipped, 04-07 remain open
- Last updated: 2026-10-06
- Recommended next task: ticket 07 (open-folder re-render race), then the Phase 3 Preparation Tasks below
- Automated checks green as of 2026-10-06: `npm run check` (lint, typecheck, build) and `node --check` on all 25 `src/` JavaScript files
- Manual Chrome click-through of the post-Phase-2 refactors is still outstanding (see Verification Log)

## Completed Work

### 2026-10-06 (Architecture deepening, Candidates 1 and 2 — shared workflows and page bootstrap)

- Candidate 1: extracted the shared WebDAV config session into `src/lib/webdav-config-session.js` and the remote file picker into `src/lib/webdav-file-picker.js`. Both pages now consume them, so test-before-save, credential invalidation, stale-request protection, the `.html` name default, and the picker's rendering have one implementation. This closed `.scratch/architecture-deepening/` tickets 01 and 03's shared-workflow half (`ffd04a8`, `86b858d`).
- Extracted a viewport-anchored overlay into `src/pages/bookmarks/bookmark-overlay.js` (`createOverlay` returning `openAt`, `openBelow`, `reposition`, `close`, `isOpen`). Five hand-rolled overlay implementations collapsed into one. Deliberate behaviour changes: one 8px viewport margin everywhere (the language/theme menus and the tooltip were 10px), and the language/theme menus now clamp their top edge to the viewport instead of only the bottom (`274b6cc`).
- Gave `bookmarks.js` a single job: build collaborators, construct modules, wire the page's own handlers and `initPage`. The file shrank from 1,380 to 564 lines.
- Extracted the WebDAV connection chip, the status bar, and the upload/download actions into `src/pages/bookmarks/bookmark-webdav-status.js` (`setStatusIndicator`, `refreshStatusBar`, `uploadBookmarks`, `downloadBookmarks`). The button-disabling rules, the count queries, and the icon fallback listener now live with the code that depends on them.
- Extracted the rich-text context menu into `src/pages/bookmarks/bookmark-edit-menu.js` (one entry point: `handleContextMenu`), which hides the editable-target test, the selection read/replace helpers, and the menu catalogue.
- Extracted the language and theme pickers into `src/pages/bookmarks/bookmark-appearance-menu.js` (`bindTriggerButtons`, `refreshTriggerTooltips`); both menus, their option tables, the Twemoji flag lookup, and the two overlays stay private.
- Extracted the shared `[data-tooltip]` behaviour into `src/pages/bookmarks/bookmark-tooltip.js` (`bindEvents`), owning the hover/focus bookkeeping and the tooltip overlay.
- The composition root keeps only the collaborators it owns (`t`, `setStatus`, clipboard, layout metrics, the `editContextMenu` overlay) and passes them down; the new modules read no `window.YABM*` global.
- Refactor of the module graph: DOM structure, class names, data attributes, i18n keys, and async ordering are unchanged. The overlay extraction and its two margin/clamp changes are the exceptions, and they are user-visible. No locale strings added or renamed.
- Note for Phase 3: the Twemoji CDN base URL now appears in two modules (WebDAV chip, language flags). It is not shared by the options page, so it was not promoted to `src/lib/`.
- Verification: `node --check` on the touched files; `npm run check` green (lint + typecheck + build); re-grepped `src/` for every moved symbol with no dangling call sites. Manual Chrome click-through of the WebDAV chip, tooltips, picker menus, the edit context menu, and the overlay repositioning is still outstanding.

### 2026-09-28 (Architecture deepening, Candidate 3)

- Deepened `bookmark-tree-render.js`: its injected dependency list dropped from 30 named functions to 12 entries (5 collaborators, 4 state helpers, `t`, layout, drag attach). The returned surface is still just `renderBookmarks`.
- Extracted the per-node action catalogue (inline action bar for both row kinds, plus the bookmark and folder context-menu item sets) into `src/pages/bookmarks/bookmark-tree-node-actions.js`. The renderer no longer knows about any of the nine mutations, `openSortMenu`, `sortFolderAndRerender`, `openTreeContextMenu`, or `createActionButton`.
- Favicon resolution and its fallback chain now sit behind one call (`createFaviconCell`) in the renderer, with the cache services grouped into a single `favicons` collaborator instead of three top-level deps.
- Added `attachNodeDragHandlers` to `bookmark-tree-dnd.js` so per-row drag wiring is owned by the drag module.
- Added `closeAllMenus` to `bookmark-tree-menu.js` so the render cycle no longer takes three separate menu closers.
- Pure refactor: rendered DOM structure, class names, data attributes, listener registration order, i18n keys, and accessibility attributes are unchanged. No new locale strings.
- Verification: `node --check` on all five touched files; `npm run check` green (lint + typecheck + build); re-grepped `src/` for the removed render deps (`handleNodeDragStart`, `handleNodeDragEnd`, `createActionButton`, `openTreeContextMenu`, `openSortMenu`, `setFolderOpen`, and the nine mutations) with no dangling call sites. Manual Chrome click-through of context menus, action bars, drag, and favicon fallback is still outstanding.

### 2026-09-27 (Phase 2)

Strategy (agreed before implementation): strengthen script-tag factory modules instead of migrating to ESM; typecheck the page layer incrementally; keep DOM helpers page-local until reuse is demonstrated; no test framework and no Phase 3 directory reorganization.

- Synchronized the roadmap and status with the Phase 2 plan and published the spec and tickets under `.scratch/phase-2-modernization/`.
- Removed redundant Chrome runtime type declarations (`1b2e2c0`).
- Brought `src/pages/options/options.js` into `checkJs` with local DOM narrowing and file-metadata contracts (`af6659c`).
- Brought every `src/pages/bookmarks/*.js` module into `checkJs` in dependency-ordered batches (`b6f2513`, `a882416`, `916a0b0`, `91d4b68`, `aae551e`, `423614c`).
- Injected the sync service into `modals.js` and recorded the global boundary audit (`2cd34c4`, `27c1084`).
- Review fixes: missing-element early returns now throw into existing user-visible error paths; mutation typing simplified; ticket statuses corrected (`a3efdec`, `4652387`, `5b9d655`).
- Recorded acceptance evidence and the ESM deferral (`9bba1e5`); the maintainer's manual Chrome smoke checklist passed (`506760e`).
- Commit `a882416` mixes ticket 05, 06, and 07 work because an agent ran `git add -A`. History was left as is.

### 2026-03-18

- Fixed 3 page-layer ESLint warnings:
  - `bookmark-tree-render.js`: removed unused `handleFolderDrop` dependency
  - `modals.js`: removed unused `setWebdavStatusIndicator` dependency
  - `bookmarks.js`: removed unread `editContextTarget` variable
- `npm run lint` now passes with zero warnings

### 2026-03-15

- Added npm tooling entrypoint in [package.json](package.json).
- Added ESLint flat config in [eslint.config.cjs](eslint.config.cjs).
- Added TypeScript `checkJs` config in [tsconfig.json](tsconfig.json).
- Added build pipeline in [tools/build.cjs](tools/build.cjs).
- Added ambient globals in [types/yabm-globals.d.ts](types/yabm-globals.d.ts).
- Updated [README.md](README.md) and [AGENTS.md](AGENTS.md) to reflect the tooling flow.
- Tightened JSDoc in [src/lib/i18n.js](src/lib/i18n.js) and [src/lib/sync-utils.js](src/lib/sync-utils.js) so the shared-library typecheck baseline passes.

## Verification Log

### 2026-10-06 (architecture-deepening merge, `9cdd526`)

Automated checks (exit codes recorded):

- `npm run check` (lint, then typecheck, then build): exit 0
- `node --check` on all 25 JavaScript files under `src/pages`, `src/lib`, and `src/background`: all exit 0

Runtime-model checks:

- `bookmarks.html` loads `i18n.js`, `theme.js`, `sync-utils.js`, `webdav-config-session.js`, `webdav-file-picker.js`, then the feature modules, then `bookmark-tree.js`, then `bookmarks.js` last.
- `options.html` loads the same five libraries, then `options.js`.
- No `type="module"` script tags and no runtime `import`/`export` statements in `src/` or `dist/`; the only `import(...)` matches are JSDoc `@typedef` type imports.
- `src/manifest.json` is unchanged from the Phase 2 baseline: `options_page` still points at `pages/bookmarks/bookmarks.html?openConfig=1`, so `src/pages/options/options.html` is not reachable from the manifest or from any in-page link.

Not verified: the manual Chrome click-through of the merged refactors. The overlay extraction changed overlay margins and top-edge clamping, so it needs eyes in the browser before the Phase 3 directory work starts.


### 2026-09-27 (Phase 2 acceptance, ticket 10, at `5b9d655`)

Automated checks (exit codes recorded):

- `npm run lint`: exit 0 ("ESLint: No issues found")
- `npm run typecheck`: exit 0 (full page layer in scope)
- `npm run build`: exit 0
- `node --check` on all 17 JS files under `src/pages`, `src/lib`, and `src/background`: all exit 0

Runtime-model checks:

- `bookmarks.html` and `options.html` load `i18n.js`, then `theme.js`, then `sync-utils.js`, then page scripts. `bookmarks.html` loads feature modules before `bookmark-tree.js` and `bookmarks.js` last.
- No `type="module"` script tags in `src/` or `dist/`.
- No `import`/`export` statements in `src/` or `dist/`. The only `import(...)` matches are JSDoc `@typedef` type imports in `bookmark-tree.js` and `bookmarks.js` (comments, no runtime effect).
- `git diff 83b8e45 -- src/manifest.json src/pages/bookmarks/bookmarks.html src/pages/options/options.html` is empty, so the manifest entry points and script tags are unchanged.
- `dist/manifest.json` and both `dist/` HTML files match `src/`.

Manual Chrome verification: performed by the maintainer after the review fixes and ticket 10 (`9bba1e5`); every checklist item passed with no issues reported.

### Phase 2 Manual Chrome Smoke Checklist (passed 2026-09-27)

Reload the extension at `chrome://extensions/` (from `src/`, or `dist/` after `npm run build`), then check:

- [x] Bookmarks page starts with no console errors.
- [x] Bookmark and folder create, edit, and delete work and show status toasts.
- [x] Expand all, collapse all, and single-folder toggle work.
- [x] Context menu and sort menu open and apply their actions.
- [x] Drag-and-drop moves items, refuses a drop into a folder's own descendant, and clears the drop highlight.
- [x] Edit menu and tooltips work.
- [x] Language and theme switching work.
- [x] Options page loads, tests the connection, lists remote files, saves, and shows an error status on failure (invalid URL or credentials, save before test).
- [x] Bookmarks-page config modal pre-fills saved config, saves, and clears, and the status bar refreshes.
- [x] WebDAV upload and download work from the bookmarks page.

### 2026-03-18

- Ran `npm run lint` — passes with zero warnings
- Ran `npm run check` — all checks pass

### 2026-03-15

- Ran `npm install`.
- Ran `npm run lint`.
- Ran `npm run typecheck`.
- Ran `npm run build`.
- Ran `npm run check`.
- Ran `node --check src/lib/i18n.js`.
- Ran `node --check src/lib/sync-utils.js`.
- Ran `node --check src/background/service-worker.js`.
- Ran `node --check tools/build.cjs`.

## Current Baseline

### Tooling Commands

```powershell
npm install
npm run build
npm run lint
npm run typecheck
npm run check
```

### Build Behavior

- `npm run build` copies `src/` to `dist/`
- JavaScript is processed by esbuild without bundling
- runtime architecture is still script-tag plus global namespaces

### Typecheck Scope

Current `checkJs` scope includes:

- `src/background/**/*.js`
- `src/lib/**/*.js`
- `src/pages/options/**/*.js`
- every `src/pages/bookmarks/*.js` file, listed individually in `tsconfig.json`
- `tools/**/*.cjs`
- `types/**/*.d.ts`

The whole page layer is in scope, in non-strict mode (`"strict": false`). New bookmarks modules must be added to `tsconfig.json` explicitly.

### Lint Baseline

`npm run lint` passes with zero warnings.

## Next Work Queue

### Open Architecture-Deepening Tickets (`.scratch/architecture-deepening/`)

- [ ] Ticket 07 (`ready-for-agent`): the open-folder re-render race in `bookmark-tree-observers.js`. `rerenderAfterTreeChange` snapshots the DOM at call time, so a folder the user collapses mid-render is re-opened by the pending pass.
- [ ] Ticket 06 (`needs-info`): PROPFIND truncates remote names containing `?` or `#`. Needs an observation of a real WebDAV server's `<href>` encoding before the fix is specified.
- [ ] Ticket 05 (`needs-info`, blocked by 04): if `sync-utils.js` is ever split, the target is the Netscape import/export engine plus the atomic rollback, not the WebDAV transport.
- [ ] Ticket 04 (`ready-for-human`): a minimal `node --test` runner for the three pure functions in `sync-utils.js`. This is a convention change, so it needs a maintainer decision.

### Phase 3 Preparation Tasks

- [ ] Map shared logic candidates between bookmarks and options pages. The WebDAV config session and file picker are already shared; the remaining candidates are the sync-status rendering and the DOM helpers.
- [ ] Identify files that should move into `core/` or `shared/` later.
- [ ] Confirm a target directory structure before moving files.
- [ ] Run the manual Chrome click-through of the merged architecture-deepening refactors (see Verification Log, 2026-10-06) before moving anything.

## Page Global Boundaries

Audited 2026-09-27 (ticket 09); re-checked against the merged architecture-deepening work on 2026-10-06. Runtime-global service reads (`window.YABM*` library services) live in the page bootstraps: `src/pages/bookmarks/bookmarks.js` (`YABMI18n`, `YABMTheme`, `YABMSync`, `YABMWebdavConfigSession`, `YABMWebdavFilePicker`, and every feature-module factory) and `src/pages/options/options.js` (`YABMI18n`, `YABMTheme`, `YABMSync`, `YABMWebdavConfigSession`, `YABMWebdavFilePicker`).

Changed:

- `modals.js` receives the sync service, the config-session factory, and the file-picker factory through `deps` instead of reading `window.YABM*` directly.
- Every module extracted after Phase 2 (`bookmark-webdav-status.js`, `bookmark-edit-menu.js`, `bookmark-appearance-menu.js`, `bookmark-tooltip.js`, `bookmark-overlay.js`) reads no `window.YABM*` global.

Deliberate remaining global access in feature modules:

- `bookmark-tree.js` reads the `window.YABMBookmarkTree*Module` factories (state, observers, dnd, mutations, menu, node-actions, render). It is the tree composition root; moving factory acquisition into `bookmarks.js` would restructure the wiring, not a local change.
- `chrome.bookmarks.*` in `bookmark-tree-dnd.js`, `bookmark-tree-menu.js`, `bookmark-tree-mutations.js`, `bookmark-tree-observers.js`, and `bookmark-tree-render.js`. This is the Chrome platform API these modules exist to wrap, not an app-service global; injecting it adds indirection without a boundary benefit.
- `chrome.storage.local` in `favicon-cache.js`. The module owns the favicon cache key and its persistence, so it keeps the platform storage API.
- Each feature module assigns its own `window.YABM*Module` export; that is the script-tag module pattern, not a read.
- DOM/browser globals (`document`, `window.setTimeout`, `window.innerWidth`, `window.open`, `navigator`) are platform APIs and out of scope.

## ESM Deferral

Decided 2026-09-27 (ticket 10). Runtime ESM migration stays deferred. Pages keep classic `<script>` tags, `window.YABM*` globals, and factory modules. The decision is also recorded in the roadmap's Phase 2 Decisions.

Revisit ESM only when all of these hold:

- The Phase 2 Manual Chrome Smoke Checklist has passed, so runtime parity with the pre-Phase 2 baseline is confirmed.
- Lint and page-layer typecheck stay green across the whole page layer.
- The migration is planned as its own task with explicit regression verification (the roadmap's decision rule for module-format changes), not mixed with type work or the Phase 3 directory moves.
- The plan covers script execution order (module scripts are deferred), removing the `window.YABM*` namespace declarations, and `tools/build.cjs` output.

## Notes For Future Tasks

- Do not treat `dist/` as source of truth.
- Keep runtime behavior unchanged unless the task explicitly includes behavioral changes.
- Prefer small, reversible modernization steps.
- Update this file in the same task where progress is made so the history stays accurate.