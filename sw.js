/* 防災ポケット Service Worker
   - 一度開いた端末では、通信がなくても全ページと避難先データを表示できるようにする
   - 避難先データ（data/*.json）は「通信できれば最新を取得、だめなら保存済み」。
     → 年1回のデータ更新は data/ のファイルを差し替えるだけで各端末に届く（このファイルの変更は不要）
   - ページ・CSS・JSは「保存済みをすぐ表示し、裏で更新」。緊急時でも速く開く。 */
'use strict';

var VERSION = '2026-11-12';
var CORE_CACHE = 'bousai-core-' + VERSION;
var DATA_CACHE = 'bousai-data';
var NETWORK_TIMEOUT_MS = 3500;

var CORE_FILES = [
  './',
  'index.html',
  'shelters.html',
  'quake.html',
  'tsunami.html',
  'fire.html',
  'typhoon.html',
  'hazard.html',
  'levels.html',
  'stock.html',
  'contacts.html',
  'sheet.html',
  'assets/site.css',
  'assets/site.js',
  'assets/shelters.js',
  'assets/stock.js',
  'assets/contacts.js',
  'assets/sheet.js',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
var REGIONS_INDEX = 'data/regions.json';

function precacheData() {
  return caches.open(DATA_CACHE).then(function (cache) {
    return fetch(REGIONS_INDEX, { cache: 'reload' }).then(function (res) {
      if (!res.ok) throw new Error('regions.json ' + res.status);
      return cache.put(REGIONS_INDEX, res.clone()).then(function () { return res.json(); });
    }).then(function (idx) {
      var files = (idx.regions || []).map(function (r) { return r.file; }).filter(Boolean);
      return Promise.all(files.map(function (f) {
        return fetch(f, { cache: 'reload' }).then(function (res) { if (res.ok) return cache.put(f, res); });
      }));
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(Promise.all([
    caches.open(CORE_CACHE).then(function (cache) {
      return cache.addAll(CORE_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    }),
    precacheData()
  ]).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('bousai-core-') === 0 && k !== CORE_CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* 通信優先（タイムアウトあり）→ だめなら保存済み */
function networkFirst(request, cacheKey) {
  return caches.open(DATA_CACHE).then(function (cache) {
    var network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (res && res.ok) cache.put(cacheKey, res.clone());
      return res;
    });
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, NETWORK_TIMEOUT_MS); });
    return Promise.race([network.catch(function () { return null; }), timeout]).then(function (res) {
      if (res) return res;
      return cache.match(cacheKey).then(function (hit) { return hit || network; });
    });
  });
}

/* 保存済みをすぐ返し、裏で最新に更新 */
function staleWhileRevalidate(event, request, cacheKey, fallbackKey) {
  return caches.open(CORE_CACHE).then(function (cache) {
    return cache.match(cacheKey).then(function (hit) {
      // ブラウザのHTTPキャッシュを使わず、必ずサーバーに更新を確認する
      var update = fetch(cacheKey, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(cacheKey, res.clone());
        return res;
      });
      if (hit) {
        event.waitUntil(update.catch(function () {}));
        return hit;
      }
      return update.catch(function () {
        return fallbackKey ? cache.match(fallbackKey) : Response.error();
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 外部サイト（公式リンク・地図）はそのまま

  var scope = new URL(self.registration.scope);
  var path = url.pathname.slice(scope.pathname.length);

  if (/^data\/.+\.json$/.test(path)) {
    event.respondWith(networkFirst(request, path));
    return;
  }
  if (request.mode === 'navigate') {
    // ?type=... などのパラメータ付きでも同じページとして扱う
    var key = url.origin + url.pathname;
    event.respondWith(staleWhileRevalidate(event, request, key, 'index.html'));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, request, url.origin + url.pathname, null));
});
