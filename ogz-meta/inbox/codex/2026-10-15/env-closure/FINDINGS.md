# Archived environment-name current disposition

`current-disposition.json` classifies every name in the existing 184-name archive without reading private values or expanding the source audit.

- **25** names have exact historical-runtime-path to captured-current-source joins. These are owner evidence only; the JSON does not assert a historical value migrated.
- **148** have no current reader in the stated existing scan and no exact join. They remain retained in the private archive. This result does not say that their associated feature was intentionally retired.
- **1** platform setting, `NODE_ENV`, is owned by the PM2 ecosystem configuration at `ecosystem.config.js:20,33,46,78`.
- **10** actual direct readers remain in standalone tooling or harnesses: `BACKTEST_MODE` in `ogz-meta/gates/multi-runtime-gate-runner.js:612` and `ogz-meta/session-form.js:37`; `TRADING_MODE` and `TRADING_PAIR` in `ogz-meta/session-form.js:37,40`; `OLLAMA_URL` in `ogz-meta/config_2.js:67`; and `CANDLE_TIMEFRAME`, `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TIER1_TARGET`, `TIER2_TARGET`, and `TIER3_TARGET` in `tuning/pipeline-diagnostic.js:42,45-49`.

No archived name has a direct named `process.env` reader in the scanned PM2 bot entry/module evidence. `run-empire-v2.js:1380-1389` receives resolved ConfigLoader fields, and `foundation/ConfigLoader.js:2248-2277` limits bot bootstrap inputs to `PROFILE`, `DOTENV_CONFIG_PATH`, and `BACKTEST_RUN_DESCRIPTOR_PATH`, which are outside this archive. The ConfigLoader credential funnel also has an explicit bot allowlist at `foundation/ConfigLoader.js:358-381`; none of the archived names is in it.

The result is bounded evidence, not a proof about arbitrary dynamic external code. Non-reader literal references are retained per name in the JSON so diagnostics, comments, strings, and field names are not confused with environment reads.

The harness assignment at `multi-runtime-gate-runner.js:617` is a write, not a reader. The four standalone reader files above are absent from the post-reload bot module cache in `runtime-after.json`.
