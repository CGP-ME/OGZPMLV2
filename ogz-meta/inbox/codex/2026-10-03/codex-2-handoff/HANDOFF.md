# Codex 2 — Mercury repair restart handoff

Requested by Trey before restarting his computer, 2026-10-03. This is the Mercury/Astra lane, not Stop 1 or frontend. Read live AGENTS instructions and Alignment/Trey Doctrine/Trey Rulings before resuming; current source and Git state outrank this note.

## Immediate task and order

Trey's latest instruction: "fix the toooling test it then go investiage more", followed by "after commit and push". Required order: fix Mercury first-pass tool access, run actual behavior tests and a real Mercury review, deliver only that logical change by atomic commit/push, then investigate further prompt conflicts. Do not spend time attributing commits to agents. Do not return to Astra integration: that is already delivered.

**First-pass tooling is NOT FIXED. No production edit implementing this repair has been made. No successful test of repaired tooling exists.** Previous acknowledgements described intended work, not completion.

## Delivered work

- aef7969da3ebcb16e2aa331cb7e5744fc6eb891e: Astra challenger integrated and pushed. Actual gpt-6-astra invocation/model identity verified, tools and full raw receipts retained. Claude benched; no silent fallback. Mercury and Kimi panel roles preserved. No Kimi calls authorized.
- 1a9b0d484a57442c1a96a508193cce598d4f3951: Trey's recording override, pushed and remote SHA verified. Ruling 15 supersedes mandatory packets (7/7a): one detailed changelog entry per logical change; supporting receipts linked when needed; no required five-document packet, duplicate session form, bulk tape commit or dual-hash inventory. Preserve historical packets. This handoff is explicitly requested, not restoration of packet bureaucracy.
- Latest observed HEAD before this handoff: 9fb3cd2c (another lane's halt-producer handoff), after 58d7de72 (Alpaca submission receipts). Branch astra-era. Recheck before any mutation.

## Concrete tooling defect and next implementation work

`trai_brain/mercury-bridge/ask.js:1264-1285`: an explicit captured corpus routes Mercury into runExplicitTargetReview. Native tool investigation via runReactLoop is offered as continueWithTools, currently reached only after certain candidate/final envelope failures.

`evidence-ingestion.js:2186` defines runExplicitTargetReview. Its initial options at line 2213 use toolChoice none. Mapping starts at 2230. makeSynthesisRequest at 1924-1962 builds tool-less candidate/reduction/final requests (`tools = []`). At 2890 onward, continuation is invoked only for failed oversized envelopes. Thus Mercury cannot autonomously investigate callers during ordinary initial mapping/synthesis, even though the user expects tooling available on every pass.

`ask.js:321-383` runReviewRechecks instead invokes runReactLoop directly with source tools. This is a verified workflow difference; it does not by itself prove the entire cause of false reasoning.

Implement first-pass native repository tool availability while preserving exact selected review tree/base, original full question/scope, actual receipts, existing access restrictions, and bounded readable evidence delivery. Reuse existing components; no framework, mandatory reruns, answer gates, new throws or default iteration ceiling. Do not simply remove selected-source protections or silently drop source/evidence. No implementation approach has yet been selected or qualified.

## Diagnostic run attempted, not completed

Local script: `ogz-meta/inbox/codex/2026-10-03/mercury-first-pass/direct.cjs`.
Log: same directory `direct.log`.
It intends a fresh native-tool investigation against the same immutable source/question as the historical false Astra caller review, without the correcting recheck prompt. It failed during module initialization, BEFORE Mercury invocation:
`Configured embedding API key env is missing: OPENAI_API_KEY` from config.js:303.

Identified script-order issue: direct.cjs imports react-loop/config before ask.js. ask.js:45 normally loads repo .env with dotenv first. Repair the diagnostic script's environment-loading order using that existing mechanism; do not print credentials, inject dummy keys or change production key policy to work around it. No live review is running from this attempt. Network/sandbox restrictions may require approved escalation. Use maxTokens 7750, maxIterations null.

## Existing evidence to reuse, not regenerate as paperwork

Historical packet: `ogz-meta/inbox/codex/2026-10-01/astra-challenger-replacement/`.
- PROMPT-AUDIT.md: verified stage and source-delivery findings.
- private/final-review.json: broad run 2026-10-02T11-59-49-420Z-e8018e774167. Candidate cba73b4dd836d0f50c4773cdf00fe2fc34cc9dc3, base 4c22efe839a5a408b46840352943def280412784; contains exact harness hashes.
- private/recheck-result.json, recheck-prompt.txt, recheck-source.json: same-source withdrawal and selected source view.
- private/parser-mercury.json / parser-astra.json and completion-mercury.json / completion-astra.json: further historical-helper confusion and actual parser correction.

Broad failed review recorded 14 map records, 20 reductions, 11 candidate records, 24 continuation requests. These are stage counts, not billing totals. Mercury falsely assumed Astra used a historical Claude alias helper even though the correct factory lines were delivered and remained in final context. Recheck withdrew it. Do not claim the wrong conclusion was solely absent source or solely model capability.

## Prompt issues queued AFTER tooling delivery

1. Candidate prompt says structured records optional, but evidence-ingestion.js:2600-2601 labels missing target structure malformed; ten historical prose answers got that label. Answers retained, not suppressed. Stale payload task at 1916 still says file_explicit_target_candidate_set.
2. explicit-continuation.js:123-136 labels captured Git diffs archived_reviewer_testimony, then tells Mercury archived testimony is not current source. Distinguish immutable source/diff evidence from model testimony honestly.
3. doctrine-review.js:5-21 plus mercury.config.json:218-265 demand numerous repeated output sections alongside reasoning. Inspect for concrete conflicts; do not remove Trey's substantive totality/caller-proof requirements or assume shortening guarantees accuracy.
4. Config prompt already instructs actual caller tracing and contrary-evidence inspection. Adding another generic "verify callers" line is not an established fix.

## Shared ownership and constraints

Other agents own all Stop 1 migrations (including RSI2), frontend settings, and halt/Alpaca work. Do not change their files or staged entries. Coordination: `ogz-meta/inbox/codex/2026-10-03/staging-coordination/WINDOW.md`. Other restart handoffs found: `ogz-meta/inbox/codex-frontend/2026-10-03/restart-handoff/HANDOFF.md` and `ogz-meta/inbox/codex-third/2026-10-03/halt-producer-resume/HANDOFF.md`.

At last check the shared index was empty, but CHANGELOG.md and extensive production files were dirty. Six inherited dirty Mercury files remain: adversarial-review.js, ask.js, evidence-ingestion.js, explicit-continuation.js, run-ledger.js, tool-adapter.js. These include separate transport repairs; do not sweep them into a tooling commit. Earlier transport proposal is in 2026-09-30/mercury-continuation-transport; do not overwrite current files with stale patches. Capture fresh per-file baselines before own edits.

User explicitly ruled: executable trust failures go in receipt and dispatch continues; nothing shuts the system down except genuine money-risk handling. Preserve financial protections, TRAI, pipeline and repository restrictions. No Kimi calls, Claude fallback, branch changes, worktrees, PM2 restart, hidden answer ceilings, compulsory reruns or new throws. Use JavaScript. Commit/push only own completed work with scoped diff shown first; preserve others' index. Do not claim runtime activation or fresh Mercury index without actual evidence. Last successful Mercury index refresh belongs to aef7969d, not the subsequent doc commits.
