# 09: Audit page global dependency boundaries

**What to build:** Runtime-global service access is concentrated in the two page bootstrap layers, and bookmarks feature modules use their existing dependency contracts instead of adding unrelated global reads.

**Blocked by:** 03: Verify options configuration flows; 08: Typecheck bookmarks orchestrators.

**Status:** done

- [x] Inventory direct runtime-global reads in the page layer.
- [x] Keep intentional service acquisition in page bootstrap code.
- [x] Replace brittle feature-module global reads with existing dependency injection boundaries where the change is local and behavior-preserving.
- [x] Do not introduce new global namespace reads in feature modules.
- [x] Record any deliberate remaining global access and why it remains.
- [x] Verify lint, typecheck, build, and affected Chrome flows. (Automated checks pass; config modal pre-fill, test, save, clear, and status bar refresh passed in the maintainer's Phase 2 smoke test, 2026-09-27.)
