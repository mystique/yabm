# 08: Typecheck bookmarks orchestrators

**What to build:** The bookmarks tree orchestrator and page bootstrap pass page-layer typechecking with explicit factory dependency contracts, while the bookmarks page still starts with the same script order and user-visible behavior.

**Blocked by:** 05: Typecheck bookmarks render and menu modules; 06: Typecheck bookmark mutations and observers; 07: Typecheck bookmark drag-and-drop.

**Status:** done

- [x] Make the orchestrator dependency object and returned module API explicit enough for page-layer typechecking.
- [x] Correct DOM, event, callback, and spread-argument contracts in the page bootstrap.
- [x] Keep runtime-global reads intentional at the bootstrap boundary.
- [x] Preserve module load order and bookmarks page startup behavior.
- [ ] Verify bookmark CRUD, folder interactions, menus, drag-and-drop, and status updates in Chrome. (Pending manual Chrome verification: agent could not drive the Chrome UI.)
