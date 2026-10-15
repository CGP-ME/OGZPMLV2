# Environment reconciliation — 2026-10-15

## What the count means

The preserved original has **206 assignments, 206 distinct names, and zero duplicate assignments**. The installed `.env` has **22 assignments**, all retained credential values. The other **184 names and their original values remain in the private full-file archive**. No settings were removed from `config/settings.json` or `config/internals.json` by this archive operation. This is not a reduction to 22 bot settings.

`key-disposition.json` lists every retained and archived name. `archived-key-reconciliation.json` accounts for all 184 archived names, including exact current references and direct historical loader mappings where found. It intentionally does not invent a destination for names that have no verified current owner.

## Proven now

- Installed credential values exactly match the original values (existing installed-verification receipt).
- Bot, dashboard, checkout, supervisor and market-data-tool configurations, source maps and fingerprints are unchanged by the reduction. Poisoning all 184 old process-env keys does not change those role outputs.
- Repeating loads produces identical effective values, sources and fingerprints for all five roles, without modifying either JSON file or `.env` (`repeat-load-proof.json`).
- Neither canonical JSON has duplicate property names. No duplicate-name cleanup was used to produce these results.
- The source map remains available in `effective-sources-before.json`. It identifies actual canonical/derived/credential ownership; this is loader provenance, not every consumer's behavior acceptance.

## Remaining legacy readers found in the expanded source scan

The 571-file literal census includes operational helpers under `ogz-meta`, not just the bot directories. Its full scan scope and excluded large market-data/result JSON files are in `current-key-references.json`.

| File | Archived names | Meaning |
| --- | --- | --- |
| `tuning/pipeline-diagnostic.js:42` and `:45`–`:49` | CANDLE_TIMEFRAME, STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, TIER1_TARGET, TIER2_TARGET, TIER3_TARGET | Standalone old simulator still reads env knobs, global exits and literal substitutes. It is not an accepted production-path proof and has not been repaired by archiving `.env`. |
| `ogz-meta/session-form.js:37` and `:40` | TRADING_MODE, BACKTEST_MODE, TRADING_PAIR | Handoff helper guesses mode/symbol from its own environment; this is not trustworthy running-process provenance. |
| `ogz-meta/gates/multi-runtime-gate-runner.js:612` and `:617` | BACKTEST_MODE | Test harness saves and changes an old env name. This is test setup, not an active-bot setting reader. No gate was run during this audit. |
| `ogz-meta/config_2.js:67` | OLLAMA_URL | Legacy configuration copy retains an env-based endpoint. Current Mercury uses `trai_brain/mercury-bridge/config.js` and `mercury.config.json`; this copy is not evidence of the active endpoint. |

Names with no current literal reference are not automatically declared intentionally retired. The preliminary agent map and semantic counterpart suggestions are investigation leads, not accepted migration provenance. No missing control is silently recreated from a similar name and no old value overwrites later strategy-specific choices.

## Stop 1 acceptance boundary

The existing October 11 whole-configuration map is the starting inventory, not a completion certificate. Stop 1 requires one dynamic and one static owner, initialization and actual consumer evidence, intended effects, idempotent application, and no competing owners, fake aliases, phantom calls or orphan code. Repeated loading was exercised here; repeated saving and all per-setting consumer effects were not.

This audit establishes that shortening `.env` did not change the five application-role outputs. It does **not** establish that the previous migration satisfied all of Stop 1. The outstanding legacy reader findings remain open and must not be described as fixed.

## Runtime and review

The authorized paper position was closed through the running execution engine; the receipt recorded zero remaining positions and paused trading. The final state has not been reset or archived, and the bot has not been recreated with a cleaned PM2 environment. Runtime reload is paused per Trey. Therefore fresh-process environment provenance remains pending.

Dashboard connection work was reassigned to Fable. No dashboard production edits were applied by this lane. Global Mercury reindex remains blocked by the embedding account's exhausted credits; a supplied immutable-source review is distinct from a fresh global index.
