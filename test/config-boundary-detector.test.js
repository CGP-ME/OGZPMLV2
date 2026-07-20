'use strict';

const { scanSource } = require('../scripts/check-config-boundary');

describe('config boundary detector', () => {
  test('detects runtime process.env reads and silent fallback overrides outside ConfigLoader', () => {
    const findings = scanSource(`
      const broker = process.env.BROKER || 'kraken';
      const enabled = process.env.ENABLE_THING === 'true';
    `, 'core/LeakyRuntime.js');

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'process_env_read',
        file: 'core/LeakyRuntime.js',
        detail: 'BROKER',
      }),
      expect.objectContaining({
        kind: 'process_env_read',
        file: 'core/LeakyRuntime.js',
        detail: 'ENABLE_THING',
      }),
      expect.objectContaining({
        kind: 'silent_or_default_override',
        file: 'core/LeakyRuntime.js',
      }),
    ]));
  });

  test('detects runtime env mutations and ConfigLoader mutation doors outside the config owner', () => {
    const findings = scanSource(`
      process.env.LIVE_TRADING = 'true';
      delete process.env.PROFILE;
      Object.assign(process.env, { MIN_TRADE_CONFIDENCE: '1' });
      ConfigLoader.setOverrides({ confidence: { minTradeConfidence: 0.1 } });
    `, 'modules/BadStrategy.js');

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'process_env_write',
        detail: 'LIVE_TRADING',
      }),
      expect.objectContaining({
        kind: 'process_env_delete',
        detail: 'PROFILE',
      }),
      expect.objectContaining({
        kind: 'process_env_bulk_mutation',
      }),
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'setOverrides',
      }),
    ]));
  });

  test('does not indict ConfigLoader private env reader helpers as runtime leaks', () => {
    const findings = scanSource(`
      function envStr(key, fallback) {
        const val = process.env[key];
        return val || fallback;
      }
      ConfigLoader.applyOverrideMap(overrides, 'setOverrides');
    `, 'foundation/ConfigLoader.js');

    expect(findings).toEqual([]);
  });
});
