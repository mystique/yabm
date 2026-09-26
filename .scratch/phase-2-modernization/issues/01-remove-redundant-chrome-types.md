# 01: Remove redundant Chrome runtime declarations

**What to build:** The project uses the installed Chrome platform type definitions without duplicate runtime declarations, so the existing background and shared-library typecheck remains green and page-layer typecheck can start from a clean platform type baseline.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Remove duplicate runtime context and API declarations that are already provided by the installed Chrome type package.
- [x] Preserve the temporary page global namespace declarations needed by the current script-tag runtime.
- [x] Confirm the existing background, shared-library, tooling, and declaration typecheck passes.
- [x] Confirm no runtime JavaScript behavior changes.
