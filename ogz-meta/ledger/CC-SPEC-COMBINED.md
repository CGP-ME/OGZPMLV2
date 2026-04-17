# CC SPEC — Pre-Matrix-1 Infrastructure
**Created:** 2026-04-16
**Scope:** Two matrix-harness improvements to ship before Matrix 1 baseline run.
**Touches:** `core/OutputPaths.js` (new), `core/BacktestRunner.js`, `core/DecisionLedgerLogger.js`, `tools/matrix-sweep.js`
**Trading code changes:** ZERO
**Risk:** Low (infrastructure + output routing only)

---

## OVERVIEW

Two changes, one commit sequence. Apply in this order:

**Part 1 — Unified Output Directory**
All backtest output routes to a single folder via `BACKTEST_OUTPUT_DIR` env var.

**Part 2 — Matrix Worker Env Isolation**
Matrix workers get a built-from-scratch env instead of cloning the shell's env and trying to scrub dirty parts. Eliminates leakage of ~180+ trading env vars from parent PowerShell sessions.

Both changes are additive. Existing behavior preserved when env vars are unset (VPS compatibility).

---

# PART 1 — UNIFIED OUTPUT DIRECTORY

## WHAT THIS DOES

Four files write output today, all hardcoded to different paths inside the repo. After this, all four write to a **single unified folder** driven by an env var, with `C:/backtest-results/` as the Windows default.

### Before

| What | Current Path |
|---|---|
| Per-trade CSV | `./backtest-trades.csv` (repo root) |
| Per-trade JSON report | `./backtest-report-v14MERGED-{ts}.json` (repo root) |
| Decision ledger JSONL | `<repo>/logs/decisions/trade_YYYY-MM-DD.jsonl` |
| Matrix sweep results | `<repo>/backtest-results/matrix-{ts}.{json,csv}` |

### After (when `BACKTEST_OUTPUT_DIR` is set)

```
C:/backtest-results/
├── runs/
│   └── {timestamp}/
│       ├── trades.csv
│       └── report.json
├── ledger/
│   └── trade_YYYY-MM-DD.jsonl
└── matrix/
    ├── matrix-{timestamp}.json
    └── matrix-{timestamp}.csv
```

When env var is unset, falls back to existing paths (VPS-safe).

---

### EDIT 1.1 — Create shared output path helper

**New file:** `core/OutputPaths.js`

Full file content:

```javascript
'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Resolves the backtest output root directory.
 * Controlled by BACKTEST_OUTPUT_DIR env var.
 * Falls back to repo-relative paths for VPS backward compatibility.
 */
function getOutputRoot() {
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  if (envRoot) {
    return envRoot.replace(/\\/g, '/');  // normalize Windows paths
  }
  // Fallback: repo root (preserves existing VPS behavior)
  return path.resolve(__dirname, '..');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Get the directory for per-backtest-run output (CSV + JSON report).
 * Creates a timestamped subdirectory under runs/.
 */
function getRunDir(timestamp) {
  const root = getOutputRoot();
  const runId = timestamp || Date.now();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  const dir = envRoot
    ? path.join(root, 'runs', String(runId))
    : root;  // legacy: write to repo root
  return ensureDir(dir);
}

/**
 * Get the directory for decision ledger JSONL files.
 */
function getLedgerDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  const dir = envRoot
    ? path.join(root, 'ledger')
    : path.join(root, 'logs', 'decisions');  // legacy path
  return ensureDir(dir);
}

/**
 * Get the directory for matrix sweep output.
 */
function getMatrixDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  const dir = envRoot
    ? path.join(root, 'matrix')
    : path.join(root, 'backtest-results');  // legacy path
  return ensureDir(dir);
}

module.exports = {
  getOutputRoot,
  getRunDir,
  getLedgerDir,
  getMatrixDir,
  ensureDir,
};
```

---

### EDIT 1.2 — `core/BacktestRunner.js` line 182 — JSON report path

