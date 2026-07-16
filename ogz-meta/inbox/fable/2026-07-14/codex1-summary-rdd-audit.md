# Codex1 Summary: Risk Authority Consolidation Audit

Date: 2026-07-14
Branch: codex/multi-asset-symbol-state
Stage: R-DD Stage 1 only
Code changes: none

## Mission Boundary

Trey law for this lane: `RiskManager` becomes the only seat of halt/veto power in the bot. Everything else emits opinions unless Trey ratifies it as ordered authority.

This report inventories scoring, labeling, recommending, and refusing paths in:

- `core/RiskManager.js`
- `core/PnLTracker.js`
- `core/RiskManagerConfig.js`

Adjacent authority found during consumer tracing is listed separately because it can still alter exits or startup posture.

## Mandatory Attack Mechanism

Per Trey, every attack on this lane runs the full two-tier bridge:

1. Mercury prosecutes the change or finding.
2. Fable review tier grades Mercury's citations and challenges unsupported claims.
3. Toolfail never means review-skipped-and-accepted; toolfail means rerun or mark degraded.
4. Mercury/Fable disagreements are findings and must be reported verbatim, not resolved by either tier alone.

## Bootstrap / Current State

- Repo root verified: `/opt/ogzprime/OGZPMLV2`
- Branch verified: `codex/multi-asset-symbol-state`
- Latest commit at audit start: `a476afbe Fixed MTF private aggregation removal kill site 3`
- Tracked dirty files before this audit:
  - `run-empire-v2.js`
  - `test/aggregate-source-backfill.test.js`
- Stashes present:
  - `stash@{0}: deploy-blockers-pre-trai-restart-2026-06-29`
  - older stashes on prior branches
- Current executable P0 source:
  - `ogz-meta/gates/multi-runtime-gate-runner.js:18-22`
  - expected `8338.146639366509 / 1551 trades / 52.2% WR / PF 0.64`

No PM2 restart, no code edits, no tests, no Mercury run in Stage 1.

## Blame Map

| Short SHA | Author | Date UTC | Summary |
|---|---|---:|---|
| `c3e94a58` | CGP-ME | 2025-12-03 15:07:29 | Initial commit: OGZPrime ML V2 - Empire Architecture |
| `48fefcfd` | CGP-ME | 2025-12-15 08:53:54 | fix: CRITICAL - Multiple amnesia bugs preventing sells |
| `b1b3f9d6` | CGP-ME | 2026-03-02 20:33:11 | refactor(phase8): Extract DrawdownTracker + PnLTracker from RiskManager |
| `94079525` | CGP-ME | 2026-03-18 00:09:00 | refactor(config): Migrate RiskManager to ConfigLoader injection |
| `a719edbc` | CGP-ME | 2026-04-22 21:27:58 | feat(l5): wire riskGates observability into decision ledger |
| `a595a710` | CGP-ME | 2026-05-07 03:45:48 | fix(risk-manager): RISK-HIGH-01 - reject trades with non-finite confidence |
| `558c1ae4` | CGP-ME | 2026-05-07 07:59:50 | fix(drawdown-tracker): RISK-MED-01 - warn + return null when uninitialized |
| `437461cf` | CGP-ME | 2026-06-08 13:35:54 | Fixed RiskManager profile config ownership |
| `fc097e5d` | CGP-ME | 2026-06-08 13:42:35 | Fixed RiskManager daily loss alert percent |

## Consumption Chain

