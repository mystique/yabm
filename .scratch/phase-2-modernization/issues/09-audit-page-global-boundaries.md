# 09: Audit page global dependency boundaries

**What to build:** Runtime-global service access is concentrated in the two page bootstrap layers, and bookmarks feature modules use their existing dependency contracts instead of adding unrelated global reads.

**Blocked by:** 03: Verify options configuration flows; 08: Typecheck bookmarks orchestrators.

**Status:** ready-for-agent

- [ ] Inventory direct runtime-global reads in the page layer.
- [ ] Keep intentional service acquisition in page bootstrap code.
- [ ] Replace brittle feature-module global reads with existing dependency injection boundaries where the change is local and behavior-preserving.
- [ ] Do not introduce new global namespace reads in feature modules.
- [ ] Record any deliberate remaining global access and why it remains.
- [ ] Verify lint, typecheck, build, and affected Chrome flows.
