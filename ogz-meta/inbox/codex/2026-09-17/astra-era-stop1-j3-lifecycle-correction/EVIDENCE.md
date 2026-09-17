# STOP 1 J3 correction evidence

## Offline reproduction

```bash
node ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j3-lifecycle/probe-j3-lifecycle.js /tmp/j3-lifecycle-recheck.json
```

The probe uses no bot boot, Jest, provider, broker, notification, network, PM2, or trading operation. Its repeated-signal cases require permission to spawn child Node processes and deliver SIGINT/SIGTERM.

## Covered boundaries

- exact runner shutdown and actual backtest dispatcher;
- source linkage from candle analysis and exit-monitor dispatch into the tracked operation set, plus one final runner-owned pattern persistence pass;
- repeated real SIGINT and SIGTERM while cleanup is pending;
- lock monitor parse error versus missing-owner terminal classification;
- intentional backtest lock skip with a foreign owner record;
- dispatched work before persistence;
- independent cleanup after one adapter failure;
- SessionRouter, PipelineSnapshot, dashboard, resilient socket, Kraken, Kraken wrapper, and Alpaca owner methods;
- pattern and journal persistence failure propagation; and
- all J2 fresh/stale contention rounds.

`PROBE-RECEIPT.json` is generated from the same command with the packet path as its output. Every changed production file and both probes are hashed in that receipt.

The exact probe completed twice with byte-identical receipts. Both the original
packet and this correction packet carry SHA-256
`581f955e0a0f348149be10dfb3ecee27fb55497e30e1be14b19876cc9a638d4a`.

## Mercury attack evidence

The required unsteered attack ran with run ID
`2026-09-17T05-51-34-845Z-31f1e9933891`. It was an adversarial attempt, not the
proof of lifecycle correctness. `TAPE-MANIFEST.json` records the original and
committed SHA-256 plus byte count for 49 raw provider/bridge tapes and the
redacted run-ledger line. All 50 committed hashes were rechecked after capture.
See `MERCURY.md` for the disposition and limits.
