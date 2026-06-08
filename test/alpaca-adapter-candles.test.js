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

  test('rejects direct construction without explicit credentials and mode', () => {
    expect(() => new AlpacaAdapter({ apiSecret: 'secret', mode: 'paper' })).toThrow(/apiKey is required/);
    expect(() => new AlpacaAdapter({ apiKey: 'key', mode: 'paper' })).toThrow(/apiSecret is required/);
    expect(() => new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret' })).toThrow(/mode must be explicitly set/);
  });

  test('does not inherit account identity from ambient broker env', () => {
    const priorAccountId = process.env.BROKER_ACCOUNT_ID;
    process.env.BROKER_ACCOUNT_ID = 'stale-env-account';

    try {
      const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

      expect(adapter.getAccountIdentity()).toBeNull();
    } finally {
      if (priorAccountId === undefined) {
        delete process.env.BROKER_ACCOUNT_ID;
      } else {
        process.env.BROKER_ACCOUNT_ID = priorAccountId;
      }
    }
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

  test('captures account identity from verified account response', async () => {
    axios.get.mockResolvedValue({
      data: {
        id: 'alpaca-account-uuid',
        account_number: 'PA123456',
        cash: '10000.25',
        equity: '10050.50',
        buying_power: '20000.00',
        portfolio_value: '10050.50',
        status: 'ACTIVE',
      },
    });

    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });
    const balance = await adapter.getBalance();

    expect(balance).toEqual(expect.objectContaining({
      USD: 10000.25,
      equity: 10050.50,
      buyingPower: 20000,
      portfolioValue: 10050.50,
      status: 'ACTIVE',
      accountId: 'alpaca-account-uuid',
      accountIdSource: 'broker:id',
    }));
    expect(adapter.getAccountIdentity()).toEqual({
      brokerId: 'alpaca',
      accountId: 'alpaca-account-uuid',
      accountIdSource: 'broker:id',
    });
  });

  test('keeps account identity missing when account response lacks a broker identifier', async () => {
    axios.get.mockResolvedValue({
      data: {
        cash: '10000.25',
        equity: '10050.50',
        buying_power: '20000.00',
        portfolio_value: '10050.50',
        status: 'ACTIVE',
      },
    });

    const adapter = new AlpacaAdapter({
      apiKey: 'key',
      apiSecret: 'secret',
      mode: 'paper',
      accountId: 'default',
    });
    const balance = await adapter.getBalance();

    expect(balance).toEqual(expect.objectContaining({
      accountId: null,
      accountIdSource: null,
    }));
    expect(adapter.getAccountIdentity()).toBeNull();
  });
});
