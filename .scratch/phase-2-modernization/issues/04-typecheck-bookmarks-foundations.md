# 04: Typecheck foundational bookmarks modules

**What to build:** The foundational bookmarks UI and state modules pass JSDoc typechecking, so their DOM, event, timer, and dependency contracts are explicit before higher-level bookmarks modules are checked.

**Blocked by:** 01: Remove redundant Chrome runtime declarations.

**Status:** done

- [x] Bring the foundational notification, scrollbar, and bookmark-state behavior into the page typecheck scope.
- [x] Narrow DOM and event values at the point of use.
- [x] Correct timer and callback types where the browser APIs require them.
- [x] Correct non-trivial JSDoc parameter and return contracts.
- [x] Preserve existing factory APIs, script loading order, and user-visible behavior.
- [x] Keep lint and the currently covered typecheck scope green.
