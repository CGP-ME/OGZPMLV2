# Mission

Dispatcher: Puck thread `T-01a034e9-036f-70af-8009-eb719c05fc40`

Ruling authority: Trey

Tasking verbatim:

```text
New mission set from Trey. Execute on the trusted VPS runner in repository CGP-ME/OGZPMLV2, branch `codex/multi-asset-symbol-state`, preserving concurrent/unrelated work. One agent/box, strictly sequential Parts A→E. No part starts until the prior part's accountability packet commit exists. One commit per part, in order, dispatch-on-completion. Full live adversarial layer per commit under current ladder/stamp rules; HOLD each push for genuine Fable cold-pull. No new env vars, config keys, defaults, or frameworks anywhere; sole exception Part E reads existing `NTFY_TOPIC` repo secret. Receipts must list inherited doctrine violations in every touched file. Never touch main. Do not create another thread.

PART A — RECORD THE RULINGS (docs-only first commit).
Create `ogz-meta/inbox/trey/2026-08-29/RULINGS-2026-08-29.md` recording verbatim, attributed to Trey, dated:
1. One net position per symbol — one trade per ticker at any time. Cross-frame conflicts resolve through the existing signal ranking; every declined frame writes a named refusal to the trace.
2. Base timeframe = 1m. The base is received from the broker, never manufactured. All higher frames derive from it via TimeframeEngine per the MTF wire spec; Kraken native frames serve as validation.
3. Account-level loss protection = TTP venue guards only. The six dead env caps are deleted, not rebuilt. Venue-guard translation through the bot must be proven (Part C audit + boot probe).
4. Last price = the newest bar the broker sends, any frame; strategies only ever see the ruled frame architecture.
5. ogz-meta/ledger is ruled contaminated as a class; per-file verdicts by Trey in progress; no deletion in this mission set.
6. AuthFailureGuard demoted: no automation kills the bot, ever. Breach = broker-session quarantine + flatten + scream. Manual kill is the only stop.
7. ACCOUNTABILITY PACKET (standing law). Every mission delivers one packet directory — ogz-meta/inbox/<agent>/<date>/<mission-slug>/ — as one commit, by the agent that did the work, into its own named directory, never another agent's. Contents: MISSION.md (tasking verbatim, dispatcher, ruling authority), WORK.md (commits produced, files touched), EVIDENCE.md (probes with commands + output, run IDs, tape hashes, named absences — what was NOT proven), REVIEW.md (adversarial panel as applied, attacks, adjudications, verdict), INHERITED.md (violations found in touched files, unfixed). A mission without its packet is not done. "Pushed" is not "delivered." Code commits and packet cross-reference by SHA.
7a. TAPES IN THE PACKET. EVIDENCE includes the raw adversarial tapes (ledger JSONL lines for the mission's runs + raw provider outputs), committed inside the packet — passed through redactSensitiveText before commit, with BOTH hashes recorded per file: original-on-box and redacted-as-committed. A tape that cannot be redacted safely is a named absence with its original hash — never a silent omission.
8. VERDICT-SEAT FLOOR. The applied model is always stamped as fact. Verdict-bearing frames may be Fable or, via documented transition, Opus — never Sonnet, Haiku, or any lesser model. A verdict frame from below the floor is stamped identity_conflict and capped UNVERIFIED, run continues. Auxiliary/telemetry frames may be any model; recorded, no authority.
9. PROTECTED-PATH ALARM — UNCONDITIONAL. Every push touching .env*, ecosystem.config.js, .claude/**, ogz-meta/Alignment/**, or config/trading.config.json fires max-priority ntfy naming author, SHA, files, and commit subject. No trailer logic, no exemptions, no approval concept, no blocking, no reverting — detection only. An alarm the operator stops reading is deleted, not tolerated.
Also record: protected-path screamer's TREY-APPROVED trailer design ruled out (detection value below noise floor); superseded by ruling 9.

PART B — AUTHFAILUREGUARD DEMOTION.
Territory: `core/AuthFailureGuard.js` + its tests. Broker callers keep reporting failures unchanged. On threshold breach, replace `killSwitch.enableKillSwitch(reason)` with broker-session quarantine: halt entries for that broker's symbols, flatten that broker's open positions through the existing flatten path, mark the broker session quarantined (persists restart, operator-cleared only — same persistence discipline the KillSwitch flag uses), emit max-priority trace/ntfy with broker, kind, count, window, evidence. The other broker is untouched. Remove the KillSwitch import from this file; KillSwitch itself remains, manual-only. Tests both directions: breach quarantines-flattens-screams and does NOT kill; the healthy broker keeps trading through the other's quarantine.

PART C — GHOST CAPS OUT + VENUE-GUARD TRUTH.
C1: delete every reference to `RISK_MANAGER_BYPASS`, `ACCOUNT_DRAWDOWN_BYPASS`, `MAX_DRAWDOWN`, `MAX_DAILY_LOSS`, `MAX_WEEKLY_LOSS`, `MAX_MONTHLY_LOSS` from env stamping surfaces within this agent's authority and from `config/.env.example`; correct any document (`ENV-VAR-AUDIT.md`) claiming these are HONORED — the claim is false; cite ruling 3 as authority. Runtime code should need no change (zero readers exist — verify, don't assume; if a reader is found, STOP and report, do not delete it).
C2 (read-only, own inbox file): venue-guard chain audit. For every TTP venue-guard key in launch profiles: its runtime reader (file:line), breach action, how breach reaches entry-blocking, flatten, StateManager accounting, and trace. Gaps named, never inferred closed. Output `ogz-meta/inbox/<agent>/2026-08-29/venue-guard-chain-audit.md`. No fixes; findings go to Trey.

PART D — LAST-PRICE INFLUENCE NAMED.
Territory: site(s) in `run-empire-v2.js` where non-active-timeframe bars update last price/equity marks before the fence drops them. Add one trace emission naming influence: symbol, frame, price, purpose `mark-to-market per ruling 4`. No behavior change. Test: non-active-frame bar emits trace and updates mark; strategy evaluation never sees it.

PART E — ALARM REWORK + SHIP.
Territory: two workflow/script files from Orb commit `93b891f4` only. Strip all `TREY-APPROVED` trailer logic. Protected path touched → red + max-priority ntfy always. Simplify; diff should shrink. `NTFY_TOPIC` from repo secret; absent secret = named absence in job log, still red. Own errors fail check red. Never blocks Git transport or touches runtime. Packet receipt: one forced buzz on test touch (Trey confirms phone arrival), one green clean-push run. Ship on pass.

Standing laws: no PM2 start/restart; no broker orders; no live/paper activation; no stash/reset/checkout/destructive Git without Trey; deletion authority human; automation screams, never stops.

For each Part A-E, create the accountability packet required by ruling 7 in this agent's own directory, including redacted committed tapes and dual hashes per 7a. Resolve the apparent one-commit-per-part requirement by including that part's implementation/docs and complete packet in the same atomic commit, with cross-reference that does not invent a final SHA; use repository doctrine's established mechanism for self-reference if one exists, otherwise STOP before committing and ask Trey rather than weakening ruling 7. Fetch/rebase safely before each push, preserve linear branch, exact territory, and concurrent work. Reply to this Puck thread after each part with commit SHA, packet path, adversarial run IDs, exact files, evidence, and HOLD status.
```

## Ruling 10 addendum

Dispatcher: Puck thread `T-01a034e9-036f-70af-8009-eb719c05fc40`

Ruling authority: Trey

Tasking verbatim:

```text
Add one docs ruling line so future auditors do not repeat this false alarm: `Ruling 10: adversarial seats are individually selectable; an unavailable seat is a named absence with a capped verdict, never a dead run.` Record it in the existing rulings document and accountability packet using the applicable packet/receipt law; do not conflate this docs update with Part C.
```
