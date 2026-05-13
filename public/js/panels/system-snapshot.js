/**
 * system-snapshot.js — STUBBED / DORMANT
 *
 * Originally registered a Snapshot module with an `update({totalPnL, winRate,
 * tradeCount})` method that wrote to DOM IDs #totalPnl / #winRate /
 * #tradesExecuted. Nothing in the codebase ever called Snapshot.update(),
 * so the module sat idle.
 *
 * WHY THIS IS A NO-OP:
 * Those three DOM IDs are now the responsibility of TradeLog.renderSessionPerformance
 * (public/js/panels/trade-log.js). core.js line 217-218 carries a tombstone
 * comment explaining that double-writing those IDs from two sources caused a
 * trade double-count bug: "TradeLog.addEntry already updates these via
 * renderSessionPerformance(). Doubling up here was double-counting the trade
 * and reading the prior value back from textContent."
 *
 * Wiring Snapshot.update() into core.js would re-introduce that exact bug.
 *
 * This file is stubbed (not deleted) because:
 *   - unified-dashboard.html line 3367 and unified-dashboard-v2.html line 651
 *     still <script src> include it; deleting would 404 on every page load.
 *   - Future contributors searching for "Snapshot" will land on this comment
 *     and learn the history before re-wiring it.
 *
 * If you need a passive read-only snapshot of session stats, use
 *   OGZ.get('TradeLog').getSessionStats()
 * which returns {pnl, winRate, count} from the single source of truth.
 *
 * SAFE TO DELETE THIS FILE: remove the <script> tags in both dashboard HTMLs first.
 */
(function (OGZ) {
    'use strict';
    // Intentional no-op. Do NOT register a Snapshot module — see header.
})(window.OGZ = window.OGZ || {});
