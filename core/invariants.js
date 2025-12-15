/**
 * RUNTIME INVARIANTS - PREVENT REGRESSION OF SURGICAL FIXES
 * These guards ensure our critical fixes NEVER get undone
 * Run these checks at key points to catch violations immediately
 */

// INVARIANT 1: TRAI must NEVER block the hot path
export function assertNoBlockingAI() {
  if (global.__awaitedTRAI__) {
    throw new Error("❌ INVARIANT VIOLATION: TRAI awaited in hot path! Must be fire-and-forget");
  }
}

// INVARIANT 2: StateManager is the ONLY source of truth
export function assertSingleStateOwner() {
  const violations = [];
  if (global.__duplicateBalance__) violations.push("Duplicate balance tracking detected");
  if (global.__duplicatePosition__) violations.push("Duplicate position tracking detected");
  if (global.__duplicateTrades__) violations.push("Duplicate trades Map detected");

  if (violations.length > 0) {
    throw new Error(`❌ STATE INVARIANT VIOLATION:\n${violations.join('\n')}`);
  }
}

// INVARIANT 3: No recursive rate limiting
export function assertNoRecursion(depth = 0, maxDepth = 10) {
  if (depth > maxDepth) {
    throw new Error(`❌ RECURSION VIOLATION: Stack depth ${depth} exceeds max ${maxDepth}`);
  }
}

module.exports = { assertNoBlockingAI, assertSingleStateOwner, assertNoRecursion };