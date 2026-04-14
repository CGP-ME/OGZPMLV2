# REFACTOR PROPOSAL: MISSION-1776134724059
Generated: 2026-04-14T02:46:15.050Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: fix exitSize-vs-exitFraction semantics in core/MaxProfitManager.js per Mercury Part 1 audit Q1-Q2. Tier exits at lines 460, 504 and BE scaleout return absolute size when consumers expect a fraction 0-1. Design decision yours: whether exitFraction is fraction of original or remaining position size, and what state MPM tracks to compute correctly. Must emit both exitFraction (primary new field) and keep exitSize (legacy for logging). Ignore brain-bug-refactor-plan files. Integrate with DecisionLedgerSchema.js. This is mission 1 of 8 coordinated refactors across the partial-close pipeline.

## Architect Plan
Add explicit exitFraction semantics to MaxProfitManager partial exits and extend DecisionLedgerSchema to capture the new field while preserving legacy exitSize.

### Files to Modify
- `core/dto/DecisionLedgerSchema.js` — 2 changes
- `core/MaxProfitManager.js` — 2 changes

### Commit Ordering
1. Update DecisionLedgerSchema.js first to introduce ExitEntrySchema and the new exits array type.
2. Then modify MaxProfitManager.js to emit exitFraction alongside the legacy exitSize.

### Verification
Run the full test suite:
1. `npm run test -- -g MaxProfitManager` – should pass new unit tests for exitFraction.
2. `node tools/ledger-validate.js` (or equivalent) – validates that a sample decision ledger containing tiered and BE scale‑out exits conforms to the updated schema.
3. End‑to‑end backtest (run-empire-v2.js) – ensure no schema validation warnings appear and that logs still show exitSize for backward‑compatibility.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/dto/DecisionLedgerSchema.js:44-58
**Verified:** YES

```javascript
// BEFORE:
   44	const ExitContractSchema = z.object({
   45	  strategyName: z.string(),
   46	  stopLossPercent: z.number(),
   47	  takeProfitPercent: z.number(),
   48	  trailingStopPercent: z.number().optional(),
   49	  trailingActivation: z.number().optional(),
   50	  maxHoldTimeMinutes: z.number().optional(),
   51	  _validated: z.string().optional(),
   52	}).passthrough();
   53	
   54	/**
   55	 * Decision Ledger Schema — L1 skeleton (entry-time fields only).
   56	 * Later phases add: confidenceModifiers (L3), riskGates (L5),
   57	 * exits (L6), outcome (L7).
   58	 */
// AFTER:
   44	const ExitContractSchema = z.object({
   45	  strategyName: z.string(),
   46	  stopLossPercent: z.number(),
   47	  takeProfitPercent: z.number(),
   48	  trailingStopPercent: z.number().optional(),
   49	  trailingActivation: z.number().optional(),
   50	  maxHoldTimeMinutes: z.number().optional(),
   51	  _validated: z.string().optional(),
   52	}).passthrough();
   53	
   54	/**
   55	 * Decision Ledger Schema — L1 skeleton (entry-time fields only).
   56	 * Later phases add: confidenceModifiers (L3), riskGates (L5),
   57	 * exits (L6), outcome (L7).
   58	 */
   59	
   60	// New schema for individual exit records emitted by MaxProfitManager
   61	const ExitEntrySchema = z.object({
   62	  action: z.enum(['exit_partial', 'exit_full']).or(z.literal('update')).or(z.literal('hold')).or(z.literal('none')),
   63	  price: z.number().optional(),
   64	  exitSize: z.number().optional(),           // Legacy absolute size for logging
   65	  exitFraction: z.number().min(0).max(1).optional(), // Fraction of the position size being exited
   66	  remainingSize: z.number().optional(),
   67	  reason: z.string().optional(),
   68	  profitPercent: z.number().optional(),
   69	  tier: z.number().optional(),
   70	  newStopPrice: z.number().optional(),
   71	  holdTime: z.number().optional(),
   72	  // Allow any additional fields that older code may still attach
   73	}).passthrough();
```

### Edit 2: core/dto/DecisionLedgerSchema.js:80-80
**Verified:** YES

```javascript
// BEFORE:
   80	  exits: z.array(z.any()).optional(),
// AFTER:
   80	  exits: z.array(ExitEntrySchema).optional(),
```

### Edit 3: core/MaxProfitManager.js:457-465
**Verified:** YES

```javascript
// BEFORE:
  457	        return {
  458	          action: 'exit_partial',
  459	          price: currentPrice,
  460	          exitSize: scaleOutSize,
  461	          remainingSize: this.state.remainingSize,
  462	          reason: 'be_scaleout',
  463	          profitPercent: profitPercent,
  464	          newStopPrice: this.state.currentStop
  465	        };
// AFTER:
  457	        return {
  458	          action: 'exit_partial',
  459	          price: currentPrice,
  460	          exitSize: scaleOutSize,               // legacy absolute size for logging
  461	          exitFraction: scaleOutFraction,       // fraction of the position size being sold
  462	          remainingSize: this.state.remainingSize,
  463	          reason: 'be_scaleout',
  464	          profitPercent: profitPercent,
  465	          newStopPrice: this.state.currentStop
  466	        };
```

### Edit 4: core/MaxProfitManager.js:501-509
**Verified:** YES

```javascript
// BEFORE:
  501	      return {
  502	        action: 'exit_partial',
  503	        price: currentPrice,
  504	        exitSize: tierExit.exitSize,
  505	        remainingSize: this.state.remainingSize,
  506	        reason: `profit_tier_${tierExit.tier}`,
  507	        profitPercent: profitPercent,
  508	        tier: tierExit.tier
  509	      };
// AFTER:
  501	      return {
  502	        action: 'exit_partial',
  503	        price: currentPrice,
  504	        exitSize: tierExit.exitSize,               // legacy absolute size for logging
  505	        exitFraction: tierExit.exitSize / this.state.remainingSize, // fraction of remaining position
  506	        remainingSize: this.state.remainingSize,
  507	        reason: `profit_tier_${tierExit.tier}`,
  508	        profitPercent: profitPercent,
  509	        tier: tierExit.tier
  510	      };
```



## RAG Context
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] FIX-2026-02-05-DEEPSEARCH-004-BACKTEST-TIME: holdTime calculations used Date.now() instead of candle timestamps - all hold ti...
- [HIGH] REFACTOR-2026-03-18-UNIFIED-PATTERN-MEMORY: Two separate pattern stores causing data fragmentation - PatternMemorySystem in ...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776134724059`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776134724059`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
