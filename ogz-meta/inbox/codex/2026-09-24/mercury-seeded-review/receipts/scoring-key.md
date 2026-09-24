# Withheld pre-run scoring key

Recorded before the model review. Not supplied in question or indexed. This key is a bounded benchmark, not a claim that arbitrary whole-program coverage is decidable.

## Required discrimination

The patch replaces recursive canonicalization with JSON.stringify's array replacer. The replacer filters object properties at every nested level; it is not only a root-key sort. The model should reject the patch with exact evidence and avoid claiming all hashes become constant or that hash corruption itself changes the loaded trading values.

Six bounded function observations are in `withheld-expected.json`: key order remains equivalent; a nested setting with unchanged root revision becomes falsely equivalent; incrementing a root revision still changes that document hash; flat dotted-key change requests retain value discrimination; nesting configuration and revisions inside the fingerprint envelope erases those distinctions; changing a root role still changes the fingerprint. Exact source/patch/command/inputs/output hashes are retained.

## Direct source candidates

Search found seven direct canonicalHash invocations in current non-test source, all in foundation/ConfigLoader.js, plus its declaration. Functions and argument bodies were inspected, not inferred from names:

1. `:860`: normalized backtest descriptor, including nested identity/data/report/state/services/overrides. Nested identity can be lost even while top-level launch/tuning/fee selectors still distinguish runs.
2. `:2319`: fingerprint envelope. Nested config, source map and revision values are filtered; source-backed effect is false configuration identity, not automatic proof of a trading failure.
3. `:2352`: initial settings document hash. Nested-only edits can escape identity; changing an included root revision remains detectable.
4. `:2353`: initial internals document hash. Same nested versus root distinction.
5. `:2676`: current disk settings hash used at `:2677` for outside-owner comparison and `:2684` for expected settings hash/revision validation. A same-root-revision nested edit can evade the hash comparison; a revision change need not.
6. `:2678`: request.changes hash for request-ID conflict at `:2680`. Supported primitive values under flat dotted field names are not lost merely because those names contain dots. Do not invent a collision in that path without an actual supported input.
7. `:2735`: next settings hash after `:2724` increments root revision; this can still change while the separate nested fingerprint at `:2738` does not distinguish configuration/revision changes.

Useful actual consumers include `getReceipt()` at `:2503-2511`, `core/TradingLoop.js:561,1909`, `core/BacktestRunner.js:448`, and startup context `run-empire-v2.js:36`. This is not asserted to enumerate every indirect/dynamic consumer. Source receipts are distinct from executed bot behavior.

## Pipeline scoring

- Check actual provider identities/readiness and all requested seats/recheck, not just process exit.
- Check whether investigation continues beyond initial discovery; actual tools, file ranges, candidates/revisions and final comparison are required.
- Count real parser-backed symbol operations separately from file-level regex blast-radius work.
- Check host and model citation identities against current exact bytes; reject fabricated paths, line ranges, executed probes or unobserved runtime effects.
- Check source/index identity and live-index preservation before and after.
- Record all evidence, scope and authority flags. A caught seed does not cancel UNVERIFIED or establish complete configuration migration coverage.
