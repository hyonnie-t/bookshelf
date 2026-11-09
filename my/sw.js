// 범용판 앱 파일 캐시. 기록은 IndexedDB에 있어 여기서 다루지 않는다. 네트워크 먼저, 끊기면 캐시.
// 캐시 이름을 bookshelf-로 시작하지 않는다(효니 책장의 sw.js가 그 이름들을 정리한다).
const VERSION = 'v28';
const CACHE = 'myshelf-' + VERSION;
const FILES = ['./', 'index.html', 'manifest.webmanifest', '../css/app.css', '../js/app.js', '../js/fb.js', '../js/local.js', '../js/words.js', '../js/guess.js', '../icons/icon-192.png', '../icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('myshelf-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache:'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch:true }).then((m) => m || caches.match('index.html'))));
});
