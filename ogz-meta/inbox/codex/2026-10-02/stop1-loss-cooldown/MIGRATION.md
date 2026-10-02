# Explicit saved-state migration

On ordinary StateManager.load, existing state is parsed and rehydrated by its current owner. Its generic halt normalizer rejects the retired symbol_cooldown code (case and surrounding whitespace normalized), alongside already-invalid missing-code legacy records. Changed halt collections set correctedStateShape. Independently, any own symbolLossStreaks property is deleted and marks correctedStateShape, regardless of value shape. The existing final correction save atomically rewrites the same configured state file.

Seven unrelated authorized halt codes remain. Free-text reason is not deletion authority. Operator/daily pauses and active trade state continue through existing load logic. No broad reset, halt, throw, fallback, alternative state file or new migration framework is introduced.

Failure: existing save returns STATE_PERSIST_FAILED and load records StateManager.load reconciliation evidence. In-memory retired state is removed; failed disk bytes remain old. Next load retries deterministically. Do not report durable success on a failed write. Existing backtest/fresh-start branches do not restore old disk state; this patch does not change their deliberate persistence semantics.

This migration cannot reconstruct a financial halt that an old cooldown producer already overwrote before the patch. No current saved state was inspected, no recovery fact is guessed, and no live state scrub was performed. Existing financial reconciliation remains its owner.

No settings-file migration framework is required: the proposed canonical settings object is removed and its revision advances once. If another delivery changes revision 6, root must rebuild that hunk against the new owner revision. Old settings/ambient env values have no runtime cooldown reader after removal.
