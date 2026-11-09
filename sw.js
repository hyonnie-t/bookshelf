// 앱 파일과 공개 책장만 캐시한다(비공개 기록은 캐시하지 않음). 네트워크 먼저, 끊기면 캐시.
const VERSION = 'v32';
const CACHE = 'bookshelf-' + VERSION;
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/fb.js', 'js/local.js', 'js/words.js', 'js/guess.js', 'data/public.json', 'data/blog.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('bookshelf-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/demo/')) return;
  e.respondWith(fetch(e.request, { cache:'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch:true }).then((m) => m || caches.match('index.html'))));
});
