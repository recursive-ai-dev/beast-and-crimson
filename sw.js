/* Offline cache for hosted web builds (ignored on file:// and desktop shells). */
"use strict";

const CACHE_NAME = "beast-and-crimson-v0.11.0";
const CORE_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./assets/manifest.js",
  "./assets/art/crest.png",
  "./src/errors.js",
  "./src/data.js",
  "./src/core.js",
  "./src/intro.js",
  "./src/intro-scene.js",
  "./src/audio.js",
  "./src/battle.js",
  "./src/ui.js",
  "./src/ui-intro.js",
  "./src/ui-menu.js",
  "./src/ui-campaign.js",
  "./src/ui-warband.js",
  "./src/ui-battle.js",
  "./src/ui-settings.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Streamed range requests (e.g. MP3 audio seeking/looping) bypass synthetic 200 cache responses.
  if (req.headers.has("range")) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
