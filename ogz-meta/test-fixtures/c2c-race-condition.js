// C2C VERIFICATION FIXTURE — DO NOT USE IN PRODUCTION
// This file contains a deliberately planted race condition for
// Claudito chain Level 3 (semantic understanding) verification.
// Pipeline should identify the TOCTOU pattern and propose a fix.

'use strict';

const activeTrades = new Map();

/**
 * Reduce a trade position by a fraction.
 * Contains a TOCTOU (time-of-check time-of-use) race condition:
 * Between reading remainingSize and updating it, another concurrent
 * caller could have already reduced or closed this trade.
 *
 * @param {string} tradeId - Trade identifier
 * @param {number} fraction - Fraction to close (0-1)
 * @param {object} broker - Broker adapter with sendCloseOrder method
 * @returns {number|null} Remaining size after reduction
 */
async function reducePositionUnsafe(tradeId, fraction, broker) {
  const trade = activeTrades.get(tradeId);
  if (!trade || trade.remainingSize === 0) return null;

  // RACE WINDOW START: trade.remainingSize is read here
  const closeSize = trade.remainingSize * fraction;

  // Async gap: broker call takes network time
  // Another caller could mutate trade.remainingSize during this await
  await broker.sendCloseOrder(trade.symbol, closeSize);

  // RACE WINDOW END: updating with stale reference
  // If another caller already reduced remainingSize, this calculation
  // uses the old value, potentially going negative or double-counting
  trade.remainingSize -= closeSize;

  return trade.remainingSize;
}

/**
 * Process multiple orders concurrently.
 * Contains a forEach+async anti-pattern: the function returns
 * before any orders are actually processed.
 *
 * @param {Array} orders - Array of order objects
 * @returns {Array} Results (BUG: always returns empty array)
 */
async function processOrdersBatch(orders) {
  const results = [];

  // Bug: forEach does NOT await async callbacks
  // This returns immediately with an empty results array
  orders.forEach(async (order) => {
    const result = await validateAndExecute(order);
    results.push(result);
  });

  return results;  // Always empty — promises haven't resolved yet
}

async function validateAndExecute(order) {
  // Simulated async operation
  return { orderId: order.id, status: 'filled', timestamp: Date.now() };
}

module.exports = { reducePositionUnsafe, processOrdersBatch, activeTrades };
