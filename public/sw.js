/**
 * Moonwick service worker — offline load.
 *
 * Strategy: NETWORK-FIRST with cache fallback, caching every successful
 * same-origin GET (and the two font requests) as it flows past. The game has
 * no backend and no dynamic data, so "whatever loaded once" IS the app; and
 * network-first means a deploy is picked up on the next online visit with no
 * versioned precache manifest to maintain against Vite's hashed filenames.
 *
 * Registered in production only (src/pwa.ts): the dev server must never
 * fight a cache.
 *
 * Bump CACHE when a change must invalidate everything at once; otherwise
 * network-first keeps entries fresh by itself.
 */
const CACHE = "moonwick-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const cacheable =
    url.origin === self.location.origin ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => {
          if (hit) return hit;
          // A navigation with no exact match falls back to the shell.
          if (request.mode === "navigate") return caches.match("./");
          return Response.error();
        })
      )
  );
});
