# Codex KILL 5 Trade-Scope Handoff - 2026-05-21

Audience: Opus / review agent.

Status: implemented in working tree, Mercury-attacked, P0 verified, not committed, not pushed.

## Repo State

- Repo: `/opt/ogzprime/OGZPMLV2`
- Branch: `rebuild/clean-from-baseline`
- Branch was already ahead of origin by 7 local commits before this KILL 5 work.
- This KILL 5 patch is uncommitted at the time of this note.
- Unrelated dirty/untracked files exist. Do not stage broadly.

Stage only the logical fix files if committing this change:

- `core/OrderExecutor.js`
- `core/PositionTracker.js`
- `core/StateManager.js`
- `core/TradingLoop.js`
- `run-empire-v2.js`
- `ogz-meta/ledger/CODEX-KILL5-SYMBOL-HALT-HANDOFF-2026-05-21.md`

## Root Problem

The original KILL 5 symptom was dangerous:

- `OrderExecutor` handled unmatched `SELL` by calling `stateManager.emergencyReset()`.
- `OrderExecutor` handled unmatched `COVER` the same way.
- `emergencyReset()` wipes bot-side global position state while broker-side exposure can still exist.
- In live or eval trading, that can make the bot believe it is flat while the broker still holds risk.

During review, the larger root cause was identified:

- Active trade identity was not strong enough for a platform that switches symbols, brokers, modes, and asset classes.
- Legacy active trades could be loaded and normalized from current boot config.
- That is unsafe because today's `TRADING_PAIR`, broker, asset class, or timeframe may not match the trade's origin.
- Silent boot-time migration would cement state corruption.

The correct fix is therefore not just "tighten the unmatched exit branch." The fix is:

1. Refuse account-wide destructive reset for unmatched exits.
2. Halt new entries only for the affected symbol.
3. Require immutable trade scope at trade birth.
4. Refuse legacy active state that lacks enough scope to prove what it represents.

## What Changed

### 1. Entry scope is seeded from resolved runtime config

File: `run-empire-v2.js`

`this.config` now carries:

- `brokerId`
- `assetClass`
- `executionMode`
- `timeframe`

Those values come from resolved config, not from ad hoc fallback logic inside trade recording.

### 2. TradingLoop records the actual dispatch symbol

File: `core/TradingLoop.js`

`decision.ledgerData.symbol` now uses the `symbol` argument that is actually being traded.

It also records:

- `brokerId`
- `assetClass`
- `executionMode`
- `timeframe`

The old fallback chain could let the candle file / dispatch symbol and ledger symbol diverge.

### 3. OrderExecutor refuses scope-blind entries before routing

File: `core/OrderExecutor.js`

Before any `BUY` or `SELL_SHORT` can route, `executeTrade()` requires:

- explicit `symbol`
- `ctx.config.brokerId`
- `ctx.config.assetClass`
- `ctx.config.timeframe`
- `executionMode`

If any are missing, it throws before broker execution or state mutation.

Direct-entry bypass is also blocked if either:

- global halt is active, or
- symbol halt is active for that symbol.

### 4. BUY and SELL_SHORT stamp immutable scope at trade birth

File: `core/OrderExecutor.js`

Both entry branches pass this scope into `StateManager.openPosition()`:

- `symbol`
- `brokerId`
- `assetClass`
- `executionMode`
- `timeframe`

### 5. StateManager owns canonical trade scope

File: `core/StateManager.js`

Added:

- `normalizeSymbol(symbol, caller)`
- `buildTradeScope(context, symbol, caller)`
- `symbolEntryHalts`
- `haltSymbol(symbol, reason)`
- `isSymbolHalted(symbol)`
- `getSymbolHaltReason(symbol)`
- `resetSymbolHalt(symbol)`

`openPosition()` now:

- prefers actual `context.symbol` over `ledgerData.symbol`
- trims and normalizes symbol once through `normalizeSymbol()`
- rejects missing symbol
- calls `buildTradeScope()`, which trims and rejects missing or blank scope fields
- writes immutable top-level fields onto every active trade:
  - `symbol`
  - `brokerId`
  - `assetClass`
  - `executionMode`
  - `timeframe`
  - `scopeKey`
- overwrites those fields after spreading `context`, so caller metadata cannot undo canonical identity.

### 6. Load-time state no longer infers missing scope from current boot config

File: `core/StateManager.js`

On load:

- persisted symbol halt keys are normalized
- persisted active trade symbols are normalized only if the trade already has full scope
- active trades missing immutable scope are rejected
- `StateManager.load()` throws instead of booting with ambiguous state
- the catch marks `recoveryMode` / `lastError` and rethrows

Important operational consequence:

- Existing paper/live `data/state.json` with active legacy trades may fail to load after restart.
- That is intentional. The bot must not guess that a legacy trade belongs to the current boot symbol/broker.
- Recovery should be operator-approved quarantine/reconciliation, not automatic migration.

### 7. PositionTracker is no longer a scope-blind alternate writer

File: `core/PositionTracker.js`

`PositionTracker.openPosition()` now requires and stamps the same immutable scope. It calls `StateManager.buildTradeScope()` and passes metadata first, then canonical trade identity, so metadata cannot override:

- `symbol`
- `brokerId`
- `assetClass`
- `executionMode`
- `timeframe`
- `scopeKey`
- `action`

Short entries through `PositionTracker` now stamp `SELL_SHORT` instead of `BUY`.

### 8. Unmatched exits halt symbol entries instead of wiping global state

File: `core/OrderExecutor.js`

Changed behavior:

- unmatched `SELL` calls `stateManager.haltSymbol(symbol, 'KILL-5: SELL with no matching BUY')`
- unmatched `COVER` calls `stateManager.haltSymbol(symbol, 'KILL-5: COVER with no matching SELL_SHORT')`
- both return early

