'use strict';

const EMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');

function candle(index, close) {
  return {
    t: Date.UTC(2026, 0, 1, 14, 30) + index * 900000,
    o: close,
    h: close + 0.2,
    l: close - 0.2,
    c: close,
    v: 1000 + index,
    timeframe: '15m',
  };
}

function alignedCandles(count = 220) {
  return Array.from({ length: count }, (_, index) => candle(index, 100 + index * 0.25));
}

function reversalCandles() {
  const candles = [];
  for (let index = 0; index < 260; index += 1) {
    const close = index < 210
      ? 200 - index * 0.25
      : 147.5 + (index - 210) * 1.5;
    candles.push(candle(index, close));
  }
  return candles;
}

describe('EMASMACrossover TREY SPEC 001 entry events', () => {
  test('standing MA alignment is neutral when entryEventsOnly is enabled', () => {
    const module = new EMASMACrossoverSignal({
      entryEventsOnly: true,
      confirmBars: 1,
      warmupBars: 200,
    });
    const history = alignedCandles();

    const signal = module.update(history[history.length - 1], history);

    expect(signal.direction).toBe('neutral');
    expect(signal.confidence).toBe(0);
    expect(signal.crossovers).toEqual([]);
    expect(signal.activeBullish).toBe(0);
    expect(signal.entryEventsOnly).toBe(true);
    expect(signal.warmupBars).toBe(200);
  });

  test('fresh crossover and one confirmation bar can signal when entryEventsOnly is enabled', () => {
    const module = new EMASMACrossoverSignal({
      entryEventsOnly: true,
      confirmBars: 1,
      warmupBars: 200,
    });
    const history = [];
    const signals = [];

    for (const nextCandle of reversalCandles()) {
      history.push(nextCandle);
      const signal = module.update(nextCandle, history);
      if (signal.direction !== 'neutral') signals.push(signal);
    }

    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('buy');
    expect(signals[0].crossovers).toEqual([
      expect.objectContaining({ type: 'golden' }),
    ]);
    expect(signals[1].direction).toBe('buy');
    expect(signals[1].crossovers).toEqual([]);
    expect(signals[1].activeBullish).toBeGreaterThan(0);
  });
});
