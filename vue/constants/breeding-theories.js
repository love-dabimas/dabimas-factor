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
