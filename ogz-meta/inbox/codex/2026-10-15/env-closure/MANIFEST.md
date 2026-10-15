# Bot environment reload evidence

Source: live `codex/archive-legacy-env` at `c17013e5828c28485a55fb6fbfcc0e1196440c09`, including the pre-existing dirty working tree qualified by runtime source hashes. Captured 2026-10-15 UTC following Trey's authorization to finish the env work. Kept to distinguish the archived file, PM2 environment, and actually loaded configuration.

## Completed operation

Only `ogz-prime-v2` was recreated from `ecosystem.config.js`, using platform environment names rather than inheriting the old PM2 application's env. PM2's installed `God/ActionMethods.js:405` merges restart env; a normal restart would retain removed names. Original PM2 definition, persisted paper state, previous resurrection dump and logs were privately preserved before changing the process registration. No ledger reset or trading resume was performed. PM2's resurrection dump was saved after verification.

- PID changed from 2895852 to 2943769. Paper profile and execution mode verified from the actual new process.
- Persisted and actual runtime state: paused, zero positions; existing operator pause reason preserved.
- Runtime, `/proc` environment and saved PM2 dump contain none of the archived settings except `NODE_ENV`, explicitly owned by the existing ecosystem definition.
- Credentials remain in the 22-entry `.env`, read through ConfigLoader; none of those credential names is injected into the new bot process environment.
- Actual loaded fingerprint is unchanged: `88b2ae90eb28b337c37049e7feb4f3c06bc48b860e589124d8cb4bca2577e654`. All 2,623 source-map entries match the pre-archive receipt exactly.
- All 157 loaded repository scripts match current disk hashes. Before reload, the only script difference was removal of the three unused ConfigLoader aliases already pushed in `4fff6549`. Module-cache membership is not claimed identical: the after sample had not loaded DecisionLedgerSchema.
- Startup log confirms entries blocked for the preserved operator pause; market candles continue arriving. This is startup/provenance verification, not a trading or dashboard acceptance test.

## Evidence

- `current-disposition.json`, `FINDINGS.md`: every archived name classified with bounded evidence. 25 exact owner joins, ten names still read by standalone tooling, one platform-owned name, 148 with no current reader found in the stated scan. Historical value equivalence is NOT asserted.
- `reload-receipt.json`: before/after PM2 process identity and names only.
- `runtime-before.json`, `runtime-after.json`: read-only local inspector source hashes and loaded module names, no source bodies or credentials.
- `runtime-verification.json`: actual runtime mode/state, source-map equality, `/proc` key check and saved-dump check.
- `REVIEW.md`: independent review and resolved correction.

## Remaining scope

This completes the bot's clean environment reload, not full Stop 1 acceptance. WebSocket and supervisor retain their prior environments (184 archived names each) and were not restarted; their PIDs are unchanged. Stripe is unchanged. Ten archived names retain standalone tooling readers; those tools were neither rewritten nor retired. Backtesting and frontend repairs were not performed. The 148 no-reader findings do not prove intentional feature retirement. Existing bootstrap inputs and computed credentials remain separate from the two settings owners.

Reload logs also show an existing scope-label discrepancy: ingress traces describe Alpaca/stocks while accepted candle traces describe Kraken/crypto. Retained here as an observation, not silently presented as clean trading-path acceptance or fixed during env work.

Private originals, process environments, loaded source bodies and log samples stay in `private/` and are not included in this commit. No new production code or configuration values were changed in this operation.
