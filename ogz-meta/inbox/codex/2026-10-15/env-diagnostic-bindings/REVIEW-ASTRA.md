# Astra adversarial review — diagnostic canonical bindings

Date: 2026-10-15. Verdict: CLEAN for this bounded reader-reconciliation change against the live working tree. No demonstrated reachable defect remains in the changed bindings, constructor calls, selected-contract handoff, off/null handling, or fee inputs. This is Astra's independent conclusion, not a relabeling of Mercury's `cannot_verify` or `no_claim` receipts.

Reviewed the current `git diff -- tuning/pipeline-diagnostic.js`, the complete diagnostic, its actual configuration and contract producers, and `delivery-review-answer.txt`. The working branch is `codex/archive-legacy-env`; unrelated staged and unstaged production edits exist. The source hashes below qualify the reviewed working implementation, not an isolated committed dependency closure.

## Producer evidence and Mercury allegation disposition

- Candle file: `foundation/ConfigLoader.js:795-810` requires a descriptor candle-file string; `:897-901` restricts the descriptor to a file-backed backtest launch; `:950-956` assigns `backtest.candleDataFile`. Bootstrap reads `BACKTEST_RUN_DESCRIPTOR_PATH` and selects its launch profile at `:2261-2271`. Thus `tuning/pipeline-diagnostic.js:33,49` has a real producer under the stated valid-descriptor invocation. An ordinary paper invocation without that descriptor is outside this diagnostic's required input contract. No invented default path is appropriate.
- Confidence, balance and sizing: `foundation/ConfigLoader.js:1196-1212` obtains starting balance and position sizing from canonical settings and confidence from the selected launch profile. `:1035-1040` reads required settings; `:2337-2342` rejects validation errors before publishing the frozen snapshot; `:2544-2552` lazy-loads that snapshot for reads. Actual current values observed were 0.5, 10000 and 0.01 respectively, with canonical source receipts. `config/settings.json:1623` explicitly declares the sizing fraction. Diagnostic `:34-36,211-212` preserves the fraction-to-percent-to-notional calculation.
- Timeframe: `config/settings.json:165` declares execution timeframe; descriptor identity is required at `foundation/ConfigLoader.js:795-802` and applied at `:918-924`. Actual canonical snapshot returned `15m`. Diagnostic `:37,93-94,309-310` passes that identity to the consumers.
- Mercury's absence-of-local-validation/default observations are syntactically true but do not demonstrate a producer defect. Its missing-source uncertainty is resolved by reading the live producers above. Removal of retired env defaults is the authorized behavior; adding fallback values would undermine that ownership.

## Contract and integration checks

- IndicatorEngine requires explicit symbol (`core/indicators/IndicatorEngine.js:36-40`); diagnostic `:90-95` supplies symbol and both canonical configuration sections. VolumeProfile accepts a provider (`core/VolumeProfile.js:39-41`); diagnostic `:97` supplies it. StrategyOrchestrator owns signal-module construction/providers (`core/StrategyOrchestrator.js:848-885`), so the removed duplicate instances are not required by its actual contract.
- Orchestrator argument order is `(indicators, patterns, regime, priceHistory, extras)` at `core/StrategyOrchestrator.js:2374-2379`; diagnostic `:313` matches it. Successful output supplies percent confidence, `winnerStrategy`, and its constructed contract at `:3039-3043,3093-3100`; diagnostic `:338-340,214-220` retains them directly. HOLD has null winner/contract at `:2943-2949` and does not enter the diagnostic's buy/sell branch (`:315`). No fallback strategy or contract is needed on that successful path.
- Donchian and TimeSeriesMomentum intentionally have null target/hold values in settings, while ConfigLoader supplies their static off modes (`foundation/ConfigLoader.js:1115-1122`; `config/internals.json:1582-1588`). Diagnostic `:200,204` honors those modes before numeric comparison. It no longer interprets null as a zero target/hold or inserts a 240-minute fallback. The actual selected contract includes dynamic overrides produced by the orchestrator, rather than a diagnostic-wide stop/target replacement.
- FeeModel reads the canonical fee section (`core/FeeModel.js:49-57`) and charges both supplied order sides (`:119-150`). Diagnostic `:232-244` supplies actual entry and exit notionals and quantities, then computes net return from net dollars. The isolated probe verifies percent fees on unequal notionals and per-share minimum fees on both sides. No-trade fee reporting is explicitly unverified (`tuning/pipeline-diagnostic.js:430-434`).

## Actual verification and limits

- `node --check tuning/pipeline-diagnostic.js`: passed.
- Re-executed the existing `probe.cjs` in memory with only its verification.json write removed: passed. It extracts the configuration bindings and entry/exit functions, checks canonical-source consumption, exact contract identity, fee arithmetic, off/null behavior, and producer field/argument wiring. No candle loop ran and no result receipt was overwritten.
- Read actual canonical source receipts and the two disabled-mode contracts; values and provenance matched the producers above.
- No production edits, new defaults, fallback values, throws or gates were authored. No broker calls, PM2 operations, historical loops or backtests were performed.
- Existing standalone-simulator limitations remain: its simplified exit evaluator does not implement all live trailing/structural/partial exits (`tuning/pipeline-diagnostic.js:186-207`), its base-only sizing does not consume orchestrator sizing multipliers (`:210-212` versus `core/StrategyOrchestrator.js:3100`), and its historical loop evaluates entries only while flat, blocks shorts, and retains a separate VP gate (`:305-335`). These are retained limitations, not newly introduced binding failures. This review does not accept full simulator parity, trading results, or Stop 1 completion.

## Reviewed source SHA-256

- `tuning/pipeline-diagnostic.js`: `706df16ba764c8e53276ccfe00d60cecaad81691071ded9fa6ced5827cceaa9e`
- `foundation/ConfigLoader.js`: `6e7f55a7a8a25f54de1b7ebd3359e2b157d44659e13696a45e4d261e810374da`
- `core/StrategyOrchestrator.js`: `f7323d3f5e1bf12ddf7ddec46e885e1950ff70204e2e22aedb90f269f2207167`
- `core/ExitContractManager.js`: `0aad139c0a69c0f77269cc4a1670f3584b3a02dee980190e2624b16c397773d7`
- `core/FeeModel.js`: `1cfc40f1d61f553ed48abc66aff05e563d4357a729080dfd7969ff0a1cacd74a`
- `core/indicators/IndicatorEngine.js`: `7309eaec492b900526c2918efc91f8ceeff41d6f2f09ebbe7f7f23b2abfbcb0e`
- `core/VolumeProfile.js`: `428b59a7f3d027371ffdeb50dc000095ab9669f02d1dfa4ffae75c998ca1c7d0`
- `config/settings.json`: `b306f8f1e4a3d0bb3f419f9a71190ef2596a5cf334f73936a8da94c2f81a78fd`
- `config/internals.json`: `ef331f141294908401df7eb048a37791d25ed43e38a0868dac1dd6f397b3b37b`
