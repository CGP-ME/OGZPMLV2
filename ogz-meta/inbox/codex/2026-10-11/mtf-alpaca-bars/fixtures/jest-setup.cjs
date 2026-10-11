'use strict';
const path = require('path');
Object.assign(process.env, { PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token', ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret', KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret' });
require(path.resolve('foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });
