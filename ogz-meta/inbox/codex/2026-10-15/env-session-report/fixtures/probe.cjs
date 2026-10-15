'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.cwd();
const SUBJECT = path.join(ROOT, 'ogz-meta/session-form.js');
const TRANSITION_FILE = path.join(ROOT, 'data/session-router/transition-state.json');
const STATE_FILE = path.join(ROOT, 'data/state-paper.json');
const INTERNALS = {
  'services.supervisor.botProcess': 'ogz-prime-v2',
  'sessionRouter.transitionStoreDir': 'data/session-router',
  'paths.stateFile': 'data/state-paper.json'
};

function loadCollectBotState({ pm2Data, files = {}, env = {} }) {
  const source = fs.readFileSync(SUBJECT, 'utf8');
  const fsStub = {
    existsSync: file => Object.prototype.hasOwnProperty.call(files, file),
    readFileSync: file => {
      if (!Object.prototype.hasOwnProperty.call(files, file)) throw new Error(`missing ${file}`);
      return files[file].content;
    },
    statSync: file => ({ mtime: new Date(files[file].mtime) })
  };
  const requireStub = request => {
    if (request === 'fs') return fsStub;
    if (request === 'path') return path;
    if (request === 'child_process') return { execSync: command => {
      if (command.startsWith('pm2 jlist')) return JSON.stringify(pm2Data);
      if (command.startsWith('pgrep')) throw new Error('not running');
      throw new Error(`unexpected command: ${command}`);
    }};
    if (request === '../foundation/ConfigLoader') return { getInternalsFileValue: key => INTERNALS[key] };
    throw new Error(`unexpected require: ${request}`);
  };
  requireStub.main = {};
  const module = { exports: {} };
  vm.runInNewContext(source + "\nmodule.exports.generateMarkdown = generateMarkdown;", { require: requireStub, module, exports: module.exports, __dirname: path.dirname(SUBJECT), process: { env }, console, Date, JSON, Math, Number, String, Object, Array }, { filename: SUBJECT });
  module.exports.collectBotState.generateMarkdown = module.exports.generateMarkdown;
  return module.exports.collectBotState;
}

function botProcess(pmUptime) {
  return [{ name: 'ogz-prime-v2', pm2_env: { status: 'online', pm_uptime: pmUptime, restart_time: 3 }, monit: { memory: 1024 * 1024, cpu: 2 } }];
}

function completeTransition(updatedAt, executionMode = 'paper', symbol = 'ETH-USD') {
  return JSON.stringify({ state: 'TARGET_ACTIVATED', updatedAt, runtimeScopeStatus: 'complete', scopeComplete: true, runtimeScope: { runtimeScopeStatus: 'complete', scopeComplete: true, executionMode, symbol } });
}

test('retired shell environment values cannot influence observed runtime scope', async () => {
  const now = Date.now();
  const collectBotState = loadCollectBotState({
    pm2Data: botProcess(now - 60_000),
    env: { TRADING_MODE: 'LIVE', BACKTEST_MODE: 'true', TRADING_PAIR: 'FAKE-USD' },
    files: { [TRANSITION_FILE]: { content: completeTransition(new Date(now).toISOString()), mtime: now } }
  });
  const state = await collectBotState();
  assert.equal(state.trading.mode, 'PAPER');
  assert.equal(state.trading.activeAsset, 'ETH-USD');
});

test('rejects a non-bot PM2 process even when it has an OGZ-like name', async () => {
  const now = Date.now();
  const collectBotState = loadCollectBotState({
    pm2Data: [{ name: 'ogz-websocket', pm2_env: { status: 'online', pm_uptime: now - 60_000 } }],
    files: { [TRANSITION_FILE]: { content: completeTransition(new Date(now).toISOString()), mtime: now } }
  });
  const state = await collectBotState();
  assert.equal(state.trading.mode, 'unknown');
  assert.equal(state.trading.activeAsset, 'unknown');
  assert(state.knownIssues.includes('PM2 bot process not observed: ogz-prime-v2'));
});

