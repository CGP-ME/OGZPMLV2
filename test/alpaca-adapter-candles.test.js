'use strict';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const axios = require('axios');
const AlpacaAdapter = require('../brokers/AlpacaAdapter');

describe('AlpacaAdapter candle history', () => {
  let logSpy;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
    axios.get.mockReset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.useRealTimers();
  });

  test('requests latest intraday candles and returns them in ascending order', async () => {
    axios.get.mockResolvedValue({
      data: {
        bars: [
          { t: '2026-05-22T20:45:00Z', o: '420.00', h: '426.00', l: '419.00', c: '425.04', v: '54' },
          { t: '2026-05-22T20:30:00Z', o: '418.00', h: '421.00', l: '417.00', c: '420.00', v: '87' },
        ],
      },
    });

    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });
    const candles = await adapter.getCandles('tsla', '15m', 60);

    expect(axios.get).toHaveBeenCalledWith(
      'https://data.alpaca.markets/v2/stocks/TSLA/bars',
      expect.objectContaining({
        params: expect.objectContaining({
          start: '2026-05-16T12:00:00.000Z',
          end: '2026-05-23T12:00:00.000Z',
          timeframe: '15Min',
          limit: 60,
          adjustment: 'raw',
          feed: 'iex',
          sort: 'desc',
        }),
      })
    );
    expect(candles.map(c => new Date(c.t).toISOString())).toEqual([
      '2026-05-22T20:30:00.000Z',
      '2026-05-22T20:45:00.000Z',
    ]);
    expect(candles[1]).toEqual({ t: 1779482700000, o: 420, h: 426, l: 419, c: 425.04, v: 54 });
  });

  test('uses requested daily lookback without the intraday minimum window', async () => {
    axios.get.mockResolvedValue({ data: { bars: [] } });

    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });
    await adapter.getCandles('TSLA', '1d', 5);

    expect(axios.get.mock.calls[0][1].params).toEqual(expect.objectContaining({
      start: '2026-05-08T12:00:00.000Z',
      end: '2026-05-23T12:00:00.000Z',
      timeframe: '1Day',
      limit: 5,
      sort: 'desc',
    }));
  });
});
