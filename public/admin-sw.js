const CACHE_NAME = "eduardo-admin-v2";
const APP_SHELL = ["/admin", "/admin.html"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {

  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if(request.method==="GET"&&(url.pathname==="/admin"||url.pathname==="/admin.html")){
    event.respondWith(
      fetch(request,{cache:"no-store"}).then(async response=>{
        var html=await response.text();
        html=html.replace("</body>","<script src=\"/admin-push.js?v=20261008-push4\"></script></body>");
        var headers=new Headers(response.headers);
        headers.delete("content-length");
        headers.set("Cache-Control","no-store");
        return new Response(html,{status:response.status,headers:headers});
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(request, {cache:"no-store"})
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match("/admin.html")))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Chat Eduardo Gabriel",
      {
        body: data.body || "Novo atendimento recebido.",
        icon: "/avatar.jpg",
        badge: "/avatar.jpg",
        tag: data.tag || "chat-eduardo",
        renotify: true,
        silent: false,
        vibrate: [180,80,180,80,180,80,180],
        data: { url: data.url || "/admin" }
      }
    )
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/admin";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      const open = clients.find(client => {
        try { return new URL(client.url).pathname === target; }
        catch(e) { return false; }
      });
      return open && "focus" in open
        ? open.focus()
        : self.clients.openWindow(target);
    })
  );
});