**old_str:**
```
      // Generate backtest report
      const reportPath = path.join(this.ctx.__dirname, `backtest-report-v14MERGED-${Date.now()}.json`);
```

**new_str:**
```
      // Generate backtest report
      // FIX 2026-04-16: Route to unified output directory
      const { getRunDir } = require('./OutputPaths');
      const runTimestamp = Date.now();
      const runDir = getRunDir(runTimestamp);
      const envRoot = process.env.BACKTEST_OUTPUT_DIR;
      const reportPath = envRoot
        ? path.join(runDir, 'report.json')
        : path.join(this.ctx.__dirname, `backtest-report-v14MERGED-${runTimestamp}.json`);
```

---

### EDIT 1.3 — `core/BacktestRunner.js` line 251 — CSV export path

**old_str:**
```
      // CHANGE 2026-02-23: Print BacktestRecorder summary with fees and export CSV
      if (this.ctx.backtestRecorder) {
        this.ctx.backtestRecorder.printSummary();
        this.ctx.backtestRecorder.exportCSV('./backtest-trades.csv');
      }
```

**new_str:**
```
      // CHANGE 2026-02-23: Print BacktestRecorder summary with fees and export CSV
      // FIX 2026-04-16: Route CSV to same unified run directory as JSON report
      if (this.ctx.backtestRecorder) {
        this.ctx.backtestRecorder.printSummary();
        const csvPath = process.env.BACKTEST_OUTPUT_DIR
          ? path.join(runDir, 'trades.csv')
          : './backtest-trades.csv';
        this.ctx.backtestRecorder.exportCSV(csvPath);
      }
```

Note: `runDir` and `runTimestamp` were defined in EDIT 1.2, so this edit depends on that one being applied first.

---

### EDIT 1.4 — `core/DecisionLedgerLogger.js` line 6 — decisions dir

**old_str:**
```
const DECISIONS_DIR = path.join(__dirname, '..', 'logs', 'decisions');
```

**new_str:**
```
// FIX 2026-04-16: Route ledger to unified output directory (via OutputPaths)
const { getLedgerDir } = require('./OutputPaths');
const DECISIONS_DIR = getLedgerDir();
```

---

### EDIT 1.5 — `tools/matrix-sweep.js` line 67 — matrix results dir

**old_str:**
```
const RESULTS_DIR = path.join(PROJECT_ROOT, 'backtest-results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
```

**new_str:**
```
// FIX 2026-04-16: Route matrix output to unified output directory
const { getMatrixDir } = require('../core/OutputPaths');
const RESULTS_DIR = getMatrixDir();
```

---

# PART 2 — MATRIX WORKER ENV ISOLATION

## WHAT THIS DOES

Matrix workers currently inherit the ENTIRE shell env and delete 6 known-bad vars. This leaves ~180+ trading-related env vars that could leak from a dirty PowerShell shell (old ENABLE_*, REGIME_*, VP_*, TRAIL_*, BE_*, etc.) and silently poison matrix results.

This change rebuilds the worker env from scratch using an explicit whitelist of only what matrix workers need. Leakage becomes impossible regardless of shell state.

---

### EDIT 2.1 — `tools/matrix-sweep.js` lines 230-239 — replace clone-and-scrub with build-from-scratch

