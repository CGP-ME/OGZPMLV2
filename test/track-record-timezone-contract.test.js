'use strict';

const fs = require('fs');
const path = require('path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public/proof/track-record/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'public/proof/track-record/index.html'), 'utf8');

describe('track record timezone contract', () => {
  test('proof track record renders timestamps in explicit ET instead of browser-local time', () => {
    expect(appSource).toContain("const DISPLAY_TIME_ZONE = 'America/New_York';");
    expect(appSource).toContain("const DISPLAY_TIME_ZONE_LABEL = 'ET';");
    expect(appSource).toContain('function fmtEtDateTime(value)');
    expect(appSource).not.toMatch(/new Date\([^)]*\)\.toLocaleString\(/);
    expect(htmlSource).toContain('<th>Time (ET)</th>');
  });
});
