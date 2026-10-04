# Handoff 3 — Codex 3 halt-producer repair lane

Updated 2026-10-04 at Trey's explicit stopping-point request: “make a handoff and fill out the changelog use the same number as before were almost out of usage”. This replaces the stale October 3 resume instructions. Detailed work history remains in CHANGELOG.md; this requested handoff is not a return to mandatory packets.

## Mission and authority

Resume Codex 3's original seven-code halt-producer investigation and authorized repairs. Original dispatch: ogz-meta/inbox/codex/2026-10-02/halt-producer-investigation-handoff/HANDOFF.md. Its original investigation-only restriction was superseded by Trey's implementation instructions (“hammer down”, “commit each one separate”, “GO FOR IT”). Scope and other-agent boundaries remain.

Read current AGENTS.md, ogz-meta/AGENTS.md, Alignment README, master alignment, TREY-RULINGS.md and TREY-DOCTRINE-FABLE-LANE.md before resuming. Live files/git are ground truth. Direct lane ruling overrides older generic flatten/halt language: fix internal producers first; do not add automatic bot/trade halts, flattening, quarantine, guessed defaults, downstream gates or warn-only swallowing. Bring concrete irreducible external behavior to Trey. No PM2 restart, runtime activation, live order or customer-state mutation is authorized.

Trey's account ruling: “yes it should absolutely check the account tht it sent the payment from”. Verify the account/venue that actually executed the order. A webhook fill alone does not authorize declaring that account flat. If the owning account cannot be checked, retain explicit unverified status/report; do not substitute another account, infer flatness or send another sale.

Latest routing clarification: SignalStack was only for a particular historical prop-firm evaluation. Current intended SessionRouter routing is Kraken for crypto, Alpaca for stocks. Scheduled stock-open/crypto-after-close switching and configurable crypto-only/stocks-only modes must all be preserved. No SessionRouter/configuration changes by this lane. Working webhook settings were disabled/dry-run when inspected; loaded PM2 posture was not checked or changed.

Ruling 15: one detailed CHANGELOG entry per logical change is the primary record. Trey reaffirmed this on October 4 after the phrase “producer evidence” caused confusion. That phrase means checking the code creating values and its behavior, not creating evidence packets. No duplicate MISSION/WORK/EVIDENCE/REVIEW forms or bulk raw-tape commits. Link useful supporting results only. Each complete logical repair gets behavior verification, honest Mercury review, one atomic commit and push. Standing delivery approval applies. Work on explicitly authorized astra-era; no worktrees.

## Five delivered repairs — do not redo

1. 925415e72e925900294ecfa2627ea441669fb16a — removed obsolete exit-balance reads/assertions in both TradingLoop exit paths. Two regression cases passed and failed before the fix. Broader trace suite retained the same 31 pre-existing failures; no whole-suite green claim.
2. 58d7de72b9f59c8b887a3b85e0734b247fb88fee — Alpaca/OrderRouter preserve pre-dispatch failure status, rather than labeling an unsent order uncertain. Nineteen focused tests. Post-dispatch/unclassified uncertainty remains; review overclaims explicitly rejected in changelog.
3. 2a649670c7db24694e7f6afad1fdcc5f6dbfea8a — Kraken preserves actual dispatch stage, including sticky attempted status across an existing retry. Eight new cases; four related suites/44 cases passed. Mercury/Astra reviewed. No new rejection condition or retry policy.
4. d7283ae4f977907f01965d7ebae3c94852189077 — rejected broker registration no longer replaces the account reader or publishes partial routes/listeners before validation. Five new cases; four suites/43 passed. Mercury/Astra reviewed. Same-name replacement using disjoint symbols remains a separate inherited gap, not exercised by the five inspected SessionRouter registration producers.
5. d425c7f635c93de4d0c5302715c5bfa90554d61e — removed two unreachable MED-01 missing-exit-reason throws from TradingLoop, after tracing all six coordinator return routes and reason construction. Ten production lines removed; producer test plus detailed changelog included. Fifteen producer cases and existing timer/candle/planner cases total 34 passing checks. Seven production modules were pinned to the tested Git tree; remaining dependencies used working source or explicit doubles. No full-runtime claim. Pushed and remote SHA confirmed exactly equal before this handoff commit.

All five changes have their own detailed changelog entries. The overall mission remains unfinished. All other inherited dirty production hunks remain with their owners.

## Latest review resolution — preserve the qualifications

Supporting results: ogz-meta/inbox/codex-third/2026-10-04/exit-reason-producers/.

Broad run 2026-10-04T14-28-25-048Z-2e36fcc04d1e ended needs_more_evidence. Astra rejected Mercury's claim that downstream missing-reason handling was safe: missing reasons can suppress learning or reject journaling. Correct justification is current producers always supplying a reason.