| Producer | Consumer | Effect |
|---|---|---|
| `buildRiskManagerConfig(...)` | `run-empire-v2.js:640-643` | Constructs the only runtime `RiskManager` instance from `resolvedConfig.config.risk` and `resolvedConfig.sources`. |
| `RiskManager.initializeBalance(balance)` | `run-empire-v2.js:1228-1233` | Seeds drawdown and PnL period anchors from `StateManager` balance. |
| `RiskManager.isTradingAllowed()` | `core/TradingLoop.js:1825-1836` | If `allowed=false`, returns `HOLD` with `blockReason` and `riskGates`; this is a direct entry refusal. |
| `RiskManager.assessTradeRisk(...)` | `core/TradingLoop.js:1838-1854` | If `approved=false`, returns `HOLD` with `blockReason` and `riskGates`; this is a direct entry refusal. |
| `riskAssessment.riskLevel/recommendation` | `core/TradingLoop.js:1856-1867` | Logged and passed into decision result; no size mutation found in the touched consumer path. |
| `RiskManager.recordTradeResult(...)` | `core/OrderExecutor.js:3875-3882`, `4436-4443` | Long/short close paths feed realized PnL dollars into risk state when finite. Missing finite PnL logs warning and skips. |
| `riskGates` | `core/TradingLoop.js:723-755`, `1565-1575`, `1684-1766`; `core/StateManager.js:975`; journal/recorder paths | Entry refusal and pass/fail labels propagate into gate events and ledgers. |

## Disposition Table

