'use strict';

const SmartMoneySweep = require('../modules/SmartMoneySweep');
const ConfigLoader = require('../foundation/ConfigLoader');

function config(overrides = {}) {
  return {
    vpDays: 5,
    vpBins: 50,
    valueAreaPct: 70,
    bodyWeightPct: 70,
    lvnPctile: 20,
    ivbMinutes: 30,
    volAvgLen: 20,
    absorbBodyPct: 35,
    absorbWickPct: 60,
    absorbVolMult: 1.2,
    initBodyPct: 60,
    absorbBodyProgPct: 50,
    absorbWickProgPct: 40,
    absorbVolProgMult: 0.9,
    initBodyProgPct: 45,
    cvdDivLen: 10,
    atrLen: 14,
    lowConvATRMult: 0.5,
    midConvATRMult: 1,
    highConvATRMult: 1.5,
    slBufferPct: 0.15,
    maxLossPct: 0.3,
    maxHoldBars: 60,
    maxDailyLosses: 3,
    vpRthOnly: false,
    vpLookbackBars: 30,
    sweepMaxOffset: 3,
    minConditionsGate: 0,
    tierHigh: 0.975,
    tierMid: 0.775,
    tierFloor: 0.625,
    breakHigh: 5,
    breakMid: 3,
    confidenceMode: 'tiered',
    enabled: true,
    ...overrides,
  };
}

function candles(count = 30) {
  const start = Date.parse('2026-07-01T14:30:00.000Z');
  return Array.from({ length: count }, (_, index) => {
    const price = 100 + index * 0.05;
    return {
      o: price,
      h: price + 1,
      l: price - 1,
      c: price + 0.25,
      v: 1000,
      t: start + index * 5 * 60 * 1000,
    };
  });
}

function sweepModule({ conditionsMet = 0, rawConfidence = 0, overrides = {} } = {}) {
  const sms = new SmartMoneySweep(config(overrides));
  sms._detectTimeframe = jest.fn(() => 15);
  sms._computeVolumeProfile = jest.fn(() => ({
    vah: 105,
    val: 95,
    poc: 100,
    profileBias: 0,
    lvnLevels: [],
    vpHigh: 110,
    vpLow: 90,
  }));
  sms._updateIVB = jest.fn();
  sms._smaVolume = jest.fn(() => 1000);
  sms._computeATR = jest.fn(() => 1);
  sms._classifyCandle = jest.fn(() => ({
    close: 100,
    absorbMet: false,
    absorbProg: false,
    initBullMet: false,
    initBullProg: false,
    initBearMet: false,
    initBearProg: false,
  }));
  sms._updateCVD = jest.fn();
  sms._computeCVDDivergence = jest.fn(() => ({
    bullMet: false,
    bullProg: false,
    bearMet: false,
    bearProg: false,
  }));
  sms._detectExhaustion = jest.fn(() => ({
    bullMet: false,
    bullProg: false,
    bearMet: false,
    bearProg: false,
  }));
  sms._detectSweeps = jest.fn(() => ({
    1: { long: true, short: false },
    2: { long: false, short: false },
    3: { long: false, short: false },
  }));
  sms._scoreLong = jest.fn(() => ({
    conditionsMet,
    rawConfidence,
    details: [],
  }));
  sms._computeExitLevels = jest.fn(() => ({
    stopLoss: 99,
    takeProfit: 102,
  }));
  return sms;
}

describe('SmartMoneySweep conviction ladder', () => {
  test('ConfigLoader exposes the explicit SMS conviction ladder keys', () => {
    const originalProfile = process.env.PROFILE;
    process.env.PROFILE = 'backtest-p0';
    ConfigLoader.load({ force: true, silent: true, loadDotenv: false });

    try {
      expect(ConfigLoader.get('strategies.SmartMoneySweep')).toEqual(expect.objectContaining({
        minConditionsGate: 0,
        tierHigh: 0.975,
        tierMid: 0.775,
        tierFloor: 0.625,
        breakHigh: 5,
        breakMid: 3,
        confidenceMode: 'tiered',
      }));
    } finally {
      if (originalProfile === undefined) delete process.env.PROFILE;
      else process.env.PROFILE = originalProfile;
    }
  });

  test('minConditionsGate blocks zero-condition sweeps before consuming the signal', () => {
    const sms = sweepModule({
      conditionsMet: 0,
      rawConfidence: 0,
      overrides: { minConditionsGate: 1 },
    });
    const history = candles();

    expect(sms.update(history[history.length - 1], history)).toBeNull();
    expect(sms.lastLongSweepBar).toBe(-1);
  });

  test('tiered confidence uses config-owned breakpoints and tier values', () => {
    const sms = sweepModule({
      conditionsMet: 4,
      rawConfidence: 90,
      overrides: {
        breakHigh: 6,
        breakMid: 4,
        tierHigh: 0.99,
        tierMid: 0.82,
        tierFloor: 0.61,
      },
    });
    const history = candles();

    expect(sms.update(history[history.length - 1], history)).toEqual(expect.objectContaining({
      confidence: 0.82,
      conditionsMet: 4,
      rawConfidence: 90,
    }));
  });

  test('continuous confidence mode uses raw confidence instead of discarding it', () => {
    const sms = sweepModule({
      conditionsMet: 0,
      rawConfidence: 50,
      overrides: {
        confidenceMode: 'continuous',
        tierFloor: 0.4,
        tierHigh: 0.8,
      },
    });
    const history = candles();

    expect(sms.update(history[history.length - 1], history)).toEqual(expect.objectContaining({
      confidence: 0.6000000000000001,
      rawConfidence: 50,
    }));
  });
});
