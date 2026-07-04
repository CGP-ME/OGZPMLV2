# Weekend Campaign Evidence Pack

Generated: 2026-07-04
Verdict: HOLD

The weekend campaign is not launched. The original two blockers are cleared: the runner now has a disk low-space clean-abort path, and the campaign runbook plus real stop/resume proof are on disk. The full campaign still failed the mechanical GO gate because real-manifest data parity is not fully green: SPY, QQQ, RIOT, and COIN stamped `FAILED-DATA-PARITY`.

## Launch Gate

| Gate | Verdict | Evidence | Operator Meaning |
| --- | --- | --- | --- |
| Canonical architecture specs moved and committed | PASS | Commit `798616b9 Added canonical architecture specs` pushed to `origin/codex/multi-asset-symbol-state`; files now under `ogz-meta/specs/`. | The two architecture docs are on the indexed canonical shelf. |
| Smoke gauntlet rerun, all strategies, frequency sanity | PASS | `ogz-meta/cognition-history/weekend-campaign/smoke-2026-07-04-conditional-go/smoke-summary.json`; `passed=true`, 16/16 strategy rows PASS. | Full roster is wired and emitting inside expected frequency bands. |
| PropSafe root-fixed and autopsy written | PASS | PropSafe row: 117 trades, 3.732 signals/session, frequency band PASS. Autopsy file: `ogz-meta/cognition-history/weekend-campaign/smoke-2026-07-04-conditional-go/smoke/smoke-PropSafeEMAPullback/ledger/autopsy_2026-07-04.jsonl`. | PropSafe is no longer strangled at 4 evaluations in 3 months; it is producing observable pullback activity. |
| Trey-spec engagement smoke | PASS | `treySpec.verdict=PASS`; baseline state-signal count 3550, trey event-signal count 105, event ratio 2.96%; ATR frozen policies present: 8. | The trey-spec profile is actually changing behavior instead of silently matching baseline. |
| End-to-end dress rehearsal | PASS | Root: `ogz-meta/cognition-history/weekend-campaign/dress-rehearsal-2026-07-03-mini-conf-r5`; campaign status has 2 done, 0 failed, 0 integrity failures. | Matrix -> integrity stamp -> compile -> Strategy Lab -> dossier completed for the miniature chain. |
| Integrity stamps | PASS | `campaign-status.md` rows: `current-eval-tsla-RSI-conf` and `current-eval-tsla-EMASMACrossover-conf` both dataParity PASS and identity/lifecycle/fields/coverage/schema all PASS. | The run artifacts balance accounting and have complete trade lifecycle data. |
| Real trade row with MFE/MAE | PASS | Example from EMASMACrossover report: entry 250.034955 USD, exit 251.564155 USD, qty present, MFE 0.6619%, MAE -0.0160%, net P&L 2.3244 USD. | The tuning analysis has the required excursion data; MFE/MAE is not blank. |
| Strategy Lab dossier output | PASS | Markdown: `ogz-meta/cognition-history/weekend-campaign/dress-rehearsal-2026-07-03-mini-conf-r5/strategy-lab/strategy-lab-2026-07-03T23-19-22-559Z.md`. JSON: same timestamp `.json`. | Human-readable dossier exists; raw JSON is not the only output. |
| Dress rehearsal data parity | PASS | `ogz-meta/cognition-history/weekend-campaign/dress-rehearsal-2026-07-03-mini-conf-r5/data-parity/tsla.json`; provider Alpaca, feed IEX, 625/625 June 2026 bars matched, close delta p95 0 bps, volume ratio p95 1.0, 11 live journal fills checked in range. | Dress rehearsal TSLA 15m data matches the live Alpaca IEX source for the checked window. |
| Full campaign data parity | HOLD | Real manifest `campaign-2026-07-03-weekend` stamped 96 rows PASS and 128 rows FAILED-DATA-PARITY. Failed symbols: SPY, QQQ, RIOT, COIN. | No partial launch. The full campaign cannot start until all symbol parity stamps are green or the operator explicitly changes the gate. |
| Storage capacity | PASS | Dress rehearsal size: 1,746 MiB for 2 runs. Projected 222-run output: 193,806 MiB, or 189.3 GiB. Available on `/opt/ogzprime/OGZPMLV2`: 403,207 MiB, or 393.8 GiB. | There is enough free space for the projected campaign if output size scales linearly. |
| Disk low-space clean-abort guard | PASS | Forced proof: `ogz-meta/cognition-history/weekend-campaign/low-disk-proof-2026-07-04/low-disk-abort.json`; `availableMiB=401674.87`, forced `requiredMiB=999999999`, run marked `LOW-DISK-ABORT`, no worker log created. | The runner aborts before the next worker and preserves the manifest/artifacts. |
| Launch/stop/resume/status runbook | PASS | Runbook: `ogz-meta/cognition-history/weekend-campaign/README.md`. Proof root: `ogz-meta/cognition-history/weekend-campaign/stop-resume-proof-2026-07-04-r2`; sequence `running|running|planned` -> `stopped|done|planned` -> `done|done|done`, final 2 done, 0 failed. | Stop/resume is proven against real matrix runs. |
| Bot remains off | PASS | PM2 check: `ogz-prime-v2` status `stopped`, pid 0. No PM2 restart was run. | Trading bot stayed off while campaign prep was evaluated. |

## Smoke Matrix

Command:

