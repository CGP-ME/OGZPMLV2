'use strict';

const fs = require('fs');
const path = require('path');

const {
  compareJournalFills,
  runDataParityCheck,
} = require('../tools/data-parity-check');

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.tmp-data-parity-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

function writeJsonl(dir, name, rows) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
  return file;
}

function candle(iso, close = 100) {
  return {
    t: Date.parse(iso),
    o: close - 0.2,
    h: close + 0.5,
    l: close - 0.5,
    c: close,
    v: 1000,
  };
}

describe('data parity checker', () => {
  test('fails campaign data that has no overlap with the required live comparison window', async () => {
    await withTempDir(async dir => {
      const dataFile = writeJson(dir, 'tsla-15m-old.json', [
        candle('2026-02-03T14:30:00.000Z', 100),
        candle('2026-02-03T14:45:00.000Z', 101),
      ]);
      const reference = writeJson(dir, 'tsla-15m-live.json', {
        metadata: {
          provider: 'alpaca',
          feed: 'iex',
          sessionProfile: 'rth_only',
          timestampConvention: 'bar_start_ms_aligned',
        },
        candles: [
          candle('2026-06-01T13:30:00.000Z', 120),
        ],
      });

      const result = await runDataParityCheck({
        dataFile,
        symbol: 'TSLA',
        timeframe: '15m',
        referenceFile: reference,
        requireSpotCheck: false,
      });

      expect(result.status).toBe('FAILED-DATA-PARITY');
      expect(result.checks.sameWindow).toBe(false);
      expect(result.sameWindow.errors).toContain('campaign data has zero candles in same-window diff range');
    });
  });

  test('passes when file provenance, same-window candles, and journal fill checks are aligned', async () => {
    await withTempDir(async dir => {
      const candles = [
        candle('2026-06-01T13:30:00.000Z', 100),
        candle('2026-07-01T13:30:00.000Z', 101),
      ];
      const dataFile = writeJson(dir, 'alpaca-tsla-15m.json', {
        metadata: {
          provider: 'alpaca',
          feed: 'iex',
          sessionProfile: 'rth_only',
          timestampConvention: 'bar_start_ms_aligned',
        },
        candles,
      });
      const reference = writeJson(dir, 'reference.json', {
        metadata: {
          provider: 'alpaca',
          feed: 'iex',
          sessionProfile: 'rth_only',
          timestampConvention: 'bar_start_ms_aligned',
        },
        candles: [candles[0]],
      });
      const journal = writeJsonl(dir, 'journal.jsonl', [{
        event: 'ENTRY',
        timestamp: Date.parse('2026-07-01T13:31:00.000Z'),
        orderId: 'T1',
        symbol: 'TSLA',
        entryPrice: 101.1,
      }]);

      const result = await runDataParityCheck({
        dataFile,
        symbol: 'TSLA',
        timeframe: '15m',
        referenceFile: reference,
        journalPath: journal,
      });

      expect(result.status).toBe('PASS');
      expect(result.checks).toEqual({
        provenance: true,
        sameWindow: true,
        groundTruth: true,
      });
    });
  });

  test('fails stale provider-looking filenames when embedded provenance is missing', async () => {
    await withTempDir(async dir => {
      const oldBars = [
        candle('2026-02-03T14:30:00.000Z', 100),
        candle('2026-02-03T14:45:00.000Z', 101),
      ];
      const dataFile = writeJson(dir, 'alpaca-stale.json', oldBars);
      const reference = writeJson(dir, 'reference.json', oldBars);

      const result = await runDataParityCheck({
        dataFile,
        symbol: 'TSLA',
        timeframe: '15m',
        referenceFile: reference,
        sameWindowStart: '2026-02-03T14:30:00.000Z',
        sameWindowEnd: '2026-02-03T14:45:00.000Z',
        requireSpotCheck: false,
      });

      expect(result.status).toBe('FAILED-DATA-PARITY');
      expect(result.checks.provenance).toBe(false);
      expect(result.campaignProvenance.errors).toEqual(expect.arrayContaining([
        'campaign feed/consolidation source unknown',
        expect.stringContaining('campaign session handling inferred only'),
        expect.stringContaining('campaign timestamp convention inferred only'),
      ]));
      expect(result.sameWindow.ok).toBe(true);
    });
  });

  test('flags live fills outside the campaign candle range', () => {
    return withTempDir(dir => {
      const journal = writeJsonl(dir, 'journal.jsonl', [{
        event: 'ENTRY',
        timestamp: Date.parse('2026-07-01T13:31:00.000Z'),
        orderId: 'T1',
        symbol: 'TSLA',
        entryPrice: 104,
      }]);

      const result = compareJournalFills([
        candle('2026-07-01T13:30:00.000Z', 101),
      ], {
        symbol: 'TSLA',
        timeframe: '15m',
        journalPath: journal,
        start: Date.parse('2026-07-01T00:00:00.000Z'),
        end: Date.parse('2026-07-02T00:00:00.000Z'),
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('outside campaign candle range');
    });
  });
});
