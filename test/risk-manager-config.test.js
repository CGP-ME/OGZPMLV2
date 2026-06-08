'use strict';

const fs = require('fs');
const path = require('path');

const { buildRiskManagerConfig } = require('../core/RiskManagerConfig');
const RiskManager = require('../core/RiskManager');

const explicitRiskSources = Object.freeze({
  'risk.riskManagerBypass': 'env:RISK_MANAGER_BYPASS',
  'risk.maxDrawdown': 'env:MAX_DRAWDOWN',
  'risk.maxDailyLoss': 'env:MAX_DAILY_LOSS',
  'risk.maxWeeklyLoss': 'env:MAX_WEEKLY_LOSS',
  'risk.maxMonthlyLoss': 'env:MAX_MONTHLY_LOSS',
});

describe('RiskManager config wiring', () => {
  test('maps ConfigLoader risk values to RiskManager tracker constructor keys', () => {
    const config = buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources);

    expect(config).toEqual({
      maxDrawdownPercent: 18,
      dailyLossLimitPercent: 10,
      weeklyLossLimitPercent: 20,
      monthlyLossLimitPercent: 30,
      riskManagerBypass: false,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('fails loud on missing or malformed canonical risk values', () => {
    expect(() => buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
    }, explicitRiskSources)).toThrow(/risk\.riskManagerBypass must be boolean/);

    expect(() => buildRiskManagerConfig({
      maxDrawdown: 0,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxDrawdown must be a whole-percent unit value/);

    expect(() => buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: Number.NaN,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxDailyLoss must be a whole-percent unit value/);

    expect(() => buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 10,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxWeeklyLoss must be a whole-percent unit value/);

    expect(() => buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxMonthlyLoss must be a whole-percent unit value/);
  });

  test('rejects default-sourced RiskManager values even when numeric values exist', () => {
    expect(() => buildRiskManagerConfig({
      maxDrawdown: 5,
      maxDailyLoss: 1,
      maxWeeklyLoss: 5,
      maxMonthlyLoss: 5,
      riskManagerBypass: false,
    }, {
      ...explicitRiskSources,
      'risk.maxDailyLoss': 'default',
    })).toThrow(/risk\.maxDailyLoss requires explicit env\/profile source/);
  });

  test('rejects decimal-style TradingConfig risk units', () => {
    expect(() => buildRiskManagerConfig({
      maxDrawdown: 0.18,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxDrawdown must be a whole-percent unit value/);

    expect(() => buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 0.1,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources)).toThrow(/risk\.maxDailyLoss must be a whole-percent unit value/);
  });

  test('mapped limits drive RiskManager drawdown and daily-loss gates', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig({
      maxDrawdown: 18,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources));

    riskManager.initializeBalance(10000);
    riskManager.updateBalance(8400);
    expect(riskManager.isTradingAllowed()).toEqual(expect.objectContaining({
      allowed: true,
      riskGates: expect.arrayContaining([
        expect.objectContaining({ gate: 'drawdown_circuit', threshold: 18 }),
        expect.objectContaining({ gate: 'daily_loss_limit', threshold: 10 }),
        expect.objectContaining({ gate: 'weekly_loss_limit', threshold: 20 }),
        expect.objectContaining({ gate: 'monthly_loss_limit', threshold: 30 }),
      ]),
    }));

    riskManager.updateBalance(8100);
    expect(riskManager.isTradingAllowed()).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'Max drawdown exceeded',
    }));

    const dailyLossManager = new RiskManager(buildRiskManagerConfig({
      maxDrawdown: 50,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources));

    dailyLossManager.initializeBalance(10000);
    dailyLossManager.recordTradeResult({ success: false, pnl: -999 });
    expect(dailyLossManager.isTradingAllowed().allowed).toBe(true);

    dailyLossManager.recordTradeResult({ success: false, pnl: -1 });
    expect(dailyLossManager.isTradingAllowed()).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'Daily loss limit',
    }));
  });

  test('daily loss alert uses percent loss instead of raw PnL dollars', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig({
      maxDrawdown: 50,
      maxDailyLoss: 10,
      maxWeeklyLoss: 20,
      maxMonthlyLoss: 30,
      riskManagerBypass: false,
    }, explicitRiskSources));

    riskManager.initializeBalance(10000);
    riskManager.recordTradeResult({ success: false, pnl: -299 });
    expect(riskManager.alertsTriggered.some(alert => alert.type === 'daily_loss')).toBe(false);
    const preAlertState = riskManager.pnlTracker.getState();
    expect(preAlertState.dailyPnL).toBe(-299);
    expect(preAlertState.dailyLossPercent).toBeCloseTo(2.99);

    riskManager.recordTradeResult({ success: false, pnl: -1 });
    expect(riskManager.alertsTriggered).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'daily_loss',
        message: 'Daily loss at 3.00%',
      }),
    ]));
  });

  test('RiskManager construction rejects untrusted config objects before tracker defaults can apply', () => {
    expect(() => new RiskManager({
      dailyLossLimitPercent: 10,
      weeklyLossLimitPercent: 20,
      monthlyLossLimitPercent: 30,
      riskManagerBypass: false,
    })).toThrow(/RiskManager requires config from buildRiskManagerConfig/);

    expect(() => new RiskManager({
      maxDrawdownPercent: 18,
      weeklyLossLimitPercent: 20,
      monthlyLossLimitPercent: 30,
      riskManagerBypass: false,
    })).toThrow(/RiskManager requires config from buildRiskManagerConfig/);

    expect(() => new RiskManager({
      maxDrawdownPercent: 18,
      dailyLossLimitPercent: 10,
      monthlyLossLimitPercent: 30,
      riskManagerBypass: false,
    })).toThrow(/RiskManager requires config from buildRiskManagerConfig/);

    expect(() => new RiskManager({
      maxDrawdownPercent: 18,
      dailyLossLimitPercent: 10,
      weeklyLossLimitPercent: 20,
      riskManagerBypass: false,
    })).toThrow(/RiskManager requires config from buildRiskManagerConfig/);

    expect(() => new RiskManager({
      maxDrawdownPercent: 18,
      dailyLossLimitPercent: 10,
      weeklyLossLimitPercent: 20,
      monthlyLossLimitPercent: 30,
      riskManagerBypass: false,
    })).toThrow(/RiskManager requires config from buildRiskManagerConfig/);
  });

  test('run-empire constructs RiskManager from canonical ConfigLoader risk block', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');

    expect(source).toContain('new RiskManager(buildRiskManagerConfig(');
    expect(source).toContain('resolvedConfig.config.risk');
    expect(source).toContain('resolvedConfig.sources');
    expect(source).not.toContain("maxDailyLoss: TradingConfig.get('risk.maxDailyLoss')");
    expect(source).not.toContain("maxDrawdown: TradingConfig.get('risk.maxDrawdown')");
  });
});
