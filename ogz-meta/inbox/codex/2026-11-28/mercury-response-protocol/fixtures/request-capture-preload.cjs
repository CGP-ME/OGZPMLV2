'use strict';

// Explicit, one-process diagnostic: node --require <this file> <existing CLI>.
// Do not install in NODE_OPTIONS, production startup, or a policy hook.
// Only built-ins are loaded here: the CLI still owns dotenv/config initialization.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const root = path.resolve(__dirname, '../../../../../..');
const configurationBytes = fs.readFileSync(path.join(root, 'mercury.config.json'));
const configuration = JSON.parse(configurationBytes);
const endpoint = new URL(`${configuration.llm.baseUrl}/chat/completions`);
if (configuration.llm.provider !== 'mercury' || endpoint.protocol !== 'https:') {
  throw new Error('Request-capture diagnostic requires the configured Mercury HTTPS client');
}

const privateRoot = path.resolve(__dirname, '../private');
fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
if (!fs.lstatSync(privateRoot).isDirectory() || fs.realpathSync(privateRoot) !== privateRoot) {
  throw new Error('Request-capture evidence directory must be a real private directory');
}
fs.chmodSync(privateRoot, 0o700);
const directory = fs.mkdtempSync(path.join(privateRoot, 'request-capture-'));
fs.chmodSync(directory, 0o700);
const openPrivate = filename => {
  const fd = fs.openSync(path.join(directory, filename), 'wx', 0o600);
  fs.fchmodSync(fd, 0o600);
  return fd;
};
const eventsFd = openPrivate('events.jsonl');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const event = value => fs.writeFileSync(eventsFd, JSON.stringify({
  at: new Date().toISOString(), pid: process.pid, ...value,
}) + '\n');
event({ event: 'capture_started', preload_sha256: digest(fs.readFileSync(__filename)),
  config_sha256: digest(configurationBytes), endpoint_host: endpoint.hostname,
  endpoint_path: endpoint.pathname + endpoint.search,
  boundary: 'HTTP body bytes accepted by request.write/end; not TLS or remote-receipt proof',
  headers_captured: false });

const originalRequest = https.request;
let ordinal = 0;
https.request = function (...args) {
  const options = args[0];
  // This is the exact object-form call made by PersistentLLMClient. Other
  // endpoints and overloads pass through untouched and are not captured.
  const selected = options && typeof options === 'object' && !(options instanceof URL)
    && options.hostname === endpoint.hostname
    && String(options.port) === String(endpoint.port || 443)
    && options.path === endpoint.pathname + endpoint.search
    && options.method === 'POST';
  if (!selected) return Reflect.apply(originalRequest, this, args);

  const requestOrdinal = ++ordinal;
  const filename = `${String(requestOrdinal).padStart(4, '0')}.request.json`;
  const bodyFd = openPrivate(filename);
  const bodyHash = crypto.createHash('sha256');
  let bodyBytes = 0;
  let sealed = false;
  let insideEnd = false;
  event({ event: 'request_started', ordinal: requestOrdinal, body_file: filename });

  const append = (chunk, encoding) => {
    if (chunk == null || typeof chunk === 'function') return;
    const bytes = typeof chunk === 'string'
      ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
      : Buffer.from(chunk);
    fs.writeFileSync(bodyFd, bytes);
    bodyHash.update(bytes);
    bodyBytes += bytes.length;
  };
  const seal = reason => {
    if (sealed) return;
    sealed = true;
    fs.closeSync(bodyFd);
    event({ event: reason, ordinal: requestOrdinal, body_file: filename,
      body_bytes: bodyBytes, body_sha256: bodyHash.digest('hex') });
  };

  let req;
  try { req = Reflect.apply(originalRequest, this, args); }
  catch (error) { seal('request_creation_failed'); throw error; }
  const originalWrite = req.write;
  const originalEnd = req.end;
  req.write = function (...writeArgs) {
    const result = Reflect.apply(originalWrite, this, writeArgs);
    if (!insideEnd) append(writeArgs[0], writeArgs[1]);
    return result;
  };
  req.end = function (...endArgs) {
    insideEnd = true;
    try {
      const result = Reflect.apply(originalEnd, this, endArgs);
      append(endArgs[0], endArgs[1]);
      seal('request_end_called');
      return result;
    } finally { insideEnd = false; }
  };
  req.once('close', () => seal('request_closed_without_end'));
  // Existing response consumers remain in place. Hash only, so the existing
  // audit's raw_output.sha256 can identify the matching request unambiguously
  // when combined with process, sequence and timestamps. Never read headers.
  req.once('response', res => {
    const responseHash = crypto.createHash('sha256');
    let responseBytes = 0;
    res.on('data', chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      responseHash.update(bytes);
      responseBytes += bytes.length;
    });
    res.once('end', () => event({ event: 'response_ended', ordinal: requestOrdinal,
      status_code: res.statusCode, response_bytes: responseBytes,
      response_sha256: responseHash.digest('hex') }));
  });
  return req;
};

// The verification fixture reads these files. No request/header data goes to
// stdout, stderr, environment variables, public ledgers, or child-process flags.
module.exports = { directory };
