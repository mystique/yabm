# 06: Typecheck bookmark mutations and observers

**What to build:** Bookmark CRUD and external-change synchronization pass page-layer typechecking with accurate Chrome API and asynchronous return contracts, while users retain the existing bookmark mutation and refresh behavior.

**Blocked by:** 04: Typecheck foundational bookmarks modules.

**Status:** ready-for-agent

- [ ] Align bookmark mutation return types with the Chrome bookmarks API.
- [ ] Make observer callback inputs and refresh results explicit.
- [ ] Preserve mutation error reporting and user-visible status feedback.
- [ ] Preserve create, update, delete, move, sort, and external-change refresh behavior.
- [ ] Verify the affected modules pass lint and page-layer typecheck.
