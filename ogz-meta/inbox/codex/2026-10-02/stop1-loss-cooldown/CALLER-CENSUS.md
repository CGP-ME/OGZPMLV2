# Loss cooldown caller census

Coverage: 760 tracked code/config/UI/tool files searched; 109 matching lines in 7 files, all dispositioned below. Exact file denominator and matches: tracked-census.json. Additional untracked-visible searches: feature-census.txt and callers-census.txt. Search excludes historical ogz-meta/ogz-ledger and runtime data/logs; these are not runtime caller roots. This is a complete source census for this feature in that stated scope, not a claim about arbitrary external plugins or saved private state. No private state files were opened.

Source identity: SOURCE-IDENTITY.json and source/. Citations refer to the captured working source, not HEAD; inherited edits are present. Prior September 29 trace rechecked against these bytes. Seven matching files = three production owners plus four test consumers.

| Surface | Current source evidence | Disposition |
| --- | --- | --- |
| Configuration declaration | config/settings.json:1940; revision :3 | Remove entryLogic.symbolLossCooldown (enabled boolean, consecutiveLosses count, cooldownMinutes minutes); bump captured revision 6 to 7. Root must reconcile revision against any intervening settings delivery. |
| Canonical config publication | foundation/ConfigLoader.js:1306, :3347; settings receipts :2354, :2455; accepted writes :3046, :3091 | Generic entryLogic copying/accessor exposes declared object; no dedicated editable field, env alias or validator. Preserve loader and other entry settings. No remaining reader means an old user-supplied object cannot activate feature. |
| Configuration reads | core/StateManager.js:4037-4062 | Remove accessor, including direct per-key reads and generic get fallback. Existing fallback/null and swallowed config errors in that method disappear with it; no replacement defaults. |
| Initial state writers | core/StateManager.js:526, :631 | Remove symbolLossStreaks from constructor and explicit fresh-state updates. |
| Loss/streak/halt producer | core/StateManager.js:1666-1709, :4064-4115 | Only runtime producer found. Full close appends closedTradeRecord, computes streak from pnl, overwrites symbol halt after threshold, issues warning. Remove calculation/spread/private mutation-token selection and method; retain close accounting, ledger, position removal, lock and persistence. Partial reduction is separate (:1749 onward) and unchanged. |
| Authorized code and classifier | core/StateManager.js:110-135 | Remove only symbol_cooldown from eight-code set (seven remain), remove reason-prefix classifier. Unrelated authorized code plus cooldown-looking reason must survive. |
| Generic mutation normalization | core/StateManager.js:1023, :4117-4163 | Preserve authority token, collection shape/code/expiry validation; remove config-dependent filtering. Retired explicit code is now rejected by existing set membership. Missing-code legacy records were already invalid and remain invalid. |
| Runtime readers | core/StateManager.js:4165-4224 | Remove cooldown-config branch in _symbolHaltRecord. Keep expiry, isSymbolHalted, getSymbolHaltReason and getSymbolHaltCode. All enumerated production writers normalize before installation. Direct arbitrary mutation of manager.state is not a supported public producer. |
| Save/restore | core/StateManager.js:2481-2492, :4263-4331, :4375, :4417, :4458-4495, :4640-4652 | Spread snapshot preserves unknown properties, so delete legacy own streak key unconditionally, including null/empty/malformed values. Set correctedStateShape. Existing halt normalizer removes retired halts and detects changed map. Existing save owns atomic replacement and failure evidence. No live disk scrub. |
| Dedicated executor telemetry | core/OrderExecutor.js:431-480, :3055-3065 | Remove only _emitSymbolCooldownGateEvent and its sole invocation. No cooldown gate_event frame or warning remains. |
| Retained generic executor reader | core/OrderExecutor.js:3046-3066 | Preserve halt code/reason, ORDER_BLOCKED trace, blockedReturn; exits remain governed by existing execution path. |
| Retained decision/startup readers | core/TradingLoop.js:1618-1642; run-empire-v2.js:1993-1994 | Preserve generic symbol_halt decision diagnostics and startup state display. |
| Dashboard state / UI | core/StateManager.js:5044, :5072; public/js/panels/gate-meter.js:187-204, :216-222, :263-270 | Generic projection and arbitrary gate rendering remain. No dedicated cooldown UI field/consumer found. Historical telemetry is not rewritten. |
| Tests: restore | test/state-manager-load.test.js:150-325, :345, :380, :477, :826 | Replace config-dependent retention/deletion assertions with unconditional removal/absent property. Remove obsolete setOverrides setup. Other fixture streak fields intentionally remain as legacy migration inputs. |
| Tests: close / halt / reload | test/state-manager-open-position-scope.test.js:117-119, :1802-1995 | Replace retained-feature assertions with no generation, rejection and no resurrection. Obsolete env enables remain only as negative test input. Preserve unauthorized-halt and financial reconciliation tests. |
| Tests: telemetry | test/order-executor-pause-gate.test.js:525-622 | Replace cooldown emission assertions with retained financial halt blocks and absence of dedicated WS emission. Fixture delegates missing normalizeSymbol to real StateManager method so tests reach target gate. |
| Tests: launch profile | test/ecosystem-eval-profile.test.js:187-189 | Remove three obsolete expected env settings; no production env writer was found. |

## All retained halt producers and recovery callers

These are not loss-cooldown behavior and are unchanged:

- OrderExecutor.js:104 direction_integrity_exit_refusal; :154 broker_order_reconciliation_required; :1200 exit_intent_reconciliation_required; :1466 exit_rail_broker_desync.
- StateManager.js:2067-2105 direction-integrity writer uses generic normalizer; :2420-2445 restored broker-unverifiable writer also uses it. These paths retain financial metadata, affected scope and trace.
- run-empire-v2.js:2654 exit_monitor_reconciliation_required; :2735 ttp_cutoff_unverified_broker_flatness.
- TtpCutoffEnforcer.js:813 creates cutoff-owned symbol halts; :877-884 compares current halt code with its quarantine source before reset. Preserve recovery and flatten lifecycle.
- StateManager.js:4179 haltSymbol validates code then supplies private mutation authority; :4226 resetSymbolHalt removes named symbol only and preserves that authority. Initial fresh reset :619-654 remains existing behavior.
- StateManager.js:4458-4469 normalizes loaded maps; :1023 normalizes updates; :2073 reads standing direction-integrity halt before writing. Internal and external consumers are enumerated verbatim in callers-census.txt.

Generic operator/daily pause fields, KillSwitch, venue guards, broker reconciliation, recoveryMode retirement, liveness pause recovery, direction quarantine and exit policies are untouched. No general cooldown removal: Supervisor heal/dead pacing, ExecutionRateLimiter, narrator/UI throttles and other strategy cooldowns are outside this rejected feature.

## Provenance and conflicts

September 6 A17 in ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:102-114 explicitly rejects cooldown. September 12 CONTROLLING-SPEC.md:101 requires removal including persisted state; :95 preserves unrelated pauses. Current request repeats that exact scope. Earlier August 29 eval-guard language is not authority to retain this feature. No unresolved policy conflict found for this removal. Warning thresholds are a separate Stop 1 obligation and are not implemented or certified here.

History checked: 25b44906 introduced eval universe trim/cooldown; 4fd5c8a4 changed hidden halt authority; 0456a70c/98c84304 moved configuration ownership. CHANGELOG cooldown mentions at captured :3229 and :3468 describe other cooldown mechanisms, not authorization to retain the rejected symbol-loss gate.
