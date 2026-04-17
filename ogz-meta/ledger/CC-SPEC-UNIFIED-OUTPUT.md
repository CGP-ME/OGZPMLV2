# CC SPEC: Redirect All Backtest Output To `C:/backtest-results/`
**Created:** 2026-04-16
**Purpose:** Consolidate all four backtest output streams into a single root-level folder on Windows (and VPS-compatible via forward slashes).

---

## WHAT THIS CHANGES

Four files write output today, all hardcoded to different paths inside the repo. After this spec, all four write to a **single unified folder** driven by an environment variable, with `C:/backtest-results/` as the default on Windows.

### Before (current)

| What | Current Path |
|---|---|
| Per-trade CSV | `./backtest-trades.csv` (repo root) |
| Per-trade JSON report | `./backtest-report-v14MERGED-{ts}.json` (repo root) |
| Decision ledger JSONL | `<repo>/logs/decisions/trade_YYYY-MM-DD.jsonl` |
| Matrix sweep results | `<repo>/backtest-results/matrix-{ts}.{json,csv}` |

### After (this spec)

All outputs land in `C:/backtest-results/` (or whatever `BACKTEST_OUTPUT_DIR` env var specifies) with tidy subdirectories:

```
C:/backtest-results/
├── runs/                              ← single-backtest output
│   └── {timestamp}/
│       ├── trades.csv                 ← per-trade rows
│       └── report.json                ← summary + trade list JSON
├── ledger/                            ← decision ledger (Layer 3)
│   └── trade_YYYY-MM-DD.jsonl
└── matrix/                            ← matrix sweep output
    ├── matrix-{timestamp}.json
    └── matrix-{timestamp}.csv
```

Env var overrides:
- `BACKTEST_OUTPUT_DIR` (default: `C:/backtest-results`) — root folder for everything
- If unset, falls back to existing behavior (for VPS compatibility)

---

## WHY ENV VAR INSTEAD OF HARDCODING

- **Home rig (Windows):** defaults to `C:/backtest-results/`
- **VPS (Linux):** can set `BACKTEST_OUTPUT_DIR=/opt/ogzprime/backtest-results` in its `.env`
- Same code, no branching. Works everywhere.

If the env var is unset, fall back to current relative paths (preserves existing VPS behavior until you decide to change it).

---

## THE EDITS

### EDIT 1 — Create shared output path helper

New file: `core/OutputPaths.js`

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
  const dir = path.join(root, 'runs', String(runId));
  return ensureDir(dir);
}

/**
 * Get the directory for decision ledger JSONL files.
 */
function getLedgerDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  // If env var is set, use unified structure. Otherwise preserve legacy logs/decisions/.
  const dir = envRoot
    ? path.join(root, 'ledger')
    : path.join(root, 'logs', 'decisions');
  return ensureDir(dir);
}

/**
 * Get the directory for matrix sweep output.
 */
function getMatrixDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  // If env var is set, use unified structure. Otherwise preserve legacy backtest-results/.
  const dir = envRoot
    ? path.join(root, 'matrix')
    : path.join(root, 'backtest-results');
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

### EDIT 2 — `core/BacktestRunner.js` line 182 — JSON report path

old_str:
```
      // Generate backtest report
      const reportPath = path.join(this.ctx.__dirname, `backtest-report-v14MERGED-${Date.now()}.json`);
```

new_str:
```
      // Generate backtest report
      // FIX 2026-04-16: Route to unified output directory
      const { getRunDir } = require('./OutputPaths');
      const runTimestamp = Date.now();
      const runDir = getRunDir(runTimestamp);
      const reportPath = path.join(runDir, 'report.json');
```

---

### EDIT 3 — `core/BacktestRunner.js` line 251 — CSV export path

old_str:
```
      // CHANGE 2026-02-23: Print BacktestRecorder summary with fees and export CSV
      if (this.ctx.backtestRecorder) {
        this.ctx.backtestRecorder.printSummary();
        this.ctx.backtestRecorder.exportCSV('./backtest-trades.csv');
      }
```

new_str:
```
      // CHANGE 2026-02-23: Print BacktestRecorder summary with fees and export CSV
      // FIX 2026-04-16: Route CSV to same unified run directory as JSON report
      if (this.ctx.backtestRecorder) {
        this.ctx.backtestRecorder.printSummary();
        const { getRunDir } = require('./OutputPaths');
        const csvPath = path.join(getRunDir(runTimestamp), 'trades.csv');
        this.ctx.backtestRecorder.exportCSV(csvPath);
      }
```

