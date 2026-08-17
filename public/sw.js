const CACHE = "jarvis-shell-v3";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;
  if (new URL(request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "JARVIS has an update." }; }
  const title = payload.title || "JARVIS";
  const options = {
    body: payload.body || "Something needs your attention.",
    tag: payload.dedupe_key || "jarvis-update",
    icon: "/jarvis-icon.svg",
    badge: "/jarvis-icon.svg",
    renotify: true,
    requireInteraction: payload.severity === "urgent",
    data: { url: payload.url || "/", source: payload.source || "jarvis" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(target).catch(() => {});
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});
