'use strict';

// Exercise pinned loader/handler source with private canonical files and the real
// atomic writer. No broker, socket, PM2, or production state is contacted.
const assert = require('assert/strict');
const cp = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = process.cwd();
const ref = process.env.CONFIG_PROOF_REF || "86e45d6ff451623b5f6591e1048f0ba48c4b9f87";
const packet = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(packet, 'private'), { recursive: true });
const dir = fs.mkdtempSync(path.join(packet, 'private/probe-'));
const source = file => {
  const pinned = path.join(__dirname, file.replaceAll('/', '__') + '.cjs');
  return file.endsWith('.json') ? JSON.stringify(require(pinned)) : fs.readFileSync(pinned, 'utf8');
};
const canonicalSettings = path.join(root, 'config/settings.json');
const canonicalInternals = path.join(root, 'config/internals.json');
const privateSettings = path.join(dir, 'settings.json');
fs.writeFileSync(privateSettings, source('config/settings.json'));
const internals = Buffer.from(source('config/internals.json'));
const actualRead = fs.readFileSync;
const actualLoad = Module._load;
const atomicWriter = require(path.join(root, 'core/AtomicWrite'));
let writes = 0;
fs.readFileSync = function (file, ...args) {
  if (file === canonicalSettings) return actualRead.call(this, privateSettings, ...args);
  if (file === canonicalInternals) return typeof args[0] === 'string' || args[0]?.encoding ? internals.toString() : internals;
  return actualRead.call(this, file, ...args);
};
Module._load = function (request, parent, isMain) {
  const filename = Module._resolveFilename(request, parent, isMain);
  const relative = typeof filename === 'string' ? path.relative(root, filename) : '';
  if (relative === 'core/AtomicWrite.js' && parent?.filename === path.join(root, 'foundation/ConfigLoader.js')) {
    return { writeJsonAtomic(target, value, options) {
      assert.equal(target, canonicalSettings);
      atomicWriter.writeJsonAtomic(privateSettings, value, options);
      writes += 1;
    } };
  }
  // These collaborators are irrelevant to handleSettings; constructing a real
  // StateManager would read/write unrelated runtime state.
  if (parent?.filename === path.join(root, 'core/WebSocketManager.js')) {
    if (relative === 'core/StateManager.js') return { getInstance: () => ({}) };
    if (relative === 'core/TradeNarrator.js') return { getNarrator: () => ({}) };
    if (relative === 'core/BotStateFrame.js') return { buildBotStateFrame: () => ({}) };
  }
  if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || path.isAbsolute(relative)
      || !/\.(js|cjs|json)$/.test(relative)) return actualLoad.apply(this, arguments);
  if (!fs.existsSync(path.join(__dirname, relative.replaceAll('/', '__') + '.cjs'))) return actualLoad.apply(this, arguments);
  if (require.cache[filename]) return require.cache[filename].exports;
  const mod = new Module(filename, parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = mod;
  if (relative.endsWith('.json')) mod.exports = JSON.parse(source(relative));
  else mod._compile(source(relative), filename);
  return mod.exports;
};
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = path.join(dir, 'absent.env');
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) {
  process.env[key] = `fixture-${key}`;
}

const loader = require(path.join(root, 'foundation/ConfigLoader'));
loader.load({ role: 'bot', silent: true, loadDotenv: false });
const get = (o,k) => k.split('.').reduce((v,p)=>v?.[p],o);
const rows = [];
const definitions = loader.getSettingsView().fields;
function choices(field) {
 const v=field.value;
 if (field.type==='boolean') return [!v];
 if (field.values) return field.values.filter(x=>x!==v);
 if (field.type==='number') {
  const step=field.integer?1: Math.max(0.001, Math.abs(v)*0.01);
  return [v+step,v-step,(field.min+field.max)/2].filter(x=>Number.isFinite(x)&&x!==v&&x>=field.min&&x<=field.max&&(!field.integer||Number.isSafeInteger(x))&&(!field.exclusiveMin||x>field.min)&&(!field.exclusiveMax||x<field.max));
 }
 if(field.format==='integer_list') return [v.split(',').map(x=>Number(x)+1).join(',')];
 if(field.type==='string'&&/^\d\d:\d\d$/.test(v)) {const n=Number(v.slice(0,2))*60+Number(v.slice(3));return [n+1,n-1].filter(x=>x>=0&&x<1440).map(x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0'));}
 if(field.type==='string'&&/time\s?zone/i.test(field.label || '')) return [v==='UTC'?'America/New_York':'UTC'];
 if(field.type==='string' && field.label?.includes('system instruction')) return [v+' Use the supplied data.'];
 if(field.type==='array' && v.length>1) return [[...v].reverse()];
 return [];
}
for (const [key,field] of Object.entries(definitions)) {
 if(!field.editable || (process.env.CONFIG_PROBE_KEYS && !process.env.CONFIG_PROBE_KEYS.split(',').includes(key)))continue;
 const original=structuredClone(field.value), attempts=[];
 let proved=false;
 for(const value of choices(field)) {
  if(JSON.stringify(value)===JSON.stringify(original))continue;
  const before=loader.getSettingsView().configuration;
  const request={requestId:`field-${rows.length}`, expectedRevision:before.settings,expectedSettingsHash:before.settingsHash,changes:{[key]:value}};
  const result=loader.saveSettings(request);
  if(!result.success){attempts.push({reason:result.reason,path:result.path});continue;}
  assert.equal(result.changed,true,key);
  assert.deepEqual(loader.get(key),value,key);
  const disk=JSON.parse(fs.readFileSync(privateSettings,'utf8'));
  const canonicalPath=field.scope==='active_launch_profile'?`launchProfiles.paper.${key}`:key;
  assert.deepEqual(get(disk,canonicalPath),value,key+' persistence');
  let initializationError=null;
  try {const reloaded=loader.snapshot({...process.env,PROFILE:'paper'},{role:'bot',silent:true,loadDotenv:false}); assert.deepEqual(get(reloaded.config,key),value,key+' reload');}
  catch(error){initializationError=error.message;}
  const stable=loader.getCachedSnapshot(),count=writes;
  const repeated=loader.saveSettings({...request,expectedRevision:result.configuration.settings,expectedSettingsHash:result.configuration.settingsHash});
  assert.equal(repeated.changed,false,key);assert.strictEqual(loader.getCachedSnapshot(),stable,key);assert.equal(writes,count,key);
  const restored=loader.saveSettings({...request,expectedRevision:repeated.configuration.settings,expectedSettingsHash:repeated.configuration.settingsHash,changes:{[key]:original}});
  assert.equal(restored.success,true,key+' restore');
  rows.push({key,canonicalPath,source:field.source,effect:field.effect,changedSave:true,persisted:true,reloaded:initializationError===null,repeatSideEffects:false,initializationError});proved=true;break;
 }
 if(!proved) rows.push({key,status:'alternate_value_unresolved',type:field.type,format:field.format,value:field.value,values:field.values,label:field.label,attempts});
}
console.log(JSON.stringify({candidate:ref,total:rows.length,passed:rows.filter(x=>x.reloaded).length,failures:rows.filter(x=>!x.reloaded),rows}));
