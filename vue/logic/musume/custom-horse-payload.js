// 詳細取得・盤面展開は呼び出し側の責務。ダビ娘のカード用データへ変換する。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};

  // ダビ娘の血統表は、理論に使うセルにだけ系統コードを持つ。種牡馬は面白4つ
  // （1・3・5・7）と見事4つ（9・11・13・15）の8つ、繁殖牝馬は面白4つだけ
  // （見事は血統表側に持たない。設計書 §1.3）。全部に入れるとマスターの馬と
  // カードの見た目が変わるので、ここで合わせる。実データ2,979頭で確認済み。
  var LINE_CELLS = { "0": [1, 3, 5, 7, 9, 11, 13, 15], "1": [1, 3, 5, 7] };

  function buildCustomHorsePayload(horse, board) {
    function line(cell) { return board[cell].parentLine || ""; }
    var lineCells = LINE_CELLS[horse.sex] || LINE_CELLS["0"];
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
      // 盤面セル3が Paternal_ht、セル5・7が Paternal_jik（設計書 §1.2 の訂正）。
      paternalT: line(1), paternalHt: line(3), paternalJik: line(5) + line(7),
      paternalMig: (horse.sex === "1" ? [9, 13, 15] : [9, 11, 13, 15]).map(line).join(""),
      factors: factorCodes(horse.factors),
      // ダビ娘の t, tt, ttt, tttt, ttht, ... hhht と同じ深さ優先順。
      pedigree: logic.pedigree.DESCENDANT_SLOTS.map(function (cell) {
        var entry = board[cell];
        return [entry.name || "", entry.son || "",
          lineCells.indexOf(cell) === -1 ? "" : line(cell), factorCodes(entry.factors)];
      }),
    };
  }
  logic.musume.buildCustomHorsePayload = buildCustomHorsePayload;
})(window);
