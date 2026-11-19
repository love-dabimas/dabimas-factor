/**
 * このファイルの役割: 血統表のクロスのハートの色分け（今の色／旧ダビふぁくの色）を覚えて、
 * <html> のクラスに反映する。
 * このファイルに置かない処理: 色そのもの（明るい側は css/unified.css、暗い側は css/dark.css）、
 * ハートを押せるかどうかの決まり（vue/logic/pedigree/pedigree-selection.js）。
 *
 * 今の色分けは 赤＝自動で決まったクロス、紫＝至高、青＝手で指定。
 * 旧ダビふぁくの色は 灰色＝自動で決まったクロス（至高も灰色）、ピンク＝手で指定。
 * 旧の色を選んだときだけ html.dabimas-heart-classic を付ける。
 *
 * 保存先は localStorage。表示テーマ（vue/logic/theme.js）と同じく、最初の描画より前に当てる。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};

  var STORAGE_KEY = "dabimasHeartColor";
  var CLASSIC_CLASS = "dabimas-heart-classic";
  var MODES = ["modern", "classic"];
  // 決めていない人には今の色分けを出す。
  var DEFAULT_MODE = "modern";

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return MODES.indexOf(value) === -1 ? DEFAULT_MODE : value;
    } catch (error) {
      // プライベートモードなどで localStorage が使えないことがある。
      return DEFAULT_MODE;
    }
  }

  function apply(mode) {
    var root = window.document.documentElement;
    if (!root) return mode;
    root.classList.toggle(CLASSIC_CLASS, mode === "classic");
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

  window.Dabimas.logic.heartColor = {
    MODES: MODES,
    DEFAULT_MODE: DEFAULT_MODE,
    get: get,
    set: set,
    apply: apply,
  };

  // 最初の描画より前に当てたいので、読み込まれた時点で実行する。
  apply(readStored());
})(window);
