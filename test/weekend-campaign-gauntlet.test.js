'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertCampaignParitySource,
  countStrategyEvidence,
  countTradingSessions,
  evaluateFrequency,
  findScopedJournalForInstrument,
} = require('../tools/weekend-campaign-gauntlet');

function autopsy(day, strategy) {
  return {
    candleTimestamp: Date.UTC(2026, 6, day, 14, 30),
    strategySignals: [{ name: strategy }],
  };
}

function ledgersFor(strategy, signalsByDay) {
  const autopsies = [];
  for (const [day, count] of Object.entries(signalsByDay)) {
    for (let index = 0; index < count; index += 1) {
      autopsies.push(autopsy(Number(day), strategy));
    }
  }
  return {
    autopsies,
    decisions: [],
    rejections: [],
  };
}

describe('weekend campaign frequency sanity', () => {
  test('passes PropSafeEMAPullback inside its expected signal frequency band', () => {
    const ledgers = ledgersFor('PropSafeEMAPullback', { 1: 5, 2: 5 });
    const evidence = countStrategyEvidence('PropSafeEMAPullback', ledgers);

    const result = evaluateFrequency('PropSafeEMAPullback', evidence, ledgers);

    expect(countTradingSessions(ledgers)).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.signalsPerSession).toBe(5);
  });

  test('fails PropSafeEMAPullback when it is too quiet', () => {
    const ledgers = ledgersFor('PropSafeEMAPullback', { 1: 1, 2: 1 });
    const evidence = countStrategyEvidence('PropSafeEMAPullback', ledgers);

    const result = evaluateFrequency('PropSafeEMAPullback', evidence, ledgers);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('outside 3-7');
  });

  test('fails smoke sanity when a strategy has no declared frequency band', () => {
    const ledgers = ledgersFor('UnknownStrategy', { 1: 2, 2: 2 });
    const evidence = countStrategyEvidence('UnknownStrategy', ledgers);

    const result = evaluateFrequency('UnknownStrategy', evidence, ledgers);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing frequency band');
  });

  test('manifest parity resolves the scoped live journal before paper fixtures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-campaign-journals-'));
    try {
      const paperDir = path.join(root, '5-paper__6-alpaca__7-default__6-stocks__4-TSLA__3-15m');
      const liveDir = path.join(root, '4-live__6-alpaca__36-account-placeholder__6-stocks__4-TSLA__3-15m');
      fs.mkdirSync(paperDir, { recursive: true });
      fs.mkdirSync(liveDir, { recursive: true });
      fs.writeFileSync(path.join(paperDir, 'trade-ledger.jsonl'), '{}\n');
      fs.writeFileSync(path.join(liveDir, 'trade-ledger.jsonl'), '{}\n');

      const journalPath = findScopedJournalForInstrument({
        TRADING_PAIR: 'TSLA',
        CANDLE_TIMEFRAME: '15m',
      }, root);

      expect(journalPath).toBe(path.join(liveDir, 'trade-ledger.jsonl'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('manifest parity rejects reference directories unless explicitly allowed', () => {
    expect(() => assertCampaignParitySource({ 'reference-dir': 'fixtures' }))
      .toThrow(/requires live Alpaca reference/);
    expect(() => assertCampaignParitySource({ 'reference-dir': 'fixtures', 'allow-reference-dir': 'true' }))
      .not.toThrow();
  });
});