Note: `runTimestamp` was defined in EDIT 2. This edit assumes EDIT 2 is applied first so both files land in the same timestamped run folder.

---

### EDIT 4 — `core/DecisionLedgerLogger.js` line 6 — decisions dir

old_str:
```
const DECISIONS_DIR = path.join(__dirname, '..', 'logs', 'decisions');
```

new_str:
```
// FIX 2026-04-16: Route ledger to unified output directory (via OutputPaths)
const { getLedgerDir } = require('./OutputPaths');
const DECISIONS_DIR = getLedgerDir();
```

Also update `ensureDir()` function at line 12-16 — it's now redundant because `getLedgerDir()` already ensures the directory exists. Leave the function in place (safe idempotent) but no edit required.

---

### EDIT 5 — `tools/matrix-sweep.js` line 67 — matrix results dir

old_str:
```
const RESULTS_DIR = path.join(PROJECT_ROOT, 'backtest-results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
```

new_str:
```
// FIX 2026-04-16: Route matrix output to unified output directory
const { getMatrixDir } = require('../core/OutputPaths');
const RESULTS_DIR = getMatrixDir();
```

---

## VERIFICATION

1. Show diff:
```
git diff core/OutputPaths.js core/BacktestRunner.js core/DecisionLedgerLogger.js tools/matrix-sweep.js
```

2. Confirm the new file exists:
```
ls -la core/OutputPaths.js
```

3. Test with env var UNSET — should use legacy paths:
```
.\backtest.ps1 rsi-only
```

After the run, verify:
- `backtest-trades.csv` exists at repo root (legacy location)
- `logs/decisions/trade_YYYY-MM-DD.jsonl` exists (legacy location)

4. Test with env var SET — should use new unified structure. In PowerShell:
```powershell
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"
.\backtest.ps1 rsi-only
```

After the run, verify:
- `C:/backtest-results/runs/{timestamp}/trades.csv` exists
- `C:/backtest-results/runs/{timestamp}/report.json` exists
- `C:/backtest-results/ledger/trade_YYYY-MM-DD.jsonl` exists

5. Test matrix sweep with env var set:
```powershell
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"
node tools\matrix-sweep.js --data tsla --quick --solo=RSI
```

After run:
- `C:/backtest-results/matrix/matrix-{timestamp}.json` exists
- `C:/backtest-results/matrix/matrix-{timestamp}.csv` exists

---

## COMMIT MESSAGE

```
feat(output): unified backtest output directory via BACKTEST_OUTPUT_DIR env var

- New core/OutputPaths.js helper for path resolution
- BacktestRunner, DecisionLedgerLogger, matrix-sweep.js all use helper
- BACKTEST_OUTPUT_DIR env var controls root (default: relative to repo)
- Windows: set to C:/backtest-results for single source of truth
- Linux/VPS: can set in .env, or leave unset for legacy paths
- Zero trading behavior change — output routing only
- Consolidates per-run CSV+JSON into runs/{ts}/ subdirectories
- Ledger and matrix each get their own subdirectory

Files written to unified output:
  runs/{timestamp}/trades.csv        (per-trade CSV)
  runs/{timestamp}/report.json       (summary + trade list JSON)
  ledger/trade_YYYY-MM-DD.jsonl      (decision ledger)
  matrix/matrix-{timestamp}.{json,csv} (matrix sweep)
```

---

## POWERSHELL WORKFLOW AFTER THIS SHIPS

Set the env var once per shell session, or put it in your `.env`:

```powershell
# One-time in shell
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"

# Then any backtest or matrix run
.\backtest.ps1 rsi-only
node tools\matrix-sweep.js --data tsla
```

All outputs land under `C:/backtest-results/`. Delete/archive runs from one place.

To make the env var permanent in PowerShell (so you don't have to set it each session), add to your PowerShell profile. Find the profile path:

```powershell
$PROFILE
```

Edit the file it shows (create if missing), add:

```powershell
$env:BACKTEST_OUTPUT_DIR = "C:/backtest-results"
```

Every new PowerShell session now has the env var set.

---

**End of spec.**
