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

- Current phase: Phase 1 complete, Phase 2 in progress
- Overall status: Phase 2 plan approved; documentation and ticket publication started
- Last updated: 2026-09-27
- Recommended next task: remove redundant Chrome runtime declarations, then bring `pages/options` into typecheck scope

### 2026-09-27

- Confirmed the Phase 2 strategy:
  - strengthen script-tag factory modules instead of migrating to ESM;
  - type-check the page layer incrementally;
  - keep DOM helpers page-local until reuse is demonstrated;
  - do not introduce a test framework or Phase 3 directory reorganization.
- Synchronized the Phase 2 status and roadmap.
- Published the Phase 2 specification at `.scratch/phase-2-modernization/spec.md` with `ready-for-agent` status.

## Completed Work

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
- `tools/**/*.cjs`
- `types/**/*.d.ts`

Current `checkJs` scope does not yet include:

- `src/pages/bookmarks/**/*.js`
- `src/pages/options/**/*.js`

### Lint Baseline

`npm run lint` passes with zero warnings.

## Next Work Queue

### Phase 2 Entry Tasks

- [x] Synchronize the roadmap and operational status with the approved Phase 2 plan.
- [x] Publish the Phase 2 tracer-bullet tickets under `.scratch/phase-2-modernization/issues/`.
- [ ] Remove redundant Chrome runtime declarations.
- [ ] Add local DOM narrowing and data-shape contracts for the options page.
- [ ] Expand `tsconfig.json` to include the options page.
- [ ] Verify options startup, configuration save/clear, and WebDAV connection test.
- [ ] Add bookmarks foundational modules to `checkJs` in small batches.
- [ ] Add bookmarks rendering/menu modules to `checkJs`.
- [ ] Add bookmarks mutations/observers modules to `checkJs`.
- [ ] Add bookmarks drag-and-drop module to `checkJs`.
- [ ] Add bookmarks tree and page orchestrators to `checkJs`.

### Phase 2 Boundary and Acceptance Tasks

- [ ] Audit global reads and keep runtime-global access concentrated in page bootstrap code.
- [ ] Run the complete Phase 2 acceptance checks and record the evidence.
- [ ] Record that runtime ESM remains deferred during this phase.

### Phase 3 Preparation Tasks

- [ ] Map shared logic candidates between bookmarks and options pages.
- [ ] Identify files that should move into `core/` or `shared/` later.
- [ ] Confirm a target directory structure before moving files.

## Notes For Future Tasks

- Do not treat `dist/` as source of truth.
- Keep runtime behavior unchanged unless the task explicitly includes behavioral changes.
- Prefer small, reversible modernization steps.
- Update this file in the same task where progress is made so the history stays accurate.