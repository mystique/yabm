# 06: Typecheck bookmark mutations and observers

**What to build:** Bookmark CRUD and external-change synchronization pass page-layer typechecking with accurate Chrome API and asynchronous return contracts, while users retain the existing bookmark mutation and refresh behavior.

**Blocked by:** 04: Typecheck foundational bookmarks modules.

**Status:** done

- [x] Align bookmark mutation return types with the Chrome bookmarks API.
- [x] Make observer callback inputs and refresh results explicit.
- [x] Preserve mutation error reporting and user-visible status feedback.
- [x] Preserve create, update, delete, move, sort, and external-change refresh behavior.
- [x] Verify the affected modules pass lint and page-layer typecheck.
