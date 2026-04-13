# Tournament Reconstruction — Mercury Agentic Audit
**Date:** 2026-04-12
**Mode:** Agentic (43 iterations, 41.2s latency)
**Purpose:** Reconstruct canonical matrix-sweep tournament invocation against current code state
**Tool:** Mercury-2 ReAct loop with grep/open_file/list_files

---

**1.  Parallel‑harness entry point**  
The current parallel‑sweep harness is the file **`tools/parallel-backtest.js`** – the top of the file even calls it “PARALLEL BACKTESTER” (lines 1‑5)【open_file → tools/parallel-backtest.js:1‑5】.

**2.  Full env‑var surface (union of every `process.env.*` read)**  

| Env‑var | Where it is read (file : line) | What it does (brief) |
|---------|-------------------------------|----------------------|
| `STRATEGY_DIAG` | `tools/parallel-backtest.js:317` – passed through to children【grep → tools/parallel-backtest.js:317】 | Enables verbose diagnostic logging in the orchestrator. |
| `SOLO_STRATEGY` | `tools/parallel-backtest.js:612‑618` – written before spawning children【grep → tools/parallel-backtest.js:612‑618】; also read in `core/StrategyOrchestrator.js:95‑96`【open_file → core/StrategyOrchestrator.js:90‑100】 | Restricts the orchestrator to the listed strategy(ies). |
| `EXECUTION_MODE` | `run-empire-v2.js:1020`【open_file → run-empire-v2.js:1019‑1025】 | `live` | `paper` | `backtest`. |
| `CANDLE_SOURCE` | `run-empire-v2.js:1021`【open_file → run-empire-v2.js:1019‑1025】 | `live` | `file`. |
| `CANDLE_DATA_FILE` | `run-empire-v2.js:1022`【open_file → run-empire-v2.js:1019‑1025】 | Path to the JSON candle file. |
| `DIRECTION_FILTER` | `run-empire-v2.js:1023`【open_file → run-empire-v2.js:1019‑1025】 | `both` | `long_only` | `short_only`. |
| `BACKTEST_MODE` | `run-empire-v2.js:1024`【open_file → run-empire-v2.js:1019‑1025】 | Enables back‑test‑specific code paths. |
| `BACKTEST_FAST` | `run-empire-v2.js:1025`【open_file → run-empire-v2.js:1019‑1025】 | Skips delays & UI. |
| `BACKTEST_NO_PATTERN_SAVE` | `run-empire-v2.js:1026`【open_file → run-empire-v2.js:1019‑1025】 | Disables pattern‑memory writes (EMFILE avoidance). |
| `FEE_MAKER` | `run-empire-v2.js:1027`【open_file → run-empire-v2.js:1019‑1025】 | Maker fee (decimal). |
| `FEE_TAKER` | `run-empire-v2.js:1028`【open_file → run-empire-v2.js:1019‑1025】 | Taker fee (decimal). |
| `ACCOUNT_DRAWDOWN_BYPASS` | `run-empire-v2.js:1029`【open_file → run-empire-v2.js:1019‑1025】 | Skips the draw‑down circuit‑breaker. |
| `ENABLE_TRAI` | `run-empire-v2.js:1030`【open_file → run-empire-v2.js:1019‑1025】 | Turns on the LLM‑based TRAI module. |
| `ENABLE_SHORTS` | `run-empire-v2.js:1031`【open_file → run-empire-v2.js:1019‑1025】 | Allows short‑side trades. |
| `ENABLE_RSI` | `run-empire-v2.js:1032`【open_file → run-empire-v2.js:1019‑1025】 | Enables the RSI strategy. |
| `ENABLE_EMA` | `run-empire-v2.js:1033`【open_file → run-empire-v2.js:1019‑1025】 | Enables the EMA‑MACrossover strategy. |
| `ENABLE_SMS` | `run-empire-v2.js:1034`【open_file → run-empire-v2.js:1019‑1025】 | Enables Smart‑Money‑Sweep. |
| `SMS_VP_RTH_ONLY` | `run-empire-v2.js:1035`【open_file → run-empire-v2.js:1019‑1025】 | VP‑only RTH candles for SMS. |
| `MTF_TIMEFRAMES` | `core/TradingConfig.js:597`【open_file → core/TradingConfig.js:560‑620】 | Comma‑separated list of multi‑time‑frame candles. |
| `ORB_SESSION_OPEN_HOUR` | `core/TradingConfig.js:562`【open_file → core/TradingConfig.js:560‑620】 | Opening‑range start hour (UTC). |
| `ORB_DURATION_MIN` | `core/TradingConfig.js:563`【open_file → core/TradingConfig.js:560‑620】 | Opening‑range duration (minutes). |
| `ORB_FVG_SCAN_BARS` | `core/TradingConfig.js:564`【open_file → core/TradingConfig.js:560‑620】 | Bars to scan for Fair‑Value‑Gap after breakout. |
| `ORB_MIN_FVG_PCT` | `core/TradingConfig.js:565`【open_file → core/TradingConfig.js:560‑620】 | Minimum FVG size (percent). |
| `ORB_MAX_FVG_PCT` | `core/TradingConfig.js:566`【open_file → core/TradingConfig.js:560‑620】 | Maximum FVG size (percent). |
| `ORB_ENTRY_LEVEL` | `core/TradingConfig.js:567`【open_file → core/TradingConfig.js:560‑620】 | Where to enter inside the FVG (`top`/`middle`/`bottom`). |
| `ORB_STOP_BUFFER_PCT` | `core/TradingConfig.js:568`【open_file → core/TradingConfig.js:560‑620】 | Stop‑loss buffer (percent). |
| `ORB_TARGET_RR` | `core/TradingConfig.js:569`【open_file → core/TradingConfig.js:560‑620】 | Target risk‑reward ratio. |
| `MIN_CANDLES_EMA` | `core/TradingConfig.js:580`【open_file → core/TradingConfig.js:560‑620】 | Minimum candles for EMA‑Crossover. |
| `MIN_CANDLES_MASR` | `core/

---

## AUDIT METADATA

- **Mercury iterations:** 43
- **Termination:** answer_given
- **Latency:** 41,173ms
- **Retrieval mode:** hybrid (identifier query type)
- **Starter context:** 8 chunks
- **Tool calls:** grep, list_files, open_file across tools/, core/, ogz-meta/
- **Index size:** 5,576 chunks (reindexed 2026-04-12)

---

## FULL TOOL CALL TRACE

<details>
<summary>Click to expand (43 iterations)</summary>

─── TOOL CALL TRACE ───

## Iteration 1 — grep
TOOL: grep({"query":"parallel","file_pattern":"core/**/*.js","limit":20})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "core/TradingConfig.js",
      "line": 607,
      "text": "accountDrawdownBypass: envBool('ACCOUNT_DRAWDOWN_BYPASS', false), // Skip drawdown check (for parallel backtester)"
    },
    {
      "file": "core/exit/DynamicTrailingStop.js",
      "line": 20,
      "text": "* ENV VAR OVERRIDES (for parallel backtester):"
    },
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 93,
      "text": "// Usage: SOLO_STRATEGY=RSI node tools/parallel-backtest.js ..."
    }
  ],
  "total": 3,
  "truncated": false
}

## Iteration 2 — list_files
TOOL: list_files({"path":"ogz-meta","pattern":""})
RESULT: {
  "dir": "ogz-meta",
  "directories": [
    "ast/",
    "backups/",
    "gates/",
    "health-reports/",
    "ledger/",
    "logs/",
    "manifests/",
    "prodlock-portable/",
    "proposals/",
    "replacements/",
    "reports/",
    "sessions/",
    "support-missions/"
  ],
  "files": [
    "04_guardrails-and-rules.md",
    "05_landmines-and-gotchas.md",
    "BACKTEST-OPS.md",
    "BACKTEST-PIPELINE-AUDIT.md",
    "BACKTESTING_GUIDE.md",
    "CONFIG-FINGERPRINT-REGISTRY.md",
    "E2E BACKTEST PIPELINE.MD",
    "ENV-VAR-AUDIT.md",
    "GRAND-SCHEME.md",
    "METHODOLOGY-VALIDATION-PIPELINE.md",
    "OGZPrime-Master-Engineering-Spec.md",
    "PID-CONTROLLER.md",
    "PIDvsMATRIX+PHASE2.md",
    "PIPELINE-CHANGES-SUMMARY.md",
    "README_2.md",
    "RUNNING-TODO.md",
    "Strategy&Tuning.md",
    "Strategy-Validation-Script.md",
    "TODO-NEXT-SESSION.md",
    "analyze-strategy-attribution.js",
    "approve.js",
    "ask_1.js",
    "audit-features.js",
    "bombardier.js",
    "build...[truncated]

## Iteration 3 — list_files
TOOL: list_files({"path":"tools","pattern":""})
RESULT: {
  "dir": "tools",
  "directories": [],
  "files": [
    "config-audit.js",
    "dep-scanner.js",
    "grid-search-confidence.js",
    "harvest-pattern-pack.js",
    "kill-switch.js",
    "matrix-sweep.js",
    "parallel-backtest.js",
    "regression-test.js",
    "repodumpforgpt.js",
    "run-audit-apex.js",
    "run-audit.js",
    "strategy-parity.js",
    "trade-validator.js",
    "trade-validator.js.backup",
    "trade-validator.js.pipeline-backup"
  ],
  "total": 15
}

## Iteration 4 — open_file
TOOL: open_file({"path":"tools/parallel-backtest.js","start_line":1,"end_line":200})
RESULT: {
  "file": "tools/parallel-backtest.js",
  "start_line": 1,
  "end_line": 200,
  "total_lines": 698,
  "text": "    1\t#!/usr/bin/env node\n    2\t/**\n    3\t * OGZPrime PARALLEL BACKTESTER — REAL PIPELINE EDITION v2\n    4\t * ========================================================\n    5\t * \n    6\t * Runs the ACTUAL trading pipeline via child processes with env var overrides.\n    7\t * Each worker = fresh node run-empire-v2.js with different config.\n    8\t * \n    9\t * Fixes from v1:\n   10\t * - Timeout raised to 20 min\n   11\t * - BACKTEST_SILENT passes through summary lines for parsing\n   12\t * - EMFILE fix: skip pattern saving + CSV export in parallel mode\n   13\t * - Reads results from JSON report file as fallback\n   14\t * \n   15\t * Usage:\n   16\t *   node tools/parallel-backtest.js --real     (HONORED env vars only - default)\n   17\t *   node tools/parallel-backtest.js --full     (all HONORED sweeps)\n   18\t *   node tools/parallel-backtest.js --atr      (A...[truncated]

## Iteration 5 — grep
TOOL: grep({"query":"process.env.","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "tools/parallel-backtest.js",
      "line": 317,
      "text": "STRATEGY_DIAG: process.env.STRATEGY_DIAG || 'false',"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 612,
      "text": "process.env.SOLO_STRATEGY = strat;"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 618,
      "text": "process.env.SOLO_STRATEGY = strat;"
    }
  ],
  "total": 3,
  "truncated": false
}

## Iteration 6 — grep
TOOL: grep({"query":"process.env.","file_pattern":"tools/parallel-backtest.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "tools/parallel-backtest.js",
      "line": 317,
      "text": "STRATEGY_DIAG: process.env.STRATEGY_DIAG || 'false',"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 612,
      "text": "process.env.SOLO_STRATEGY = strat;"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 618,
      "text": "process.env.SOLO_STRATEGY = strat;"
    }
  ],
  "total": 3,
  "truncated": false
}

## Iteration 7 — list_files
TOOL: list_files({"path":"","pattern":"run-empire-v2.js"})
RESULT: {
  "dir": ".",
  "directories": [],
  "files": [
    "run-empire-v2.js"
  ],
  "total": 1
}

## Iteration 8 — open_file
TOOL: open_file({"path":"run-empire-v2.js","start_line":1,"end_line":200})
RESULT: {
  "file": "run-empire-v2.js",
  "start_line": 1,
  "end_line": 200,
  "total_lines": 1768,
  "text": "    1\t#!/usr/bin/env node\n    2\t\n    3\t// CRITICAL: ConfigLoader MUST be first - loads .env, normalizes BACKTEST_MODE, isolates state\n    4\tconst { load: loadConfig } = require('./foundation/ConfigLoader');\n    5\tconst resolvedConfig = loadConfig({ silent: true }); // Silent here, verbose logging comes later\n    6\t\n    7\t// BACKTEST_FAST: Skip notifications, file I/O during backtest (explicit opt-in)\n    8\tconst BACKTEST_FAST = resolvedConfig.config.backtest.fast;\n    9\t// SILENT MODE: Disable logging during backtest for 100x speed boost\n   10\tif (resolvedConfig.config.backtest.silent ||\n   11\t    (resolvedConfig.config.mode.backtest && !resolvedConfig.config.backtest.verbose)) {\n   12\t  const originalLog = console.log;\n   13\t  let lastProgress = 0;\n   14\t  console.log = (...args) => {\n   15\t    // Only show critical output: COMPLETE, errors, final result...[truncated]

## Iteration 9 — grep
TOOL: grep({"query":"process.env.","file_pattern":"run-empire-v2.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "run-empire-v2.js",
      "line": 1019,
      "text": "console.log(`  SOLO_STRATEGY=${process.env.SOLO_STRATEGY || 'all'}`);"
    },
    {
      "file": "run-empire-v2.js",
      "line": 1020,
      "text": "console.log(`  EXECUTION_MODE=${process.env.EXECUTION_MODE || 'paper'}`);"
    },
    {
      "file": "run-empire-v2.js",
      "line": 1021,
      "text": "console.log(`  CANDLE_SOURCE=${process.env.CANDLE_SOURCE || 'live'}`);"
    },
    {
      "file": "run-empire-v2.js",
      "line": 1022,
      "text": "console.log(`  CANDLE_DATA_FILE=${process.env.CANDLE_DATA_FILE || 'default'}`);"
    },
    {
      "file": "run-empire-v2.js",
      "line": 1023,
      "text": "console.log(`  DIRECTION_FILTER=${process.env.DIRECTION_FILTER || 'both'}`);"
    },
    {
      "file": "run-empire-v2.js",
      "line": 1024,
      "text": "console.log(`  BACKTEST_MODE=${process.env.BACKTEST_MODE || 'false'}`);"
    },
    {
     ...[truncated]

## Iteration 10 — grep
TOOL: grep({"query":"process.env.","file_pattern":"core/TradingConfig.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "core/TradingConfig.js",
      "line": 9,
      "text": "* 3. If you find parseFloat(process.env.TRADING_PARAM) anywhere else, it's a bug"
    },
    {
      "file": "core/TradingConfig.js",
      "line": 597,
      "text": "mtfTimeframes: process.env.MTF_TIMEFRAMES?.split(',') || ['1m', '5m', '15m', '1h', '4h'],"
    }
  ],
  "total": 2,
  "truncated": false
}

## Iteration 11 — grep
TOOL: grep({"query":"process.env.","file_pattern":"core/TradingConfig.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "core/TradingConfig.js",
      "line": 9,
      "text": "* 3. If you find parseFloat(process.env.TRADING_PARAM) anywhere else, it's a bug"
    },
    {
      "file": "core/TradingConfig.js",
      "line": 597,
      "text": "mtfTimeframes: process.env.MTF_TIMEFRAMES?.split(',') || ['1m', '5m', '15m', '1h', '4h'],"
    }
  ],
  "total": 2,
  "truncated": false
}

## Iteration 12 — open_file
TOOL: open_file({"path":"core/TradingConfig.js","start_line":560,"end_line":660})
RESULT: {
  "file": "core/TradingConfig.js",
  "start_line": 560,
  "end_line": 660,
  "total_lines": 1043,
  "text": "  560\t    OpeningRangeBreakout: {\n  561\t      // ICT-style Opening Range + FVG entry (Trey's approach)\n  562\t      sessionOpenHourUTC: env('ORB_SESSION_OPEN_HOUR', 14),  // 9am EST = 14:00 UTC\n  563\t      orDurationMinutes: env('ORB_DURATION_MIN', 15),        // First 15 min defines OR\n  564\t      fvgScanBars: env('ORB_FVG_SCAN_BARS', 10),             // Bars to scan for FVG after breakout\n  565\t      minFVGPercent: env('ORB_MIN_FVG_PCT', 0.05),           // Minimum FVG size %\n  566\t      maxFVGPercent: env('ORB_MAX_FVG_PCT', 2.0),            // Maximum FVG size %\n  567\t      entryLevel: env('ORB_ENTRY_LEVEL', 'top'),             // 'top', 'middle', 'bottom' of FVG\n  568\t      stopBufferPct: env('ORB_STOP_BUFFER_PCT', 0.05),       // Stop buffer beyond first candle\n  569\t      targetRR: env('ORB_TARGET_RR', 2.0),                   // Risk:Reward ratio\n  570...[truncated]

## Iteration 13 — grep
TOOL: grep({"query":"process.env.","file_pattern":"core/TradingLoop.js","limit":200})
RESULT: {
  "matches": [],
  "total": 0,
  "truncated": false
}

## Iteration 14 — grep
TOOL: grep({"query":"process.env.","file_pattern":"core/StrategyOrchestrator.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 95,
      "text": "this.soloStrategies = process.env.SOLO_STRATEGY"
    },
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 96,
      "text": "? process.env.SOLO_STRATEGY.split(',').map(s => s.trim().toLowerCase())"
    },
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 189,
      "text": "if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {"
    },
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 236,
      "text": "if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {"
    },
    {
      "file": "core/StrategyOrchestrator.js",
      "line": 280,
      "text": "if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] LiquiditySweep: NOT ENOUGH CANDLES (${candles?.length || 0} < ${minCandlesSweep})`);"
    },
    {
      "file": "core/StrategyOrchestrator.js",
  ...[truncated]

## Iteration 15 — list_files
TOOL: list_files({"path":"core/strategies","pattern":""})
RESULT: {
  "error": "cannot list directory: ENOENT: no such file or directory, scandir '/opt/ogzprime/OGZPMLV2/core/strategies'"
}

## Iteration 16 — list_files
TOOL: list_files({"path":"core","pattern":"strategies"})
RESULT: {
  "dir": "core",
  "directories": [],
  "files": [],
  "total": 0
}

## Iteration 17 — grep
TOOL: grep({"query":"module.exports =","file_pattern":"core/**/*.js","limit":20})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "core/MaxProfitManager.js",
      "line": 1344,
      "text": "module.exports = MaxProfitManager;"
    },
    {
      "file": "core/DrawdownTracker.js",
      "line": 182,
      "text": "module.exports = DrawdownTracker;"
    },
    {
      "file": "core/KillSwitch.js",
      "line": 181,
      "text": "module.exports = killSwitch;"
    },
    {
      "file": "core/PipelineSnapshot.js",
      "line": 336,
      "text": "module.exports = PipelineSnapshot;"
    },
    {
      "file": "core/TimeFrameManager.js",
      "line": 1040,
      "text": "module.exports = TimeframeManager;"
    },
    {
      "file": "core/indicators/IndicatorEngine.js",
      "line": 1566,
      "text": "module.exports = IndicatorEngine;"
    },
    {
      "file": "core/indicators/TwoPoleOscillator.js",
      "line": 354,
      "text": "module.exports = TwoPoleOscillator;"
    },
    {
      "file": "core/CandleHelper.js",
      "line": 23,
     ...[truncated]

## Iteration 18 — list_files
TOOL: list_files({"path":"core","pattern":"strategies"})
RESULT: {
  "dir": "core",
  "directories": [],
  "files": [],
  "total": 0
}

## Iteration 19 — grep
TOOL: grep({"query":"class RSI","file_pattern":"core/**/*.js","limit":20})
RESULT: {
  "matches": [],
  "total": 0,
  "truncated": false
}

## Iteration 20 — grep
TOOL: grep({"query":"strategies","file_pattern":"*.js","limit":20})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "trai_brain/mercury-bridge/trace-memory.js",
      "line": 6,
      "text": "* exploration strategies."
    },
    {
      "file": "run-empire-v2.js",
      "line": 489,
      "text": "// Wire strategies to TradingConfig (per STRATEGY-REWRITE-SPEC.md)"
    },
    {
      "file": "run-empire-v2.js",
      "line": 490,
      "text": "const emaConfig = TradingConfig.get('strategies.EMACrossover') || {};"
    },
    {
      "file": "run-empire-v2.js",
      "line": 497,
      "text": "const masrConfig = TradingConfig.get('strategies.MADynamicSR') || {};"
    },
    {
      "file": "run-empire-v2.js",
      "line": 523,
      "text": "const liqConfig = TradingConfig.get('strategies.LiquiditySweep') || {};"
    },
    {
      "file": "run-empire-v2.js",
      "line": 538,
      "text": "// Filters out trend strategies when market is BALANCED (inside value area = chop)"
    },
    {
      "file": "run-empire-v2.js",
      "lin...[truncated]

## Iteration 21 — list_files
TOOL: list_files({"path":"modules","pattern":""})
RESULT: {
  "dir": "modules",
  "directories": [],
  "files": [
    "BreakAndRetest.js",
    "EMASMACrossoverSignal.js",
    "FairValueGapDetector.js",
    "LiquiditySweepDetector.js",
    "MADynamicSR.js",
    "MultiTimeframeAdapter.js",
    "OpeningRangeBreakout.js",
    "SmartMoneySweep.js"
  ],
  "total": 8
}

## Iteration 22 — grep
TOOL: grep({"query":"process.env.","file_pattern":"modules/**/*.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "modules/SmartMoneySweep.js",
      "line": 91,
      "text": "this.DEBUG = config.debug || process.env.SMS_DEBUG === 'true';"
    },
    {
      "file": "modules/LiquiditySweepDetector.js",
      "line": 152,
      "text": "if (process.env.BACKTEST_VERBOSE) {"
    }
  ],
  "total": 2,
  "truncated": false
}

