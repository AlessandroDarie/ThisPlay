const CACHE_NAME = 'setfree-tv-v3';
const ASSETS_TO_CACHE = [
    './index.html',
    './app.js',
    './api-config.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// Installazione: Caching degli asset statici vitali
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Attivazione: Pulizia delle vecchie cache
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
            );
        })
    );
});

// Intercettazione del traffico di rete
self.addEventListener('fetch', event => {
    // Ignoriamo le chiamate alle API esterne di TMDB, non vanno messe in questa cache statica
    if (event.request.url.includes('api.themoviedb.org')) return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Ritorna la cache se c'è, altrimenti tenta di usare la rete
            return cachedResponse || fetch(event.request);
        })
    );
});