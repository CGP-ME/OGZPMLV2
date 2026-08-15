# Repo-Wide Catch Totality Hunt - Current HEAD

Status: READ-ONLY HUNT. No runtime edits, no PM2/runtime touch, no commits, no tests.

Head inspected: `8494338f` (`Fixed StateManager decision ledger catch routing`)
Branch: `codex/multi-asset-symbol-state`
Date: 2026-08-13

## Scope

This is the follow-on to the SessionRouter 54-row throw/catch panel.

The SessionRouter panel is closed in `ogz-meta/inbox/codex/2026-08-12/sessionrouter-throw-catch-landing-table.md`. This pass expands the hunt across current HEAD for the same bug class:

- catches that swallow trading/runtime failures,
- catches that convert failure into `null`, `false`, `[]`, `{}`, zero, neutral, or "not found",
- throws that stop more of the bot than the bad symbol/trade/broker cell,
- support surfaces that make operator evidence look clean when the underlying read failed.

Doctrine applied:

- Fourth Shape first: fix or sanitize the producer when internal.
- Boundary failures route loudly and selectively: trace, ntfy where wired, manual reconciliation, symbol/broker/feed quarantine as appropriate.
- No broad bot lockout for an ordinary bad cell.
- Tests are evidence only; they do not preserve bad practice.

## Mechanical Current Count

Commands:

```bash
find brokers core foundation modules utils -type f -name '*.js' ! -path '*/test/*' ! -path '*/tests/*' ! -path '*/__tests__/*' ! -path '*/backup*/*' ! -path '*/archive/*' -print0 | xargs -0 rg -n "\bcatch\b" | wc -l
for f in run-empire-v2.js TierFeatureFlags.js backtest-strategies.js ogzprime-ssl-server.js; do [ -f "$f" ] && printf '%s ' "$f" && rg -n "\bcatch\b" "$f" | wc -l; done
```

Current count:

- `brokers/ core/ foundation/ modules/ utils/`: 514 catch / `.catch()` sites
- root runtime scope from prior pass: `run-empire-v2.js` 21, `TierFeatureFlags.js` 2, `backtest-strategies.js` 1
- same-scope total: 538
- dashboard/SSL server add-on: `ogzprime-ssl-server.js` 47
- broader runtime/support total including dashboard server: 585

The previous pass-0 artifact counted 537 under the original boundary at `a0afdc81`. Current same-scope count is 538 after later changes. I am not forcing stale arithmetic onto current HEAD.

## Closed Or Demoted Since Pass 0

| Site | Current ruling | Evidence |
|---|---|---|
| `core/StateManager.js:1718-1724` | Closed. Decision-ledger close-path catch routes through `_routeDecisionLedgerWriteFailure`. | Current code calls `_routeDecisionLedgerWriteFailure(e, ledgerToWrite, 'closePosition')`. |
| `core/StateManager.js:3515-3521` | Closed. Fill-apply decision-ledger catch routes through `_routeDecisionLedgerWriteFailure`. | Current code calls `_routeDecisionLedgerWriteFailure(e, ledgerToWrite, 'applyFill')`. |
| `core/StateManager.js:1495-1511` | Receipt for both above. | Emits `DECISION_LEDGER_RECONCILIATION_REQUIRED` with untrusted/manual-reconcile fields. |
| `core/OrderExecutor.js:3683-3691` | Demote from active high-signal queue. | Catch is inside `if (false && decision.action === 'BUY')`; current owner comment says `openPosition()` handles activeTrades storage. This should be deleted in a cleanup/dead-code lane, but it is not a live state-loss producer. |
| `ogzprime-ssl-server.js:1002-1006` | Dashboard/display issue only, not money-path. | Mercury first selected it, Fable blocked, Mercury rechecked, Kimi adjudicated `models_disagree`; shared conclusion says it does not gate trade execution. Keep it in reporting queue, not first money-path queue. |

## Current High-Signal Queue

### 1. Fabricated Indicator Defaults

Site: `core/OptimizedIndicators.js:122-125`

Current behavior: indicator calculation exception logs and returns synthetic values:

```js
return { rsi: 50, macd: 0, volatility: 0.02 };
```

Classification: internal producer or true bad input boundary, unresolved until producer census.

Risk: broken candle/indicator math can become neutral-looking technical state. That can flow through pattern and strategy logic as if the indicators were valid.

First fix shape: enumerate callers and bad input producers. Fix malformed candle/indicator producer where internal. If unresolved at boundary, skip only that symbol/timeframe decision with explicit untrusted indicator trace. Do not fabricate neutral indicators.

### 2. Strategy Exceptions Become No-Signal / HOLD

