/**
 * このファイルの役割:
 * - root app が持つ「32行ぶんの状態の配列」（selected / factorName / styleFactorClasses 等）から、
 *   1行だけを取り出して pedigree-row にそのまま渡せる形（rowState）に変換する。
 * - pedigree-row 自身が root app の配列名（selected、factorName、styleFactorClasses...）を
 *   直接知らなくて済むように、その変換をここに1箇所へ集める。
 * - 因子CSS・親系統CSS・ハートボタンCSSの「値が空のときの既定色」判定
 *   （行位置ごとのテーマ色 = vue/logic/pedigree/pedigree-css.js の getCss）も、
 *   ここで最終的な文字列まで確定させる。pedigree-row 側では分岐しない。
 *
 * このファイルに置かない処理:
 * - Vue state への書き込み、保存処理、DOM操作。
 *
 * 分けている理由:
 * - 元の pedigree-row は styleParentLineClasses / parentLines / styleInbreedButtonClasses /
 *   isInbreedButtonClicked / styleFactorClasses / factorName / indexGenerationAssignments /
 *   getCss という7〜8個の生配列＋関数を props で直接受け取り、既定値フォールバックの
 *   判定ロジックも自分で持っていた。1行の表示に必要な値をまとめて先に作っておくことで、
 *   pedigree-row の props を row / rowState / horseOptions / displayOptions に絞れる。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.pedigree = window.Dabimas.logic.pedigree || {};

  // index（0〜31）1つぶんの rowState を作る。
  // arrays には root app が持つ32行ぶんの配列一式を渡す。
  function buildRowState(index, arrays) {
    var getCss = window.Dabimas.logic.pedigree.getCss;
    var themeClass = getCss(index);
    var isCategoryMode = Number(arrays.dispCategory) % 2 === 1;
    var categoryColorClass = "";
    if (isCategoryMode) {
      var sireLineColors = window.Dabimas.logic.sireLineColors;
      categoryColorClass = sireLineColors.colorClassFor(
        sireLineColors.colorIndexForName(
          (arrays.category || [])[index],
          arrays.sireLineColors
        )
      );
    }
    var fallbackThemeClass = isCategoryMode ? categoryColorClass : themeClass;
    // 因子・親系統・ハートボタン、どのCSSも「値が無いときはこの行位置の
    // テーマ色にフォールバックする」という共通ルールを持つため、ここで1回だけ作る。
    var fallbackFactorClass = fallbackThemeClass + " styleFactorClassMain";

    var selectedEntry = (arrays.selected || [])[index];
    var selectedHorseName =
      selectedEntry && typeof selectedEntry.name === "string"
        ? selectedEntry.name.trim()
        : "";

    var rawFactorClasses = (arrays.styleFactorClasses && arrays.styleFactorClasses[index]) || [];
    var factorClasses = [0, 1, 2].map(function (i) {
      var value = rawFactorClasses[i];
      var hasFactorColor =
        typeof value === "string" && /^f\d{2}(?:\s|$)/.test(value.trim());
      return value && value !== "00" && (!isCategoryMode || hasFactorColor)
        ? value
        : fallbackFactorClass;
    });

    var rawFactorNames = (arrays.factorName && arrays.factorName[index]) || [];
    var factorTexts = [0, 1, 2].map(function (i) {
      return rawFactorNames[i] || "";
    });

    var rawParentLineClass = arrays.styleParentLineClasses
      ? arrays.styleParentLineClasses[index]
      : "";
    var parentLineText = (arrays.parentLines || [])[index] || "";
    var hasParentLine =
      typeof parentLineText === "string" && parentLineText.trim() !== "";
    var parentLineClass =
      rawParentLineClass &&
      rawParentLineClass.trim() !== "" &&
      (!isCategoryMode || hasParentLine)
        ? rawParentLineClass
        : fallbackThemeClass + " styleParentLine";

    var rawInbreedButtonClass = arrays.styleInbreedButtonClasses
      ? arrays.styleInbreedButtonClasses[index]
      : "";
    var hasInbreedClass =
      typeof rawInbreedButtonClass === "string" &&
      rawInbreedButtonClass.split(/\s+/).indexOf("inbreed") !== -1;
    var inbreedButtonClass =
      rawInbreedButtonClass &&
      rawInbreedButtonClass.trim() !== "" &&
      (!isCategoryMode || hasInbreedClass)
        ? rawInbreedButtonClass
        : fallbackThemeClass + " styleInbreedButton";

    var rawInbreedState = arrays.isInbreedButtonClicked
      ? arrays.isInbreedButtonClicked[index]
      : 0;

    // 工程診断で危険と出た工程の種牡馬セル。診断結果の index 一覧を見るだけで、
    // ここで危険判定はやり直さない（仕様 §16.2）。
    var planDangerCellIndexes = arrays.planDangerCellIndexes || [];

    return {
      index: index,
      planDanger: planDangerCellIndexes.indexOf(index) !== -1,
      selectedHorseName: selectedHorseName,
      factorLocked: !!(selectedEntry && selectedEntry.factorLocked),
      generationLabel: (arrays.indexGenerationAssignments || [])[index] || "",
      // 世代ラベルのセルは因子の有無に関係なく、常に行位置のテーマ色を使う
      // （元の index.html でも getCss(config.index) を直接使っていた）。
      generationCellClass: fallbackFactorClass,
      parentLineText: parentLineText,
      parentLineClass: parentLineClass,
      inbreedButtonState: typeof rawInbreedState === "number" ? rawInbreedState : 0,
      inbreedButtonClass: inbreedButtonClass,
      rowColorClass: (arrays.dispColor || [])[index] || "",
      factorTexts: factorTexts,
      factorClasses: factorClasses,
      categoryColorClass: categoryColorClass,
    };
  }

  // rows（rowConfigs か rowConfigsBloodmare）と同じ順番・同じ長さで rowState の配列を作る。
  function buildRowStates(rows, arrays) {
    return rows.map(function (row) {
      return buildRowState(row.index, arrays);
    });
  }

  window.Dabimas.logic.pedigree.buildRowState = buildRowState;
  window.Dabimas.logic.pedigree.buildRowStates = buildRowStates;
})(window);
