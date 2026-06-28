# 2026-06-29 Monday Open Smoke Test

Created: 2026-06-28T07:33:36Z

Purpose: make the first Monday stock-market session after the dashboard/runtime fixes an observation run, not a discovery run. This checklist separates committed code, PM2 runtime env, broker/account truth, local state, WebSocket data flow, and dashboard display truth.

## Scope

- Target session: Monday 2026-06-29 regular market open, 09:30 ET.
- Trading lane: stocks eval lane only unless Trey explicitly changes scope.
- Dashboard lane: public `unified-dashboard-v2.html` plus authenticated WebSocket flow.
- No PM2 restart is authorized by this file. Restart/update-env still requires explicit Trey approval at runtime.
- No secrets, dashboard tokens, webhook URLs, broker keys, or raw `/proc/<pid>/environ` dumps belong in this artifact.

## Pre-Open Required Truths

Complete these before market open. If any required truth is missing, call the run not-ready instead of guessing.

1. Branch and code posture
   - Record `git branch --show-current`.
   - Record `git log --oneline -5`.
   - Record `git status --short --branch --untracked-files=no`.
   - Confirm any dashboard/runtime commits expected for the run are either adopted by PM2 or explicitly marked committed-only.

2. PM2 process posture
   - Record `pm2 describe ogz-prime-v2`.
   - Record `pm2 describe ogz-websocket`.
   - Confirm whether `ogz-prime-v2` is online, stopped, or stale relative to the commit under test.
   - Do not restart from this checklist unless Trey approves the exact restart/update-env action.

3. Eval posture gate
   - Run `node ogz-meta/gates/eval-live-posture-gate.js --pm2 ogz-prime-v2`.
   - Preserve the generated JSON/report path under `ogz-meta/cognition-history/live-eval/` if the command prints one.
   - Required result for eval-ready: `PASS`.
   - If the gate fails, record the failed keys without printing secrets.

4. TTP day-bound values
   - Confirm `TTP_ACCOUNT_START_OF_DAY_DATE=2026-06-29` in the running PM2 env through the eval posture gate or a redacted process-env inspection.
   - Confirm `TTP_EARNINGS_STATUS_JSON.date=2026-06-29`.
   - Confirm the earnings entry for the active stock symbol is current for 2026-06-29.
   - Confirm `TTP_ACCOUNT_START_OF_DAY_EQUITY` is the real account start equity for the day, not a reused historical value.

5. Broker/account state
   - Confirm the external broker/eval account state is known before open.
   - Confirm local active-trade state matches the broker or is intentionally reconciled before live decisions.
   - If local state and broker state disagree, stop before market open and preserve both snapshots.

6. Static dashboard-token containment
   - Run `npm run scan:secrets`.
   - Run `npm run test:dashboard-token`.
   - Confirm public dashboard HTML does not contain a long-lived WebSocket token.

7. Focused dashboard/runtime tests
   - Run focused tests for the current dashboard slice:
     - `npx jest test/bot-state-frame.test.js test/dashboard-bot-state-contract.test.js test/frontend-websocket-lifecycle.test.js --runInBand`
   - If chart or module fixes changed after this checklist, add their focused tests to the same evidence block.

## Market-Open Smoke Window

Start this capture shortly before 09:30 ET and keep it running through at least one complete 15m candle boundary.

1. Runtime logs
   - Capture `pm2 logs ogz-prime-v2`.
   - Capture `pm2 logs ogz-websocket`.
   - Required evidence:
     - process online or intentionally stopped
     - no crash loop
     - no missing-token failure
     - no eval-gate fatal after open
     - no state/broker mismatch hidden behind a warning-only path

2. WebSocket frame flow
   - Connect to `/ws` with the real authenticated dashboard flow.
   - Required frames when active:
     - `auth_success` with connection identity
     - `bot_state`
     - `historical_candles` for the selected asset/timeframe
     - `price` or `ticker_price` for active market data
     - `state_update` when runtime state changes
     - `journal_snapshot` when journal state changes
   - Expected idle behavior:
     - If eval is intentionally dormant, `bot_state` must explain the dormancy reason.
     - Do not treat missing `bot_thinking`, `narrator_event`, `pattern_analysis`, or `trade` as a bug unless the strategy cycle is supposed to be active.

3. Dashboard visual truth
   - Open `https://www.ogzprime.com/unified-dashboard-v2.html` with the operator dashboard token in the fragment.
   - Confirm the header bot-state banner matches runtime posture.
   - Confirm chart asset and Empire scope match the explicit user-selected asset, not the last incoming multi-pair ticker.
   - Confirm chart loads real candles and does not display stock labels over crypto data.
   - Confirm placeholders are honest empty/loading states, not fake values.
   - Confirm TradeLog and RiskGauge are mounted, or record their placeholders as blockers if they regress.

4. Money reconciliation
   - Record header equity.
   - Record Live Report starting balance/deposit label.
   - Record realized P&L.
   - Record Equity Curve current balance and total P&L.
   - Required invariant: current equity must reconcile to starting balance plus realized/unrealized P&L within rounding and fees.
   - If panels disagree, record the values and stop calling dashboard money display clean.

5. TTP cutoff and blocking posture
   - Confirm no new entries are accepted after the configured TTP cutoff.
   - Keep entry blocking separate from flattening/liquidation behavior in notes.
   - Missing, stale, malformed, disabled, or provider-error earnings-calendar data must quarantine its own lane and report loudly; it must not block bot startup.

## Stop Conditions

Stop the run and preserve evidence if any of these happen:

- Eval posture gate fails against the running PM2 process.
- PM2 runtime is stale relative to the intended commit and Trey has not approved a restart.
- Broker account state and local active-trade state disagree.
- Dashboard token containment fails.
- WebSocket authenticates but does not emit truthful `bot_state`.
- Dashboard shows fake values, crypto data under stock labels, or mismatched asset scope.
- TTP day-bound env values are stale for 2026-06-29.
- A shutdown/quarantine mechanism blocks the bot without a visible runtime reason.

## Evidence To Save

Use repo-rooted evidence paths so future agents, Mercury, and grep can find them.

- `ogz-meta/cognition-history/live-eval/2026-06-29T<time>-monday-open-pm2.txt`
- `ogz-meta/cognition-history/live-eval/2026-06-29T<time>-monday-open-posture-gate.json`
- `ogz-meta/cognition-history/live-eval/2026-06-29T<time>-monday-open-dashboard-ws.jsonl`
- `ogz-meta/cognition-history/live-eval/2026-06-29T<time>-monday-open-dashboard-screenshot-notes.md`
- `ogz-meta/cognition-history/live-eval/2026-06-29T<time>-monday-open-money-reconciliation.md`

## Pass Definition

The smoke test passes only when:

- PM2 runtime posture is explicitly known.
- Eval posture gate passes against the running process.
- TTP day-bound values are current for 2026-06-29.
- Broker/account state is reconciled before live decisions.
- `/ws` authenticates and emits truthful data frames.
- Dashboard visual state matches the runtime, asset, broker, and account truth.
- Money panels reconcile without label lies.
- No stop condition fires through the first complete 15m candle boundary after market open.
