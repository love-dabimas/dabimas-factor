// 詳細取得・盤面展開は呼び出し側の責務。ダビ娘のカード用データへ変換する。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};

  function buildCustomHorsePayload(horse, board) {
    function line(cell) { return board[cell].parentLine || ""; }
    function factorCodes(factors) {
      return (factors || []).map(function (factor) {
        // ダビふぁくの保存値は漢字。空欄はダビ娘でも空欄のまま渡す。
        return factor ? logic.factor.factorMap.get(factor) || "" : "";
      });
    }
    return {
      key: logic.musumeLink.toMusumeKey(horse.id, horse.sex),
      gender: horse.sex, name: horse.name || "", category: horse.son || "",
      categoryHt: board[3].son || "",
      paternalT: line(1), paternalHt: line(5), paternalJik: line(3) + line(7),
      paternalMig: (horse.sex === "1" ? [9, 13, 15] : [9, 11, 13, 15]).map(line).join(""),
      factors: factorCodes(horse.factors),
      // ダビ娘の t, tt, ttt, tttt, ttht, ... hhht と同じ深さ優先順。
      pedigree: logic.pedigree.DESCENDANT_SLOTS.map(function (cell) {
        var entry = board[cell];
        return [entry.name || "", entry.son || "", line(cell), factorCodes(entry.factors)];
      }),
    };
  }
  logic.musume.buildCustomHorsePayload = buildCustomHorsePayload;
})(window);
