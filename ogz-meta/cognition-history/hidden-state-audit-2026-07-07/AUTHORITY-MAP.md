# Hidden State And Config Authority Map - 2026-07-07

This file tracks capability-reducing surfaces found during the hidden-state audit.
The goal is not to add more gates. The goal is to identify every place the bot can
ignore operator intent because authority is split across persisted state, runtime
state, PM2/env, tuning profiles, or local module logic.

## Verified Runtime Snapshot

- Branch: `codex/multi-asset-symbol-state`
- Current head at audit start: `6509545e Fixed config module consolidation`
- Live PM2 env checked from `/proc/<pid>/environ` before this note:
  - `EXECUTION_MODE=live`
  - `LIVE_TRADING=true`
  - `PAPER_TRADING=false`
  - `WEBHOOK_ORDERS_ENABLED=true`
  - `WEBHOOK_DRY_RUN=false`
  - `SESSION_ROUTER_ENABLED=false`
  - `TUNING_PROFILE` unset

## Fixed In This Slice

| Surface | Before | After | Evidence | Tests |
| --- | --- | --- | --- | --- |
| Stale data-feed liveness pause | A persisted `isTrading=false` state from old liveness watchdog logic could resurrect on restart and block entries. | `StateManager.load()` clears only structured data-feed liveness pauses and restores `isTrading=true`; unscoped text-only pauses are not auto-resumed. | `core/StateManager.js:1840-1860`, `core/StateManager.js:3374-3378` | `npm test -- --runInBand test/state-manager-load.test.js` |
| Direct active-trade bypass halt | `updateActiveTrade()` could set a hidden global `_haltNewEntries` flag. | Bypass detection remains telemetry-only; `isHalted()` and `getHaltReason()` no longer block entries. | `core/StateManager.js:1989-2021`, `core/StateManager.js:2931-2945` | `npm test -- --runInBand test/state-manager-open-position-scope.test.js -t "symbol loss cooldown|updateActiveTrade bypass telemetry"` |
| No-matching exit sticky symbol halt | A SELL/COVER with no matching active trade called `haltSymbol()`, writing `symbolEntryHalts` and suppressing future entries for that symbol. | The exit still refuses unsupported state and emits `ORDER_BLOCKED`, but no longer persists a symbol entry halt. | `core/OrderExecutor.js:2212-2220`, `core/OrderExecutor.js:3132-3135`, `core/OrderExecutor.js:3685-3688` | `node --check core/OrderExecutor.js`; `npm test -- --runInBand test/order-executor-pause-gate.test.js` |
| Share-range fill sticky symbol halt | A broker-accepted fill outside planned share range recorded broker truth, then called `haltSymbol()`. | The accepted broker quantity is still recorded and the result still carries `stockShareRangeFillViolation`, but no symbol halt is persisted. | `core/OrderExecutor.js:1462-1480` | `node --check core/OrderExecutor.js`; `npm test -- --runInBand test/order-executor-pause-gate.test.js` |
| Exit-rail broker desync symbol halt authority | The one remaining `haltSymbol()` caller is the broker-desync exit rail: confirmed full webhook exit, but broker position still open. It persisted a symbol halt without a machine-readable authority code. | The existing halt remains because it is financial-integrity critical, but it now writes `code: exit_rail_broker_desync`, `authority: financial_integrity`, `financialIntegrityCritical: true`, `entryBlockScope: symbol`, and `operatorActionRequired: true`. | `core/OrderExecutor.js:661-731` | `node --check core/OrderExecutor.js`; `npm test -- --runInBand test/order-executor-pause-gate.test.js` |
| Open `haltSymbol()` mutation surface | `StateManager.haltSymbol()` accepted any caller/metadata and could write a persistent `symbolEntryHalts` row with no explicit authority. | `haltSymbol()` now refuses to mutate state unless metadata carries an authorized code (`exit_rail_broker_desync` or `symbol_cooldown`). Unauthorized requests return `success:false`, log the refusal, and leave entries unblocked. Load-time normalization also drops persisted unauthorized halt codes while preserving exit-rail metadata. The halt reader now treats `expiresAt: null` as no expiry instead of `0`. | `core/StateManager.js:108-111`, `core/StateManager.js:128-132`, `core/StateManager.js:3048-3050`, `core/StateManager.js:3057-3070`, `core/StateManager.js:3272-3274` | `node --check core/StateManager.js`; `npm test -- --runInBand test/state-manager-load.test.js test/state-manager-open-position-scope.test.js` |
| Dashboard manual pause authority | Dashboard `pause_trading`/`resume_trading` commands changed `isTrading` without structured operator-authority metadata. | Dashboard commands now call dedicated WebSocketManager helpers that pass `source: dashboard_manual` into `StateManager.pauseTrading()`/`resumeTrading()` and echo the source in dashboard confirmations. | `core/WebSocketManager.js` | `node --check core/WebSocketManager.js`; `npm test -- --runInBand test/dashboard-profile-command-runtime-guard.test.js` |
| Disabled symbol-cooldown stale state | A persisted `symbol_cooldown` halt or streak could survive even when `entryLogic.symbolLossCooldown.enabled=false`. | Disabled cooldown state is ignored by `isSymbolHalted()` and cleaned from `symbolEntryHalts`/`symbolLossStreaks` on load, including legacy rows missing `code`, mixed-case markers, spaced reason markers, and ConfigLoader leaf overrides applied after a cached snapshot. | `core/StateManager.js:117-121`, `core/StateManager.js:2947-2974`, `core/StateManager.js:3030-3036`, `core/StateManager.js:3231-3268` | `node --check core/StateManager.js`; `npm test -- --runInBand test/state-manager-load.test.js`; `npm test -- --runInBand test/state-manager-open-position-scope.test.js -t "symbol loss cooldown|updateActiveTrade bypass telemetry"` |
| Retired profile manager stale owner pointer | `TradingProfileManager.js` correctly throws as retired, but told callers to use deleted `core/TradingConfig`. | The tombstone now points to `foundation/ConfigLoader` and `config/trading.config.json`, matching the current branch where `core/TradingConfig.js` is absent. | `TradingProfileManager.js:4-15` | `node --check TradingProfileManager.js`; `npm test -- --runInBand test/trading-config-profile.test.js` |
| Current docs still pointed at deleted config owner | `BACKTESTING-GUIDE.md`, `ogz-meta/AGENTS.md`, and the active alignment brief carried current-facing references to `core/TradingConfig.js` as the config owner. | Current operator docs now state the current owner: durable values in `config/trading.config.json`, runtime access/overrides through `foundation/ConfigLoader.js`; historical specs are left as snapshots and explicitly superseded by the alignment note. | `BACKTESTING-GUIDE.md`, `ogz-meta/AGENTS.md`, `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md` | `rg -n 'Two config systems exist|TradingConfig\\.js pipeline section|directly in \`core/TradingConfig\\.js\`|Open \`core/TradingConfig\\.js\`|core/TradingConfig\\.js\` when|Per-strategy config in \`core/TradingConfig\\.js\`' BACKTESTING-GUIDE.md ogz-meta/AGENTS.md ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md TradingProfileManager.js` |

