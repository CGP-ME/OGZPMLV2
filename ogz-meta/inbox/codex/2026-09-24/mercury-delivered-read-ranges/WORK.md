# Work

Parent `906e61aeb233e75c0d4e89842040dc78d05e083d`. This packet's commit contains react-loop.js serialization/history/telemetry and run-ledger.js call delivery metadata, plus its changelog. Resulting SHA is available in packet Git history; push is separately executed, not assumed here.

Restored the recovered line-aware serializer, retaining the existing 12,000-character limit. Corrected its null-delivery case: it must not fall back to the original requested range when no full line was delivered. Historical compacted previews without delivery metadata receive no reconstructed full-range credit. Original tool results remain in history; delivered ranges are distinct.
