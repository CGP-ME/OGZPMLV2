'use strict';

const TradingConfig = require('../core/TradingConfig');
const {
  PROFILE_DEFINITIONS,
} = require('../tools/tuning-profiles');

describe('TradingConfig runtime profile contract', () => {
  afterEach(() => {
    TradingConfig.clearOverrides();
  });

  test('known runtime profiles resolve explicitly', () => {
    expect(TradingConfig.getProfile('balanced')).toEqual(
      expect.objectContaining({
        minConfidence: expect.any(Number),
        maxPositionSize: expect.any(Number),
        riskPercent: expect.any(Number),
      })
    );
  });

  test('unknown runtime profiles fail loudly instead of falling back to balanced', () => {
    expect(() => TradingConfig.getProfile('missing-profile'))
      .toThrow(/Unknown trading profile 'missing-profile'/);
    expect(() => TradingConfig.getProfile())
      .toThrow(/Unknown trading profile 'undefined'/);
  });

  test('tuning profiles resolve from TradingConfig as the single config owner', () => {
    expect(TradingConfig.listTuningProfileNames().sort()).toEqual(['current-eval', 'legacy-wide']);
    expect(TradingConfig.resolveTuningProfile('legacy-wide')).toEqual(
      expect.objectContaining({
        name: 'legacy-wide',
        env: expect.objectContaining({
          TIER1_TARGET: '0.020',
          FINAL_TARGET: '0.100',
        }),
      })
    );
    expect(Object.isFrozen(PROFILE_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(PROFILE_DEFINITIONS['legacy-wide'].env)).toBe(true);
    const resolved = TradingConfig.resolveTuningProfile('legacy-wide');
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.env)).toBe(true);
    try {
      resolved.env.TIER1_TARGET = '0.999';
    } catch (_) {
      // Strict-mode engines throw on frozen assignment; either way the value must not change.
    }
    expect(TradingConfig.resolveTuningProfile('legacy-wide').env.TIER1_TARGET).toBe('0.020');
  });

  test('flat-state tuning profile swap applies and restores config without mutating process env', async () => {
    const profileKeys = Object.keys(TradingConfig.resolveTuningProfile('current-eval').env);
    const envBefore = {};
    for (const key of profileKeys) envBefore[key] = process.env[key];

    const applied = TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(applied).toEqual(expect.objectContaining({
      profile: 'current-eval',
      overrideCount: expect.any(Number),
      runtimeSnapshotEnvKeys: ['EXIT_SYSTEM', 'RISK_MANAGER_BYPASS'],
    }));
    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
    expect(TradingConfig.get('fees.slippage')).toBe(0.0005);
    expect(TradingConfig.get('risk.accountDrawdownBypass')).toBe(true);

    await TradingConfig.runWithTuningProfile(
      'legacy-wide',
      async (status) => {
        expect(status.activeProfile).toBe('legacy-wide');
        expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(TradingConfig.get('exits.profitTiers.final')).toBe(0.100);
        expect(TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
      },
      {
        phase: 'startup',
        requireFlat: true,
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('current-eval');
    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(TradingConfig.get('exits.profitTiers.final')).toBe(0.025);

    const envAfter = {};
    for (const key of profileKeys) envAfter[key] = process.env[key];
    expect(envAfter).toEqual(envBefore);
  });

  test('profile apply refuses missing flat-state proof when flat state is required', () => {
    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      requireFlat: true,
      phase: 'startup',
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('runtime phase refuses startup-snapshot profile keys instead of pretending to update live objects', () => {
    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'runtime',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/includes startup-snapshot key\(s\) EXIT_SYSTEM, RISK_MANAGER_BYPASS/);
  });

  test('profile apply refuses active override collisions unless profile replacement is explicit', () => {
    TradingConfig.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/would overwrite active config path\(s\): exits\.profitTiers\.tier1/);
  });

  test('explicit profile replacement still requires flat-state proof for active collisions', () => {
    TradingConfig.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('explicit profile replacement requires flat-state proof even when values already match', () => {
    TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });

    expect(() => TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('runWithTuningProfile restores paths that were missing before the temporary profile', async () => {
    const beforeTier1 = TradingConfig.get('exits.profitTiers.tier1');
    const beforeStatus = TradingConfig.getTuningProfileStatus();

    await TradingConfig.runWithTuningProfile(
      'legacy-wide',
      async () => {
        expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
      },
      {
        phase: 'startup',
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(beforeTier1);
    expect(TradingConfig.getTuningProfileStatus()).toEqual(beforeStatus);
  });
});
