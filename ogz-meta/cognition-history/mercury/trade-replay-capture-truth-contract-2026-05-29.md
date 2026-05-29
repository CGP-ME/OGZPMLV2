Mercury attack prompt:

You are attacking the TradeReplayCapture truth-contract patch in `/opt/ogzprime/OGZPMLV2`.

Scope:
- `core/TradeReplayCapture.js:34-66` constructor and normalizers.
- `core/TradeReplayCapture.js:84-122` `captureEntry()`.
- `core/TradeReplayCapture.js:132-205` `captureExit()`.
- `core/TradeReplayCapture.js:226-256` `listReplays()`.
- `test/trade-replay-capture-contract.test.js`.

Attack objective:
Find a concrete input sequence that makes replay storage or replay listing lie about a trade.

Attack vectors:
1. Construct a `TradeReplayCapture` instance that writes to the old unscoped `data/journal/replays` default.
2. Construct an entry capture that silently invents direction, entry price, confidence, regime, pattern, indicator, or timestamp fields.
3. Construct an exit capture without a matching entry capture that still writes a replay or returns a replay list row.
4. Construct an incomplete exit capture that writes a replay with fabricated exit price, reason, P&L, P&L percent, or hold time.
5. Construct a legacy replay JSON file where `listReplays()` emits zero prices, zero P&L, empty reason, or fake saved timestamp for missing fields.
6. Find a zero-PnL or zero-hold-time real replay that is wrongly rejected because zero is valid truth.
7. Identify whether this only hides symptoms at `listReplays()` while `captureEntry()`/`captureExit()` can still write corrupt replay files.

Do not confirm the implementation. Break it. Cite exact file:line evidence and provide a minimal failing input if you find one.
