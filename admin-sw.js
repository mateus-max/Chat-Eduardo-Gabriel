const CACHE_NAME = "eduardo-admin-v2";

const APP_SHELL = [
  "/admin",
  "/admin.html",
  "/manifest.webmanifest",
  "/admin-sw.js",
  "/admin-push.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {}

  const title = data.title || "🔔 Novo atendimento";
  const body =
    data.body ||
    "Um novo cliente iniciou uma conversa.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/avatar.jpg",
      badge: "/avatar.jpg",
      tag: data.tag || "nova-conversa",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [0, 1000],
      data: {url: data.url || "/admin"}
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/admin",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({type:"window", includeUncontrolled:true})
      .then(clientList => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request, {cache:"no-store"})
      .then(response => {
        const copy = response.clone();
        if (
          response.ok &&
          ["/admin","/admin/","/admin.html","/admin-sw.js","/admin-push.js"].includes(url.pathname)
        ) {
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || caches.match("/admin.html"))
      )
  );
});
