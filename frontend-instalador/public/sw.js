const CACHE_STATIC = "instalador-static-v3";
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

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.titulo || "Sistema Adornie", {
      body: data.mensagem || "",
      icon: "/icon-192.png",
      data: { link: data.link || "/agenda" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/agenda";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      const existing = clientsList.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        if ("navigate" in existing) existing.navigate(link);
        return;
      }
      return self.clients.openWindow(link);
    })
  );
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

  // App shell (HTML/navegação): sempre busca a versão nova quando online,
  // senão o cliente nunca descobre o novo bundle hasheado após um deploy
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request, CACHE_STATIC));
    return;
  }

  // Assets com hash no nome (/assets/*.js, *.css, etc.): imutáveis, cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
  }
});
