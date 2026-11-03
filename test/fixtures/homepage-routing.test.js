'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');
const express = require('express');

const repoRoot = path.resolve(__dirname, '../..');
let server;
let socketPath;

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath, path: url }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

beforeAll(async () => {
  // Fixture harness: execute the actual HTML route declarations, without
  // importing the server's bot, provider clients, timers or network listeners.
  const source = fs.readFileSync(path.join(repoRoot, 'ogzprime-ssl-server.js'), 'utf8');
  const start = source.indexOf('// Dashboard HTML is public.');
  const end = source.indexOf("app.post('/api/dashboard/session'", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const app = express();
  vm.runInNewContext(source.slice(start, end), {
    app, fs, path, __dirname: repoRoot, console
  }, { filename: 'ogzprime-ssl-server.js', lineOffset: source.slice(0, start).split('\n').length - 1 });

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'homepage-routing-fixture-'));
  socketPath = path.join(scratch, 'http.sock');
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test.each(['/', '/?utm_source=fixture', '/index.html', '/index.html?utm_source=fixture'])(
  '%s returns the existing marketing homepage and signup flow', async url => {
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toBe(fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8'));
    expect(response.body).toContain('id="leadForm"');
    expect(response.body).toContain('https://hook.us2.make.com/');
    expect(response.body).toContain("window.location.href = 'unified-dashboard-v2.html'");
    expect(response.body).not.toContain('/js/panels/trai-brain.js');
  }
);

test.each(['/index.html/', '/INDEX.HTML/'])(
  '%s canonicalizes the trailing slash while preserving attribution', async url => {
    const query = '?utm_source=fixture&utm_campaign=homepage%20test';
    const response = await request(url + query);
    expect(response.status).toBe(308);
    expect(response.headers.location).toBe('/index.html' + query);
    expect(response.headers['cache-control']).toContain('no-store');
    const homepage = await request(response.headers.location);
    expect(homepage.status).toBe(200);
    expect(homepage.body).toBe(fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8'));
  }
);

test.each([
  ['/unified-dashboard.html', 'unified-dashboard.html'],
  ['/unified-dashboard.html/', 'unified-dashboard.html'],
  ['/unified-dashboard-v2.html', 'unified-dashboard-v2.html'],
  ['/unified-dashboard-v2.html/', 'unified-dashboard-v2.html'],
  ['/unified-dashboard-legacy.html', 'unified-dashboard-v2.html'],
  ['/unified-dashboard-legacy.html/', 'unified-dashboard-v2.html'],
  ['/control-panel.html', 'control-panel.html'],
])('%s preserves its existing page and token containment', async (url, file) => {
  const response = await request(url);
  const html = fs.readFileSync(path.join(repoRoot, 'public', file), 'utf8');
  expect(response.status).toBe(200);
  expect(response.body).toBe(html.replace(
    /<meta\s+name=["']ws-token["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta name="ws-token" content="">'
  ));
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.body).not.toMatch(/<meta\s+name=["']ws-token["']\s+content=["'][^"']+["']/);
});
