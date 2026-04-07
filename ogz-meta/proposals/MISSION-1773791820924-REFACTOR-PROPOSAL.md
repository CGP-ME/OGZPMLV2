# REFACTOR PROPOSAL: MISSION-1773791820924
Generated: 2026-03-17T23:57:01.073Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: Migrate RiskManager.js process.env reads to ConfigLoader injection

## Architect Plan
No plan generated

### Files to Create
None specified

### Files to Modify
None specified

### Extraction Details
See architect analysis

## RAG Context
- [CRITICAL] BUG-2026-03-06-RISK-FLAGS-COSMETIC: MAX_DRAWDOWN and MAX_DAILY_LOSS flags loaded but never enforced. Trading continu...
- [CRITICAL] BUG-2026-03-06-PAPER-TRADING-NOT-ENFORCED: PAPER_TRADING=true in .env but bot sent real orders to Kraken, resulting in $50 ...
- [HIGH] FIX-659-INDEX: Pattern memory not growing...

---

## Approval
To approve and execute:
1. Review the plan above
2. Set `manifest.approval.status = 'APPROVED'` in the manifest
3. Re-run the pipeline

Or manually apply the changes following the architect plan.
