'use strict';

const fs = require('fs');
const path = require('path');

const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

function candlesFromCloses(closes) {
  return closes.map((close, index) => ({
    o: close,
    h: close,
    l: close,
    c: close,
    t: index,
    timeframe: '15m',
  }));
}

function rsiStrategy() {
  const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
  const strategy = orchestrator.strategies.find((candidate) => candidate.name === 'RSI');
  expect(strategy).toBeTruthy();
  return strategy;
}

function evaluateRsi(candles) {
  return rsiStrategy().evaluate({
    priceHistory: candles,
    indicators: {
      sma200: IndicatorCalculator.calculateSMA(candles, 200),
    },
    patterns: [],
    regime: null,
    extras: {
      symbol: 'TSLA',
      timeframe: '15m',
    },
  });
}

describe('StrategyOrchestrator RSI truth lane', () => {
  test('inline RSI uses Trey seeds and passes the long mean-reversion regime gate', () => {
    const closes = Array(200).fill(50);
    for (let price = 150; price >= 70; price -= 5) closes.push(price);

    const signal = evaluateRsi(candlesFromCloses(closes));

    expect(signal).toEqual(expect.objectContaining({
      direction: 'buy',
      exitContractHint: expect.objectContaining({
        rsiPeriod: 5,
        rsiExitLong: 50,
      }),
    }));
    expect(signal.signalData).toEqual(expect.objectContaining({
      rsiPeriod: 5,
      buyBelow: 35,
      exitAbove: 50,
    }));
    expect(signal.signalData.regimeMa).toEqual(expect.objectContaining({
      allowed: true,
      period: 200,
      timeframe: 'trading',
      reason: 'price_above_regime_ma',
    }));
  });

  test('inline RSI refuses oversold long entries below the 200MA regime line', () => {
    const closes = Array(200).fill(150);
    for (let price = 150; price >= 70; price -= 5) closes.push(price);

    expect(evaluateRsi(candlesFromCloses(closes))).toBeNull();
  });

  test('inline RSI no longer emits short entries from overbought RSI', () => {
    const closes = Array(200).fill(50);
    for (let price = 50; price <= 150; price += 5) closes.push(price);

    expect(evaluateRsi(candlesFromCloses(closes))).toBeNull();
  });

  test('inline RSI has no 25/75 fallback thresholds left', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'core', 'StrategyOrchestrator.js'),
      'utf8'
    );

    expect(source).not.toMatch(/oversoldLevel\s*\|\|\s*25/);
    expect(source).not.toMatch(/overboughtLevel\s*\|\|\s*75/);
    expect(source).not.toMatch(/RSI_OVERSOLD|RSI_OVERBOUGHT/);
  });
});
