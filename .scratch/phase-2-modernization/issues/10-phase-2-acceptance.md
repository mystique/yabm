# 10: Complete Phase 2 acceptance and record ESM deferral

**What to build:** Phase 2 has an evidence-backed completion decision covering page-layer type safety, runtime behavior, and dependency boundaries, with an explicit record that ESM migration remains deferred until a later decision.

**Blocked by:** 09: Audit page global dependency boundaries.

**Status:** ready-for-agent

- [ ] Run lint, typecheck, build, and syntax checks for all modified JavaScript.
- [ ] Verify bookmarks page startup and bookmark CRUD behavior in Chrome.
- [ ] Verify folder state, sorting/menu behavior, and drag-and-drop in Chrome.
- [ ] Verify options configuration and WebDAV test/upload/download flows in Chrome.
- [ ] Confirm the script-tag runtime model and load-order guarantees remain intact.
- [ ] Record actual verification evidence in the modernization status document.
- [ ] Record that runtime ESM migration is deferred and identify the conditions for revisiting it.
