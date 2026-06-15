'use strict';

const {
  buildRuntimeConfigProof,
  logRuntimeConfigProof,
} = require('../core/RuntimeConfigProof');

function snapshotFixture() {
  return {
    fingerprint: 'abc123',
    config: {
      mode: {
        execution: 'live',
        liveTrading: true,
        paperTrading: false,
        backtest: false,
      },
      broker: {
        id: 'alpaca',
        assetClass: 'stocks',
        tradingPair: 'TSLA',
        alpacaSymbols: 'TSLA',
        candleTimeframe: '15m',
        alpacaMode: 'paper',
        alpacaApiKey: 'fixture-api-key',
        alpacaApiSecret: 'fixture-api-value',
      },
      confidence: {
        minTradeConfidence: 0.5,
        minStrategyConfidence: 0.35,
      },
      filters: {
        atrEnabled: false,
        atrMinPercent: 0.15,
      },
      risk: {
        riskManagerBypass: false,
        accountDrawdownBypass: false,
        maxDrawdown: 5,
        maxDailyLoss: 1,
        maxWeeklyLoss: 5,
        maxMonthlyLoss: 5,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          volumeCap: {
            timeframe: '1m',
            percent: 0.05,
          },
          accountLimits: {
            dailyLossDollars: 50,
            maxLossThresholdEquity: 4850,
          },
          consistency: {
            profitTargetDollars: 300,
            maxPositionProfitRatio: 0.3,
          },
        },
      },
      exits: {
        stopLossPercent: 1.5,
        takeProfitPercent: 2,
        trailingStopPercent: 3.5,
        exitSystem: 'maxprofit',
      },
      fees: {
        model: 'per_share_minimum',
        makerFee: 0,
        takerFee: 0,
        perShare: 0.005,
        minOrderFee: 0.75,
      },
      webhookOrders: {
        webhookUrl: 'https://webhook.example.invalid/hook/fixture-path',
      },
    },
    sources: {
      'mode.execution': 'env:EXECUTION_MODE',
      'mode.liveTrading': 'env:LIVE_TRADING',
      'mode.paperTrading': 'env:PAPER_TRADING',
      'mode.backtest': 'env:BACKTEST_MODE',
      'broker.id': 'env:BROKER',
      'broker.assetClass': 'env:ASSET_CLASS',
      'broker.tradingPair': 'env:TRADING_PAIR',
      'broker.alpacaSymbols': 'env:ALPACA_SYMBOLS',
      'broker.candleTimeframe': 'env:CANDLE_TIMEFRAME',
      'broker.alpacaMode': 'env:ALPACA_MODE',
      'broker.apiKey': 'default',
      'broker.apiSecret': 'default',
      'broker.alpacaApiKey': 'env:ALPACA_API_KEY',
      'broker.alpacaApiSecret': 'env:ALPACA_API_SECRET',
      'webhookOrders.enabled': 'env:WEBHOOK_ORDERS_ENABLED',
      'webhookOrders.dryRun': 'env:WEBHOOK_DRY_RUN',
      'webhookOrders.webhookUrl': 'env:SIGNALSTACK_WEBHOOK_URL',
      'confidence.minTradeConfidence': 'env:MIN_TRADE_CONFIDENCE',
      'confidence.minStrategyConfidence': 'env:MIN_STRATEGY_CONFIDENCE',
      'filters.atrEnabled': 'default',
      'filters.atrMinPercent': 'env:ATR_MIN_PERCENT',
      'risk.riskManagerBypass': 'env:RISK_MANAGER_BYPASS',
      'risk.accountDrawdownBypass': 'env:ACCOUNT_DRAWDOWN_BYPASS',
      'risk.maxDrawdown': 'env:MAX_DRAWDOWN',
      'risk.maxDailyLoss': 'env:MAX_DAILY_LOSS',
      'risk.maxWeeklyLoss': 'env:MAX_WEEKLY_LOSS',
      'risk.maxMonthlyLoss': 'env:MAX_MONTHLY_LOSS',
      'evalRules.enabled': 'env:EVAL_RULES_ENABLED',
      'evalRules.ttp.enabled': 'env:TTP_RULES_ENABLED',
      'evalRules.ttp.accountLimits.dailyLossDollars': 'env:TTP_DAILY_LOSS_LIMIT_DOLLARS',
      'evalRules.ttp.accountLimits.maxLossThresholdEquity': 'env:TTP_MAX_LOSS_THRESHOLD_EQUITY',
      'evalRules.ttp.consistency.profitTargetDollars': 'env:TTP_PROFIT_TARGET_DOLLARS',
      'evalRules.ttp.consistency.maxPositionProfitRatio': 'env:TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO',
      'evalRules.ttp.volumeCap.timeframe': 'env:TTP_VOLUME_CAP_TIMEFRAME',
      'evalRules.ttp.volumeCap.percent': 'env:TTP_VOLUME_CAP_PERCENT',
      'exits.stopLossPercent': 'env:STOP_LOSS_PERCENT',
      'exits.takeProfitPercent': 'env:TAKE_PROFIT_PERCENT',
      'exits.trailingStopPercent': 'env:TRAILING_STOP_PERCENT',
      'exits.exitSystem': 'env:EXIT_SYSTEM',
      'fees.makerFee': 'env:FEE_MAKER',
      'fees.takerFee': 'env:FEE_TAKER',
      'fees.model': 'env:FEE_MODEL',
      'fees.perShare': 'env:FEE_PER_SHARE',
      'fees.minOrderFee': 'env:FEE_MIN_ORDER',
    },
  };
}

