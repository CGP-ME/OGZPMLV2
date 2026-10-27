'use strict';
// Install public review fixtures only inside the disposable helper namespace.
require('../helpers/require-isolation.cjs')();
const fs = require('fs');
const sources = require(process.argv[2] === 'candidate'
  ? './mercury-reporting-candidate.json' : './mercury-reporting-ignore.json');
for (const [file, source] of Object.entries(sources)) fs.writeFileSync(file, source);
require('child_process').execFileSync(process.execPath, [
  'node_modules/jest/bin/jest.js', '--runInBand', 'test/fixtures/mercury-answer-reporting.test.js',
], { stdio: 'inherit' });
