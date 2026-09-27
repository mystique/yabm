# 05: Typecheck bookmarks render and menu modules

**What to build:** Bookmark tree rendering and menu interactions pass page-layer typechecking while retaining the existing folder state, DOM rendering, context-menu, and sorting behavior.

**Blocked by:** 04: Typecheck foundational bookmarks modules.

**Status:** ready-for-agent

- [ ] Make rendered element types explicit before accessing style, dataset, or details-specific state.
- [ ] Make menu item callbacks and dependency contracts explicit.
- [ ] Preserve folder rendering, context-menu positioning, and sorting behavior.
- [ ] Preserve the current factory boundaries and script-tag runtime model.
- [ ] Verify the affected modules pass lint and page-layer typecheck.
