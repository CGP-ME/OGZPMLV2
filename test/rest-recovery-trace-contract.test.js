'use strict';

const fs = require('fs');
const path = require('path');

function readRunnerSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');
}

describe('REST recovery trace contract', () => {
  test('boot hydration and liveness backfill do not process candles trace-silent', () => {
    const source = readRunnerSource();

    expect(source).not.toContain("this.candleProcessor.processNewCandle(candle, { persist: false });");
    expect(source).toContain("emitTrace(this, 'BOOT_REST_HYDRATION_CANDLE'");
    expect(source).toContain("source: 'boot_rest_hydration'");
    expect(source).toContain("emitTrace(this, 'LIVENESS_REST_BACKFILL_CANDLE'");
    expect(source).toContain("source: 'liveness_rest_backfill'");
    expect(source).toContain("emitTrace(this, 'REST_RECOVERY_SCOPE_REJECTED'");
    expect(source).toContain('this.candleProcessor.processNewCandle(candle, {');
    expect(source).toContain('traceId,');
    expect(source).toContain('scopeKey: candle.scopeKey');
    expect(source).toContain('acceptedAsNew');
  });

  test('REST recovery emits source-specific trace after CandleProcessor attaches scopeKey', () => {
    const source = readRunnerSource();
    const bootProcessIndex = source.indexOf("const acceptedAsNew = this.candleProcessor.processNewCandle(candle, {\n          persist: false,\n          traceId,\n          source: 'boot_rest_hydration'");
    const bootEmitIndex = source.indexOf("emitTrace(this, 'BOOT_REST_HYDRATION_CANDLE'");
    const livenessProcessIndex = source.indexOf("const acceptedAsNew = this.candleProcessor.processNewCandle(candle, {\n        persist: false,\n        traceId,\n        source: 'liveness_rest_backfill'");
    const livenessEmitIndex = source.indexOf("emitTrace(this, 'LIVENESS_REST_BACKFILL_CANDLE'");

    expect(bootProcessIndex).toBeGreaterThanOrEqual(0);
    expect(bootProcessIndex).toBeLessThan(bootEmitIndex);
    expect(livenessProcessIndex).toBeGreaterThanOrEqual(0);
    expect(livenessProcessIndex).toBeLessThan(livenessEmitIndex);
  });
});
