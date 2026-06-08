# Session 2026-06-08 - PM2 Eval Live Runtime Env

**Branch:** `codex/multi-runtime-scope-build`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Recorded at:** `2026-06-08T18:18:00Z`
**Session status:** PM2 eval-live runtime env code slice committed and pushed. Running PM2 process was not restarted.

## Scope

This session addressed the remaining committed-config blocker after the eval readiness gate was upgraded to check persisted StateManager exposure and Alpaca broker exposure.

Before this slice, `ecosystem.config.js` still described `ogz-prime-v2` as the old crypto/Kraken paper posture. That meant the committed PM2 config could not satisfy `node ogz-meta/gates/multi-runtime-gate-runner.js --eval --pm2 ogz-prime-v2` without manual env drift.

## Root Cause

The eval gate expected a live Alpaca/TSLA/SignalStack/TTP posture, but the committed PM2 default env still encoded:

- `EXECUTION_MODE=paper`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `BROKER=kraken`
- `ASSET_CLASS=crypto`
- `TRADING_PAIR=BTC-USD`
- no explicit `STATE_FILE`
- missing TTP rule env
- missing operator-owned Alpaca and SignalStack values

An initial attempt added a separate PM2 `env_eval_live` profile. Mercury correctly flagged that as a drift surface because PM2 would only use it with `--env eval_live`; a plain restart could silently keep the old default env.

## Fix

Commit:

```text
76d9ee8 Fixed PM2 eval live runtime env
```

The committed `ogz-prime-v2.env` is now the eval-live posture by default:

- Alpaca stocks / TSLA / 15m
- `EXECUTION_MODE=live`
- `PAPER_TRADING=false`
- `LIVE_TRADING=true`
- `CONFIRM_LIVE_TRADING=true`
- `STATE_FILE=data/state.json`
- `SESSION_ROUTER_ENABLED=false`
- `ENABLE_TRAI=false`
- risk bypasses false
- current risk limits explicit
- current sizing/exit tunables explicit
- webhook orders enabled and dry-run false
- TTP rule toggles explicit

Operator-owned values are read from the host environment at PM2 start and are not committed:

- `ALPACA_MODE`
- `ALPACA_API_KEY`
- `ALPACA_API_SECRET`
- `SIGNALSTACK_WEBHOOK_URL`
- `TTP_ACCOUNT_START_OF_DAY_DATE`
- `TTP_ACCOUNT_START_OF_DAY_EQUITY`
- `TTP_DAILY_LOSS_LIMIT_DOLLARS`
- `TTP_MAX_LOSS_THRESHOLD_EQUITY`
- `TTP_EARNINGS_STATUS_JSON`
- `TTP_PROFIT_TARGET_DOLLARS`
- `INITIAL_BALANCE`

If those host values are missing, the eval/live startup posture is expected to fail closed rather than fall back to guesses.

## Files Committed

| File | Action |
|------|--------|
| `ecosystem.config.js` | Changed `ogz-prime-v2.env` default to eval-live posture and host-env operator values |
| `test/ecosystem-eval-profile.test.js` | Added regression that default PM2 env has no `env_eval_live` shadow surface and passes the eval posture gate with supplied operator values |
| `CHANGELOG.md` | Added PM2 eval-live runtime env entry |

## Verification

| Check | Result |
|------|--------|
| `node --check ecosystem.config.js` | PASS |
| `npx jest test/ecosystem-eval-profile.test.js test/eval-live-posture-gate.test.js test/multi-runtime-gate-runner-eval-pm2.test.js --runInBand` | PASS, 3 suites / 31 tests |
| Direct `validateEvalLivePosture(app.env, { loadDotenv: false })` against committed PM2 env with supplied operator values | PASS |
| `npm run scan:secrets` | PASS, tracked files scanned=1218 |
| `git diff --cached --check` | PASS |
| Mercury initial attack | Found real drift in separate `env_eval_live` design |
| Mercury recheck | Accepted corrected default-env design |
| `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` | PASS |

P0 emitted existing zero-fee paper-mode warnings and a RiskManager consecutive-loss alert, then passed.

## Mercury Evidence

```text
ogz-meta/cognition-history/mercury/pm2-eval-live-profile-2026-06-08.md
ogz-meta/cognition-history/mercury/pm2-eval-live-profile-2026-06-08.response.md
ogz-meta/cognition-history/mercury/pm2-eval-live-profile-recheck-2026-06-08.md
ogz-meta/cognition-history/mercury/pm2-eval-live-profile-recheck-2026-06-08.response.md
```

## Runtime PM2 Status

No PM2 restart was performed.

Read-only eval gate after the pushed commit still failed against the running `ogz-prime-v2` process:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --eval --pm2 ogz-prime-v2
```

Evidence:

```text
ogz-meta/cognition-history/live-eval/pm2-eval-runtime-env-2026-06-08/pm2-eval-gate-post-76d9ee8.log
```

Current running PM2 blockers observed:

- `WEBHOOK_DRY_RUN=true`
- TTP rule env missing
- RiskManager env keys missing from the running nested PM2 env
- explicit `STATE_FILE` missing
- `ALPACA_API_KEY` missing from the running nested PM2 env
- persisted StateManager has one local TSLA active trade:
  - `SIM_1780929000199_git61m`
  - `symbol=TSLA`
  - `brokerId=alpaca`
  - `side=long`
  - `status=open`

Read-only `data/state.json` snapshot after the gate:

```text
position=709.2776854717464
inPosition=709.2776854717464
activeTradeCount=1
isTrading=true
```

This is an operational adoption blocker. The committed code/config is pushed, but the running process has not adopted it.

## Remaining Open Items

1. Do not restart or stop PM2 until Trey explicitly approves the runtime adoption step.
2. Before any eval flip, the local active TSLA trade must be closed, reconciled, or otherwise handled with explicit operator approval.
3. Before restart/adoption, the host environment must provide the operator-owned Alpaca, SignalStack, TTP day/account, earnings, profit target, and initial balance values.
4. After approved restart with updated env, rerun:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --eval --pm2 ogz-prime-v2
```

5. The eval gate must pass with flat local state and flat broker exposure before eval activation is considered ready.

## Notes

This slice deliberately does not commit secrets, `.env` changes, raw Mercury logs, PM2 runtime snapshots, or live state. Raw evidence remains untracked under repo-scoped cognition history.
