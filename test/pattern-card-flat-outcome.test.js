'use strict';

const fs = require('fs');
const path = require('path');

describe('PatternCard flat outcome rendering', () => {
  test('renders flat outcomes as neutral instead of losses', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'panels', 'pattern-card.js'),
      'utf8'
    );

    expect(source).toContain(".pc-hist-outcome.flat");
    expect(source).toContain("outcome === 'flat' ? 'F'");
  });
});
