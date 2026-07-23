const CACHE_NAME = 'thisplay-v2.3.6';
const ASSETS_CORE = [
    './index.html',
    './app.js',
    './migrator.js',
    './api-config.js',
    './manifest.json',
    './icon_192x192.png',
    './icon_512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// 1. INSTALLAZIONE: Congela il nucleo dell'app al primo avvio
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(ASSETS_CORE))
        .then(() => self.skipWaiting())
    );
});

// 2. ATTIVAZIONE: Elimina le vecchie versioni della cache se un domani modifichi l'HTML
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
    );
});

// 3. INTERCETTAZIONE (IL MOTORE OFFLINE)
self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http')) return;
    event.respondWith(
        caches.match(event.request)
        .then((cachedResponse) => {
            // A. Se il file è già nella cache locale, restituiscilo a latenza zero
            if (cachedResponse) {
                return cachedResponse;
            }

            // B. Se non c'è, scaricalo da internet
            return fetch(event.request).then((networkResponse) => {
                // Ignora richieste non valide o file corrotti
                if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // C. CACHING DINAMICO: Se stai scaricando una GIF per la prima volta,
                // clona il file e salvalo fisicamente nel telefono per il futuro.
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        }).catch(() => {
            // Se non c'è rete e il file non è mai stato salvato in cache prima d'ora
            return new Response('Risorsa non scaricata. Connettiti per visualizzarla la prima volta.', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        })
    );
});