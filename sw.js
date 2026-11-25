/* 离线缓存：首次打开后，断网也能做题 */
const CACHE = "gdwx-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/core.js",
  "./assets/exam.js",
  "./assets/icon.svg",
  "./data/t2s.js",
  "./data/texts.js",
  "./data/fills.js",
  "./data/recites.js",
  "./data/terms.js",
  "./data/shorts.js",
  "./data/essays.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
