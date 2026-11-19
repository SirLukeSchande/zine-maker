/* Offline cache. Bump VERSION on every release. */
var VERSION = 'zine-v2';
var FILES = ['./', 'index.html', 'style.css', 'app.js', 'layout.js', 'pdf.js', 'store.js', 'pdf-lib.min.js', 'fontkit.umd.min.js', 'jszip.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
['inter','dm-sans','space-grotesk','work-sans','archivo','ibm-plex-mono','eb-garamond','cormorant-garamond','playfair-display','libre-baskerville'].forEach(function (f) { FILES.push('f-' + f + '-400.ttf', 'f-' + f + '-700.ttf'); });
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(r, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && res.ok && res.status === 200) c.put(r, res.clone()); return res; }).catch(function () { return hit || (r.mode === 'navigate' ? c.match('index.html') : undefined); });
      return hit || net;
    });
  }));
});
