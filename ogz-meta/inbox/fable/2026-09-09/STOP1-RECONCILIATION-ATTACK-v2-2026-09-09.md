# STOP 1 — RECONCILIATION OF THE v2 ATTACK (Codex, Sept 9) → v3

Mode: reconciliation (not blind — the attack was read before this was written). Every attack row gets an ID here because the attack keyed rows by spec line, which would let them vanish on renumbering. Execution status of everything: **OBLIGATION**. Twelve code claims in the attack were re-verified by Fable at `e54a8b8` before any status below was assigned (read list in v3's footer).

| ID | Attack row (short) | Fable verification | Status → v3 |
|---|---|---|---|
| C-01 | Fire gate names R1–R4, omits R5/R6 | Text defect in v2 status line | CORRECTED — gate is R1–R8, all blocking |
| C-02 | Commit numbering only works under R2(b) | Arithmetic holds | CORRECTED — two explicit sequences in Part 0 |
| C-03 | (attack A: B01) same as C-02 | — | CORRECTED |
| C-04 | `fees.alpaca = 0 all fields` zeros slippage; slippage changes simulated fills | `OrderExecutor.js:3604-3614` reads `fees.slippage` for paper/backtest fill simulation; `trading.config.json:2329` = 0.0005 | CORRECTED — commission zeroed, slippage preserved at 0.0005; venue-selection timing stated per R2 |
| C-05 | v2 §1.2 reversed the sizing map (called `maxPositionSize` the control at `:2063`) | `:2063` reads `entryLogic.sizing.absoluteCapPercent`; `:3107-3121` reads `positionSizing.maxPositionSize` | CORRECTED — verified four-leaf map copied into §1.2 |
| C-06 | RETAINED-IN-PLACE can preserve a second owner/fallback | Logic holds | CORRECTED — retained only for a code literal with one surviving compatible owner; HOLDs on deleted sources/fallbacks/second authorities block the cut |
| C-07 | `.env` loaders are four: `ecosystem.config.js` loads dotenv | `ecosystem.config.js:7` | CORRECTED — denominator 4; launcher load kept solely for pm2 credential delivery, runtime has one |
| C-08 | Removing pattern-memory reload before injecting mode breaks singleton callers | `trai_core.js:123` → `getUnifiedPatternMemory()` no config; `UnifiedPatternMemory.js:182-184` | CORRECTED — inject first, then remove |
| C-09 | Deleting `profiles.*` leaves without the validator breaks init | `ConfigLoader.js:2219-2238` validator at import; `:3342` BASE_CONFIG.profiles; `:4025` getter | CORRECTED — same commit deletes validator, BASE_CONFIG.profiles, getter, banner |
| C-10 | Handlers "once in main" leave module-load, autoload, lock acquisition, and bot construction uncovered; per-symbol quarantine claimed where no symbol exists | `run-empire-v2.js:3623` constructs bot before `:3628-3645` listeners | CORRECTED — boot phase (refuse, exit ≠ 0, named) vs runtime phase (scream, continue); listeners registered before construction; quarantine only when a symbol is known |
| C-11 | Changing shared `shutdown()` exit code makes operator SIGINT/SIGTERM non-zero | `:3628-3629` SIGINT/SIGTERM → `bot.shutdown()`; `:3586` exit(0) | CORRECTED — exit-code parameter; operator signals keep 0 |
| C-12 | Required list left to executor judgment; `loadDirectory` swallows required failures before `validateModules` | `ModuleAutoLoader.js:130-135, 245-250, 267-283` (prior read) | CORRECTED — list enumerated by name in the packet; catch propagates required failures |
| C-12b | Cooldown deletion scope too narrow (producer, streak, halt code, migration) | `StateManager.js:117, 134, 1676, 3973-4011` | CORRECTED — whole feature enumerated |
| C-13 | R6 premise false: `resetSymbolHalt` exists, expiry exists, TTP cutoff calls reset | `StateManager.js:4162`, `:144-147`, `TtpCutoffEnforcer.js:877-884` | **COUNTEREVIDENCE against Fable's R6** — R6 rewritten on the correct facts; Fable's grep missed `reset*` |
| C-14 | Part 5 per-file counts total 155, denominator 179 | Listed subset = top 15 files; total from script = 179 | CORRECTED — stated as such; full 179-row table attached to 0.1c |
| C-14b | A15's 7.5/25 sizing values absent from executable changes | True | **DEFERRAL PENDING TREY — R7** (apply now as ruled value change, or migrate today's values and apply at stop 4) |
| C-15 | "UI edits this file" has no writer; "next boot" activation is unruled | True | CORRECTED (one atomic writer, bypass rejected) + **DEFERRAL PENDING TREY — R8** (activation) |
| C-16 | R1(a) mis-described the publisher ("fails on every trade") | `claudito-logger.js:576-582` debounce 5s; `:717-729` catch + one log line | CORRECTED — R1 rewritten with the actual behavior |
| C-17 | R5(b) "re-acquire" can race a second process; writer is rename, not exclusive | `AtomicWrite.js:25` renameSync | CORRECTED — R5(b) requires exclusive-ownership protocol + race receipt |
| C-18 | Continuing after an unknown-symbol uncaught exception has no ruled recovery contract | Doctrine gap | STILL OPEN — folded into R-items? No: recorded as an obligation on item 1's packet (enumerate unknown-symbol paths; state recovery per path); Trey rules if any path cannot quarantine |
| C-19 | "Trey says land" treated as PM2 activation | Doctrine | CORRECTED — landing ≠ ignition; separate explicit activation word |
| C-20 | B09: 341 HOLDs still in manifest | True (0.1c not yet run) | STILL OPEN until 0.1c |
| C-21 | B13: fingerprint drops nested keys; UI route absent | `ConfigLoader.js:1444` | CORRECTED via 1.7 (hash over nested values; single writer) |
| C-22 | Part A lines A2, A4–A7, A11–A14, A16, A18–A19 "not implemented" by v2 | True by design: stop-1 scope | RECORDED — each is a later-stop obligation in the traceability matrix; none is claimed by v2. A15 (values) and A22 (commission vs slippage) were the two Part A lines v2 implemented wrongly or not at all; both corrected above |
| C-23 | Attack's own verification of the 79-row DELETE receipt: sound | — | CONFIRMED, no change |

**Verdict on v2:** DO NOT FIRE stood correctly. **v3:** HOLD, executable after 0.1c + R1–R8 + a second-seat attack on v3.

**Fable's own misses in this round, named:** R6 (grep for `clear|unhalt`, not `reset`); the reversed sizing lines in §1.2 while the reconciliation table had them right; "exactly three `.env` loads" when the launcher's load was already known from slice 1 (pm2 pre-read) and not counted; A15's ruled values dropped from the executable text.

---
**WHAT I DID:** assigned IDs to every row of Codex's attack; re-verified the twelve code claims at `e54a8b8` (list in v3 footer); wrote v3.
**WHAT I DID NOT DO:** read `ModuleAutoLoader.js:130-135, 245-250` again this turn (relies on the Sept 7 read); execute any obligation; read the attack's cited `OrderExecutor.js:4135, 4394, 4798, 5460` publisher call sites (relies on Codex's audit and the attack).
**WHAT I ASSUMED:** the attack ran against the box's copy of the same files; its `e54a8b8` diff check showed only `core/persistent_llm_client.js` differing, matching v2 Part 3.
