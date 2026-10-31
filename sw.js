/* Kanji Flashcards: offline support. Bump V to force every device to refresh its cache. */
const V = "kf-v1";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); } return res; };

// network first (so a fresh index.html arrives at once), cache when offline or slow
function networkFirst(req, fallbackUrl) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req).then(r => r || (fallbackUrl ? caches.match(fallbackUrl) : null));
    const timer = setTimeout(() => fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }), 4000);
    fetch(req).then(res => { clearTimeout(timer); if (!done) { done = true; resolve(put(req, res)); } else put(req, res); })
      .catch(() => { clearTimeout(timer); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
  });
}
// cache first, refresh quietly in the background
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(res => put(req, res)).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate") { e.respondWith(networkFirst(req, "/")); return; }
    if (url.pathname === "/sw.js") return;
    e.respondWith(staleWhileRevalidate(req));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(req));
  }                                            // everything else (Supabase) goes straight to the network
});
