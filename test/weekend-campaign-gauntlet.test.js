'use strict';

const {
  countStrategyEvidence,
  countTradingSessions,
  evaluateFrequency,
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
});
