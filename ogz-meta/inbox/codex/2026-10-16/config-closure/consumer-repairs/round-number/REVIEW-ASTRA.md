# Astra adversarial review: round-number trailing consumption

Verdict: **GO for the bounded production change** in tree `bac41b09916728cf71e186e836c003557dc49585` against `e93b21629faa72717e14676b4f13acd47d446b3e`. No concrete introduced defect found. The exact diff adds one round-number adjustment block to `core/ExitContractManager.js`; it does not include unrelated working-tree edits.

Reviewed read-only; no trading imports, tests, PM2 actions, production edits, or runtime mutations performed. All source citations refer to the candidate tree.

## Producer/consumer and unit checks

- The active consumer reads `trade.frozenExitPolicy.profitManagement.trail` at `ExitContractManager.js:740`, preserving per-trade/per-strategy ownership. The new block reads the two existing round-number fields from that object at `:815-816`, not from a mutable global configuration.
- Existing percent-trail distance is divided by 100 at `:770-771`; ATR distance is already fractional at `:772`. The new proximity calculation at `:820-821` is percentage distance, matching ConfigLoader's percent descriptor at `foundation/ConfigLoader.js:3916`. The tightening factor is dimensionless, matching the 0..1 descriptor at `:3920`. Multiplying fractional distance by that factor introduces no factor-of-100 error.
- The nearest-round sequence, percentage-distance comparison, multiplier, and first-match break at `ExitContractManager.js:818-824` match the existing `core/exit/DynamicTrailingStop.js:154-163` algorithm. The shared 1000/5000/10000 increments were not invented for this patch. There is one active ECM block and a break after the first match, so overlapping round levels cannot tighten twice.
- Tightening occurs after existing structure adjustment and before existing minimum/maximum clamping (`ExitContractManager.js:800-839`), the same ordering as the oracle (`DynamicTrailingStop.js:139-167`). A zero tightening factor still proceeds through the existing nonnegative validation and min-distance clamp. Proximity zero does not match even an exact round price, consistent with the existing strict-less-than algorithm.
- Channel trailing returns before this block (`ExitContractManager.js:737-738`); disabled managed trailing also returns early (`:744-745`). Activation checks and direction validation are unchanged. Long/short stop placement and monotonic improvement checks remain after the clamped distance (`:841-855`), so the adjustment cannot loosen an already tighter stop.
- Missing undefined round fields become unavailable through the existing finite conversion and leave the previous distance unchanged. This review relies on the existing canonical numeric policy domain; it does not invent broader malformed-input fallbacks or new execution gates.

## Verification reviewed and identity

Read the actual fixture and saved output in `evidence.md`. The reported isolated run invokes the real baseline/candidate ECM methods and the real pinned DynamicTrailingStop oracle, with selected collaborators stubbed. It covers ATR-based long/short near/away distances, distinct frozen strategy values, and disabled trailing. The near distance changes from 0.004 to 0.0028 for the first policy and to 0.0016 for the second; away distances remain unchanged. Oracle percentage outputs are explicitly divided by 100 for the ECM comparison.

Verified git blob matches:

| Source | Blob |
| --- | --- |
| Base ECM at review base and pinned fixture | `36730ce064fbada852fce7013b195155134908ba` |
| Candidate ECM and pinned fixture | `5f4a8ab2850c2feea91bfea299f8350efd65f421` |
| Existing DynamicTrailingStop and pinned oracle | `97a1b85d337138075e5ed360d63aa1c89cb50081` |

The fixture's older HEAD label does not change these verified source identities. Percent-trailing, channel exclusion, exact threshold, and minimum-floor ordering were reviewed from actual code; the supplied fixture does not execute those cases, and this review does not claim otherwise. It is not a full broker lifecycle or replay test.

The recorded command in `evidence.md` omits the required explicit fixture `ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-baseline/DynamicTrailingStop.js`, although the fixture imports it. Correct that receipt command before describing it as independently reproducible through the launcher. This documentation gap does not change the bounded source verdict or the inspected reported result.

## Mercury qualification

The supplied final answer is JSON with `decision: no_break_found`; it refutes duplicate handling and missing source allegations. Parent reports the transport classification remained `no_claim`. Preserve both facts: this is not rewritten as a clean top-level Mercury transport verdict. This independent source review agrees that neither allegation establishes a break.

No production activation, full-model replay, profitability, unrelated source correctness, or full configuration closure is certified.
