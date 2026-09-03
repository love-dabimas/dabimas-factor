/**
 * 配合理論の成立判定と、表示する理論の選択を提供する。
 * Sire, Dam は [[面白系統], [見事系統]] の形式で受け取る。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.theory = window.Dabimas.logic.theory || {};

  // A と B に共通する要素を、少ない側の出現数まで数える。
  function countCommonElements(A, B) {
    var uniqueCommonElements = Array.from(
      new Set(A.filter(function (element) {
        return B.indexOf(element) !== -1;
      }))
    );
    var countA = uniqueCommonElements.reduce(function (count, element) {
      return count + A.filter(function (a) { return a === element; }).length;
    }, 0);
    var countB = uniqueCommonElements.reduce(function (count, element) {
      return count + B.filter(function (b) { return b === element; }).length;
    }, 0);

    return Math.min(countA, countB);
  }

  function countUniqueElements(A, B) {
    return Array.from(new Set(A.concat(B))).length;
  }

  // 両方に nodeId があれば同一ノードで照合し、片方でも無ければ名前へ縮退する。
  function isMiracleMatch(a, b) {
    if (!a || !b) return false;
    if (typeof a.nodeId === "string" && typeof b.nodeId === "string") {
      return a.nodeId === b.nodeId;
    }
    return a.name != null && a.name === b.name;
  }

  // 成立している理論をすべて返す。表示優先順位はここでは扱わない。
  function detectMatchedTheories(Sire, Dam, context) {
    var safeContext = context || {};
    var selected = safeContext.selected || [];
    var matched = [];
    var interestingCount = countUniqueElements(Sire[0], Dam[0]);
    var commonCount = countCommonElements(Sire[1], Dam[0]);
    var interesting = interestingCount >= 7;
    var well = commonCount === 3;
    var wonderful = commonCount === 4;
    var perfect = wonderful && interesting;

    if (safeContext.dangerous === true) matched.push("DANGEROUS");
    if ((safeContext.sameNameSpecialChecks || []).length > 0) matched.push("SUPREME");
    if (interesting) matched.push("INTERESTING");
    if (well) matched.push("WELL");
    if (wonderful) matched.push("WONDERFUL");
    if (perfect) matched.push("PERFECT");

    // 見事・完璧・超完璧の式は従来式と数学的に同値なため変更しない。
    if (wonderful && interestingCount === 8) matched.push("SUPER_PERFECT");

    if (perfect) {
      var motherThirdGeneration = selected[19];
      var miracleMatchCount = [4, 5, 6, 7].filter(function (index) {
        return isMiracleMatch(selected[index], motherThirdGeneration);
      }).length;
      if (miracleMatchCount === 1) matched.push("MIRACLE");
    }

    return matched;
  }

  // master の priority 数値だけで表示対象を一つ選ぶ。危険専用の例外分岐は持たない。
  function selectDisplayedTheory(matched, priorityTable) {
    var selectedTheory = null;
    var selectedPriority = -Infinity;

    matched.forEach(function (theoryName) {
      var priority = priorityTable[theoryName];
      if (typeof priority === "number" && priority > selectedPriority) {
        selectedTheory = theoryName;
        selectedPriority = priority;
      }
    });

    return selectedTheory;
  }

  // 従来 API は CSS クラス名を返す薄いラッパとして維持する。
  function compatibility(Sire, Dam, context) {
    var definitions = window.Dabimas.constants.breedingTheories;
    var matched = detectMatchedTheories(Sire, Dam, context);
    var displayed = selectDisplayedTheory(matched, definitions.PRIORITY);
    return displayed ? definitions.CLASS_NAME[displayed] : "";
  }

  window.Dabimas.logic.theory.countCommonElements = countCommonElements;
  window.Dabimas.logic.theory.countUniqueElements = countUniqueElements;
  window.Dabimas.logic.theory.detectMatchedTheories = detectMatchedTheories;
  window.Dabimas.logic.theory.selectDisplayedTheory = selectDisplayedTheory;
  window.Dabimas.logic.theory.compatibility = compatibility;
})(window);
