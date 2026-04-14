# REFACTOR PROPOSAL: MISSION-1776135236247
Generated: 2026-04-14T02:54:35.513Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: fix recordOutcome at line 218-265 in core/UnifiedPatternMemory.js to aggregate by tradeId. Add pendingOutcomes Map. Accumulate partial exit outcomes per leg. Fire pattern recording ONLY when remainingSize equals 0. Do NOT fire on null remainingSize. Read core/UnifiedPatternMemory.js. Mission 7 of 8.

## Architect Plan
Add pendingOutcomes map and aggregate trade outcomes by tradeId, recording pattern only when remainingSize === 0.

### Files to Modify
- `core/UnifiedPatternMemory.js` — 2 changes

### Commit Ordering
1. UnifiedPatternMemory.js first – add pendingOutcomes map and replace recordOutcome implementation.

### Verification
Execute the test suite with the new unit test. The test should pass, confirming that pending outcomes are accumulated and only a single pattern record is created when remainingSize reaches zero. Additionally, run existing integration tests to ensure no regression in pattern confidence queries.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/UnifiedPatternMemory.js:165-168
**Verified:** YES (Inserted pendingOutcomes map immediately after stats initialization, before loading from disk.)

```javascript
// BEFORE:
    this.stats = {
      observations: 0,
      outcomes: 0,
      promoted: 0,
      quarantined: 0,
      dtwMatches: 0,
      exactMatches: 0,
      lastPruneTime: 0,
    };

    // Load from disk
    this._load();
// AFTER:
    this.stats = {
      observations: 0,
      outcomes: 0,
      promoted: 0,
      quarantined: 0,
      dtwMatches: 0,
      exactMatches: 0,
      lastPruneTime: 0,
    };

    // NEW: pending outcomes for partial exits, keyed by tradeId
    this.pendingOutcomes = new Map();

    // Load from disk
    this._load();
```

### Edit 2: core/UnifiedPatternMemory.js:218-265
**Verified:** YES (Replaced entire recordOutcome implementation with aggregation logic using pendingOutcomes and remainingSize check.)

```javascript
// BEFORE:
  recordOutcome(features, outcome) {
    if (!this._validateFeatures(features)) return false;
    if (!outcome || typeof outcome.pnl !== 'number') return false;

    const sig = computeSignature(features);
    if (!sig) return false;

    // Create pattern if it wasn't observed first (edge case)
    if (!this.patterns[sig]) {
      this.patterns[sig] = this._createPattern(sig, features);
    }

    const p = this.patterns[sig];
    const isWin = outcome.pnl > 0;

    // Update stats
    if (isWin) {
      p.wins++;
    } else if (outcome.pnl < 0) {
      p.losses++;
    }

    p.totalPnL += outcome.pnl;
    const totalTrades = p.wins + p.losses;
    p.winRate = totalTrades > 0 ? p.wins / totalTrades : 0;
    p.avgPnL = totalTrades > 0 ? p.totalPnL / totalTrades : 0;
    p.lastOutcome = Date.now();

    // Track outcome history (keep last 20)
    p.outcomes.push({
      timestamp: Date.now(),
      pnl: outcome.pnl,
      pnlPercent: outcome.pnlPercent || 0,
      holdTimeMs: outcome.holdTimeMs || 0,
      exitReason: outcome.exitReason || 'unknown',
      strategy: outcome.strategy || 'unknown',
      isWin,
    });
    if (p.outcomes.length > 20) {
      p.outcomes = p.outcomes.slice(-20);
    }

    // Check promotion / quarantine
    this._evaluateStatus(p);

    this.stats.outcomes++;
    return true;
  }
// AFTER:
  recordOutcome(features, outcome) {
    // Validate inputs
    if (!this._validateFeatures(features)) return false;
    if (!outcome || typeof outcome.pnl !== 'number') return false;

    const { tradeId, remainingSize } = outcome;
    // Require a tradeId to aggregate; ignore if missing
    if (!tradeId) return false;
    // Do not fire when remainingSize is null or undefined
    if (remainingSize == null) return false;

    const sig = computeSignature(features);
    if (!sig) return false;

    // Ensure pattern exists (edge case where observation never happened)
    if (!this.patterns[sig]) {
      this.patterns[sig] = this._createPattern(sig, features);
    }

    // Accumulate partial outcomes in pendingOutcomes map
    const pending = this.pendingOutcomes.get(tradeId) || {
      features,
      pnl: 0,
      pnlPercent: 0,
      holdTimeMs: 0,
      exitReason: null,
      strategy: null,
    };
    pending.pnl += outcome.pnl;
    pending.pnlPercent += outcome.pnlPercent || 0;
    pending.holdTimeMs += outcome.holdTimeMs || 0;
    pending.exitReason = outcome.exitReason || pending.exitReason;
    pending.strategy = outcome.strategy || pending.strategy;
    this.pendingOutcomes.set(tradeId, pending);

    // Only record to pattern memory when the trade is fully closed (remainingSize === 0)
    if (remainingSize === 0) {
      const p = this.patterns[sig];
      const isWin = pending.pnl > 0;

      // Update stats for the aggregated outcome
      if (isWin) {
        p.wins++;
      } else if (pending.pnl < 0) {
        p.losses++;
      }
      p.totalPnL += pending.pnl;
      const totalTrades = p.wins + p.losses;
      p.winRate = totalTrades > 0 ? p.wins / totalTrades : 0;
      p.avgPnL = totalTrades > 0 ? p.totalPnL / totalTrades : 0;
      p.lastOutcome = Date.now();

      // Track aggregated outcome history (keep last 20)
      p.outcomes.push({
        timestamp: Date.now(),
        pnl: pending.pnl,
        pnlPercent: pending.pnlPercent,
        holdTimeMs: pending.holdTimeMs,
        exitReason: pending.exitReason || 'unknown',
        strategy: pending.strategy || 'unknown',
        isWin,
      });
      if (p.outcomes.length > 20) {
        p.outcomes = p.outcomes.slice(-20);
      }

      // Evaluate promotion / quarantine after final outcome
      this._evaluateStatus(p);

      this.stats.outcomes++;
      // Clean up pending entry for this trade
      this.pendingOutcomes.delete(tradeId);
    }

    // Return true to indicate the outcome was accepted (even if pending)
    return true;
  }
```



## RAG Context
- [HIGH] FIX-659-SUMMARY: Pattern memory was not growing despite hours of trading. The bot only showed the...
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] REFACTOR-2026-03-18-UNIFIED-PATTERN-MEMORY: Two separate pattern stores causing data fragmentation - PatternMemorySystem in ...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776135236247`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776135236247`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
