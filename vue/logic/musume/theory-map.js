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
      var matched = session.get(index).matched;
      var bits = chips.reduce(function (bits, chip) {
        return !chip.pending && matched.includes(chip.key) ? bits | chip.bit : bits;
      }, 0);
      if (bits) entries.push([row[0], bits]);
    });
    return { type: "dabimas:theory-map", v: 1, mareKey: input.mareKey, chips: chips, entries: entries };
  }
  logic.musume.buildTheoryMap = buildTheoryMap;
})(window);
