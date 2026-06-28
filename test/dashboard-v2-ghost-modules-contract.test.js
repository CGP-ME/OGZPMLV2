'use strict';

const fs = require('fs');
const path = require('path');

describe('dashboard v2 ghost module contract', () => {
  test('v2 shell does not import modules without deliberate v2 mount points', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public/unified-dashboard-v2.html'),
      'utf8'
    );
    const empire = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/run-frontend-empire-v2.js'),
      'utf8'
    );

    expect(html).not.toContain('/js/panels/bot-intelligence.js');
    expect(html).not.toContain('/js/panels/goal-tracker.js');
    expect(html).toContain('<div id="chainOfThought"></div>');
    expect(html).toContain('personalMilestones: false');
    expect(empire).not.toContain("script: '/js/panels/bot-intelligence.js'");
    expect(empire).not.toContain("script: '/js/panels/goal-tracker.js'");
  });

  test('v2 bot thinking still has a mounted reasoning owner and direct confidence update', () => {
    const core = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/core.js'),
      'utf8'
    );
    const chainOfThought = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/chain-of-thought.js'),
      'utf8'
    );
    const liveReadouts = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/live-readouts.js'),
      'utf8'
    );

    expect(chainOfThought).toContain("socket.registerHandler('bot_thinking', onBotThinking);");
    expect(chainOfThought).toContain('data.thinking ||');
    expect(chainOfThought).toContain('data.analysis ||');
    expect(chainOfThought).toContain('data.message ||');
    expect(chainOfThought).toContain('(data.data && data.data.reasoning)');
    expect(chainOfThought).toContain('function normalizeConfidence(value)');
    expect(liveReadouts).toContain("const existingConfidence = document.getElementById('confidenceML');");
    expect(liveReadouts).toContain('!root.contains(existingConfidence)');
    expect(liveReadouts).toContain("existingConfidence.removeAttribute('id');");
    expect(liveReadouts).toContain("confValue.id = 'confidenceML';");
    expect(liveReadouts).toContain("function isNumericValue(value)");
    expect(liveReadouts).toContain("if (typeof value === 'number') return Number.isFinite(value);");
    expect(liveReadouts).toContain("const trimmed = value.trim();");
    expect(core).toContain("socket.registerHandler('bot_thinking', (d) => {");
    expect(core).toContain('function isNumericValue(value)');
    expect(core).toContain("if (typeof value === 'number') return Number.isFinite(value);");
    expect(core).toContain('if (isNumericValue(data.confidence)) {');
    expect(core).toContain('if (isNumericValue(conf)) {');
    expect(core).not.toContain("set('confidenceML', data.confidence != null ? data.confidence.toFixed(0) + '%' : '--');");
    expect(core).toContain("const el = document.getElementById('confidenceML');");
    expect(core).toContain("if (el) el.textContent = Number(conf).toFixed(0) + '%';");
  });

  test('legacy dashboard keeps BotIntelligence where thoughtDisplay exists', () => {
    const legacy = fs.readFileSync(
      path.join(__dirname, '..', 'public/unified-dashboard.html'),
      'utf8'
    );

    expect(legacy).toContain('/js/panels/bot-intelligence.js');
    expect(legacy).toContain('id="thoughtDisplay"');
  });
});