Sites:

- `core/StrategyOrchestrator.js:1003-1016`
- `core/StrategyOrchestrator.js:1030-1052`
- `core/StrategyOrchestrator.js:2014-2024`
- `core/StrategyOrchestrator.js:2336-2346`
- `core/StrategyOrchestrator.js:2688-2703`

Current behavior:

- MTF ingest/confluence/candle failures return `null` or `[]`.
- `NoWickImbalance.evaluate()` failures return `null` except explicit scope errors.
- Main strategy loop warns, records `thrownStrategies`, and continues.
- All failed or unqualified strategies can surface as `HOLD` / `No signals detected`.

Classification: internal producer for strategy/module exceptions; boundary only if caused by external candle feed failure.

Risk: a broken strategy module can look like a quiet market.

First fix shape: fix throwing strategy producers first. Where a strategy truly cannot evaluate because input feed is bad, mark that strategy/symbol/timeframe route untrusted and trace it. `HOLD` must mean no setup, not strategy execution broke.

### 3. Cross-Broker Position Aggregation Partial Truth

Site: `core/OrderRouter.js:196-234`

Current behavior: `getAllPositions()` catches per-broker position-read failures. In non-strict mode it logs and returns partial `allPositions`.

Evidence:

- `core/TtpCutoffEnforcer.js:590` calls with `strict: true`.
- `core/OrderExecutor.js:1316-1344` reads broker positions for exit with `strict: true`.
- The default public method remains non-strict and can produce partial false-flat truth if future or support callers omit strict.

Classification: internal aggregator swallowing external broker boundary.

Risk: one broker read failure can be represented as "no positions from that broker" instead of "broker truth unavailable".

First fix shape: make trading-facing callers typed and explicit. Either require strict for trading readers or return `{ positions, unavailableBrokers }` so no caller can confuse partial truth with flat.

### 4. Alpaca Residual Boundary Flattening

Sites:

- `brokers/AlpacaAdapter.js:192-195`
- `brokers/AlpacaAdapter.js:402-405`
- `brokers/AlpacaAdapter.js:705-708`
- `brokers/AlpacaAdapter.js:849-852`

Current behavior:

- connect failure returns `false`;
- cancel failure returns `false`;
- supported-symbol fetch failure returns `[]`;
- pending subscribe callback failure is console-only.

Already better in current HEAD:

- balance, positions, and place-order failures throw at the core live broker read/order surfaces.

Classification: external broker boundary flattened by adapter.

Risk: live target adapter can still make unavailable broker truth look like false/empty/log-only in residual routes.

First fix shape: typed unavailable envelopes or propagated typed errors, then route at the owning caller with broker/symbol/feed quarantine. No broad bot halt.

### 5. Legacy Broker Adapter Defaulting

Sites:

- `brokers/SchwabAdapter.js:231-233`, `254-256`, `337-339`, `350-352`, `370-372`, `419-421`
- `brokers/GeminiAdapter.js:222`, `268`, `311`, `323`, `343`
- `brokers/UpholdAdapter.js:154`, `233`, `256`, `355`
- `core/KrakenAdapterV2.js:108`, `164`, `194`, `203`, `229`, `311`
- `kraken_adapter_simple.js:354`, `476`, `937`, `1010`, `1178`, `1243`

Current behavior: broker/API/order/data failures return `null`, `[]`, `{}`, `false`, or fallback symbols.

Classification: external broker/exchange boundary flattened by adapter.

Risk: account, position, order, candle, and symbol-discovery failures can masquerade as empty or harmless broker truth.

First fix shape: fix the active/live-used adapters first. Convert defaults to typed boundary failures and route at broker/symbol/feed scope. Remove fallback symbols where they can become market truth.

### 6. Candle Gap / Persistence Defaulting

Sites:

- `core/CandleProcessor.js:845-848`
- `core/CandleStore.js:309`
- `core/CandleStore.js:362`

Current behavior:

- backfill failure returns `[]`;
- load failure returns `0`;
- save failure is log-only.

Classification: external data-feed boundary or persistence boundary.

Risk: missing/corrupt candles can look like no gap or fresh empty store.

First fix shape: route symbol/timeframe/feed as untrusted, preserve other slots, and avoid rewriting a failed/corrupt store as clean/fresh without an evidence record.

### 7. TRAI Decision / Learning Absorption

Sites:

- `core/TRAIDecisionModule.js:313-321`
- `core/TRAIDecisionModule.js:534-536`
- `core/TRAIDecisionModule.js:1161-1163`

Current behavior:

- processing failure falls back to original signal / `HOLD`;
- pattern memory check failure logs then uses base confidence;
- outcome-learning failure returns `false`.

