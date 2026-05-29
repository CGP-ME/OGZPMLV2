Mercury result:

- No concrete path found where `validateLedgerSkeleton()` itself still throws after the Zod v4 record fix.
- No concrete path found where current real `rejectReason: null` fails validation because of `rejectReason`.
- Found a claimed `indicatorValues` false positive: Mercury said non-object values would pass because the record is optional. Direct verification showed this is false: when `indicatorValues` is present as a string, validation returns an issue at `strategySignals.0.indicatorValues`.
- Found a real logger failure mode: if schema validation throws, `DecisionLedgerLogger.writeOnClose()` wrote unvalidated records to the main decisions log. This was fixed by routing validation exceptions to malformed JSONL and returning.
- Noted `LEDGER_VALIDATE=false` can intentionally bypass validation and write to the main decisions log. This is pre-existing operator-configured behavior, not introduced by this patch.
- Noted `createLedgerSkeleton()` still contains pre-existing string/default substitution for missing ledger fields. This is real residual ledger truth debt and should be a separate one-change commit.
- Noted `_toCanonicalSymbol()` canonicalizes broker/display symbol strings before persistence. This is pre-existing symbol normalization, not introduced by this patch.

Verification added after response:

- Regression test proving non-object `indicatorValues` is rejected.
- Regression test proving validation exceptions route to malformed ledger and do not create a main decisions JSONL entry.