| Path | What It Does | Blame | Output / Consumer | Scope | Disposition to Trey |
|---|---|---|---|---|---|
| `core/RiskManagerConfig.js:5-16` | Refuses missing/non-object risk config and default/missing sources. | `437461cf`, 2026-06-08 | Constructor path via `run-empire-v2.js:640-643`. | Startup config validation. | keep-as-ordered. It protects canonical config ownership; Stage 2 should rename/reshape keys, not remove source validation. |
| `core/RiskManagerConfig.js:18-25` | Requires max drawdown and daily/weekly/monthly loss limits as whole-percent values 1-100. | `437461cf`, 2026-06-08 | Feeds `RiskManager` and both trackers. | Config validation for old percent-only model. | absorb-into-guard. Stage 2 needs profile-owned generic `dailyLossLimit`, `trailingDrawdown`, `consecutiveStopHalt`, including `off`; whole-percent-only validation is too narrow. |
| `core/RiskManagerConfig.js:27-34` | Requires boolean risk flags. | `437461cf`, 2026-06-08 | Feeds `riskManagerBypass`. | Config validation. | absorb-into-guard. Keep explicit booleans for named guard off/profile switches, but kill generic bypass semantics. |
| `core/RiskManagerConfig.js:36-62` | Maps `risk.maxDrawdown`, `risk.maxDailyLoss`, `risk.maxWeeklyLoss`, `risk.maxMonthlyLoss`, `risk.riskManagerBypass` into a branded frozen config. | `437461cf`, 2026-06-08 | `RiskManager` constructor. | Config ownership. | absorb-into-guard. Rebuild this as the single RiskManager guard config builder. |
| `core/RiskManager.js:20-26` | Local boolean config assertion. | `437461cf`, 2026-06-08 plus older constructor context | Constructor. | Config validation. | absorb-into-guard. Keep only if the new guard still needs local branded config checks; otherwise let `RiskManagerConfig` own validation. |
| `core/RiskManager.js:29-57` | Accepts only branded config, stores risk thresholds, hidden recovery/default alert values, composes `DrawdownTracker` and `PnLTracker`. | `c3e94a58`, `b1b3f9d6`, `437461cf` | Runtime `RiskManager`. | State owner / authority seat. | absorb-into-guard. Keep RiskManager as the seat, but remove hidden defaults for recovery/alerts or convert to profile-owned explicit values. |
| `core/RiskManager.js:63-67` | Initializes drawdown and PnL anchors from balance. | `b1b3f9d6` | Called by `run-empire-v2.js:1233`. | Guard state anchor. | absorb-into-guard. Stage 2 should define starting balance as bot-owned session truth, then derive from confirmed fills. |
| `core/RiskManager.js:73-89` | Records a completed trade, updates PnL periods, updates drawdown balance, checks recovery mode, emits alerts. | `b1b3f9d6` plus initial code | Called by `OrderExecutor` long/short close paths. | Guard state mutation. | absorb-into-guard. This is the right producer class for self-sovereign guard input, but must be execution-confirmed fill records, not loose `{success,pnl}`. |
| `core/RiskManager.js:95-97` | Directly sets drawdown balance from external sync. | `b1b3f9d6` plus initial code | No current non-test consumer found by `rg` except the test suite. | External state mutation door. | kill unless Trey ratifies as reconciliation-only. Self-sovereign guard should not let external balance rewrite authority state. |
| `core/RiskManager.js:113-114`, `218-219` | `riskManagerBypass` returns approved/allowed true. | `94079525`, 2026-03-18 | Bypasses both TradingLoop risk calls. | Entry refusal bypass. | kill as a generic bypass. Replace with explicit profile guard mode/off for P0/backtests if Trey wants guard off there. |
| `core/RiskManager.js:115-128` | Refuses non-finite confidence before risk scoring. | `a595a710`, 2026-05-07 | `TradingLoop` returns `HOLD`. | Input-integrity refusal. | keep-as-ordered pending Trey. This is in the approved RiskManager seat and prevents phantom-confidence trades; it is not drawdown-specific. |
| `core/RiskManager.js:133-145`, `221-227` | Max drawdown circuit blocks entries when `DrawdownTracker` says exceeded. | `b1b3f9d6`, `a719edbc`, `437461cf` | `TradingLoop` returns `HOLD`. | Account halt / entry block. | absorb-into-guard. This is the correct authority class, but Stage 2 should compute trailing drawdown from bot-owned confirmed fills and configured generic limits. |
| `core/RiskManager.js:147-162`, `229-240` | Daily/weekly/monthly loss breach blocks entries. | `b1b3f9d6`, `a719edbc`, `437461cf` | `TradingLoop` returns `HOLD`. | Entry block. | absorb daily into guard; kill weekly/monthly unless Trey ratifies. Stage 2 spec names daily realized loss and trailing drawdown, not weekly/monthly legacy rails. |
| `core/RiskManager.js:164-179` | Recovery mode raises confidence threshold and can block entries. | `b1b3f9d6`, `a719edbc` | `TradingLoop` returns `HOLD`. | Entry block / behavior modifier. | kill unless Trey ratifies. This is not in the R-DD spec and is hidden behavior from drawdown state. |
| `core/RiskManager.js:181-204` | Computes riskScore, riskLevel, recommendation from confidence, consecutive losses, drawdown. | `c3e94a58`, `b1b3f9d6`, `a719edbc` | `TradingLoop.js:1856-1867` logs/passes `riskLevel`, `riskRecommendation`; no size mutation found. | Label/recommendation. | keep-as-opinion or kill. If retained, it must never refuse, size, or mutate state. Consecutive-loss scoring should not be the Fabio-K2 halt; build that separately. |
| `core/RiskManager.js:249-250` | Returns drawdown protection multiplier from `DrawdownTracker`. | `b1b3f9d6`; `558c1ae4` changed uninitialized behavior in dependency | No current non-test consumer found by `rg`. | Potential sizing modifier. | kill if unused; if consumed later, absorb into profile-owned sizing law, not risk halt authority. |
| `core/RiskManager.js:256-261` | Returns merged risk summary plus `tradingAllowed`. | `b1b3f9d6` | No direct current consumer found for `getRiskSummary`. | Reporting. | keep-as-report after guard rewrite. Must not become a second gate. |
| `core/RiskManager.js:268-271` | Resets risk state. | `b1b3f9d6` | No direct current consumer found by `rg`. | State reset. | absorb-into-guard; reset semantics need explicit session/day boundaries. |
| `core/RiskManager.js:283-303` | Emits drawdown and daily-loss alerts with 5-minute dedupe. | `b1b3f9d6`, `fc097e5d` | Console/log alert only. | Report/opinion. | keep-as-ordered after converting to Stage 2 alarm fields. Alerting is not halt authority. |
| `core/PnLTracker.js:13-31` | Validates old daily/weekly/monthly percent config and sets consecutive-loss alert default. | `b1b3f9d6`, `437461cf` | Constructed inside `RiskManager`. | Config validation / hidden alert default. | absorb-into-guard. Generic guard config must own explicit daily/trailing/streak limits; no hidden default. |
| `core/PnLTracker.js:33-46`, `48-59` | Creates daily/weekly/monthly state with start/current balance, PnL, counts, breachedLimit. | `b1b3f9d6` | Consumed by `recordTrade`, `getLimitBreaches`, `getState`. | Guard accounting state. | absorb-into-guard. Keep accounting, but daily boundary/session semantics must be explicit. |
| `core/PnLTracker.js:61-77`, `134-152` | Uses UTC date/week/month to reset period stats. | `b1b3f9d6` | Affects breach calculation. | Time boundary authority. | absorb-into-guard. Eval trading day/session boundaries are not necessarily raw UTC day/week/month. |
| `core/PnLTracker.js:83-90` | Initializes all period balances from one balance. | `b1b3f9d6` | Called through `RiskManager.initializeBalance`. | Guard anchor. | absorb-into-guard. Starting balance should be the bot-owned session anchor plus confirmed fills, with external ledgers reconciliation-only. |
| `core/PnLTracker.js:97-131` | Records trade result, tracks win/loss streak, emits consecutive loss alert, writes trade history. Invalid data logs error and returns empty alerts. | `b1b3f9d6` | `RiskManager.recordTradeResult`. | State mutation / alert source. | absorb-into-guard. Fabio-K2 consecutive-stop day halt belongs here conceptually, but invalid trade input must not be swallowed. |
| `core/PnLTracker.js:154-165`, `175-189` | Adds trade PnL to daily/weekly/monthly and flips `breachedLimit`. | `b1b3f9d6`, `fc097e5d` | `RiskManager.isTradingAllowed` and `assessTradeRisk`. | Entry block source. | absorb daily into guard; kill weekly/monthly unless Trey ratifies. |
| `core/PnLTracker.js:191-195` | Computes loss percent; returns `0` when stats missing or `startBalance <= 0`. | `fc097e5d`, 2026-06-08 | Feeds alerts, summaries, breach logic. | Silent guard-unreachable condition. | kill/rewrite producer. This is the exact stale/missing-anchor disease class: missing anchor can become zero loss. |
| `core/PnLTracker.js:202-207` | Recent win rate for recovery-mode exit. | `b1b3f9d6` | `RiskManager.recordTradeResult` -> `DrawdownTracker.checkRecoveryMode`. | Scoring input. | kill if recovery mode dies; otherwise opinion only. |
| `core/PnLTracker.js:213-219` | Returns daily/weekly/monthly breach booleans. | `b1b3f9d6` | `RiskManager.isTradingAllowed`, `assessTradeRisk`. | Entry block source. | absorb into new guard state. |
| `core/PnLTracker.js:224-237` | Returns streaks, win rate, period PnL, loss percents, breach flags. | `b1b3f9d6`, `fc097e5d` | Risk summary/alerts. | Reporting. | keep-as-report after guard rewrite; no independent authority. |
| `core/PnLTracker.js:244-254` | Resets stats and optionally reinitializes balance. | `b1b3f9d6` | No direct current consumer found by `rg` except `RiskManager.reset`. | State reset. | absorb-into-guard with explicit day/session reset semantics. |