**old_str:**
```
    // Clean env: dont inherit stale trading vars from shell
    var cleanEnv = Object.assign({}, process.env);
    delete cleanEnv.STOP_LOSS_PERCENT;
    delete cleanEnv.TAKE_PROFIT_PERCENT;
    delete cleanEnv.MIN_TRADE_CONFIDENCE;
    delete cleanEnv.TRAILING_STOP_PERCENT;
    delete cleanEnv.ATR_MIN_PERCENT;
    delete cleanEnv.SOLO_STRATEGY;

    var env = Object.assign({}, cleanEnv, {
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      BACKTEST_SILENT: 'true',
      BACKTEST_VERBOSE: 'false',
      BACKTEST_FAST: 'true',
      INITIAL_BALANCE: '10000',
      CANDLE_DATA_FILE: path.resolve(PROJECT_ROOT, dataFile),
      STATE_FILE: stateFile,
      DATA_DIR: path.join(PROJECT_ROOT, 'data', 'backtest'),
      PAPER_TRADING: 'true',
      TEST_MODE: 'true',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      SKIP_CSV_EXPORT: 'true',
      ENABLE_DASHBOARD: 'false',
      SENTRY_DSN: '',
      NODE_ENV: 'test',
      BACKTEST_REPORT_TAG: uid,
      STRATEGY_DIAG: 'false',
    }, stockMode ? { FEE_MAKER: '0', FEE_TAKER: '0' } : {}, config.env);
```

**new_str:**
```
    // FIX 2026-04-16: Build worker env from scratch (not clone-and-scrub).
    // Previous approach cloned process.env and deleted 6 known-bad vars.
    // ~180+ trading env vars could leak from a dirty shell (ENABLE_*,
    // REGIME_*, VP_*, TRAIL_*, BE_*, etc). Now we build from a whitelist
    // of only what matrix workers need. Leakage is impossible regardless
    // of shell state.
    //
    // ONLY these parent-shell vars are carried forward:
    //   - PATH (node needs it to find binaries)
    //   - NODE_PATH (npm module resolution)
    //   - HOME / USERPROFILE (node's tmpdir, fs ops)
    //   - APPDATA / LOCALAPPDATA (Windows npm global path)
    //   - TEMP / TMP (node temp file handling)
    //   - BACKTEST_OUTPUT_DIR (our output routing env var — see Part 1)
    //   - NODE_OPTIONS (memory tuning like --max-old-space-size)
    //
    // Nothing else from process.env. All trading env is explicit below.
    var workerBaseEnv = {};
    var SYSTEM_VARS = ['PATH', 'NODE_PATH', 'HOME', 'USERPROFILE',
                       'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
                       'BACKTEST_OUTPUT_DIR', 'NODE_OPTIONS'];
    for (var i = 0; i < SYSTEM_VARS.length; i++) {
      var key = SYSTEM_VARS[i];
      if (process.env[key] !== undefined) {
        workerBaseEnv[key] = process.env[key];
      }
    }

    var env = Object.assign({}, workerBaseEnv, {
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      BACKTEST_SILENT: 'true',
      BACKTEST_VERBOSE: 'false',
      BACKTEST_FAST: 'true',
      INITIAL_BALANCE: '10000',
      CANDLE_DATA_FILE: path.resolve(PROJECT_ROOT, dataFile),
      STATE_FILE: stateFile,
      DATA_DIR: path.join(PROJECT_ROOT, 'data', 'backtest'),
      PAPER_TRADING: 'true',
      TEST_MODE: 'true',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      SKIP_CSV_EXPORT: 'true',
      ENABLE_DASHBOARD: 'false',
      SENTRY_DSN: '',
      NODE_ENV: 'test',
      BACKTEST_REPORT_TAG: uid,
      STRATEGY_DIAG: 'false',
    }, stockMode ? { FEE_MAKER: '0', FEE_TAKER: '0' } : {}, config.env);
```

---

# VERIFICATION — WHOLE SPEC

## Step 1 — Show diff

```
git diff core/OutputPaths.js core/BacktestRunner.js core/DecisionLedgerLogger.js tools/matrix-sweep.js
```

Confirm:
- `core/OutputPaths.js` is a NEW file (5 exported functions)
- `BacktestRunner.js` has two edits (lines ~182 and ~251)
- `DecisionLedgerLogger.js` has one edit (line ~6)
- `matrix-sweep.js` has two edits (one around line 67, one around line 231-260)

## Step 2 — Verify legacy path fallback (env UNSET)

