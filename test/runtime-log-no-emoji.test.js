const fs = require('fs');
const path = require('path');

describe('runtime log hygiene', () => {
  test('active production runtime sources have no emoji glyphs', () => {
    const root = path.join(__dirname, '..');
    const sourcePaths = [
      path.join(root, 'ogzprime-ssl-server.js'),
      path.join(root, 'core', 'persistent_llm_client.js'),
    ];
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    for (const sourcePath of sourcePaths) {
      const source = fs.readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(emojiPattern);
    }
  });
});
