# Stop 2: native timeframe and dashboard ownership repair scope

Investigation recorded 2026-11-18 UTC on `codex/archive-legacy-env`, source HEAD
`65c4a82b6a2f74297920344e2384bf38c7e0ba26`. Production source remains unchanged.
Trey's broader MTF instruction remains **Keep investigating before editing**.
Hermes owns a separate read-only Stop 3 winner trace. This document is a proposed
implementation boundary, not an approval or a Stop 2 completion certificate.

## Newly reproduced defects

[Native receipt](ownership-receipt.json), [execution identity](ownership-run.json),
and [standalone fixture](fixtures/ownership.cjs). The helper ran through the required
filesystem/process/network isolation with synthetic candles, without starting the
runner, connecting a broker, importing operator credentials, or touching PM2.

| Producer and consumer | Reproduced consequence |
| --- | --- |
| `run-empire-v2.js:2486-2525` writes a timeframe-only cache; `core/CandleProcessor.js:1142` reads it for a symbol-labeled packet. | NVDA 1m at 100 followed by TSLA 1m at 200 at the same start retains only TSLA. A later NVDA envelope can carry that TSLA history. |
| `run-empire-v2.js:2259-2304` only replaces the last bar in its symbol/frame mirror. | Two bars followed by an older correction produce three mirror rows, with the old bar appended last. Actual `CandleStore` retains two ordered rows and correctly replaces the older bar. |
| `core/CandleProcessor.js:1075-1092` now describes the newest canonical candle, while `:1130-1172` combines its timestamp/volume with the incoming candle's OHLC. | The correction at `1794873600000`, close 105, volume 12 is transmitted at `1794873660000`, with envelope volume 20. Its embedded OHLC/volume still belong to the older correction. The newest canonical candle remains close 108, volume 20. |
| `core/CandleProcessor.js:177-218,1104` uses the root indicator engine. | With distinguishable synthetic root/render RSI values 11/77, the helper emits 11. The source still needs a symbol/frame engine at the producer; this is a selection proof, not a numerical indicator audit. |

**Accountability for the timestamp/volume regression:** commit `65c4a82b` changed
`marketData` to the newest canonical candle without updating its dashboard
consumers. The older historical-price-as-current problem was already recorded;
this newly mixed timestamp/volume is a consequence of that change. The first
repair's native proof excluded the dashboard transport, and its completed reviews
did not establish this packet's correctness. It must be repaired before activating
the candle-correction change. No assertion is made that a running process has
loaded these bytes or that a live chart incident was observed.

## Intake and decision boundary

`config/settings.json:3580` has five `orchestrator.mtfTimeframes`: 1m, 5m, 15m,
1h, 4h. That setting currently controls all of the following:

- Entry admission: `run-empire-v2.js:697,952,988-1040`.
- Initial/transition stock subscriptions: `core/SessionRouter.js:1646-1653,1925-1932`.
- REST hydration and per-frame contexts: `run-empire-v2.js:1860,3278`.
- Per-symbol MTF storage and confirmation: `core/StrategyOrchestrator.js:925-933,985-993`.
- Persisted paper-position eligibility: `core/SessionRouter.js:1398-1404`.

The last consumer is a trade-scope check, so it must stay tied to entry eligibility;
blindly replacing every use of `evaluationTimeframes` would be incorrect.

Kraken already subscribes to all seven native frames via
`config/internals.json:1086-1094` and `kraken_adapter_simple.js:997-1028`. Alpaca's
native minute updates and broker REST requested-frame delivery are already the
source route; the next repair does not introduce local higher-frame aggregation.
`foundation/ConfigLoader.js:1131-1149` resolves MTF weights from the active profile
in settings. The paper profile already contains seven weights.

## Concrete implementation proposal

Deliver independent changes in dependency order, each with its own detailed
changelog entry, behavior evidence, focused Mercury review, atomic commit and push.
Neither source delivery authorizes a PM2 restart.

**First, restore the corrected candle's own metadata.** In
`core/CandleProcessor.js`, derive the outgoing candle timestamp and both envelope
volume fields from that same incoming candle; retain the newest canonical
`frameCtx.marketData` for current state. In the existing producer shape the intended
scoped change is:

```diff
- const dashboardTimestamp = marketData.timestamp;
+ const dashboardTimestamp = candle.t;
  // In both the outer price envelope and its nested data object:
- volume: marketData.volume,
+ volume: dashboardCandle.volume,
```

The existing JSON transport represents non-finite parsed candle volume as null;
do not introduce a guessed zero. This limited correction restores consistent bar
identity. It does not fix the separately documented selected-frame/global-cache
or price-readout problems, and must not be described as the full chart repair.

**Then, deliver all seven native series with explicit ownership.**

