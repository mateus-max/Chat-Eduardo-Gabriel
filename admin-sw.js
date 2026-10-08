const CACHE_NAME = "eduardo-admin-v1";
const APP_SHELL = ["/admin", "/admin.html", "/manifest.webmanifest"];

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

  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

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
