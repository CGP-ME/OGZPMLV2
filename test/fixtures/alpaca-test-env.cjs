'use strict';
require('../helpers/require-isolation.cjs')();
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stream-test';
process.env.PROFILE = 'paper';
require('../../foundation/ConfigLoader').load({ role: 'bot', loadDotenv: false, silent: true });
