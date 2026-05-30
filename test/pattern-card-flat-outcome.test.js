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

  test('renders generic ML pattern geometry without emoji placeholders', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'panels', 'pattern-card.js'),
      'utf8'
    );

    expect(source).toContain("'ml_detected'");
    expect(source).toContain('function renderGeometrySvg');
    expect(source).toContain('renderGeometrySvg(p.geometry)');
    expect(source).toContain('if (!PATTERN_ART[patternKey] && !geometry) return;');
    expect(source).not.toContain('🔍');
  });
});
