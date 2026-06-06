#!/usr/bin/env node
'use strict';

const DEFAULT_BASE_URL = 'https://ogzprime.org';

const ROUTES = [
  { path: '/', requireNoToken: true, requireNoStore: false },
  { path: '/index.html', requireNoToken: true, requireNoStore: false },
  { path: '/unified-dashboard.html', requireNoToken: true, requireNoStore: true },
  { path: '/unified-dashboard-v2.html', requireNoToken: true, requireNoStore: true },
  { path: '/unified-dashboard-legacy.html', requireNoToken: true, requireNoStore: true }
];

function getFetch() {
  if (global.fetch) return global.fetch;
  return require('node-fetch');
}

function findWsTokenMeta(html) {
  return html.match(/<meta\s+name=["']ws-token["']\s+content=["']([^"']*)["']\s*\/?\s*>/i);
}

async function checkRoute(baseUrl, route, fetchImpl) {
  const url = new URL(route.path, baseUrl);
  const response = await fetchImpl(url, {
    redirect: 'manual',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });
  const html = await response.text();
  const cacheControl = response.headers.get('cache-control') || '';
  const wsTokenMeta = findWsTokenMeta(html);
  const hasHexWsTokenMeta = /<meta\s+name=["']ws-token["']\s+content=["'][a-f0-9]{32,}["']/i.test(html);
  const failures = [];

  if (response.status !== 200) {
    failures.push(`expected HTTP 200, got ${response.status}`);
  }
  if (route.requireNoToken && wsTokenMeta && wsTokenMeta[1] !== '') {
    failures.push(`ws-token meta content is non-empty length=${wsTokenMeta[1].length}`);
  }
  if (route.requireNoToken && hasHexWsTokenMeta) {
    failures.push('ws-token meta contains a hex-like secret value');
  }
  if (route.requireNoStore && !/\bno-store\b/i.test(cacheControl)) {
    failures.push(`Cache-Control missing no-store; got ${JSON.stringify(cacheControl)}`);
  }

  return {
    path: route.path,
    status: response.status,
    cacheControl,
    wsTokenMetaPresent: Boolean(wsTokenMeta),
    wsTokenMetaLength: wsTokenMeta ? wsTokenMeta[1].length : null,
    hasHexWsTokenMeta,
    failures
  };
}

async function main() {
  const baseUrl = process.env.DASHBOARD_TOKEN_CHECK_BASE_URL || DEFAULT_BASE_URL;
  const fetchImpl = getFetch();
  const results = [];

  for (const route of ROUTES) {
    results.push(await checkRoute(baseUrl, route, fetchImpl));
  }

  let failureCount = 0;
  for (const result of results) {
    failureCount += result.failures.length;
    const metaLength = result.wsTokenMetaPresent ? result.wsTokenMetaLength : 'n/a';
    console.log(
      `${result.path} status=${result.status} wsMeta=${result.wsTokenMetaPresent} ` +
      `wsMetaLength=${metaLength} hexWsMeta=${result.hasHexWsTokenMeta} ` +
      `cacheControl=${JSON.stringify(result.cacheControl)}`
    );
    for (const failure of result.failures) {
      console.error(`  FAIL ${failure}`);
    }
  }

  if (failureCount > 0) {
    console.error(`[dashboard-token-containment] FAIL findings=${failureCount}`);
    process.exit(1);
  }

  console.log(`[dashboard-token-containment] PASS baseUrl=${baseUrl}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[dashboard-token-containment] ERROR ${error.message}`);
    process.exit(1);
  });
}
