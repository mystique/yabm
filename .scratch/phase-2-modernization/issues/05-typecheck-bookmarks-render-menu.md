# 05: Typecheck bookmarks render and menu modules

**What to build:** Bookmark tree rendering and menu interactions pass page-layer typechecking while retaining the existing folder state, DOM rendering, context-menu, and sorting behavior.

**Blocked by:** 04: Typecheck foundational bookmarks modules.

**Status:** done

- [x] Make rendered element types explicit before accessing style, dataset, or details-specific state.
- [x] Make menu item callbacks and dependency contracts explicit.
- [x] Preserve folder rendering, context-menu positioning, and sorting behavior.
- [x] Preserve the current factory boundaries and script-tag runtime model.
- [x] Verify the affected modules pass lint and page-layer typecheck.
