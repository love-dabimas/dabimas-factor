// 軽い判定でチップが立った候補だけを診断する。入力mapは変更しない。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};
  // candidatesは { key, board } の配列。boardは16セルの種牡馬盤面。
  logic.musume.refineTheoryMap = function (map, candidates, mareBoard, options) {
    var boards = new Map(candidates.map(function (candidate) { return [candidate.key, candidate.board]; }));
    var diagnosedCount = 0;
    var entries = map.entries.filter(function (entry) {
      if (!entry[1]) return false;
      var board = boards.get(entry[0]);
      if (!board) return false;
      diagnosedCount += 1;
      return !logic.plan.diagnoseStep(board, mareBoard, options).dangerous;
    });
    return { map: Object.assign({}, map, { entries: entries }), diagnosedCount: diagnosedCount };
  };
})(window);
