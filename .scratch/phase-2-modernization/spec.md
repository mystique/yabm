# Phase 2: Module Boundary Modernization

**Status:** ready-for-agent

## Problem Statement

The extension has completed its tooling baseline and has already split the bookmarks page into several factory-style modules. However, page-layer JavaScript is still outside the formal JSDoc `checkJs` scope, and the runtime still relies on broad `window.YABM*` globals plus manually ordered script tags.

This creates two risks. First, DOM-heavy page code can continue to accumulate type errors without the normal typecheck detecting them. Second, future refactors can accidentally depend on implicit global state or script loading order. The current global Chrome runtime declarations also duplicate APIs already supplied by the installed Chrome type definitions, which prevents the page layer from entering typecheck cleanly.

The project needs a staged modernization pass that improves page-layer type safety and dependency boundaries without changing user-visible bookmark, configuration, or WebDAV behavior.

## Solution

Bring the page layer into the existing lint and JSDoc typecheck workflow incrementally. Start by correcting the redundant Chrome runtime declarations, then make the options page type-safe and verify its configuration flow. After that, add the bookmarks modules to typecheck in small dependency-ordered batches, ending with the page orchestrators and a focused audit of global dependency reads.

Keep the current plain JavaScript, script-tag, factory-module runtime model during this phase. Do not migrate to ESM, introduce a new test framework, reorganize top-level directories, or redesign the UI. Record the decision to defer ESM until the page-layer baseline is stable.

## User Stories

1. As a maintainer, I want the modernization roadmap and operational status to agree, so that the next contributor can identify the real Phase 2 starting point.
2. As a maintainer, I want outdated Chrome runtime declarations removed, so that the project relies on the installed platform types instead of conflicting duplicate definitions.
3. As a maintainer, I want the existing background and shared-library typecheck to remain green, so that page-layer modernization does not regress the completed Phase 1 baseline.
4. As an options-page maintainer, I want DOM elements to have accurate types, so that invalid access to input, checkbox, button, and status controls is detected before runtime.
5. As an options-page maintainer, I want event targets narrowed at the point of use, so that form handlers remain safe without hiding errors behind broad casts.
6. As an options-page maintainer, I want file metadata values represented accurately, so that byte-size formatting and file-list rendering handle the actual WebDAV response shape.
7. As a user, I want the options page to load saved WebDAV configuration exactly as before, so that modernization does not lose my connection settings.
8. As a user, I want the options page to test a WebDAV connection and list remote files as before, so that I can continue selecting a sync file.
9. As a user, I want the options page to save and clear configuration as before, so that the modernization does not change configuration management.
10. As a maintainer, I want the options page included in the formal typecheck scope, so that future changes to its configuration flow are checked automatically.
11. As a bookmarks-page maintainer, I want low-coupling modules type-checked first, so that foundational DOM and JSDoc issues can be resolved without making the full page error list unmanageable.
12. As a bookmarks-page maintainer, I want rendering and menu modules checked against their dependency contracts, so that changes cannot silently violate the existing factory boundaries.
13. As a bookmarks-page maintainer, I want bookmark mutation and observer return types to reflect the Chrome bookmarks API, so that asynchronous CRUD and refresh flows remain explicit.
14. As a user, I want bookmark creation, editing, deletion, movement, and sorting to behave exactly as before, so that type-focused changes do not alter bookmark management.
15. As a user, I want drag-and-drop interactions to continue working, so that event-target narrowing does not break folder highlighting, validation, or drop behavior.
16. As a user, I want the bookmarks page to start successfully after each modernization batch, so that incremental type fixes do not introduce script-order regressions.
17. As a maintainer, I want the page bootstrap layer to be the intentional place where runtime globals are read, so that feature modules receive dependencies explicitly.
18. As a maintainer, I want feature modules to avoid adding unrelated `window.YABM*` reads, so that global coupling decreases over time instead of expanding.
19. As a maintainer, I want the existing script-tag loading model preserved during this phase, so that the modernization remains reversible and does not combine type work with a runtime loader migration.
20. As a maintainer, I want lint, typecheck, build, syntax checks, and focused Chrome smoke tests recorded for each meaningful batch, so that every step has observable evidence.
21. As a maintainer, I want the final phase decision recorded, so that future work knows whether ESM migration is approved or explicitly deferred.
22. As a maintainer, I want no new test framework introduced in this phase, so that the work remains focused on page safety and module boundaries rather than tool migration.
23. As a maintainer, I want no top-level directory reshuffle during this phase, so that file ownership changes remain a separate Phase 3 concern.

