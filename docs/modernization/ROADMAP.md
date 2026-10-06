# Modernization Roadmap

This document is the long-lived plan for modernizing the YABM codebase without breaking the current Chrome extension runtime model too early.

Use this document for:
- understanding the full 3-phase modernization strategy
- deciding what belongs in the current phase versus a later phase
- checking acceptance criteria before marking a phase complete

Do not use this document as a daily progress log. Update [docs/modernization/STATUS.md](docs/modernization/STATUS.md) for in-flight progress and verification history.

## Goals

- modernize the project incrementally instead of rewriting it
- preserve existing extension behavior unless a task explicitly changes behavior
- improve maintainability, verification, and future refactor safety
- keep the plain JavaScript runtime architecture stable until the project is ready for a module migration

## Non-Goals

- no React or framework rewrite
- no runtime UI redesign as part of modernization work alone
- no immediate switch to TypeScript source files
- no bundling strategy that changes script execution order unless it is explicitly part of Phase 2

## Phase Summary

| Phase | Name | Status | Outcome |
| --- | --- | --- | --- |
| 1 | Tooling Baseline | Completed | Build, lint, and JSDoc type checking exist and are documented |
| 2 | Module Boundary Modernization | Completed | The whole page layer is typechecked and service globals are confined to the page bootstraps; script-tag runtime loading is preserved |
| — | Architecture Deepening (post-Phase-2) | Completed, four tickets open | Shared WebDAV workflows, one overlay primitive, and a single-job page bootstrap. Spec and tickets in `.scratch/architecture-deepening/` |
| 3 | Directory and Feature Architecture | Not started | Reorganize the repo into a more modern app/core/shared/features structure |

The architecture-deepening stream ran after Phase 2 closed and is not a phase of its own: it deepened module boundaries without moving files, keeping the runtime model intact. Its remaining tickets (a test runner, a `sync-utils.js` split target, a PROPFIND parsing fix, and an open-folder race) are tracked in [STATUS.md](STATUS.md) under *Next Work Queue*.

## Phase 1: Tooling Baseline

### Objective

Introduce modern engineering guardrails without changing runtime behavior.

### Scope

- add an npm-based tooling layer
- add esbuild for dist output generation
- add ESLint with a conservative baseline
- add TypeScript `checkJs` for safe JSDoc validation
- document the new commands and working model

### Completed Work

- added [package.json](package.json) with `build`, `lint`, `typecheck`, and `check` scripts
- added [eslint.config.cjs](eslint.config.cjs) for repository linting
- added [tsconfig.json](tsconfig.json) for JSDoc-based type checking
- added [tools/build.cjs](tools/build.cjs) to copy `src/` to `dist/` and transpile JavaScript with esbuild
- added [types/yabm-globals.d.ts](types/yabm-globals.d.ts) for current global namespace declarations
- updated [README.md](../../README.md) and [AGENTS.md](../../AGENTS.md) to describe the tooling flow

### Acceptance Criteria

- `npm run build` succeeds
- `npm run lint` succeeds with no errors
- `npm run typecheck` succeeds for the agreed scope
- `npm run check` succeeds end-to-end
- `dist/` contains a runnable extension build
- docs explain when to use `src/` versus `dist/`

### Exit Status

Completed.

### Known Residual Items

- Page scripts still needed to enter the formal `checkJs` scope (resolved in Phase 2).
- Runtime globals remain a deliberate compatibility boundary until page-layer type safety is stable.

## Phase 2: Module Boundary Modernization

### Objective

Make the page code less fragile by reducing manual global coupling and improving internal boundaries before any large directory reshuffle.

### Scope

- bring page scripts into a more checkable and explicit dependency model
- reduce reliance on broad `window.YABM*` access patterns where practical
- prepare for eventual module-based loading without forcing a full rewrite immediately
- improve confidence in page-layer refactoring

### Recommended Task Order

1. Synchronize the roadmap and operational status with the agreed Phase 2 plan.
2. Remove the redundant Chrome runtime declarations and keep the existing page namespace declarations as a temporary boundary.
3. Add local DOM narrowing and data-shape contracts to the options page, then include it in `checkJs`.
4. Verify options startup, configuration, and WebDAV test flows in Chrome.
5. Add bookmarks foundational modules to `checkJs` in small dependency-ordered batches.
6. Add bookmarks rendering/menu, mutation/observer, drag-and-drop, and orchestrator modules in sequence.
7. Audit global reads and keep runtime-global access concentrated in page bootstrap code.
8. Run the Phase 2 acceptance checks and record that ESM remains deferred.

### Suggested Deliverables

- zero or near-zero lint warnings in `src/pages/`
- `pages/options` included in `checkJs`
- `pages/bookmarks` included in `checkJs`
- fewer direct cross-file global reads in large page entry files
- a written decision that runtime ESM remains deferred during this phase

### Acceptance Criteria

- page-layer lint warnings are resolved or deliberately documented
- page-layer typecheck passes for the chosen scope
- no regressions in bookmarks page startup
- no regressions in configuration modal and options page flows
- no regressions in WebDAV upload/download/test flows
- the existing script-tag runtime model remains intact
- the final verification evidence is recorded in `STATUS.md`

### Phase 2 Decisions

- The phase will strengthen script-tag modules and factory boundaries; it will not migrate runtime loading to ESM.
- The options page remains a bootstrap script rather than gaining a new factory layer.
- DOM helpers remain page-local until reuse across pages is demonstrated.
- No new test framework or top-level directory reorganization is included.
- The implementation plan and tracer-bullet tickets are published in `.scratch/phase-2-modernization/`.
- Runtime ESM migration is deferred (recorded 2026-09-27). Revisit it only after the Phase 2 Chrome smoke checks pass and page-layer lint/typecheck stay stable, as a separate task with explicit regression verification. See the ESM Deferral section in [STATUS.md](STATUS.md).

