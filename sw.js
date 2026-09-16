/* 小綠日記 — 簡易 Service Worker
   離線快取 App Shell，讓已加入主畫面的 PWA 也能離線開啟。 */
const CACHE_NAME = "plantapp-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // 跨網域的請求（例如打到 Supabase Edge Functions）以及本機 /api/ 開頭的請求，
  // 一律直接打網路：天氣／AI 額度這些資料有自己的快取規則（在 Edge Function／資料庫），
  // Service Worker 不應該再疊一層過期的快取，否則會一直看到舊資料。
  if(url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if(response && response.status === 200 && response.type === "basic"){
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