## Dependency Authority Inside RiskManager

`DrawdownTracker` is not in the named file list, but `RiskManager` delegates max drawdown and recovery authority to it.

| Path | What It Does | Blame | Output / Consumer | Disposition to Trey |
|---|---|---|---|---|
| `core/DrawdownTracker.js:14-23` | Validates max drawdown percent and sets hidden recovery defaults. | `b1b3f9d6`, `437461cf` | Constructed by `RiskManager.js:50`. | absorb-into-guard; remove hidden recovery defaults or make explicit if retained. |
| `core/DrawdownTracker.js:41-49` | Refuses non-positive initial balance and seeds account/initial/peak balance. | `b1b3f9d6` | Called by `RiskManager.initializeBalance`. | absorb-into-guard. |
| `core/DrawdownTracker.js:56-72` | Adds trade PnL to account balance and recalculates peak/current drawdown. | `b1b3f9d6` | Called by `RiskManager.recordTradeResult`. | absorb-into-guard; this is close to Stage 2 trailing drawdown truth but needs fill-record provenance. |
| `core/DrawdownTracker.js:79-88` | Directly sets account balance from external source. | `b1b3f9d6` | Called by `RiskManager.updateBalance`; no non-test consumer found. | kill unless reconciliation-only and non-authoritative. |
| `core/DrawdownTracker.js:95-125` | Enters/exits recovery mode based on drawdown, wins, win rate, and elapsed time. | `b1b3f9d6` | Feeds `RiskManager` recovery min-confidence block. | kill unless Trey ratifies recovery behavior. |
| `core/DrawdownTracker.js:132-149` | Returns size multiplier 0.4-1.2, or null if uninitialized. | `b1b3f9d6`, `558c1ae4` | Exposed via `RiskManager.getPositionSizeMultiplier`; no current non-test consumer found. | kill if unused; keep only as opinion if reported. |
| `core/DrawdownTracker.js:156-158` | Boolean max drawdown exceeded. | `b1b3f9d6` | Direct source of `RiskManager` max drawdown entry block. | absorb-into-guard. |