function tradingConfigFixture() {
  const values = {
    'confidence.minTradeConfidence': 0.35,
    'confidence.minStrategyConfidence': 0.35,
    'filters.atrEnabled': false,
    'filters.atrMinPercent': 0.15,
    'positionSizing.basePositionSize': 0.01,
    'positionSizing.maxPositionSize': 0.05,
    'entryLogic.sizing.absoluteCapPercent': 0.15,
    'exits.stopLossPercent': 0.5,
    'exits.takeProfitPercent': 1,
    'exits.trailingStopPercent': 0.8,
    'exits.exitSystem': 'legacy',
    'exits.profitTiers.tier1': 0.007,
    'exits.profitTiers.tier2': 0.01,
    'exits.profitTiers.tier3': 0.015,
    'exits.profitTiers.final': 0.025,
    'fees.makerFee': 0,
    'fees.takerFee': 0,
    'fees.slippage': 0.0005,
    'fees.totalRoundTrip': 0,
    'fees.model': 'per_share_minimum',
    'fees.perShare': 0.005,
    'fees.minOrderFee': 0.75,
    'features.enableDynamicSizing': true,
    'features.enableShorts': true,
  };

  return {
    get: key => values[key],
    getTuningProfileStatus: () => ({
      activeProfile: null,
      activeProfileSource: null,
      profileOverrideCount: 0,
    }),
  };
}

describe('RuntimeConfigProof', () => {
  test('records ConfigLoader sources next to TradingConfig effective trade tunables', () => {
    const proof = buildRuntimeConfigProof(
      snapshotFixture(),
      tradingConfigFixture(),
      { now: new Date('2026-06-12T15:30:00Z') }
    );

    expect(proof.event).toBe('RUNTIME_CONFIG_PROOF');
    expect(proof.timestamp).toBe('2026-06-12T15:30:00.000Z');
    expect(proof.configLoader.filters.atrEnabled).toEqual({ value: false, source: 'default' });
    expect(proof.configLoader.risk.riskManagerBypass).toEqual({ value: false, source: 'env:RISK_MANAGER_BYPASS' });
    expect(proof.configLoader.evalRules.dailyLossDollars).toEqual({ value: 50, source: 'env:TTP_DAILY_LOSS_LIMIT_DOLLARS' });
    expect(proof.configLoader.broker.alpacaApiKey).toEqual({ present: true, source: 'env:ALPACA_API_KEY' });
    expect(proof.configLoader.broker.alpacaApiSecret).toEqual({ present: true, source: 'env:ALPACA_API_SECRET' });
    expect(proof.configLoader.broker.krakenApiSecret).toEqual({ present: false, source: 'default' });
    expect(proof.configLoader.webhookOrders.webhookUrl).toEqual({
      present: true,
      protocol: 'https:',
      source: 'env:SIGNALSTACK_WEBHOOK_URL',
    });
    expect(proof.tradingConfig.tuningProfile.activeProfile).toBeNull();
    expect(proof.tradingConfig.confidence.minTradeConfidence).toBe(0.35);
    expect(proof.tradingConfig.exits.stopLossPercent).toBe(0.5);
    expect(proof.tradingConfig.fees.slippage).toBe(0.0005);
  });

  test('does not serialize secrets or webhook URLs', () => {
    const proof = buildRuntimeConfigProof(snapshotFixture(), tradingConfigFixture());
    const serialized = JSON.stringify(proof);

    expect(serialized).not.toContain('fixture-api-key');
    expect(serialized).not.toContain('fixture-api-value');
    expect(serialized).not.toContain('webhook.example.invalid');
    expect(serialized).not.toContain('fixture-path');
  });

  test('preserves missing source metadata as null without leaking malformed URLs', () => {
    const snapshot = snapshotFixture();
    snapshot.config.webhookOrders.webhookUrl = 'not-a-valid-url-with-secret-path';
    delete snapshot.sources['filters.atrEnabled'];

    const proof = buildRuntimeConfigProof(snapshot, tradingConfigFixture());
    const serialized = JSON.stringify(proof);

    expect(proof.configLoader.filters.atrEnabled).toEqual({ value: false, source: null });
    expect(proof.configLoader.webhookOrders.webhookUrl).toEqual({
      present: true,
      protocol: 'invalid',
      source: 'env:SIGNALSTACK_WEBHOOK_URL',
    });
    expect(serialized).not.toContain('not-a-valid-url-with-secret-path');
  });

  test('logs one parseable startup proof line', () => {
    const lines = [];
    const proof = logRuntimeConfigProof(snapshotFixture(), tradingConfigFixture(), {
      log: line => lines.push(line),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[RUNTIME-CONFIG-PROOF\] /);
    expect(JSON.parse(lines[0].replace('[RUNTIME-CONFIG-PROOF] ', ''))).toEqual(proof);
  });
});
