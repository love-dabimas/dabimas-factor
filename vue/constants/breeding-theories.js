// 配合理論の表示優先度と、画面表示用 CSS クラス名の対応。
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.constants = window.Dabimas.constants || {};

  window.Dabimas.constants.breedingTheories = {
    PRIORITY: Object.freeze({
      INTERESTING: 1,
      WELL: 2,
      WONDERFUL: 3,
      PERFECT: 500,
      SUPER_PERFECT: 600,
      MIRACLE: 700,
      SUPREME: 800,
      DANGEROUS: 999,
    }),
    // 画面に文字で出すときの名前（工程診断の結果パネルなど）。
    // 血統表ヘッダの理論表示は CSS クラスの背景画像なので、こちらは使わない。
    DISPLAY_NAME: Object.freeze({
      INTERESTING: "面白い配合",
      WELL: "よくできた配合",
      WONDERFUL: "見事な配合",
      PERFECT: "完璧な配合",
      SUPER_PERFECT: "超完璧な配合",
      MIRACLE: "奇跡の配合",
      SUPREME: "至高の配合",
      DANGEROUS: "危険な配合",
    }),
    CLASS_NAME: Object.freeze({
      INTERESTING: "theory_01",
      WONDERFUL: "theory_02",
      WELL: "theory_03",
      PERFECT: "theory_04",
      SUPER_PERFECT: "theory_05",
      MIRACLE: "theory_06",
      SUPREME: "theory_07",
      DANGEROUS: "theory_08",
    }),
  };
})(window);
