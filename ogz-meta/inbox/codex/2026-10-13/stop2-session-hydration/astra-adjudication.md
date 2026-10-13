# Astra session hydration adjudication

Date: 2026-10-13
Candidate: `e4206b406bde35d10ed98bf0553eea61d58cb480`
Prerequisite/base: `37053c0e2143ac00be01a5c18956d721e6590207`
Scope: SessionRouter transition hydration and runner selected-symbol enumeration only.

Verdict: no reachable introduced failure found in the bounded source review and immutable isolated transition rehearsal. Mercury's `found_break` answer remains recorded; its allegations do not substantiate an introduced regression in this diff.

Producer and ordering evidence, using candidate line numbers:

- The runner supplies its actual instance through `sessionRouter.wire(..., this)` at `run-empire-v2.js:1070`; `core/SessionRouter.js:144-149` stores it as `ctx`. The new hydration calls therefore resolve the real runner method, not an absent optional fixture member.
- SessionRouter constructs both symbol collections as arrays at `113-127`. Returning their normalized full contents in `run-empire-v2.js:1634-1641` is the intended enumeration change, not an added throw or guard. The missing-active-session throw already existed.
- Stocks transition pauses and drains before switching; after setting target session/broker it commits dashboard scope, awaits hydration, attaches the callback, records activation, and resumes (`SessionRouter.js:1530-1546,1583-1599`). Crypto has the same hydration-before-attach/resume order at `1687-1703`. Hydration errors enter the existing failed-safe catch at `1604-1606` or `1708-1710`.
- Hydration selects the new active broker and symbols (`run-empire-v2.js:1693-1706`), supplies that broker and explicit timeframe to scope construction (`1708-1710`), and retains each candle's symbol when merging the scope envelope (`1723-1728`). The envelope returns broker/account/asset/mode/timeframe fields without overwriting symbol (`2193-2200`).

Mercury's pause/shutdown/scope-envelope/silence-limit allegations concern code unchanged by this candidate. Its full-list allegation establishes changed behavior but supplies no failing sequence; labeling enumeration an added throw/guard is inaccurate. This adjudication does not endorse or repair unrelated inherited behavior.

Actual verification: ran `fixtures/candidate-proof.cjs --candidate-ref=e4206b406bde35d10ed98bf0553eea61d58cb480`. PASS for both crypto-to-stocks and stocks-to-crypto transitions, each with two symbols and two frames. All four target REST fixture requests and candle-processing calls completed before target callback attachment and trading resume. The rehearsal loads immutable SessionRouter source and actual extracted runner hydration/symbol methods.

Limits: adapters, StateManager/transition store, scope helper, normalization helpers, and candle processing/storage are in-memory seams. No real REST request, broker order, persistent-state write, PM2 restart, or runtime activation. Empty/unusable REST responses still warn and continue (`run-empire-v2.js:1718-1720`), and missing getCandles still warns/returns (`1693-1696`); those inherited behaviors mean ordering success is not a universal readiness guarantee. The prerequisite replay proof is separate and only repairs retained history; older-than-checkpoint timestamps retain the stated original append boundary. This is not a full runtime activation rehearsal or a claim that every configured symbol receives ongoing subscriptions.
