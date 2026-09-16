// 軽い判定でチップが立った候補だけを診断する。入力mapは変更しない。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};
  // candidatesは { key, board } の配列。boardは16セルの種牡馬盤面。
  // options.damLines には buildTheoryMap に渡したものと同じ母の4枠を入れる。
  logic.musume.refineTheoryMap = function (map, candidates, mareBoard, options) {
    var boards = new Map(candidates.map(function (candidate) { return [candidate.key, candidate.board]; }));
    var miracle = map.chips.filter(function (chip) { return chip.key === "MIRACLE"; })[0];
    var dam = options.damLines;
    var diagnosedCount = 0;
    var entries = [];
    map.entries.forEach(function (entry) {
      if (!entry[1]) return;
      var board = boards.get(entry[0]);
      if (!board) return;
      diagnosedCount += 1;
      var diagnosis = logic.plan.diagnoseStep(board, mareBoard, options);
      if (diagnosis.dangerous) return;
      var bits = entry[1];
      // 奇跡は盤面が要る（compatibility.js の isMiracleMatch が selected[4..7] と
      // selected[19] を見る）。軽い判定は盤面を持たないので必ず落ちる。
      // ここは盤面があるので、奇跡だけ判定し直す。
      // 奇跡は完璧が前提なので、取りこぼしはない（完璧ならビットが立っていて、
      // この関数に回ってくる）。
      if (miracle && dam) {
        var lines = logic.theory.prepareSireOperands(board);
        var matched = logic.theory.detectMatchedTheories(
          [lines.omoshiro, lines.migoto], [dam, dam], diagnosis);
        bits = matched.indexOf("MIRACLE") === -1
          ? bits & ~miracle.bit
          : bits | miracle.bit;
      }
      entries.push([entry[0], bits]);
    });
    return { map: Object.assign({}, map, { entries: entries }), diagnosedCount: diagnosedCount };
  };
})(window);
