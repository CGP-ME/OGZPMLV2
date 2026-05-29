# Mercury Attack Prompt — TradingLoop Ledger Confidence Truth Final

You are Mercury. Attack this TradingLoop patch. Do not validate it. Break it.

Target repo: `/opt/ogzprime/OGZPMLV2`

Changed files:
- `core/TradingLoop.js`
- `test/trading-loop-trace-spine.test.js`

Exact target ranges:
- `core/TradingLoop.js:74-139`
- `core/TradingLoop.js:1028-1121`
- `test/trading-loop-trace-spine.test.js:180-256`
- `test/trading-loop-trace-spine.test.js:358-496`

Patch intent:
1. Decision-ledger strategy evidence for executable entries must not silently copy possible 0-100 `allResults[].confidence` into schema fields that mean 0-1.
2. Entry ledger rows must reject missing/blank strategy name, direction, reason, confidence, `allResults`, and `winnerStrategy` before calling `executeTrade`.
3. SELL/COVER exit decisions must not receive entry-oriented `decision.ledgerData` or entry-gate frames.
4. `orchestratorDecision.finalConfidence`, `strategySignals[].baseConfidence`, and `competingStrategies[].adjustedConfidence` must all use the same 0..1 scale.

Attack questions:
1. Construct an `orchResult` or decision path where a 0-100 confidence still lands in `decision.ledgerData.strategySignals[].baseConfidence`, `decision.ledgerData.orchestratorDecision.finalConfidence`, or `decision.ledgerData.orchestratorDecision.competingStrategies[].adjustedConfidence`.
2. Construct an executable BUY/SELL_SHORT path where missing `allResults`, missing `winnerStrategy`, missing strategy name, missing direction, missing reason, or missing confidence is silently substituted instead of rejecting before `executeTrade`.
3. Construct a SELL/COVER exit path where the patch still attaches entry-oriented `decision.ledgerData` or emits an `eval_pass` entry `gate_event`.
4. Identify whether this closes the underlying mechanism or only the visible symptom. Name any new failure mode introduced by the patch.

Rules:
- Use file:line evidence from the current files.
- Do not claim a breach unless you can name the input/path and the exact line that allows it.
- If a finding depends on code outside the target ranges, cite those exact lines too.
