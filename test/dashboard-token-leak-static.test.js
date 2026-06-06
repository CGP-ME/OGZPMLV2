'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('dashboard websocket token containment', () => {
  test('dashboard server does not inject WEBSOCKET_AUTH_TOKEN into public HTML', () => {
    const serverSource = readRepoFile('ogzprime-ssl-server.js');

    expect(serverSource).not.toMatch(/content=["'`]\$\{token\}/);
    expect(serverSource).not.toMatch(/injectDashboardToken|serveDashboardTemplateWithToken|serveDashboardWithToken|serveDashboardV2WithToken/);
    expect(serverSource).not.toMatch(/WEBSOCKET_AUTH_TOKEN\s*\|\|/);
    expect(serverSource).not.toMatch(/CHANGE_ME_IN_PRODUCTION/);
    expect(serverSource).toMatch(/scrubDashboardToken/);
  });

  test('bot websocket client fails closed when the auth token is absent', () => {
    const managerSource = readRepoFile('core/WebSocketManager.js');

    expect(managerSource).not.toMatch(/WEBSOCKET_AUTH_TOKEN\s*\|\|/);
    expect(managerSource).not.toMatch(/CHANGE_ME_IN_PRODUCTION/);
    expect(managerSource).toMatch(/closing dashboard WebSocket without authentication/);
  });

  test('dashboard templates keep ws-token placeholders empty', () => {
    for (const relativePath of ['public/unified-dashboard.html', 'public/unified-dashboard-v2.html']) {
      const html = readRepoFile(relativePath);

      expect(html).toMatch(/<meta\s+name=["']ws-token["']\s+content=["']["']\s*>/);
      expect(html).not.toMatch(/<meta\s+name=["']ws-token["']\s+content=["'][a-f0-9]{32,}["']/i);
      expect(html).toMatch(/MUST NOT carry\s+WEBSOCKET_AUTH_TOKEN/);
    }
  });

  test('public HTML files do not contain non-empty ws-token meta values', () => {
    const publicRoot = path.join(repoRoot, 'public');
    const htmlFiles = [];

    function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.html(?:\.|$)/i.test(entry.name) || entry.name.endsWith('.html')) {
          htmlFiles.push(fullPath);
        }
      }
    }

    walk(publicRoot);

    for (const filePath of htmlFiles) {
      const html = fs.readFileSync(filePath, 'utf8');
      const wsTokenMetas = [...html.matchAll(/<meta\s+name=["']ws-token["']\s+content=["']([^"']*)["']\s*\/?\s*>/gi)];

      for (const match of wsTokenMetas) {
        expect(match[1]).toBe('');
      }
      expect(html).not.toMatch(/<meta\s+name=["']ws-token["']\s+content=["'][a-f0-9]{32,}["']/i);
    }
  });

  test('tracked files do not contain dashboard token secrets', () => {
    const output = execFileSync('node', ['scripts/scan-secrets.js', '--tracked'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    expect(output).toContain('[secret-scan] PASS tracked files');
  });
});
