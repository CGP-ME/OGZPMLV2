# Delivered config-group Mercury accounting

Read-only accounting on 2026-10-06. Source: each packet's latest saved
`private/review*-result.json`; the rows do not treat a behavior proof as an
independent-review substitute.

| Delivered commit / group | Latest Mercury run | Reported verdict | Answer quality | Coverage / final adjudication | Review accounting |
| --- | --- | --- | --- | --- | --- |
| `b8b76946` SmartMoneySweep | `2026-10-06T16-06-57-154Z-e0e699d278bd` | `no_break_found` | false: missing file:line, tool handles, unavailable-tool claim | incomplete / authority false; 5 unresolved; final 14 claim IDs missing | Qualified only. |
| `ed770a53` PropSafe sessions | `2026-10-06T16-18-47-665Z-cce1798bee1e` | `no_break_found` | false: missing file:line, tool handles | incomplete / authority false; 2 unresolved; final 5 claim IDs missing | Qualified only. |
| `39a985b8` EMA-retest sessions | `2026-10-06T16-33-15-081Z-334e0e29ee16` | `no_break_found` | false: missing file:line, tool handles | incomplete / authority false; 3 unresolved; final 8 claim IDs missing | Qualified only. |
| `2428123d` EMA periods | `2026-10-06T16-36-53-369Z-64f45a97c310` | `no_break_found` | false: missing file:line, tool handles, unsupported exhaustive-search claim | incomplete / authority false; 3 unresolved; final 4 claim IDs missing | Qualified only. |
| `a4ab7912` PropSafe exit owner | `2026-10-06T16-45-54-722Z-a5346dd2023a` | `no_break_found` | false: missing file:line, tool handles, unsupported exhaustive-search claim | incomplete / authority false; 6 unresolved; final 18 claim IDs missing | Qualified only. |
| `84441cb6` EMA-retest exit owner | `2026-10-06T16-54-36-699Z-91b8c9670792` | `no_break_found` | false: missing file:line, tool handles | incomplete / authority false; 6 unresolved; final 11 claim IDs missing | Qualified only. |
| `ee14e4e9` Donchian exit owner | `2026-10-06T17-13-09-746Z-41fb98d22847` | `no_break_found` | false: missing file:line, tool handles, unavailable-tool claim | incomplete / authority false; 6 unresolved; final 20 claim IDs missing | Qualified only. |
| `44cc4dd6` TSM exit owner | `2026-10-06T17-20-24-859Z-0f3a18df3956` | `no_break_found` | false: missing file:line, tool handles | incomplete / authority false; 5 unresolved; final 9 claim IDs missing | Qualified only. |

## What the metadata establishes

Every latest result reports `no_break_found`, but required final claim
decisions are missing. This is not a clean independent
review because every result has `answerQuality.ok: false`,
`coverage.complete: false`, `coverage.authorityReady: false`, and
`finalClaimAdjudications.structurally_complete: false`.

The receipt records show missing valid provider candidate records and
missing final decisions. This accounting leaves the underlying claims
unadjudicated; those receipt failures alone do not establish a source defect. Likewise, broad
answer assertions such as “all changed paths examined” conflict with those
receipt fields; they are unsupported review claims, not source-verified
migration defects. No corrective source code follows from this accounting.

## Delivery consequence

The requirement for clean pre-commit Mercury review was not established for
these eight already-pushed groups. Later review cannot retroactively change
that sequence. Further production delivery is held pending valid review.
Behavior-proof results and source delivery remain separate from review
clearance and runtime activation. No PM2 restart occurred.
