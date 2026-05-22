# Repo History Snapshot

Generated: 2026-05-22T18:31:03.990Z
Repo root: /opt/ogzprime/OGZPMLV2
Branch: rebuild/clean-from-baseline
HEAD: c5923ca03255cb70df25bcc6178fcdbb1c168a52
HEAD short: c5923ca03255
Upstream: origin/rebuild/clean-from-baseline
Origin: https://github.com/CGP-ME/OGZPMLV2.git
Commit count: 1228
Root commit: c3e94a5844547f0e00e85787018516529f5a6508
Recent commit limit: 80

## Purpose

GitHub source archives and downloaded zip files do not include the .git
directory. This tracked snapshot preserves recent commit history inside the zip.

The snapshot is generated from committed git history only. It intentionally does
not serialize the local working tree, untracked files, secrets, or broker state.

Self-reference note: when the pipeline creates a metadata commit containing this
file, this file records history through the commit that existed immediately
before the metadata commit. A file cannot reliably contain its own final commit
SHA without changing that SHA.

## Recent Commits

```
c5923ca 2026-05-22T18:30:57Z Fixed gap recovery symbol timeframe routing
6ceeac1 2026-05-22T18:22:47Z Updated repo history snapshot
0cc5e9a 2026-05-22T18:22:36Z Fixed live candle timeframe provenance
a8b6714 2026-05-22T18:06:31Z Updated repo history snapshot
0a6f159 2026-05-22T18:06:13Z Added repo history snapshot automation
df1273a 2026-05-22T17:59:18Z Added Mercury ack resume pipeline support
9f36d3d 2026-05-22T17:31:37Z Added signal-lineage diagnostics
b58b142 2026-05-22T17:27:07Z Added multi-file write pipeline support
49704e4 2026-05-22T16:27:31Z Updated full visibility session form with persistence proof
f1eaf3b 2026-05-22T16:19:36Z Added full visibility runtime session form
548ae2b 2026-05-22T16:15:38Z Fixed smoke test harness contracts
a555548 2026-05-22T16:15:28Z Fixed stale recovery mode cleanup
68c56d1 2026-05-22T16:15:13Z Added no-signal strategy diagnostics
730b5ea 2026-05-22T16:15:00Z Added live pattern observation recording
2b8a082 2026-05-22T16:14:39Z Fixed liquidity sweep sub-minute interval detection
a67447d 2026-05-22T16:14:27Z Fixed active timeframe duplicate candle analysis
042e238 2026-05-22T10:23:45Z Fixed broker symbol routing into candle analysis
d49ffa6 2026-05-21T22:23:43Z Fixed structure-aware trailing stop wiring
299b5b7 2026-05-21T14:58:30Z Added daily alignment maintenance automation
32dc010 2026-05-21T14:40:54Z Added KILL 5 immutable scope deployment runbook
4bb887e 2026-05-21T14:30:58Z Fixed immutable trade scope before entry state writes
5434128 2026-05-21T05:16:45Z Added cold-start agent alignment bootstrap
6f08c82 2026-05-21T04:38:24Z fix: remove SHORT phantom exit contract fallback
3cc0dae 2026-05-21T04:32:30Z fix: remove BUY phantom exit contract fallback
efcc7ae 2026-05-21T01:39:55Z fix: propagate exit contract creation failures
fc8d53b 2026-05-21T01:21:11Z fix: split boosted confidence from public confidence
2866ee4 2026-05-20T18:32:30Z fix: derive backtest symbol env from candle files
50161b3 2026-05-20T17:42:02Z fix: clamp trading confidence before sizing
d38dc34 2026-05-20T11:10:40Z chore(alignment): add cold-start entry path
673e301 2026-05-20T06:21:04Z chore(pipeline): track P0 anchor helpers and Mercury acks
ce89e2e 2026-05-20T06:19:26Z chore(meta): untrack generated health and hook artifacts
6d8c2c6 2026-05-20T06:15:46Z chore(gitignore): hide generated local artifacts
16b97c9 2026-05-20T04:56:37Z chore(architecture): add SessionRouter saga sign-off docs
4e25540 2026-05-20T02:52:40Z chore(architecture): add liquidation timing addendum
a009358 2026-05-20T00:11:43Z chore(alignment): add verified OGZ alignment docs
0c789b6 2026-05-19T22:52:59Z chore(architecture): Codex design docs and emoji cleanup manifest
108a988 2026-05-19T22:51:56Z chore(sessions): add session docs since 2026-05-10
fab2296 2026-05-19T22:50:46Z chore(proof): update track-record index
1cb2eaf 2026-05-19T22:48:14Z chore(doctrine): raise critic-attack iterations + one-question-one-answer hookify + grand-scheme edits
e3098de 2026-05-19T22:46:42Z pipeline(fix-34-40a): land write-gate specs
0674d66 2026-05-19T22:42:07Z pipeline(fix-40a): MISSION-1779230198633
f859b89 2026-05-15T07:12:56Z chore(spec): mark Fixes 30 as FIXED with commit SHAs
decab0c 2026-05-15T07:12:55Z fix(trade-journal): Fix 30 stats invariant guard in _updateStats
961f0b7 2026-05-15T03:22:27Z chore(spec): mark Fixes 29 as FIXED with commit SHAs
ac7cf18 2026-05-15T03:22:26Z fix(backtest-recorder): Fix 29 remove $10K phantom (Fix 13 sibling site)
8b7b9f5 2026-05-15T03:13:29Z chore(spec): mark Fixes 28 as FIXED with commit SHAs
0cc6163 2026-05-15T03:13:28Z fix(trading-config): Fix 28 add envNumber() strict helper (two-block patched)
ad4391e 2026-05-14T17:47:48Z chore(spec): mark Fixes 27 as FIXED with commit SHAs
43d0f4c 2026-05-14T17:47:47Z fix(trade-journal-bridge): Fix 27 balance coerce + ?? with correct spread order
476ea59 2026-05-14T13:33:02Z chore(spec): mark Fixes 13 as FIXED with commit SHAs
6aa2d64 2026-05-14T13:33:00Z fix(trade-journal): Fix 13 refuse phantom $10K startingBalance fallback
013e2b3 2026-05-14T08:10:49Z chore(spec): mark Fixes 22 as FIXED with commit SHAs
17d3fc7 2026-05-14T08:10:48Z fix(pipeline): /spec-update-status oldStatus null-safe when Status inserted
1bbcbfa 2026-05-14T08:10:03Z fix(pipeline): /spec-update-status inserts Status line when missing
94db97f 2026-05-14T08:08:04Z fix(max-profit-manager): Fix 22 unify tier-target `||`-collapse to .get(default)
44198f3 2026-05-14T08:02:29Z chore(spec): mark Fixes 23 as FIXED with commit SHAs
c64daa1 2026-05-14T08:02:28Z fix(strategy-orchestrator): Fix 23 CRIT-09 mirror at line 894 (was HALF-FIXED MIRROR)
863dd61 2026-05-14T01:17:44Z chore(spec): mark Fixes 17 as FIXED with commit SHAs
e23ebe7 2026-05-14T01:17:43Z fix(order-executor): Fix 17 wire absolute position cap (was DEAD CONFIG)
c60ccb2 2026-05-14T01:10:20Z chore(spec): mark Fixes 24 as FIXED with commit SHAs
203f087 2026-05-14T01:10:15Z fix(backtest-recorder): Fix 24 BacktestRecorder symbol guard
776f4bb 2026-05-14T00:44:08Z feat(pipeline): add /mercury-attack + /anchor-verify-post stages to --write
16db6c1 2026-05-14T00:34:58Z chore(spec): mark Fixes 16 as FIXED with commit SHAs
0a9ce7f 2026-05-14T00:34:53Z fix(order-executor): Fix 16 webhook fractional-asset qty=0 skip-emit guard
745cb60 2026-05-14T00:06:08Z fix(pipeline): override spec_source in EXECUTE when fresh one is passed
883c45a 2026-05-14T00:05:36Z chore(spec): mark Fixes 15 as FIXED with commit SHAs
ae5cb67 2026-05-14T00:03:07Z fix(config-loader): Fix 15 broker-coherence IIFE refactor
36781d1 2026-05-13T23:26:16Z fix(pipeline): /spec-update-status auto-pushes after commit
847b85e 2026-05-13T23:25:27Z chore(spec): mark Fixes 1, 2, 3, 4, 5, 6, 10, 11, 12, 14, 26 as FIXED with commit SHAs
bbaecf6 2026-05-13T23:25:18Z feat(pipeline): --mark-fixed flag — spec-doc status updater
9935663 2026-05-13T23:10:09Z fix(session-router): Fix 14 _activateCrypto BTC-USD fallback
eeee2e7 2026-05-13T23:07:58Z fix(trai-core): Fix 12 BTC asset label fallback
f450d30 2026-05-13T23:05:54Z fix(trai-decision): Fix 11 BTC-USD fallback in signal recording
3442d24 2026-05-13T23:03:36Z fix(indicator-engine): Fix 10 throw on missing symbol in constructor
0d6538a 2026-05-13T23:00:57Z fix(symbol-trading-context): Fix 26 thread symbol into IndicatorEngine config
782a981 2026-05-13T22:58:27Z fix(spec-parser): boundary regex matches H1/H2 headings
ee9edad 2026-05-13T20:58:08Z chore(frontend): refresh ssl-server + chart-panel + tombstone system-snapshot
498a16e 2026-05-13T14:29:36Z fix(state-manager): P1-A trade.size stale after partial close — ANCHOR SHIFT
4d56a02 2026-05-13T13:34:34Z fix(order-executor): TIER-2-EXECUTE-CATCH differentiate audit throws
d54e48d 2026-05-13T13:13:20Z fix(order-executor): P2-B warn when tradeId not found, fallback to oldest
```

