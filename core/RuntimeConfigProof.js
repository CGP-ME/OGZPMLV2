'use strict';

function sourceFor(snapshot, path) {
  return snapshot?.sources?.[path] || null;
}

function withSource(snapshot, path) {
  const parts = path.split('.');
  let value = snapshot?.config;
  for (const part of parts) {
    if (value === undefined || value === null) break;
    value = value[part];
  }
  return {
    value: value === undefined ? null : value,
    source: sourceFor(snapshot, path),
  };
}

function redactedPresence(snapshot, path) {
  const entry = withSource(snapshot, path);
  return {
    present: entry.value !== null && entry.value !== '',
    source: entry.source,
  };
}

function redactedUrlPresence(snapshot, path) {
  const entry = withSource(snapshot, path);
  const rawValue = typeof entry.value === 'string' ? entry.value : '';
  let protocol = null;
  if (rawValue) {
    try {
      protocol = new URL(rawValue).protocol;
    } catch (_) {
      protocol = 'invalid';
    }
  }
  return {
    present: rawValue !== '',
    protocol,
    source: entry.source,
  };
}

function tradingConfigValue(ConfigLoader, path) {
  const value = ConfigLoader.get(path);
  return value === undefined ? null : value;
}

function buildRuntimeConfigProof(snapshot, ConfigLoader, options = {}) {
  if (!snapshot || !snapshot.config) {
    throw new Error('[RuntimeConfigProof] ConfigLoader snapshot is required');
  }
  if (!ConfigLoader || typeof ConfigLoader.get !== 'function') {
    throw new Error('[RuntimeConfigProof] ConfigLoader module is required');
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const tuningStatus = typeof ConfigLoader.getTuningProfileStatus === 'function'
    ? ConfigLoader.getTuningProfileStatus()
    : null;

  return {
    event: 'RUNTIME_CONFIG_PROOF',
    timestamp: now.toISOString(),
    configFingerprint: snapshot.fingerprint || null,
    configLoader: {
      mode: {
        execution: withSource(snapshot, 'mode.execution'),
        liveTrading: withSource(snapshot, 'mode.liveTrading'),
        paperTrading: withSource(snapshot, 'mode.paperTrading'),
        backtest: withSource(snapshot, 'mode.backtest'),
      },
      broker: {
        id: withSource(snapshot, 'broker.id'),
        assetClass: withSource(snapshot, 'broker.assetClass'),
        tradingPair: withSource(snapshot, 'broker.tradingPair'),
        alpacaSymbols: withSource(snapshot, 'broker.alpacaSymbols'),
        candleTimeframe: withSource(snapshot, 'broker.candleTimeframe'),
        alpacaMode: withSource(snapshot, 'broker.alpacaMode'),
        krakenApiKey: redactedPresence(snapshot, 'broker.apiKey'),
        krakenApiSecret: redactedPresence(snapshot, 'broker.apiSecret'),
        alpacaApiKey: redactedPresence(snapshot, 'broker.alpacaApiKey'),
        alpacaApiSecret: redactedPresence(snapshot, 'broker.alpacaApiSecret'),
      },
      webhookOrders: {
        enabled: withSource(snapshot, 'webhookOrders.enabled'),
        dryRun: withSource(snapshot, 'webhookOrders.dryRun'),
        webhookUrl: redactedUrlPresence(snapshot, 'webhookOrders.webhookUrl'),
      },
      confidence: {
        minTradeConfidence: withSource(snapshot, 'confidence.minTradeConfidence'),
        minStrategyConfidence: withSource(snapshot, 'confidence.minStrategyConfidence'),
      },
      filters: {
        atrEnabled: withSource(snapshot, 'filters.atrEnabled'),
        atrMinPercent: withSource(snapshot, 'filters.atrMinPercent'),
      },
      risk: {
        riskManagerBypass: withSource(snapshot, 'risk.riskManagerBypass'),
        accountDrawdownBypass: withSource(snapshot, 'risk.accountDrawdownBypass'),
        maxDrawdown: withSource(snapshot, 'risk.maxDrawdown'),
        maxDailyLoss: withSource(snapshot, 'risk.maxDailyLoss'),
        maxWeeklyLoss: withSource(snapshot, 'risk.maxWeeklyLoss'),
        maxMonthlyLoss: withSource(snapshot, 'risk.maxMonthlyLoss'),
      },
      evalRules: {
        enabled: withSource(snapshot, 'evalRules.enabled'),
        ttpEnabled: withSource(snapshot, 'evalRules.ttp.enabled'),
        dailyLossDollars: withSource(snapshot, 'evalRules.ttp.accountLimits.dailyLossDollars'),
        maxLossThresholdEquity: withSource(snapshot, 'evalRules.ttp.accountLimits.maxLossThresholdEquity'),
        profitTargetDollars: withSource(snapshot, 'evalRules.ttp.consistency.profitTargetDollars'),
        maxPositionProfitRatio: withSource(snapshot, 'evalRules.ttp.consistency.maxPositionProfitRatio'),
        volumeCapTimeframe: withSource(snapshot, 'evalRules.ttp.volumeCap.timeframe'),
        volumeCapPercent: withSource(snapshot, 'evalRules.ttp.volumeCap.percent'),
      },
      exits: {
        stopLossPercent: withSource(snapshot, 'exits.stopLossPercent'),
        takeProfitPercent: withSource(snapshot, 'exits.takeProfitPercent'),
        trailingStopPercent: withSource(snapshot, 'exits.trailingStopPercent'),
        exitSystem: withSource(snapshot, 'exits.exitSystem'),
      },
      fees: {
        model: withSource(snapshot, 'fees.model'),
        makerFee: withSource(snapshot, 'fees.makerFee'),
        takerFee: withSource(snapshot, 'fees.takerFee'),
        perShare: withSource(snapshot, 'fees.perShare'),
        minOrderFee: withSource(snapshot, 'fees.minOrderFee'),
      },
    },
    tradingConfig: {
      tuningProfile: tuningStatus,
      confidence: {
        minTradeConfidence: tradingConfigValue(ConfigLoader, 'confidence.minTradeConfidence'),
        minStrategyConfidence: tradingConfigValue(ConfigLoader, 'confidence.minStrategyConfidence'),
      },
      filters: {
        atrEnabled: tradingConfigValue(ConfigLoader, 'filters.atrEnabled'),
        atrMinPercent: tradingConfigValue(ConfigLoader, 'filters.atrMinPercent'),
      },
      positionSizing: {
        basePositionSize: tradingConfigValue(ConfigLoader, 'positionSizing.basePositionSize'),
        maxPositionSize: tradingConfigValue(ConfigLoader, 'positionSizing.maxPositionSize'),
        absoluteCapPercent: tradingConfigValue(ConfigLoader, 'entryLogic.sizing.absoluteCapPercent'),
      },
      exits: {
        stopLossPercent: tradingConfigValue(ConfigLoader, 'exits.stopLossPercent'),
        takeProfitPercent: tradingConfigValue(ConfigLoader, 'exits.takeProfitPercent'),
        trailingStopPercent: tradingConfigValue(ConfigLoader, 'exits.trailingStopPercent'),
        exitSystem: tradingConfigValue(ConfigLoader, 'exits.exitSystem'),
        tier1Target: tradingConfigValue(ConfigLoader, 'exits.profitTiers.tier1'),
        tier2Target: tradingConfigValue(ConfigLoader, 'exits.profitTiers.tier2'),
        tier3Target: tradingConfigValue(ConfigLoader, 'exits.profitTiers.tier3'),
        finalTarget: tradingConfigValue(ConfigLoader, 'exits.profitTiers.final'),
      },
      fees: {
        model: tradingConfigValue(ConfigLoader, 'fees.model'),
        makerFee: tradingConfigValue(ConfigLoader, 'fees.makerFee'),
        takerFee: tradingConfigValue(ConfigLoader, 'fees.takerFee'),
        slippage: tradingConfigValue(ConfigLoader, 'fees.slippage'),
        totalRoundTrip: tradingConfigValue(ConfigLoader, 'fees.totalRoundTrip'),
        perShare: tradingConfigValue(ConfigLoader, 'fees.perShare'),
        minOrderFee: tradingConfigValue(ConfigLoader, 'fees.minOrderFee'),
      },
      features: {
        enableDynamicSizing: tradingConfigValue(ConfigLoader, 'features.enableDynamicSizing'),
        enableShorts: tradingConfigValue(ConfigLoader, 'features.enableShorts'),
      },
    },
  };
}

function logRuntimeConfigProof(snapshot, ConfigLoader, logger = console) {
  const proof = buildRuntimeConfigProof(snapshot, ConfigLoader);
  logger.log(`[RUNTIME-CONFIG-PROOF] ${JSON.stringify(proof)}`);
  return proof;
}

module.exports = {
  buildRuntimeConfigProof,
  logRuntimeConfigProof,
};
