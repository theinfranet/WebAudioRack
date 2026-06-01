/* ============================================================
   WebAudioRack — Service Worker
   Mínimo pero válido: con esto Chrome considera el sitio una PWA
   instalable. Cachea el "app shell" y sirve offline (cache-first
   para estáticos, network-first como fallback).
   Sube CACHE cuando cambies archivos para forzar actualización.
   ============================================================ */
const CACHE = "webaudiorack-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/design-system.css",
  "./css/rack.css",
  "./css/module-themes.css",
  "./css/sprint1.css",
  "./js/main.js",
  "./js/smooth-scroll.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla si un archivo 404ea; cacheamos lo que se pueda.
      .then((c) => Promise.allSettled(APP_SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // guarda en cache copias de mismo-origen para uso offline
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // sin red y sin cache → falla normal
    })
  );
});