## Recent Commits With Stats

```
commit c5923ca03255cb70df25bcc6178fcdbb1c168a52
short c5923ca
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T18:30:57Z
subject Fixed gap recovery symbol timeframe routing

 core/CandleProcessor.js     | 43 +++++++++++++++++++++++++++++++++----------
 test/symbol-routing.test.js | 43 +++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 76 insertions(+), 10 deletions(-)

commit 6ceeac1fbb099b31682a73c0abab1e337428889b
short 6ceeac1
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T18:22:47Z
subject Updated repo history snapshot

 ogz-meta/REPO-HISTORY.md | 56 ++++++++++++++++++++++++++----------------------
 1 file changed, 30 insertions(+), 26 deletions(-)

commit 0cc5e9ad4e81945dd1cbf460283642cf2cbde8c1
short 0cc5e9a
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T18:22:36Z
subject Fixed live candle timeframe provenance

 core/CandleProcessor.js                            |  23 +-
 ...DLEPROCESSOR-NEW-CANDLE-TIMEFRAME-2026-05-22.md |  43 ++
 ...EX-SPEC-LIVE-TIMEFRAME-PROVENANCE-2026-05-22.md | 481 +++++++++++++++++++++
 .../MISSION-1779472454536-mercury-ack.txt          |   2 +
 run-empire-v2.js                                   |  40 +-
 test/symbol-routing.test.js                        |  22 +-
 tools/instrument-env.js                            |  28 +-
 7 files changed, 605 insertions(+), 34 deletions(-)

commit a8b6714b6fc40f4d8e7bad6576504f332957f13a
short a8b6714
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T18:06:31Z
subject Updated repo history snapshot

 ogz-meta/REPO-HISTORY.md | 1440 ++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 1440 insertions(+)

commit 0a6f159af99b7b5c7ac77dc4a53de992b8b3dbaf
short 0a6f159
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T18:06:13Z
subject Added repo history snapshot automation

 ogz-meta/pipeline.js           |   4 ++
 ogz-meta/slash-router.js       |  98 ++++++++++++++++++++++++++++++++
 scripts/update-repo-history.js | 126 +++++++++++++++++++++++++++++++++++++++++
 3 files changed, 228 insertions(+)

commit df1273a9e09afec0fc8cadcfce3a6acc445be879
short df1273a
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T17:59:18Z
subject Added Mercury ack resume pipeline support

 ogz-meta/pipeline.js | 47 +++++++++++++++++++++++++++++++++++++++++------
 1 file changed, 41 insertions(+), 6 deletions(-)

commit 9f36d3d6dcec603366f2226fc42c2cb3114dc9cc
short 9f36d3d
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T17:31:37Z
subject Added signal-lineage diagnostics

 core/StrategyOrchestrator.js |  28 ++++++++-
 core/TradingLoop.js          | 133 ++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 158 insertions(+), 3 deletions(-)

commit b58b1422a0412cfdf0b0ba8f7d3f110e690ebb23
short b58b142
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T17:27:07Z
subject Added multi-file write pipeline support

 .../MISSION-1779470782185-WRITE-PROPOSAL.md        |  55 +++++
 .../pipeline-multifile-write-smoke-spec.md         |  37 ++++
 ogz-meta/slash-router.js                           | 222 ++++++++++++---------
 ogz-meta/spec-parser.js                            |  92 +++++++--
 4 files changed, 297 insertions(+), 109 deletions(-)

commit 49704e4a2dbfc93df5a5389924f5d337bf92cf21
short 49704e4
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:27:31Z
subject Updated full visibility session form with persistence proof

 ...-2026-05-22-full-visibility-runtime-integrity.md | 21 +++++++++++----------
 1 file changed, 11 insertions(+), 10 deletions(-)

commit f1eaf3bbde61f8e72a1fdfeb73e1b34ff3029a55
short f1eaf3b
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:19:36Z
subject Added full visibility runtime session form

 ...2026-05-22-full-visibility-runtime-integrity.md | 183 +++++++++++++++++++++
 1 file changed, 183 insertions(+)

commit 548ae2b3251edca2b11de058c74d3c1db3373637
short 548ae2b
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:15:38Z
subject Fixed smoke test harness contracts

 scripts/smoke-test.js | 33 ++++++++++++++++++++++-----------
 1 file changed, 22 insertions(+), 11 deletions(-)

commit a555548846c2b600b597945c77f6e40f967be53e
short a555548
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:15:28Z
subject Fixed stale recovery mode cleanup

 core/StateManager.js | 16 ++++++++++++++++
 1 file changed, 16 insertions(+)

commit 68c56d1e48a6bb4ee314fe2d0a0ac0556dec48f8
short 68c56d1
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:15:13Z
subject Added no-signal strategy diagnostics

 core/StrategyOrchestrator.js | 32 +++++++++++++++++++++++++++++++-
 1 file changed, 31 insertions(+), 1 deletion(-)

commit 730b5eafa2489c05025d3e35a09376bbb02d491e
short 730b5ea
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:15:00Z
subject Added live pattern observation recording

 core/TradingLoop.js | 21 ++++++++++++++++++++-
 1 file changed, 20 insertions(+), 1 deletion(-)

commit 2b8a0827c6a026f6cccfdad1781a19e3f90b7df1
short 2b8a082
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:14:39Z
subject Fixed liquidity sweep sub-minute interval detection

 modules/LiquiditySweepDetector.js     | 12 ++++++--
 test/liquidity-sweep-interval.test.js | 52 +++++++++++++++++++++++++++++++++++
 2 files changed, 62 insertions(+), 2 deletions(-)

commit a67447d4b3ae14976dee2475cad533027a9e7e54
short a67447d
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T16:14:27Z
subject Fixed active timeframe duplicate candle analysis

 run-empire-v2.js | 34 +++++++++++++++++++++++++---------
 1 file changed, 25 insertions(+), 9 deletions(-)

commit 042e23871961392cfb82d079f9ad114a1d502d2e
short 042e238
author CGP-ME <cgp@ogzprime.com>
date 2026-05-22T10:23:45Z
subject Fixed broker symbol routing into candle analysis

 brokers/AlpacaAdapter.js        |   7 +--
 brokers/KrakenIBrokerAdapter.js |  23 ++++++--
 core/CandleProcessor.js         |  64 ++++++++++++++++-----
 core/TradingLoop.js             |   1 +
 run-empire-v2.js                | 120 +++++++++++++++++++++++++++++++---------
 test/symbol-routing.test.js     |  97 ++++++++++++++++++++++++++++++++
 6 files changed, 261 insertions(+), 51 deletions(-)

commit d49ffa640c88603e2e493bce0798b7dc592b9cb9
short d49ffa6
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T22:23:43Z
subject Fixed structure-aware trailing stop wiring

 CHANGELOG.md                                       |   7 +
 core/MaxProfitManager.js                           | 148 ++++++++++++++++-----
 core/TradingLoop.js                                |  47 ++++++-
 ...on-2026-05-21-kill7-structure-aware-trailing.md |  67 ++++++++++
 4 files changed, 235 insertions(+), 34 deletions(-)

commit 299b5b79fb8fd7ef4cdbfb98146de920176fcca3
short 299b5b7
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T14:58:30Z
subject Added daily alignment maintenance automation

 ogz-meta/Alignment/README.md                       |   6 ++
 .../daily-alignment-maintenance-prompt.md          | 105 +++++++++++++++++++++
 ogz-meta/automation/daily-alignment-maintenance.sh |  58 ++++++++++++
 3 files changed, 169 insertions(+)

commit 32dc0104125fc7a2221ee0720df837a462e83650
short 32dc010
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T14:40:54Z
subject Added KILL 5 immutable scope deployment runbook

 ...-21-kill5-immutable-scope-deployment-runbook.md | 129 +++++++++++++++++++++
 1 file changed, 129 insertions(+)

commit 4bb887e146747d70b0a3a6e4bcfbfe69d966a0f2
short 4bb887e
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T14:30:58Z
subject Fixed immutable trade scope before entry state writes

 core/OrderExecutor.js                              |  85 ++---
 core/PositionTracker.js                            |  36 ++-
 core/StateManager.js                               | 227 +++++++++++---
 core/TradingLoop.js                                |  14 +-
 .../CODEX-KILL5-SYMBOL-HALT-HANDOFF-2026-05-21.md  | 341 +++++++++++++++++++++
 run-empire-v2.js                                   |   4 +
 6 files changed, 616 insertions(+), 91 deletions(-)

commit 5434128c25b2e01920c1edf657e82b971c13f4c9
short 5434128
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T05:16:45Z
subject Added cold-start agent alignment bootstrap

 AGENTS.md                   |  81 +++++++++
 ogz-meta/AGENTS.md          | 393 ++++++++++++++++++++++++++++++++++++++++++++
 ogz-meta/claudememories.zip | Bin 0 -> 90692 bytes
 3 files changed, 474 insertions(+)

commit 6f08c82e61ddf0e17445293dd8766940d48515eb
short 6f08c82
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T04:38:24Z
subject fix: remove SHORT phantom exit contract fallback

 core/OrderExecutor.js | 34 ++++++++++++++--------------------
 1 file changed, 14 insertions(+), 20 deletions(-)

commit 3cc0dae753e4434dcdd646d3b7ab9c97109d1ffd
short 3cc0dae
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T04:32:30Z
subject fix: remove BUY phantom exit contract fallback

 core/OrderExecutor.js | 42 +++++++++++++++---------------------------
 1 file changed, 15 insertions(+), 27 deletions(-)

commit efcc7aed4c2a8c8393e972c79eebce03fb70cf87
short efcc7ae
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T01:39:55Z
subject fix: propagate exit contract creation failures

 core/StrategyOrchestrator.js | 106 ++++++++++++++++++++-----------------------
 1 file changed, 50 insertions(+), 56 deletions(-)

commit fc8d53bd476c43b3085e61b484204dd89268857f
short fc8d53b
author CGP-ME <cgp@ogzprime.com>
date 2026-05-21T01:21:11Z
subject fix: split boosted confidence from public confidence

 core/StrategyOrchestrator.js | 115 ++++++++++++++++++++++++++++++++-----------
 core/TradingLoop.js          |  12 +++--
 2 files changed, 94 insertions(+), 33 deletions(-)

commit 2866ee4ecc3b2aac21cd585929611315058f63a3
short 2866ee4
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T18:32:30Z
subject fix: derive backtest symbol env from candle files

 ogz-meta/anchor-runner.js  |  4 +++
 tools/instrument-env.js    | 83 ++++++++++++++++++++++++++++++++++++++++++++++
 tools/matrix-sweep.js      |  8 +++--
 tools/parallel-backtest.js | 13 ++++++--
 4 files changed, 103 insertions(+), 5 deletions(-)

commit 50161b3a30159c4653abd42445aeeef55b79ba98
short 50161b3
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T17:42:02Z
subject fix: clamp trading confidence before sizing

 core/TradingLoop.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

commit d38dc3453f68f5aec9125f922a3234bbe7c1b9c8
short d38dc34
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T11:10:40Z
subject chore(alignment): add cold-start entry path

 ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md | 480 +++++++++++++++++++++++++++++
 ogz-meta/Alignment/README.md               |  96 ++++++
 2 files changed, 576 insertions(+)

commit 673e301b2d73cf768cc912d3d45b8f8867f2e17a
short 673e301
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T06:21:04Z
subject chore(pipeline): track P0 anchor helpers and Mercury acks

 ogz-meta/anchor-doc.js                             | 181 +++++++++++++++++++++
 ogz-meta/anchor-runner.js                          | 175 ++++++++++++++++++++
 .../MISSION-1779227161613-mercury-ack.txt          |  20 +++
 .../MISSION-1779230198633-mercury-ack.txt          |  21 +++
 4 files changed, 397 insertions(+)

commit ce89e2ef20e77fd24079cba616905f4a265a7432
short ce89e2e
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T06:19:26Z
subject chore(meta): untrack generated health and hook artifacts

 ogz-meta/health-reports/20260327-1952.txt     | 35 -----------------------
 ogz-meta/health-reports/20260327-2022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260327-2052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260327-2122.txt     | 35 -----------------------
 ogz-meta/health-reports/20260327-2152.txt     | 35 -----------------------
 ogz-meta/health-reports/20260327-2222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260327-2252.txt     | 35 -----------------------
 ogz-meta/health-reports/20260327-2322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260327-2352.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-0022.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-0052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0152.txt     | 34 -----------------------
 ogz-meta/health-reports/20260328-0222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0252.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0422.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0452.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0522.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0552.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0622.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0722.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0752.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0822.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0852.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0922.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-0952.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1252.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-1322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1352.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-1422.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-1452.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1522.txt     | 38 -------------------------
 ogz-meta/health-reports/20260328-1552.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1622.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1722.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1752.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1822.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1852.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-1922.txt     | 35 -----------------------
 ogz-meta/health-reports/20260328-1952.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2252.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260328-2352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0022.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-0052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0122.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-0152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0252.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0422.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0452.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0522.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0552.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-0622.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0722.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0752.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0822.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0852.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0922.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-0952.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1252.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1322.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1422.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1452.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1522.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1552.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1622.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-1652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1722.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1752.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1822.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1852.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-1922.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-1952.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-2022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-2052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-2122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-2152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260329-2222.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-2252.txt     | 37 -------------------------
 ogz-meta/health-reports/20260329-2322.txt     | 35 -----------------------
 ogz-meta/health-reports/20260329-2352.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-0022.txt     | 37 -------------------------
 ogz-meta/health-reports/20260330-0052.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-0122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0222.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0252.txt     | 37 -------------------------
 ogz-meta/health-reports/20260330-0322.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-0352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0422.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0452.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0522.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0552.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0622.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0722.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0752.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0822.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0852.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0922.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-0952.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1022.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1052.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1122.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1152.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1222.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-1252.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1322.txt     | 34 -----------------------
 ogz-meta/health-reports/20260330-1352.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1422.txt     | 37 -------------------------
 ogz-meta/health-reports/20260330-1452.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-1522.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-1552.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-1622.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1652.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1723.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-1753.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1823.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1853.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1923.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-1953.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-2023.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2053.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2123.txt     | 35 -----------------------
 ogz-meta/health-reports/20260330-2153.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2223.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2253.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2323.txt     | 36 ------------------------
 ogz-meta/health-reports/20260330-2353.txt     | 36 ------------------------
 ogz-meta/health-reports/20260331-0023.txt     | 36 ------------------------
 ogz-meta/health-reports/20260331-0053.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0123.txt     | 35 -----------------------
 ogz-meta/health-reports/20260331-0153.txt     | 35 -----------------------
 ogz-meta/health-reports/20260331-0223.txt     | 36 ------------------------
 ogz-meta/health-reports/20260331-0253.txt     | 35 -----------------------
 ogz-meta/health-reports/20260331-0323.txt     | 36 ------------------------
 ogz-meta/health-reports/20260331-0353.txt     | 36 ------------------------
 ogz-meta/health-reports/20260331-0423.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0453.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0523.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0553.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0623.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0653.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0723.txt     | 37 -------------------------
 ogz-meta/health-reports/20260331-0753.txt     | 40 ---------------------------
 ogz-meta/health-reports/20260331-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-0853.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1353.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1423.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1453.txt     | 26 -----------------
 ogz-meta/health-reports/20260331-1523.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1653.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1723.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1753.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-1923.txt     | 29 -------------------
 ogz-meta/health-reports/20260331-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2253.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2323.txt     | 30 --------------------
 ogz-meta/health-reports/20260331-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0153.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-0223.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0523.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0653.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1253.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1323.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1353.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1423.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1453.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1523.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1653.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1723.txt     | 29 -------------------
 ogz-meta/health-reports/20260401-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2253.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2323.txt     | 30 --------------------
 ogz-meta/health-reports/20260401-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0123.txt     | 24 ----------------
 ogz-meta/health-reports/20260402-0153.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-0223.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-0253.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0353.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1123.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1353.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1423.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1453.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1523.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1553.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1653.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1723.txt     | 29 -------------------
 ogz-meta/health-reports/20260402-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2253.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2323.txt     | 30 --------------------
 ogz-meta/health-reports/20260402-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0153.txt     | 29 -------------------
 ogz-meta/health-reports/20260403-0223.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0753.txt     | 29 -------------------
 ogz-meta/health-reports/20260403-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1253.txt     | 29 -------------------
 ogz-meta/health-reports/20260403-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1353.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1423.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1453.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1523.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1653.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1723.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2253.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2323.txt     | 30 --------------------
 ogz-meta/health-reports/20260403-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0153.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0223.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1353.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1423.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1453.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1523.txt     | 29 -------------------
 ogz-meta/health-reports/20260404-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1653.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1723.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2253.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2323.txt     | 30 --------------------
 ogz-meta/health-reports/20260404-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0153.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0223.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1053.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1353.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1423.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1453.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1523.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1553.txt     | 29 -------------------
 ogz-meta/health-reports/20260405-1623.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1653.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1723.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-2053.txt     | 29 -------------------
 ogz-meta/health-reports/20260405-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-2153.txt     | 30 --------------------
 ogz-meta/health-reports/20260405-2223.txt     | 29 -------------------
 ogz-meta/health-reports/20260405-2253.txt     | 29 -------------------
 ogz-meta/health-reports/20260405-2323.txt     | 29 -------------------
 ogz-meta/health-reports/20260405-2353.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-0023.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-0053.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0153.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0223.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0823.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-0923.txt     | 26 -----------------
 ogz-meta/health-reports/20260406-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1023.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1053.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1123.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1223.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1353.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1423.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1453.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1523.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1623.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1653.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1723.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1753.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1823.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1853.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-1923.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-1953.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-2123.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-2153.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-2223.txt     | 30 --------------------
 ogz-meta/health-reports/20260406-2253.txt     | 22 ---------------
 ogz-meta/health-reports/20260406-2323.txt     | 29 -------------------
 ogz-meta/health-reports/20260406-2353.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0023.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0053.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0153.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0223.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0253.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0323.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0353.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0423.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0453.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0523.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0553.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0623.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0653.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0723.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0753.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0823.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-0853.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0923.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-0953.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1023.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1053.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1123.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1153.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1223.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1253.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1323.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1353.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1423.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1453.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1523.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1553.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1623.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1653.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1723.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1753.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1823.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1853.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-1923.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-1953.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-2023.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-2053.txt     | 30 --------------------
 ogz-meta/health-reports/20260407-2123.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-2153.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-2223.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-2253.txt     | 29 -------------------
 ogz-meta/health-reports/20260407-2323.txt     | 27 ------------------
 ogz-meta/health-reports/20260407-2353.txt     | 29 -------------------
 ogz-meta/health-reports/20260408-0023.txt     | 29 -------------------
 ogz-meta/health-reports/20260408-0053.txt     | 29 -------------------
 ogz-meta/health-reports/20260408-0123.txt     | 30 --------------------
 ogz-meta/health-reports/20260408-0153.txt     | 30 --------------------
 ogz-meta/manifests/MISSION-1766749313199.hook |  5 ----
 ogz-meta/manifests/MISSION-1766749569806.hook |  5 ----
 ogz-meta/manifests/MISSION-1766750633848.hook |  5 ----
 ogz-meta/manifests/MISSION-1766800962635.hook |  5 ----
 ogz-meta/manifests/MISSION-1766801025177.hook |  5 ----
 ogz-meta/manifests/MISSION-1766801043541.hook |  5 ----
 ogz-meta/manifests/MISSION-1766801224219.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808157001.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808163479.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808169470.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808287851.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808293481.hook |  5 ----
 ogz-meta/manifests/MISSION-1766808298772.hook |  5 ----
 554 files changed, 17199 deletions(-)

commit 6d8c2c6bd29618c94d36bbf3f634986da58a74d6
short 6d8c2c6
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T06:15:46Z
subject chore(gitignore): hide generated local artifacts

 .gitignore | 10 ++++++++--
 1 file changed, 8 insertions(+), 2 deletions(-)

commit 16b97c9735dbc51519e3008c969e8517b853375b
short 16b97c9
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T04:56:37Z
subject chore(architecture): add SessionRouter saga sign-off docs

 ...ENDUM-SESSIONROUTER-FINAL-SIGNOFF-2026-05-20.md | 622 +++++++++++++++++++++
 ...DUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md | 495 ++++++++++++++++
 2 files changed, 1117 insertions(+)

commit 4e25540dc5c2b3da85084689b9de93f881d9665e
short 4e25540
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T02:52:40Z
subject chore(architecture): add liquidation timing addendum

 ...ESIGN-ADDENDUM-LIQUIDATION-TIMING-2026-05-19.md | 220 +++++++++++++++++++++
 1 file changed, 220 insertions(+)

commit a009358093ae6a8a7468031a08d8a2ef695a5541
short a009358
author CGP-ME <cgp@ogzprime.com>
date 2026-05-20T00:11:43Z
subject chore(alignment): add verified OGZ alignment docs

 .../Alignment/OGZ-DIGEST-2026-05-19-VERIFIED.md    | 452 +++++++++++++++++++++
 .../Alignment/OGZ-MASTER-ALIGNMENT-2026-05-19.md   | 405 ++++++++++++++++++
 2 files changed, 857 insertions(+)

commit 0c789b6960e9ed93ff377a46797a39164393bf2a
short 0c789b6
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:52:59Z
subject chore(architecture): Codex design docs and emoji cleanup manifest

 ogz-meta/codex-design/01-GROUND-TRUTH-INVENTORY.md |  91 +++++
 ogz-meta/codex-design/02-ARCHITECTURE-DESIGN.md    | 383 +++++++++++++++++++++
 .../codex-design/03-IMPLEMENTATION-SEQUENCE.md     | 378 ++++++++++++++++++++
 ogz-meta/codex-design/EMOJI-CLEANUP-MANIFEST.md    | 269 +++++++++++++++
 4 files changed, 1121 insertions(+)

commit 108a988a176f1859091f14acd79cc4b1d921232a
short 108a988
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:51:56Z
subject chore(sessions): add session docs since 2026-05-10

 ...5-05-06-serena-mercury-critic-attack-shipped.md | 185 +++++++++++++++
 ...6-05-05-stream-a-candle-history-symbol-aware.md | 173 ++++++++++++++
 ...on-2026-05-07-08-cca-b-and-c-streams-shipped.md | 175 ++++++++++++++
 ...6a-path-b-attempt-symbol-mislabel-discovered.md | 180 ++++++++++++++
 ...-2026-05-13-15-cc-fix-spec-plowthrough-fired.md | 263 +++++++++++++++++++++
 5 files changed, 976 insertions(+)

commit fab2296c9b07cd5c8d9349856edebc62b21d1c39
short fab2296
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:50:46Z
subject chore(proof): update track-record index

 public/proof/track-record/data/index.json | 12 +++++++++---
 1 file changed, 9 insertions(+), 3 deletions(-)

commit 1cb2eafecf33874ce4c204d86df6ea45b821c2b0
short 1cb2eaf
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:48:14Z
subject chore(doctrine): raise critic-attack iterations + one-question-one-answer hookify + grand-scheme edits

 .claude/commands/critic-attack.md              |  2 +-
 .claude/hookify.mercury-one-at-a-time.local.md | 29 +++++++++++++-------------
 ogz-meta/GRAND-SCHEME.md                       |  3 ++-
 3 files changed, 17 insertions(+), 17 deletions(-)

commit e3098de60bec4458f537b403a376190004f73d81
short e3098de
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:46:42Z
subject pipeline(fix-34-40a): land write-gate specs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 18970 +++++++++++++++++++++++
 ogz-meta/pipeline.js                           |     1 +
 2 files changed, 18971 insertions(+)

commit 0674d66d4388a5d41855adc45030e3ed6906225c
short 0674d66
author CGP-ME <cgp@ogzprime.com>
date 2026-05-19T22:42:07Z
subject pipeline(fix-40a): MISSION-1779230198633

 ogz-meta/slash-router.js | 344 +++++++++++++++++++++++++++++++++++++++++++++--
 1 file changed, 333 insertions(+), 11 deletions(-)

commit f859b8975a5a60d5011c1293d2447f83c409f380
short f859b89
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T07:12:56Z
subject chore(spec): mark Fixes 30 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit decab0ca3a47a924c98514d0f1dbe700cc2b183c
short decab0c
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T07:12:55Z
subject fix(trade-journal): Fix 30 stats invariant guard in _updateStats

 core/TradeJournal.js | 8 +++++++-
 1 file changed, 7 insertions(+), 1 deletion(-)

commit 961f0b71876205579595b8246324f01c47808414
short 961f0b7
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T03:22:27Z
subject chore(spec): mark Fixes 29 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit ac7cf1851ad9b3271603a74b7494241d0fa90c78
short ac7cf18
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T03:22:26Z
subject fix(backtest-recorder): Fix 29 remove $10K phantom (Fix 13 sibling site)

 core/BacktestRecorder.js | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)

commit 8b7b9f54cb8c69cd0b695f29456ab8b41b78d3c1
short 8b7b9f5
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T03:13:29Z
subject chore(spec): mark Fixes 28 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 61 +++++++++++++++++---------
 1 file changed, 41 insertions(+), 20 deletions(-)

commit 0cc6163e1d45947acd03a150070847c3e3bc8d35
short 0cc6163
author CGP-ME <cgp@ogzprime.com>
date 2026-05-15T03:13:28Z
subject fix(trading-config): Fix 28 add envNumber() strict helper (two-block patched)

 core/TradingConfig.js | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)

commit ad4391eec5c96376d6b88dda8f19e1d29acf5aa9
short ad4391e
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T17:47:48Z
subject chore(spec): mark Fixes 27 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 155 +++++++++++++++++++++++++
 1 file changed, 155 insertions(+)

commit 43d0f4c82785fd79b24e0b8702654439e690406a
short 43d0f4c
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T17:47:47Z
subject fix(trade-journal-bridge): Fix 27 balance coerce + ?? with correct spread order

 core/TradeJournalBridge.js | 12 ++++++++++--
 1 file changed, 10 insertions(+), 2 deletions(-)

commit 476ea59f91ffafefe3926aceff98fe9b910e403f
short 476ea59
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T13:33:02Z
subject chore(spec): mark Fixes 13 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit 6aa2d64f3444356421c02ce771879b1eabba61fe
short 6aa2d64
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T13:33:00Z
subject fix(trade-journal): Fix 13 refuse phantom $10K startingBalance fallback

 core/TradeJournal.js | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)

commit 013e2b3ac93cb4460306235574bd92b4cc431646
short 013e2b3
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:10:49Z
subject chore(spec): mark Fixes 22 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 1 +
 1 file changed, 1 insertion(+)

commit 17d3fc7c85181d85a2ebefadc32fe84134cbfe28
short 17d3fc7
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:10:48Z
subject fix(pipeline): /spec-update-status oldStatus null-safe when Status inserted

 ogz-meta/slash-router.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit 1bbcbfa1199c8fbe33bf161f5e5c47897e7379a3
short 1bbcbfa
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:10:03Z
subject fix(pipeline): /spec-update-status inserts Status line when missing

 ogz-meta/slash-router.js | 29 ++++++++++++++++++++++-------
 1 file changed, 22 insertions(+), 7 deletions(-)

commit 94db97f1c22e2d9fb0d68751a7b7b74b5ca9a8ff
short 94db97f
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:08:04Z
subject fix(max-profit-manager): Fix 22 unify tier-target `||`-collapse to .get(default)

 core/MaxProfitManager.js | 11 +++++++----
 1 file changed, 7 insertions(+), 4 deletions(-)

commit 44198f35464025aa69034921b8951530801b812f
short 44198f3
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:02:29Z
subject chore(spec): mark Fixes 23 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit c64daa1d122ef92b84b683f813409a81b36d6b91
short c64daa1
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T08:02:28Z
subject fix(strategy-orchestrator): Fix 23 CRIT-09 mirror at line 894 (was HALF-FIXED MIRROR)

 core/StrategyOrchestrator.js | 10 ++++++++--
 1 file changed, 8 insertions(+), 2 deletions(-)

commit 863dd618d4718c3c86ad758ae6b97d40da3f0419
short 863dd61
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T01:17:44Z
subject chore(spec): mark Fixes 17 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit e23ebe76286c7f3dada506b239672e97c5860958
short e23ebe7
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T01:17:43Z
subject fix(order-executor): Fix 17 wire absolute position cap (was DEAD CONFIG)

 core/OrderExecutor.js | 8 ++++++++
 1 file changed, 8 insertions(+)

commit c60ccb2b6e152278e216532cdcde35e31b0a2713
short c60ccb2
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T01:10:20Z
subject chore(spec): mark Fixes 24 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit 203f087a1b24cb9486ce8c481c9b9f88940de325
short 203f087
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T01:10:15Z
subject fix(backtest-recorder): Fix 24 BacktestRecorder symbol guard

 core/BacktestRecorder.js | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)

commit 776f4bbe0cfc14d413e6ef9f44c72c2c6dfac8ca
short 776f4bb
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:44:08Z
subject feat(pipeline): add /mercury-attack + /anchor-verify-post stages to --write

 ogz-meta/pipeline.js     |   2 +
 ogz-meta/slash-router.js | 295 +++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 297 insertions(+)

commit 16db6c1e741fb82ac23fd0415e4ea27d4eed0d50
short 16db6c1
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:34:58Z
subject chore(spec): mark Fixes 16 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 116 ++++++++++++++++++++++++-
 1 file changed, 114 insertions(+), 2 deletions(-)

commit 0a9ce7ffe036dbee65b0dad2375b2f6c53b8e91d
short 0a9ce7f
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:34:53Z
subject fix(order-executor): Fix 16 webhook fractional-asset qty=0 skip-emit guard

 core/OrderExecutor.js | 76 +++++++++++++++++++++++++++++++--------------------
 1 file changed, 46 insertions(+), 30 deletions(-)

commit 745cb6033d2baa58d3131ac4da424d73e868ade5
short 745cb60
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:06:08Z
subject fix(pipeline): override spec_source in EXECUTE when fresh one is passed

 ogz-meta/pipeline.js | 7 +++++++
 1 file changed, 7 insertions(+)

commit 883c45a3543032c64cc374c7defddc3116f46f9c
short 883c45a
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:05:36Z
subject chore(spec): mark Fixes 15 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit ae5cb673e21466ae69e2202eb9061ca70fb8c56a
short ae5cb67
author CGP-ME <cgp@ogzprime.com>
date 2026-05-14T00:03:07Z
subject fix(config-loader): Fix 15 broker-coherence IIFE refactor

 foundation/ConfigLoader.js | 40 +++++++++++++++++++---------------------
 1 file changed, 19 insertions(+), 21 deletions(-)

commit 36781d114150a70ea882eb6f65c59c43390f51d1
short 36781d1
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:26:16Z
subject fix(pipeline): /spec-update-status auto-pushes after commit

 ogz-meta/slash-router.js | 13 ++++++++++++-
 1 file changed, 12 insertions(+), 1 deletion(-)

commit 847b85ee6efff7cbe627e501a71d7c2d0424cd81
short 847b85e
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:25:27Z
subject chore(spec): mark Fixes 1, 2, 3, 4, 5, 6, 10, 11, 12, 14, 26 as FIXED with commit SHAs

 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 22 +++++++++++-----------
 1 file changed, 11 insertions(+), 11 deletions(-)

commit bbaecf6f5332a125efeabcd7c45a828d055d70ec
short bbaecf6
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:25:18Z
subject feat(pipeline): --mark-fixed flag — spec-doc status updater

 ogz-meta/pipeline.js     |  52 +++++++++++++++---
 ogz-meta/slash-router.js | 137 +++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 183 insertions(+), 6 deletions(-)

commit 99356633a22485798f857fab08662d81f9a39c40
short 9935663
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:10:09Z
subject fix(session-router): Fix 14 _activateCrypto BTC-USD fallback

 core/SessionRouter.js | 7 ++++++-
 1 file changed, 6 insertions(+), 1 deletion(-)

commit eeee2e7e257654a8345fcde75160a168720088fb
short eeee2e7
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:07:58Z
subject fix(trai-core): Fix 12 BTC asset label fallback

 core/trai_core.js | 8 +++++++-
 1 file changed, 7 insertions(+), 1 deletion(-)

commit f450d3075935f877ad08acb027fd327f543f847a
short f450d30
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:05:54Z
subject fix(trai-decision): Fix 11 BTC-USD fallback in signal recording

 core/TRAIDecisionModule.js | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)

commit 3442d242615ace4f5b77d500556be2a229321ed2
short 3442d24
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:03:36Z
subject fix(indicator-engine): Fix 10 throw on missing symbol in constructor

 core/indicators/IndicatorEngine.js | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)

commit 0d6538a717499cc99e3ef30a2468e1de3943391d
short 0d6538a
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T23:00:57Z
subject fix(symbol-trading-context): Fix 26 thread symbol into IndicatorEngine config

 core/SymbolTradingContext.js                   |    9 +-
 ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md | 2560 ++++++++++++++++++++++++
 2 files changed, 2568 insertions(+), 1 deletion(-)

commit 782a98107704de0b74ce2dbc7c517a431ef44515
short 782a981
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T22:58:27Z
subject fix(spec-parser): boundary regex matches H1/H2 headings

 ogz-meta/spec-parser.js | 8 ++++++--
 1 file changed, 6 insertions(+), 2 deletions(-)

commit ee9edaddb934fcc91fc9f4a488f9aba97bbb9b8f
short ee9edad
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T20:58:08Z
subject chore(frontend): refresh ssl-server + chart-panel + tombstone system-snapshot

 ogzprime-ssl-server.js              | 58 ++++++++++++++++++++++++++++++++++++-
 public/js/panels/chart-panel.js     | 49 +++++++++++++++++++++++++++++++
 public/js/panels/system-snapshot.js | 57 +++++++++++++++++++-----------------
 3 files changed, 137 insertions(+), 27 deletions(-)

commit 498a16e4ec98756231aa8d38581b28f51556ea57
short 498a16e
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T14:29:36Z
subject fix(state-manager): P1-A trade.size stale after partial close — ANCHOR SHIFT

 core/StateManager.js                         |  1 +
 ogz-meta/specs/baseline-phase0-2026-05-06.md | 43 +++++++++++++++++++---------
 2 files changed, 30 insertions(+), 14 deletions(-)

commit 4d56a02b09be31c6df68933fab2da3ca15ae427b
short 4d56a02
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T13:34:34Z
subject fix(order-executor): TIER-2-EXECUTE-CATCH differentiate audit throws

 core/OrderExecutor.js | 12 ++++++++++++
 1 file changed, 12 insertions(+)

commit d54e48deedba1d7e8b0c3fe7a6d43af1065788a9
short d54e48d
author CGP-ME <cgp@ogzprime.com>
date 2026-05-13T13:13:20Z
subject fix(order-executor): P2-B warn when tradeId not found, fallback to oldest

 core/OrderExecutor.js | 3 +++
 1 file changed, 3 insertions(+)
```