## Active Capability Reducers Still Present

| Rank | Surface | File:line | Condition | Action | Scope | Current Authority | Recommended Downgrade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Symbol entry halt store | `core/StateManager.js:3052-3082` | Caller invokes `haltSymbol(symbol, reason, metadata)` with authorized code | Persists `symbolEntryHalts` in state | Symbol entries | Allowlisted to `exit_rail_broker_desync` and `symbol_cooldown`; unauthorized callers fail open with no mutation | Keep broker-desync halt as financial-integrity critical; require any future caller to add explicit code/authority and tests before it can mutate the halt store. |
| 2 | Loss cooldown creates symbol halt when explicitly enabled | `core/StateManager.js:2977-3027` | Config enables `entryLogic.symbolLossCooldown` and streak threshold is reached | Writes `symbolEntryHalts` with `code: symbol_cooldown` | Symbol entries | Config/profile-driven | Keep only if explicitly operator-owned in the single config module and dashboard-visible; disabled stale state is now ignored/cleaned. |
| 3 | Global pause store | `core/StateManager.js:1737-1774` | `pauseTrading()` is called | Persists `isTrading=false`, reason, source, scope | All entries | Dashboard manual pause now has `source: dashboard_manual`; SessionRouter/ExchangeReconciler calls are dormant in current live posture | Only operator/manual and financial-integrity critical calls should persist. Legacy subsystem pauses need load-time migration or scoped quarantine before runtime enablement. |
| 4 | Startup tuning profile env overlay | `foundation/ConfigLoader.js:173-200` | `TUNING_PROFILE` or `BACKTEST_TUNING_PROFILE` set | Profile env overwrites source env before snapshot | Process config | ConfigLoader + `config/trading.config.json` | Keep as one config-module surface only after profile keys are documented, visible in runtime proof, and forbidden from duplicating operator live toggles outside the single module. |
| 5 | Derived live flag | `foundation/ConfigLoader.js:203-214` | `EXECUTION_MODE=live`, `TRADING_MODE=live`, or `ENABLE_LIVE_TRADING=true` | Forces `LIVE_TRADING=true` in effective env | Process config | ConfigLoader | Keep only if runtime proof clearly reports derivation. Remove contradictory user-facing knobs so one config value owns mode. |
| 6 | In-memory config overrides | `foundation/ConfigLoader.js:3007-3020`, `foundation/ConfigLoader.js:3153-3157`, `foundation/ConfigLoader.js:3389-3427` | `setOverrides()` or `applyTuningProfile()` mutates `activeOverrides` | Overrides returned config values before base config | Process lifetime | ConfigLoader compatibility API | Restrict to backtest/test or explicit flat-state operator profile activation; audit all production callers. |

