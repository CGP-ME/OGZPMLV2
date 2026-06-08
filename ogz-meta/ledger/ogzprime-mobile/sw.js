/* OGZPrime Mobile service worker — app-shell only.
 * Caches the static shell for installability/offline launch.
 * NEVER caches WebSocket traffic or any trading data (none flows through HTTP here anyway).
 */
const SHELL = 'ogzm-shell-v2';
const ASSETS = ['./index.html', './app.js', './manifest.webmanifest', './icon.svg'];
const SHELL_ASSET_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isShellAsset = sameOrigin && SHELL_ASSET_URLS.has(url.href);
  const isNavigation = sameOrigin && req.mode === 'navigate';
  if (!isShellAsset && !isNavigation) return;

  // Network-first for the shell so updates land; fall back to cache offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (isShellAsset) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
