// cache name, cache files
var CACHE_NAME = 'dabimas-factor-v20260821-01';
var BASE_PATH = self.location.pathname.replace(/\/service-worker\.js$/, '/');
var APP_SHELL_URL = BASE_PATH + 'index.html';
// プリキャッシュは「実行時に実際に使われるもの」だけに絞る。
// - フォントは woff2 のみ。モダンブラウザは @font-face の woff2 だけを取得するため、
//   otf / woff / eot / ttf を addAll してもダウンロード帯域とストレージを浪費するだけ。
// - source map（*.map）と未リンクの vuetify.min.css は実行時に不要なので除外。
// - js/css は cache-first（後述）で初回アクセス時に runtime cache されるため、
//   ここに載せていないもの（factor-dialog.css 等）もオフライン対応される。
// - vue/**/*.js は index.html が読み込む全ファイル（42本、index-split-completion-plan.md
//   Phase 5-1 の棚卸しで index.html の <script src> と Glob vue/**/*.js が完全一致することを
//   確認済み）を index.html の読み込み順（＝依存順）のまま列挙する。
var urlsToCache = [
  APP_SHELL_URL,
  // 初期表示用の軽量 summary を install cache する（案 B）。
  BASE_PATH + 'json/dabimasFactor.summary.json',
  // detail chunk（json/dabimasFactor-details/*.json）は install では addAll しない。
  // 1 ファイルの 404 で install 全体が失敗する（指摘 C）ため、fetch ハンドラの
  // network-first 経路で runtime cache される。アプリ側 prefetch で順次温める。
  // 旧 full JSON は移行期間の fallback として残す（summary 取得失敗時の退避先）。
  BASE_PATH + 'json/dabimasFactor.json',
  BASE_PATH + 'json/brosData.json',
  BASE_PATH + 'json/inbreed-exceptions.json',
  BASE_PATH + 'css/style.css',
  BASE_PATH + 'css/mobile.css',
  BASE_PATH + 'css/loading.css',
  BASE_PATH + 'css/materialdesignicons.min.css',
  BASE_PATH + 'css/notosansjapanese.css',
  BASE_PATH + 'css/vuetify_compact.min.css',
  BASE_PATH + 'vue/vue.min.js',
  BASE_PATH + 'vue/logic/storage/combination-storage.js',
  BASE_PATH + 'vue/CombinationDialog.js',
  BASE_PATH + 'vue/vuetify.js',
  BASE_PATH + 'vue/factor-dialog.js',
  BASE_PATH + 'vue/constants/pedigree-indexes.js',
  BASE_PATH + 'vue/constants/parent-lines.js',
  BASE_PATH + 'vue/constants/factor-definitions.js',
  BASE_PATH + 'vue/logic/pedigree/pedigree-css.js',
  BASE_PATH + 'vue/logic/factor/factor-map.js',
  BASE_PATH + 'vue/logic/factor/factor-counts.js',
  BASE_PATH + 'vue/logic/factor/manual-factors.js',
  BASE_PATH + 'vue/logic/pedigree/row-configs.js',
  BASE_PATH + 'vue/logic/pedigree/pedigree-selection.js',
  BASE_PATH + 'vue/logic/horses/horse-search.js',
  BASE_PATH + 'vue/logic/storage/local-storage.js',
  BASE_PATH + 'vue/logic/theory/compatibility.js',
  BASE_PATH + 'vue/logic/pedigree/pedigree-builder.js',
  BASE_PATH + 'vue/logic/inbreed/inbreed-exceptions.js',
  BASE_PATH + 'vue/logic/inbreed/inbreed-detector.js',
  BASE_PATH + 'vue/logic/inbreed/inbreed-counts.js',
  BASE_PATH + 'vue/components/pedigree/memo-cell.js',
  BASE_PATH + 'vue/components/pedigree/desktop-horse-autocomplete.js',
  BASE_PATH + 'vue/components/pedigree/mobile-horse-picker.js',
  BASE_PATH + 'vue/components/pedigree/horse-cell.js',
  BASE_PATH + 'vue/components/pedigree/pedigree-row.js',
  BASE_PATH + 'vue/components/pedigree/pedigree-table.js',
  BASE_PATH + 'vue/components/pedigree/pedigree-card.js',
  BASE_PATH + 'vue/components/header/factor-summary-header.js',
  BASE_PATH + 'vue/app/app-state.js',
  BASE_PATH + 'vue/app/app-computed.js',
  BASE_PATH + 'vue/app/app-lifecycle.js',
  BASE_PATH + 'vue/app/methods/ui-viewport.js',
  BASE_PATH + 'vue/app/methods/combination.js',
  BASE_PATH + 'vue/app/methods/horse-loading.js',
  BASE_PATH + 'vue/app/methods/bootstrap.js',
  BASE_PATH + 'vue/app/methods/selection.js',
  BASE_PATH + 'vue/app/methods/inbreed-ui.js',
  BASE_PATH + 'vue/app/methods/pedigree-cells.js',
  BASE_PATH + 'vue/app/app-options.js',
  BASE_PATH + 'vue/app/boot.js',
  BASE_PATH + 'vue/app/main.js',
  BASE_PATH + 'cdn/html2canvas.min.js',
  BASE_PATH + 'fonts/materialdesignicons-webfont.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Black.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Bold.woff2',
  BASE_PATH + 'fonts/NotoSansJP-DemiLight.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Light.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Medium.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Regular.woff2',
  BASE_PATH + 'fonts/NotoSansJP-Thin.woff2',
];

