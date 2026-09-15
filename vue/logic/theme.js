/**
 * このファイルの役割: 明るい／暗いの選択を覚えて、<html> のクラスに反映する。
 * このファイルに置かない処理: 色そのもの（css/dark.css）、画面の組み立て。
 *
 * 暗い側の見た目は css/dark.css が html.dabimas-dark の下だけで効くように
 * 書いてある。ここはそのクラスを付け外しするだけにする。
 *
 * 保存先は localStorage。IndexedDB だと読み出しが非同期になり、最初の描画が
 * 明るいまま一瞬出てしまう（チラつく）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};

  var STORAGE_KEY = "dabimasTheme";
  var DARK_CLASS = "dabimas-dark";
  var MODES = ["dark", "light", "auto"];
  // これまで黒ベースで作ってきたので、決めていない人には暗い側を出す。
  var DEFAULT_MODE = "dark";

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return MODES.indexOf(value) === -1 ? DEFAULT_MODE : value;
    } catch (error) {
      // プライベートモードなどで localStorage が使えないことがある。
      return DEFAULT_MODE;
    }
  }

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function isDark(mode) {
    return mode === "dark" || (mode === "auto" && prefersDark());
  }

  function apply(mode) {
    var root = window.document.documentElement;
    if (!root) return mode;
    root.classList.toggle(DARK_CLASS, isDark(mode));
    return mode;
  }

  function get() {
    return readStored();
  }

  function set(mode) {
    var next = MODES.indexOf(mode) === -1 ? DEFAULT_MODE : mode;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // 保存できなくても、この画面では切り替わるようにする。
    }
    return apply(next);
  }

  function boot() {
    var mode = readStored();
    apply(mode);
    // 「端末に合わせる」のときは、OS 側の切り替えにも追従する。
    if (window.matchMedia) {
      var query = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (readStored() === "auto") apply("auto");
      };
      if (query.addEventListener) query.addEventListener("change", onChange);
      else if (query.addListener) query.addListener(onChange);
    }
    return mode;
  }

  window.Dabimas.logic.theme = {
    MODES: MODES,
    DEFAULT_MODE: DEFAULT_MODE,
    get: get,
    set: set,
    apply: apply,
    boot: boot,
    isDark: isDark,
  };

  // 最初の描画より前に当てたいので、読み込まれた時点で実行する。
  boot();
})(window);
