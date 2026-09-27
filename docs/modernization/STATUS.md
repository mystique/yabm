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

- Current phase: Phase 1 complete, Phase 2 in progress (awaiting manual Chrome acceptance)
- Overall status: all Phase 2 code and automated checks are done; tickets 03, 07, 08, 09, and 10 are `ready-for-human`
- Last updated: 2026-09-27
- Recommended next task: run the Phase 2 Manual Chrome Smoke Checklist below, record the result in the Verification Log, then mark Phase 2 complete
- Phase 2 is not complete: manual Chrome verification has not been performed for any ticket.

### 2026-09-27

- Confirmed the Phase 2 strategy:
  - strengthen script-tag factory modules instead of migrating to ESM;
  - type-check the page layer incrementally;
  - keep DOM helpers page-local until reuse is demonstrated;
  - do not introduce a test framework or Phase 3 directory reorganization.
- Synchronized the Phase 2 status and roadmap.
- Published the Phase 2 specification at `.scratch/phase-2-modernization/spec.md` with `ready-for-agent` status.

## Completed Work

### 2026-09-27 (Phase 2 code)

- Removed redundant Chrome runtime type declarations (`1b2e2c0`).
- Brought `src/pages/options/options.js` into `checkJs` (`af6659c`).
- Brought every `src/pages/bookmarks/*.js` module into `checkJs` in batches (`b6f2513`, `a882416`, `916a0b0`, `91d4b68`, `aae551e`, `423614c`).
- Injected the sync service into `modals.js` and recorded the global boundary audit (`2cd34c4`, `27c1084`).
- Review fixes: missing-element early returns now throw into existing user-visible error paths; mutation typing simplified (`a3efdec`, `4652387`).
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

Manual Chrome verification: NOT performed. Phase 2 acceptance waits on the checklist below.

### Phase 2 Manual Chrome Smoke Checklist (pending)

Reload the extension at `chrome://extensions/` (from `src/`, or `dist/` after `npm run build`), then check:

- [ ] Bookmarks page starts with no console errors.
- [ ] Bookmark and folder create, edit, and delete work and show status toasts.
- [ ] Expand all, collapse all, and single-folder toggle work.
- [ ] Context menu and sort menu open and apply their actions.
- [ ] Drag-and-drop moves items, refuses a drop into a folder's own descendant, and clears the drop highlight.
- [ ] Edit menu and tooltips work.
- [ ] Language and theme switching work.
- [ ] Options page loads, tests the connection, lists remote files, saves, and shows an error status on failure (invalid URL or credentials, save before test).
- [ ] Bookmarks-page config modal pre-fills saved config, saves, and clears, and the status bar refreshes.
- [ ] WebDAV upload and download work from the bookmarks page.

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

The whole page layer is in scope. New bookmarks modules must be added to `tsconfig.json` explicitly.

### Lint Baseline

`npm run lint` passes with zero warnings.

## Next Work Queue

### Phase 2 Entry Tasks

- [x] Synchronize the roadmap and operational status with the approved Phase 2 plan.
- [x] Publish the Phase 2 tracer-bullet tickets under `.scratch/phase-2-modernization/issues/`.
- [x] Remove redundant Chrome runtime declarations.
- [x] Add local DOM narrowing and data-shape contracts for the options page.
- [x] Expand `tsconfig.json` to include the options page.
- [ ] Verify options startup, configuration save/clear, and WebDAV connection test (code analysis done; manual Chrome check pending).
- [x] Add bookmarks foundational modules to `checkJs` in small batches.
- [x] Add bookmarks rendering/menu modules to `checkJs`.
- [x] Add bookmarks mutations/observers modules to `checkJs`.
- [x] Add bookmarks drag-and-drop module to `checkJs` (manual Chrome check pending).
- [x] Add bookmarks tree and page orchestrators to `checkJs` (manual Chrome check pending).

### Phase 2 Boundary and Acceptance Tasks

- [x] Audit global reads and keep runtime-global access concentrated in page bootstrap code (see Page Global Boundaries; manual Chrome verification pending).
- [x] Run the automated Phase 2 acceptance checks and record the evidence (see Verification Log).
- [ ] Run the Phase 2 Manual Chrome Smoke Checklist (pending).
- [x] Record that runtime ESM remains deferred (see ESM Deferral).

### Phase 3 Preparation Tasks

- [ ] Map shared logic candidates between bookmarks and options pages.
- [ ] Identify files that should move into `core/` or `shared/` later.
- [ ] Confirm a target directory structure before moving files.

## Page Global Boundaries

Audited 2026-09-27 (ticket 09). Runtime-global service reads (`window.YABM*` library services) live in the page bootstraps: `src/pages/bookmarks/bookmarks.js` (`YABMI18n`, `YABMTheme`, `YABMSync`, feature-module factories) and `src/pages/options/options.js` (`YABMI18n`, `YABMTheme`, `YABMSync`).

Changed:

- `modals.js` now receives the sync service as `deps.sync` (passed `window.YABMSync` from `bookmarks.js`) instead of reading `window.YABMSync` directly (4 reads removed).

Deliberate remaining global access in feature modules:

- `bookmark-tree.js` reads the six `window.YABMBookmarkTree*Module` factories. It is the tree composition root; moving factory acquisition into `bookmarks.js` would restructure the wiring, not a local change.
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