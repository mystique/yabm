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
| 2 | Module Boundary Modernization | Not started | Reduce global coupling and make page code safer to evolve |
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
- updated [README.md](README.md), [AGENTS.md](AGENTS.md), and [CLAUDE.md](CLAUDE.md) to describe the tooling flow

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

- ESLint still reports 3 existing warnings in page scripts
- page scripts are not yet included in `checkJs` scope

## Phase 2: Module Boundary Modernization

### Objective

Make the page code less fragile by reducing manual global coupling and improving internal boundaries before any large directory reshuffle.

### Scope

- bring page scripts into a more checkable and explicit dependency model
- reduce reliance on broad `window.YABM*` access patterns where practical
- prepare for eventual module-based loading without forcing a full rewrite immediately
- improve confidence in page-layer refactoring

### Recommended Task Order

1. Clean the current lint baseline in page scripts.
2. Add JSDoc narrowing and helper utilities so `pages/options` can enter `typecheck` scope.
3. Add JSDoc narrowing and helper utilities so `pages/bookmarks` modules can enter `typecheck` scope incrementally.
4. Replace the most brittle implicit globals with narrower dependency injection boundaries.
5. Decide whether to stop at stronger script-tag modules or to migrate build output to ESM entry points.
6. If migrating to ESM output, keep behavior parity and script ordering guarantees explicitly tested.

### Suggested Deliverables

- zero or near-zero lint warnings in `src/pages/`
- `pages/options` included in `typecheck`
- `pages/bookmarks` included in `typecheck`
- fewer direct cross-file global reads in large page entry files
- a written migration note describing whether runtime ESM is now approved

### Acceptance Criteria

- page-layer lint warnings are resolved or deliberately documented
- page-layer typecheck passes for the chosen scope
- no regressions in bookmarks page startup
- no regressions in configuration modal and options page flows
- no regressions in WebDAV upload/download/test flows

### Risks

- DOM-heavy code will expose many historical typing gaps
- changing module boundaries too aggressively can break script load assumptions
- ESM migration should not begin until the page layer has a stable type/lint baseline

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