## Adjacent Authority Found Outside RiskManager

These are not in the three named files but directly affect risk/exits and must be ruled so `RiskManager` can become the only halt/veto seat.

| Path | What It Does | Consumer / Effect | Disposition to Trey |
|---|---|---|---|
| `foundation/ConfigLoader.js:788-794` | Reads per-profile `riskManagerBypass`, `accountDrawdownBypass`, max drawdown, daily/weekly/monthly loss, account drawdown percent. | Feeds `RiskManagerConfig`; also feeds proof/runtime config. | absorb into Stage 2 generic risk profile shape. |
| `foundation/ConfigLoader.js:1078-1082` | Refuses live startup when account drawdown or risk manager bypass is true. | Startup validation. | keep-as-config-integrity if bypasses survive as profile guard-off flags; otherwise rewrite for new guard shape. |
| `config/trading.config.json:40-48`, `263-269` | Production/current-eval risk blocks; P0/backtest profiles set bypass true in some blocks. | Runtime profile source. | absorb into Stage 2 profile-owned generic limits. |
| `config/trading.config.json:1792-1797` | Root `universalLimits` hard stop, account drawdown percent, max hold, drawdown bypass. | `ExitContractManager`, `StopLossChecker`, `MaxHoldChecker`. | Trey ruling required. Account drawdown belongs in RiskManager guard. Hard stop and max hold are exit-policy authority, not entry halt; decide whether they stay under exit contracts or move under RiskManager. |
| `core/ExitContractManager.js:137-149` | Loads `universalLimits` and injects them into exit checkers. | Exit evaluation. | absorb account drawdown; classify hard stop/max hold separately. |
| `core/exit/StopLossChecker.js:34-42` | Universal hard stop exits any trade when PnL percent <= hard stop. | Exit trigger. | keep-as-exit-policy only if Trey ratifies; not a halt/veto seat, but it is global risk authority. |
| `core/exit/StopLossChecker.js:44-61` | Universal account drawdown exit based on `context.accountBalance` and `context.initialBalance`. | Exit trigger. | absorb into self-sovereign RiskManager drawdown guard; remove from independent universalLimits authority. |
| `core/exit/MaxHoldChecker.js:38-45` | Universal max hold exits any trade over global max minutes. | Exit trigger. | Trey ruling required: exit-policy universal or move to strategy contracts. |
| `core/TRAIDecisionModule.js:251-274`, `787-842`, `946-955` | TRAI has its own riskAssessment veto fields and risk-factor scoring. | TRAI decision recommendation/veto. | outside this mission scope, but violates the spirit if it can veto live entries. Must be a later audit or explicitly demoted to opinion. |

## Key Findings

