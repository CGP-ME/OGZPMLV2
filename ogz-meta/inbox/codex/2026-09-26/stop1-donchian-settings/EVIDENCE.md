# Evidence

Existing finding C005 points to the actual Donchian producer's explicit null trailingStopPercent/trailingActivation and the orchestrator normalizer's contrary numeric requirement. Source lead, not completion proof. Existing Mercury AST/dependency tooling and direct recorded-candle observations will be retained here. No runtime activation or final UI inventory claimed.

Commands from repository root:

- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-donchian-settings/fixtures/blast.cjs`
- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-donchian-settings/fixtures/observe.cjs baseline`
- `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-donchian-settings/fixtures/observe.cjs candidate`

AST/dependency enumeration: 389 scanned / 388 parsed JS files, 103 selected property references, 27 selected method calls. Importer counts: DonchianBreakout 1, StrategyOrchestrator 1, ConfigLoader 62. Known parser absence: ogz-meta/ogz-run.js:198 return outside function. These are candidates, not a claim that 62 whole consumers executed. Original source-file hashes and candidates in private/blast.json, copied redacted into the packet tapes.

Baseline private/baseline-74El8J/receipt.json: actual complete StrategyOrchestrator.evaluate restricted to its real Donchian registration, 500 recorded TSLA 15m bars, fixture ATR filter disabled to reach the consumer. Zero contracts and 28 errors, all `trailingStopPercent must be numeric ... null`; five-field UI save unsupported.

Candidate private/candidate-BRs1XI/receipt.json supplies the source-hashed OBSERVATION.json used in review. Additional execution private/candidate-TGETFq/receipt.json uses identical production bytes and routes saves through the actual WebSocketManager.handleSettings receiver (fixture socket; inert unrelated eager state/narrator imports):

- 28 canonical contracts; changed entryPeriod=10, atrPeriod=7, atrStopMult=3, allowShorts=true, trailChannelBars=5 produce 84 contracts including 39 sell-direction signals. These are signals, not placed short orders.
- A second, explicitly artificial symbol identity using those same TSLA candles produces the same 84 contracts in a separate strategy instance. This proves scoped instance delivery, not a second market's data or trading success.
- Existing TSLA instance retained across saves. Turning allowShorts back to false produces 45 contracts and zero short signals. Zero errors in all four executions.
- Every emitted stop equals the configured ATR-period calculator times the configured multiplier at that bar. Entry/ATR periods reach the retained object's warmup; channel period reaches the entry-owned contract and frozen PolicyBuilder contract. Null TP/trailing/hold meanings retained.
- 110 channel-boundary comparisons against actual later recorded bars. Full ECM exit coordinator on the same entry contracts returns 46 channel_trail and 64 invalidation exits; this is method execution on fixture trade objects, not broker fills or a complete lifecycle.
- The bot-side handler emitted eight correlated responses and two successful settings-applied callbacks. Fractional channel/entry periods, zero ATR period/multiplier and string false are rejected without changing the accepted fingerprint. Real AtomicWrite persistence and a fresh ConfigLoader module agree on the saved fingerprint.
- Old contracts and frozen policies remained unchanged after the edits. Explicit historical ATR-contract tuning override is not exercised/certified; see INHERITED.md. Canonical settings disable it.

No Jest, bot boot, production socket, PM2 restart, broker order, live index change, profitability or completed UI migration claimed. Syntax checks and production diff whitespace checks passed, separately from the behavior receipts.

Export command: `node ogz-meta/inbox/codex/2026-09-26/stop1-donchian-settings/fixtures/export.cjs 2026-09-26T06-36-35-839Z-e26a3640fb80`. 35 redacted files, 3,241,277 compressed bytes, zero known-credential matches. tapes/MANIFEST.json records original, redacted and compressed hashes; all rechecked. Staged source SHA-256s matched the observed/reviewed candidate for all three changed files and both unchanged contract consumers. Staged secret scanner passed 18 text files, skipped 35 gzip files whose plaintext had been separately redacted and checked. Source whitespace checks passed; saved unified-diff context spaces are literal evidence, not production whitespace edits.

After confirmed push and fast-forward pull of ed45313ea33815a9350c510ca61e104531a1f425, `NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/inbox/codex/2026-09-26/stop1-donchian-settings/fixtures/observe.cjs cold` reproduced the same observations. All five source hashes (three changed owners plus ECM/PolicyBuilder) match OBSERVATION.json; clone tracked diff empty. Original/redacted/gzip hashes and exact cold receipt paths are in tapes/COLD-MANIFEST.json. Production remains untouched.
