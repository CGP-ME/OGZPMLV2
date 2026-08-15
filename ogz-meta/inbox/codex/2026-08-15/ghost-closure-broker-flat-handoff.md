# Ghost Closure / Broker-Flat Handoff

Status: HANDOFF SPEC WITH CURRENT-HEAD RECEIPTS. No runtime edits, no broker calls, no PM2 touch, no state mutation, no commits.

Repo: `/opt/ogzprime/OGZPMLV2`
Branch inspected: `codex/multi-asset-symbol-state`
Head inspected: `8494338f` (`Fixed StateManager decision ledger catch routing`)
Date: 2026-08-15

## Where The Related Boards Are Listed

- Repo-wide catch/defaulting queue: `ogz-meta/inbox/codex/2026-08-13/repo-wide-catch-totality-current-head.md`
- Prior broad catch census: `ogz-meta/inbox/codex/2026-08-13/broad-catch-totality-census-pass0.md`
- SessionRouter catch amendment: `ogz-meta/inbox/codex/2026-08-11/sessionrouter-catch-audit-amendment.md`
- SessionRouter 54-row throw/catch panel: `ogz-meta/inbox/codex/2026-08-12/sessionrouter-throw-catch-landing-table.md`
- Session gap / DeepSearch intake prompt: `ogz-meta/inbox/codex/sessiongaper.md`
- This handoff: `ogz-meta/inbox/codex/2026-08-15/ghost-closure-broker-flat-handoff.md`

## Attachment Intake Disposition

Two August 13 paste attachments sit beside `sessiongaper.md`:

| Attachment | Current disposition |
|---|---|
| `/home/linuxuser/.codex/attachments/1f7873d1-aa77-46a9-9c58-e5caa9a8af24/pasted-text.txt` | Active repo-wide catch/defaulting intake. Its 540-site pass is preserved in `ogz-meta/inbox/codex/2026-08-13/repo-wide-catch-totality-current-head.md`, refreshed at current head as 538 same-scope catch sites / 585 including `ogzprime-ssl-server.js`. Do not use the paste arithmetic blindly; use the current-head board. |
| `/home/linuxuser/.codex/attachments/d899225a-f697-45c7-83d7-2ca6a6cfa9e2/pasted-text.txt` | Active crash/live-position transcript intake. Its live-position warning, paper-default/root-cause notes, and stale-session-router failure class are partially reflected here. Its backtester deletion confession is not implementation law; any deletion/excision remains Trey-filled-table only. |

Current execution split:

- Ghost/live-position burial follows this handoff.
- Repo-wide catch/defaulting fixes follow `ogz-meta/inbox/codex/2026-08-13/repo-wide-catch-totality-current-head.md`.
- Deletion/excision claims from the crash transcript are not executable without Trey naming keeper/kill files in his own vocabulary.

## Operator Law

Trey's law for this lane:

> boundary-flat is proven at the broker, never in the ledger.

Operational constraints:

- Bot stays stopped throughout the live-position burial.
- Keys are never printed, pasted, or committed.
- No record purge before broker `/v2/positions` proves `[]`.
- State records without broker legs are recoverable.
- Broker legs without state records are the accident class.

## Current Repo Proof

### SessionRouter still has a state-enumerated flatten list

Current code:

- `core/SessionRouter.js:213-220` defines `_activeTradeEntries()`.
- `core/SessionRouter.js:214-218` reads `this.stateManager.state.activeTrades`, returns `[]` when absent, and returns entries from a Map/array.

Receipt command:

```bash
nl -ba core/SessionRouter.js | sed -n '190,235p'
```

Implication: a broker leg that exists only at Alpaca/Kraken and has no corresponding `activeTrades` record is invisible to this state-enumerated list.

### SessionRouter has broker REST reconciliation before activation, but it does not bury broker orphans by itself

Current code:

- `core/SessionRouter.js:1302-1323` requires `getPositions`, `getOpenOrders`, and `getBalance`; it throws if shapes are wrong or balance is empty.
- `core/SessionRouter.js:1333-1359` fetches source/target broker snapshots and blocks activation if open positions or open orders remain.

Receipt command:

```bash
nl -ba core/SessionRouter.js | sed -n '1260,1370p'
```

Implication: current code can detect open broker positions/orders during transition, but the handoff still needs a broker-first burial step for eval-era broker legs before any state purge.

### Alpaca getPositions now throws on REST error

Current code:

- `brokers/AlpacaAdapter.js:301-318` maps `/v2/positions` and throws `[Alpaca] Failed to get positions...` on error.
- This is better than the stale broad-catch note that warned about `getPositions` returning `[]` on error.

Receipt command:

```bash
nl -ba brokers/AlpacaAdapter.js | sed -n '285,325p'
```

Important residual: `brokers/AlpacaAdapter.js:697-708` still returns `[]` for supported-symbol fetch failure; that remains in the repo-wide catch queue but is not the `/v2/positions` proof path.

### Current live state inventory matches the expected four records

Backup status:

- `data/state.live-week-backup.json` exists.
- `data/state.json` exists.

Receipt command:

