# CODEX SPEC: CandleProcessor New-Candle Timeframe Write

## Root Cause

The active timeframe provenance fix threaded `candleTimeframe` into
`CandleProcessor.processNewCandle()` and updated the UPDATE branch, but the NEW
candle branch still writes to the hardcoded `15m` CandleStore key. That leaves
first-seen candles in the wrong timeframe bucket when live is configured for
`1m`.

### Fix 1: Fixed new-candle CandleStore timeframe key

**Status:** FIXED

## Verification

- `npx jest test/symbol-routing.test.js --runInBand`
- `git diff --check -- core/CandleProcessor.js run-empire-v2.js tools/instrument-env.js test/symbol-routing.test.js`
- Full P0 proof with KILL 7 adaptive trail modifiers disabled matched the existing anchor exactly: `$13213.042341608163 / 1384 trades / 60.0% WR / PF 1.72`.

Mercury follow-up findings about CandleStore duplicate/out-of-order timestamp handling are real but separate from this one-line NEW-branch timeframe replacement and require their own pipeline run and commit.

#### File 1: `core/CandleProcessor.js`

**Line:** ~171

**str_replace target:**
```js
    this.ctx._candleStore.addCandle(
      candleStoreSymbol,
      '15m',
      candle
    );
```

**str_replace replacement:**
```js
    this.ctx._candleStore.addCandle(
      candleStoreSymbol,
      candleTimeframe,
      candle
    );
```