test('uses a fresh complete scope and canonical persisted paper state', async () => {
  const now = Date.now();
  const observedAt = new Date(now - 10_000).toISOString();
  const collectBotState = loadCollectBotState({
    pm2Data: botProcess(now - 60_000),
    files: {
      [TRANSITION_FILE]: { content: completeTransition(new Date(now).toISOString(), 'paper', 'BTC-USD'), mtime: now },
      [STATE_FILE]: { content: JSON.stringify({ activeTrades: [{ id: 'one' }, { id: 'two' }], balance: 100.25, dailyPnL: 999 }), mtime: observedAt }
    }
  });
  const state = await collectBotState();
  assert.equal(state.trading.mode, 'PAPER');
  assert.equal(state.trading.activeAsset, 'BTC-USD');
  assert.equal(state.trading.persistedState.status, 'observed');
  assert.equal(state.trading.persistedState.source, `internals.paths.stateFile:${STATE_FILE}`);
  assert.equal(state.trading.persistedState.fileModifiedAt, observedAt);
  assert.equal(Number.isFinite(Date.parse(state.trading.persistedState.observedAt)), true);
  assert.equal(state.trading.inPosition, 'Yes (2 active trades)');
  assert.equal(state.trading.balance, '$100.25');
  assert.equal(state.trading.dailyPnL, 'unknown');
});

test('reports a stale transition record as unobserved without fabricating PnL', async () => {
  const now = Date.now();
  const collectBotState = loadCollectBotState({
    pm2Data: botProcess(now - 60_000),
    files: { [TRANSITION_FILE]: { content: completeTransition(new Date(now - 120_000).toISOString()), mtime: now } }
  });
  const state = await collectBotState();
  assert.equal(state.trading.mode, 'unknown');
  assert.equal(state.trading.activeAsset, 'unknown');
  assert.equal(state.trading.persistedState.status, 'unobserved');
  assert.equal(state.trading.dailyPnL, 'unknown');
  assert(state.knownIssues.includes('Runtime scope unobserved: transition record predates the selected PM2 bot process'));
});

test('reports missing transition and persisted-state records as unobserved', async () => {
  const now = Date.now();
  const collectBotState = loadCollectBotState({ pm2Data: botProcess(now - 60_000) });
  const state = await collectBotState();
  assert.equal(state.trading.mode, 'unknown');
  assert.equal(state.trading.activeAsset, 'unknown');
  assert.equal(state.trading.persistedState.status, 'unobserved');
  assert.equal(state.trading.dailyPnL, 'unknown');
  assert.equal(state.knownIssues.some(issue => issue.startsWith('Runtime scope unobserved:')), true);
  assert(state.knownIssues.includes('Persisted paper state unobserved: no fresh observed paper runtime scope'));
});


test('both rendered state tables expose persisted observation provenance', async () => {
  const now = Date.now();
  const collect = loadCollectBotState({pm2Data:botProcess(now - 60000),files:{
    [TRANSITION_FILE]:{content:completeTransition(new Date(now).toISOString()),mtime:now},
    [STATE_FILE]:{content:JSON.stringify({activeTrades:[],balance:0}),mtime:now-1000}
  }});
  const state = await collect();
  const form = {identity:{modulesInScope:[]},botStateStart:state,botStateEnd:state,contextCheck:{},handoff:{},verification:{},_meta:{},workLog:[],filesCreated:[],filesModified:[],filesDeleted:[],bugsFound:[],decisions:[],patches:[]};
  const markdown = collect.generateMarkdown(form);
  for (const value of [state.trading.persistedState.source,state.trading.persistedState.observedAt,state.trading.persistedState.fileModifiedAt]) {
    assert.equal(markdown.split(value).length-1,2,'provenance appears in start and end tables');
  }
  assert.equal(markdown.split('**Persisted paper balance**').length-1,2);
});
