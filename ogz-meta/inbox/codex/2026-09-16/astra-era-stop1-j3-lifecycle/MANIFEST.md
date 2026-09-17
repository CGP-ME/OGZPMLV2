# STOP 1 J3 lifecycle manifest

- Source: J0 package J3 and live source at base SHA `31f150f9744021f8a092787f755f8123b3abf0a5`.
- Date: 2026-09-16.
- Why kept: bounded implementation and direct evidence for one runner-owned operator-shutdown and terminal-failure lifecycle.
- Base SHA: `31f150f9744021f8a092787f755f8123b3abf0a5`.
- Correction SHA: the commit containing this manifest; report the exact SHA after commit.

## Runtime files

- `run-empire-v2.js`
- `core/SingletonLock.js`
- `core/BacktestRunner.js`
- `core/SessionRouter.js`
- `core/PipelineSnapshot.js`
- `core/WebSocketManager.js`
- `foundation/ResilientWebSocket.js`
- `brokers/AlpacaAdapter.js`
- `brokers/KrakenIBrokerAdapter.js`
- `kraken_adapter_simple.js`
- `core/UnifiedPatternMemory.js`
- `core/EnhancedPatternRecognition.js`
- `core/TradeJournal.js`
- `core/TradeJournalBridge.js`

## J2 regression files

- `ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j2-singleton/probe-j2-singleton.js`
- `ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j2-singleton/PROBE-RECEIPT.json`
- `ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j2-singleton/EVIDENCE.md`

## J3 evidence files

- `MISSION.md`
- `WORK.md`
- `EVIDENCE.md`
- `REVIEW.md`
- `INHERITED.md`
- `MERCURY.md`
- `MANIFEST.md`
- `probe-j3-lifecycle.js`
- `PROBE-RECEIPT.json`

## Correction evidence

- `ogz-meta/inbox/codex/2026-09-17/astra-era-stop1-j3-lifecycle-correction/`
- redacted Mercury tapes and dual hashes are preserved there; the unredacted
  cognition-history files are not staged as packet evidence.

Unrelated pre-existing dirty and untracked files are not part of this change.
