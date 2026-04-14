# PROPOSAL: MISSION-1776118306609
Generated: 2026-04-13T22:12:34.656Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Issue
find and fix bugs in ogz-meta/test-fixtures/c2b-syntax-bug.js — look for division by zero, silent error swallowing, and any other issues

## RAG Context Retrieved
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short signals. PnL calculation...
- [CRITICAL] BUG-2026-03-06-RISK-FLAGS-COSMETIC: MAX_DRAWDOWN and MAX_DAILY_LOSS flags loaded but never enforced. Trading continued even when limits ...
- [HIGH] REFACTOR-2026-03-18-UNIFIED-PATTERN-MEMORY: Two separate pattern stores causing data fragmentation - PatternMemorySystem in EnhancedPatternRecog...

## Bugs Identified

### Bug 1: division_by_zero
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:18
- **Description**: Risk amount is divided by stopDistance without checking for zero, leading to a possible division‑by‑zero runtime error.
- **Fix Type**: division_by_zero
- **Score**: N/A


### Bug 2: silent_error_swallowing
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:38
- **Description**: The try/catch block catches any error and returns null, silently swallowing failures (e.g., missing trade fields) and making debugging impossible.
- **Fix Type**: silent_error_swallowing
- **Score**: N/A


### Bug 3: division_by_zero
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:31
- **Description**: pnlPercent calculation divides by (trade.entryPrice * trade.size) which could be zero, causing another division‑by‑zero scenario.
- **Fix Type**: division_by_zero
- **Score**: N/A


### Bug 4: missing_input_validation
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:15
- **Description**: calculatePositionSize does not validate that balance, riskPercent, and stopDistance are numbers, allowing NaN or undefined values to propagate.
- **Fix Type**: missing_input_validation
- **Score**: N/A


## Proposed Fixes

### Proposal 1: 0
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:15
- **Proposed Change**: function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Validate inputs – they must be finite numbers and stopDistance must be > 0
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    throw new Error('balance must be a finite number');
  }
  if (typeof riskPercent !== 'number' || !Number.isFinite(riskPercent)) {
    throw new Error('riskPercent must be a finite number');
  }
  if (typeof stopDistance !== 'number' || !Number.isFinite(stopDistance) || stopDistance <= 0) {
    throw new Error('stopDistance must be a positive, non‑zero number');
  }
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
- **Status**: READY_TO_APPLY

#### Replacement (ready to apply)
```javascript
// BEFORE: function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Bug: division by zero not handled
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
// AFTER:  function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Validate inputs – they must be finite numbers and stopDistance must be > 0
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    throw new Error('balance must be a finite number');
  }
  if (typeof riskPercent !== 'number' || !Number.isFinite(riskPercent)) {
    throw new Error('riskPercent must be a finite number');
  }
  if (typeof stopDistance !== 'number' || !Number.isFinite(stopDistance) || stopDistance <= 0) {
    throw new Error('stopDistance must be a positive, non‑zero number');
  }
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
```


### Proposal 2: 1
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:27
- **Proposed Change**:   // Validate required trade fields before calculation
  const requiredFields = ['exitPrice', 'entryPrice', 'size', 'exitTime', 'entryTime'];
  for (const field of requiredFields) {
    if (trade[field] == null) {
      throw new Error(`trade.${field} is required`);
    }
  }
  const pnl = (trade.exitPrice - trade.entryPrice) * trade.size;
  const denominator = trade.entryPrice * trade.size;
  const pnlPercent = denominator === 0 ? 0 : (pnl / denominator) * 100;
  return {
    pnl,
    pnlPercent,
    isWin: pnl > 0,
    holdTime: trade.exitTime - trade.entryTime
  };

- **Status**: READY_TO_APPLY

#### Replacement (ready to apply)
```javascript
// BEFORE:   // Bug: try/catch silently swallows error — returns null on ANY failure
  // including data corruption, missing fields, type mismatches
  try {
    const pnl = (trade.exitPrice - trade.entryPrice) * trade.size;
    const pnlPercent = pnl / (trade.entryPrice * trade.size) * 100;
    return {
      pnl,
      pnlPercent,
      isWin: pnl > 0,
      holdTime: trade.exitTime - trade.entryTime
    };
  } catch (e) {
    return null;  // Silent swallow — caller gets null, no idea why
  }
// AFTER:    // Validate required trade fields before calculation
  const requiredFields = ['exitPrice', 'entryPrice', 'size', 'exitTime', 'entryTime'];
  for (const field of requiredFields) {
    if (trade[field] == null) {
      throw new Error(`trade.${field} is required`);
    }
  }
  const pnl = (trade.exitPrice - trade.entryPrice) * trade.size;
  const denominator = trade.entryPrice * trade.size;
  const pnlPercent = denominator === 0 ? 0 : (pnl / denominator) * 100;
  return {
    pnl,
    pnlPercent,
    isWin: pnl > 0,
    holdTime: trade.exitTime - trade.entryTime
  };

```


### Proposal 3: 2
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:31
- **Proposed Change**:     const denominator = trade.entryPrice * trade.size;
    const pnlPercent = denominator === 0 ? 0 : (pnl / denominator) * 100;
- **Status**: READY_TO_APPLY

#### Replacement (ready to apply)
```javascript
// BEFORE:     const pnlPercent = pnl / (trade.entryPrice * trade.size) * 100;
// AFTER:      const denominator = trade.entryPrice * trade.size;
    const pnlPercent = denominator === 0 ? 0 : (pnl / denominator) * 100;
```


### Proposal 4: 3
- **Location**: ogz-meta/test-fixtures/c2b-syntax-bug.js:15
- **Proposed Change**: function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Validate inputs – they must be finite numbers and stopDistance must be > 0
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    throw new Error('balance must be a finite number');
  }
  if (typeof riskPercent !== 'number' || !Number.isFinite(riskPercent)) {
    throw new Error('riskPercent must be a finite number');
  }
  if (typeof stopDistance !== 'number' || !Number.isFinite(stopDistance) || stopDistance <= 0) {
    throw new Error('stopDistance must be a positive, non‑zero number');
  }
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
- **Status**: READY_TO_APPLY

#### Replacement (ready to apply)
```javascript
// BEFORE: function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Bug: division by zero not handled
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
// AFTER:  function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Validate inputs – they must be finite numbers and stopDistance must be > 0
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    throw new Error('balance must be a finite number');
  }
  if (typeof riskPercent !== 'number' || !Number.isFinite(riskPercent)) {
    throw new Error('riskPercent must be a finite number');
  }
  if (typeof stopDistance !== 'number' || !Number.isFinite(stopDistance) || stopDistance <= 0) {
    throw new Error('stopDistance must be a positive, non‑zero number');
  }
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}
```


## Impact Analysis
- Files potentially affected: run-empire-v2.js (main), core/indicators/IndicatorEngine.js, brokers/BrokerFactory.js, core/StateManager.js
- Dependencies: Empire V2 Architecture, IBrokerAdapter

## To Approve
Run: `node ogz-meta/approve.js MISSION-1776118306609`

## To Reject
Run: `node ogz-meta/reject.js MISSION-1776118306609`

---
Generated by Claudito Pipeline (Advisory Mode)
