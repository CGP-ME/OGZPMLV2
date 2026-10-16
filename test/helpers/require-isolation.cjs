'use strict';

// Test-launch enforcement only. Never imported by the trading process.
const fs = require('fs');

module.exports = function requireIsolation() {
  const markerPath = '/run/ogz-helper-isolation.json';
  const instruction = 'Run tests with npm test -- <arguments>, or python3 scripts/test-isolated.py -- node node_modules/jest/bin/jest.js <arguments>. Raw Jest may reach real bot state and is refused before test imports.';
  if (!fs.existsSync(markerPath)) throw new Error(instruction);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (marker.projectRoot !== process.cwd()) throw new Error(instruction);
  for (const name of ['mnt', 'net', 'pid']) {
    if (!marker.hostNamespaces[name] || fs.readlinkSync(`/proc/self/ns/${name}`) === marker.hostNamespaces[name]) {
      throw new Error(instruction);
    }
  }
};
