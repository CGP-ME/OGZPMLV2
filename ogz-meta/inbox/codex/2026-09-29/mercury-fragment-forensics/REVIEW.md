# Review status

The exact six-file source-backed repair passed its focused offline transport/qualification checks. `../claim-repair-independent/REVIEW.md` independently found no confirmed correctness blocker in the same overlay and verified all six implementation hashes. Its boundaries and unresolved capacity/convergence limitations remain applicable.

Four existing Jest suites are not green: pinned baseline and repair each have 92 passed and 25 failed tests, with identical failed test names. These inherited failures are documented in verification-proof.json and were not silently waived or relabeled as passing.

External Mercury approval is pending parent execution. This packet is not authorization to commit an unreviewed production change or activate runtime. No external review result is fabricated here.

The delivery builder reconstructs the previously reviewed bytes exactly. No production behavior or implementation hash changed during packet finalization. The stage allowlist excludes duplicate source trees, private data, provider tapes and full logs.

## Prepared provider runner (not launched)

`review.cjs` pins execution to committed harness6bcfad8a25f72cb9e1eb946e854695913b2133c4, selects immutable candidate/base refs from a JSON identity file, and verifies the six candidate/base file hashes against IMPLEMENTATION.json. It rejects unrelated tool-adapter changes; matching all six hashes also excludes temperature-only edits. The prompt begins `Mercury, break my fix.` and states only the factual purpose plus a source-evidence requirement. Mercury/Fable/Kimi receive maxTokens7750 with no maxIterations property. No prior findings, path list or hidden opening strategy is added to the prompt.

Parent invocation after staging and recording CANDIDATE.json:

```sh
node ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/review.cjs --identity ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/CANDIDATE.json --check
node ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/review.cjs --identity ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/CANDIDATE.json
```

`--describe` prints the prompt/options without loading a provider. `--check` validates the selected identity without provider calls or writes. Actual launch writes private invocation/result receipts under this packet. The runner was prepared and syntax-checked only; external provider approval remains pending.

## Final external review

Run 2026-09-29T13-15-11-292Z-92d87fb87f39 returned pass on candidate 52150020787fddc8329b5445c66beb519d27c74e against 9f70cf8c4a9795a37d7d764e8a141b3f25e46e17, using committed harness 6bcfad8a25f72cb9e1eb946e854695913b2133c4. Mercury/Fable/Kimi, maxTokens7750, no iteration ceiling, no quarantine. Initial Mercury found_break and Fable cannot_verify were not a unanimous initial pass: Mercury recheck finished at31iterations with no_break_found; Kimi adjudicated pass with no remaining substantive disagreement. Full redacted receipts preserve initial allegations and their refutation. The claim-receipt rejection and request-envelope outcomes are review-pipeline enforcement, not new bot trading gates.

Limits: the reviewers did not execute code. Root independently ran historical-allegation replay and retained-source reduction checks against the exact staged tree; ROOT-CANDIDATE-PROOF.json records source and output identities. The broad assertion that claimAdjudicationReceipt can never throw is not adopted: the evidenced claim is that malformed model JSON is caught and recorded. Existing92pass/25fail comparison remains unchanged. The next config review will exercise this repaired harness through actual providers; this review used the prior committed harness.
