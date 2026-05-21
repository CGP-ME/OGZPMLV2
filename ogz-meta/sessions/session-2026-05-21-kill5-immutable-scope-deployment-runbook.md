# KILL 5 Immutable Scope Deployment Runbook - 2026-05-21

## Purpose

Commit `4bb887e` replaced the KILL 5 emergency reset failure path with symbol-scoped entry halts and immutable trade scope enforcement.

This is the correct root-cause direction, but it changes restart behavior for persisted active trades. A trade opened by older code may have a symbol while still missing `brokerId`, `assetClass`, `executionMode`, `timeframe`, or `scopeKey`. The new loader must not infer those fields from current boot config because a symbol, broker, or mode switch can corrupt live position ownership.

## Current Live State Evidence

Checked on the VPS from `/opt/ogzprime/OGZPMLV2` before any PM2 restart:

- PM2 process `ogz-prime-v2` is online from this repo and runs `run-empire-v2.js`.
- State file: `/opt/ogzprime/OGZPMLV2/data/state.json`
- State file mtime: `2026-05-21T12:33:46.307Z`
- State lastUpdate: `2026-05-21T12:33:46.308Z`
- Active persisted trades: `1`
- Active trade:
  - `orderId`: `SIM_1779366826307_ol9wmm`
  - `action`: `BUY`
  - `symbol`: `BTC-USD`
  - `entryPrice`: `77224.9932`
  - `size`: `541.2363417137516`
  - `entryStrategy`: `MADynamicSR`
  - `entryTime`: `2026-05-21T12:33:46.253Z`
  - missing immutable scope fields: `brokerId`, `assetClass`, `executionMode`, `timeframe`, `scopeKey`

Result: restarting PM2 onto `4bb887e` without reconciliation would intentionally fail StateManager load for this active trade.

## Deployment Gate

Do not restart `ogz-prime-v2` onto `4bb887e` or later until one of these is true:

1. No active trades exist in `data/state.json`.
2. Every active trade has verified immutable scope:
   - `symbol`
   - `brokerId`
   - `assetClass`
   - `executionMode`
   - `timeframe`
   - `scopeKey`
3. Trey explicitly approves a one-time state quarantine/reconciliation action.

## Required Inspection Command

Run this from `/opt/ogzprime/OGZPMLV2` before deploy/restart:

```bash
node - <<'NODE'
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data/state.json', 'utf8'));
const active = raw.activeTrades;
const entries = Array.isArray(active) && active.every(v => Array.isArray(v) && v.length === 2)
  ? active
  : Array.isArray(active)
    ? active.map((v, i) => [String(i), v])
    : active && typeof active === 'object'
      ? Object.entries(active)
      : [];
const required = ['symbol', 'brokerId', 'assetClass', 'executionMode', 'timeframe', 'scopeKey'];
const summary = entries.map(([key, trade], i) => ({
  index: i,
  mapKey: key,
  orderId: trade?.orderId || null,
  action: trade?.action || trade?.type || null,
  symbol: trade?.symbol || null,
  brokerId: trade?.brokerId || null,
  assetClass: trade?.assetClass || null,
  executionMode: trade?.executionMode || null,
  timeframe: trade?.timeframe || null,
  scopeKey: trade?.scopeKey || null,
  missing: required.filter(k => typeof trade?.[k] !== 'string' || trade[k].trim() === '')
}));
console.log(JSON.stringify({
  activeTrades: summary.length,
  invalidScopeTrades: summary.filter(t => t.missing.length > 0),
  allTrades: summary
}, null, 2));
NODE
```

## Reconciliation Options

### Preferred: Close Or Let The Sim Trade Resolve Before Restart

If the active trade is paper/simulated and not a real broker exposure, allow the running process to close it normally, then verify `activeTrades: 0`. This avoids manual state mutation.

### Quarantine: Preserve Evidence And Restart Flat

Use only with explicit Trey approval.

1. Stop the trading process cleanly.
2. Copy `data/state.json` to a dated repo-local forensic quarantine path.
3. Replace the active state with an operator-approved flat state.
4. Restart and verify StateManager loads cleanly.

Do not delete the old state file without a preserved copy.

### Manual Scope Stamp: Only If Broker Truth Confirms The Trade

Use only with explicit Trey approval and broker/trade identity verification.

For the current active trade, a plausible scope cannot be inferred safely from boot env alone. The process has mixed historical env signals (`TRADING_PAIR=TSLA`, `PRIMARY_ASSET=BTC-USD`, `PAPER_TRADING=true`) while the persisted active trade is `BTC-USD`. If manual stamping is chosen, the operator must verify the intended broker/mode/timeframe first.

The correct `scopeKey` format used by the code is:

```text
executionMode:brokerId:assetClass:symbol:timeframe
```

Example only, not approved for automatic migration:

```text
paper:simulated:crypto:BTC-USD:1m
```

## Post-Restart Verification

After restart:

1. Confirm PM2 process is online.
2. Confirm StateManager logs do not show an immutable-scope load rejection.
3. Confirm dashboard/state shows either no active trade or an active trade with the exact expected scope.
4. Confirm no new entry was opened under a stale or mismatched symbol.
5. If paper/live broker reconciliation exists for the mode, compare broker truth against StateManager before resuming eval work.

## Operational Decision

Current decision: do not push or restart this local commit until the active legacy trade is reconciled, closed, or quarantined with explicit operator approval.
