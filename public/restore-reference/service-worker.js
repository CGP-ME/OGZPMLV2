// OGZPrime Service Worker v1.0
// Enables offline caching and PWA functionality

const CACHE_NAME = 'ogzprime-dash-v1';
const CACHE_URLS = [
  '/unified-dashboard.html',
  '/valhalla-style.css',
  '/trai-widget.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&family=Orbitron:wght@400;700;900&display=swap'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip WebSocket and non-GET requests
  if (event.request.url.includes('ws://') ||
      event.request.url.includes('wss://') ||
      event.request.method !== 'GET') {
    return;
  }

  // Skip API calls - always fetch fresh
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('/ws')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          // Fetch fresh version in background for next time
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, response));
              }
            })
            .catch(() => {}); // Ignore network errors for background update

          return cachedResponse;
        }

        // Not in cache - fetch from network
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response.ok && response.type === 'basic') {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseToCache));
            }
            return response;
          })
          .catch(() => {
            // Network failed and not in cache
            // Return offline fallback for HTML pages
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/unified-dashboard.html');
            }
          });
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'New trading alert',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'ogzprime-alert',
    renotify: true,
    data: {
      url: data.url || '/unified-dashboard.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OGZPrime Alert', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes('unified-dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});

console.log('[SW] Service Worker loaded');
