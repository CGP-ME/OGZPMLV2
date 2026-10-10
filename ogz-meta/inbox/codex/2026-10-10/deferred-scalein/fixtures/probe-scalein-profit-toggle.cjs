'use strict';

const Module = require('module');
const path = require('path');

const sourcePath = path.resolve(process.argv[2]);
if (!sourcePath.includes('/ogz-meta/inbox/codex/2026-10-10/deferred-scalein/fixtures/')) {
  throw new Error(`fixture source required, got ${sourcePath}`);
}

let activeTrades = [{
  direction: 'long',
  entryStrategy: 'RSI',
  entryPrice: 100,
  sizeUsd: 500,
  exitContract: { stopLossPercent: -1 },
}];

const originalLoad = Module._load;
Module._load = function fixtureLoad(request, parent, isMain) {
  if (request === './StateManager') return { getInstance: () => ({ getTradesBySymbol: () => activeTrades }) };
  if (request === './AuthFailureGuard') return {};
  if (request === '../foundation/ConfigLoader') return {};
  if (request === './ExitContractManager') return {};
  if (request === '../brokers/BrokerRegistry') return { getBrokerInfo: () => ({}) };
  if (request === '../ogz-meta/claudito-logger') return { TradingProofLogger: {} };
  if (request === './UnifiedPatternMemory') return { getInstance: () => ({}) };
  if (request === './PIDController') return { getPIDController: () => ({}) };
  if (request === './TraceSpine') return { createTraceId: () => 'fixture', emitTrace: () => {} };
  if (request === './TradeNarrator') return { getNarrator: () => ({}) };
  if (request === './FeeModel') return {};
  if (request === './dto/ExitContractOwnership') return { assertExplicitExitOwnership: () => {} };
  if (request === './PolicyBuilder') return {};
  if (request === './PositionEffect') return { positionEffectFromAction: () => null };
  return originalLoad.call(this, request, parent, isMain);
};

const OrderExecutor = require(sourcePath);
Module._load = originalLoad;
const executor = Object.create(OrderExecutor.prototype);

function plan({ direction = 'long', requireProfitConfirmation, price, aggregateRiskCap = 2, maxAdds = 1, maxConcurrentEntries = 2, addTriggerClass = 'pullback_add', entryTriggerClass = 'breakout' }) {
  return {
    action: direction === 'long' ? 'BUY' : 'SELL_SHORT', symbol: 'TSLA', direction, entryStrategy: 'RSI',
    entryTriggerClass, price, sizeUsd: 500, baseSizeUsd: 500,
    exitContract: {
      maxConcurrentEntries,
      stopLossPercent: -1,
      scaleIn: {
        enabled: true, maxAdds, addTriggerClass,
        requireProfitConfirmation, aggregateRiskCap, addSizingLadder: [],
      },
    },
  };
}

function activeTrade(direction) {
  return {
    direction, entryStrategy: 'RSI', entryPrice: 100, sizeUsd: 500,
    exitContract: { stopLossPercent: -1 },
  };
}

function run(name, entryPlan, trades = [activeTrade(entryPlan.direction)]) {
  activeTrades = trades;
  return [name, executor._entryConcurrencyBlock(entryPlan)?.reason || null];
}

const result = Object.fromEntries([
  run('long_true_unprofitable', plan({ direction: 'long', requireProfitConfirmation: true, price: 99 })),
  run('long_true_profitable', plan({ direction: 'long', requireProfitConfirmation: true, price: 101 })),
  run('long_false_unprofitable', plan({ direction: 'long', requireProfitConfirmation: false, price: 99 })),
  run('short_true_unprofitable', plan({ direction: 'short', requireProfitConfirmation: true, price: 101 })),
  run('short_true_profitable', plan({ direction: 'short', requireProfitConfirmation: true, price: 99 })),
  run('short_false_unprofitable', plan({ direction: 'short', requireProfitConfirmation: false, price: 101 })),
  run('false_over_risk_cap', plan({ direction: 'long', requireProfitConfirmation: false, price: 99, aggregateRiskCap: 1 })),
  run('false_max_adds', plan({ direction: 'long', requireProfitConfirmation: false, price: 99, maxConcurrentEntries: 3 }), [activeTrade('long'), activeTrade('long')]),
  run('false_trigger_class', plan({ direction: 'long', requireProfitConfirmation: false, price: 99, entryTriggerClass: 'pullback_add' })),
  run('invalid_value', plan({ direction: 'long', requireProfitConfirmation: 'false', price: 99 })),
]);
console.log(JSON.stringify(result));
