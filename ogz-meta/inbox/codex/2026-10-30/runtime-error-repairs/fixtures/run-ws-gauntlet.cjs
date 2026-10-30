'use strict';
require('../../../../../../test/helpers/require-isolation.cjs')();
require('../../../../../../test/fixtures/alpaca-test-env.cjs');
const fs = require('fs');
const file = 'tests/broker-resilience-gauntlet.js';
// The private network namespace has no host DNS/hosts file. Use its loopback IP.
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('ws://localhost:', 'ws://127.0.0.1:'));
require('../../../../../../tests/broker-resilience-gauntlet.js');
