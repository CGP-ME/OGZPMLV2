# Session 2026-06-08 - Risk Manager Profile Config Ownership

**Branch:** `codex/multi-runtime-scope-build`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Recorded at:** `2026-06-08T13:33:27Z`
**Last commit before this slice:** `b7469cb` (`Added Mercury regex grep tool`)
**Session status:** RiskManager/profile-config slice verified and staged for commit. Runtime PM2 restart was not performed in this session.

## Scope

This session addressed the disabled/stale RiskManager boundary by tying risk limits into explicit profile/env-owned config and preventing default-sourced or untrusted objects from reaching the RiskManager trade path.

The prop-firm-eval-aligned limits used for now are:

- `MAX_DRAWDOWN=5`
- `MAX_DAILY_LOSS=1`
- `MAX_WEEKLY_LOSS=5`
- `MAX_MONTHLY_LOSS=5`

Those values were wired into hot-swappable profiles, PM2 env, and backtest worker env. They are treated as current config values, not permanent strategy truth.

## Root Cause

RiskManager limits previously sat across multiple config surfaces:

- `ConfigLoader` had risk values but could produce default-sourced values.
- `TradingConfig` still had legacy risk defaults and profile override machinery.
- `RiskManager`, `DrawdownTracker`, and `PnLTracker` accepted constructor objects directly.
- Backtest worker/profile env did not consistently carry the risk limit values as first-class profile tunables.

That left two dangerous mechanisms:

1. A caller could pass a plain numeric object into `RiskManager` and bypass source validation.
2. A default-sourced risk value could look acceptable in audit/reporting paths even though the runtime should fail closed.

## What Was Done This Session

### 1. RiskManager now requires source-aware config

**Symptom:** RiskManager could be constructed with a plain object that only looked numerically valid.

**Root cause:** `RiskManager` validated field shape but not config provenance.

**Fix:** Added `core/RiskManagerConfig.js` to map `ConfigLoader` risk fields into RiskManager constructor keys, require explicit non-default sources, require whole-percent unit values, and stamp the result with a private brand. `RiskManager` now rejects unbranded config objects before trackers are constructed.

### 2. Risk limits are profile/env-owned

**Symptom:** Prop-firm risk limits were not consistently part of the profile surface.

**Root cause:** Profiles and backtest worker env carried sizing/exits but did not carry the four RiskManager limit keys as startup-owned tunables.

**Fix:** Added `MAX_DRAWDOWN`, `MAX_DAILY_LOSS`, `MAX_WEEKLY_LOSS`, and `MAX_MONTHLY_LOSS` to:

- `profiles/production.env`
- `profiles/paper.env`
- `profiles/backtest-all.env`
- `profiles/backtest-rsi.env`
- `profiles/backtest-masr.env`
- `ecosystem.config.js`
- `core/TradingConfig.js` tuning profiles and canonical backtest worker env
- `tools/backtest-worker-env.js` allowlist and summary

Risk limit profile keys are now startup-snapshot keys. Runtime profile apply rejects them outside `phase: 'startup'` so a hot-swap cannot claim it mutated already-constructed RiskManager state.

### 3. ConfigLoader/audit now surfaces default-sourced risk

**Symptom:** `ConfigLoader` could label risk values as `default`, and audit output could show defaults without making the risk violation prominent.

**Root cause:** The audit tool reported resolved values but did not return a risk-specific violation list.

**Fix:** `ConfigLoader` now validates that required RiskManager paths have explicit sources. `tools/config-audit.js` exposes `riskConfigViolations`, prints them, returns them in audit data, and exits non-zero from CLI when those violations are present.

### 4. Weekly/monthly gates are observable

**Symptom:** Risk telemetry used daily labels for non-daily limits.

**Root cause:** RiskManager had weekly/monthly breach checks but reused daily gate labels.

**Fix:** Weekly and monthly gates now use `weekly_loss_limit` and `monthly_loss_limit`, with matching entries added to `ogz-meta/specs/decision-ledger-schema.json`.

## Smoke Test Results

| Check | Result | Evidence |
|------|--------|----------|
| Syntax checks for changed runtime/tools/tests | PASS | `node --check` on RiskManagerConfig, RiskManager, DrawdownTracker, PnLTracker, TradingConfig, ConfigLoader, backtest worker env, config audit, run-empire |
| Focused Jest suite | PASS | 9 suites, 111 tests |
| Direct profile/config probes | PASS | Paper profile loads risk limits with explicit dotenv sources; default-sourced risk path throws |
| Sibling scan | PASS | Only production `new RiskManager(...)` call is `run-empire-v2.js` using `buildRiskManagerConfig(...)` |
| Mercury attack | PASS after fix/recheck | `ogz-meta/cognition-history/mercury/risk-manager-config-ownership-2026-06-08.response.md`; recheck at `risk-manager-config-ownership-recheck-2026-06-08.response.md` |
| P0 gate | PASS | `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`, output captured at `ogz-meta/cognition-history/live-eval/risk-manager-config-ownership-2026-06-08/p0.log` |

