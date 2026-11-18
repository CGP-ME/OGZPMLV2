# Native observation-frame repair receipts — 2026-11-18

This verifies one Stop 2 dependency: seven native observation frames, with the original five entry-trigger frames. It does not close Stop 2 or establish live activation.

| Observed behavior | Baseline 930cb272 | Staged candidate |
| --- | --- | --- |
| Stock subscription frames, each activation path | 1m/5m/15m/1h/4h | Adds native 30m/1d |
| Startup hydration and per-symbol contexts | Five frames | All seven frames |
| Actual MTF completed-candle snapshot | Five frames | All seven; existing weights retained |
| Entry-dispatch frames | Five frames | Same five; no 30m/1d dispatch |
| Same-bar broker corrections | No repeated decision | No repeated or rewritten decision |
| Paper restored-position eligibility | Five entry frames | Same five entry frames |

[Before](before-receipt.json), [candidate](candidate-receipt.json), and [inherited working dependencies](working-tree-receipt.json) retain exact input/output values, subscriptions, REST calls, MTF snapshots and source hashes. Each symbol has 60 hydration bars plus one stream bar per supported frame. The correction replaces that bar, preserving 61 rows. OHLCV differs deliberately by symbol and timeframe, so relabeling another series cannot satisfy the comparison. Confirmation excludes forming bars beyond the decision boundary. Ten decisions and ten closed-entry-candle observations are recorded for two symbols/five entry frames.

The [native fixture](fixtures/native-frames.cjs) uses actual ConfigLoader, runner registration/hydration/OHLC handler, SessionRouter subscription blocks, Alpaca stream handler, CandleProcessor, CandleStore, indicator engines, StrategyOrchestrator MTF methods and TradingLoop snapshot capture. Broker REST/stream inputs, account scope, transport, persistence and order dispatch are synthetic seams. Full session transitions, live REST entitlement/daily-session finality, order execution and browser rendering are not verified here. Historical synthetic inputs intentionally produce stale-data logging; those logs are not live outage evidence.

Reproduce the delivered source (inside the mandated helper only):

```bash
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-18/stop2-native-observation-frames/fixtures/native-frames.cjs -- node ogz-meta/inbox/codex/2026-11-18/stop2-native-observation-frames/fixtures/native-frames.cjs
```

[Before-run](before-run.json), [candidate-run](candidate-run.json), and [working-tree-run](working-tree-run.json) identify executed commands, fixture hash and zero exits. The first two runs replaced inherited dirty dependency files with base-commit bytes only inside the disposable namespace. Local override files are deliberately excluded from delivery. To recreate those comparisons, use `git show 930cb272:<path>` for each dependency listed in the receipt and apply only the recorded candidate config hunk; do not replace host checkout files. Two preliminary helper setup errors were resolved before these runs: a fixture backtest flag skipped paper hydration, and Node's strict comparison distinguished arrays from the fixture VM. No production change was made to silence those fixture errors.

## Source and review

[Identity](review-identity.json) pins reviewed tree `a9000c55d188a7614f71262ebc34ba6cf69c18e0` and base tree `1e5d0c8117ca9377e69d046717485623c2244ec1`. Every source hash in the candidate execution receipt matches that tree. [Manifest excerpt](review-source-manifest.json) includes relevant files plus the full local manifest reference/hash. The review used source snapshots, not RAG retrieval; no embedding or index-freshness claim is made. The inherited dirty Mercury harness is fingerprinted separately.

[Mercury's complete answer](mercury-answer.md), [receipt](mercury-receipt.json), and [command](review-run.json) retain one neutral dispatch, 36 successful tool calls, `no_break_found`, one completed selected vote and no dissent. Astra/Opus were not selected; there is no multi-model consensus. Coverage/whole-file/inherited-section warnings remain visible. Mercury explicitly did not complete the processor-to-MTF delivery trace; author inspection at CandleProcessor:496/550, StrategyOrchestrator:985-993 and the executable MTF receipt establish that connection independently. The backtest matrix caller at tools/backtest-matrix.py:427 selects the same smallest base frame and does not determine live entry eligibility.

Disposition of review notes:

- Restored trade eligibility deliberately stays at the entry-frame set. Before this split it already excluded 30m/1d; this change does not newly reject a previously eligible timeframe.
- Configured active frame 15m belongs to both sets. Hypothetical edits to future config require their own validation; no substitute timeframe was added.
- Missing-config defaults were not added. Both producer keys are present in the canonical file and resolve through the actual loader.
- Legacy cache writes before the observation gate remain in this component and are traced for removal in the next ownership repair.

Estimated provider cost for this dispatch including Decide: USD 0.04066619. No paid retry and no Jest run/addition.

## Remaining work

Dashboard frame/symbol ownership, canonical-history reader migration, client candle reconstruction and duplicate history fetch still require repair. Native feed behavior and actual rendered paper receipts follow authorized activation. No PM2 restart, environment reload, frontend edit or RAG rebuild occurred for this change. All inherited dirty work is preserved; only the new timeframe-list hunk is included from settings.json.
