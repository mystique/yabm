# 07: Typecheck bookmark drag-and-drop

**What to build:** Bookmark drag-and-drop passes page-layer typechecking with safe event-target narrowing, while folder highlighting, drop validation, and event delegation continue to work for users.

**Blocked by:** 04: Typecheck foundational bookmarks modules.

**Status:** done

- [x] Narrow drag and pointer event targets before using element APIs.
- [x] Make folder highlighting and drop-target validation types explicit.
- [x] Preserve event delegation and current drag lifecycle behavior.
- [x] Verify the module passes lint and page-layer typecheck.
- [x] Verify drag-and-drop behavior in Chrome. (Passed in the maintainer's Phase 2 smoke test, 2026-09-27.)
