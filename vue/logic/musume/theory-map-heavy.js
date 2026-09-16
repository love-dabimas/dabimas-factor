// 分割計算の1回分。入力mapは変更せず、完成前の結果を外へ漏らさない。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};
  // boardsは16セルの配列。options.candidateKeysが同じ添字の送信キーを持つ。
  logic.musume.refineTheoryMapStep = function (state) {
    var entries = new Map(state.map.entries);
    var supreme = state.map.chips.find(function (chip) { return chip.key === "SUPREME"; });
    var cursor = state.cursor;
    var end = Math.min(state.boards.length, cursor + Math.max(1, state.limit || 1));
    for (; cursor < end; cursor += 1) {
      var board = state.boards[cursor];
      var key = state.options.candidateKeys[cursor];
      if (!board) { entries.delete(key); continue; }
      var diagnosis = logic.plan.diagnoseStep(board, state.mareBoard, state.options);
      if (diagnosis.dangerous) entries.delete(key);
      else if (diagnosis.sameNameSpecialChecks.length) {
        entries.set(key, (entries.get(key) || 0) | supreme.bit);
      }
    }
    var done = cursor === state.boards.length;
    return { cursor: cursor, done: done, map: Object.assign({}, state.map, {
      entries: Array.from(entries),
      chips: state.map.chips.map(function (chip) {
        return Object.assign({}, chip, { pending: chip.key === "SUPREME" && !done });
      }),
    }) };
  };
})(window);
