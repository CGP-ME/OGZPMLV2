const fs = require('fs');
const path = require('path');

describe('runtime log hygiene', () => {
  test('selected production runtime sources have no emoji glyphs', () => {
    const root = path.join(__dirname, '..');
    const sourcePaths = [
      path.join(root, 'ogzprime-ssl-server.js'),
      path.join(root, 'core', 'persistent_llm_client.js'),
      path.join(root, 'core', 'PipelineSnapshot.js'),
      path.join(root, 'core', 'TradeJournalBridge.js'),
      path.join(root, 'core', 'WebSocketManager.js'),
      path.join(root, 'core', 'TradeJournal.js'),
      path.join(root, 'core', 'TradeReplayCapture.js'),
      path.join(root, 'core', 'PerformanceAnalyzer.js'),
      path.join(root, 'core', 'PatternBasedExitModel.js'),
      path.join(root, 'modules', 'MADynamicSR.js'),
      path.join(root, 'kraken_adapter_simple.js'),
      path.join(root, 'brokers', 'KrakenIBrokerAdapter.js'),
    ];
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    for (const sourcePath of sourcePaths) {
      const source = fs.readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(emojiPattern);
    }
  });

  test('selected runtime console lines have no mojibake markers', () => {
    const root = path.join(__dirname, '..');
    const sourcePaths = [
      path.join(root, 'run-empire-v2.js'),
      path.join(root, 'core', 'PerformanceAnalyzer.js'),
      path.join(root, 'core', 'PatternBasedExitModel.js'),
      path.join(root, 'modules', 'MADynamicSR.js'),
    ];
    const mojibakePattern = /(?:â|�|"Š|═[‘”š])/;

    for (const sourcePath of sourcePaths) {
      const source = fs.readFileSync(sourcePath, 'utf8');
      const consoleLines = source
        .split('\n')
        .filter((line) => line.includes('console.'));

      expect(consoleLines.join('\n')).not.toMatch(mojibakePattern);
    }
  });
});
