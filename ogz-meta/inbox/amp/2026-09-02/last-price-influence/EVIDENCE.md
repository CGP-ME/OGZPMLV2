# Evidence

## Subject

- Branch: `codex/multi-asset-symbol-state`
- Predecessor: `4878c01762710c1127a5be541a7250115b5a56bd`
- Three-file implementation diff SHA-256 before packet creation:
  `1011341edf64117cc73fac195b1e13f5453c08f8c4eef45c17a2f0e929d900da`
- Implementation files: `CHANGELOG.md`, `run-empire-v2.js`, and
  `test/aggregate-source-backfill.test.js`.

## Producer defect

`run-empire-v2.js:523-532` converts normalized processor OHLC timestamps to
seconds. Before this correction, the SessionRouter handler passed
`ohlcData[1]` directly into `StateManager.updateLastPrice`. REST hydration and
liveness recovery pass `latest.etime || latest.t` in milliseconds at
`run-empire-v2.js:1685-1748,2828-2906`. `core/StateManager.js:898-908`
compares those raw numeric event times monotonically.

The pre-change handler receipt from the predecessor is:

```text
if (stateManager && stateManager.updateLastPrice) {
  stateManager.updateLastPrice(sym, ohlcData[5], ohlcData[1]);
}
```

The correction uses the existing canonical converter at the producer:

```text
const markEventTimeMs = ohlcTimestampMs(ohlcData[1]);
...
markUpdated = stateManager.updateLastPrice(sym, ohlcData[5], markEventTimeMs);
```

No StateManager comparison, gate, fallback, config, or downstream exception
was changed. A genuinely stale timestamp still returns `false`; this is the
surviving boundary tripwire, not compensation for mixed units.

## Trusted host probe

Command:

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node - <<'NODE'
const { StateManager } = require('./core/StateManager');
const { toTimestampMs } = require('./foundation/ohlc-normalize');
const update = StateManager.prototype.updateLastPrice;
const restTimeMs = Date.UTC(2026, 8, 2, 0, 0, 0);
function receiver() { return { state: { lastPrices: new Map(), lastPriceTimes: new Map() } }; }
const before = receiver();
update.call(before, 'TSLA', 100, restTimeMs);
const beforeAccepted = update.call(before, 'TSLA', 101, (restTimeMs + 60_000) / 1000);
const after = receiver();
update.call(after, 'TSLA', 100, restTimeMs);
const laterTimeMs = toTimestampMs((restTimeMs + 60_000) / 1000);
const afterAccepted = update.call(after, 'TSLA', 101, laterTimeMs);
const olderAccepted = update.call(after, 'TSLA', 99, toTimestampMs((restTimeMs - 60_000) / 1000));
console.log(JSON.stringify({
  before: { accepted: beforeAccepted, storedPrice: before.state.lastPrices.get('TSLA'), storedTime: before.state.lastPriceTimes.get('TSLA') },
  after: { laterTimeMs, accepted: afterAccepted, storedPrice: after.state.lastPrices.get('TSLA'), storedTime: after.state.lastPriceTimes.get('TSLA'), olderAccepted, storedPriceAfterOlder: after.state.lastPrices.get('TSLA') }
}));
NODE
```

Output:

```json
{"before":{"accepted":false,"storedPrice":100,"storedTime":1788307200000},"after":{"laterTimeMs":1788307260000,"accepted":true,"storedPrice":101,"storedTime":1788307260000,"olderAccepted":false,"storedPriceAfterOlder":101}}
```

This reproduces the pre-fix 100 -> 100 failure, the corrected 100 -> 101
advance, and preservation of 101 after a genuinely older frame is rejected.

## Strategy isolation and trace truth

The handler updates the mark before its `if (tf === activeTf)` branch.
Only that branch invokes `handleMarketData`; the non-active branch emits
`NON_ACTIVE_TIMEFRAME_DROPPED` and never invokes the strategy route. The one
new `LAST_PRICE_INFLUENCE` emission records:

- `markAttempted`: whether the existing StateManager writer was available;
- `markUpdated`: the writer's actual boolean result;
- `influence`: `mark_updated`, `mark_rejected`, or `mark_unavailable`;
- `strategyEligible`: whether the frame equals the captured active timeframe.

It does not claim that strategy routing completed.

## Focused verification

Commands:

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules \
  /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest \
  test/aggregate-source-backfill.test.js --runInBand
node --check run-empire-v2.js
git diff --check
```

Observed result: the focused contract completed successfully, syntax check
returned zero, and diff check returned zero. Test counts are not authority;
the host probe and source/diff receipts above are the behavioral evidence.

## Adversarial runs before Trey authorized the producer correction

- `2026-09-02T00-30-19-137Z-40a23cd544ee`: `UNVERIFIED`; Mercury unavailable,
  Fable found the original trace-label contradiction, and Kimi answer absent.
- `2026-09-02T00-34-51-514Z-d9080db7aaf4`: `UNVERIFIED`; Mercury unavailable,
  Fable and Kimi required the timestamp-unit/before-state receipt. That receipt
  led to Trey's explicit Fourth Shape producer-fix ruling.

## Producer-reference totality receipt

The trusted host parsed every tracked JavaScript file under `core/`, `brokers/`,
`modules/`, and `foundation/`, plus `run-empire-v2.js`, with Acorn
`ecmaVersion: latest`. All 155 files parsed; there were zero parse failures.
The AST contained one `updateLastPrice` method definition and exactly three
production calls:

