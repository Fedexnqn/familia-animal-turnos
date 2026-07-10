// sw.js - Service Worker para PWA - Versión optimizada
const CACHE_VERSION = 'v3'; // CAMBIA ESTO EN CADA ACTUALIZACIÓN
const CACHE_NAME = `familia-animal-${CACHE_VERSION}`;

// Solo cachear archivos locales, NO librerías externas (se cargan desde CDN)
const urlsToCache = [
  '/familia-animal-turnos/',
  '/familia-animal-turnos/index.html',
  '/familia-animal-turnos/manifest.json',
  '/familia-animal-turnos/icon-192.png',
  '/familia-animal-turnos/icon-512.png',
  '/familia-animal-turnos/OneSignalSDKWorker.js'
];

// ============================================================
// INSTALACIÓN
// ============================================================
self.addEventListener('install', event => {
  console.log('📦 Service Worker instalando... versión:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cacheando archivos locales...');
        return cache.addAll(urlsToCache)
          .then(() => {
            console.log('✅ Archivos cacheados correctamente');
          })
          .catch(error => {
            console.error('❌ Error cacheando archivos:', error);
          });
      })
      .then(() => {
        // Forzar activación inmediata
        return self.skipWaiting();
      })
  );
});

// ============================================================
// ACTIVACIÓN - Elimina caches antiguos
// ============================================================
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activando... versión:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ Service Worker activado - Tomando control');
      // Tomar control de todas las páginas
      return self.clients.claim();
    })
  );
});

// ============================================================
// INTERCEPTAR PETICIONES - Estrategia: Cache First, luego Network
// ============================================================
self.addEventListener('fetch', event => {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  // No cachear peticiones a Firebase, OneSignal, etc.
  const url = new URL(event.request.url);
  
  // Ignorar peticiones a APIs externas
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('onesignal.com') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('firebaseio.com')) {
    // Pasar directamente a la red sin cachear
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Si está en cache, devolverlo
        if (cachedResponse) {
          // Actualizar el cache en segundo plano (stale-while-revalidate)
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, networkResponse);
                  });
              }
            })
            .catch(() => {
              // Si falla la red, no pasa nada
            });
          return cachedResponse;
        }
        
        // Si no está en cache, ir a la red
        return fetch(event.request)
          .then(networkResponse => {
            // Guardar en cache para futuras visitas
            if (networkResponse && networkResponse.status === 200) {
              const clonedResponse = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, clonedResponse);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Si falla la red y no está en cache, mostrar página offline
            return caches.match('/familia-animal-turnos/offline.html');
          });
      })
  );
});

// ============================================================
// MENSAJES DESDE EL CLIENTE
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ Service Worker cargado - Versión:', CACHE_VERSION);