```bash
node tools/weekend-campaign-gauntlet.js smoke --data=tsla-unseen --fee-profile=ttp_real --run-id=smoke-2026-07-04-conditional-go
```

| Strategy | Trades | Signals / Session | Exit Code | Verdict |
| --- | ---: | ---: | ---: | --- |
| RSI | 80 | 5.54 | 0 | PASS |
| EMASMACrossover | 261 | 63.39 | 0 | PASS |
| MADynamicSR | 239 | 43.14 | 0 | PASS |
| LiquiditySweep | 6 | 2.14 | 0 | PASS |
| SmartMoneySweep | 93 | 7.50 | 0 | PASS |
| MultiTimeframe | 27 | 4.64 | 0 | PASS |
| OGZTPO | 4 | 0.43 | 0 | PASS |
| OpeningRangeBreakout | 25 | 0.66 | 0 | PASS |
| CandlePattern | 307 | 63.00 | 0 | PASS |
| NoWickImbalance | 2 | 1.07 | 0 | PASS |
| BreakRetest | 24 | 0.89 | 0 | PASS |
| DonchianBreakout | 120 | 2.82 | 0 | PASS |
| PropSafeEMAPullback | 117 | 3.73 | 0 | PASS |
| EMATrendRetest | 171 | 6.64 | 0 | PASS |
| RSI2MeanReversion | 135 | 6.09 | 0 | PASS |
| TimeSeriesMomentum | 89 | 11.59 | 0 | PASS |

## Dress Rehearsal

Root:

```text
ogz-meta/cognition-history/weekend-campaign/dress-rehearsal-2026-07-03-mini-conf-r5
```

Campaign status:

| Run | Data Parity | Trades | Identity | Lifecycle | Fields | Coverage | Schema | Status |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| current-eval-tsla-RSI-conf | PASS | 1966 | PASS | PASS | PASS | PASS | PASS | done |
| current-eval-tsla-EMASMACrossover-conf | PASS | 22543 | PASS | PASS | PASS | PASS | PASS | done |

Finished dossier summary:

| Strategy | Lab Verdict | Sample | Best Net P&L | Total Net P&L | Win Rate | Required Next Action |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| RSI | REBUILD_CANDIDATE | 1966/100 trades | 7.05 USD | -2304.37 USD | 30.3% | Rebuild entries/exits one variable class at a time and regenerate dossier. |
| EMASMACrossover | KILL_CANDIDATE | 22543/100 trades | -3052.70 USD | -40634.91 USD | 49.0% | Bench or rebuild; do not activate without a new dossier. |

## Dress Rehearsal Data Parity

Campaign file:

```text
/opt/ogzprime/OGZPMLV2/tuning/alpaca-tsla-15m-2y.json
```

Live source:

```text
Alpaca IEX, raw adjustment, /v2/stocks/{symbol}/bars and wss://stream.data.alpaca.markets/v2/iex
```

| Check | Result |
| --- | --- |
| Provenance | PASS |
| Same-window diff | PASS |
| June 2026 bars | 625 campaign bars, 625 reference bars, 625 matched bars |
| Close delta | p50 0 bps, p95 0 bps, max 0 bps |
| Volume ratio | p50 1.0, p95 1.0, max 1.0 |
| Missing bars | 0 missing in campaign, 0 missing in reference |
| Ground-truth live fills | 11 July 1-2 TSLA journal fills checked; all sampled prices inside campaign candle high/low range |

## Full Campaign Data Parity

Command:

```bash
node tools/weekend-campaign-gauntlet.js parity --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json --live-reference=alpaca
```

| Symbol | Status | Same-Window Candle Diff | Ground-Truth Check | Notes |
| --- | --- | --- | --- | --- |
| TSLA | PASS | PASS | PASS | Full green. |
| NVDA | PASS | PASS | PASS | Full green. |
| MARA | PASS | PASS | PASS | Full green. |
| SPY | FAILED-DATA-PARITY | PASS, p95 close delta 0 bps, volume ratio p95 1.0 | FAIL | No live journal fill rows found in July 1-2 spot-check window. |
| QQQ | FAILED-DATA-PARITY | PASS, p95 close delta 0 bps, volume ratio p95 1.0 | FAIL | No live journal fill rows found in July 1-2 spot-check window. |
| RIOT | FAILED-DATA-PARITY | PASS, p95 close delta 0 bps, volume ratio p95 1.0 | FAIL | No live journal fill rows found in July 1-2 spot-check window. |
| COIN | FAILED-DATA-PARITY | PASS, p95 close delta 0 bps, volume ratio p95 1.0 | FAIL | One live fill at 154.80 USD was outside campaign candle range 154.905-156.59 USD. |

Manifest outcome:

```text
96 planned rows PASS
128 planned rows FAILED-DATA-PARITY
```

## Hold Reasons

1. Full campaign data parity is not green. SPY, QQQ, RIOT, and COIN have `FAILED-DATA-PARITY` stamps.
2. COIN has a concrete ground-truth mismatch: one live fill is outside the corresponding campaign candle high/low range.
3. SPY, QQQ, and RIOT lack live July 1-2 fill rows for the required ground-truth spot check.

Because the conditional GO says any non-green item means HOLD, the campaign was not launched.

## Current Runtime Posture

| Process | Status | PID |
| --- | --- | ---: |
| ogz-prime-v2 | stopped | 0 |
| ogz-websocket | online | 3257481 |
| ogz-stripe | online | 2878051 |

No PM2 restart was run.
