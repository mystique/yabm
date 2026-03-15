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

- Current phase: Phase 1 complete, Phase 2 not started
- Overall status: Safe tooling baseline established
- Last updated: 2026-03-15
- Recommended next task: clean page-layer lint warnings and start bringing `pages/options` into typecheck scope

## Completed Work

### 2026-03-15

- Added npm tooling entrypoint in [package.json](package.json).
- Added ESLint flat config in [eslint.config.cjs](eslint.config.cjs).
- Added TypeScript `checkJs` config in [tsconfig.json](tsconfig.json).
- Added build pipeline in [tools/build.cjs](tools/build.cjs).
- Added ambient globals in [types/yabm-globals.d.ts](types/yabm-globals.d.ts).
- Updated [README.md](README.md), [AGENTS.md](AGENTS.md), and [CLAUDE.md](CLAUDE.md) to reflect the new workflow.
- Tightened JSDoc in [src/lib/i18n.js](src/lib/i18n.js) and [src/lib/sync-utils.js](src/lib/sync-utils.js) so the shared-library typecheck baseline passes.

## Verification Log

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

`npm run lint` currently passes with warnings only.

Open warnings:

- [src/pages/bookmarks/bookmark-tree-render.js](src/pages/bookmarks/bookmark-tree-render.js) has an unused `handleFolderDrop` binding.
- [src/pages/bookmarks/bookmarks.js](src/pages/bookmarks/bookmarks.js) has an unused `editContextTarget` binding.
- [src/pages/bookmarks/modals.js](src/pages/bookmarks/modals.js) has an unused `setWebdavStatusIndicator` binding.

## Next Work Queue

### Phase 2 Entry Tasks

- [ ] Remove the 3 existing page-layer ESLint warnings.
- [ ] Add DOM narrowing helpers or local casting patterns for `src/pages/options/options.js`.
- [ ] Expand `tsconfig.json` include scope to add `src/pages/options/**/*.js` once it passes.
- [ ] Verify options page load, config save, and connection test after typecheck expansion.
- [ ] Repeat the same process for bookmarks page modules in small batches instead of all at once.

### Phase 2 Follow-Up Tasks

- [ ] Identify the highest-risk `window.YABM*` access points and replace them with narrower dependencies.
- [ ] Decide whether runtime ESM migration is still desired after page-level type safety improves.
- [ ] If runtime ESM remains desired, document the exact migration path before changing HTML script loading.

### Phase 3 Preparation Tasks

- [ ] Map shared logic candidates between bookmarks and options pages.
- [ ] Identify files that should move into `core/` or `shared/` later.
- [ ] Confirm a target directory structure before moving files.

## Notes For Future Tasks

- Do not treat `dist/` as source of truth.
- Keep runtime behavior unchanged unless the task explicitly includes behavioral changes.
- Prefer small, reversible modernization steps.
- Update this file in the same task where progress is made so the history stays accurate.