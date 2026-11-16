# Stop 1 REST failure repair — visible behavior receipts

Recorded 2026-11-12 UTC. **Source behavior verified; Mercury/Opus report no break, Astra unavailable; not activated. Stop 1 is not complete.**

The original running bot entered session recovery after NVDA REST history returned HTTP 504. This repair handles a failed symbol without discarding account reconciliation or stopping healthy symbols. The observations below use the real runtime modules with synthetic transport and disposable state through the mandatory isolated launcher. They are not live broker fills.

| Observed case | Session state | Global pause | NVDA entry halt | TSLA entry halt | TSLA 1m bars |
| --- | --- | --- | --- | --- | --- |
| baseline | RECOVERY_REQUIRED | True | False | False | 0 |
| timeout | TARGET_ACTIVATED | False | True | False | 24 |
| later-frame | TARGET_ACTIVATED | False | True | False | 24 |
| empty | TARGET_ACTIVATED | False | True | False | 24 |
| unreconciled | RECOVERY_REQUIRED | True | False | False | 0 |
| healthy | TARGET_ACTIVATED | False | False | False | 24 |

`baseline` runs the original source: NVDA's HTTP 504 prevents any TSLA history request. `timeout`, `later-frame` and `empty` run the final candidate: TSLA receives 24 1m bars and 24 5m bars, NVDA receives no partial hydration, and the transition receipt identifies the failed request. `unreconciled` supplies an unresolved broker order; the original reconciliation requirement still prevents activation. `healthy` hydrates both symbols.

## Halt ownership and restart

- A fresh Node process reloads StateManager and retains NVDA's `rest_hydration_unavailable` halt; TSLA stays unhalted and no global pause is introduced.
- Installing cutoff and hydration faults in either order persists both causes.
- Executing the actual cutoff-clear consumer removes only its own cause; hydration remains blocked.
- Concurrent producers retain both causes under the existing state lock. A financial-integrity halt preserves the other causes.
- These use the existing symbol halt storage and entry consumers. There is no additional entry gate or feature flag.

## Positions and price truth

The actual strategy and paper OrderExecutor open one NVDA short and one TSLA short. With a current NVDA price, the hydration failure closes NVDA through the ordinary exit-intent/execution path and leaves TSLA open. The executor records `rest_hydration_unavailable`; the state file retains the surviving position and NVDA halt. Paper slippage affects the actual fill; the requested mark is not mislabeled as the fill.

With the same NVDA position and a day-old mark, there is no close transaction. The receipt explicitly records `current_exit_price_unavailable` and the remaining NVDA trade ID. Both positions remain represented in state. The failure produces the existing max-priority alarm classification. This observation does not claim that an unavailable market price can be used to flatten a position.

## Source identity, commands and supporting evidence

Candidate source tree: `f129e61af43a32adb9162d175817f20995f6fd54`. Comparison commit: `1d057b014be9d365403d7eea8651a0a8d11b72b1`. The four production paths are listed with SHA-256 in [native-behavior-receipt.json](native-behavior-receipt.json). The full scoped source diff is preserved locally in `candidate.patch`.

The exact isolated commands have this form:

```text
python3 scripts/test-isolated.py --fixture <inbox>/fixtures/observe-rest-transition.cjs --fixture <inbox>/fixtures/candidate-sources.json -- node <inbox>/fixtures/observe-rest-transition.cjs <scenario> repaired --candidate
python3 scripts/test-isolated.py --fixture <inbox>/fixtures/observe-scoped-close.cjs --fixture <inbox>/fixtures/candidate-sources.json -- node <inbox>/fixtures/observe-scoped-close.cjs --candidate [--stale]
python3 scripts/test-isolated.py --fixture <inbox>/fixtures/observe-halt-owners.cjs --fixture <inbox>/fixtures/candidate-sources.json -- node <inbox>/fixtures/observe-halt-owners.cjs
```

`<inbox>` is this receipt directory. Native logs and probe sources remain locally inspectable; their complete-output hashes are in the JSON receipt. No Jest was added or run. The owner observation used the preceding candidate tree with byte-identical StateManager and TtpCutoffEnforcer; that qualification is explicit in the JSON.

## Review and delivery

Candidate 1 was rejected before activation or delivery. It reused a halt code that loading retires and failed to retain hydration when another fault already owned the symbol. Review 1 and a fresh-process reproduction established those defects. Its substantive findings were blocking; its machine outcome was `review_incomplete`, not approval. The final candidate has a dedicated reason, independent cause retention and a current-price requirement. Review 2 returned `no_break_found` from Mercury and Opus. Astra failed with a provider-capacity error, then failed again when retried alone after the provider wait. The machine outcome remains `review_incomplete`; the operator decision about delivery with that named absence is pending. Review metadata reports incomplete whole-file/coverage reporting; those warnings are preserved in [review-receipt.json](review-receipt.json), alongside the scope qualifications. The full answers remain locally in `review-2.log` and `review-2-astra-retry.log`. No whole-file audit is claimed.

## What this does not prove

The live bot has not loaded this repair or reconciled its earlier RECOVERY_REQUIRED state. No PM2 operation, production state change, live order, runtime-alarm delivery or RAG rebuild occurred. The existing review bridge did report max-priority notifications for its reviewer failures. Synthetic HTTP and stream transport were used; the runner methods were extracted exactly without constructing the whole bot. Risk-reporting, pattern-handoff, strategy-ingestion, and notification/journal collaborators are specified in the native receipts. Private evidence and unrelated dirty work are excluded from delivery. The broader failure-family scan follows a reviewed repair push, as requested.
