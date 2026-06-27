#!/usr/bin/env node
'use strict';

const path = require('path');

const {
  buildDigest,
  formatDigestMarkdown,
  loadCanaries,
  readRunLedgers,
} = require('../trai_brain/mercury-bridge/substrate-digest');

const repoRoot = path.resolve(__dirname, '..');
const rows = readRunLedgers(repoRoot);
const canaries = loadCanaries(repoRoot);
const digest = buildDigest(rows, canaries);

if (process.argv.includes('--markdown')) {
  console.log(formatDigestMarkdown(digest));
} else {
  console.log(JSON.stringify(digest, null, 2));
}
