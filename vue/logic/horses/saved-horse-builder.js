(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.horses = window.Dabimas.logic.horses || {};

  var DESCENDANT_CELL_IDS = [0, 1, 2, 4, 5, 3, 6, 7, 17, 18, 20, 21, 19, 22, 23];

  // 1文字バッジ（天性・非凡・因名祭・エディット種牡馬・自家製）の判定に使う
  // フィールド。vue/logic/horses/horse-search.js の getHorseBadges が見る値で、
  // これを descendants に持たせないと、保存した配合を選び直したときに
  // 「保存前は1行目に出ていたバッジが2行目に降りた瞬間に消える」ことになる。
  // id / customHorseId / detailChunk のような「実体を引く鍵」は、祖先セルに
  // 持たせると detail 解決の分岐（horse-loading.js の ensureHorseDetail）と
  // 紛らわしいので写さない。
  var BADGE_FIELDS = ["source", "sex", "nature", "rare", "abilityType", "categoryIcon"];

  function pickBadgeFields(cell) {
    var picked = {};
    for (var i = 0; i < BADGE_FIELDS.length; i++) {
      var key = BADGE_FIELDS[i];
      var value = cell[key];
      if (value !== undefined && value !== null && value !== "") {
        picked[key] = value;
      }
    }
    return picked;
  }

  // ownFactorsInput: 保存する馬「本人」に付与する因子名の配列（最大2つ）。
  // 種牡馬保存時に配合保存ダイアログから渡される（因子付与ダイアログと同じ
  // 短速底長堅難）。省略・空配列なら従来どおり因子なし。
  function buildSavedHorseRecord(kind, title, cells, ownFactorsInput) {
    if (kind !== "stallion" && kind !== "broodmare") {
      throw new Error("保存種別が不正です");
    }
    if (!Array.isArray(cells)) {
      throw new Error("血統データが不正です");
    }

    // 本人因子は右詰めで格納する（DB馬の factors 配列と同じ並び。例: ["","難","底"]）。
    // 要件: 「先頭に設定した因子を右→中→左と右詰め」。すなわち選択順の先頭を
    // 右端スロット(2)へ、次を中央(1)へ置く。最大2スロット・重複/空は除外。
    var ownFactors = ["", "", ""];
    if (Array.isArray(ownFactorsInput)) {
      var picked = [];
      for (var fi = 0; fi < ownFactorsInput.length && picked.length < 2; fi++) {
        var f = ownFactorsInput[fi];
        var t = typeof f === "string" ? f.trim() : "";
        if (t && picked.indexOf(t) === -1) {
          picked.push(t);
        }
      }
      for (var pi = 0; pi < picked.length; pi++) {
        ownFactors[2 - pi] = picked[pi];
      }
    }

    var descendants = DESCENDANT_CELL_IDS.map(function (cellId) {
      var cell = cells[cellId];
      if (!cell) {
        throw new Error("血統データが不足しています: cell " + cellId);
      }
      return Object.assign(pickBadgeFields(cell), {
        name: cell.name,
        subName: cell.subName || "",
        parentLine: cell.parentLine || "",
        factors: Array.isArray(cell.factors)
          ? cell.factors.slice()
          : ["", "", ""],
        factorLocked: true,
      });
    });

    var sire = cells[0];
    return {
      id: "ch_" + window.Dabimas.logic.pedigree.generateUuid(),
      kind: kind,
      name: "☆" + String(title || "").trim(),
      sex: kind === "stallion" ? "0" : "1",
      subName: "",
      ruby: "",
      nature: "",
      parentLine: sire.parentLine || "",
      son: sire.son || "",
      factors: ownFactors,
      factorLocked: true,
      descendants: descendants,
    };
  }

  window.Dabimas.logic.horses.buildSavedHorseRecord = buildSavedHorseRecord;
})(window);
