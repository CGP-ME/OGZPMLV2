const fs = require('fs');
const path = require('path');

describe('data feed liveness watchdog contract', () => {
  test('runtime liveness checks do not pause trading', () => {
    const targets = [
      'run-empire-v2.js',
      path.join('core', 'CandleProcessor.js'),
    ];

    for (const target of targets) {
      const source = fs.readFileSync(path.join(__dirname, '..', target), 'utf8');
      expect(source).not.toMatch(/pauseTrading[\s\S]{0,240}source:\s*['"]data_feed_liveness['"]/);
    }
  });
});
