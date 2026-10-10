'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');
const parser = require('@babel/parser');

function astSource(file, pick) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'script', plugins: ['optionalChaining', 'nullishCoalescingOperator'] });
  let found;
  const visit = (node) => {
    if (!node || found) return;
    if (pick(node, source)) { found = source.slice(node.start, node.end); return; }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') Array.isArray(value) ? value.forEach(visit) : visit(value);
    }
  };
  visit(ast);
  if (!found) throw new Error(`AST fixture extraction failed for ${file}`);
  return found;
}
function compileBlock(code, names) { return new Function(...names, code); } // eslint-disable-line no-new-func
function findIf(file, text) { return astSource(file, (n, s) => n.type === 'IfStatement' && s.slice(n.test.start, n.test.end).includes(text)); }
function findCallCallback(file, route) {
  return astSource(file, (n, s) => n.type === 'CallExpression' && s.slice(n.start, n.end).includes(`app.${route}`)
    && n.arguments.some(a => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression'));
}
function callbackCode(call) {
  const ast = parser.parse(call, { sourceType: 'script' });
  let fn;
  const visit = n => { if (!n || fn) return; if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') { fn = call.slice(n.start, n.end); return; } for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(visit) : visit(v); };
  visit(ast); if (!fn) throw new Error('callback extraction failed'); return fn;
}

async function start(root) {
  root = path.resolve(root);
  const settingsPath = path.join(root, 'config', 'settings.json');
  const serverFile = path.join(root, 'ogzprime-ssl-server.js');
  const managerFile = path.join(root, 'core', 'WebSocketManager.js');
  process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-key';
  process.env.ALPACA_API_KEY = 'fixture-key';
  process.env.ALPACA_API_SECRET = 'fixture-secret';
  const ConfigLoader = require(path.join(root, 'foundation', 'ConfigLoader.js'));
  ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
  const serverSource = fs.readFileSync(serverFile, 'utf8');
  const managerSource = fs.readFileSync(managerFile, 'utf8');
  const managerAst = parser.parse(managerSource, { sourceType: 'script' });
  let method;
  const walk = n => { if (!n || method) return; if ((n.type === 'ClassMethod' || n.type === 'ObjectMethod') && n.key?.name === 'handleSettings') { method = n; return; } for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(walk) : walk(v); };
  walk(managerAst); if (!method) throw new Error('handleSettings AST extraction failed');
  const handleSettings = new Function('ConfigLoader', 'WebSocket', `return function(message) ${managerSource.slice(method.body.start, method.body.end)}`)(ConfigLoader, WebSocket);

  const { createDashboardSessionAuth } = require(path.join(root, 'server', 'dashboard-session-auth.js'));
  const cfg = ConfigLoader.getAll();
  const dashboard = cfg.services.dashboard;
  const sessionAuth = createDashboardSessionAuth({ secureCookies: dashboard.secureCookies, sessionTtlMs: cfg.dashboard.sessionTtlMs, ticketTtlMs: cfg.dashboard.ticketTtlMs });
  const relaySource = serverFile;
  const sameOrigin = new Function(`return (${astSource(relaySource, n => n.type === 'FunctionDeclaration' && n.id?.name === 'isSameOriginDashboardRequest')})`)();
  const loadTemplate = new Function('fs', `return (${astSource(relaySource, n => n.type === 'FunctionDeclaration' && n.id?.name === 'loadDashboardTemplate')})`)(fs);
  const tokenPatternDeclaration = astSource(relaySource, n => n.type === 'VariableDeclarator' && n.id?.name === 'wsTokenMetaPattern');
  const tokenPattern = new Function(`const ${tokenPatternDeclaration}; return wsTokenMetaPattern;`)();
  const scrubTemplate = new Function('wsTokenMetaPattern', `return (${astSource(relaySource, n => n.type === 'FunctionDeclaration' && n.id?.name === 'scrubDashboardToken')})`)(tokenPattern);
  const serveTemplate = new Function('loadDashboardTemplate', 'scrubDashboardToken', `return (${astSource(relaySource, n => n.type === 'FunctionDeclaration' && n.id?.name === 'serveDashboardTemplate')})`)(loadTemplate, scrubTemplate);
  const app = express(); app.use(express.json());
  const sessionCall = findCallCallback(relaySource, "post('/api/dashboard/session'");
  const ticketCall = findCallCallback(relaySource, "get('/api/dashboard/session-ticket'");
  const logoutCall = findCallCallback(relaySource, "post('/api/dashboard/logout'");
  const compileCallback = call => { const fn = callbackCode(call); return new Function('dashboardSessionAuth', 'dashboardAuthToken', 'isSameOriginDashboardRequest', `return (${fn});`)(sessionAuth, dashboard.authToken, sameOrigin); };
  app.post('/api/dashboard/session', compileCallback(sessionCall));
  app.get('/api/dashboard/session-ticket', compileCallback(ticketCall));
  app.post('/api/dashboard/logout', compileCallback(logoutCall));
  app.get('/control-panel.html', (req, res) => serveTemplate(req, res, path.join(root, 'public', 'control-panel.html'), 'control-panel.html', 'unavailable'));
  app.use(express.static(path.join(root, 'public')));

  const frames = []; const httpServer = http.createServer(app); const wss = new WebSocket.Server({ server: httpServer });
  const pendingTimers = new Set(); let hold = false;
  const authBlock = compileBlock(findIf(relaySource, "data.type === 'auth'"), ['ws','data','wss','WebSocket','dashboardAuthToken','dashboardSessionAuth','req','connectionId','authTimeout','isSameOriginDashboardRequest']);
  const preAuthBlock = compileBlock(findIf(relaySource, "!ws.authenticated && data.type !== 'auth'"), ['ws','data','wss','WebSocket','dashboardAuthToken','dashboardSessionAuth','req','connectionId','authTimeout','isSameOriginDashboardRequest']);
  const pingBlock = compileBlock(findIf(relaySource, "data.type === 'ping'"), ['ws','data','wss','WebSocket']);
  const botIdentifyBlock = compileBlock(findIf(relaySource, "data.type === 'identify' && data.source === 'trading_bot'"), ['ws','data','wss','WebSocket','connectionId']);
  const dashboardIdentifyBlock = compileBlock(findIf(relaySource, "data.type === 'identify' && data.source === 'dashboard'"), ['ws','data','wss','WebSocket','startDashboardStockPriceStream','broadcastDashboardStockPrices','broadcastDashboardCryptoPrices','dashboardSnapshotCache','connectionId']);
  const settingsRelayBlock = compileBlock(findIf(relaySource, "ws.clientType === 'dashboard' && (data.type === 'get_settings' || data.type === 'save_settings')"), ['ws','data','wss','WebSocket']);
  const receiptRelayBlock = compileBlock(findIf(relaySource, "data.type === 'settings_result'"), ['ws','data','wss','WebSocket']);
  wss.on('connection', (ws, req) => {
    ws.connectionId = `fixture_${Date.now()}_${Math.random().toString(36).slice(2)}`; ws.authenticated = false; ws.botAuthenticated = false; ws.isAlive = true;
    const send = ws.send.bind(ws); ws.send = (value, ...args) => { try { frames.push(JSON.parse(String(value))); } catch {} return send(value, ...args); };
    const authTimeout = setTimeout(() => { if (!ws.authenticated) ws.close(1008, 'Authentication timeout'); }, cfg.dashboard.websocketAuthTimeoutMs); pendingTimers.add(authTimeout);
    ws.on('close', () => { clearTimeout(authTimeout); pendingTimers.delete(authTimeout); });
    ws.on('message', raw => { const data = JSON.parse(raw.toString()); frames.push(data); const vars = [ws,data,wss,WebSocket,dashboard.authToken,sessionAuth,req,ws.connectionId,authTimeout,sameOrigin];
      if (!ws.authenticated && data.type !== 'auth') return preAuthBlock(...vars);
      if (data.type === 'auth') return authBlock(...vars);
      if (data.type === 'ping') return pingBlock(ws,data,wss,WebSocket);
      if (data.type === 'identify' && data.source === 'trading_bot') { botIdentifyBlock(ws,data,wss,WebSocket,ws.connectionId); return; }
      if (data.type === 'identify' && data.source === 'dashboard') { dashboardIdentifyBlock(ws,data,wss,WebSocket,()=>Promise.resolve(),()=>Promise.resolve(),()=>Promise.resolve(),{},ws.connectionId); return; }
      if (ws.clientType === 'dashboard' && (data.type === 'get_settings' || data.type === 'save_settings')) { settingsRelayBlock(ws,data,wss,WebSocket); return; }
      if (data.type === 'settings_result') receiptRelayBlock(ws,data,wss,WebSocket);
    });
  });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const owner = new WebSocket(url.replace('http:', 'ws:'));
  owner.on('message', raw => { const frame = JSON.parse(raw.toString()); if (!hold && (frame.type === 'get_settings' || frame.type === 'save_settings')) handleSettings.call({ ctx: { dashboardWs: owner } }, frame); });
  await new Promise((resolve, reject) => { owner.once('error', reject); owner.on('message', raw => { const frame = JSON.parse(raw.toString()); if (frame.type === 'auth_success') { owner.connectionId = frame.connectionId; owner.send(JSON.stringify({ type: 'identify', source: 'trading_bot' })); } if (frame.type === 'identification_confirmed') resolve(); }); owner.on('open', () => owner.send(JSON.stringify({ type: 'auth', token: 'fixture-key' }))); });
  return { url, token: 'fixture-key', owner, ConfigLoader, settingsPath, frames, close: async () => { for (const t of pendingTimers) clearTimeout(t); for (const ws of wss.clients) ws.close(); owner.close(); await new Promise(r => httpServer.close(r)); }, disconnectDashboards: () => { for (const ws of wss.clients) if (ws.clientType === 'dashboard') ws.close(); }, holdSettings: value => { hold = Boolean(value); } };
}
module.exports = { start };
