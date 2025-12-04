/**
 * Voice Agent Service Worker
 * Provides offline caching for the PWA shell
 */

const CACHE_NAME = 'voice-agent-v3';
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/app.module.js',
    '/static/audio.module.js',
    '/static/utils.js',
    '/static/settings.js',
    '/static/theme.js',
    '/static/avatar.js',
    '/static/notifications.js',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch - serve from cache first, network fallback
self.addEventListener('fetch', (event) => {
    // Skip WebSocket requests and POST
    if (
        event.request.url.includes('/ws') ||
        event.request.method !== 'GET'
    ) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cache hit
                    return cachedResponse;
                }
                
                // Fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-ok responses or opaque responses
                        if (!response || response.status !== 200) {
                            return response;
                        }
                        
                        // Cache successful responses for static assets
                        const url = new URL(event.request.url);
                        if (url.pathname.startsWith('/static/')) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        
                        return response;
                    });
            })
            .catch(() => {
                // Return offline page if available
                return caches.match('/');
            })
    );
});
