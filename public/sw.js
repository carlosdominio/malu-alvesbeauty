const CACHE_NAME = "malu-alves-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // NUNCA interceptar chamadas do painel administrativo (/admin), rotas de API (/api) ou requisições não-GET
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;
      } catch {}
      return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
    })
  );
});
