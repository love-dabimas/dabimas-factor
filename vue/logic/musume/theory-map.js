// 候補の系統だけで判定し、ダビ娘へ送る疎なビット表を作る。保存・通信はしない。
(function (window) {
  var logic = window.Dabimas.logic;
  logic.musume = logic.musume || {};
  function buildTheoryMap(input) {
    var constants = window.Dabimas.constants.breedingTheories;
    var keys = Object.keys(constants.PRIORITY).filter(function (key) {
      return ["PERFECT", "SUPER_PERFECT", "MIRACLE"].includes(key);
    }).sort(function (a, b) { return constants.PRIORITY[a] - constants.PRIORITY[b]; });
    var chips = keys.map(function (key, index) {
      return { key: key, label: constants.DISPLAY_NAME[key].replace(/な配合$|の配合$/, ""),
        bit: 1 << index, pending: false };
    });
    var rows = input.rows.concat((input.customHorses || []).map(function (horse) {
      return [horse.key, horse.paternalT, horse.paternalHt, horse.paternalJik, horse.paternalMig];
    })).filter(function (row) { return row[0].endsWith("-0"); });
    var session = logic.theory.createTheorySession({ damLines: input.damLines,
      sires: rows.map(function (row) {
        return { omoshiro: [row[1], row[3].slice(0, 2), row[2], row[3].slice(2, 4)],
          migoto: row[4].match(/.{2}/g) || [] };
      }) });
    var entries = [];
    rows.forEach(function (row, index) {
      var bits = logic.musume.chipBitFor(session.get(index).matched, chips);
      if (bits) entries.push([row[0], bits]);
    });
    return { type: "dabimas:theory-map", v: 1, mareKey: input.mareKey, chips: chips, entries: entries };
  }
  // 配合理論は 完璧 < 超完璧 < 奇跡 の序列があり（constants の PRIORITY）、
  // 1つの組み合わせに対して本体が出す名前は selectDisplayedTheory が選ぶ1つだけ。
  // チップも同じにする。成立した理論を全部立てると、奇跡の馬が完璧にも数えられて
  // 「完璧10頭・奇跡10頭」のように中身が同じ2つの束ができてしまう。
  // 至高（チップに無い）と危険は、ここでは無視して残りの中から一番強いものを選ぶ。
  // 危険はこのあと refineTheoryMap が落とす。
  logic.musume.chipBitFor = function (matched, chips) {
    var priority = window.Dabimas.constants.breedingTheories.PRIORITY;
    var best = null;
    chips.forEach(function (chip) {
      if (chip.pending || matched.indexOf(chip.key) === -1) return;
      if (!best || priority[chip.key] > priority[best.key]) best = chip;
    });
    return best ? best.bit : 0;
  };

  logic.musume.buildTheoryMap = buildTheoryMap;
})(window);
