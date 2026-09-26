# Evidence

Starting source: 1b7bd18839697b8bd8835648eb0154b79374a326. Each provider invocation records exact tracked source bytes before and after, CLI arguments and full raw outputs. Evidence exports must be redacted with original and exported hashes. No live index operation is needed for explicit-target source/diff ingestion.

Not established: deployed configuration consumption, whole Stop 1 acceptance, UI completion, or broker/trading outcomes.

## C001 actual observations

Commands (repo root):

- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/fixtures/donchian-observation.cjs`
- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/fixtures/donchian-caller.cjs`

Original module SHA-256: `86aba035d496787e37da189b12c730b904988b98c2689d66ba6e9b8d9122fe03`.
Candidate module SHA-256: `6d6e8316c8c422f717195a458dbde0b992ba4979473c35a237c24c2c2e8c76d2`.
Clean pulled settings SHA-256: `79e421f038fc859a05b192942f49c3e012eec89b3021ef4d52a3da5c3efaa8fa`.
Actual resolved config fingerprint: `6c7c17074cfdf181d24451d84e5811761d6d64e948afaa62b580fc2c08ea1732`.

Input: existing `tuning/tsla-15m-tiny.json`, 500 recorded candles; hash in each receipt. No candle was invented or changed. Canonical period 20; additional explicit fixture periods 7, 14 and 40. Fixture direction variants false/true do not modify production settings. The recorded configuration fingerprint identifies the base snapshot, not these explicitly listed variants.

`donchian-observation.json`: initial long-only observation, 112 emitted-signal cases. `donchian-both-directions.json`: expanded 339 cases (224 long, 115 short), zero mismatches; all 339 original results used the shared ATR rather than the expected strategy-owned calculation. These are parameter-case observations, not 339 independent trades.

Example at recorded timestamp 1725455700000, TSLA close 210.63, period 20: actual shared ATR 0.8489490768776377; strategy-owned ATR 0.763635000000005. Old stop hint -1.0076307706376555%; corrected -0.9063701751887254%, matching the configured calculation. Confidence changes from 0.6482391079412391 to 0.6592144807401402 under the unchanged extension formula.

`donchian-caller.json`: actual ConfigLoader.load -> StrategyOrchestrator registered Donchian closure -> per-symbol instance -> evaluate, with real IndicatorEngine output and recorded candles. 28 emitted signals, zero stop mismatches. This exercises the registered closure, not full Orchestrator.evaluate or the bot entrypoint.

Diagnostic setup failures retained in the command record: initial provider capture rejected a `..` ledger path before any provider call; corrected to the existing repo-relative ledger mechanism. First snapshot trial omitted required fixture bootstrap inputs; no production source changed. First caller fixture imported the named-export module as a default constructor; corrected the fixture import. These were fixture errors, not new bot findings.

## Adversarial tapes and preservation

`tapes/MANIFEST.json` lists 91 preserved/redacted files (2,596,884 compressed bytes), including provider readiness, both full runs, raw provider outputs, AST/reference evidence, ledger and source-byte manifests. Rehashed all 91 originals, redacted plaintexts and compressed files: zero mismatches. Compared exports against loaded credential values without printing values or secret-derived hashes: zero matches. Private originals remain on-box; exported tapes are the shareable copy.

All three provider identities matched: mercury-2, claude-fable-5, kimi-k3. Review CLI commands and exact source/config identities are in invocation/completion tapes. Both review runs exited 0 with sourceUnchanged=true. Post-fix reviewed module hash matches the exact staged blob. Syntax and staged whitespace checks passed; not treated as behavioral proof.