### Risks

- DOM-heavy code will expose many historical typing gaps
- changing module boundaries too aggressively can break script load assumptions
- ESM migration should not begin until the page layer has a stable type/lint baseline

### Completed Work

- removed redundant Chrome runtime type declarations
- brought `src/pages/options/options.js` and every `src/pages/bookmarks/*.js` file into `checkJs`
- made factory `deps` objects and returned module APIs explicit with file-scope JSDoc typedefs
- replaced silent missing-element early returns with thrown errors that reach existing user-visible error paths
- moved the `modals.js` sync service read behind factory injection; remaining global access is documented in [STATUS.md](STATUS.md)
- recorded that runtime ESM migration stays deferred

### Exit Status

Completed 2026-09-27. Automated checks and the manual Chrome smoke checklist passed. Evidence is in the [STATUS.md](STATUS.md) Verification Log.

### Known Residual Items

- `types/yabm-globals.d.ts` still declares every `window.YABM*` global as `any`, so cross-file contracts are only checked where modules reference each other's typedefs through JSDoc `import()`.
- `checkJs` runs non-strict (`"strict": false`).
- `bookmark-tree.js` still reads the tree sub-module factories from globals as the tree composition root.
- There is no automated test runner. Ticket 04 in `.scratch/architecture-deepening/` proposes a `node --test` setup for the pure functions in `sync-utils.js`; it is `ready-for-human` because it changes a documented convention, not because it is technically hard.

## Architecture Deepening (post-Phase-2, completed)

### Objective

Reduce the size of the page bootstrap and remove duplicated workflow logic, without changing the runtime model or moving files. This is the "deepen before you move" step Phase 3 depends on.

### Completed Work

- Shared the WebDAV config session and the remote file picker between the options page and the config modal (`src/lib/webdav-config-session.js`, `src/lib/webdav-file-picker.js`)
- replaced five hand-rolled overlay implementations with one viewport-anchored primitive (`src/pages/bookmarks/bookmark-overlay.js`)
- deepened the tree renderer and extracted the per-node action catalogue (`bookmark-tree-render.js`, `bookmark-tree-node-actions.js`)
- reduced `bookmarks.js` from 1,380 to 564 lines by extracting the WebDAV status module, the rich-text edit menu, the appearance menus, and the shared tooltip

### Deliberate Behaviour Changes

The overlay consolidation standardised on an 8px viewport margin (the language/theme menus and the tooltip were 10px) and made the language/theme menus clamp their top edge to the viewport, which previously let them hang off the bottom. These are user-visible and still need a manual Chrome pass.

### Known Residual Items

- Tickets 04-07 in `.scratch/architecture-deepening/` remain open; see [STATUS.md](STATUS.md).
- The manual Chrome click-through of the merged refactors is outstanding.
- The Twemoji CDN base URL is duplicated in two modules and is a candidate for `src/lib/` if a third consumer appears.

## Phase 3: Directory and Feature Architecture

### Objective

Reshape the project into a more modern structure after the runtime and dependency boundaries are stable enough to move safely.

### Scope

- reorganize source layout around application entry points, shared infrastructure, and business features
- separate page bootstrapping from feature logic and shared platform code
- give the standalone options page a defined role, or retire it. `src/manifest.json` points `options_page` at `pages/bookmarks/bookmarks.html?openConfig=1`, so `src/pages/options/options.html` is currently reachable only by opening its extension URL directly. Either wire it up or delete it before the directory move

### Target Shape

```text
src/
  app/
    bookmarks/
    options/
  core/
    chrome/
    i18n/
    storage/
    sync/
    theme/
  shared/
    dom/
    ui/
    utils/
    constants/
    types/
  assets/
  manifest.json
```

1. Run the manual Chrome click-through of the merged architecture-deepening refactors; the overlay margin and clamp changes are unverified in the browser.
2. Decide the options page's fate (see Scope).
3. Close the open architecture-deepening tickets, starting with 07.
4. Introduce feature-level folders inside the existing page structure first.
5. Reorganize top-level directories only after script-tag load references are easy to update safely.
6. Update `tsconfig.json`, `types/yabm-globals.d.ts`, both HTML files' script tags, and the docs after every move that affects paths.

### Suggested Deliverables

- clear split between app bootstrapping and reusable code
- fewer large, catch-all files (`bookmarks.js` is down to 564 lines; `src/lib/sync-utils.js` at 953 lines is now the largest file)
- config flow shared between bookmarks modal and options page (done: `src/lib/webdav-config-session.js` and `src/lib/webdav-file-picker.js`)
- architecture docs updated to match the actual repo layout

### Acceptance Criteria

- directory structure matches the chosen target architecture
- build and extension loading still work
- docs reflect the new structure accurately
- future tasks can identify where new code belongs without guesswork

## Decision Rules

- If a task only adds safety or tooling, it belongs to Phase 1 or Phase 2, not Phase 3.
- If a task deepens a module without moving files, it belongs to the architecture-deepening stream, not Phase 3.
- If a task moves files or changes ownership boundaries, it likely belongs to Phase 3.
- If a task changes runtime loading or module format, it belongs to Phase 2 and must include explicit regression verification.

## Verification Expectations Per Phase

- Run `npm run check` after meaningful changes.
- Run `node --check` for each modified JS file if the task touches runtime JavaScript.
- Reload the extension in Chrome and manually verify affected flows.
- Record actual verification steps in [docs/modernization/STATUS.md](docs/modernization/STATUS.md).