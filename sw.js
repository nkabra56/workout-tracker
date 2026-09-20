const CACHE = "steadily-v7";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/core.js",
  "/storage.js",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin ||
    new URL(event.request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
