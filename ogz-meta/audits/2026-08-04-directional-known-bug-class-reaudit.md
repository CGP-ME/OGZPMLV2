# Directional Runtime Known-Bug-Class Re-Audit + Fix Ledger

Date: 2026-08-04
Branch: `codex/multi-asset-symbol-state`
Scope: multidirectional trading runtime and its adjacent execution, state, exit, backtest, configuration, and observability surfaces.
Status: FINDINGS / FIX ORDER ONLY. No runtime code changed.

## Purpose

Re-audit the current long/short implementation against bug classes that have repeatedly damaged OGZPrime in prior work, then convert the August 3 directional findings into an ordered repair ledger. This is not a generic code-style review. It targets recurring repo failure modes.

## Recurring OGZPrime bug classes used as attack lenses

1. **Silent fallback / fabricated value**
   - Missing or malformed state becomes `long`, `sell`, `1`, `$1`, `100%`, `BTC`, `neutral`, or another plausible-looking value.
   - High risk because the system continues and produces believable telemetry.

2. **Vocabulary drift across layers**
   - `buy/sell/hold`, `long/short`, `BUY/SELL/SELL_SHORT/COVER`, `side`, `direction`, and `positionEffect` are mixed or inferred.
   - Historical signature: one layer validates one vocabulary while another consumes another.

3. **Split-brain source of truth**
   - Direction, quantity, equity, configuration, or lifecycle state is recomputed independently in multiple modules.
   - Historical signature: unrealized and realized P&L disagree, dashboard differs from execution, or restore differs from live mutation.

4. **Dead or theatrical configuration**
   - Environment/config flags are parsed, logged, exported, or placed into reports but do not control runtime behavior.
   - Prior confirmed examples include ignored/ghost exit and regime settings and sweep presets varying variables that did not reach the tested path.

5. **Unit collapse / unit laundering**
   - Fraction, shares, USD notional, signed quantity, absolute quantity, and percentages are accepted through fallback chains or coerced into one another.
   - Historical signature: an invalid partial-exit value becomes a full close.

6. **Error absorption after side effects**
   - A broker order or state mutation occurs, then validation throws, then a broad catch converts the incident into a normal blocked/false/null return.
   - This leaves external reality ahead of internal state.

7. **Restore-path bypass**
   - Startup/load paths validate fewer invariants than entry paths, allowing corrupt or legacy state to bypass modern contracts.

8. **Fallback regrowth one layer downstream**
   - A fabrication removed at entry is recreated in exits, reporting, reconciliation, or projection.
   - Confirmed directional example: default exit contracts are no longer fabricated at entry but are fabricated at exit time.

9. **Duplicate implementations / stale shadow systems**
   - Unwired or partially wired modules claim authority over the same concept with incompatible contracts.
   - Examples in the current directional surface include PositionTracker/PnLCalculator versus StateManager and legacy trailing models versus ExitContractManager.

10. **Backtest/live contract divergence**
    - Backtest force-close, recorder, worker environment, or report pathways bypass the contracts used by live execution.
    - Historical accounting example: equity was manually rebuilt differently in backtest and live contexts.

11. **Operator-facing lies**
    - Logs, banners, reports, dashboards, or notifications claim a control was applied or a direction was known when runtime behavior differs.

12. **Unknown treated as neutral instead of corruption**
    - `unknown_effect`, missing direction, missing identity, or malformed values are tolerated in order/money paths instead of being made structurally unreachable.

## Re-audit verdict

The August 3 audit already exposed strong instances of every major recurring bug class above. The directional happy path is substantially built, but malformed-state behavior still repeats the repo's oldest failures: silent defaults, split sources of truth, dead controls, unit coercion, broad-catch absorption, restore bypass, and backtest/live divergence.

No evidence currently supports calling multidirectional trading production-safe.

## Priority repair ledger

### P0-A — Canonical direction identity contract

**Goal:** Make malformed or contradictory trade direction structurally incapable of reaching math, exit planning, order routing, restore, or reporting.

Actions:

1. Introduce or centralize `requireTradeDirection(trade, context)` returning only `long|short`; reject missing, padded, contradictory, or off-vocabulary values.
2. Introduce explicit decision-to-position and position-to-broker mapping functions. Do not use ternaries with an `else` default for direction/action.
3. Validate direction/action consistency before persistence and after restore.
4. Remove all `|| 'long'`, ternary-default-long, ternary-default-sell, and magnitude-derived direction behavior from order/money paths.
5. Normalize before validation, then persist only normalized fields; prevent later object spreads from overwriting validated values.

Initial finding set: T1-1, T1-6, T1-7, T1-8, T1-9, T1-14, T1-16, T1-18, T1-19, T1-22, T1-27, T1-28, T1-29; T2-2, T2-4; T3-1 through T3-8 where applicable.