```bash
ls -la data | sed -n '1,80p'
python3 - <<'EOF'
import json
s=json.load(open('data/state.json'))
at=s.get('activeTrades',{})
if isinstance(at,dict):
    items=list(at.items())
elif isinstance(at,list):
    items=[]
    for i,item in enumerate(at):
        if isinstance(item,(list,tuple)) and len(item)==2 and isinstance(item[1],dict):
            items.append((item[0],item[1]))
        elif isinstance(item,dict):
            items.append((i,item))
else:
    items=[]
print('activeTrades_count', len(items))
for k,v in items:
    print(k,'|',v.get('symbol'),v.get('direction'),'qty',v.get('quantity') or v.get('orderQuantity') or v.get('remainingOrderQuantity'),'entry',v.get('entryPrice'),'born',str(v.get('timestamp') or v.get('entryTime'))[:10])
EOF
```

Output:

```text
activeTrades_count 4
44233487 | NVDA long qty 3 entry 192.55 born 1783431901
44239281 | MARA short qty 26 entry 12.44 born 1783432800
44239286 | TSLA long qty 2 entry 413.015 born 1783432802
44459322 | COIN long qty 2 entry 163.58 born 1783691101
```

Note: the pasted Python one-liner assumed object-shaped `activeTrades`; current `data/state.json` serializes `activeTrades` as a list of `[id, trade]` pairs. The handoff command above handles both shapes.

### `sessiongaper.md` is active intake; only line refs and fixed items are stale

`ogz-meta/inbox/codex/sessiongaper.md` and the attached `sessiongaper.md` remain active intake for this lane. Do not discard it. It cites older line locations and says its audit references commit `04135c1`; current head is `8494338f`, so every implementation must refresh file:line evidence before editing. The checklist/doctrine still governs unless current code proves an item has already been fixed.

Current disposition against `sessiongaper`:

| `sessiongaper` item | Current status at `8494338f` | Current proof |
|---|---|---|
| Broker-flat law / broker-first burial | Still stands. | This handoff lines above; broker `[]` remains required before state purge. |
| `SessionRouter` flatten list is state-enumerated | Still stands. | `core/SessionRouter.js:213-220` reads `stateManager.state.activeTrades`; broker-only orphan is invisible to this helper. |
| Crypto-to-stocks lacked force-close | Fixed recently. | `core/SessionRouter.js:1475` starts `_transitionToStocks`; `core/SessionRouter.js:1504` calls `_forceCloseSourceTradesThroughExecution(transitionContext, 'crypto')`. |
| Stocks-to-crypto force-close | Still present. | `core/SessionRouter.js:1570` starts `_transitionToCrypto`; `core/SessionRouter.js:1599` calls `_forceCloseSourceTradesThroughExecution(transitionContext, 'stock')`. |
| Decision-ledger close write catch was console-only | Fixed recently. | `core/StateManager.js:1718-1724` routes close ledger failure through `_routeDecisionLedgerWriteFailure`; `core/StateManager.js:1495-1511` emits `DECISION_LEDGER_RECONCILIATION_REQUIRED`. |
| Decision-ledger fill write catch | Fixed recently. | `core/StateManager.js:3515-3520` routes apply-fill ledger failure through `_routeDecisionLedgerWriteFailure`. |
| Broker orphan with no state record | Still open. | `_forceCloseSourceTradesThroughExecution` starts from state records; REST reconciliation detects positions but the class-killing requirement is to identify unknown broker legs as `STALE_BROKER_ORPHAN`, flatten/route them, and gate activation on broker `[]`. |
| State load existence door | Still open. | `core/StateManager.js:3969` and `core/StateManager.js:4067-4070` use configured/default state file; no current restore-time broker existence proof is wired in this handoff. |

## Step 0 - Read-Only Live Inventory Gate

Codex may perform only read-only inventory until Trey approves a flatten choice.

0a. Records:

- Confirm `data/state.live-week-backup.json` exists; if absent, create it with:

```bash
[ -f data/state.live-week-backup.json ] || cp data/state.json data/state.live-week-backup.json
```

- Print active records using the shape-safe inventory command from this handoff.
- Expected current records from 2026-08-15 local read: NVDA long, MARA short, TSLA long, COIN long.
- Any delta is a finding and stops the lane for Trey review.

0b. Broker truth:

Source config/env without printing secrets, then query Alpaca:

```bash
curl -s -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" https://api.alpaca.markets/v2/positions
curl -s -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" https://api.alpaca.markets/v2/account
curl -s -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" "https://api.alpaca.markets/v2/account/activities?activity_types=FILL&after=2026-08-07T00:00:00Z"
```

Proof gate: Trey sees records-list and broker-list side by side before any flatten or state edit.

Unknowns until 0b is run:

- exact current broker quantities,
- current broker entry/P&L/equity,
- whether the API keys are valid or MFA/support blocks access.

### Step 0b Result - Broker API Unauthorized

Read-only Alpaca calls were run on 2026-08-15 without printing keys. Raw outputs were saved under:

- `ogz-meta/inbox/codex/2026-08-15/broker-step0b/positions.json`
- `ogz-meta/inbox/codex/2026-08-15/broker-step0b/account.json`
- `ogz-meta/inbox/codex/2026-08-15/broker-step0b/fills-since-2026-08-07.json`

All three returned:

```json
{
  "code": 40110000,
  "message": "request is not authorized"
}
```

Current ruling from broker-flat law:

- Broker-flat is not proven.
- State purge is forbidden until Alpaca access is restored and `/v2/positions` can be witnessed as `[]`, or until Trey issues a different broker-side receipt.
- The four `data/state.json` active records remain evidence, not garbage.
- If startup/state repair proceeds before API access is restored, the safe branch is quarantine/mark untradeable as `STALE_BROKER_ORPHAN` with loud manual-reconcile evidence; no deletion.

## Step 1 - Trey Decision Gate

Trey decides per leg or all:

- `flatten`
- `hold`

Standing recommendation carried from the pasted order: flatten all four, because these are eval-era positions and the bot has no swing-management capability for boundary survivors. This is a recommendation only; it is not authorization.

## Step 2 - Broker Flatten Only After Trey Word

All-position flatten:

```bash
curl -s -X DELETE -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" https://api.alpaca.markets/v2/positions
```

Per-symbol flatten shape:

```bash
curl -s -X DELETE -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" https://api.alpaca.markets/v2/positions/MARA
```

Paste the returned order IDs. Do not edit `data/state.json` yet.

## Step 3 - Broker-Flat Receipt

Required artifact:

```bash
curl -s -H "APCA-API-KEY-ID: $ALPACA_API_KEY" -H "APCA-API-SECRET-KEY: $ALPACA_API_SECRET" https://api.alpaca.markets/v2/positions
```

Required output: `[]`.

Nothing proceeds without this exact broker-flat artifact.

## Step 4 - Record Purge After Broker `[]`

Only after `/v2/positions` returns `[]`:

- keep `data/state.live-week-backup.json`,
- offline-edit `data/state.json` while bot is stopped,
- remove only the buried active-trade entries,
- attach the broker `[]` output in the report/commit as the purge authority.

Never purge records before broker-flat proof.

## Step 5 - Kill The Class After The Era Is Buried

Two implementation commits after live burial:

### 5a. SessionRouter broker-proof wind-down rung

Problem:

- Current `_activeTradeEntries()` is state-enumerated at `core/SessionRouter.js:213-220`.
- Broker orphan legs with no state record are invisible to that list.

Fix shape:

- During wind-down, after state-trade flattening and before target activation, query broker `getPositions`.
- Any broker position unknown to state is classified `STALE_BROKER_ORPHAN`.
- Flatten the orphan through the real broker execution path or explicit broker flatten path.
- Emit loud trace/ntfy/manual-reconcile evidence.
- Gate boundary crossing on broker positions `[]`.
- Do not broad-stop the whole process beyond the affected transition/session/symbol.

Receipt:

- fixture with state empty but broker mock returning one position;
- broken-before: current wind-down misses state-less broker leg;
- working-after: orphan is flattened/routed as `STALE_BROKER_ORPHAN`, and activation waits for broker `[]`.

### 5b. State load existence door

Problem:

- Restored records can exist without live broker positions, or broker positions can exist without records.
- Current `StateManager.save/load` uses `paths.stateFile` or `data/state.json`; line evidence: `core/StateManager.js:3969`, `core/StateManager.js:4067-4070`.

Fix shape:

- On restore, every active trade born under older state-schema generation or missing verified broker-existence stamp must be verified against live broker positions before becoming tradeable.
- Missing broker match routes to `STALE_BROKER_ORPHAN` quarantine: loud, listed, untradeable, process alive.
- Boundary survivors are quarantined; clean symbols/trades remain usable.

Receipt:

- fixture with restored active trade and broker positions empty;
- working-after: trade is quarantined/listed/untradeable, no process death.

## Relation To Repo-Wide Catch Queue

This handoff is separate from but consistent with `repo-wide-catch-totality-current-head.md`.

Relevant queue items:

- `core/OrderRouter.js` partial broker-position truth risk is listed there at lines 97-113.
- Alpaca residual defaulting is listed there at lines 115-139.
- First fix order is listed there at lines 226-239.

Do not mix this live burial with unrelated catch-queue implementation. Bury the eval-era positions first; then implement the two class-killing commits.

## Footer

WHAT I DID DO: read the attached `sessiongaper.md`, read the repo copy at `ogz-meta/inbox/codex/sessiongaper.md`, verified current branch/head/status, read current `SessionRouter`, `StateManager`, `AlpacaAdapter`, and repo-wide catch handoff lines, verified the state backup exists, and enumerated current `data/state.json` active-trade records with a shape-safe parser.

WHAT I DID NOT DO: call Alpaca, print keys, flatten broker positions, edit `data/state.json`, restart PM2, edit runtime code, stage, commit, or push.

WHAT I ASSUMED: Trey wants this as a Codex handoff spec and proof ledger, not immediate live broker action. If Trey says "run Step 0b", the next agent may perform the read-only Alpaca calls without printing secrets.
