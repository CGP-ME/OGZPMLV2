# Matrix Sweep & Parallel-Backtest Extensibility

**Last updated:** 2026-04-22
**Scope:** `tools/matrix-sweep.js` + `tools/parallel-backtest.js` — how to add strategies, phases, dimensions, and new sweep values without rewriting anything.

This doc exists because extensibility is not obvious from reading either tool cold. Use it as the map when adding things to the bot that need to be tunable via sweeps.

---

## Decision tree — which tool do I edit?

```
I want to sweep…
 │
 ├─ Confidence threshold per strategy?         → matrix-sweep.js --phase conf
 ├─ Stop loss × tier presets per strategy?     → matrix-sweep.js --phase exits
 ├─ Full grid (SL × TP × conf × strategies)?   → matrix-sweep.js (default)
 │
 ├─ ATR filter thresholds?                     → parallel-backtest.js --atr
 ├─ Position sizing curves?                    → parallel-backtest.js --sizing
 ├─ Tier profit-taking targets?                → parallel-backtest.js --tiers
 ├─ Risk manager params?                       → parallel-backtest.js --risk
 ├─ RSI-specific params?                       → parallel-backtest.js --rsi
 ├─ Gauntlet (strategy × parameter cross)?     → parallel-backtest.js --gauntlet-atr / --strategy-sweep
 │
 └─ Something none of these cover?             → See section "Adding a new sweep dimension" below
```

Shorthand: **matrix-sweep** is for the canonical SL × TP × conf × strategy combinatorial grid. **parallel-backtest** is for parameter sweeps within other dimensions (ATR, sizing, tiers, risk, strategy-specific).

---

## Zero-friction edits (add, don't rewrite)

### 1. Add a new strategy to the matrix

**File:** `tools/matrix-sweep.js`

**Two places to edit:**

```javascript
// Line ~88 — add to STRATEGIES list
const STRATEGIES = ['RSI', 'EMASMACrossover', 'MADynamicSR', 'LiquiditySweep', 'YourNewStrategy'];

// Line ~153 — add locked SL for your strategy (from walk-forward validation)
const LOCKED_EXITS = {
  RSI:                  { sl: 0.8 },
  EMASMACrossover:      { sl: 0.5 },
  // ...
  YourNewStrategy:      { sl: 1.0 },  // <-- add here
};
```

Done. Strategy now appears in `--solo=`, full sweeps, and `--phase conf` / `--phase exits`. ~30 seconds of work.

### 2. Add a new threshold value to an existing phase

**File:** `tools/matrix-sweep.js` — edit the `PHASES` object (~line 110):

```javascript
const PHASES = {
  exits: {
    stopLoss:   [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0],  // <-- added 4.0
    // ...
  },
  conf: {
    confidence: [0.25, 0.30, ..., 0.80, 0.85, 0.90],  // <-- added 0.85, 0.90
  },
};
```

One-line edits. Grid expands automatically.

### 3. Add a whole new phase to matrix-sweep

**File:** `tools/matrix-sweep.js`

**Two places:**

```javascript
// Line ~110 — add entry to PHASES object
const PHASES = {
  // ... existing phases ...
  yourphase: {
    stopLoss:      null,  // Uses LOCKED_EXITS
    tierPresets:   null,  // Uses MPM defaults
    confidence:    [0.60],
    yourParam:     [val1, val2, val3],
  },
};

// Line ~170 — extend generateMatrix() to handle your grid dimension
//   (existing loop is combinatorial: for strat → for sl → for tiers → for conf → emit config)
//   Add another inner loop for your dimension, and set env vars accordingly
if (phase === 'yourphase') {
  for (const yourVal of grid.yourParam) {
    env.YOUR_PARAM_ENV = String(yourVal);
    // push config with tagged name
  }
}
```

### 4. Add a new sweep to parallel-backtest

**File:** `tools/parallel-backtest.js` — edit the `sweeps` object (~line 140):

```javascript
const sweeps = {
  atr: [
    { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
    { name: 'atr-015', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.15' } },
    // ...
  ],
  yourNew: [  // <-- add here
    { name: 'yourfeat-off', env: { YOUR_FLAG: 'false' } },
    { name: 'yourfeat-low', env: { YOUR_FLAG: 'true', YOUR_VAL: '0.1' } },
    { name: 'yourfeat-high', env: { YOUR_FLAG: 'true', YOUR_VAL: '0.5' } },
  ],
};

// Line ~600 — add CLI flag
else if (args[i] === '--yournew') sweepName = 'yourNew';
```

Then `node tools/parallel-backtest.js --yournew --data tsla` runs the sweep.

---

## Friction points (will cost real time when hit)

### F1. Strategy-specific env-var branches

**Location:** `tools/matrix-sweep.js:207-210`

```javascript
if (strat === 'SmartMoneySweep') {
  env.ENABLE_SMS = 'true';
  env.SMS_VP_RTH_ONLY = 'true';
}
```

**Problem:** Every strategy that needs its own `ENABLE_X=true` or special env vars adds another `if` branch. After 5-6 strategies with quirks, this becomes unmaintainable.

**Cost when hit:** Real — need to add another branch per new strategy that has quirks.

**Future fix:** Phase 4-5 of config consolidation moves these to a per-strategy config section. Matrix-sweep can then read enablement flags from `TradingConfig.strategies[name].enabled` rather than hardcoding env vars.

**What to do today:** Follow the existing pattern. Add your branch, but keep a note in `ogz-meta/POST-MATRIX-BACKLOG.md` so the eventual cleanup catches it.

### F2. LOCKED_EXITS duplicates TradingConfig

**Location:** `tools/matrix-sweep.js:153-164`

