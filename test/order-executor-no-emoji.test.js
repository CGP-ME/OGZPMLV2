const fs = require('fs');
const path = require('path');

describe('OrderExecutor log hygiene', () => {
  test('production OrderExecutor source has no emoji glyphs', () => {
    const sourcePath = path.join(__dirname, '..', 'core', 'OrderExecutor.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    expect(source).not.toMatch(emojiPattern);
  });
});
