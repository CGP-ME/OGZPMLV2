'use strict';

const {
  resolveInstrumentFromDataFile,
} = require('../tools/instrument-env');

describe('instrument env resolution', () => {
  test('resolves configured stock data files as Alpaca stocks', () => {
    expect(resolveInstrumentFromDataFile('tuning/tsla-15m-2y.json')).toEqual({
      TRADING_PAIR: 'TSLA',
      BROKER: 'alpaca',
      ASSET_CLASS: 'stocks',
      CANDLE_TIMEFRAME: '15m',
    });
  });

  test('resolves configured crypto bases as Kraken crypto', () => {
    expect(resolveInstrumentFromDataFile('data/polygon-btc-1y.json')).toEqual({
      TRADING_PAIR: 'BTC-USD',
      BROKER: 'kraken',
      ASSET_CLASS: 'crypto',
    });
  });

  test('rejects unknown symbols instead of assuming stock asset class', () => {
    expect(() => resolveInstrumentFromDataFile('data/custom/xyz-1y.json'))
      .toThrow(/Cannot derive asset class/);
  });
});