## Iteration 23 — search
TOOL: search({"query":"delete process.env","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "error": "unknown tool: search. Available: grep, open_file, get_chunk, list_files"
}

## Iteration 24 — grep
TOOL: grep({"query":"delete process.env","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "matches": [],
  "total": 0,
  "truncated": false
}

## Iteration 25 — grep
TOOL: grep({"query":"process.env =","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "matches": [],
  "total": 0,
  "truncated": false
}

## Iteration 26 — open_file
TOOL: open_file({"path":"tools/parallel-backtest.js","start_line":600,"end_line":660})
RESULT: {
  "file": "tools/parallel-backtest.js",
  "start_line": 600,
  "end_line": 660,
  "total_lines": 698,
  "text": "  600\t    else if (args[i] === '--quick') sweepName = 'quick';  // alias to real\n  601\t    else if (args[i] === '--full') sweepName = 'full';\n  602\t    else if (args[i] === '--sizing') sweepName = 'sizing';\n  603\t    else if (args[i] === '--tiers') sweepName = 'tiers';\n  604\t    else if (args[i] === '--atr') sweepName = 'atr';\n  605\t    else if (args[i] === '--risk') sweepName = 'risk';\n  606\t    else if (args[i] === '--rsi') sweepName = 'rsi';\n  607\t    else if (args[i] === '--strategy-sweep') sweepName = 'strategy-sweep';\n  608\t    else if (args[i] === '--gauntlet-atr') sweepName = 'gauntlet-atr';\n  609\t    else if (args[i] === '--strategy' && args[i+1]) {\n  610\t      // Single strategy isolation mode - adds SOLO_STRATEGY to all configs\n  611\t      const strat = args[++i];\n  612\t      process.env.SOLO_STRATEGY = strat;\n  613\t      console.log(`...[truncated]

## Iteration 27 — search
TOOL: search({"query":"spawn(","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "error": "unknown tool: search. Available: grep, open_file, get_chunk, list_files"
}

## Iteration 28 — grep
TOOL: grep({"query":"spawn(","file_pattern":"tools/parallel-backtest.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "tools/parallel-backtest.js",
      "line": 325,
      "text": "const child = spawn('node', [RUNNER], {"
    }
  ],
  "total": 1,
  "truncated": false
}

## Iteration 29 — open_file
TOOL: open_file({"path":"tools/parallel-backtest.js","start_line":300,"end_line":340})
RESULT: {
  "file": "tools/parallel-backtest.js",
  "start_line": 300,
  "end_line": 340,
  "total_lines": 698,
  "text": "  300\t      PAPER_TRADING: 'true',\n  301\t      // FIX 2026-03-20: Add TEST_MODE to skip lock file check (allows running while live is active)\n  302\t      TEST_MODE: 'true',\n  303\t      // Skip pattern saving and CSV export to avoid EMFILE on Windows\n  304\t      BACKTEST_NO_PATTERN_SAVE: 'true',\n  305\t      SKIP_CSV_EXPORT: 'true',\n  306\t      // Disable dashboard WebSocket (no server on local PC = infinite reconnect loop)\n  307\t      ENABLE_DASHBOARD: 'false',\n  308\t      // FIX 2026-04-09: Enable SMS in sweeps (was silent-killed by _applyPipelineToggles)\n  309\t      ENABLE_SMS: 'true',\n  310\t      SMS_VP_RTH_ONLY: 'true',\n  311\t      // Disable Sentry (hooks every async op = massive overhead on 45K candles)\n  312\t      SENTRY_DSN: '',\n  313\t      NODE_ENV: 'test',\n  314\t      // Tag for finding the right report file\n  315\t      BACKTEST_REPO...[truncated]

## Iteration 30 — open_file
TOOL: open_file({"path":"tools/parallel-backtest.js","start_line":250,"end_line":320})
RESULT: {
  "file": "tools/parallel-backtest.js",
  "start_line": 250,
  "end_line": 320,
  "total_lines": 698,
  "text": "  250\t\n  251\tfunction generateRSISweep() {\n  252\t  const configs = [];\n  253\t  const oversoldLevels = [15, 20, 25, 30, 35];\n  254\t  const overboughtLevels = [65, 70, 75, 80, 85];\n  255\t  for (const os of oversoldLevels) {\n  256\t    for (const ob of overboughtLevels) {\n  257\t      // Only valid combinations where oversold < overbought with reasonable spread\n  258\t      if (ob - os < 30) continue;\n  259\t      configs.push({\n  260\t        name: `rsi-${os}-${ob}`,\n  261\t        env: { RSI_OVERSOLD: String(os), RSI_OVERBOUGHT: String(ob) }\n  262\t      });\n  263\t    }\n  264\t  }\n  265\t  return configs;\n  266\t}\n  267\t\n  268\t// ═══════════════════════════════════════════════════════════════\n  269\t// WORKER — Runs a single backtest as a child process\n  270\t// ═══════════════════════════════════════════════════════════════\n  271\t\n  272\tfun...[truncated]

## Iteration 31 — grep
TOOL: grep({"query":"process.env.","file_pattern":"modules/**/*.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "modules/SmartMoneySweep.js",
      "line": 91,
      "text": "this.DEBUG = config.debug || process.env.SMS_DEBUG === 'true';"
    },
    {
      "file": "modules/LiquiditySweepDetector.js",
      "line": 152,
      "text": "if (process.env.BACKTEST_VERBOSE) {"
    }
  ],
  "total": 2,
  "truncated": false
}

## Iteration 32 — grep
TOOL: grep({"query":"process.env.","file_pattern":"tools/parallel-backtest.js","limit":200})
RESULT: {
  "source": "direct_ripgrep",
  "matches": [
    {
      "file": "tools/parallel-backtest.js",
      "line": 317,
      "text": "STRATEGY_DIAG: process.env.STRATEGY_DIAG || 'false',"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 612,
      "text": "process.env.SOLO_STRATEGY = strat;"
    },
    {
      "file": "tools/parallel-backtest.js",
      "line": 618,
      "text": "process.env.SOLO_STRATEGY = strat;"
    }
  ],
  "total": 3,
  "truncated": false
}

## Iteration 33 — search
TOOL: search({"query":"delete cleanEnv","file_pattern":"tools/parallel-backtest.js","limit":20})
RESULT: {
  "error": "unknown tool: search. Available: grep, open_file, get_chunk, list_files"
}

## Iteration 34 — open_file
TOOL: open_file({"path":"tools/parallel-backtest.js","start_line":270,"end_line":290})
RESULT: {
  "file": "tools/parallel-backtest.js",
  "start_line": 270,
  "end_line": 290,
  "total_lines": 698,
  "text": "  270\t// ═══════════════════════════════════════════════════════════════\n  271\t\n  272\tfunction runSingleBacktest(config, dataFile, stockMode = false) {\n  273\t  return new Promise((resolve) => {\n  274\t    const startTime = Date.now();\n  275\t    const uniqueId = `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;\n  276\t    const stateFile = path.join(PROJECT_ROOT, 'data', `state-parallel-${uniqueId}.json`);\n  277\t    const reportTag = `parallel-${uniqueId}`;\n  278\t    \n  279\t    // Start with parent env but DELETE trading vars so they don't contaminate\n  280\t    // (user might have set them manually in shell)\n  281\t    const cleanEnv = { ...process.env };\n  282\t    delete cleanEnv.STOP_LOSS_PERCENT;\n  283\t    delete cleanEnv.TAKE_PROFIT_PERCENT;\n  284\t    delete cleanEnv.MIN_TRADE_CONFIDENCE;\n  285\t    delete cleanEnv.TRAI...[truncated]

## Iteration 35 — open_file
TOOL: open_file({"path":"ogz-meta/BACKTEST-OPS.md","start_line":1,"end_line":200})
RESULT: {
  "file": "ogz-meta/BACKTEST-OPS.md",
  "start_line": 1,
  "end_line": 200,
  "total_lines": 363,
  "text": "    1\t# OGZPrime Backtest Operations Manual\n    2\t## The Single Source of Truth for Running Backtests\n    3\t\n    4\t**Date:** 2026-03-30  \n    5\t**Commit to:** `ogz-meta/BACKTEST-OPS.md`\n    6\t\n    7\t---\n    8\t\n    9\t## HOW BACKTESTING WORKS\n   10\t\n   11\tOne codebase, one pipeline. Backtests run through the SAME code path as live trading:\n   12\t\n   13\t```\n   14\tBacktestRunner.loadHistoricalDataAndBacktest()\n   15\t  → for each candle:\n   16\t      → handleMarketData()        (CandleProcessor)\n   17\t      → analyzeAndTrade()         (TradingLoop)\n   18\t        → StrategyOrchestrator.evaluate()  (all strategies scored)\n   19\t        → OrderExecutor.executeTrade()      (position sizing, entry)\n   20\t        → StopLossChecker / TrailingStop    (exit management)\n   21\t      → BacktestRecorder.recordTrade()     (trade logging)\n   22\t  → export...[truncated]

## Iteration 36 — open_file
TOOL: open_file({"path":"ogz-meta/BACKTESTING_GUIDE.md","start_line":1,"end_line":200})
RESULT: {
  "file": "ogz-meta/BACKTESTING_GUIDE.md",
  "start_line": 1,
  "end_line": 154,
  "total_lines": 154,
  "text": "    1\tHere's the cold-reader version. Anyone walking into the repo for the first time can read this and know exactly what to do.\r\n    2\t\r\n    3\tOGZPrime Backtesting Guide & Env Var Audit\r\n    4\tLast updated: 2026-04-07\r\n    5\tBranch: tradingloop-clean-rewrite\r\n    6\tRead this first if you've never backtested OGZPrime before.\r\n    7\t\r\n    8\t1. What is OGZPrime?\r\n    9\tOGZPrime (OGZPMLV2) is a Node.js algorithmic trading bot for US equities. It runs multiple trading strategies in parallel, picks the highest-confidence signal each candle, and executes via a broker (Alpaca for live, simulated for backtests). The goal is passing Apex prop firm evaluations: roughly 15% profit with under 5% drawdown.\r\n   10\tThe codebase has three layers that matter for backtesting:\r\n   11\tStrategies — independent modules that look at price data and emit buy/sell si...[truncated]

## Iteration 37 — open_file
TOOL: open_file({"path":"run-empire-v2.js","start_line":1010,"end_line":1040})
RESULT: {
  "file": "run-empire-v2.js",
  "start_line": 1010,
  "end_line": 1040,
  "total_lines": 1768,
  "text": " 1010\t  /**\n 1011\t   * Start the trading bot\n 1012\t   */\n 1013\t  async start() {\n 1014\t    console.log('🚀 Starting OGZ Prime V14 MERGED...\\n');\n 1015\t\n 1016\t    // ENV FINGERPRINT — print all trading-relevant env vars for reproducibility\n 1017\t    console.log('═'.repeat(60));\n 1018\t    console.log('ENV FINGERPRINT:');\n 1019\t    console.log(`  SOLO_STRATEGY=${process.env.SOLO_STRATEGY || 'all'}`);\n 1020\t    console.log(`  EXECUTION_MODE=${process.env.EXECUTION_MODE || 'paper'}`);\n 1021\t    console.log(`  CANDLE_SOURCE=${process.env.CANDLE_SOURCE || 'live'}`);\n 1022\t    console.log(`  CANDLE_DATA_FILE=${process.env.CANDLE_DATA_FILE || 'default'}`);\n 1023\t    console.log(`  DIRECTION_FILTER=${process.env.DIRECTION_FILTER || 'both'}`);\n 1024\t    console.log(`  BACKTEST_MODE=${process.env.BACKTEST_MODE || 'false'}`);\n 1025\t    console.log(`  BACKTEST_F...[truncated]

## Iteration 38 — search
TOOL: search(null)
RESULT: {
  "error": "arg parse failed"
}

## Iteration 39 — open_file
TOOL: open_file({"path":"core/StrategyOrchestrator.js","start_line":90,"end_line":120})
RESULT: {
  "file": "core/StrategyOrchestrator.js",
  "start_line": 90,
  "end_line": 120,
  "total_lines": 1046,
  "text": "   90\t    );\n   91\t\n   92\t    // SOLO_STRATEGY mode: only enable specified strategies for isolated testing\n   93\t    // Usage: SOLO_STRATEGY=RSI node tools/parallel-backtest.js ...\n   94\t    // Supports comma-separated: SOLO_STRATEGY=RSI,EMASMACrossover\n   95\t    this.soloStrategies = process.env.SOLO_STRATEGY\n   96\t      ? process.env.SOLO_STRATEGY.split(',').map(s => s.trim().toLowerCase())\n   97\t      : null;\n   98\t    if (this.soloStrategies) {\n   99\t      console.log(`[StrategyOrchestrator] SOLO MODE: Only ${this.soloStrategies.join(', ')} enabled`);\n  100\t    }\n  101\t\n  102\t    // FIX 2026-03-19: Load orchestrator config from TradingConfig (no hardcodes)\n  103\t    this.minCandlesEMA = TradingConfig.get('orchestrator.minCandlesEMA') ?? 20;\n  104\t    this.minCandlesMASR = TradingConfig.get('orchestrator.minCandlesMASR') ?? 50;\n  105\t   ...[truncated]

## Iteration 40 — open_file
TOOL: open_file({"path":"modules/SmartMoneySweep.js","start_line":80,"end_line":110})
RESULT: {
  "file": "modules/SmartMoneySweep.js",
  "start_line": 80,
  "end_line": 110,
  "total_lines": 1009,
  "text": "   80\t\n   81\t    this.cvd = 0;\n   82\t    this.dailyLosses = 0;\n   83\t\n   84\t    this.lastLongSweepBar = -1;\n   85\t    this.lastShortSweepBar = -1;\n   86\t\n   87\t    // Candle index counter (since we don't have bar_index)\n   88\t    this.barIndex = 0;\n   89\t\n   90\t    // ─── Debug Mode ───\n   91\t    this.DEBUG = config.debug || process.env.SMS_DEBUG === 'true';\n   92\t\n   93\t    // ─── VP slice config ───\n   94\t    this.sweepMaxOffset = config.sweepMaxOffset != null ? Number(config.sweepMaxOffset) : 3;\n   95\t    this.vpRthOnly = config.vpRthOnly !== false;\n   96\t    this.vpLookbackBars = config.vpLookbackBars || 0;\n   97\t  }\n   98\t\n   99\t  // ═══════════════════════════════════════════════════════════════════\n  100\t  // CORE API — Called by StrategyOrchestrator\n  101\t  // ═══════════════════════════════════════════════════════════════...[truncated]

## Iteration 41 — open_file
TOOL: open_file({"path":"modules/LiquiditySweepDetector.js","start_line":140,"end_line":160})
RESULT: {
  "file": "modules/LiquiditySweepDetector.js",
  "start_line": 140,
  "end_line": 160,
  "total_lines": 423,
  "text": "  140\t        const openingCandle = this._aggregateCandles(this._openingBuffer);\n  141\t        this._processOpeningCandle(openingCandle);\n  142\t        this._openingCandleFed = true;\n  143\t        this._openingBuffer = [];\n  144\t      }\n  145\t      return this.getSignal();\n  146\t    }\n  147\t\n  148\t    if (this.state.phase === 'watching_for_exit' || this.state.phase === 'watching_for_pattern') {\n  149\t      this._processCandle(candle);\n  150\t    }\n  151\t\n  152\t    if (process.env.BACKTEST_VERBOSE) {\n  153\t      const candleTs = ts ? new Date(ts).toISOString() : 'unknown';\n  154\t      if ((this.stats?.totalSessionsAnalyzed || 0) % 10 === 0 || this.state.phase !== 'waiting_for_open') {\n  155\t        console.log(`[DEEP-LIQSWEEP] time=${candleTs} phase=${this.state.phase} interval=${this._candleIntervalMin||'?'}m ATR=${this.state.dailyATR?....[truncated]

## Iteration 42 — open_file
TOOL: open_file({"path":"ogz-meta/BACKTEST-OPS.md","start_line":1,"end_line":200})
RESULT: {
  "file": "ogz-meta/BACKTEST-OPS.md",
  "start_line": 1,
  "end_line": 200,
  "total_lines": 363,
  "text": "    1\t# OGZPrime Backtest Operations Manual\n    2\t## The Single Source of Truth for Running Backtests\n    3\t\n    4\t**Date:** 2026-03-30  \n    5\t**Commit to:** `ogz-meta/BACKTEST-OPS.md`\n    6\t\n    7\t---\n    8\t\n    9\t## HOW BACKTESTING WORKS\n   10\t\n   11\tOne codebase, one pipeline. Backtests run through the SAME code path as live trading:\n   12\t\n   13\t```\n   14\tBacktestRunner.loadHistoricalDataAndBacktest()\n   15\t  → for each candle:\n   16\t      → handleMarketData()        (CandleProcessor)\n   17\t      → analyzeAndTrade()         (TradingLoop)\n   18\t        → StrategyOrchestrator.evaluate()  (all strategies scored)\n   19\t        → OrderExecutor.executeTrade()      (position sizing, entry)\n   20\t        → StopLossChecker / TrailingStop    (exit management)\n   21\t      → BacktestRecorder.recordTrade()     (trade logging)\n   22\t  → export...[truncated]

─── END TRACE ───

</details>
