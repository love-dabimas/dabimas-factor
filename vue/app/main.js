/**
 * このファイルの役割:
 * - root app（new Vue）を実際に生成するエントリポイント。
 * - 実機デバッグ用のグローバルエラーハンドラ（error / unhandledrejection）
 *   を登録し、window.__debugAppInstance.notifyHorseDetailError に
 *   橋渡しする。
 * - new Vue(...) の実行を window.Dabimas.workspaceSync.boot() の解決後まで
 *   遅らせる（統合版仕様 §9.1）。boot() が解決した時点で localStorage は
 *   正しいアクティブ作業枠の内容になっており、
 *   window.Dabimas.workspaceSync.resolvedInitialScreen も確定しているため、
 *   本体側（vue/app/app-lifecycle.js・vue/app/methods/bootstrap.js）は
 *   一切変更せずに既存の起動シーケンス（c1→dbinitializer→c4）へそのまま
 *   接続できる。
 *
 * このファイルに置かない処理:
 * - オプションオブジェクトの組み立て（vue/app/app-options.js の仕事）。
 * - IndexedDB 初期化・移行判定そのもの（vue/logic/workspace-sync.js の仕事）。
 *
 * 分けている理由:
 * - index.html に new Vue({...}) を直接書くと変更箇所が広がるため、
 *   起動そのものだけをここにまとめる
 *   （docs/index-split-completion-plan.md Phase 4-11）。
 */
(function (window, Vue) {
  // 実機デバッグ用の一時計測: 通常は捕まえていない例外/rejectionも
  // 画面上部の赤いメッセージ欄（horseDetailError）に出して、devtoolsが無い
  // 端末でも原因文言を直接読めるようにする。
  //
  // ただし iOS Safari 等では cross-origin としてマスクされた
  // 「Script error.（filename/lineno 空）」など、原因が読めず対処もできない
  // 汎用エラーまで赤バナーに出てしまい通常利用の妨げになる。そこで画面への
  // バナー表示は window.Dabimas.debug === true のときだけに限定する
  // （既存の計測フラグと同じ運用: devtools から window.Dabimas.debug = true）。
  // console 出力は常に行い、devtools があれば原因を追える状態を保つ。
  var debugBannerEnabled = function () {
    return !!(window.Dabimas && window.Dabimas.debug);
  };
  var pushDebugBanner = function (message) {
    if (
      debugBannerEnabled() &&
      window.__debugAppInstance &&
      typeof window.__debugAppInstance.notifyHorseDetailError === "function"
    ) {
      window.__debugAppInstance.notifyHorseDetailError(message);
    }
  };
  window.addEventListener("error", function (event) {
    console.error("[global error]", event.message, event.filename, event.lineno);
    pushDebugBanner(
      "DEBUG error: " + (event.message || "unknown") + " @ " + (event.filename || "") + ":" + (event.lineno || "")
    );
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    console.error("[global rejection]", reason);
    pushDebugBanner("DEBUG rejection: " + msg);
  });
  // Vueが自前で捕まえて握りつぶす系（コンポーネントのメソッド/ライフサイクル/
  // レンダー内の同期例外）は上の window "error" では拾えないため、
  // Vue.config.errorHandler からも同じ通知先へ橋渡しする。
  Vue.config.errorHandler = function (err, vm, info) {
    console.error(err);
    pushDebugBanner(
      "DEBUG vue-error: " + (err && err.message ? err.message : String(err)) + (info ? " @ " + info : "")
    );
  };

  var bootPromise =
    window.Dabimas.workspaceSync && typeof window.Dabimas.workspaceSync.boot === "function"
      ? window.Dabimas.workspaceSync.boot()
      : Promise.resolve({ currentScreen: "category" });

  bootPromise.then(function () {
    window.__debugAppInstance = new Vue(window.Dabimas.app.createAppOptions());
  });
})(window, window.Vue);
