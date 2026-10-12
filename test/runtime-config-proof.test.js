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
        guardMode: 'venueRailBuffer',
        venueRailBuffer: {
          enabled: true,
          railDrawdownPercent: 3,
          triggerPercent: 0.25,
          releaseOnSessionReset: true,
        },
        reconciliationReporter: {
          enabled: true,
          alertDeltaDollars: 1,
          alertDeltaPercent: 0.1,
        },
        sessionRiskResponse: {
          enabled: false,
          triggerPercent: null,
          action: 'alert',
        },
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
      exitContracts: {
        RSI: {
          profitManagement: {
            beScaleOut: {
              enabled: false,
              triggerR: 1,
              fraction: 0.25,
            },
            breakEvenStop: {
              enabled: true,
              triggerR: 1.5,
            },
            tieredExit: {
              enabled: true,
              profitTiers: {
                tier1: 0.007,
                tier2: 0.01,
                tier3: 0.015,
                final: 0.025,
              },
            },
            trail: {
              enabled: false,
              activationR: 1.25,
              distanceR: 0.5,
            },
            volatilityAdjustment: {
              enabled: false,
              threshold: 1,
              stopMultiplier: 1,
              targetMultiplier: 1,
            },
            contractVolatilityAdjustment: {
              threshold: 2,
              stopMultiplier: 1.2,
              targetMultiplier: 0.8,
            },
          },
        },
        TimeSeriesMomentum: {
          profitManagement: {
            beScaleOut: {
              enabled: false,
              triggerR: null,
              fraction: null,
            },
            breakEvenStop: {
              enabled: false,
              triggerR: null,
            },
            tieredExit: {
              enabled: false,
              profitTiers: {
                tier1: null,
                tier2: null,
                tier3: null,
                final: null,
              },
            },
            trail: {
              enabled: true,
              activationR: 1.5,
              distanceR: 0.75,
            },
            volatilityAdjustment: {
              enabled: true,
              threshold: 1.5,
              stopMultiplier: 1.1,
              targetMultiplier: 0.9,
            },
            contractVolatilityAdjustment: {
              threshold: 2.5,
              stopMultiplier: 1.25,
              targetMultiplier: 0.75,
            },
          },
        },
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
      'risk.guardMode': 'config:launchProfiles.production.risk.guardMode',
      'risk.venueRailBuffer.enabled': 'config:launchProfiles.production.risk.venueRailBuffer.enabled',
      'risk.venueRailBuffer.railDrawdownPercent': 'config:launchProfiles.production.risk.venueRailBuffer.railDrawdownPercent',
      'risk.venueRailBuffer.triggerPercent': 'config:launchProfiles.production.risk.venueRailBuffer.triggerPercent',
      'risk.venueRailBuffer.releaseOnSessionReset': 'config:launchProfiles.production.risk.venueRailBuffer.releaseOnSessionReset',
      'risk.reconciliationReporter.enabled': 'config:launchProfiles.production.risk.reconciliationReporter.enabled',
      'risk.reconciliationReporter.alertDeltaDollars': 'config:launchProfiles.production.risk.reconciliationReporter.alertDeltaDollars',
      'risk.reconciliationReporter.alertDeltaPercent': 'config:launchProfiles.production.risk.reconciliationReporter.alertDeltaPercent',
      'risk.sessionRiskResponse.enabled': 'config:launchProfiles.production.risk.sessionRiskResponse.enabled',
      'risk.sessionRiskResponse.triggerPercent': 'config:launchProfiles.production.risk.sessionRiskResponse.triggerPercent',
      'risk.sessionRiskResponse.action': 'config:launchProfiles.production.risk.sessionRiskResponse.action',
      'evalRules.enabled': 'env:EVAL_RULES_ENABLED',
      'evalRules.ttp.enabled': 'env:TTP_RULES_ENABLED',
      'evalRules.ttp.accountLimits.dailyLossDollars': 'env:TTP_DAILY_LOSS_LIMIT_DOLLARS',
      'evalRules.ttp.accountLimits.maxLossThresholdEquity': 'env:TTP_MAX_LOSS_THRESHOLD_EQUITY',
      'evalRules.ttp.consistency.profitTargetDollars': 'env:TTP_PROFIT_TARGET_DOLLARS',
      'evalRules.ttp.consistency.maxPositionProfitRatio': 'env:TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO',
      'evalRules.ttp.volumeCap.timeframe': 'env:TTP_VOLUME_CAP_TIMEFRAME',
      'evalRules.ttp.volumeCap.percent': 'env:TTP_VOLUME_CAP_PERCENT',
      'exitContracts.RSI.profitManagement.beScaleOut.enabled': 'config:settings.json:exitContracts.RSI.profitManagement.beScaleOut.enabled',
      'exitContracts.RSI.profitManagement.beScaleOut.triggerR': 'config:settings.json:exitContracts.RSI.profitManagement.beScaleOut.triggerR',
      'exitContracts.RSI.profitManagement.beScaleOut.fraction': 'config:settings.json:exitContracts.RSI.profitManagement.beScaleOut.fraction',
      'exitContracts.RSI.profitManagement.breakEvenStop.enabled': 'config:settings.json:exitContracts.RSI.profitManagement.breakEvenStop.enabled',
      'exitContracts.RSI.profitManagement.breakEvenStop.triggerR': 'config:settings.json:exitContracts.RSI.profitManagement.breakEvenStop.triggerR',
      'exitContracts.RSI.profitManagement.tieredExit.enabled': 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.enabled',
      'exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier1': 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier1',
      'exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier2': 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier2',
      'exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier3': 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier3',
      'exitContracts.RSI.profitManagement.tieredExit.profitTiers.final': 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.profitTiers.final',
      'exitContracts.RSI.profitManagement.trail.enabled': 'config:settings.json:exitContracts.RSI.profitManagement.trail.enabled',
      'exitContracts.RSI.profitManagement.trail.activationR': 'config:settings.json:exitContracts.RSI.profitManagement.trail.activationR',
      'exitContracts.RSI.profitManagement.trail.distanceR': 'config:settings.json:exitContracts.RSI.profitManagement.trail.distanceR',
      'exitContracts.RSI.profitManagement.volatilityAdjustment.enabled': 'config:settings.json:exitContracts.RSI.profitManagement.volatilityAdjustment.enabled',
      'exitContracts.RSI.profitManagement.volatilityAdjustment.threshold': 'config:settings.json:exitContracts.RSI.profitManagement.volatilityAdjustment.threshold',
      'exitContracts.RSI.profitManagement.volatilityAdjustment.stopMultiplier': 'config:settings.json:exitContracts.RSI.profitManagement.volatilityAdjustment.stopMultiplier',
      'exitContracts.RSI.profitManagement.volatilityAdjustment.targetMultiplier': 'config:settings.json:exitContracts.RSI.profitManagement.volatilityAdjustment.targetMultiplier',
      'exitContracts.RSI.profitManagement.contractVolatilityAdjustment.threshold': 'config:settings.json:exitContracts.RSI.profitManagement.contractVolatilityAdjustment.threshold',
      'exitContracts.RSI.profitManagement.contractVolatilityAdjustment.stopMultiplier': 'config:settings.json:exitContracts.RSI.profitManagement.contractVolatilityAdjustment.stopMultiplier',
      'exitContracts.RSI.profitManagement.contractVolatilityAdjustment.targetMultiplier': 'config:settings.json:exitContracts.RSI.profitManagement.contractVolatilityAdjustment.targetMultiplier',
      'exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.enabled': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.enabled',
      'exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.triggerR': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.triggerR',
      'exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.fraction': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.beScaleOut.fraction',
      'exitContracts.TimeSeriesMomentum.profitManagement.breakEvenStop.enabled': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.breakEvenStop.enabled',
      'exitContracts.TimeSeriesMomentum.profitManagement.breakEvenStop.triggerR': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.breakEvenStop.triggerR',
      'exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.enabled': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.enabled',
      'exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier1': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier1',
      'exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier2': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier2',
      'exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier3': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.tier3',
      'exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.final': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.tieredExit.profitTiers.final',
      'exitContracts.TimeSeriesMomentum.profitManagement.trail.enabled': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.trail.enabled',
      'exitContracts.TimeSeriesMomentum.profitManagement.trail.activationR': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.trail.activationR',
      'exitContracts.TimeSeriesMomentum.profitManagement.trail.distanceR': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.trail.distanceR',
      'exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.enabled': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.enabled',
      'exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.threshold': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.threshold',
      'exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.stopMultiplier': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.stopMultiplier',
      'exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.targetMultiplier': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.targetMultiplier',
      'exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.threshold': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.threshold',
      'exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.stopMultiplier': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.stopMultiplier',
      'exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.targetMultiplier': 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.contractVolatilityAdjustment.targetMultiplier',
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
    'confidence.minTradeConfidence': 0.5,
    'confidence.minStrategyConfidence': 0.35,
    'filters.atrEnabled': false,
    'filters.atrMinPercent': 0.15,
    'positionSizing.basePositionSize': 0.01,
    'positionSizing.maxPositionSize': 0.05,
    'entryLogic.sizing.absoluteCapPercent': 0.15,
    'fees.makerFee': 0,
    'fees.takerFee': 0,
    'fees.slippage': 0.0005,
    'fees.totalRoundTrip': 0,
    'fees.model': 'per_share_minimum',
    'fees.perShare': 0.005,
    'fees.minOrderFee': 0.75,
    'features.enableDynamicSizing': true,
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
  test('records ConfigLoader sources next to ConfigLoader effective trade tunables', () => {
    const proof = buildRuntimeConfigProof(
      snapshotFixture(),
      tradingConfigFixture(),
      { now: new Date('2026-06-12T15:30:00Z') }
    );

    expect(proof.event).toBe('RUNTIME_CONFIG_PROOF');
    expect(proof.timestamp).toBe('2026-06-12T15:30:00.000Z');
    expect(proof.configLoader.filters.atrEnabled).toEqual({ value: false, source: 'default' });
    expect(proof.configLoader.risk.guardMode).toEqual({ value: 'venueRailBuffer', source: 'config:launchProfiles.production.risk.guardMode' });
    expect(proof.configLoader.risk.venueRailBuffer.enabled).toEqual({ value: true, source: 'config:launchProfiles.production.risk.venueRailBuffer.enabled' });
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
    expect(proof.tradingConfig.confidence.minTradeConfidence).toBe(0.5);
    expect(proof.tradingConfig.exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier1).toEqual({
      value: 0.007,
      source: 'config:settings.json:exitContracts.RSI.profitManagement.tieredExit.profitTiers.tier1',
    });
    expect(proof.tradingConfig.exitContracts.TimeSeriesMomentum.profitManagement.trail.distanceR).toEqual({
      value: 0.75,
      source: 'config:settings.json:exitContracts.TimeSeriesMomentum.profitManagement.trail.distanceR',
    });
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
