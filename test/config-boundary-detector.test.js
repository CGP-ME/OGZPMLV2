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

  test('detects process.env alias reads, writes, deletes, and silent alias fallbacks', () => {
    const findings = scanSource(`
      const env = process.env;
      const broker = env.BROKER || 'kraken';
      env.LIVE_TRADING = 'true';
      delete env.PROFILE;
    `, 'core/AliasLeak.js');

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'process_env_alias',
        detail: 'env',
      }),
      expect.objectContaining({
        kind: 'process_env_alias_read',
        detail: 'BROKER',
      }),
      expect.objectContaining({
        kind: 'process_env_alias_write',
        detail: 'LIVE_TRADING',
      }),
      expect.objectContaining({
        kind: 'process_env_alias_delete',
        detail: 'PROFILE',
      }),
      expect.objectContaining({
        kind: 'silent_or_default_override',
      }),
    ]));
  });

  test('detects process.env destructuring and defineProperty mutations', () => {
    const findings = scanSource(`
      const { BROKER, LIVE_TRADING } = process.env;
      Object.defineProperty(process.env, 'PROFILE', { value: 'live' });
      const env = process.env;
      const { EXECUTION_MODE } = env;
      const merged = { ...env };
      const proc = process;
      const { env: destructuredEnv } = proc;
      const { PAPER_TRADING } = destructuredEnv;
      Object.assign(env, { MIN_TRADE_CONFIDENCE: '1' });
      Object.defineProperty(env, 'EXECUTION_MODE', { value: 'live' });
      const O = Object;
      O.assign(process.env, { BROKER: 'alpaca' });
      const { defineProperty: defineEnvProperty } = O;
      defineEnvProperty(destructuredEnv, 'PROFILE', { value: 'paper' });
    `, 'core/DestructureLeak.js');

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'process_env_destructure_read',
        detail: 'BROKER,LIVE_TRADING',
      }),
      expect.objectContaining({
        kind: 'process_env_define_property',
      }),
      expect.objectContaining({
        kind: 'process_env_bulk_mutation',
      }),
      expect.objectContaining({
        kind: 'process_env_destructure_read',
        detail: 'EXECUTION_MODE',
      }),
      expect.objectContaining({
        kind: 'process_env_spread',
      }),
      expect.objectContaining({
        kind: 'process_env_alias',
        detail: 'destructuredEnv',
      }),
      expect.objectContaining({
        kind: 'process_env_destructure_read',
        detail: 'PAPER_TRADING',
      }),
    ]));

    const bulkMutations = findings.filter(finding => finding.kind === 'process_env_bulk_mutation');
    const definePropertyMutations = findings.filter(finding => finding.kind === 'process_env_define_property');
    expect(bulkMutations.length).toBeGreaterThanOrEqual(2);
    expect(definePropertyMutations.length).toBeGreaterThanOrEqual(2);
  });

  test('detects ConfigLoader mutation aliases and destructured mutators', () => {
    const findings = scanSource(`
      const CL = ConfigLoader;
      CL.applyOverrideMap({ risk: { guardMode: 'off' } });
      const TradingConfig = require('../foundation/ConfigLoader');
      TradingConfig.setOverrides({ confidence: { minTradeConfidence: 0.1 } });
      const { clearOverrides } = ConfigLoader;
      clearOverrides();
      const { setOverrides: setConfigOverrides } = ConfigLoader;
      setConfigOverrides({ mode: 'paper' });
      const mut = ConfigLoader.setOverrides;
      mut({ mode: 'backtest' });
      const methodName = 'setOverrides';
      ConfigLoader[methodName]({ mode: 'live' });
    `, 'core/ConfigMutationDoor.js');

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'applyOverrideMap',
      }),
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'setOverrides',
      }),
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'clearOverrides',
      }),
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'setConfigOverrides',
      }),
      expect.objectContaining({
        kind: 'configloader_mutation_call',
        detail: 'mut',
      }),
      expect.objectContaining({
        kind: 'configloader_computed_call',
        detail: '<computed>',
      }),
    ]));
  });
});
