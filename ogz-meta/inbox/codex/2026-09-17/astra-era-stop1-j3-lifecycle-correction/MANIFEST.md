# STOP 1 J3 lifecycle correction manifest

- Source: Astra HOLD against J3 at `b7bf511e4d8fc12af48de200cea4f166a5548dc4` and current live source.
- Date: 2026-09-17.
- Why kept: closes the actual caller, pending-work, service-teardown, persistence, signal, and evidence gaps found in the first J3 commit.
- Base SHA: `b7bf511e4d8fc12af48de200cea4f166a5548dc4`.
- Correction SHA: the commit containing this manifest; report the exact SHA after commit.

## Production files

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

## Evidence files

- the corrected J3 packet under `ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j3-lifecycle/`;
- `MISSION.md`, `WORK.md`, `EVIDENCE.md`, `REVIEW.md`, `INHERITED.md`, `MERCURY.md`, and `PROBE-RECEIPT.json` in this correction packet;
- `capture-mercury-tapes.js`, `TAPE-MANIFEST.json`, and the 50 redacted files under `tapes/`.

Unrelated operator/agent dirt is excluded.
