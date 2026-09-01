# Selectable Adversarial Panel — Neutral Handoff to Sol

Date: 2026-08-31

Status: **HOLD — UNVERIFIED.** This handoff is evidence for independent review, not a PASS.

> **NOT VERIFIED BY THE FULL ADVERSARIAL LAYER.** Internal run remained
> **UNVERIFIED** because Mercury quota failed, Fable rate-limited to documented
> Opus fallback, and surviving prompt-only seats lacked current-diff evidence.
> Trey explicitly authorized publication for review efficiency so Sol can
> cold-pull the immutable commit. Publication is not clearance; rollback/revert
> remains authorized if Sol rejects it. Mercury/Fable/Kimi deferred check-in
> remains owed.

## Checkout and subject

- Clean review clone: `/opt/ogzprime/OGZPMLV2-selectable-panel-20260831`
- Branch: `codex/multi-asset-symbol-state`
- Base/HEAD: `cf2d9dd2746de1903adc8e7c49fef5a8776e89f7`
- Part C remains held and unchanged in a separate checkout: `/opt/ogzprime/OGZPMLV2-trey-rulings-20260830`
- Review-time index: empty (`git diff --cached --quiet` succeeded before Trey
  authorized the efficiency publication)
- Seven-path binary diff SHA-256: `11643a81930d1d962711645add7dceb127f3c81bad0bd2e60a14885ce317ae2c`

Reproduce the diff hash from the clean clone:

```sh
git diff --binary -- \
  trai_brain/mercury-bridge/ask.js \
  trai_brain/mercury-bridge/adversarial-review.js \
  trai_brain/mercury-bridge/run-ledger.js \
  trai_brain/mercury-bridge/reviewer-panel.js \
  test/mercury-consensus.test.js \
  test/mercury-run-ledger.test.js \
  test/mercury-reviewer-panel.test.js | sha256sum
```

Exact implementation/test paths:

1. `trai_brain/mercury-bridge/ask.js`
2. `trai_brain/mercury-bridge/adversarial-review.js`
3. `trai_brain/mercury-bridge/run-ledger.js`
4. `trai_brain/mercury-bridge/reviewer-panel.js` (new)
5. `test/mercury-consensus.test.js`
6. `test/mercury-run-ledger.test.js`
7. `test/mercury-reviewer-panel.test.js` (new)

This handoff document is outside the seven-path implementation diff and must not be interpreted as implementation scope.

## Focused verification

Syntax command:

```sh
node --check trai_brain/mercury-bridge/ask.js && \
node --check trai_brain/mercury-bridge/adversarial-review.js && \
node --check trai_brain/mercury-bridge/run-ledger.js && \
node --check trai_brain/mercury-bridge/reviewer-panel.js
```

Result: PASS, 4/4 production files.

Focused and directly relevant regression command:

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules \
  /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest \
  test/mercury-consensus.test.js \
  test/mercury-run-ledger.test.js \
  test/mercury-reviewer-panel.test.js \
  test/mercury-llm-config-contract.test.js \
  test/mercury-provider-preflight.test.js \
  --runInBand