Classification: internal producer for TRAI processing, learned-state boundary for pattern memory.

Risk: active TRAI degradation can look like normal raw strategy behavior or normal base confidence.

First fix shape: if TRAI is active in path, mark decision `trai_untrusted` with reason and trace. Continue raw strategy only with explicit provenance. Learned-state read/write failures should mark symbol/scope bank untrusted or the outcome unlearned/manual-reconcile, while clean live route stays alive.

### 8. Runtime Support / Operator Evidence Lies

Sites:

- `run-empire-v2.js:1899-1902`
- `run-empire-v2.js:2407`
- `foundation/ResilientWebSocket.js:153`, `366-376`, `443-445`
- `core/PipelineSnapshot.js:173`, `192`, `261`, `274`, `286`, `297`, `310`, `352`, `365`, `380`, `400`, `434-435`
- `core/WebSocketManager.js:307`, `312`
- `modules/MultiTimeframeAdapter.js:284`
- `core/TradeNarrator.js:405`, `771`, `805`, `830`, `872`
- `utils/telegramNotifier.js:114`, `119`
- `utils/discordNotifier.js:159`

Current behavior classes:

- boot failure logs, runs shutdown cleanup, and can exit clean;
- historical candle fetch failure can send cached data through normal frame shape;
- malformed WS/auth/onAuthenticated failures can disappear or leave ready state ambiguous;
- pipeline snapshot read failures become ordinary zeros/nulls/empty arrays;
- dashboard command failures can be mislabeled as parse errors;
- notification/narration failures are log-only.

Classification: support/reporting evidence integrity. Some are non-critical, but none should lie.

First fix shape: no trading lockout for support-only failures. Add explicit status/error/stale metadata, counters, and trace where already wired. Boot failure should preserve cleanup but report fatal exit status and fatal audit evidence.

## First Fix Order

1. `core/OptimizedIndicators.js` fabricated neutral defaults.
2. `core/StrategyOrchestrator.js` strategy exception to `HOLD` / no-signal path.
3. `core/OrderRouter.js` trading-facing position aggregation partial truth.
4. `brokers/AlpacaAdapter.js` live-target residual defaulting.
5. Active Kraken adapter/feed defaulting: `core/KrakenAdapterV2.js` plus `kraken_adapter_simple.js` only where wired.
6. Candle gap/store defaulting: `core/CandleProcessor.js`, `core/CandleStore.js`.
7. TRAI active decision and learned-state absorption.
8. Legacy broker adapters before activation: Schwab, Gemini, Uphold, Binance, Coinbase, CME, Tastyworks.
9. Runtime support/operator evidence: boot exit semantics, WS ready/error state, stale dashboard data, snapshot defaults.
10. Notification/narration visibility counters.

Each implementation item needs its own producer census, adversarial review, focused receipts, and one logical commit. The fix shape is selective route/quarantine/evidence, not broad lockout.

## Adversarial Layer Receipt

Prompt sent:

```text
Mercury, hunt one bug class in current HEAD: find the highest-impact catch/throw landing where a trading-runtime failure is swallowed, converted into a harmless default, or escalates broader than its own symbol/trade. Use live repo reads and cite exact file:line evidence. Focus on one concrete site or tight sibling cluster, prove the producer/landing path, and answer whether Fourth Shape says upstream producer fix, true-boundary loud route/quarantine, or dead tripwire. Do not propose broad bot lockout.
```

Result:

- Mercury first selected `ogzprime-ssl-server.js:1002-1005`.
- Fable blocked: missing producer path and no proof this endpoint gates trading.
- Mercury rechecked and conceded the endpoint is display-only.
- Kimi final adjudication: `models_disagree`; shared conclusion rejected the site as highest-impact trading-runtime failure.
- Run ledger: `ogz-meta/cognition-history/mercury-runs/2026-08-13.jsonl:5`.

Operator use: do not treat Mercury's first site as green. The adversarial layer worked by rejecting the overclaim.

## Footer

WHAT I DID DO: refreshed current branch/head/status, read the prior pass-0 census, reran current catch counts, launched three read-only subagents over broker/core/support buckets, ran one Mercury adversarial hunt with Fable recheck and Kimi adjudication, verified key current files and call sites, corrected stale queue items, and wrote this current-head ledger.

WHAT I DID NOT DO: edit runtime code, touch PM2/runtime, stage, commit, push, run tests, or route any single fix as complete.

WHAT I ASSUMED: this artifact is the accepted next board for the repo-wide hunt; implementation should proceed one bug class at a time from the first fix order unless Trey reprioritizes a specific site.