Acceptance evidence:

- Table-driven tests for every valid and invalid vocabulary combination.
- Restore tests with missing, padded, contradictory, and legacy direction records.
- No order action can be derived without a validated direction.
- Repository search shows no direction-bearing `else` default in hot paths.

### P0-B — Post-send exception boundary

**Goal:** Once a broker side effect occurs, no broad catch may report the operation as merely blocked or leave state unrecorded.

Actions:

1. Separate pre-send validation errors from post-send reconciliation failures.
2. Expand or replace prefix-regex exception whitelisting with typed error classes/state-machine outcomes.
3. On successful send followed by local validation failure, record an explicit `BROKER_SIDE_EFFECT_UNRECONCILED` incident containing broker order identity and halt that scope from further orders until reconciled.
4. Audit all `sendOrder` call sites for catch blocks returning null/false/blocked objects.

Initial finding set: T1-4 and any sibling post-send catch paths found during implementation.

Acceptance evidence:

- Fault injection immediately after broker acceptance.
- Internal state either records the fill/order or records an unreconciled external side effect; it never reports a clean block.

### P0-C — Exit quantity and unit contract

**Goal:** Prevent fraction/share/USD ambiguity and silent conversion into full closes.

Actions:

1. Validate `exitFraction` as a finite numeric fraction in `(0,1]`; reject strings, NaN, negatives, zero, and absolute USD values.
2. Carry explicit quantity units through plan, order, fill, state reduction, recorder, and report layers.
3. Remove fallback chains that make unit-mismatch checks vacuous.
4. Decide and document the one-share partial-close rule. If minimum-share promotion turns a partial into full closure, emit an explicit lifecycle outcome rather than calling it a normal partial.
5. Remove `$1` notional fabrication in recorder paths.

Initial finding set: T1-2, T1-3, T2-9, T1-24.

Acceptance evidence:

- Boundary matrix for 0, negative, NaN, string, >1, fractional one-share, and unit mismatch cases.
- Recorder and state quantities tie exactly to broker quantities.

### P0-D — Restore and live-mutation invariant parity

**Goal:** State loaded at startup and state mutated at runtime must pass the same identity and quantity contract as a new entry.

Actions:

1. Apply canonical trade validation inside `StateManager.load()` before any live position becomes active.
2. Apply identical validation in `updateActiveTrade`, `applyFill`, and every non-PositionTracker writer.
3. Reject conflicting `direction`/`action` and invalid quantities; do not warn-and-proceed.
4. Add migration handling only where the transformation is deterministic. Otherwise refuse the record by name.

Initial finding set: T1-7, T1-8, T1-9, T1-6.

Acceptance evidence:

- Same fixture corpus is run through entry creation, runtime update, serialization, restore, and fill application.
- All paths produce the same canonical record or the same named refusal.

### P0-E — Exit invalidation completeness and symmetry

**Goal:** Every configured invalidation condition must have a real implementation, and every directional condition must be symmetric where the strategy thesis requires it.

Actions:

1. Build a producer/consumer inventory for every invalidation condition name.
2. Add an explicit default case that rejects unknown conditions; never no-op.
3. Implement or remove the seven configured-but-unhandled condition names.
4. Correct EMA reversal symmetry for shorts.
5. Replace stale `buy/sell` comparisons with canonical `long/short` direction.
6. Remove default exit-contract fabrication at exit time; missing contract is an identity failure.

Initial finding set: T1-10, T1-11, T1-12, T1-13, T1-14.

Acceptance evidence:

- Bidirectional fixtures for every invalidation type.
- Config inventory test fails whenever a configured condition lacks a handler or a handler lacks a producer.

### P0-F — Broker reconciliation truth

**Goal:** Broker positions and internal positions cannot be declared flat or matched based on unparseable data.

Actions:

1. Unparseable broker size becomes a named reconciliation error, not zero.
2. Do not release stale exit intents unless the broker-side identity/action/quantity match is positively established.
3. Correct corrupted-short flatten mapping to COVER only after canonical direction validation.
4. Add reconciliation fixtures for missing size, malformed size, duplicate exit, stale intent, and contradictory direction.

Initial finding set: T1-1, T1-5.

### P1-A — Make directional configuration real or delete it

**Goal:** One authoritative configuration path controls directional eligibility in runtime, workers, shell launchers, manifests, and reports.

Actions:

1. Select the authoritative control: launch profile/config object rather than duplicate env flags unless explicitly retained.
2. Remove dead `ENABLE_SHORTS`/`DIRECTION_FILTER` surfaces or wire them through one normalization point.
3. Make `backtest.sh`, worker env, runtime startup log, manifest, and report read the effective resolved value from the same source.
4. Add an assertion that the effective worker profile equals the advertised run configuration.