```

Result on 2026-08-31: 5/5 suites passed, 100/100 tests passed, 0 snapshots, 1.664 s.

Additional checks:

- `git diff --check`: PASS.
- Unknown explicit reviewer probe: `--reviewers=unknown` exited 1 before provider dispatch; raw-run-directory count remained unchanged.
- No staged content: `git diff --cached --quiet` succeeded.

## Internal adversarial receipts

Broad frame used for all runs: `Mercury, break my fix.` with `--agentic --show-history --adversarial-review --max-iterations=60 --max-tokens=7750`.

Ledger: `ogz-meta/cognition-history/mercury-runs/2026-08-31.jsonl`

### Run 1 — allegation exposed incorrect in-band failure classification

- Run ID: `2026-08-31T04-21-48-960Z-1f89d1c218bc`
- Ledger line: 1
- Ledger-line SHA-256: `6658af73bb5f5f85bc641cde80aee008cfac0acbcb1071bc53559da4d83bc394`
- Raw directory: `ogz-meta/cognition-history/mercury-runs/raw/2026-08-31/2026-08-31t04-20-52-069z-1528250-b745ec3faea8/`
- Result: UNVERIFIED.
- Investigation/disposition: Mercury's HTTP 402 body was incorrectly counted as successful output. The implementation was corrected so in-band Mercury termination/error responses become failed seats and suppress Mercury rechecks.

Raw files:

- `fable_challenger-1.raw`: SHA-256 `62fb54be258f4a6eaf6fdd83255e0bb66532a3ed43d743b2a7bb34254450d05c`, 3786 bytes
- `fable_challenger-stderr-1.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `mercury-1.raw`: SHA-256 `e9f48c4df698a26a4d7eb1169ec99a8651edc2b278dd30abea43f09112235943`, 190 bytes
- `mercury_recheck_1-1.raw`: SHA-256 `e9f48c4df698a26a4d7eb1169ec99a8651edc2b278dd30abea43f09112235943`, 190 bytes
- `opus_challenger-2.raw`: SHA-256 `c40bc03b8977eddaff1e6368fac1291b0634f259e0a685a2798d9ec0dc8e2af9`, 10740 bytes
- `opus_challenger-stderr-2.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `kimi_tie_breaker-1.raw`: SHA-256 `f1725a0672324a4964bdec3e5a390c1e3747f4635cc240a1f5fe971f8e209984`, 2578 bytes

### Run 2 — allegation exposed prompt-only evidence self-certification

- Run ID: `2026-08-31T04-24-11-578Z-bcf631810eb8`
- Ledger line: 2
- Ledger-line SHA-256: `99c8557b4798dc39f5deaafa6f4be78b2f052d3d4962ef2834a0ffd8ad73fda2`
- Raw directory: `ogz-meta/cognition-history/mercury-runs/raw/2026-08-31/2026-08-31t04-23-08-140z-1528666-9db0fc916e8b/`
- Result: UNVERIFIED.
- Named absence: Mercury quota/rate limit.
- Investigation/disposition: with Mercury absent and no host-attested evidence, prompt-only Fable/Opus and Kimi could otherwise have counted themselves as evidence-qualified. The implementation was corrected so those seats fail evidence checks unless backed by successful Mercury, host-attested evidence, or prior evidence-qualified Fable.

Raw files:

- `mercury-1.raw`: SHA-256 `e9f48c4df698a26a4d7eb1169ec99a8651edc2b278dd30abea43f09112235943`, 190 bytes
- `fable_challenger-1.raw`: SHA-256 `c9243ca33fdca3e4e60d3edfaf9d5fea36ad8a0aae9dddbef70e052bfb741f3d`, 3205 bytes
- `fable_challenger-stderr-1.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `opus_challenger-2.raw`: SHA-256 `877482787b62ea0d8a78c9605b52d093d5407d9b6806a1354d4a5e0db0b61c51`, 13273 bytes
- `opus_challenger-stderr-2.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `kimi_tie_breaker-1.raw`: SHA-256 `97836ea363783d6e49d1a2fa2473ce5072167993502fb8f41f6edf987cc66764`, 3374 bytes

### Run 3 — clean post-fix internal run, still not a PASS

- Run ID: `2026-08-31T04-25-56-272Z-b074a8852ef8`
- Ledger line: 3
- Ledger-line SHA-256: `fb45e08207885c91b228f258eecc13030300a95c8dfc4ad31377a498d11c5f16`
- Raw directory: `ogz-meta/cognition-history/mercury-runs/raw/2026-08-31/2026-08-31t04-24-55-816z-1529115-eab863da3d01/`
- Result: UNVERIFIED; authority ceiling `UNVERIFIED`; agreement false; evidence checks false; rerun required.
- Mercury: failed seat, HTTP 402 `free_tier_quota_exceeded`, named absence `quota_or_rate_limit`; max-priority ntfy receipt HTTP 200.
- Fable seat: primary Fable machine-classified 429; documented within-seat Opus fallback applied. Applied models `claude-fable-5` and `claude-opus-5`; auxiliary Haiku telemetry recorded. Verdict `blocked`; evidence checks false because the seat had no current-diff/tool evidence.
- Kimi seat: applied `kimi-k3`; verdict `needs_more_evidence`; evidence checks false because the seat had no current-diff/tool evidence.

Raw files:

- `mercury-1.raw`: SHA-256 `e9f48c4df698a26a4d7eb1169ec99a8651edc2b278dd30abea43f09112235943`, 190 bytes
- `fable_challenger-1.raw`: SHA-256 `2644569151ccce28b7028aae46621435c7f5e04799d5a2ee7959cd7f9458125b`, 3205 bytes
- `fable_challenger-stderr-1.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `opus_challenger-2.raw`: SHA-256 `fa38a3e3b171c1bf0f48f1a3c29ff93474f05f21a5375c4729aa63c34663818f`, 13266 bytes
- `opus_challenger-stderr-2.raw`: SHA-256 `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`, 157 bytes
- `kimi_tie_breaker-1.raw`: SHA-256 `596635de43bdf5fc7ef73025e25def67d8e3cb7340fc2c67ba64d7f00164333f`, 2711 bytes

## Named absences and limits

- No internal panel PASS exists.
- Mercury was unavailable due HTTP 402 free-tier quota exhaustion in the clean post-fix run.
- Fable primary was unavailable due a machine-classified HTTP 429 and used its explicitly documented within-seat Opus fallback.
- Fable/Opus and Kimi had no host-attested current-diff evidence and no successful Mercury evidence in the clean run; both are correctly stamped `evidenceChecksPassed: false`.
- No unavailable live panel combination is claimed as tested.
- Mercury/Fable/Kimi deferred check-in remains due when quota/rate limits clear.
- The accountability packet is complete for Trey's authorized efficiency
  publication. This does not upgrade the internal `UNVERIFIED` result.

## Requested independent judgment

Sol should independently inspect the exact seven-path diff and reproduce the checks above. This handoff does not prescribe a verdict and does not upgrade the internal `UNVERIFIED` authority result.

## Cold-pull resolution — 2026-09-01

The requested Sol substitution was later withdrawn after Fable availability
returned. Trey subsequently ruled selectable independent seats accepted,
shipped, and proven in immutable commit
`ba6be56300e3ece760402d30b7d8dac711e75742`; no additional full-panel rerun is
required merely to clear this side mission. That operator ruling supersedes the
pending-review request above without rewriting the original publication
history or upgrading its internal `UNVERIFIED` run.

Cold-pull target:

```sh
git fetch origin codex/multi-asset-symbol-state
git show --stat --oneline ba6be56300e3ece760402d30b7d8dac711e75742
git diff cf2d9dd2746de1903adc8e7c49fef5a8776e89f7..ba6be56300e3ece760402d30b7d8dac711e75742 -- \
  trai_brain/mercury-bridge/ask.js \
  trai_brain/mercury-bridge/adversarial-review.js \
  trai_brain/mercury-bridge/run-ledger.js \
  trai_brain/mercury-bridge/reviewer-panel.js \
  test/mercury-consensus.test.js \
  test/mercury-run-ledger.test.js \
  test/mercury-reviewer-panel.test.js
```

The separately owed fusion-correction ruling is not inferred or implemented by
this resolution.
