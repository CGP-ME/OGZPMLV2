# L1 Pre-Validation Report
**Date:** 2026-04-13
**Purpose:** Verify file:line targets in decision-ledger-integration-plan.md Phase L1 are accurate
**Validator:** Claude Code (direct grep + read against current codebase)

---

## Target 1: `core/StateManager.js` — `openPosition()` near line 346-348

**Spec says:** "openPosition() populates trade.decisionLedger skeleton (~5 lines added near line 346-348 where tradeId is built)"

**Actual finding:**
- `openPosition` method signature is at **line 325** (not 346-348)
- The method is `async openPosition(size, price, context = {})`
- tradeId construction would happen inside this method body

**Drift:** Lines 346-348 are ~21 lines off from the method start at line 325. The spec likely referenced a point deeper in the method body where the trade object is constructed. Need to verify exact line where tradeId/trade object is built:

```
325:  async openPosition(size, price, context = {}) {
326:    if (this.state.position > 0) {
327:      console.warn('[StateManager] Already in position, adding to it');
328:    }
```

**Verdict:** DRIFTED — method starts at line 325, not 346. The integration point is still valid (add ledger skeleton after trade object is built inside openPosition), but exact line numbers need updating in the spec.

---

## Target 2: `core/TradingLoop.js` — around lines 217-256 where orchResult is built

**Spec says:** "passes signal collection + orchestrator decision down to OrderExecutor as decision.ledgerData (~15 lines around line 217-256 where orchResult is built)"

**Actual finding:**
- `orchResult` is built at **line 69-83** (StrategyOrchestrator.evaluate call)
- The orchResult is consumed throughout lines 85-269
- The executeTrade call is at **line 269**: `await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult);`
- The decision object construction (`_checkRiskAndBuildDecision`) is at **lines 277-323**

Key integration points:
- Line 69: `const orchResult = this.ctx.strategyOrchestrator.evaluate(...)` — where signals are collected
- Line 135: `let decision = { action: 'HOLD', confidence: orchResult.confidence };` — where decision object is built
- Line 269: `await this.ctx.executeTrade(...)` — where ledgerData would be passed to OrderExecutor

**Verdict:** SIGNIFICANTLY DRIFTED — spec says lines 217-256, actual orchResult construction is at lines 69-83, decision building is at 135+, and execution is at 269. The spec's line numbers are wrong, but the conceptual integration point (between orchResult construction and executeTrade call) is correct. Need line number update.

---

## Target 3: `core/dto/DecisionLedgerSchema.js` — NEW file

**Spec says:** "NEW — Zod schema for runtime validation, mirrors ogz-meta/specs/decision-ledger-schema.json"

**Actual finding:** File does not exist yet (correct — it's the new file L1 creates).

**Pre-check:** `core/dto/` directory exists (IndicatorSnapshotDTO.js is there). Zod is installed (`node_modules/zod` present).

**Verdict:** CONFIRMED — ready to create. Directory and dependency exist.

---

## Summary

| Target | Spec Line | Actual Line | Status |
|--------|-----------|-------------|--------|
| StateManager.openPosition | 346-348 | **325** | DRIFTED (-21 lines) |
| TradingLoop orchResult build | 217-256 | **69-83** (build), **269** (execute) | SIGNIFICANTLY DRIFTED |
| dto/DecisionLedgerSchema.js | NEW | does not exist (correct) | CONFIRMED |

**Impact on L1 implementation:** The spec's conceptual approach is correct — the integration points (openPosition body, orchResult-to-executeTrade handoff) exist exactly where expected. Only the line numbers have drifted, likely from code changes between when wolf read the files and when the spec was written.

**Recommendation:** Before starting L1, Claudito should read the current versions of both files at the actual line numbers above, not the spec's line numbers. The spec text remains valid; only the line references need mental adjustment.

---

**Generated:** 2026-04-13
