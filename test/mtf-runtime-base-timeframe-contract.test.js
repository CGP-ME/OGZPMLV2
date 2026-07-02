'use strict';

const fs = require('fs');
const path = require('path');

describe('MTF runtime base timeframe contract', () => {
  const runnerSource = () => fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');

  test('resolves broker candle timeframe before constructing MTF adapters', () => {
    const source = runnerSource();
    const runtimeTimeframeIndex = source.indexOf('const runtimeCandleTimeframe = resolvedConfig.config.broker.candleTimeframe;');
    const orchestratorIndex = source.indexOf('this.strategyOrchestrator = new StrategyOrchestrator({');
    const liveMtfIndex = source.indexOf('this.mtfAdapter = new MultiTimeframeAdapter({');

    expect(runtimeTimeframeIndex).toBeGreaterThanOrEqual(0);
    expect(orchestratorIndex).toBeGreaterThan(runtimeTimeframeIndex);
    expect(liveMtfIndex).toBeGreaterThan(orchestratorIndex);

    const orchestratorBlock = source.slice(orchestratorIndex, liveMtfIndex);
    expect(orchestratorBlock).toContain('mtfBaseTimeframe: this.candleTimeframe');

    const liveMtfBlock = source.slice(liveMtfIndex, source.indexOf('this.candleAggregator = new CandleAggregator();'));
    expect(liveMtfBlock).toContain('baseTimeframe: this.candleTimeframe');
  });
});
