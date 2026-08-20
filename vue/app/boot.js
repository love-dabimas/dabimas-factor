/**
 * このファイルの役割:
 * - 初期ローディングアニメーションの表示・非表示制御
 *   （hideInitialLoader / scheduleInitialLoaderHide）。
 *   scheduleInitialLoaderHide は window.Dabimas.boot 経由で
 *   vue/app/app-lifecycle.js の mounted() からも呼ばれる。
 * - Service Worker の登録・更新（registerServiceWorker）。
 * - iOS で pinch ズームを無効化するための viewport meta タグ調整。
 * - Vue.config の設定と window.Dabimas.debug フラグの初期化。
 * - window.Dabimas.app.methods の足場（Phase 4 の各 methods/*.js が
 *   Object.assign 先として使う）。
 *
 * このファイルに置かない処理:
 * - root app 本体の組み立て・起動（vue/app/app-options.js, main.js の仕事）。
 *
 * 発見メモ（この移動にあわせて削除したもの）:
 * - index.html にはかつて INDEX_GENERATION_ASSIGNMENTS / INDEX_TO_ROW_NUMBER /
 *   ROWS_PER_SIDE / founder / factorMap / manualFactorOptions /
 *   MANUAL_INBREED_STORAGE_KEY というモジュールスコープ定数があった。
 *   Phase 1〜4 で root app のコード（data/computed/methods 等）が
 *   すべて vue/app/*.js や vue/components/*.js へ移り、各ファイルが
 *   window.Dabimas.constants.* / window.Dabimas.logic.* から自分自身の
 *   同名定数を再宣言するようになったため、index.html 側のこれらの宣言は
 *   完全に参照されなくなっていた（デッドコード）。Phase 4-12 でこの
 *   ファイルへ移す機会に、参照ゼロを確認した上で削除した
 *   （docs/index-split-completion-plan.md Phase 4-12）。
 *
 * 分けている理由:
 * - index.html を「HTML shell + script タグ + 最小限の boot スクリプト」
 *   まで薄くするため（docs/index-split-completion-plan.md 冒頭のゴール）。
 */
(function (window, Vue) {
  //loadingAnimation
  // 通常は保存データの復元完了と連動して隠れる（app-lifecycle.js の mounted）。
  // これは復元処理が万一ハングした場合だけに効く保険なので、遅い回線でも
  // 復元完了より先に発火して空の血統表を見せてしまわないよう長めに取る。
  const INITIAL_LOADER_FAILSAFE_MS = 10000;

  function hideInitialLoader() {
    const loader = document.getElementById("loader");
    if (!loader || loader.classList.contains("loaded")) {
      return;
    }
    loader.classList.add("loaded");
  }

  function scheduleInitialLoaderHide() {
    if (typeof window.requestAnimationFrame !== "function") {
      setTimeout(hideInitialLoader, 0);
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(hideInitialLoader);
    });
  }

  // vue/app/app-lifecycle.js の mounted() から、このモジュールスコープ関数を
  // 呼べるようにする（外部ファイルからは bare 参照できないため）。
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.boot = window.Dabimas.boot || {};
  window.Dabimas.boot.scheduleInitialLoaderHide = scheduleInitialLoaderHide;

  // 通常の非表示は app-lifecycle.js の mounted() が復元処理完了後に呼ぶ
  // scheduleInitialLoaderHide() 経由。window の load イベント基準のタイマーは
  // 復元完了より先に発火して空の血統表を見せてしまうため置かない。
  setTimeout(hideInitialLoader, INITIAL_LOADER_FAILSAFE_MS);

  // service workerの登録関係
  let swRegistrationPromise = null;

  function updateServiceWorker(registration) {
    if (!registration) {
      return Promise.resolve(null);
    }

    return registration
      .update()
      .then(function () {
        return registration;
      })
      .catch(function (err) {
        console.log("ServiceWorker update check failed: ", err);
        return registration;
      });
  }

  function registerServiceWorker() {
    if (
      !("serviceWorker" in navigator) ||
      !(location.protocol === "http:" || location.protocol === "https:") ||
      !navigator.onLine
    ) {
      return Promise.resolve(null);
    }

    if (!swRegistrationPromise) {
      swRegistrationPromise = navigator.serviceWorker
        .register("./service-worker.js", { updateViaCache: "none" })
        .then(function (registration) {
          console.log(
            "ServiceWorker registration successful with scope: ",
            registration.scope
          );
          return registration;
        })
        .catch(function (err) {
          console.log("ServiceWorker registration failed: ", err);
          swRegistrationPromise = null;
          return null;
        });
    }

    return swRegistrationPromise.then(function (registration) {
      return updateServiceWorker(registration);
    });
  }

  // 新しい Service Worker が有効化され、このページの制御を奪った瞬間に
  // 一度だけ自動リロードして、新しい JS/CSS を確実に反映する。
  // これが無いと skipWaiting で新SWが有効化されても、開いたままのページは
  // 旧 JS を実行し続け、デプロイしても「古い挙動」が残り続ける（更新未反映の主因）。
  // 初回インストール時（=読み込み時点で controller が無い）は既に最新を
  // 読み込んでいるためリロードしない。既に controller がある＝更新なので
  // そのときだけリロードする。
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    let reloadedForSwUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloadedForSwUpdate) {
        return;
      }
      reloadedForSwUpdate = true;
      window.location.reload();
    });
  }

  registerServiceWorker();

  var ua = navigator.userAgent.toLowerCase();
  var isiOS = ua.indexOf("iphone") > -1 || ua.indexOf("ipad") > -1;
  if (isiOS) {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      var viewportContent = viewport.getAttribute("content");
      viewport.setAttribute(
        "content",
        viewportContent + ", user-scalable=no"
      );
    }
  }

  // パフォーマンス最適化設定
  Vue.config.performance = true;
  Vue.config.productionTip = false;

  // 選択のたびに走る計測ログ（onChangeMain等のconsole.time）はここで止める。
  // 計測したい時だけ devtools から window.Dabimas.debug = true にして再実行する。
  window.Dabimas.debug = window.Dabimas.debug || false;

  // Phase 4（root app 分割）の足場。methods はここへ段階的に外部化していく
  // （vue/app/methods/*.js が Object.assign 先として使う）。
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};
})(window, window.Vue);
