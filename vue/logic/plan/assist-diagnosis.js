// 本体と同じ判定・集計を、選択した1組の盤面に適用する。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.plan.diagnoseStep = function (sireBoard, mareBoard, options) {
    options = options || {};
    var selected = logic.plan.buildStepSelected(sireBoard, mareBoard);
    var cross = logic.inbreed.judgeInbreed(selected, options.inbreedExceptions || [],
      options.nodeTable || null, options.resolver || null);
    var counts = logic.inbreed.buildInbreedFactorCounts(
      cross.sameNameGroups, cross.siblingGroups, cross.inbreedList || new Array(32).fill(null));
    var factorCd = selected.map(function (cell) {
      return [0, 1, 2].map(function (index) {
        return logic.factor.factorMap.get(cell && cell.factors && cell.factors[index]) || "00";
      });
    });
    return {
      nitro: logic.factor.dispFactorCounts(factorCd),
      crossFactor: logic.factor.dispFactorCounts(counts.factorCd),
      crosses: cross.crosses.map(function (item) {
        var names = item.occurrences.map(function (occurrence) {
          var cell = selected[occurrence.index];
          if (Number.isInteger(occurrence.index) && cell) return cell.name;
          var node = options.nodeTable && options.nodeTable.getNode(occurrence.nodeId);
          var pedigree = node && options.nodeTable.getPedigree(node.pedigreeId);
          return pedigree ? pedigree.name : null;
        }).filter(Boolean);
        return Object.assign({}, item, { name: Array.from(new Set(names)).join(" × ") || item.representativeNodeId });
      }), count: cross.count, dangerous: cross.dangerous === true,
      sameNameSpecialChecks: cross.sameNameSpecialChecks, selected: selected,
      // クロスが成立しているセル（0〜31）。本体の血統表が馬名を赤くするのに
      // 使っている dispColor="inbreed" の対象と同じもの。
      crossCellIndexes: cross.inbreedColorIndexes || [],
    };
  };
})(window);