Initial finding set: T1-20, T1-21, T1-23.

Acceptance evidence:

- Long-only run contains zero short entries.
- Short-only run contains zero long entries.
- Both run records per-direction results and effective configuration.
- Startup banner and report are generated from runtime-resolved configuration, not user input alone.

### P1-B — Backtest/live lifecycle parity

**Goal:** Window-end closure and recorder/report paths must obey the same direction and positionEffect contracts as live exits.

Actions:

1. Route backtest window-end closure through canonical close identity construction.
2. Require direction and positionEffect on all forced closes.
3. Run scoped report assertions over forced-close populations too.
4. Record per-direction metrics and configuration provenance.
5. Remove recorder re-derivation when the caller supplies positionEffect; cross-check and reject mismatch instead.

Initial finding set: T1-22, T1-23, T2-11.

### P1-C — Exit evaluation must not be skipped by entry gating

**Goal:** Directional entry eligibility may block entries but never suppress risk exits for an already-open position.

Actions:

1. Separate the open-position exit loop from new-entry directional gating.
2. Confirm or dismiss T1-25 with a deterministic candle fixture.
3. Make missing-price exit skips visible in the normal trace, not only diagnostic mode.

Initial finding set: T1-17, T1-25.

### P1-D — Short lifecycle cleanup parity

**Goal:** SELL and COVER teardown paths invoke the same model lifecycle contract.

Actions:

1. Replace nonexistent PatternExitModel calls in COVER teardown with the real API.
2. Add long/short lifecycle parity tests for start, partial exit, full exit, cancellation, and recovery flatten.
3. Correct short partial-close recorder/proof metadata.

Initial finding set: T1-15, T2-6.

### P1-E — Pattern direction provenance

**Goal:** Pattern memory must carry explicit learned direction; confidence magnitude must never manufacture direction.

Actions:

1. Store and validate pattern direction as a first-class field.
2. Reject patterns missing direction from trade selection rather than mapping confidence bands to buy/sell/hold.
3. Trace pattern provenance through orchestrator and TradingLoop.

Initial finding set: T1-29, T3-7.

### P2-A — Audit and notification truth

Actions:

1. Reserve `unknown_effect` for actual corruption; do not stamp every HOLD decision as unknown.
2. Decide whether journal write failure is halt-worthy; encode the policy rather than log-and-continue accidentally.
3. Ensure normal-priority notifications cannot silently disappear because positionEffect is absent.
4. Remove fabricated BTC symbols, fabricated confidence 100, default long dashboard direction, and vocabulary `direction: close`.
5. Make unknown exit reasons explicit instead of laundering them to `manual_close`.

Initial finding set: T2-1 through T2-5, T2-10; T3-1 through T3-6.

### P2-B — Remove shadow authorities and dead modules

Actions:

1. Decide whether PositionTracker is the sole writer. If yes, repair its contract and wire it; if no, excise it and its conflicting validators/calculators.
2. Remove unwired DynamicTrailingStop and any duplicated exit logic superseded by ExitContractManager.
3. Inventory dead producer/consumer condition names and dead feature flags.

Initial finding set: T1-26, T1-27 and audit dead-code section.

## Immediate execution order

1. P0-A canonical direction identity contract.
2. P0-D restore/live invariant parity.
3. P0-B post-send exception boundary.
4. P0-C exit quantity/unit contract.
5. P0-F broker reconciliation truth.
6. P0-E exit invalidation completeness.
7. P1-A real directional configuration.
8. P1-B backtest/live parity.
9. P1-C exit-loop independence.
10. P1-D/P1-E lifecycle and pattern provenance.
11. P2 observability cleanup and dead-code excision.

This order is intentional: identity first, because quantity, math, exits, broker actions, reports, and restore all depend on a trustworthy direction record.

## Rules for repairs

- One defect class per approved change set; no opportunistic architecture additions.
- No default direction, default action, default quantity, default notional, or default exit contract in order/money paths.
- No broad catch may convert a post-side-effect failure into an ordinary block.
- Every fix gets a regression fixture reproducing the exact prior failure shape.
- Validate behavior at entry, mutation, serialization, restore, execution, close, and reporting boundaries.
- Do not add `security()`/MTF work to this repair lane. The transpiler remains parked independently at that boundary.

## Next audit pass still required

The August 3 audit was directional-module focused. The next pass should search the wider repository for these same classes in adjacent modules not exhaustively covered there:

- broker adapters and webhook transports
- session swap/liquidation paths
- persistence and crash recovery
- dashboard/API projections
- multi-symbol scope maps and symbol-key construction
- strategy import/transpiler handoff into StrategyOrchestrator
- all scripts/tools that construct worker environments or claim effective configuration

That pass should append only newly evidenced findings and mark duplicates against this ledger rather than creating a competing list.
