# Agent Guide for YABM Classic

YABM is a Manifest V3 Chrome extension — plain JS/CSS/HTML at runtime — that manages bookmarks with optional WebDAV sync. Repo-specific behaviour wins over generic best practices.

**Precedence**, highest first: what you can read in `src/`, then `src/manifest.json` runtime constraints, then this file, then generic tooling habits. Re-read `src/` before trusting any rule here.

## Runtime contract

Four invariants. Breaking one is a regression, not a refactor.

- **Classic script tags.** Pages load `<script src>` files that share one global scope. Runtime ESM is deferred; the conditions that reopen that decision are in `docs/modernization/STATUS.md` under *ESM Deferral*.
- **Factory modules.** Each bookmarks feature module exposes `createXModule(deps)` as a `window.YABM*Module` global and receives its collaborators through `deps`. Shared libraries under `src/lib/` expose `window.YABM…` globals.
- **Bootstraps own the globals.** `bookmarks.js` and `options.js` are the only scripts that read `window.YABM*` services; everything else receives them as `deps`. The audited list of deliberate exceptions (Chrome platform APIs, DOM globals, `bookmark-tree.js` as the tree composition root) is in `docs/modernization/STATUS.md` under *Page Global Boundaries*.
- **HTTPS only.** Host access is optional (`https://*/*`) and requested at runtime via `chrome.permissions.request`. WebDAV URLs must be `https:`.

## Commands

`npm run check` is the gate — lint, then typecheck, then build. `package.json` is the source of truth for the script list.

There is no test runner. The per-file gate is `node --check <file>` on every JS file you touched.

Chrome loads the extension from `src/` in Developer Mode (`chrome://extensions/` → Load unpacked), or from `dist/` after a build. `README.md` has the fuller manual flow.

## Adding a bookmarks feature module

Four edits, all four required:

1. `src/pages/bookmarks/<name>.js` — factory `createXModule(deps)`, with the `deps` typedef declared at file scope (outside the IIFE) so other files can reach it via `import("./<name>.js").TypeName`.
2. `src/pages/bookmarks/bookmarks.html` — add the `<script>` tag after the libraries it depends on and before `bookmark-tree.js`; `bookmarks.js` stays last.
3. `types/yabm-globals.d.ts` — declare the new `window.YABM*Module` global.
4. `tsconfig.json` — add the file to `include`; bookmarks files are listed individually.

Done when the global is declared in the types file, the file is inside the typecheck, and the tag sits in dependency order.

## Conventions

**Style** — 2-space indentation in JS, HTML, and CSS; semicolons; trailing commas in multiline objects, arrays, and params. `const` by default, `let` only on reassignment. Named `function` declarations for top-level reusable logic, arrow functions for short callbacks and local adapters. `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for constants, `PascalCase` for constructor-like entities. Verb-led handler names (`handleUpload`, `renderFileList`, `setStatus`). Guard clauses and early returns; `async`/`await` over chains; `Promise.all` where async work is independent.

**Types and JSDoc** — the project is JavaScript under `checkJs` (non-strict). Document the things a reader cannot infer: state object schemas, file metadata structures, non-trivial parameter and return shapes, factory `deps` objects, and returned module APIs. Narrow DOM at the point of use with `instanceof` instead of broad `/** @type */` casts. A missing required element on a user-visible path throws into the existing error path (`requireElement` / `requireInput` in `options.js`) so the user sees the failure.

**Failures** — wrap user-triggered async work in `try/catch`, throw `Error` with a translated, user-oriented message, and surface the outcome as a status or toast update. Users see every failure; no error is swallowed.

**User-facing text** — `window.YABMI18n.t(key, substitutions)` for every string; keys live in `src/_locales/<locale>/messages.json` with `$1`, `$2` placeholders. New UI text updates the locale bundles.

**Domain vocabulary** — `GLOSSARY.md` defines the terms this codebase thinks in (*config session*, *sync action*, *download and replace*, *open folder*) and lists the synonyms to avoid. Use those terms in code, commits, and issues.

**Credentials and permissions** — credentials live in `chrome.storage.local`, never in a URL and never in a log, error, or toast. Changing permissions, optional host permissions, or the extension CSP means editing `src/manifest.json` and saying so in the PR note; the CSP carries an explicit host allowlist, so a new remote host touches it too.

## Finishing a change

1. `node --check` every modified JS file.
2. `npm run check` green.
3. Reload the extension at `chrome://extensions/` and exercise the changed path in the UI.
4. Confirm the bookmarks page still starts with no console errors.
5. Add a line to `CHANGELOG.md` under *Unreleased* for anything user-visible.

Done when you have observed the changed behaviour in Chrome, not only green commands. The *Phase 2 Manual Chrome Smoke Checklist* in `docs/modernization/STATUS.md` covers the full surface — run it when you touch the bookmark tree, drag-and-drop, or any WebDAV path.

## Layout

`src/pages/bookmarks/` is the main UI (tree, menus, modals, drag-and-drop, WebDAV status). `src/pages/options/` is a standalone WebDAV config page that shares `src/lib/webdav-config-session.js` and `src/lib/webdav-file-picker.js` with the config modal; note that `src/manifest.json` points `options_page` at `pages/bookmarks/bookmarks.html?openConfig=1`, so that page is reachable only by opening its extension URL directly. `src/lib/` holds the shared services both pages load. `src/_locales/` holds the message bundles and `src/assets/` the icons. `tools/build.cjs` copies `src/` to `dist/` and transpiles with esbuild without bundling, so the runtime architecture is unchanged by a build.

## Open work

`.scratch/architecture-deepening/` holds the current ticket set. Ticket 07 (open-folder re-render race) is the next `ready-for-agent` item; 04 needs a human decision because it would introduce a test runner. `docs/modernization/STATUS.md` has the queue and the verification history.

## Git and PRs

Conventional Commits (`feat:`, `fix:`, `refactor:`). Keep each commit to one user-facing change. Stage explicit paths — several agents share the working tree, so `git add -A` sweeps up their work. A PR states what changed and why, the verification actually performed, and a screenshot or GIF for visible changes.

## Agent skills

**Issue tracker** — issues and specs are Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md` before creating or updating a ticket.

**Triage labels** — the five canonical labels are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

**Domain docs** — single-context repo: `CONTEXT.md` at the root and ADRs under `docs/adr/` when they exist. See `docs/agents/domain.md`.

**Higher-priority rules** — if `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` appear in this repo, merge their guidance with this file.