| Files | Intended change |
| --- | --- |
| `config/settings.json` | Expand `orchestrator.mtfTimeframes` to 1m, 5m, 15m, 30m, 1h, 4h, 1d. Introduce explicit `orchestrator.entryTimeframes` containing the existing five frames. Both remain owned by settings through ConfigLoader, not env overrides or a third config file. |
| `run-empire-v2.js`, `core/SessionRouter.js` | Subscribe/hydrate/register/ingest the seven observation frames. Keep closed-candle entry dispatch and restored-trade eligibility on the separate entry list. Preserve the already repaired close/revision boundary and immutable decision inputs. Replace misleading dropped-frame traces with the actual observation/entry disposition. |
| `core/StrategyOrchestrator.js` | Retain seven-frame MTF storage/confirmation using existing profile weights; keep the base timeframe explicit. This increases the available confirmation inputs and can change confluence results when 30m/1d are ready. It does not silently add entry triggers or retune weights. Preserve unrelated dirty strategy work. |
| `core/CandleProcessor.js` | Publish each native candle's own symbol, timeframe, timestamps and OHLCV. Attach that exact frame's canonical history and indicator engine. Keep historical corrections separate from current-price observations. Remove dependency on a client's selected timeframe and on the shared display cache. |
| `run-empire-v2.js`, `core/DashboardBroadcaster.js`, `core/BacktestRunner.js` | Migrate the affected mirror consumers to the existing symbol/frame CandleStore/context, then remove obsolete mirror writers/readers and their calls. BacktestRunner currently requires `storeTimeframeCandle` and uses its new-bar flag at `:200-202,246-256`; remove that dependency together with its caller, preserving the canonical ingestion result as the decision boundary. Keep actual historical REST responses distinct from trading history. No new storage wrapper. |
| `core/WebSocketManager.js` | Keep historical requests for the client's requested symbol/frame, but stop writing its view selection into the shared candle producer. |
| `public/js/core.js`, `public/js/chart.js`, `public/js/panels/chart-panel.js` | Select matching symbol/frame native bars without rebucketing their timestamps. Replace the exact historical bar on correction. Route current-price observations to their readouts without synthesizing OHLC. Keep current-price timestamps independent of historical corrections and filter indicator/readout ownership too. Both served chart implementations need the same contract. |
| `public/js/panels/chart-panel.js` | Remove the duplicate browser Kraken fetch that currently replaces the server's delivered crypto history at `:2323-2326`, along with helpers proven exclusive to that route. Use the delivered, attributed native series; expose actual unavailable data rather than substitute another frame or fabricated bar. |

The server's stock and crypto price-only feeds also carry useful data; they are not
deleted wholesale. `ogzprime-ssl-server.js` already contains unrelated dirty work.
Its relay/request routing is a dependency to verify, not authorization to rewrite
that work. If source changes there become necessary for this contract, identify the
exact producer/consumer hunk before adding it to the implementation scope.

The context/mirror migration is required by the demonstrated ownership defects,
not a general storage cleanup. Delete old calls only after tracing all active
consumers; the backtest dependency above is specifically not an orphan today.

## Acceptance evidence and remaining boundaries

Use an isolated end-to-end native replay across two symbols and all seven frames:
subscription intent, hydration, canonical storage, MTF snapshot, packet identity,
and both chart consumers. Compare OHLCV/start/end directly with supplied broker
records. Include an older revision, a newer bar, and two clients selecting
different views. Demonstrate price-only messages never create candles, revisions
never repeat entry decisions, and the five existing entry triggers remain five.
Exercise the existing historical backtest pump after removing its mirror coupling.
These are targeted behavior receipts, not a Jest suite or evidence of live fills.

After scoped source review and delivery, activation still requires explicit Trey
approval and paper-runtime/browser evidence. Existing higher-frame delivery-order
uncertainty, disconnect/recovery handling and full Stop 2 coverage remain open;
seven-frame availability alone cannot certify them.

A separate source lead discovered while tracing the broadcaster is recorded rather
than hidden: `core/DashboardBroadcaster.js:218-234` adds signed whole-candle volume
to CVD on each call, and `:237-279` derives liquidation estimates from fixed
leverage assumptions. `:211-216` also turns candle prices into wall-clock `delta`
ticks consumed by the HUD at `public/js/panels/chart-panel.js:1386-1406`. Historical
revisions must not masquerade as fresh ticks in the contract repair. The correctness
and presentation of the CVD/liquidation calculations need their own walk finding;
no live packet arbitration or complete analytics audit was performed here.

## Review and preservation

Author review checked the actual source methods, git diff for the introduced
metadata regression, isolated receipt values and the consumer inventory. No paid
Mercury call was made for this investigation-only document; no panel verdict or
production repair is claimed. The source and existing dirty work preservation
receipt accompanies the report. Only the investigation, its fixture and sanitized
receipts, and its own changelog entry are eligible for delivery.
