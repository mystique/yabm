# 02: Bring the options page into typecheck

**What to build:** The options page is checked by the normal project typecheck, with safe DOM access and accurate WebDAV file metadata handling, without changing its user-visible configuration behavior.

**Blocked by:** 01: Remove redundant Chrome runtime declarations.

**Status:** done

- [x] Add page-local DOM narrowing for form controls, status elements, and file-list elements.
- [x] Narrow event targets before reading form values or control state.
- [x] Represent file metadata and byte-size values accurately at the page boundary.
- [x] Include the options page in the formal JSDoc typecheck scope.
- [x] Make `npm run lint` and `npm run typecheck` pass.
- [x] Preserve the existing script-tag loading model and page bootstrap shape.
