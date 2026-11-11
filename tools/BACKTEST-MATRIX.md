# New confidence × ATR × stop-loss matrix

`tools/backtest-matrix.py` is a new experiment runner, not a restoration of the historical matrix and not another strategy implementation. It runs the current `run-empire-v2.js` executable for every cell. Signal creation, confidence/admission, sizing, simulated order execution and exit policies stay in the bot.

## Run

Requires Linux, Python 3, Node, installed project dependencies and `bwrap` (the existing helper isolation requirements). Run from the repository root:

```bash
# Check the data, explicit units and all combinations without launching the bot.
python3 tools/backtest-matrix.py \
  --plan tools/backtest-matrix.example.json \
  --data tuning/tsla-15m-500.json --dry-run

# A new output directory is required; existing results are never overwritten.
python3 tools/backtest-matrix.py \
  --plan tools/backtest-matrix.example.json \
  --data tuning/tsla-15m-500.json \
  --output backtest-results/new-matrix-example --workers 2
```

The example is illustrative, not recommended trading parameters. It selects EMA crossover explicitly. Change the plan's strategies and their actual stop owners to evaluate another strategy/group. No parameters are promoted to paper/production automatically.

Exit code 0 means every cell produced a complete runner receipt, including legitimate no-trade cells. Exit 1 means at least one failed/incomplete cell. Input errors use exit 2. A completed run does **not** certify profitability or live equivalence. There is no matrix timeout that kills a long-running backtest.

## Three dimensions and units

- `confidence`: fractions from 0 to 1, e.g. `0.6` = 60%. Sets the entry confidence threshold plus selected strategy exit-contract confidence floors (including existing timeframe overrides). Other confidence calculation and ranking logic remain unchanged.
- `atrMinPercent`: minimum `ATR / price * 100`, e.g. `0.4` = 0.4%. Enables the existing ATR admission filter and sets selected strategy thresholds, including timeframe overrides. This is **not** the indicator period or ATR stop multiplier.
- `stopLoss`: explicit current strategy-owned configuration paths and a matching unit. A percent risk distance is negative (`-0.5` = 0.5%); ATR multipliers are positive. The matrix does not switch a strategy from structural stops to percentage stops to manufacture an effective sweep.

Examples of current owners: EMA crossover `exitContracts.EMASMACrossover.stopLossPercent` / `percent`; ATR-stop strategies use their `atrStopMult` / `atr_multiple`; NoWick's structural buffer is `stopBufferAtr` / `atr_multiple`; BreakRetest uses `stopBufferAtrMultiplier`; OpeningRangeBreakout uses `stopBufferPct` / `percent_buffer`. These are different risk semantics. Do not mix units in a cell. A strategy whose stop owner is not supported must not be labelled as successfully swept. Derived targets/trails may change when a strategy deliberately derives them from the stop distance; those formulas are preserved.

Every selected strategy must have an explicit stop owner. Percent sweeps that would be superseded by structural/ATR logic are refused before dispatch. Existing timeframe-specific stop overrides require explicit support rather than silently sweeping an inactive base setting. Duplicate axis values are removed without changing order.

## Current configuration, not backtest-only strategy settings

The selected `baseProfile` is copied from current `config/settings.json`. Its strategy behavior, confirmation/warmup rules, pipeline, confluence and venue guards are retained. A disposable replay profile changes execution mode, dataset session, selected strategy scope and the named axes. No historical tuning profile is applied. An explicit existing fee profile supplies venue economics.

Each cell goes through `scripts/test-isolated.py`: disposable current-source copy, separate filesystem/network/process namespaces, read-only dependencies, no host `.env`, learned banks, journals, accounts, sockets or home. Only the disposable settings copy is changed. The runner receives a typed descriptor for its dataset, report and fresh state. Inert offline tokens satisfy existing adapter/model constructors; they are not real credentials, and no broker/model responses are fabricated.

Source and dataset content identities are recorded. Each cell verifies its source snapshot against the run manifest before it starts. Concurrent source changes become named failed cells, not mixed-version results. Use a quiet checkout when running a large matrix.

## Outputs

- `matrix.json`: all cells, statuses, raw summary fields, limitations and exact receipt links; incrementally saved as cells finish.
- `matrix.csv`: comparison table in deterministic grid order, with failures separate from no-trade results. Missing metrics stay empty.
- `<cell-id>.json`: resolved configuration values, config fingerprint, worker exit, structured original report including trades and window-end rows, and consumer-policy observations.
- `<cell-id>.log`: original isolated worker diagnostics.
- `sources.json`, `plan.json`: reproducibility inputs. `dataSha256` identifies the parsed OHLCV content, not original file whitespace.

No console regex is used to reconstruct financial results. A unique structured report, complete coverage, matching configuration fingerprint and reconciled counts are required. Saved confidence/ATR floors are compared with requested values. Percent-stop checks distinguish the requested/resolved base from effective trade stops, permitting only the base or its configured volatility-adjusted value. The original contract-creation volatility is not persisted, so matching stops are explicitly `partially_verified` / `compatible_trigger_unverified`, not proof the widening trigger was correct. For derived geometry the receipt distinguishes resolved inputs from observed resulting distances; it does not claim geometry or multiplier consumption was dynamically verified merely because a knob loaded. Zero trades means no trade-policy evidence. OGZTPO, LiquiditySweep and SmartMoneySweep stop sweeps are not supported; their signal-owned geometry must not be misrepresented as an exit-contract percentage sweep. Current buffer controls require positive values; zero-buffer baselines are not supported by this tool.

## Honest boundaries

- Current replay accepts one symbol and one native timeframe per dataset. Missing higher frames stay unavailable; this is not full MTF/tick replay. Raw completed historical candles are inputs; the tool does not synthesize missing market data or silently sort/dedupe corrupt files.
- OHLC cannot recover intrabar stop/target ordering or broker fill latency. Existing simulated slippage/fee code is used, not perfect fills.
- Learning settings remain intact, but each cell starts with empty isolated stores. Deployed learned-state parity is not claimed.
- External TrAI model service is unavailable in the offline namespace. The configured local TrAI code is not switched off; model initialization errors remain in logs. This matrix does not claim full model-assisted equivalence.
- Current `BacktestRunner` reports window-end closes separately from recorder trade rows. The matrix retains those rows and flags their presence; it does not invent a fully reconciled liquidation-equity result or automatically rank/promote a winner by headline P&L.
- No production configuration, process, broker account or trading state is modified. Running the matrix is not deployment.

## Native verification

```bash
python3 scripts/test-isolated.py \
  --fixture test/fixtures/backtest-matrix-observation.py \
  -- python3 test/fixtures/backtest-matrix-observation.py

# Adds generated synthetic candles through the actual trading executable.
python3 scripts/test-isolated.py \
  --fixture test/fixtures/backtest-matrix-observation.py \
  -- python3 test/fixtures/backtest-matrix-observation.py --integration
```

Synthetic candles are explicitly verification inputs, never historical performance evidence. Inspect real persisted policy values, coverage, failure classification and result counts, not merely a green check or old baseline profit number.
