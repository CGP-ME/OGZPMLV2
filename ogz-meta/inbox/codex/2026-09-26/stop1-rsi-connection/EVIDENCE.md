# Evidence

Commands (from production repository root):

- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-rsi-connection/fixtures/blast.cjs`
- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-rsi-connection/fixtures/observe.cjs baseline`
- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-rsi-connection/fixtures/observe.cjs final`

Blast tooling: existing Mercury dependency/Serena scanner, 389 JS files scanned / 388 parsed, 42 RSI-field references, 12 contract-method calls. One named parser absence: existing `ogz-meta/ogz-run.js:198` return outside function. Static candidates are not an executable-reachability denominator. StrategyOrchestrator has one discovered production importer; ExitContractManager has four. PolicyBuilder and actual order/exit callers were then read directly. Model scans have their own scoped denominators, not the full host scan's denominator.

Baseline `private/baseline-O5gGIe/receipt.json`: 500 recorded TSLA 15m bars, two input settings (RSI 5/50 and 7/60). The actual orchestrator produced zero entry contracts and 53/41 missing-risk errors. Global ATR disabled only in disposable fixture configuration to reach the affected consumer; only the actual registered RSI closure selected.

First candidate `private/candidate-xCm6Jm/receipt.json`: 53/41 entry contracts, but 33/26 were premature-lookback entries, and PolicyBuilder dropped both RSI fields. This candidate was rejected, not shipped. The root cause of premature entries was Number(null) becoming zero at the existing MA check. It was not a need for a new trading gate.

Final `private/final-tYEEcn/receipt.json`, summarized with original artifact/source/input SHA-256s in OBSERVATION.json:

- Canonical: 20 complete orchestrator RSI entry contracts, no errors, no entries before the configured 200-candle MA lookback.
- Changed RSI period/threshold plus 15m-specific risk: 15 contracts, no errors, correct period 7, threshold 60, stop -1.2%, target 1.4%. The existing timeframe-aware owner is used; the root contract does not silently replace the timeframe contract.
- 105 direct exit-comparison observations cover below/equal/above thresholds. RSI uses strictly above; RSI2 retains its inclusive 80 comparison.
- Actual full exit coordinator, recorded later candles and price history: 13 canonical / 8 changed-contract invalidation exits. These are method executions on fixture trade objects, NOT placed trades or bot execution.
- Same live-in-fixture orchestrator after settings saves: 95/86 new entry contracts carry the changed period/threshold. Prior contracts remain byte-identical; frozen policies retain the original RSI fields. No existing trade is rebound to current settings.
- Six RSI fields persisted through the actual save owner. Fractional period, invalid timeframe, zero exit threshold, and inverted entry/exit thresholds leave the accepted snapshot unchanged. A fresh loader module produces the same configuration fingerprint from saved files.
- Actual selected-frame MA consumer: trading-frame and 220 recorded 1h bars resolve the configured period through the existing per-symbol adapter. An unavailable 4h stream produces named unavailable evidence, not zero or another frame's value. This does NOT prove production higher-frame acquisition.

Exact candidate is fixtures/production.patch. `node --check` passed on its four JS files; `git diff --check` was clean. Syntax checks are not behavior proof. No Jest suite used.

No deployed bot, broker action, production index write, real browser rendering, full trade lifecycle, profitability or completed Stop 1 acceptance claimed. No fourth-shape throws or global trading stops were added. Save-request validation applies only at the existing external settings request boundary. Existing unrelated dirty work is not part of the candidate.

Follow-up `private/final-NPWMmU/receipt.json` / ADJUDICATION.json uses identical production hashes and adds two bounded observations: 60 explicitly synthetic delivered 4h candles resolve the 50-period MA through the real adapter (no 1h aggregation); an explicit legacy RSI trade missing its contract still reaches the existing max-hold exit rather than holding indefinitely. Neither establishes safe reconstruction of missing entry provenance. StateManager.load:4440-4495 preserves restored trade objects without reconstructing those fields; the legacy/default path is reachable in source and remains an inherited defect, not ruled impossible. The read-only persisted data/state-paper.json had zero active trades at inspection; no loaded-process claim follows.

Tape export: `node fixtures/export.cjs 2026-09-26T04-54-19-745Z-bc7fbc2bdab9 2026-09-26T05-06-15-661Z-c40153935431 2026-09-26T05-17-08-244Z-12310c864cbb` (script path relative to this packet). 171 files, 8,684,358 compressed bytes; zero known-credential matches after redactSensitiveText. tapes/MANIFEST.json records original-on-box, redacted-uncompressed and committed-gzip SHA-256 per artifact. All exported gzip bytes and decompressed redacted hashes rechecked successfully. Three review runs and readiness complete with sourceUnchanged=true. Scope and verdict corrections are in REVIEW.md; pass is not deployed acceptance.