Focused Jest command:

```text
npx jest test/risk-manager-config.test.js test/config-loader-live-guard.test.js test/config-loader-no-process-env-mutation.test.js test/config-audit-no-env-mutation.test.js test/eval-live-posture-gate.test.js test/backtest-worker-env.test.js test/anchor-runner-env.test.js test/trading-config-profile.test.js test/trading-loop-trace-spine.test.js --runInBand
```

Result:

```text
Test Suites: 9 passed, 9 total
Tests:       111 passed, 111 total
```

P0 output:

```text
Running p0.single_lane.tsla_ema_anchor...
PASS
```

## Files Touched

| File | Action |
|------|--------|
| `core/RiskManagerConfig.js` | Added source-aware, branded RiskManager config adapter |
| `core/RiskManager.js` | Requires branded RiskManager config; uses configured thresholds/labels |
| `core/DrawdownTracker.js` | Removed silent drawdown default; requires explicit percent |
| `core/PnLTracker.js` | Removed silent daily/weekly/monthly defaults; requires explicit percents |
| `run-empire-v2.js` | Constructs RiskManager from `resolvedConfig.config.risk` plus `resolvedConfig.sources` |
| `foundation/ConfigLoader.js` | Added weekly/monthly risk fields and required explicit risk source validation |
| `core/TradingConfig.js` | Added risk keys to profile mappings, startup-snapshot keys, worker env defaults, and tuning profiles |
| `tools/backtest-worker-env.js` | Allows and summarizes risk limit env keys |
| `tools/config-audit.js` | Reports risk config violations and CLI-fails on them |
| `ecosystem.config.js` | Added prop-firm-eval risk limit env values |
| `profiles/*.env` | Added explicit RiskManager bypass and risk limit values |
| `ogz-meta/specs/decision-ledger-schema.json` | Added weekly/monthly risk gate enum values |
| `test/risk-manager-config.test.js` | Added RiskManager config ownership regressions |
| `test/*config/profile/env*.test.js` | Updated focused profile/env/audit tests for explicit risk keys |
| `CHANGELOG.md` | Added risk-manager profile config ownership entry |

## Git Log

Pending commit for this session:

```text
Fixed RiskManager profile config ownership
```

Last commit before this session slice:

```text
b7469cb Added Mercury regex grep tool
```

## Half-Cooked Items Status

| Item | Status | Disposition |
|------|--------|-------------|
| RiskManager disabled/stale config boundary | Closed for this slice | RiskManager now requires source-aware branded config |
| Prop-firm-eval risk numbers | Wired for now | Values are profile/env-owned and can be changed through profiles |
| Hot-swap of RiskManager limits at runtime | Blocked intentionally | Risk limit keys are startup-snapshot keys; runtime apply rejects them |
| Local `.env` missing weekly/monthly keys | Not edited | Direct local runs must add explicit keys or use a profile; this fail-closed behavior is intentional |
| `TradingConfig` legacy risk defaults | Not removed in this slice | No current RiskManager production consumer after this change; queue for config-consolidation cleanup |
| Risk alert percent display | Open | `_checkRiskAlerts()` still treats daily PnL dollars as percent in alert text; fix as next atomic risk-reporting item |
| Runtime PM2 adoption | Not done | PM2 config changed in repo, but processes were not restarted in this session |

## Open Items For Next Session

1. Fix RiskManager alert reporting so daily loss alerts compute percent from period state instead of printing PnL dollars as percent.
2. Continue config consolidation by removing or quarantining dead/legacy `TradingConfig` risk defaults once every remaining consumer is proven migrated.
3. Before eval flip, confirm the running PM2 env includes the new risk keys and restart only with explicit operator approval.
4. Run profile swap/run/profile swap proof for a non-trading runtime boundary when the next profile-swap slice is opened.
5. Keep `RISK_MANAGER_BYPASS=true` confined to backtest profiles/worker env unless a specific test intentionally needs bypass; production and paper profiles are risk-on.

## Context For Next Session

RiskManager config ownership is now guarded at the constructor boundary and tied into profiles. If risk env keys are missing or default-sourced, the system should fail closed before RiskManager trade-path use. The next risk slice should not rework this adapter; it should fix the remaining reporting defect in `_checkRiskAlerts()` and then continue config cleanup by removing legacy risk defaults only after a consumer scan proves they are dead.

The current staged code passed focused tests, Mercury attack/recheck, and P0. Raw Mercury and P0 artifacts were left as repo-scoped untracked evidence paths and were not staged in the commit.

## Recorder Pipeline Disposition

| Step | Disposition |
|------|-------------|
| Changelog | Updated with a path-limited staged hunk for this risk-manager slice |
| Session form | Written as this append-only document |
| fixes.jsonl | Not updated |
| RAG reindex | Not run |
| Mercury | Run once, fixed findings, then rechecked |
| P0 | Run and passed |
| Commit | Pending after this form is staged |
| Push | Pending after commit |
