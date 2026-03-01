var CACHE_NAME = 'nz2026-v1';
var URLS_TO_CACHE = [
  '/new-zealand-2026/',
  '/new-zealand-2026/index.html'
];

// Install: cache the page and its assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network, cache new responses
self.addEventListener('fetch', function(event) {
  // Only cache same-origin GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve cache immediately, update in background
        event.waitUntil(
          fetch(event.request).then(function(response) {
            if (response.ok) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, response);
              });
            }
          }).catch(function() {})
        );
        return cached;
      }
      return fetch(event.request).then(function(response) {
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback — return cached index if available
        return caches.match('/new-zealand-2026/');
      });
    })
  );
});
