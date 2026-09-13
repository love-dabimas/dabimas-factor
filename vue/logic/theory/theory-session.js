// 母ごとの候補判定。盤面の準備は呼び出し側で一度だけ行う。
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.theory = window.Dabimas.logic.theory || {};

  var theory = window.Dabimas.logic.theory;

  function linesAt(board, cells) {
    return cells.map(function (cell) {
      var entry = board[cell];
      return entry && typeof entry.parentLine === "string" ? entry.parentLine : "";
    });
  }

  function prepareMareLines(board) {
    return linesAt(board, [1, 3, 5, 7]);
  }

  function prepareSireOperands(board) {
    return {
      omoshiro: prepareMareLines(board),
      migoto: linesAt(board, [9, 11, 13, 15]),
    };
  }

  // 入力の配列は候補一覧の寿命のあいだ不変として共有する。
  function createTheorySession(input) {
    var sires = input.sires;
    var dam = [input.damLines, input.damLines.slice()];
    var size = sires.length;
    var ready = new Uint8Array(size);
    var results = new Array(size);
    var priority = window.Dabimas.constants.breedingTheories.PRIORITY;

    function get(index) {
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        throw new RangeError("候補の添字が範囲外です: " + index);
      }
      if (!ready[index]) {
        var sire = sires[index];
        var matched = theory.detectMatchedTheories([sire.omoshiro, sire.migoto], dam, {});
        results[index] = {
          matched: matched,
          displayed: theory.selectDisplayedTheory(matched, priority),
        };
        ready[index] = 1;
      }
      return results[index];
    }

    function evaluateAll() {
      for (var i = 0; i < size; i += 1) get(i);
      return results;
    }

    function indexesFor(theoryKey) {
      var indexes = [];
      evaluateAll().forEach(function (result, index) {
        if (result.matched.indexOf(theoryKey) !== -1) indexes.push(index);
      });
      return indexes;
    }

    function countsByTheory() {
      var counts = {};
      Object.keys(priority).forEach(function (key) { counts[key] = 0; });
      evaluateAll().forEach(function (result) {
        result.matched.forEach(function (key) { counts[key] += 1; });
      });
      return counts;
    }

    return { get: get, evaluateAll: evaluateAll, indexesFor: indexesFor,
      countsByTheory: countsByTheory, size: size };
  }

  theory.prepareSireOperands = prepareSireOperands;
  theory.prepareMareLines = prepareMareLines;
  theory.createTheorySession = createTheorySession;
})(window);
