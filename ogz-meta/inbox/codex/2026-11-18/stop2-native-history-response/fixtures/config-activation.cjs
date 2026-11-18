'use strict';
const fs = require('node:fs');
const path = require('node:path');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
if (process.argv[2]) fs.copyFileSync(process.argv[2], 'config/settings.json');
const credentials = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(credentials, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = credentials;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
const result = ConfigLoader.load({ role: 'bot', silent: true });
const sources = Object.fromEntries(Object.entries(result.sources).filter(([key]) => key.startsWith('orchestrator.') && /Timeframes/.test(key)));
console.log('CONFIG_ACTIVATION_RECEIPT ' + JSON.stringify({ profile: result.config.profile, mode: result.config.mode,
  revisions: result.revisions, observationFrames: result.config.orchestrator.mtfTimeframes,
  entryFrames: result.config.orchestrator.entryTimeframes, sources,
  credentials: 'Synthetic isolation fixture only; no operator credentials read' }));
