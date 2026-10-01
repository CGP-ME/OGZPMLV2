# MA output cap correction — 2026-09-29

The first candidate admitted a hot `maxConfidence > 1` that the registered orchestrator consumer rejects. This is a real producer/consumer contract error. The earlier positive-domain qualification tested the module and registration closures but missed the outer orchestrator confidence check. Its PASS does not clear this failure; the original candidate and receipts remain unchanged as historical evidence.

## Exact reproduction

First candidate: `24bbc6db8a16c89036c7f0d300db7046092acea2` from preserved CANDIDATE.json. `cap-boundary.cjs` compiles all tracked production/config sources from this immutable tree, executes actual ConfigLoader save and forced reload against private fixture files, and calls the actual `StrategyOrchestrator.evaluate` with its registered MA factory and retained BTC-USD detector. It narrows the strategy list to the actual MA registration; it does not replace its evaluator, confidence assertion, or unavailable-record path. Uses the tracked 721-candle Kraken tape; no bot/broker runtime is started.

Saving cap 2, then positive base/weight 2, produces 309 confidence-related strategy-unavailable records over the remaining 471 recorded bars. The first is `[HIGH-25] MADynamicSR.confidence outside 0..1 (got 1.4830484934164085)`. Invalid forced cap replacements reproduce 299 such records. The module continues producing signals, but the orchestrator rejects them; this is not a process-crash claim.

## Complete producer trace within this lane

All references below are first-candidate source lines:

- Canonical config → runner root: `run-empire-v2.js:792`; retained provider reads current ConfigLoader.
- Canonical config → runner symbol context provider: `run-empire-v2.js:3135` → `core/SymbolTradingContext.js:85`.
- Canonical config → orchestrator root: `core/StrategyOrchestrator.js:851-852`.
- Canonical config → registered lazy symbol factory: `core/StrategyOrchestrator.js:1684-1698`.
- Optional provider → three Number-normalized fields on update: `modules/MADynamicSR.js:310-314`.
- Confidence producer: base + touch weight at `:410`, composite then clamp to configured cap at `:423`.
- Registered result consumer: `core/StrategyOrchestrator.js:2330-2340` invokes `assertBaseConfidence01` (`:63-70`); its exception is recorded as strategy unavailable at `:2454-2470`.
- Invalid external forced replacement boundary already exists in ConfigLoader. This correction extends its existing MA helper at `foundation/ConfigLoader.js:2439-2443`; saved cap validation uses existing schema at `:2563-2566`.

## Minimal correction

`cap-boundary.patch` is additive after `loader-dependent.patch`, SHA-256 `26a91cb961359906f6f6332ff404d25cedde79f628842bafbb6681a0e1ac9e6a`. It changes exactly two production lines:

1. Saved maxConfidence schema maximum becomes 1.
2. Forced MA replacement helper rejects Number-normalized maxConfidence > 1 with its existing named outcome.

Base and touch weight remain finite positive, including values above one. No max>=base relation, no lower-domain change, no module clamp change, default, startup validator, throw or shutdown is added. Number coercion in forced replacements stays intact. Cap 1 safely bounds the reproduced base/weight 2 signals; correcting an output contract is distinct from deferred confidence calibration.

Corrected first-candidate overlay yields zero confidence exceptions after rejected saved/forced cap replacements. Rejected saves preserve disk, all 11 loader globals and detector state; rejected forces preserve all 11 globals, receipt and detector state. MIN_VALUE, 0.5 and 1 caps pass through actual orchestrator consumption; forced `"1"`, true and `"0.5"` preserve existing Number coercion and pass too.

## Qualification and rerun commands

- Exposed exact first tree: `MA_REVIEW_TREE=24bbc6db8a16c89036c7f0d300db7046092acea2 node ogz-meta/inbox/codex/2026-09-29/ma-sr-confidence/cap-boundary.cjs`
- Corrected overlay: same command prefixed `MA_CAP_CORRECTION=1`. Receipt explicitly says immutable tree plus correction.
- Portable reconstruction: omit MA_REVIEW_TREE for either case. Both pass from reachable 6bcfad8a plus explicit original lane dependencies; no unreachable tree is required for portable proof.
- Parent exact corrected candidate: `MA_CAP_EXPECT_CORRECTED=1 MA_REVIEW_TREE=<40hex-tree> node .../cap-boundary.cjs`. This applies no patches.
- Full retained-owner regression: `node .../integration-cap-qualified.cjs`; PASS, four owners each 329 changed signals per scalar, 119 after valid force, original malformed force/state/string cases retained. Optional MA_REVIEW_TREE reads exact tree without patches. The old integration.cjs remains historical because its deliberate acceptance of cap>1 is superseded.

Private logs/results remain under private/. CAP-BOUNDARY-PROOF.json summarizes exact source hashes and outcomes without promoting raw logs. Liquidity → TSM → RSI2 fixture chains now lock this additive patch; their default qualifications were rerun successfully and old receipts preserved.

## Inherited startup/injection limit

Initial/static configuration and explicitly injected module config are separate pre-existing surfaces: baseline 6bcfad8a already validated all three fields as positive (`modules/MADynamicSR.js:180-182`) and clamped against the supplied cap (`:415`) while orchestrator required 0..1. This patch does not add startup gates or alter explicit injection contracts. A pre-existing out-of-range cap at initial boot remains an inherited mismatch; this task prevents introducing it through the new cap save control or a cached forced replacement. It does not certify every unrelated settings save as repairing already-invalid startup data. Broader startup semantics require a separate producer correction, not an invented module throw.