Run with NO env var set:

```powershell
# Fresh PowerShell
cd C:\Users\og_za\Documents\OGZPMLV2
.\backtest.ps1 rsi-only
```

Expected: writes to legacy paths (`./backtest-trades.csv`, `./backtest-report-v14MERGED-*.json`, `logs/decisions/trade_*.jsonl`). VPS-safe fallback confirmed.

## Step 3 — Verify unified paths (env SET)

```powershell
# Fresh PowerShell
cd C:\Users\og_za\Documents\OGZPMLV2
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"
.\backtest.ps1 rsi-only
```

Expected: writes to:
- `C:/backtest-results/runs/{timestamp}/trades.csv`
- `C:/backtest-results/runs/{timestamp}/report.json`
- `C:/backtest-results/ledger/trade_YYYY-MM-DD.jsonl`

## Step 4 — Verify env isolation (intentionally dirty shell)

```powershell
# Fresh PowerShell — intentionally pollute with values that would break a matrix
$env:ENABLE_RSI = "false"         # would disable RSI in every worker
$env:TRAIL_ATR_MULTIPLIER = "99"  # would break trailing stops
$env:TIER1_TARGET = "0.99"        # would break profit tiers
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"

# Run a quick matrix
node tools\matrix-sweep.js --data tsla --quick --solo=RSI
```

Expected: RSI still fires, trailing stops use defaults, tier targets normal. The polluted vars above are NOT carried to workers. Results are indistinguishable from a run in a clean shell.

If any polluted value leaked, the RSI strategy would produce zero trades (ENABLE_RSI=false) or wildly different P&L (TIER1_TARGET=0.99 means tier 1 target is 99% profit, so trades never hit tier 1). Clean run = isolation confirmed.

## Step 5 — Verify matrix sweep lands in unified matrix/ folder

After Step 4's quick run, check:
- `C:/backtest-results/matrix/matrix-{timestamp}.json` exists
- `C:/backtest-results/matrix/matrix-{timestamp}.csv` exists

---

# COMMIT MESSAGE

```
feat(infra): unified output directory + matrix worker env isolation

Part 1: Unified output via BACKTEST_OUTPUT_DIR env var
- New core/OutputPaths.js helper for path resolution
- BacktestRunner, DecisionLedgerLogger, matrix-sweep use helper
- Windows: set BACKTEST_OUTPUT_DIR=C:/backtest-results
- Linux/VPS: unset = legacy repo-relative paths preserved
- Zero trading behavior change — output routing only

Layout when BACKTEST_OUTPUT_DIR is set:
  runs/{timestamp}/trades.csv        (per-trade CSV)
  runs/{timestamp}/report.json       (summary + trade list)
  ledger/trade_YYYY-MM-DD.jsonl      (decision ledger)
  matrix/matrix-{ts}.{json,csv}      (matrix sweep)

Part 2: Matrix worker env isolation
- tools/matrix-sweep.js:231-239 now builds env from scratch
- Previously cloned process.env and deleted 6 known-bad vars
- ~180+ trading env vars could leak from dirty shell
- Now only PATH, NODE_PATH, HOME, USERPROFILE, APPDATA,
  LOCALAPPDATA, TEMP, TMP, BACKTEST_OUTPUT_DIR, NODE_OPTIONS
  are carried forward. All trading env is explicit.
- Eliminates env leakage regardless of parent shell state.
```

---

# WORKFLOW AFTER THIS SHIPS

## One-time setup (once per PowerShell session, or add to profile)

```powershell
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"
```

To make permanent across all PowerShell sessions, edit your profile:

```powershell
$PROFILE
# Open the file shown (create if missing), add the line above, save.
```

## Run any backtest or matrix

```powershell
# Everything routes to C:/backtest-results/ automatically
.\backtest.ps1 rsi-only
node tools\matrix-sweep.js --data tsla
```

---

**End of spec.**
