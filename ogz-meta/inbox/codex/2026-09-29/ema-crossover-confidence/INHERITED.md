# Inherited work separation

The starting working tree already contained unrelated edits in ConfigLoader, settings, runner, orchestrator, WebSocket manager, trading/exit/accounting modules and Mercury harness files. Only modules/EMASMACrossoverSignal.js was authored directly by this lane. Root integrates all shared-file patches.

Clean qualification baseline is 6bcfad8a25f72cb9e1eb946e854695913b2133c4. Fixture builder takes baseline blobs from that commit, then applies only the final EMA module, loader and producer patches. It does not copy shared dirty files. This excludes inherited runtime edits and the sibling RSI/MA changes.

loader-final-working.patch and producers-working.patch are context adaptations only. Their clean authority is loader-final-head.patch and producers.patch. Root reported applying the loader working patch; producer working patch is supplied for the current sibling-MA context. Avoid duplicate application.

Dependent MA forced-replacement validation should compose its own helper with EMA's helper and reuse the single rollback branch in a later atomic MA change. No MA bounds or strategy controls were inserted into this EMA patch.
