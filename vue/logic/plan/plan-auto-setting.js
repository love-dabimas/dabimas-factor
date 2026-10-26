/**
 * このファイルの役割: 「工程診断を自動で行う」の設定を覚える。
 * このファイルに置かない処理: 診断そのもの（vue/logic/plan/plan-diagnosis.js）と、
 * 自動で走らせる段取り（vue/app/methods/plan-diagnosis-ui.js）。
 *
 * 保存先は localStorage。起動直後の最初の判定より前に読めるよう、同期で読める
 * 場所にしておく（表示テーマ vue/logic/theme.js と同じ考え方）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.plan = window.Dabimas.logic.plan || {};

  var STORAGE_KEY = "dabimasPlanAutoDiagnosis";
  // 左上の工程診断ボタンを無くしたので、決めていない人には自動で出す。
  var DEFAULT_ENABLED = true;

  function get() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      if (value === "on") return true;
      if (value === "off") return false;
      return DEFAULT_ENABLED;
    } catch (error) {
      // プライベートモードなどで localStorage が使えないことがある。
      return DEFAULT_ENABLED;
    }
  }

  function set(enabled) {
    var next = !!enabled;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch (error) {
      // 保存できなくても、この画面では切り替わるようにする。
    }
    return next;
  }

  window.Dabimas.logic.plan.autoSetting = {
    DEFAULT_ENABLED: DEFAULT_ENABLED,
    get: get,
    set: set,
  };
})(window);
