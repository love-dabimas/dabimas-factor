/**
 * このファイルの役割: スマホの血統表の馬名の大きさ（大／小）を覚えて、<html> のクラスに反映する。
 * このファイルに置かない処理: 大きさそのもの（css/mobile.css の .exp-mobile-horse-text）、画面の組み立て。
 *
 * 馬名の大きさは行の高さから決めている（大は × 0.70、小は × 0.64）。ここは
 * 小のときに html.dabimas-name-small を付けるだけにする。
 *
 * 保存先は localStorage。表示テーマ（vue/logic/theme.js）と同じく、最初の描画より前に
 * 当てて、開いた瞬間に大きさが切り替わって見えないようにする。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};

  var STORAGE_KEY = "dabimasNameSize";
  var SMALL_CLASS = "dabimas-name-small";
  var SIZES = ["large", "small"];
  // 大は長い名前（★１薄め…）の後ろが切れやすいので、決めていない人には小を出す。
  var DEFAULT_SIZE = "small";

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return SIZES.indexOf(value) === -1 ? DEFAULT_SIZE : value;
    } catch (error) {
      // プライベートモードなどで localStorage が使えないことがある。
      return DEFAULT_SIZE;
    }
  }

  function apply(size) {
    var root = window.document.documentElement;
    if (!root) return size;
    root.classList.toggle(SMALL_CLASS, size === "small");
    return size;
  }

  function get() {
    return readStored();
  }

  function set(size) {
    var next = SIZES.indexOf(size) === -1 ? DEFAULT_SIZE : size;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // 保存できなくても、この画面では切り替わるようにする。
    }
    return apply(next);
  }

  window.Dabimas.logic.nameSize = {
    SIZES: SIZES,
    DEFAULT_SIZE: DEFAULT_SIZE,
    get: get,
    set: set,
    apply: apply,
  };

  // 最初の描画より前に当てたいので、読み込まれた時点で実行する。
  apply(readStored());
})(window);
