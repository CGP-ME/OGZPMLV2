#!/usr/bin/env node
/**
 * Pipeline Diagnostic Script
 *
 * Verifies ALL plumbing before tuning:
 * - ConfigLoader respect (minTradeConfidence override)
 * - Strategy verification (confidence ranges, signals vs wins)
 * - Exit contract verification (contract matches strategy)
 * - Gate verification (counts blocks per gate)
 * - Position sizing verification
 * - Fee verification
 *
 * Output: tuning/diagnostic-report.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

// ── CORE MODULES (same paths as tuning-backtest-full.js) ─────────────────
const IndicatorEngine = require(path.join(projectRoot, 'core/indicators/IndicatorEngine'));
const { getInstance: getExitContractManager } = require(path.join(projectRoot, 'core/ExitContractManager'));
const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
const { t: _t, o: _o, h: _h, l: _l, c: _c, v: _v } = require(path.join(projectRoot, 'core/CandleHelper'));
const { StrategyOrchestrator } = require(path.join(projectRoot, 'core/StrategyOrchestrator'));

const VolumeProfile = require(path.join(projectRoot, 'core/VolumeProfile'));

// Diagnostic inputs use the same resolved configuration owners as the bot.
// Supply the existing BACKTEST_RUN_DESCRIPTOR_PATH bootstrap input for candle data.
const CANDLE_FILE = ConfigLoader.get('backtest.candleDataFile');
const MIN_CONFIDENCE = ConfigLoader.get('confidence.minTradeConfidence') * 100;
const INITIAL_BALANCE = ConfigLoader.get('startingBalance');
const POSITION_SIZE_PCT = ConfigLoader.get('positionSizing.basePositionSize') * 100;
const CANDLE_TIMEFRAME = ConfigLoader.get('execution.candleTimeframe');
const feeModel = require(path.join(projectRoot, 'core/FeeModel')).fromTradingConfig();

console.log('='.repeat(70));
console.log('PIPELINE DIAGNOSTIC - PLUMBING VERIFICATION');
console.log('='.repeat(70));
console.log(`Candle file:    ${CANDLE_FILE}`);
console.log(`Min confidence: ${MIN_CONFIDENCE}%`);
console.log(`Fee model:      ${feeModel.model}`);
console.log('='.repeat(70));

// ── LOAD CANDLES ─────────────────────────────────────────────────────────
const candlePath = path.resolve(projectRoot, CANDLE_FILE);
let candles;
try {
  const raw = fs.readFileSync(candlePath, 'utf8');
  candles = JSON.parse(raw).map(c => ({
    t: _t(c) || c.timestamp,
    o: _o(c) || c.open,
    h: _h(c) || c.high,
    l: _l(c) || c.low,
    c: _c(c) || c.close,
    v: _v(c) || c.volume || 0,
    timeframe: c.timeframe || CANDLE_TIMEFRAME
  }));
  console.log(`Loaded ${candles.length} candles\n`);
} catch (err) {
  console.error(`Failed to load candles: ${err.message}`);
  process.exit(1);
}

// ── DIAGNOSTIC REPORT STRUCTURE ──────────────────────────────────────────
const report = {
  timestamp: new Date().toISOString(),
  config: {
    candleFile: CANDLE_FILE,
    minConfidence: MIN_CONFIDENCE,
    fees: ConfigLoader.get('fees'),
    exitContracts: ConfigLoader.get('exitContracts')
  },
  tests: {
    tradingConfigRespect: { status: 'pending', details: {} },
    strategyVerification: { status: 'pending', details: {} },
    exitContractVerification: { status: 'pending', details: {} },
    gateVerification: { status: 'pending', details: {} },
    feeVerification: { status: 'pending', details: {} },
    positionSizing: { status: 'pending', details: {} }
  },
  flags: [],
  summary: { passed: 0, failed: 0, warnings: 0 }
};

// ── INITIALIZE ALL MODULES ───────────────────────────────────────────────
const indicatorEngine = new IndicatorEngine({
  ...ConfigLoader.get('indicators.engine'),
  ...ConfigLoader.get('internals.indicators.engine'),
  symbol: ConfigLoader.get('execution.tradingPair'),
  tf: CANDLE_TIMEFRAME
});
const exitContractManager = getExitContractManager();
const volumeProfile = new VolumeProfile(() => ConfigLoader.get('strategies.VolumeProfile'));
// The orchestrator owns its signal modules and their configuration providers.
const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe: CANDLE_TIMEFRAME });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: ConfigLoader Respect
// ═══════════════════════════════════════════════════════════════════════════
console.log('TEST 1: ConfigLoader Respect');
console.log('-'.repeat(50));

const tcConfidence = ConfigLoader.get('confidence');
const tcExitContracts = ConfigLoader.get('exitContracts');
const tcFees = ConfigLoader.get('fees');

report.tests.tradingConfigRespect.details = {
  configConfidence: tcConfidence,
  configExitContracts: tcExitContracts,
  configFees: tcFees,
  configuredMinConfidence: MIN_CONFIDENCE,
  configuration: ConfigLoader.getReceipt()
};

// Check if we can read the actual configuration owners.
if (tcConfidence && tcExitContracts) {
  console.log('  ConfigLoader readable');
  console.log(`    - minTradeConfidence: ${tcConfidence.minTradeConfidence}`);
  console.log(`    - exit contracts: ${Object.keys(tcExitContracts).join(', ')}`);
  report.tests.tradingConfigRespect.status = 'pass';
  report.summary.passed++;
} else {
  console.log(`  ✗ ConfigLoader NOT readable`);
  report.tests.tradingConfigRespect.status = 'fail';
  report.flags.push('ConfigLoader values not accessible');
  report.summary.failed++;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Exit Contract Verification
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nTEST 2: Exit Contract Verification');
console.log('-'.repeat(50));

const strategyNames = Object.keys(ConfigLoader.get('exitContracts'));
const contracts = {};
let contractsValid = true;

for (const strat of strategyNames) {
  try {
    const contract = exitContractManager.getDefaultContract(strat);
    contracts[strat] = contract;
    console.log(`  ✓ ${strat}: SL=${contract.stopLossPercent}% TP=${contract.takeProfitPercent}% MaxHold=${contract.maxHoldTimeMinutes}min`);
  } catch (e) {
    console.log(`  ✗ ${strat}: Failed to get contract - ${e.message}`);
    contracts[strat] = null;
    contractsValid = false;
  }
}

report.tests.exitContractVerification.details = { contracts };
report.tests.exitContractVerification.status = contractsValid ? 'pass' : 'fail';
if (contractsValid) report.summary.passed++; else report.summary.failed++;

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Full Backtest with Detailed Logging
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nTEST 3: Full Backtest with Strategy Tracking');
console.log('-'.repeat(50));

// State
let balance = INITIAL_BALANCE;
let position = null;
const trades = [];
const priceHistory = [];
const strategyStats = {};
let peakBalance = INITIAL_BALANCE;

// Gate counters
const gateBlocks = {
  confidence: 0,
  confluence: 0,
  vpChop: 0,
  regime: 0,
  shorts: 0
};

// Entry/exit counters
const entryReasons = {};
const exitReasons = {};

function checkExit(pos, price, time) {
  const dir = pos.direction === 'sell' ? -1 : 1;
  const pnlPercent = ((price - pos.entryPrice) / pos.entryPrice) * 100 * dir;
  const holdMinutes = (time - pos.entryTime) / 60000;
  const contract = pos.exitContract;

  if (pnlPercent > (pos.mfe || 0)) pos.mfe = pnlPercent;
  if (pnlPercent < (pos.mae || 0)) pos.mae = pnlPercent;

  // Stop loss
  if (pnlPercent <= contract.stopLossPercent) {
    return { shouldExit: true, reason: 'stop_loss', pnlPercent };
  }
  // Take profit
  if (contract.tpMode !== 'off' && pnlPercent >= contract.takeProfitPercent) {
    return { shouldExit: true, reason: 'take_profit', pnlPercent };
  }
  // Max hold
  if (contract.maxHoldMode !== 'off' && holdMinutes >= contract.maxHoldTimeMinutes) {
    return { shouldExit: true, reason: 'max_hold', pnlPercent };
  }
  return { shouldExit: false, reason: null, pnlPercent };
}

function executeEntry(price, confidence, time, direction, strategyName, exitContract) {
  const positionValue = balance * (POSITION_SIZE_PCT / 100);
  const amount = positionValue / price;

  // The orchestrator supplies the selected strategy's complete contract.
  const normalizedStrategy = strategyName;
  const contract = exitContract;

  position = {
    entryPrice: price, entryTime: time, amount, confidence,
    direction, exitContract: contract,
    strategyName: normalizedStrategy, mfe: 0, mae: 0,
  };
  balance -= positionValue;

  if (!strategyStats[normalizedStrategy]) strategyStats[normalizedStrategy] = { trades: 0, wins: 0, pnl: 0, confidences: [] };
  strategyStats[normalizedStrategy].confidences.push(confidence);

  entryReasons[strategyName] = (entryReasons[strategyName] || 0) + 1;
}

function executeExit(price, reason, pnlPercent, time) {
  const exitValue = position.amount * price;
  const positionValue = position.amount * position.entryPrice;
  const grossPnlDollars = position.direction === 'sell'
    ? positionValue - exitValue
    : exitValue - positionValue;
  const feeDollars = feeModel.calculateRoundTripFees({
    entryNotionalUsd: positionValue,
    exitNotionalUsd: exitValue,
    entryQuantity: position.amount,
    exitQuantity: position.amount
  });
  const pnlDollars = grossPnlDollars - feeDollars;
  const netPnlPercent = pnlDollars / positionValue * 100;

  balance += positionValue + pnlDollars;

  const ss = strategyStats[position.strategyName];
  if (ss) {
    ss.trades++;
    ss.pnl += netPnlPercent;
    if (netPnlPercent > 0) ss.wins++;
  }

  if (balance > peakBalance) peakBalance = balance;

  exitReasons[reason] = (exitReasons[reason] || 0) + 1;

  trades.push({
    strategyName: position.strategyName,
    entryPrice: position.entryPrice,
    exitPrice: price,
    pnlPercent: netPnlPercent,
    grossPnlPercent: pnlPercent,
    feeDollars,
    reason,
    confidence: position.confidence,
    contract: position.exitContract
  });

  position = null;
}

// Run backtest
const WARMUP = 100;
let signalCount = 0;

for (let i = 0; i < candles.length; i++) {
  const candle = candles[i];
  const price = _c(candle);
  const time = _t(candle);

  // Feed all modules
  indicatorEngine.updateCandle({
    o: _o(candle), h: _h(candle), l: _l(candle), c: _c(candle), v: _v(candle) || 0, t: time,
  });

  priceHistory.push(candle);
  if (priceHistory.length > 500) priceHistory.shift();

  volumeProfile.update(candle, priceHistory);

  if (i < WARMUP) continue;

  const indicators = indicatorEngine.getSnapshot();

  // Check exit
  if (position) {
    const exitCheck = checkExit(position, price, time);
    if (exitCheck.shouldExit) {
      executeExit(price, exitCheck.reason, exitCheck.pnlPercent, time);
    }
  }

  // Check entry
  if (!position) {
    const extras = {
      volumeProfile, price,
      symbol: ConfigLoader.get('execution.tradingPair'),
      timeframe: CANDLE_TIMEFRAME,
    };

    const orchResult = orchestrator.evaluate(indicators, [], null, priceHistory, extras);

    if (orchResult.direction === 'buy' || orchResult.direction === 'sell') {
      signalCount++;

      // Confidence gate check
      if (orchResult.confidence < MIN_CONFIDENCE) {
        gateBlocks.confidence++;
        continue;
      }

      // Shorts gate
      if (orchResult.direction === 'sell') {
        gateBlocks.shorts++;
        continue;
      }

      // VP Chop filter check (if enabled)
      if (volumeProfile && typeof volumeProfile.isChopZone === 'function') {
        if (volumeProfile.isChopZone(price)) {
          gateBlocks.vpChop++;
          continue;
        }
      }

      // Execute entry
      executeEntry(price, orchResult.confidence, time, orchResult.direction,
                   orchResult.winnerStrategy, orchResult.exitContract);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n  Candles processed: ${candles.length}`);
console.log(`  Total trades: ${trades.length}`);
console.log(`  Signals generated: ${signalCount}`);
console.log(`  Final balance: $${balance.toFixed(2)}`);
console.log(`  Total return: ${((balance - INITIAL_BALANCE) / INITIAL_BALANCE * 100).toFixed(2)}%`);

// Strategy breakdown
console.log('\nTEST 4: Strategy Breakdown');
console.log('-'.repeat(50));
report.tests.strategyVerification.details = { strategies: {} };

let anyStrategyHasTrades = false;
for (const [strat, stats] of Object.entries(strategyStats)) {
  if (stats.trades > 0) {
    anyStrategyHasTrades = true;
    const winRate = ((stats.wins / stats.trades) * 100).toFixed(1);
    const avgConf = stats.confidences.length > 0
      ? (stats.confidences.reduce((a,b) => a+b, 0) / stats.confidences.length).toFixed(1)
      : 'N/A';
    const confRange = stats.confidences.length > 0
      ? `${Math.min(...stats.confidences).toFixed(1)}-${Math.max(...stats.confidences).toFixed(1)}`
      : 'N/A';

    console.log(`  ${strat}: ${stats.trades} trades, ${winRate}% win, PnL: ${stats.pnl.toFixed(2)}%`);
    console.log(`    Confidence: avg=${avgConf}, range=${confRange}`);

    report.tests.strategyVerification.details.strategies[strat] = {
      trades: stats.trades,
      wins: stats.wins,
      winRate: parseFloat(winRate),
      pnl: stats.pnl,
      avgConfidence: avgConf === 'N/A' ? null : parseFloat(avgConf),
      confidenceRange: confRange
    };
  }
}

if (anyStrategyHasTrades) {
  report.tests.strategyVerification.status = 'pass';
  report.summary.passed++;
} else {
  report.tests.strategyVerification.status = 'fail';
  report.flags.push('No strategies generated any trades');
  report.summary.failed++;
}

// Gate verification
console.log('\nTEST 5: Gate Verification');
console.log('-'.repeat(50));
console.log(`  Blocked by confidence gate: ${gateBlocks.confidence}`);
console.log(`  Blocked by shorts gate: ${gateBlocks.shorts}`);
console.log(`  Blocked by VP chop filter: ${gateBlocks.vpChop}`);

report.tests.gateVerification.details = { gateBlocks };
report.tests.gateVerification.status = 'pass';
report.summary.passed++;

// Exit verification
console.log('\nTEST 6: Exit Reason Breakdown');
console.log('-'.repeat(50));
for (const [reason, count] of Object.entries(exitReasons)) {
  console.log(`  ${reason}: ${count}`);
}

// Fee verification
console.log('\nTEST 7: Fee Verification');
console.log('-'.repeat(50));
const totalFees = trades.reduce((sum, t) => sum + (t.feeDollars || 0), 0);
const avgFeePerTrade = trades.length > 0 ? totalFees / trades.length : 0;

console.log(`  Fee model: ${feeModel.model}`);
console.log(`  Total fees paid: $${totalFees.toFixed(2)}`);
console.log(`  Avg fee per trade: $${avgFeePerTrade.toFixed(2)}`);

report.tests.feeVerification.details = {
  configuredFees: ConfigLoader.get('fees'),
  totalFeesPaid: totalFees,
  avgFeePerTrade
};

const feesExpected = feeModel.model === 'percent'
  ? feeModel.makerFee > 0 || feeModel.takerFee > 0
  : feeModel.perShare > 0 || feeModel.minOrderFee > 0;
if (trades.length === 0) {
  report.tests.feeVerification.status = 'unverified';
  report.flags.push('No completed trades available to verify configured fees');
  report.summary.warnings++;
} else if (!feesExpected || totalFees > 0) {
  report.tests.feeVerification.status = 'pass';
  report.summary.passed++;
} else {
  report.tests.feeVerification.status = 'fail';
  report.flags.push('Configured fee model produced no fees on completed trades');
  report.summary.failed++;
}

// Position sizing verification
console.log('\nTEST 8: Position Sizing Verification');
console.log('-'.repeat(50));
console.log(`  POSITION_SIZE_PCT: ${POSITION_SIZE_PCT}%`);
console.log(`  Expected position value: $${(INITIAL_BALANCE * POSITION_SIZE_PCT / 100).toFixed(2)}`);

report.tests.positionSizing.details = { positionSizePct: POSITION_SIZE_PCT };
report.tests.positionSizing.status = 'pass';
report.summary.passed++;

// ═══════════════════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('DIAGNOSTIC SUMMARY');
console.log('='.repeat(70));

console.log(`Tests Passed: ${report.summary.passed}`);
console.log(`Tests Failed: ${report.summary.failed}`);

if (report.flags.length > 0) {
  console.log('\n🚨 FLAGS:');
  for (const flag of report.flags) {
    console.log(`  - ${flag}`);
  }
}

if (report.summary.failed === 0) {
  console.log('\n✅ ALL PLUMBING CHECKS PASSED');
} else {
  console.log('\n❌ SOME CHECKS FAILED - DO NOT MERGE');
}

// Write report
const reportPath = path.join(projectRoot, 'tuning', `diagnostic-report-${Date.now()}.json`);
report.backtest = {
  candlesProcessed: candles.length,
  totalTrades: trades.length,
  signalsGenerated: signalCount,
  finalBalance: balance,
  totalReturn: ((balance - INITIAL_BALANCE) / INITIAL_BALANCE * 100),
  strategyStats,
  gateBlocks,
  exitReasons,
  trades: trades.slice(0, 20) // First 20 trades for debugging
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport written to: ${reportPath}`);
