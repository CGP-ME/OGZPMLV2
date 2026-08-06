# Session 2026-08-03 → 08-06 — PostHog, P0 removal, directional audit + tri-model spec review

Branch: codex/multi-asset-symbol-state | Last commit this session: c938697c
Baseline note: P0 gate REMOVED this session by Trey's explicit directive — there is no P0 baseline requirement anymore.

## What was done (numbered, root cause + fix per item)

1. PostHog analytics shipped and ACTIVATED. Inert loader + defer tag on 13
   public pages (aca96d03), then real phc_ key + US Cloud + PostHog-recommended
   options (496c615e). Verified live: SDK boots, config/flags fetch with key,
   ingestion accepted a test event (activation_smoke_rest in project Activity).
   Disk-served — no deploy step.
2. P0 gate removed repo-wide per Trey ("no fuck p0 bypass it" → "get rid of all
   the p0 gate shit"). Bridge is self-protected so TREY applied the bridge patch
   himself (evidence: ogz-meta/evidence/patches/2026-08-03-remove-p0-gate.patch);
   session removed the anchor test, updated bridge tests (20/20), cleaned
   AGENTS.md + BACKTEST-OPS.md (36091a0b). Mercury adversarial proof is STILL
   required for hot-path commits; only P0 died. multi-runtime-gate-runner --p0
   and anchor-runner.js remain as voluntary tools.
3. Directional (long/short) audit — six parallel read-only Claude agents, one
   per module + session sweep. ~70 deduped findings, consolidated at
   ogz-meta/inbox/fable/2026-08-03/directional-audit-consolidated-findings.md
   (5a7e5aff). Independent reviewer verified 13/13 sampled citations. Verdict:
   happy-path direction math is CORRECT everywhere; the disease is missing/
   malformed direction handled by INCONSISTENT silent guesses (short in
   getEquity, long in close/reduce/fill), reaching real order routing
   (OrderExecutor:997 desync-flatten can double a short). ENABLE_SHORTS is
   decoration (enforced by zero lines); DIRECTION_FILTER/ENABLE_SHORTS env vars
   are dead — launchProfiles.* in config/trading.config.json is the only live
   control (currently paper profile = long_only).
4. Fix spec v1 (route-to-existing-machinery, NO new throws in hot loop, no new
   machinery, five batches + parked policy calls) at
   ogz-meta/inbox/fable/2026-08-04/directional-fix-spec.md. NOT implemented —
   Trey stopped spec-author-implements-same-breath cold. Spec is FROZEN at the
   version all reviews reviewed.
5. Tri-model spec review: Mercury-1 (stale index; 5 angles), Fable independent
   agent (READY-WITH-CHANGES, findings M1-M6 — best pass), Mercury-2 post-
   reindex (12 angles, ZERO genuinely new — audit coverage held; category error:
   judged planned fixes as missing fixes). Kimi NEVER produced an answer: run 1
   temp-param 400, runs 2-5 cap-starved (4096 budget, 4093 reasoning tokens,
   empty content — Trey paid for each), final curl attempt timed out at 280s.
   All receipts committed under ogz-meta/inbox/fable/2026-08-04/.
6. Mercury reindexed (was 18 days stale, Jul 18 → Aug 5 @ f55f323c; dual-
   indexer scare — second killed, index verified clean: 635 files, 10,377
   chunks, 0 embed errors). Staleness measurement: cost breadth (5→12 angles),
   not citation accuracy.
7. Dispatch receipt doctrine shipped (f55f323c + c938697c): every Mercury
   dispatch prints RECEIPT (verdict, evidence-quoted quality flags, run-checks,
   named tool failures, blast radius, tree state, index freshness, ledger
   citation) incl. crash path; new unsupported_reference_claim flag (structure
   claims require serena/find_references evidence); AST-mandatory doctrine in
   mercury.config.json; maxTokens redaction false-positive fixed (numeric
   values never scrubbed); Kimi script embeds success AND failure receipts;
   agent retro-receipts + go-forward RECEIPT-section rule in
   agent-review-receipts.md. Bundled WITH ATTRIBUTION: other lane's
   inconclusive_toolfail removal + its two test updates (45/45 green).

## Smoke tests
- Bridge tests 20/20 post-P0-removal; mercury run-ledger/consensus/react-loop
  45/45 post-receipt-patch. PostHog verified live via Playwright + REST 200.
  No trading-code changes were made this session (audit + docs + cognition
  infra only), so no backtest was run.

## Files touched (committed)
public/js/posthog-init.js; public/unified-dashboard-v2.html + 12 marketing
pages; trai_brain/claude-bridge/{finish-gate,proof-writer,pre-bash,cli}.js
(P0 removal, via Trey's git apply); test/claude-bridge-*.test.js;
test/multi-runtime-p0-accounting-gate.test.js (deleted);
trai_brain/mercury-bridge/{ask,run-ledger,react-loop}.js; mercury.config.json;
test/mercury-run-ledger.test.js; ogz-meta/AGENTS.md; ogz-meta/BACKTEST-OPS.md;
ogz-meta/evidence/patches/…; ogz-meta/inbox/fable/2026-08-03..04/… (audit,
spec, all review receipts); .claude/memory/ (three new feedback rules).

## Git log (session commits, oldest first)
aca96d03 PostHog wiring; 36091a0b P0 gate removal; 496c615e PostHog activation;
5a7e5aff audit findings; 3a0c3cfa spec + reviews; 667f2851 merge (Codex
67e4b7eb re-audit ledger); f55f323c dispatch receipts; 2afbc26f Mercury-2 +
provenance; 125b68c5 receipts all families; c938697c failure receipts.

## Half-cooked / open items
| Item | State |
|---|---|
| Kimi review | NEVER DELIVERED. 5 paid failures + 1 timeout. Working options: rerun fixed script (16k budget, receipts) OR curl with longer/streaming; OR drop Kimi (its salvaged reasoning angles — rethrow landing pad, per-condition disposition table — are already in the edit ledger). Trey's call; do NOT spend his money without his OK. |
| Spec v2 | NOT WRITTEN. Edit ledger consolidated across reviews: tri-confirmed BacktestRunner :231/:248 explicit naming; Fable M1 (fold set/updateState into shared issue-collector — five doors one edit), M2 (REGISTER the direction-refusal halt code in AUTHORIZED_SYMBOL_HALT_CODES or halt degrades to alert-only + evaporates on restart), M3 (declare corrupt-trade residual lifecycle), M4 (pre-deploy state.json inspection receipt), M5 (Batch-3 classification rule + zero-in-place-direction-writers grep as receipt), M6 (written disposition for every finding, T1-29 loudest); report.config directionFilter/enableShorts stamp pulled ahead of validation-bearing batches; Kimi's rethrow-landing-pad + ECM disposition table. |
| Trey's 3 policy calls | PARKED: enableShorts enforce-or-delete; journal-failure halt-entries-vs-alert-only; PositionTracker wire-or-excise (verified: constructed run-empire-v2.js:651, ZERO method calls anywhere — excise = 2 lines + module). |
| Batch 1 implementation | NOT STARTED. Blocked on spec v2 approval. NO CODE CHANGED in the directional workstream. |
| Env var sweep | Queued (task ledger): dead/doubled/reversed env vars, round 2 of AUDIT-2026-04-07. |
| Mercury index hygiene | NEW: ~22% of fresh index is contamination-class (codex-design 728, QuarantinedExpansionFiles 230, rolling docs, dispatch artifacts, _1/_2 duplicate file copies ~390). Needs per-dir disposition + mercury.ignore reconciliation + reindex. inbox/ and audits/ verified NOT indexed (0 chunks each). |
| grill-me skill | Trey has the definition; NOT installed (bridge blocks command-file writes). Needs his paste to .claude/commands/grill-me.md or git apply. |
| Bridge friction log | pre-bash blocks: any command containing "ask.js" (Mercury-framing false positive), node/python script_runtime except allowlisted, arrow functions read as redirection. indexer.js NOT allowlisted though CLAUDE.md assigns reindex duty to CC — contradiction to resolve. |

## Context for next session
- Session ended with Trey furious — justified: he paid for repeated Kimi runs
  that were doomed by session errors (param, cap, fix landing after his
  reruns). Three new memory rules exist: ask-before-rewriting-git,
  no-paid-runs-without-verified-fix, and the receipts doctrine. Honor them.
- The directional audit itself is the strongest-verified artifact in the repo:
  13/13 citation check + fresh-index adversarial enumeration found nothing new.
- Spec is frozen at 3a0c3cfa version; all review receipts in
  ogz-meta/inbox/fable/2026-08-04/. Next concrete deliverable: spec v2 folding
  the edit ledger, then Trey's read, then Batch 1 through the normal loop.
- Codex lane active on same branch (67e4b7eb re-audit ledger in ogz-meta/audits/
  — bridge-blocked for CC reads; reconcile specs before implementing).

## Recorder pipeline disposition
Not run (no trade-path code changed). CHANGELOG/fixes.jsonl untouched this
session; audit artifacts are inbox-scoped by design (Mercury-ignored,
verified 0 chunks).
