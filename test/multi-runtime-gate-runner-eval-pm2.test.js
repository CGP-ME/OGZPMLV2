'use strict';

const {
  buildGateContext,
  pm2ProcessName,
  runGate,
  selectedGates,
} = require('../ogz-meta/gates/multi-runtime-gate-runner');

describe('multi-runtime gate runner eval PM2 context', () => {
  test('selects eval gate and builds PM2 env context without touching real PM2 in tests', () => {
    const argv = ['--eval', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);
    const context = buildGateContext(argv, gates, {
      readPm2ProcessEnv: (processName) => ({
        EXECUTION_MODE: 'paper',
        PM2_PROCESS_NAME: processName,
      }),
    });

    expect(gates.map((gate) => gate.id)).toEqual(['eval.live.posture_config']);
    expect(context).toEqual({
      evalSource: 'pm2:ogz-prime-v2',
      evalSourceEnv: {
        EXECUTION_MODE: 'paper',
        PM2_PROCESS_NAME: 'ogz-prime-v2',
      },
      evalOptions: { loadDotenv: false },
    });
  });

  test('allows PM2 context when eval gate is selected by explicit gate id', () => {
    const argv = ['--gate', 'eval.live.posture_config', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);
    const context = buildGateContext(argv, gates, {
      readPm2ProcessEnv: (processName) => ({ PM2_PROCESS_NAME: processName }),
    });

    expect(gates.map((gate) => gate.id)).toEqual(['eval.live.posture_config']);
    expect(context.evalSource).toBe('pm2:ogz-prime-v2');
    expect(context.evalSourceEnv.PM2_PROCESS_NAME).toBe('ogz-prime-v2');
    expect(context.evalOptions).toEqual({ loadDotenv: false });
  });

  test('rejects PM2 context when no eval gate is selected', () => {
    const argv = ['--scope', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);

    expect(() => buildGateContext(argv, gates, {
      readPm2ProcessEnv: () => ({}),
    })).toThrow(/--pm2 requires --eval, --all, or --gate eval\.live\.posture_config/);
  });

  test('fails loudly when PM2 flag omits process name', () => {
    expect(() => selectedGates(['--eval', '--pm2'])).toThrow(/--pm2 requires a process name or id/);
    expect(() => pm2ProcessName(['--pm2'])).toThrow(/--pm2 requires a process name or id/);
  });

  test('annotates source only on eval gate reports', async () => {
    const context = { evalSource: 'pm2:ogz-prime-v2', evalSourceEnv: { EXECUTION_MODE: 'paper' } };
    const evalResult = await runGate({
      id: 'eval.test',
      layer: 'eval',
      run: (ctx) => ({ env: ctx.evalSourceEnv.EXECUTION_MODE }),
    }, context);
    const scopeResult = await runGate({
      id: 'scope.test',
      layer: 'scope',
      run: () => ({ ok: true }),
    }, context);

    expect(evalResult.detail).toEqual({ env: 'paper', source: 'pm2:ogz-prime-v2' });
    expect(scopeResult.detail).toEqual({ ok: true });
  });
});
