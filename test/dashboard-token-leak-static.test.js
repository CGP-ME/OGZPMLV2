'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walkFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
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

  test('dashboard server and ignore rules block public backup filename variants', () => {
    const serverSource = readRepoFile('ogzprime-ssl-server.js');
    const gitignore = readRepoFile('.gitignore');

    expect(serverSource).toContain('app.use(/^\\/.*(?:\\.bak.*|bak(?:$|[._-]|\\d).*|backup.*|\\.(?:old|orig)$|~$)$/i, denyStaticBackup);');
    expect(serverSource).toContain('app.use(/^\\/index-.*\\.html$/i, denyStaticBackup);');
    expect(gitignore).toMatch(/^public\/\*bak\*$/m);
    expect(gitignore).toMatch(/^public\/\*\*\/\*bak\*$/m);
    expect(gitignore).toMatch(/^public\/\*backup\*$/m);
    expect(gitignore).toMatch(/^public\/\*\*\/\*backup\*$/m);
    expect(gitignore).toMatch(/^public\/\*\.old$/m);
    expect(gitignore).toMatch(/^public\/\*\*\/\*\.orig$/m);
    expect(gitignore).toMatch(/^public\/\*~$/m);
    expect(gitignore).toMatch(/^public\/index-\*\.html$/m);
  });

  test('served public tree excludes backup-derived root artifacts', () => {
    const publicRoot = path.join(repoRoot, 'public');
    const relativeFiles = walkFiles(publicRoot)
      .map(filePath => path.relative(publicRoot, filePath).split(path.sep).join('/'));
    const blockedRootArtifacts = relativeFiles.filter(relativePath => {
      const basename = path.posix.basename(relativePath);
      return !relativePath.includes('/')
        && (
          /bak/i.test(basename)
          || /backup/i.test(basename)
          || /\.(old|orig)$/i.test(basename)
          || /~$/i.test(basename)
          || /^index-.*\.html$/i.test(basename)
        );
    });

    expect(blockedRootArtifacts).toEqual([]);
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
    const htmlFiles = walkFiles(publicRoot)
      .filter(filePath => /\.html(?:\.|$)/i.test(path.basename(filePath)) || filePath.endsWith('.html'));

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