**Problem:** The walk-forward-validated SL per strategy is stored in BOTH `TradingConfig.exitContracts.<STRATEGY>.stopLossPercent` AND matrix-sweep's `LOCKED_EXITS`. When you re-validate and update one, you must update both or sweeps use stale defaults.

**Cost when hit:** Low per-incident (1 minute) but accumulates. Also a landmine — easy to forget.

**Future fix:** Phase 4-5 of config consolidation. Matrix-sweep reads `LOCKED_EXITS` from `TradingConfig.exitContracts.<STRATEGY>`. `_validated` date marker per DEC-013 already lives in TradingConfig, so matrix-sweep can gate `LOCKED_EXITS` reads on that.

**What to do today:** Update both places. Search for `LOCKED_EXITS` when you update `exitContracts` in `TradingConfig.js`.

### F3. Adding a new sweep DIMENSION (not just values)

**Example scenarios:**
- Sweeping across **timeframes** (15m vs 5m vs 1m) — not currently supported
- Sweeping across **assets** (multi-ticker in one run) — not currently supported
- Sweeping across **regime states** (trending vs ranging) — not currently supported

**Location:** `tools/matrix-sweep.js:generateMatrix()` (~line 170-220)

**Problem:** The generator is a nested `for` loop structure — `for strat → for sl → for tiers → for conf`. Adding a new top-level dimension requires adding another `for` loop layer AND wiring the env vars that control it AND updating the output JSON schema to include the dimension.

**Cost when hit:** ~2-4 hours of focused work. Not huge, but not trivial.

**Future fix:** After Phase 4-5 config migration, rewrite `generateMatrix` to take a DIMENSIONS array and do a generic cartesian product. Until then, each dimension is hardcoded.

**What to do today:** If you need a new dimension, flag it in `ogz-meta/POST-MATRIX-BACKLOG.md` and consider whether parallel-backtest's declarative sweep format (just an array of `{name, env}` objects) is easier for your use case — it is, for most ad-hoc sweeps.

### F4. Regex fragility in stdout parsing

**Location:** `tools/matrix-sweep.js:parseOutput()` (~line 320-340)

**Problem:** Parses the `BacktestRecorder.printSummary` stdout via 10 regex patterns. If BacktestRecorder's printSummary ever adds a new field or changes wording, these regexes silently stop matching and the field becomes null (fallback then reads JSON).

**Cost when hit:** Low individually — the 2026-04-21 fix made stdout parsing a fallback, so JSON read handles missing fields cleanly. But each new field in `BacktestRecorder.getSummary()` that needs stdout parsing requires a new regex.

**Future fix:** Eventually, make `parseOutput` optional — if `report.json` exists, skip stdout parsing entirely. This reduces the surface area.

**What to do today:** When adding a new metric to `BacktestRecorder.getSummary()`, if you want it in the matrix CSV, add a regex in `parseOutput` AND a field in `tryReadReport`. Same pattern as the 2026-04-21 expectancy add.

---

## What Phase 2-5 of config consolidation fixes

| Phase | Fixes |
|---|---|
| Phase 2 | TradingConfig rewrite — JSON becomes source of truth, `.env` becomes explicit override layer |
| Phase 3 | ConfigLoader deleted — single system reads config |
| Phase 4 | 76 lazy `process.env.X` reads migrate to `TradingConfig.get('path.to.X')` — no more typo-silent-fallbacks like MIN_CONFIDENCE vs MIN_TRADE_CONFIDENCE |
| Phase 5 | `require('dotenv').config()` removed from `TradingConfig.js` entirely — `.env` no longer silently overrides |

After Phase 4-5, matrix-sweep and parallel-backtest can take a `--profile <name>` flag that loads a named config variant from `config/trading.config.json`, and inject overrides via `--set key=value` instead of `ENV_VAR=value`. That's when the "env var hell" Trey flagged on 2026-04-21 goes away.

Until then, both tools stay env-var-driven (correctly, because env vars are the only mechanism that works today).

---

## Patterns to follow when extending

### Naming convention for new configs
- Matrix-sweep: `<strat-short>_sl<val>_<tier-label>_c<conf*100>` — e.g. `RSI_sl0.5_tight_c60`
- Parallel-backtest: just `<feature>-<val>` — e.g. `atr-015`, `sizing-aggressive`

### Env vars must be in the HONORED list
Before sweeping an env var, verify it actually affects trading via the doc `ogz-meta/ENV-VAR-AUDIT.md`. Sweeping an IGNORED env var produces identical results for every config — the classic "all sweep results are the same" bug.

### Per-worker isolation (post-lane-1-race-fix)
Matrix-sweep now sets `BACKTEST_REPORT_TAG` per worker so parallel workers don't trample each other. When adding new phases or sweeps, **do not** override `BACKTEST_REPORT_TAG` in your config — the runner handles it.

### Test your new phase before running the real sweep
Add a `--quick` variant to your phase (reduce grid to 2-3 values per dimension) and verify it produces no-null output in the JSON before running the full version. Saves hours of wasted compute on broken configs.

---

## Related docs

- `ogz-meta/BACKTEST-OPS.md` — tuning playbook and command reference
- `ogz-meta/BACKTESTING_GUIDE.md` — tests 1-5 methodology
- `ogz-meta/ENV-VAR-AUDIT.md` — HONORED / PARTIAL / IGNORED / GHOST classification
- `ogz-meta/POST-MATRIX-BACKLOG.md` — tracked tool improvements (what's known-missing)
- `ogz-meta/ledger/CONFIG-CONSOLIDATION-SPEC.md` — Phase 2-5 timeline for env-var retirement