## Implementation Decisions

- Phase 2 will strengthen the existing script-tag and factory-module architecture rather than migrate runtime loading to ESM.
- Runtime behavior and user-visible behavior remain unchanged unless a type correction exposes an actual defect that must be fixed to preserve the documented contract.
- The redundant Chrome runtime namespace augmentation will be removed because the installed Chrome type package already defines the relevant context types and API.
- The remaining global namespace declarations are a temporary compatibility boundary. They may stay broad initially, while concrete module interfaces are narrowed only where needed to make page-layer typecheck useful.
- DOM narrowing will use small page-local helpers and explicit event-target checks. A shared DOM utility will not be introduced until reuse is demonstrated in a later phase.
- The options page remains a bootstrap script rather than gaining a new factory layer. Its global service reads will be localized, and its DOM and data contracts will be made explicit.
- The bookmarks page entry point remains responsible for assembling runtime services and passing dependencies into feature modules.
- Existing bookmarks feature modules will be brought into `checkJs` in dependency-ordered batches: foundational UI modules, rendering/menu modules, mutation/observer modules, drag-and-drop, and finally the tree/page orchestrators.
- The global dependency boundary is considered improved when page bootstrap code owns intentional runtime-global reads and feature modules do not add unrelated global reads.
- The highest verification seam is the extension page flow itself: page startup plus the user-visible configuration, bookmark-management, and WebDAV operations. No new production seam is required for this phase.
- The existing command-line checks remain the project verification baseline: lint, typecheck, build, and JavaScript syntax checks.
- Chrome manual smoke verification remains required for changed page flows because there is no configured browser integration test runner.
- The phase will document that ESM remains deferred until page-layer lint/typecheck and runtime parity are stable.
- Phase 2 documentation will be updated before implementation work so the roadmap and status tracker reflect the agreed sequence.

## Testing Decisions

- Tests and checks must prove externally observable behavior or a meaningful type invariant. They must not merely assert source text, wiring, mock echoes, or incidental implementation details.
- Existing repository checks are the prior art: ESLint for static rules, TypeScript `checkJs` for JSDoc contracts, esbuild for the runnable extension artifact, and `node --check` for modified JavaScript syntax.
- Options verification will cover startup, saved configuration loading, file-list rendering, connection testing, configuration saving, configuration clearing, and failure feedback.
- Bookmarks verification will cover startup, bookmark CRUD, folder state, sorting/context-menu behavior, drag-and-drop, and WebDAV upload/download/test flows.
- Each bookmarks typecheck batch must pass the existing command baseline before the next batch begins.
- Chrome smoke checks are the highest available seam for page behavior and must be run after meaningful page-layer changes.
- No permanent test framework or broad unit-test suite will be added in this phase. Pure helper tests may be considered later only if a behaviorally meaningful seam appears naturally.
- The final acceptance run must include lint, typecheck, build, syntax checks for modified JavaScript, and the agreed Chrome smoke flows.

## Out of Scope

- ESM runtime migration or changing HTML script loading semantics.
- React, another UI framework, or a TypeScript source migration.
- A new bundling strategy that changes execution order.
- Top-level directory reorganization into `app`, `core`, `shared`, or `features`.
- A broad redesign of the global namespace declarations beyond what is necessary for page typecheck.
- A new shared DOM utility before multiple pages demonstrate a stable reuse case.
- UI redesign, visual polish, or changes to user-facing product behavior.
- WebDAV protocol changes, credential-storage changes, permission-policy changes, or bookmark data-format changes.
- Introducing a test runner, browser automation framework, or CI system.
- Phase 3 architecture work, including moving files or consolidating cross-page configuration logic.

## Further Notes

- The work should be published as local Markdown tickets under `.scratch/phase-2-modernization/`, numbered in dependency order.
- Tickets should be tracer-bullet slices with explicit blockers and should remain small enough to complete and verify independently.
- The first implementation frontier after documentation is the redundant Chrome type declaration cleanup, followed by the options page typecheck slice.
- The project currently has no root domain glossary or ADRs. No new domain document is needed for this implementation plan; create one only if a durable domain term or hard-to-reverse architectural decision emerges.
- The generated ticket set should apply the `ready-for-agent` status to each ticket and preserve the dependency edges in each local ticket file.
