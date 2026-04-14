# REFACTOR PROPOSAL: MISSION-1776129515294
Generated: 2026-04-14T01:18:35.618Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: fix partial-close pipeline bug per Mercury Part 1 audit Q1-Q15 — coordinated change across 8 files (core/MaxProfitManager.js, core/OrderExecutor.js, core/StateManager.js, core/BacktestRecorder.js, core/TRAIDecisionModule.js, core/TradeJournal.js, core/UnifiedPatternMemory.js, core/exit/BreakEvenManager.js). Design decisions are yours — where to compute exitFraction, which module tracks state, whether per-trade instances or stateless, leg ledger entry shape, commit ordering. Read source files and pre-apex audit findings, ignore brain-bug-refactor-plan-*.md files (those are prior Claude-biased drafts). Constraints: integrate with shipped DecisionLedgerSchema.js; do not modify TradingConfig.exitContracts; do not break existing single-close trades.

## Architect Plan
No plan generated

### Files to Create
None specified

### Files to Modify
None specified

### Extraction Details
See architect analysis

## RAG Context
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] BUG-2026-03-04-DUPLICATE-PATTERN-FILES: Pattern bank shows 8181 patterns when we deleted them. Two different pattern fil...
- [HIGH] REFACTOR-2026-03-18-UNIFIED-PATTERN-MEMORY: Two separate pattern stores causing data fragmentation - PatternMemorySystem in ...

---

## Approval
To approve and execute:
1. Review the plan above
2. Set `manifest.approval.status = 'APPROVED'` in the manifest
3. Re-run the pipeline

Or manually apply the changes following the architect plan.