1. `RiskManager` is already the only current entry refusal seat found in the direct trading loop for the named risk family: `TradingLoop` calls `isTradingAllowed()` and `assessTradeRisk()` and turns false into `HOLD`.
2. Current guard truth is not fully self-sovereign. It is anchored by `StateManager` balance at startup and closed-trade PnL callbacks, while `updateBalance()`/`setBalance()` remain a direct external mutation door.
3. The stale-anchor disease exists in current code: `PnLTracker._getLossPercent()` returns `0` when `startBalance <= 0`, which can make loss logic unreachable if anchoring fails.
4. `riskManagerBypass` is a generic bypass that can nullify the seat. It exists for backtest/profile behavior today, but it is still a bypass and must be replaced by an explicit guard-mode/off profile law if Trey wants P0 untouched.
5. Weekly/monthly loss blocks are legacy halt authority not named in Stage 2. They should be killed unless Trey explicitly re-ratifies them.
6. Recovery mode is hidden behavior authority: drawdown can silently raise min confidence and block entries. It is not in the Stage 2 spec.
7. `universalLimits.accountDrawdownPercent` is an independent drawdown exit authority outside `RiskManager`; this must be absorbed or killed for the one-seat law to be true.
8. `universalLimits.hardStopLossPercent` and `maxHoldTimeMinutes` are global exit policies. They are not entry vetoes, but they are risk authority and need a Trey ruling before Stage 2.
9. Consecutive losses currently only score/alert through `PnLTracker` and `RiskManager` riskScore/recovery inputs. The ordered Fabio-K2 consecutive-stop halt is not implemented here yet.

## Proposed Ratification Set

### Keep-as-ordered

- Branded config ownership and explicit source validation in `RiskManagerConfig`.
- Non-finite confidence refusal inside `RiskManager`, pending Trey ratification as input-integrity authority.
- Reporting-only risk summaries and alerts, after Stage 2 rewires them to the new guard state.

### Kill

- Generic `riskManagerBypass` as a bypass path. Replace with explicit profile guard mode/off, if required for P0/backtests.
- Recovery mode entry blocking and hidden confidence multiplier behavior.
- Direct external balance mutation authority (`RiskManager.updateBalance` / `DrawdownTracker.setBalance`) unless demoted to reconciliation-only.
- Weekly/monthly loss halts unless Trey explicitly keeps them.
- PnL missing-anchor-as-zero behavior.

### Absorb-into-guard

- Daily realized-loss halt.
- Max/trailing drawdown halt.
- PnL/streak accounting from execution-confirmed fills.
- Fabio-K2 consecutive-stop day-halt.
- Account drawdown authority currently split between `risk` and `universalLimits`.
- Any reportable external ledger comparison as reconciliation-only adapters.

## Stage 2 Build Notes For Trey Ruling

- New config should avoid counterparty names in core. Use generic profile-owned keys such as `dailyLossLimit`, `trailingDrawdown`, `consecutiveStopHalt`, and explicit `off`/disabled forms.
- External TTP/Apex/other ledgers should become reconciliation adapters only. Mismatch reports to Trey; zero guard authority.
- Guard calculations should be fed by execution-confirmed fill records, not raw balance sync or external anchor fields.
- If P0 must keep guard off, use an explicit profile guard mode/off state, not a broad bypass flag.
- If `universalLimits` hard stop and max hold are retained, document them as exit-policy authority separate from halt/veto, or move them under strategy exit contracts.

## Verification Performed

- Opened and line-cited:
  - `core/RiskManager.js`
  - `core/PnLTracker.js`
  - `core/RiskManagerConfig.js`
  - `core/DrawdownTracker.js`
  - `core/TradingLoop.js`
  - `core/OrderExecutor.js`
  - `run-empire-v2.js`
  - `foundation/ConfigLoader.js`
  - `core/ExitContractManager.js`
  - `core/exit/StopLossChecker.js`
  - `core/exit/MaxHoldChecker.js`
  - `config/trading.config.json`
  - `test/risk-manager-config.test.js`
- Ran `rg` consumer search for:
  - `isTradingAllowed`
  - `assessTradeRisk`
  - `recordTradeResult`
  - `getRiskSummary`
  - `getPositionSizeMultiplier`
  - `riskGates`
  - `universalLimits`
  - `riskManagerBypass`
  - `accountDrawdownBypass`
- Ran `git blame` on the key RiskManager, PnLTracker, RiskManagerConfig, and DrawdownTracker ranges.

## Not Done

- No code changes.
- No tests.
- No Mercury attack.
- No P0 run.
- No PM2 restart.
- No commit or push.

## Stage 1 Exit

Stage 1 is ready for Trey ruling. Stage 2 should not begin until Trey approves the disposition table and names which adjacent authority survives.
