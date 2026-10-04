# Codex 2 — account-swap handoff, 2026-10-04

This update supersedes the older restart state retained below. Read current AGENTS and Alignment, especially Trey Doctrine and Rulings. Scope: Mercury repairs/Astra seat only; other agents own Stop 1 and trading/frontend work. Branch astra-era. HEAD observed d425c7f6; shared staged foundation/ConfigLoader.js belongs to another agent. Recheck both before acting.

## Immediate user request

Remove the self-imposed 800-line CHANGELOG indexing cutoff. Then user requested this handoff before swapping accounts. Changes are implemented locally but NOT committed/pushed or refreshed in Mongo. No PM2 restart. No Kimi or Claude calls.

New lane: ogz-meta/inbox/codex/2026-10-04/changelog-index-history/.
- config.js: removed CHANGELOG_RECENT_LINES constant/export.
- indexer.js: removed changelog slicing and fabricated truncated-history note. Exempted only root CHANGELOG.md from MAX_FILE_BYTES: actual changelog was 525,897 bytes, above 500,000, so removing line cutoff alone would still skip entire file. Other exclusions/batching unchanged.
- behavior.json: actual walker includes it; actual processFile produces 1,031 chunks spanning 7,281 split lines; content past800/final entry present; all hashes match full source. This preceded newly prepended changelog entries.
- candidate.json: base e627211cecdc71056a8c9c75cf2cfc21a88538c5; tree b9e2c004c9d41a1370db0d74a3f018baebcae5ac. Exactly TWO production paths above. Unrelated later HEAD moves allowed only if those blobs unchanged.
- review.cjs is RUNNING as of handoff, tool session93194. Command: node [lane]/review.cjs [lane]/candidate.json, redirected candidate-review.log. Uses exact candidate bridge module loader, Mercury + Astra, maxTokens7750, no iteration cap. Inspect process/log/result before starting another Mercury call; never parallel Mercury. Initial log only provider startup at last check. Full candidate-result.json appears on completion.
- deliver.cjs prepared, never executed. Isolated index plus shared-index lock/reconciliation preserves others. Explicit two production paths; consumes changelog-entry.txt. Finalize entry after actual review. Inspect script before use; add scoped secret scan. Show diff, deliver, push exactSHA and verify remote. Reindex only with actual result recorded; do not claim fresh based on push.
- A first candidate build raced another agent's commit, showing unrelated reverse diffs; rebuilt from captured base in one invocation BEFORE review. Current candidate has only own two files. No shared index touched.

## Separate unfinished first-pass tooling repair

Directory ogz-meta/inbox/codex/2026-10-04/mercury-first-pass/. Contrary to old handoff, implementation and real tests now exist, but NO delivery yet.
- Own production edits: ask.js enables callback unless explicit noTools; evidence-ingestion.js starts existing native continuation loop immediately; explicit-continuation.js retains actual open_file/git_show ref/hash per file; tool-adapter.js emits those hashes; doctrine-review.js newest edit uses qualified explicit source coverage instead of filename-only historical read aggregation.
- New test/mercury-first-pass-tools.test.js. Six focused tests passed before newest doctrine consumer edit; newest assertion/fix NOT yet tested or reviewed.
- Current candidate f22e9b513ba26ac7a24ddebc765e00e773041cc9, base d7283ae4f977907f01965d7ebae3c94852189077. build.cjs derives own changes from baseline/ files, excluding inherited transport hunks. Never stage whole dirty bridge files.
- Historical real run:28 requests,0 map calls, first request native tools, first tool git_diff. Wrong historical Claude-helper allegation remained, so tool repair DOES NOT establish reasoning solved.
- Reviews v1-v4 preserved. Actual fixes found: missing working-tree ref/hash, mixed deleted/current refs incorrectly discarding reads, missing git_show receipts, then downstream doctrine whole_file_read_absent suppression by historical reads. Latest doctrine fix addresses last issue; check source_coverage producer census to avoid accidental undefined.some throw, then exact candidate tests and actual review.
- v4 candidate47f1f610fbf7616d1aad668ba579ddc7b98150d1 was NOT clean. Astra caught downstream coverage error and Mercury confirmed. Also false findings retained; don't accept invented policy claims.
- final-astra.cjs reads exact source snapshot directory derived from manifest filename without .json; validates hashes. Earlier wrong-source invocation is preserved as wrong-source-final-astra-result.json, not accepted approval. Response text is result.answer, not text/content.
- Oversized Astra review with full CHANGELOG exceeded CLI1,048,576 chars; production review candidates exclude changelog but include full scoped production/test changes. Changelog added only for delivery. Full evidence retained separately.
- Existing changelog-entry.txt exact string is present in working CHANGELOG.md. Replace only that owned string when updating. Do not overwrite others' entries.

## Remaining prompting/history investigation

User asks whether Mercury searches repo/history. It has grep/search/list_files/open_file/Git tools. Recorded historical run search Fable returned changelog matches but no targeted historical follow-up. Doctrine already explicitly requires historical changelog collection; capability alone does not imply use. 800-line cutoff was self-imposed; comment attributed Aug7 Trey ruling but attribution not verified. Latest explicit removal supersedes it. Inspect message assembly/tool semantics/conflicts after delivery; no attribution hunt, no new gates/defaults/throws/fallbacks, no automatic rerun requirement.

## Shared-state preservation and delivery

Extensive inherited dirty bridge transport remains in adversarial-review, ask, evidence-ingestion, explicit-continuation, run-ledger, tool-adapter. baseline/ captures pre-own edits; use build.cjs for tooling. No worktrees/branch change. Other agent staged ConfigLoader; preserve all unknown work and detailed changelog entries. Source push != runtime activation. Old handoff below is historical, not current.

---

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
