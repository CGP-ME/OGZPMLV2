/**
 * BacktestRunner - Phase 18 Extraction
 *
 * EXACT COPY of loadHistoricalDataAndBacktest() from run-empire-v2.js
 * NO logic changes. Just moved to separate file.
 *
 * Dependencies passed via context object in constructor.
 *
 * @module core/BacktestRunner
 */

'use strict';

const { getInstance: getStateManager } = require('./StateManager');
const { get: getConfigValue } = require('../foundation/ConfigLoader');
const stateManager = getStateManager();

class BacktestRunner {
  constructor(ctx) {
    this.ctx = ctx;
    console.log('[BacktestRunner] Initialized (Phase 18 - exact copy)');
  }

  /**
   * BACKTEST MODE: Load historical data and run simulation
   * Ported from Change 572 - loads Polygon historical data and feeds through trading logic
   * EXACT COPY from run-empire-v2.js
   */
  async loadHistoricalDataAndBacktest() {
    // NOTE: State isolation moved to run-empire-v2.js startup (BEFORE StateManager loads)
    // See: FIX 2026-03-12 at top of run-empire-v2.js
    const path = require('path');

    console.log('📊 BACKTEST MODE: Loading historical data...');

    const fs = require('fs').promises;
    // path already required above for state isolation

    try {
      // Load historical candles - check for custom data file first (CHANGE 633)
      let dataPath;
      const candleDataFile = getConfigValue('backtest.candleDataFile');
      const candleFile = getConfigValue('backtest.candleFile');
      if (candleDataFile || candleFile) {
        // Use custom candle data file (e.g., 5-second candles for optimization)
        dataPath = candleDataFile || candleFile;
        console.log(`📂 Using custom data file: ${dataPath}`);
      } else {
        // Default behavior - CHANGE 633: Use 5-second candles for fast backtest
        const dataFile = getConfigValue('backtest.fastBacktest')
          ? 'polygon-btc-5sec.json'  // 60k 5-second candles for rapid testing
          : 'polygon-btc-1y.json';    // 60k 1-minute candles for full validation
        console.log(`📂 Data file: data/${dataFile}`);
        dataPath = path.join(this.ctx.__dirname, 'data', dataFile);
      }
      const rawData = await fs.readFile(dataPath, 'utf8');
      const parsedData = JSON.parse(rawData);
      // Handle both formats: array of candles or object with .candles property
      const historicalCandles = parsedData.candles || parsedData;

      console.log(`✅ Loaded ${historicalCandles.length.toLocaleString()} historical candles`);
      console.log(`📅 Date range: ${new Date(historicalCandles[0].timestamp).toLocaleDateString()} → ${new Date(historicalCandles[historicalCandles.length - 1].timestamp).toLocaleDateString()}`);
      console.log(`⏱️  Starting backtest simulation...\n`);

      let processedCount = 0;
      let errorCount = 0;
      const startTime = Date.now();

      // Process each candle through the trading logic
      for (const polygonCandle of historicalCandles) {
        try {
          // Convert to OHLCV format - handle both Polygon format and shorthand
          // FIX 2026-03-12: Use ?? instead of || to handle 0 values correctly (volume is often 0)
          const ohlcvCandle = {
            o: polygonCandle.open ?? polygonCandle.o,
            h: polygonCandle.high ?? polygonCandle.h,
            l: polygonCandle.low ?? polygonCandle.l,
            c: polygonCandle.close ?? polygonCandle.c,
            v: polygonCandle.volume ?? polygonCandle.v ?? 0,
            t: polygonCandle.timestamp ?? polygonCandle.t
          };

          // Feed through handleMarketData (same as live mode)
          this.ctx.handleMarketData([
            ohlcvCandle.t / 1000,  // time (in seconds for Kraken compatibility)
            (ohlcvCandle.t / 1000) + 60,  // etime (end time)
            ohlcvCandle.o,
            ohlcvCandle.h,
            ohlcvCandle.l,
            ohlcvCandle.c,
            0,  // vwap (not used)
            ohlcvCandle.v,
            1   // count
          ]);

          // Run trading analysis after warmup (WITH TRAI!)
          if (this.ctx.priceHistory.length >= 15) {  // RSI backtest: was 200
            await this.ctx.analyzeAndTrade();
          }

          processedCount++;

          // Progress reporting every 5,000 candles
          if (processedCount % 5000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (processedCount / (elapsed || 1)).toFixed(0);
            console.log(`📊 Progress: ${processedCount.toLocaleString()}/${historicalCandles.length.toLocaleString()} candles (${rate}/sec) | Errors: ${errorCount}`);
          }

        } catch (err) {
          errorCount++;
          if (errorCount <= 5) {
            console.error(`❌ Error processing candle #${processedCount}:`, err.message);
          }
            console.error(err.stack);
        }
      }

      // FIX 2026-03-12: Force-close any open position at backtest end
      // This prevents money from staying "locked" in inPosition when backtest ends mid-trade
      // FIX 2026-03-26 Bug 11: Use !== 0 to also close short positions (negative values)
      const activeTrades = stateManager.getAllTrades();
      if (activeTrades.length > 0) {
        const lastCandle = historicalCandles[historicalCandles.length - 1];
        const lastPrice = lastCandle.close ?? lastCandle.c;
        for (const trade of activeTrades) {
          const direction = trade.direction === 'short' || trade.action === 'SELL_SHORT' ? 'SHORT' : 'LONG';
          console.log(`\n⚠️ BACKTEST_END_CLOSE: Force-closing ${direction} trade ${trade.orderId || trade.id} at $${lastPrice.toFixed(2)}`);
          try {
            await stateManager.closePosition(lastPrice, false, null, { tradeId: trade.orderId || trade.id, reason: 'BACKTEST_END_CLOSE' });
          } catch (err) {
            console.error(`❌ BACKTEST_END_CLOSE failed for trade ${trade.orderId || trade.id}: ${err.message}`);
          }
        }
      }

      // Final summary
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      // FIX 2026-04-02: Use BacktestRecorder's P&L (correct) instead of StateManager's balance
      // StateManager.balance never moves since 2026-03-28 per-trade equity refactor —
      // only realizedPnL changes. BacktestRecorder independently sums each trade's netPnlDollars
      // which IS the correct final balance. This eliminates the "two different Final Balance" bug
      // that caused confusion in debugging sessions.
      const trades = this.ctx.backtestRecorder?.trades || [];
      const winners = trades.filter(t => t.netPnlDollars > 0);
      const losers = trades.filter(t => t.netPnlDollars < 0);
      const totalPnL = trades.reduce((sum, t) => sum + (t.netPnlDollars || 0), 0);
      const initialBalance = this.ctx.backtestRecorder?.startingBalance || 10000;
      const finalBalance = initialBalance + totalPnL;
      const totalReturn = ((finalBalance / initialBalance - 1) * 100);

      // L8: Flush any buffered decision ledger entries
      try { require('./DecisionLedgerLogger').flush(); } catch (_) {}

      console.log(`\n✅ BACKTEST COMPLETE!`);
      console.log(`   📊 Candles processed: ${processedCount.toLocaleString()}`);
      console.log(`   ⏱️  Duration: ${totalTime}s`);
      console.log(`   ⚡ Rate: ${(processedCount / totalTime).toFixed(0)} candles/sec`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   💰 Final Balance: $${finalBalance.toFixed(2)}`);
      console.log(`   📈 Total P&L: $${totalPnL.toFixed(2)} (${totalReturn.toFixed(2)}%)`);
      console.log(`   📊 Trades: ${trades.length} (${winners.length}W / ${losers.length}L)`);

      // Pattern Learning Summary - Visual proof patterns are being recorded
      if (this.ctx.patternChecker?.getMemoryStats) {
        const patternStats = this.ctx.patternChecker.getMemoryStats();
        const wins = patternStats.totalWins || 0;
        const losses = patternStats.totalLosses || 0;
        const totalTrades = wins + losses;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
        console.log(`\n   🧠 PATTERN LEARNING SUMMARY:`);
        console.log(`      📊 Patterns Recorded: ${patternStats.tradeResults || 0}`);
        console.log(`      ✅ Wins: ${wins}`);
        console.log(`      ❌ Losses: ${losses}`);
        console.log(`      📈 Win Rate: ${winRate}%`);
        console.log(`      🎯 Promoted Patterns: ${patternStats.promoted || 0}`);
        console.log(`      🔬 Candidates: ${patternStats.candidates || 0}`);
      }

      // Generate backtest report
      // FIX 2026-04-16: Route to unified output directory
      const { getRunDir } = require('./OutputPaths');
      const runTimestamp = Date.now();
      const runDir = getRunDir(runTimestamp);
      const envRoot = process.env.BACKTEST_OUTPUT_DIR;
      // FIX 2026-04-22: append BACKTEST_REPORT_TAG (uid) to filename when set.
      // Matrix-sweep sets it per worker — prevents tryReadReport from grabbing another
      // worker's report via mtime-sort under parallelism. Unset = unchanged filename.
      // FIX 2026-04-22 (2nd pass): tagged workers write to backtest-results/worker-reports/
      // instead of project root. Keeps repo root clean; standalone backtests keep legacy path.
      const reportTag = process.env.BACKTEST_REPORT_TAG || '';
      // FIX 2026-04-27 (Asset Isolation audit): derive asset slug from
      // CANDLE_DATA_FILE so simultaneous standalone backtests on different
      // assets don't collide on timestamp. Mirrors UnifiedPatternMemory's
      // file-naming pattern. Empty when CANDLE_DATA_FILE unset (e.g. live
      // backtests). Matrix-sweep workers already disambiguate via reportTag.
      let assetSlug = '';
      if (process.env.CANDLE_DATA_FILE) {
        const base = path.basename(process.env.CANDLE_DATA_FILE, '.json').replace(/^polygon-/, '');
        const candidate = base.split('-')[0].toUpperCase();
        if (candidate) assetSlug = `-${candidate}`;
      }
      let reportPath;
      if (envRoot) {
        reportPath = path.join(runDir, 'report.json');
      } else if (reportTag) {
        const fs = require('fs');
        const workerDir = path.join(this.ctx.__dirname, 'backtest-results', 'worker-reports');
        if (!fs.existsSync(workerDir)) fs.mkdirSync(workerDir, { recursive: true });
        reportPath = path.join(workerDir, `backtest-report-${runTimestamp}-${reportTag}.json`);
      } else {
        reportPath = path.join(this.ctx.__dirname, `backtest-report-v14MERGED-${runTimestamp}${assetSlug}.json`);
      }

      // FIX 2026-04-21: report.summary now pulls from BacktestRecorder.getSummary() (23 fields)
      //   Previously summary was a 7-field inline rebuild — matrix-sweep and grid-search consumers
      //   only saw finalBalance/totalReturn/totalPnL. Now full metric set (profitFactor, expectancy,
      //   drawdown, streaks, strategy/exit breakdowns) flows into JSON.
      //   `totalReturn` preserved as alias for grid-search-confidence.js:77 back-compat.
      const recorderSummary = this.ctx.backtestRecorder?.getSummary
        ? this.ctx.backtestRecorder.getSummary()
        : {};
      const report = {
        summary: {
          ...recorderSummary,
          initialBalance: initialBalance,
          finalBalance: finalBalance,
          totalReturn: totalReturn,
          totalPnL: totalPnL,
          duration: `${totalTime}s`,
          candlesProcessed: processedCount,
          errors: errorCount
        },
        metrics: {
          totalTrades: trades.length,
          winningTrades: winners.length,
          losingTrades: losers.length,
          winRate: trades.length > 0 ? winners.length / trades.length : 0,
          totalPnL: totalPnL
        },
        trades: trades,
        config: {
          initialBalance: 10000,
          tier: (getConfigValue('misc.subscriptionTier') || 'ML').toUpperCase()
        },
        timestamp: new Date().toISOString()
      };

      // Write report FIRST (sync to prevent 0-byte files on timeout/exit)
      // FIX 2026-02-19: Try/catch with console fallback to prevent losing results on EMFILE
      try {
        require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
      } catch (err) {
        console.error('⚠️ Could not write report file: ' + err.message);
        console.log('📊 === BACKTEST RESULTS (CONSOLE DUMP) ===');
        console.log('Final Balance: $' + report.summary.finalBalance);
        console.log('Total P&L: $' + report.summary.totalPnL + ' (' + report.summary.totalReturn + '%)');
        console.log('Total Trades: ' + (report.metrics.totalTrades || 'N/A'));
        console.log('Win Rate: ' + (report.metrics.winRate || 'N/A'));
        console.log('📊 === END CONSOLE DUMP ===');
      }
      console.log(`\n📄 Report saved: ${reportPath}`);

      // FIX 2026-02-10: Save pattern memory after backtest (was never being saved!)
      // FIX 2026-02-19: Await async cleanup to ensure save completes before exit
      if (this.ctx.patternChecker?.cleanup) {
        await this.ctx.patternChecker.cleanup();
        console.log('🧠 Backtest patterns saved to disk');
      }

      // 🤖 TRAI Analysis of Backtest Results (Change 586)
      // Run AFTER report is saved so we always have results even if TRAI hangs
      if (this.ctx.trai && this.ctx.trai.analyzeBacktestResults) {
        console.log('\n🤖 [TRAI] Analyzing backtest results for optimization insights...');
        try {
          const traiAnalysis = await this.ctx.trai.analyzeBacktestResults(report);
          report.traiAnalysis = traiAnalysis;
          console.log('✅ TRAI Analysis Complete:', traiAnalysis.summary);
          // Re-save with TRAI analysis appended
          require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
        } catch (error) {
          console.error('⚠️ TRAI analysis failed:', error.message);
        }
      }

      // CHANGE 2026-02-23: Print BacktestRecorder summary with fees and export CSV
      // FIX 2026-04-16: Route CSV to same unified run directory as JSON report
      if (this.ctx.backtestRecorder) {
        this.ctx.backtestRecorder.printSummary();
        const csvPath = process.env.BACKTEST_OUTPUT_DIR
          ? path.join(runDir, 'trades.csv')
          : './backtest-trades.csv';
        this.ctx.backtestRecorder.exportCSV(csvPath);
      }

      // DynamicPositionSizer NOT WIRED - stats printing disabled
      // Re-enable when curves are tuned to match validated baseline

      // DIAGNOSTIC: Print strategy signal funnel
      if (this.ctx.strategyOrchestrator?.printDiagnosticFunnel) {
        this.ctx.strategyOrchestrator.printDiagnosticFunnel();
      }

      // Exit after backtest
      console.log('\n🛑 Backtest complete - exiting...');
      process.exit(0);

    } catch (err) {
      console.error('❌ BACKTEST FAILED:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }
}

module.exports = BacktestRunner;
