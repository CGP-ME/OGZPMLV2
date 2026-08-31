# Evidence

> **NOT VERIFIED BY THE FULL ADVERSARIAL LAYER.** Internal run remained
> **UNVERIFIED** because Mercury quota failed, Fable rate-limited to documented
> Opus fallback, and surviving prompt-only seats lacked current-diff evidence.
> Trey explicitly authorized publication for review efficiency so Sol can
> cold-pull the immutable commit. Publication is not clearance; rollback/revert
> remains authorized if Sol rejects it. Mercury/Fable/Kimi deferred check-in
> remains owed.

## Subject identity and scope

- Branch: `codex/multi-asset-symbol-state`
- Predecessor/base SHA: `cf2d9dd2746de1903adc8e7c49fef5a8776e89f7`
- Initial and pre-publication remote tip after fetch: same predecessor SHA
- Exact seven-path implementation/test binary diff SHA-256 before packet:
  `11643a81930d1d962711645add7dceb127f3c81bad0bd2e60a14885ce317ae2c`
- Index remained empty through review and packet construction.
- Part C's separate checkout and 22-file diff were not touched.

## Verification probes

Production syntax:

```sh
node --check trai_brain/mercury-bridge/ask.js && \
node --check trai_brain/mercury-bridge/adversarial-review.js && \
node --check trai_brain/mercury-bridge/run-ledger.js && \
node --check trai_brain/mercury-bridge/reviewer-panel.js
```

Output: `syntax: PASS (4/4)`.

Focused and directly relevant regression suites:

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

Output:

```text
Test Suites: 5 passed, 5 total
Tests:       100 passed, 100 total
Snapshots:   0 total
Time:        1.664 s
```

Other probes:

- `git diff --check`: PASS.
- Explicit `--reviewers=unknown` probe exited 1 before provider dispatch and the
  raw run-directory count remained 0 before and after.
- `git diff --cached --quiet`: PASS; no content was staged before review.
- `node scripts/scan-secrets.js --staged`: nonzero with five inherited test
  fixture findings outside changed line ranges: `test/mercury-consensus.test.js:185`
  and `test/mercury-run-ledger.test.js:64-65,109-110`. After the documented
  `apiKeySource` tape scrub, the scanner reported no packet/tape finding. This
  inherited baseline is a named limitation, not a manufactured green result.

## Live internal runs

All three invoked the broad visible frame `Mercury, break my fix.` with
`--agentic --show-history --adversarial-review --max-iterations=60
--max-tokens=7750` and explicit panel `mercury,fable,kimi`.

1. Run `2026-08-31T04-21-48-960Z-1f89d1c218bc`, ledger
   `ogz-meta/cognition-history/mercury-runs/2026-08-31.jsonl:1`, raw directory
   `2026-08-31t04-20-52-069z-1528250-b745ec3faea8`. UNVERIFIED. It exposed that
   Mercury's in-band HTTP 402 response was incorrectly being counted as a
   successful answer. The implementation was corrected so in-band Mercury
   failure becomes a named failed seat and no Mercury recheck runs.
2. Run `2026-08-31T04-24-11-578Z-bcf631810eb8`, ledger line 2, raw directory
   `2026-08-31t04-23-08-140z-1528666-9db0fc916e8b`. UNVERIFIED. It correctly
   stamped Mercury quota absence but exposed that prompt-only Fable/Opus and
   Kimi could otherwise self-certify evidence. The implementation was corrected
   so prompt-only seats without Mercury or host-attested evidence fail evidence
   checks.
3. Clean post-fix run `2026-08-31T04-25-56-272Z-b074a8852ef8`, ledger line 3,
   raw directory `2026-08-31t04-24-55-816z-1529115-eab863da3d01`.
   Final result **UNVERIFIED**: Mercury failed HTTP 402
   `free_tier_quota_exceeded`, named absence `quota_or_rate_limit`, max ntfy
   sent HTTP 200; Fable primary received machine-classified HTTP 429 and used
   the documented within-seat Opus fallback; Kimi ran as `kimi-k3`. Fable/Opus
   returned `blocked`, Kimi returned `needs_more_evidence`, and both surviving
   seats were correctly stamped `evidenceChecksPassed:false` because neither
   had current-diff/tool evidence. Authority ceiling was `UNVERIFIED`, agreement
   false, and rerun required.

## Ruling 7a tapes and dual hashes

The three exact ledger JSONL lines and every raw provider file in the three raw
run directories were passed through the current exported
`redactSensitiveText` function before being copied into this packet. The raw
stream tapes then received one additional field-safe scrub: non-placeholder
JSON string values whose key is `apiKeySource` were replaced with
`[REDACTED]`, because the repository secret scanner treats that provenance name
as a credential property. The 22 committed payloads are under `tapes/`.
`TAPE-HASHES.tsv` records, for every payload, the secured source path,
original-on-box SHA-256 and byte count, packet path, and redacted-as-committed
SHA-256 and byte count.

Mechanical reproduction checks performed before staging:

- every source existed;
- every packet tape exactly equaled the documented redaction pipeline;
- every original and redacted hash and byte count matched `TAPE-HASHES.tsv`;
- applying `redactSensitiveText` to every packet tape was idempotent.

No provider raw output is committed outside the packet. The source ledger and
raw directories remain secured receipt paths and are cited, not staged.

## Named absences and limitations

- No full adversarial PASS exists. This publication is explicitly authorized
  despite the `UNVERIFIED` result and is not clearance.
- Mercury was unavailable in the clean run due HTTP 402 free-tier quota
  exhaustion.
- Fable primary was unavailable due machine-classified HTTP 429 and used its
  documented Opus fallback inside the Fable seat.
- Surviving prompt-only seats lacked current-diff evidence; their evidence
  checks remained false.
- Live success for every selectable subset/order was not claimed; deterministic
  unit tests cover every nonempty subset shape and ordered dispatch behavior.
- Interactive selection was tested through an injected prompt boundary, not a
  human TTY session.
- Sol desktop cold-pull review is pending.
- Mercury/Fable/Kimi deferred check-in remains owed when quota/rate limits
  clear.
- The staged secret scan remains nonzero solely for the five inherited test
  fixture findings named above; none is in a line changed by this mission.
- No PM2, runtime, broker, activation, environment, main-branch, Part C, Part D,
  or Part E behavior was exercised or changed.