They no longer:

- call `emergencyReset()`
- wipe global position state
- wipe all active trades
- clear every MaxProfitManager

Exits remain allowed because halt checks only sit on entry paths.

## Verification

### Static checks

Passed:

```bash
node --check core/StateManager.js
node --check core/TradingLoop.js
node --check core/OrderExecutor.js
node --check core/PositionTracker.js
node --check run-empire-v2.js
git diff --check -- core/StateManager.js core/TradingLoop.js core/OrderExecutor.js core/PositionTracker.js run-empire-v2.js
```

### Focused smoke: trade-scope birth and PositionTracker

Passed:

```bash
BACKTEST_MODE=true node - <<'NODE'
// StateManager rejects missing brokerId.
// StateManager accepts complete scope and normalizes XBT/USD to BTC-USD.
// PositionTracker rejects missing brokerId.
// PositionTracker short entry stamps SELL_SHORT and canonical scope.
NODE
```

Verified:

- missing `brokerId` is rejected
- blank `brokerId` is rejected
- `XBT/USD` normalizes to `BTC-USD`
- `Kraken` normalizes to `kraken`
- `Crypto` normalizes to `crypto`
- `Paper` normalizes to `paper`
- scope key example: `paper:kraken:crypto:BTC-USD:15m`
- metadata could not override `PositionTracker` symbol/action identity

### Focused smoke: load-time legacy rejection

Passed:

```bash
BACKTEST_MODE=false STATE_FILE=/opt/ogzprime/OGZPMLV2/data/codex-state-scope-smoke.json DATA_DIR=/opt/ogzprime/OGZPMLV2/data node - <<'NODE'
// Legacy active trade with symbol but no brokerId/assetClass/mode/timeframe is rejected.
// Scoped persisted trade loads and gets normalized scopeKey.
NODE
```

Verified:

- legacy active trade missing immutable scope throws
- persisted active trade with blank immutable scope throws
- scoped persisted `XBT/USD` trade loads
- loaded scope key: `paper:kraken:crypto:BTC-USD:15m`
- temporary smoke state file was removed after the test

### Mercury adversarial attack

Prompt attacked:

- entry-scope gate
- BUY/SELL_SHORT scope stamping
- context / metadata overwrite ordering
- load-time legacy state rejection
- symbol halt interaction with exits
- unmatched SELL/COVER account-wide reset removal
- `PositionTracker` as alternate writer
- whether this closes the root mechanism or only the symptom

Result:

- No material bypass found.
- Mercury verified entries cannot route without full immutable scope.
- Mercury verified whitespace-only scope fields are treated as missing before routing or load.
- Mercury verified normalized identity overwrites caller context in `StateManager`.
- Mercury verified boot config is not used to infer missing scope for active persisted trades.
- Mercury verified symbol halts block new entries only, not exits.
- Mercury verified `PositionTracker` requires scope and metadata cannot override identity.

### P0 anchor

Full canonical P0 run executed through `runP0('full', 'kill5-scope-root-final')` after the final whitespace-scope validation patch.

Expected:

- `finalBalance = 13213.042341608163`
- `totalTrades = 1384`

Actual:

- `finalBalance = 13213.042341608163`
- `totalTrades = 1384`
- `winners = 830`
- `losers = 554`
- `winRate = 60.0`
- `maxDrawdownPercent = 3.19`
- `profitFactor = 1.72`

Artifacts:

- log: `/opt/ogzprime/OGZPMLV2/ogz-meta/ledger/phase0-canonical-kill5-scope-root-2026-05-21.log`
- report: `/opt/ogzprime/OGZPMLV2/backtest-report-v14MERGED-1779373443070.json`
- final log: `/opt/ogzprime/OGZPMLV2/ogz-meta/ledger/phase0-canonical-kill5-scope-root-final-2026-05-21.log`
- final report: `/opt/ogzprime/OGZPMLV2/backtest-report-v14MERGED-1779373789680.json`

These run artifacts are ignored by git (`*.log`, `backtest-report-*.json`) and were not staged.

Note: P0 output still emits existing `[LEDGER] Schema validation skipped: Cannot read properties of undefined (reading '_zod')` warnings. The run exited 0 and the anchor matched. This warning predates KILL 5 and is not part of this fix.

## Current Live Bot Context

Before this fix, PM2 was checked:

- `ogz-prime-v2` was online.
- Runtime was paper/dry-run, not live money:
  - `PAPER_TRADING=true`
  - `LIVE_TRADING=false`
  - `WEBHOOK_DRY_RUN=true`
- PM2 process uptime was 7 days, so it was not running the latest local commits.
- Logs showed it was analyzing BTC/USD but mostly holding with `conf=0`.
- Last persisted trade/state update was around `2026-05-21T12:33:46Z`.

Do not assume current PM2 runtime includes this patch until PM2 is deliberately restarted after commit and state reconciliation.

## Not Done

- Not committed yet.
- Not pushed.
- PM2 was not restarted.
- Current live/paper state has not been reconciled against the new immutable-scope requirement.
- Unrelated dirty/untracked repo files were not staged.
- Remaining master-plan items are still open:
  - Tier 4 Fix 9 / KILL 6 adjustedConfidence `/100`
  - Tier 4 Fix 10 / KILL 7 nearestStructure fibLevels
  - Tier 2 / Tier 5 deferred unless operator reprioritizes

## Commit Guidance

If committing this patch:

1. Re-check `git status --short --branch`.
2. Stage only the six listed files.
3. Inspect `git diff --cached`.
4. Commit one logical change:

```text
fix: require immutable trade scope before entry state writes
```

5. Do not push unless Trey explicitly approves.
