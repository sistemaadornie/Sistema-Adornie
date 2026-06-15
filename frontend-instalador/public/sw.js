const CACHE_STATIC = "instalador-static-v1";
const CACHE_API = "instalador-api-v1";
const CACHE_TILES = "instalador-tiles-v1";
const CACHES = [CACHE_STATIC, CACHE_API, CACHE_TILES];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE") {
    caches.delete(CACHE_API);
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Leitura da agenda e veículos: tenta rede, cai para cache offline
  if (url.pathname.startsWith("/api/agendamentos") || url.pathname.startsWith("/api/veiculos")) {
    event.respondWith(networkFirst(request, CACHE_API));
    return;
  }

  // Tiles do mapa: cache-first (mudam raramente)
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    event.respondWith(cacheFirst(request, CACHE_TILES));
    return;
  }

  // App shell e assets estáticos (mesma origem)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
  }
});