Focused recheck 2026-10-04T14-35-19-395Z-0ac8ce091c58 returned Mercury no_break_found and verified gpt-6-astra pass/no blocking/convergence, but its aggregate ledger pass conflicted with parsed blocking/panel cannot_verify because the DISAGREEMENT field retained Mercury reporting corrections. Automatic continuation also failed with explicit_continuation_indispensable_envelope_exceeds_limit. That aggregate pass was NOT used as clearance.

A direct Astra follow-up independently closed the narrow question after explicit host corrections: private/astra-followup-result.json has pass, parsed blocking=false, DISAGREEMENT none, no required recheck, convergence and verified gpt-6-astra identity. No parser/harness policy was modified. Whole-file/exhaustive-test/no-assumption overclaims remain rejected. Original statuses/results are preserved. Recheck and follow-up harness launch/finish hashes match; the initial broad run saw config.js/indexer.js changes and was qualified accordingly. No Kimi/Claude calls.

Reviewed tree 03ef50edb2bec1053537f882fa0c365360839fe7; base d7283ae4. Tested tree f7d26bc43c66f97da6632ce1deaf12822307f5eb differs only in changelog. Final delivery tree f4f58cef2520ae600948c1928e560d5b3e335522 incorporates concurrent dashboard 13c43b62 and PropSafe schema e627211c; reviewed production/test/producer bytes were checked identical before commit.

## Exact next investigation

Starting census: ogz-meta/inbox/codex-third/2026-10-02/halt-producer-audit/CENSUS.md — seven halt codes, 44 concrete trigger groups plus one defensive fallback. PROPOSED-FIXES.md contains the dependency designs. Its six broad questions mixed internal defects and external uncertainty; do not reask them wholesale. Five delivered slices do not close all groups.

Next: pending exits and truthful terminal/account evidence. Latest actual-method reproduction:

- ogz-meta/inbox/codex-third/2026-10-04/pending-exit-truth/probe.cjs
- result.json alongside it, including source SHA-256 and extracted-method line locations.

Both synthetic cases (the owning Alpaca adapter could report the identified order filled, or canceled) return released=true with zero getOrderStatus calls when getOpenOrders returns an empty array. The real extracted reader/matcher/reconciler/release path is exercised; broker and persistence are doubles. No real request, sale or halt occurred. Open-order absence is not terminal proof. Merely tightening ID matching can still release a filled order and permit a duplicate sale; repair the complete producer/consumer lifecycle.

Relevant live leads to recheck:
- OrderExecutor._reconcilePendingExitIntentForReservation releases on no matching open order; aged unavailable reads still auto-halt.
- Direct broker acceptance is treated as execution success, while pending accepted-ID persistence is currently wired in the webhook path; trace the full direct path before changing it.
- Alpaca implements getOrderStatus; KrakenIBrokerAdapter's getOrderStatus remains unimplemented. Do not add an orphan status method without its actual consumer.
- _exitPlanFromActiveTrade omits accountId and has current-config fallbacks. Router position reads scope broker name/symbol, not account identity.
- Historical webhook full-exit checks can read the Alpaca price-feed account, then falsely report flatness or reach automatic flatten/halt. Earlier isolated proofs are under 2026-10-03/webhook-ownership and 2026-10-04/webhook-ownership.
- Null/boolean quantity coercion remains reproduced in webhook fill/position parsing. Correcting parsing alone must not feed an unresolved wrong-account flatten/halt path.

Other original work remains open: pre/post-accept state construction and persistence, retained exposure/direction integrity, credential-prefix heuristics, cutoff ownership/truth/recovery, and autopsy persistence coupling. Stop 1 already has related autopsy work; coordinate, do not duplicate it. No new external-policy decision was taken this session.

## Shared state and stopping point

At this capture branch astra-era, HEAD/confirmed remote d425c7f635c93de4d0c5302715c5bfa90554d61e. A documentation-only handoff commit follows. Shared index contains another agent's foundation/ConfigLoader.js; its staged blob was preserved through the latest production commit. Recheck before any operation. Many tracked/untracked files remain dirty, especially executor/state/strategy/config/dashboard/harness. Do not stage broadly, reset, stash, or claim those changes.

Coordination: ogz-meta/inbox/codex/2026-10-03/staging-coordination/WINDOW.md. Stop 1 owns configuration/sizing/strategies; Mercury owner owns harness; frontend owner owns dashboard. No general hold, shared-index reservation or active Codex 3 review remains. The review-status discrepancy was reported there for Mercury-owner triage; do not take over that repair.

No fresh general Mercury index claim. Earlier refreshes failed credit_balance_exhausted and refused partial writes; latest d425c7f6 refresh was not launched before Trey's usage-saving stop request. Captured-tree review is separate from embedding-index freshness. Do not purchase credits or switch providers. Supporting local receipts remain uncommitted by design.

Resume by rereading current doctrine/status/changelog and confirming these five SHAs. Continue the exact pending-exit/account lifecycle repair with the owner's dirty hunks preserved. No redo of completed tests absent changed source or new concerns. Keep one logical change per reviewed commit and record it in the changelog.
