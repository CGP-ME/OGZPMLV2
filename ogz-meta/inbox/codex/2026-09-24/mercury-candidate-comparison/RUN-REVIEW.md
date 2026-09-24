# Actual run after the prompt change

Run `2026-09-24T04-35-42-757Z-2cd1b324bffc` completed 2026-09-24 04:35:43 UTC at c02924986a006b24d49abf4c327483208ebfb758. The exact command was `node trai_brain/mercury-bridge/ask.js --max-tokens=7750 --reviewers=mercury,fable,kimi "Mercury, break my fix."`, through the existing mission launcher with isolated storage `ogz_mercury_recovery_20260924_006`. No iteration ceiling. No bot activation.

## Observed, not inferred

- Mercury primary: 20 iterations, 17 tool requests, including one malformed search request. Candidate set filed at 18 and revised at 19. Fable completed independently. Mercury recheck: 10 iterations, 8 requests, including one unknown `find_references_regex` tool request followed by the actual `find_references` tool. Kimi's first response ended at its length limit; the recorded second attempt completed. No failure is erased by the eventual response.
- Provider identities: mercury-2, claude-fable-5, kimi-k3; attested and independent. Final authority UNVERIFIED, evidenceChecksPassed=false, rerunRequired=true. The panel's original seats agree on cannot_verify; the recheck separately alleges found_break and Kimi disputes it. Do not flatten those into substantive convergence.
- Zero model-directed `serena_*` calls. The automatic scan covers 23 changed JS files and 15 reference names, but file-level caller discovery and find_references are regex-based leads, not parser-backed completeness.
- The 39-section evidence bundle is 173,508 bytes; all 39 sections and all 66 local artifact/excerpt references checked by the inspector matched their hashes. Nine virtual prompt/tool excerpts differ after ledger sanitization; they are not claimed to match original provider-input hashes. Original stage receipts remain on-box.
- Both before/after index reconciliations pass 9,332 expected/stored chunks; source content unchanged during review and full live collections including vectors unchanged. Twenty-nine eligible files produce zero chunks under the existing policy; this is not proof all configuration JSON is indexed.
- Provider-reported usage: 2,002,992 input and 26,895 output tokens across 33 attempts; reported calculated cost USD 3.67739715, not independently reconciled to billing.

## Citation and coverage adjudication

The prompt is delivered, but the requested exhaustive investigation is NOT established. Mercury's primary answer says no additional unread files are required. Its recheck admits unread files, then says its break is fully supported and further files unnecessary. This is the behavior the new instruction was intended to prevent.

The direct open_file set is six changed files plus unchanged FeeModel.js, not seven changed files. Fable and Kimi's repeated "7 of 25" arithmetic includes FeeModel and is not adopted as our count. The host scan and diff provide other partial evidence; direct open-file count is not a universal coverage denominator.

Current source directly checked after completion:

- `config/settings.json:1167` and `:1203` set tuning-profile absoluteCapPercent to 1; `:1317` sets base maxTotalExposure to .25. The recheck contradicts itself by first calling line 1167 .075, then 1. Actual base fee model is at `:2459-2468`, not primary's `:115-119`.
- `foundation/ConfigLoader.js:1857-1858` contains the sizing relation check. The literal reference search finds its definition at :1846 and invocation at :2711 in the settings-update path. A boot/profile-activation failure was not proven by that save-path call. Kimi correctly challenges the stronger conclusion; no bot fix follows from that allegation alone.
- The recheck claims to have opened run-empire-v2.js; neither pass has that open_file receipt. Its broad absence claims about inherited behavior exceed its delivered source windows.
- Existing builder-style whole-file/INHERITED/FOURTH-SHAPE requirements remain enforced by doctrine-review.js. Their policy fit for a read-only Mercury investigation is unresolved; no flags or ceiling were deleted to turn this run green.

## Retained receipts and limits

`RUN-EXCERPT.json` is a redacted extraction through existing sanitizeForLedger, including actual answers (with their errors), candidate revisions, provider delivery, artifact checks and original receipt hashes. It is NOT the full raw tape. The 8,223,116-byte raw ledger remains at `../mercury-full-chain/candidate-comparison/ledger/2026-09-24.jsonl`, SHA-256 b43602f96c3e14eca916a2d2464b952ade06d21cc2f5375e960d5b979c8b3636. Raw prompt/provider metadata is not all published; named publication omission, no complete-tape claim.

Commands: existing inspect-review.cjs against that ledger produced receipt-inspection.json; existing verify-index.cjs against source-before-index.json produced index-verification-after-review.json. Both exact paths and hashes are retained in the extraction. No source edit occurred until both checks completed.

WHAT I DID: checked the actual chain, artifact integrity, index preservation and consequential citations; preserved failed outcomes.
WHAT I DID NOT DO: establish exhaustive coverage, independent cold-pull acceptance, migrate configuration, roll back the bot, or close Stop 1 in a registry.
WHAT I ASSUMED: none of the model conclusions substitutes for current source or actual consumer behavior.