function isSameOriginGetRequest(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

// 日次で更新され得るデータ。これだけは network-first で鮮度を優先する。
function isDataRequest(request) {
  return /\/json\//.test(new URL(request.url).pathname);
}

// フォント・vendored JS/CSS など、デプロイ毎に CACHE_NAME を bump する前提で
// 不変とみなせるアセット。cache-first にしてオンラインでも再取得しない。
function isStaticAsset(request) {
  return request.mode !== 'navigate' && !isDataRequest(request);
}

function isOffline() {
  return self.navigator && self.navigator.onLine === false;
}

function getCacheKey(request) {
  return request.mode === 'navigate' ? APP_SHELL_URL : request;
}

function matchFromCache(cache, request) {
  return cache.match(getCacheKey(request));
}

function updateCache(cache, request, response) {
  if (response && response.ok) {
    return cache.put(getCacheKey(request), response.clone());
  }

  return Promise.resolve();
}

function createNetworkRequest(request) {
  return new Request(request, { cache: 'no-cache' });
}

// install cache
// cache: 'reload' で明示的にブラウザのHTTPキャッシュをバイパスする。
// これがないと、CACHE_NAME を bump してもブラウザ側が古いレスポンスを
// ヒューリスティックにキャッシュしていた場合、そのまま新しいキャッシュに
// 古い内容が入ってしまい、デプロイしても更新が反映されないことがある。
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(
          urlsToCache.map(function (url) {
            return new Request(url, { cache: 'reload' });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// online: network first / offline: cache only
self.addEventListener('fetch', function (event) {
  if (!isSameOriginGetRequest(event.request)) {
    return;
  }

  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  // 静的アセットは cache-first。キャッシュにあればネットワークに行かない（オンラインでも）。
  if (isStaticAsset(event.request)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          // urlsToCache に載っていない静的アセット（factor-dialog.css 等）は
          // ここで初めて実際にfetchされる。cache:'reload' を指定しないと
          // ブラウザのHTTPキャッシュ（ヒューリスティック鮮度）から古い応答を
          // 拾ってしまい、CACHE_NAME を bump しても更新が反映されないことがある。
          return fetch(new Request(event.request, { cache: 'reload' })).then(function (networkResponse) {
            return updateCache(cache, event.request, networkResponse).then(function () {
              return networkResponse;
            });
          });
        });
      })
    );
    return;
  }

  // データ（json/）とナビゲーションは network-first で鮮度優先、オフライン時はキャッシュ。
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return matchFromCache(cache, event.request).then(function (cachedResponse) {
        if (isOffline()) {
          if (cachedResponse) {
            return cachedResponse;
          }

          return Promise.reject(new Error('Offline and no cached response available.'));
        }

        return fetch(createNetworkRequest(event.request))
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.ok) {
              return updateCache(cache, event.request, networkResponse).then(function () {
                return networkResponse;
              });
            }

            return cachedResponse || networkResponse;
          })
          .catch(function (error) {
            if (cachedResponse) {
              return cachedResponse;
            }

            throw error;
          });
      });
    })
  );
});

// refresh cache
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (cacheName) {
              return cacheName !== CACHE_NAME;
            })
            .map(function (cacheName) {
              return caches.delete(cacheName);
            })
        );
      })
      .then(function () {
        return clients.claim();
      })
  );
});