## Mercury Runs

- StateManager hidden-state audit: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:1`
- OrderExecutor hidden-state audit: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:2`
- Config/env authority audit: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:3`
- No-matching-exit halt removal attack: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:4`
- Share-range halt removal attack: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:5`
- `pauseTrading()` caller audit: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:6`
- Disabled symbol-cooldown cleanup attacks/rechecks: `ogz-meta/cognition-history/mercury-runs/2026-07-07.jsonl:7-11`

Mercury confirmed no duplicate no-matching BUY/SELL_SHORT path outside the inspected
`OrderExecutor` ranges. Mercury objected that removing the halt allows future entries;
that is exactly the intended downgrade for this slice because the prior halt did not
manage or reconcile the broker position. It only converted an exit/state mismatch into
a sticky symbol entry block.

Mercury also objected to the share-range halt removal because future entries remain
allowed after an accepted fill outside the planned share range. That is the intended
downgrade for this slice: the broker truth is recorded and the result remains visible
through `stockShareRangeFillViolation`, but the fill discrepancy does not persist a
symbol entry block.

The `pauseTrading()` audit needs one correction: Mercury cited SessionRouter as live
constructed, but the current code constructs it only inside the `sessionRouterEnabled`
branch in `run-empire-v2.js:816-821`, and live PM2 env has `SESSION_ROUTER_ENABLED=false`.
Therefore SessionRouter pause calls are dormant in the current live posture. Dashboard
manual pause is live and operator-commanded. `ExchangeReconciler` pause calls are dormant
because no production caller constructs or imports it outside its own module.

The disabled symbol-cooldown Mercury sequence found real stale-state gaps in order:
legacy cooldown halts missing `code`, mixed-case cooldown markers, cached config versus
late overrides, and a spaced `symbol_cooldown :` marker. Those are covered by
`core/StateManager.js:117-121`, `core/StateManager.js:2947-2974`, and the load-time
cleanup at `core/StateManager.js:3231-3268`. The last Mercury run still objected that
overrides do not reach StateManager, but that claim cited the module-level compatibility
`get()` while the current StateManager path calls exported `ConfigLoader.get()`, whose
static implementation checks `activeOverrides` first at `foundation/ConfigLoader.js:3153-3157`.
The focused override regression now passes in `test/state-manager-load.test.js:238-286`.

## Next Target

Audit `haltSymbol()` callers by reason class:

1. Remaining enabled symbol loss cooldown authority at `core/StateManager.js:2977-3027`.
2. SessionRouter failed-safe pause if `SESSION_ROUTER_ENABLED` is ever turned on.
3. ConfigLoader profile/override authority surfaces at `foundation/ConfigLoader.js:173-214`, `foundation/ConfigLoader.js:3007-3020`, `foundation/ConfigLoader.js:3153-3157`, and `foundation/ConfigLoader.js:3389-3427`.

Each caller must prove explicit authority, dashboard visibility, no safer downgrade,
and focused tests that it cannot silently contaminate `data/state.json`.
