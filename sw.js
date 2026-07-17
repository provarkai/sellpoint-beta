// Minimal service worker - its only job is satisfying Chrome's PWA
// installability requirement (a registered SW + a manifest). No offline
// caching yet; every fetch just passes straight through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));