```json
{
  "parser": "acorn",
  "filesParsed": 155,
  "filesTotal": 155,
  "parseFailures": [],
  "refs": [
    { "file": "core/StateManager.js", "line": 898, "kind": "method_definition", "computed": false },
    { "file": "run-empire-v2.js", "line": 936, "kind": "member", "computed": false },
    { "file": "run-empire-v2.js", "line": 939, "kind": "call", "computed": false },
    { "file": "run-empire-v2.js", "line": 1747, "kind": "member", "computed": false },
    { "file": "run-empire-v2.js", "line": 1748, "kind": "call", "computed": false },
    { "file": "run-empire-v2.js", "line": 2905, "kind": "member", "computed": false },
    { "file": "run-empire-v2.js", "line": 2906, "kind": "call", "computed": false }
  ]
}
```

The member entries are the three existing writer-availability checks. The call
entries are SessionRouter, REST hydration, and liveness recovery respectively.
The AST walk checked dot properties and computed string properties and found no
aliased, destructured, or computed call.

`run-empire-v2.js:469,519-520` proves `ohlcTimestampMs` calls the imported
`toTimestampMs`. `run-empire-v2.js:905-913` proves invalid timestamps return
before the mark update and `LAST_PRICE_INFLUENCE`; therefore the trace's
`mark_rejected` state cannot represent an invalid timestamp from this handler.
It truthfully represents any attempted writer update that returned false,
including a genuinely stale timestamp or an invalid close price.

### Full-repository AST recheck

The first AST pass was correctly challenged because its explicit runtime
directory set omitted other tracked root and tool files. The trusted host then
parsed all 635 tracked `*.js` files. Strict Acorn script/module parsing covered
631; `acorn-loose` covered four historical/non-runtime artifacts that are not
strict JavaScript. The complete universe produced the same production result:
one method definition, three writer-availability member reads, and exactly
three production calls. The only additional calls were the six known focused
test calls in `test/aggregate-source-backfill.test.js` and
`test/state-manager-load.test.js`. No computed property was found.

The four loose-fallback files were:

- `ogz-meta/ledger/02-tradingconfig-sms.js`;
- `ogz-meta/ogz-run.js`;
- `ogz-meta/replacements/MISSION-1773135593547.js`;
- `ogz-meta/replacements/MISSION-1773136513814.js`.

No `updateLastPrice` reference was present in those four artifacts.

### REST timestamp-unit provenance

Both REST paths call `_normalizeHydrationCandle` before selecting `latest`:

- boot hydration maps `rawCandles` at `run-empire-v2.js:1685-1690`;
- liveness recovery maps `rawCandles` at `run-empire-v2.js:2828-2837`.

`_normalizeHydrationCandle` calls `ohlcTimestampMs` for `t` and `etime` at
`run-empire-v2.js:1613-1621`, so the `latest.etime || latest.t` values passed at
lines 1748 and 2906 are canonical milliseconds. `CandleProcessor` independently
rejects non-millisecond candle timestamps at `core/CandleProcessor.js:500-512`.
The seconds representation produced only for processor/storage OHLC arrays does
not flow back into either `latest` object.

## Post-correction review attempts

- `2026-09-02T00-49-25-154Z-c7cda3c4d827`: `UNVERIFIED`; Mercury remained
  unavailable, Fable confirmed strategy isolation and trace truth but requested
  the converter identity and complete caller receipts, and Kimi answer was absent.
- `2026-09-02T00-53-28-276Z-af79e59f5f12`: `UNVERIFIED`; Mercury remained
  unavailable and both Fable and Kimi received no host evidence because the
  evidence excerpts were not embedded once in the query. This is an input
  assembly failure, not evidence about the implementation.
- `2026-09-02T01-01-13-079Z-b9cc2311423f`: `UNVERIFIED`; Mercury remained
  unavailable. Fable accepted the converter identity, invalid-timestamp
  exclusion, trace truth, and strategy isolation, then requested REST unit
  provenance and a repository-wide AST universe. Kimi answer was absent.
- `2026-09-02T01-08-07-243Z-8325a17c76e6`: `UNVERIFIED`; Mercury remained
  unavailable. Fable and Kimi both returned structured pass/no-block after
  receiving the REST provenance and full-repository AST receipt. The overall
  selected-panel ceiling correctly remained UNVERIFIED with cap reasons
  `selected_seat_unavailable`, `evidence_failure`, and `reviewer_disagreement`.
  Publication does not upgrade that durable ceiling.

## Mechanical adjudication

- Fable's invalid-close observation was accepted and the over-exclusive packet
  wording was corrected above. No production change is needed because
  `mark_rejected` already reports the writer's actual false return.
- Fable's possible one-millisecond ms-to-seconds-to-ms truncation edge is a
  receipt-backed inherited representation concern, not a failure of the ruled
  proof: the trusted host probe demonstrates a genuinely later frame advances
  the mark and a genuinely older frame remains rejected. No adjacent timestamp
  representation change was authorized.
- The source receipts and full-repository AST output mechanically close the
  earlier caller-totality and REST-unit allegations. The final panel's request
  for the raw AST transcript is preserved in this packet; it does not change
  either seat's pass/no-block verdict.

## Named absences

- No broker call, order, PM2 action, runtime activation, or runtime process
  mutation was performed.
- No live market frame was injected; the trusted host probe executes the live
  `StateManager.updateLastPrice` method with representative REST/stream times.
- Mercury remained unavailable with HTTP 402 `Account is inactive`; no Mercury
  answer or Mercury model-side AST evidence is claimed.
- No Part E work was started.
