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
| 3 | Directory and Feature Architecture | Not started | Reorganize the repo into a more modern app/core/shared/features structure |

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

## Phase 3: Directory and Feature Architecture

### Objective

Reshape the project into a more modern structure after the runtime and dependency boundaries are stable enough to move safely.

### Scope

- reorganize source layout around application entry points, shared infrastructure, and business features
- separate page bootstrapping from feature logic and shared platform code
- consolidate duplicated config-related flows between bookmarks and options pages

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

### Recommended Task Order

1. Extract shared helpers that are already reused across pages.
2. Introduce feature-level folders inside the existing page structure first.
3. Move config-related logic toward a shared feature or shared core service.
4. Split large page files into smaller focused modules if still needed.
5. Reorganize top-level directories only after imports or load references are easy to update safely.
6. Update docs and build assumptions after every move that affects paths.

### Suggested Deliverables

- clear split between app bootstrapping and reusable code
- fewer large, catch-all files
- config flow shared between bookmarks modal and options page where appropriate
- architecture docs updated to match the actual repo layout

### Acceptance Criteria

- directory structure matches the chosen target architecture
- build and extension loading still work
- docs reflect the new structure accurately
- future tasks can identify where new code belongs without guesswork

## Decision Rules

- If a task only adds safety or tooling, it belongs in Phase 1 or Phase 2, not Phase 3.
- If a task moves files or changes ownership boundaries, it likely belongs in Phase 3.
- If a task changes runtime loading or module format, it belongs in Phase 2 and must include explicit regression verification.

## Verification Expectations Per Phase

- Run `npm run check` after meaningful changes.
- Run `node --check` for each modified JS file if the task touches runtime JavaScript.
- Reload the extension in Chrome and manually verify affected flows.
- Record actual verification steps in [docs/modernization/STATUS.md](docs/modernization/STATUS.md).