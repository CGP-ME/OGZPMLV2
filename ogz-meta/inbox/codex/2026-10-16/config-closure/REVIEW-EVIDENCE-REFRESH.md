# Review: refreshed provenance evidence

Reviewed source identity: `a2d0872896881f7c0b54242dc4d4c0581ef9b8e1`.
This was a read-only evidence/code review. No source module import, probe, test,
or validator was run.

## Result

**GO for the limited source-accounting evidence.** The refreshed role and
archived-environment artifacts are internally pinned to `a2d08728`, and static
artifact checks confirmed that all four manifest blobs equal that commit's
`ConfigLoader`, two canonical JSON files, and `AtomicWrite` blobs.

- `current-result.json` has six role/profile source maps and no recorded
  failures.
- `current-all-env-result.json` has 184 archived names and six role/profile
  checks. Each records equal config, fingerprint, revisions, and source map
  before injection, with all sentinels injected, and after removal.
- `trace-verification.json` reports 3,974 canonical leaves/empty containers:
  2,281 joined runtime-source rows and 1,693 conditional rows, with zero
  unaccounted paths, duplicate JSON properties, or invalid canonical labels.
- `getter-ast-inventory.json` is pinned to the same ref and reports 288 literal
  calls, 11 computed calls, 13 public accessor calls, zero unsupported bindings,
  and its named three parse errors/static limits.

## Source review

`provenance/refresh-current.py` refuses a join when the manifest or role proof
candidate differs from `--ref`, verifies the four source blobs, retains exact
canonical scalar routes even when their runtime names differ, and keeps the
1,693 conditional-row guard. Its two explicit group projections are narrowly
spelled out (`services.dashboard.stockData → services.marketData.alpaca` and
`services.webhookOrders → webhookOrders`). It does not fan a group label over
every descendant; launch-profile tail matching requires one unique longest
match.

`validate-trace.py` now resolves every `config:<file>:<path>` source label
against the exact pinned canonical owner before accepting the trace. This closes
the earlier failure mode where a nonempty but invented canonical path could be
treated as provenance.

The isolated provenance fixture now checks that every runtime source key exists,
every canonical label resolves, and matching scalar/null values agree with the
label's canonical owner. It deliberately does not assert equality for object or
array projections. The archived-environment fixture now applies all 184
sentinels to six role/profile snapshots and compares values, fingerprints,
revisions, and sources. Its recorded result supports that bounded claim only;
it does not establish runtime activation or every consumer behavior.

## Editable evidence at initial review

`all-editable/current-result.json` currently pins
`9545c26ae3dd3eba46b705ea025c377f1c5727a3` and reports 1,405 passes. It is
not evidence for `a2d08728`, and this review makes no claim about the expected
1,392-field run. Wait for a completed result whose candidate matches
`a2d08728` before updating README or claiming current editable acceptance.

## Completion addendum — 2026-10-16

The replacement `all-editable/current-result.json` was read after the save run
completed. It pins `a2d0872896881f7c0b54242dc4d4c0581ef9b8e1`, reports
`total: 1392`, `passed: 1392`, and an empty failure list. This supersedes the
stale `9545c26a`/1,405-row artifact described above; that earlier finding is
retained as the state at initial review.

**GO for the bounded editable-save claim:** all 1,392 fields in this completed,
same-ref artifact passed the recorded save/restore transport acceptance. This
does not extend the review's runtime, UI-rendering, or every-consumer behavior
limits.

## Limits

This review accepts source identity, canonical-label resolution, and recorded
isolated role/environment outcomes only. It does not accept production runtime,
PM2 state, user-interface rendering, all consumer effects, or deployment.
