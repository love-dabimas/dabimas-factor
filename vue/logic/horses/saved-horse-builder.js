(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.horses = window.Dabimas.logic.horses || {};

  var DESCENDANT_SOURCES = [
    [0, "sire", ""], [1, "sire", "F"], [2, "sire", "FF"],
    [4, "sire", "FFF"], [5, "sire", "FMF"], [3, "sire", "MF"],
    [6, "sire", "MFF"], [7, "sire", "MMF"], [17, "dam", "F"],
    [18, "dam", "FF"], [20, "dam", "FFF"], [21, "dam", "FMF"],
    [19, "dam", "MF"], [22, "dam", "MFF"], [23, "dam", "MMF"],
  ];
  var DESCENDANT_CELL_IDS = DESCENDANT_SOURCES.map(function (source) { return source[0]; });
  var DESCENDANT_SLOTS = window.Dabimas.logic.pedigree.DESCENDANT_SLOTS;
  var MARE_SOURCE_IDS = [
    ["dam", null], ["sire", 0], ["dam", 0], ["sire", 1], ["sire", 2],
    ["dam", 1], ["dam", 2], ["sire", 3], ["sire", 4], ["sire", 5],
    ["sire", 6], ["dam", 3], ["dam", 4], ["dam", 5], ["dam", 6],
  ];

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

  // 旧レコードで欠落した子系統を、直系父方の最初の値から補う。
  function fillMissingSon(record) {
    if (!record || !Array.isArray(record.descendants)) {
      return record;
    }
    var bySlot = new Map();
    for (var i = 0; i < DESCENDANT_SLOTS.length; i += 1) {
      if (record.descendants[i]) {
        bySlot.set(DESCENDANT_SLOTS[i], record.descendants[i]);
      }
    }
    function sonFromSireLine(slot) {
      for (var current = slot; current < 16; current *= 2) {
        var ancestor = bySlot.get(current);
        if (ancestor && ancestor.son) {
          return ancestor.son;
        }
      }
      return "";
    }
    if (!record.son) {
      record.son = sonFromSireLine(1);
    }
    bySlot.forEach(function (descendant, slot) {
      if (!descendant.son) {
        descendant.son = sonFromSireLine(slot);
      }
    });
    return record;
  }

  // ownFactorsInput: 保存する馬「本人」に付与する因子名の配列（最大2つ）。
  // 種牡馬保存時に配合保存ダイアログから渡される（因子付与ダイアログと同じ
  // 短速底長堅難）。省略・空配列なら従来どおり因子なし。
  function buildSavedHorseRecord(kind, title, cells, ownFactorsInput, context) {
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
        nodeId: cell.nodeId ?? null,
        identityRef: cell.identityRef ?? { kind: "unknown" },
        pedigreeId: cell.pedigreeId ?? null,
        parentLine: cell.parentLine || "",
        son: cell.son || "",
        factors: Array.isArray(cell.factors)
          ? cell.factors.slice()
          : ["", "", ""],
        factorLocked: true,
      });
    });

    // 親系統・子系統は父系（直系父方向）でしか決まらない属性なので、保存する馬
    // （＝ cells[0] の種牡馬 × cells[16] の繁殖牝馬から生まれる仔）の親系統・
    // 子系統は、種牡馬保存か繁殖牝馬保存かに関わらず常に cells[0]（父）から
    // 引き継ぐ。実データでも例えば母（メゾンフォルティー）の son は
    // "ノーザンダンサー系" で父（ドリームジャーニー）の "ヘイルトゥリーズン系"
    // とは無関係な値であり、cells[16] 側を見ると仔に無関係な母方の値が
    // 入ってしまう（一度 cells[16] に変更したが、これは誤りだったので cells[0]
    // に戻した）。
    var sire = cells[0];
    var mares = MARE_SOURCE_IDS.map(function (source) {
      var side = source[0];
      var mareIndex = source[1];
      if (mareIndex === null) {
        return cells[16]?.nodeId ?? null;
      }
      var root = cells[side === "sire" ? 0 : 16];
      var mareNodeIds = Array.isArray(root?.mareNodeIds)
        ? root.mareNodeIds
        : [];
      return mareNodeIds[mareIndex] ?? null;
    });
    var mareRefs = MARE_SOURCE_IDS.map(function (source) {
      if (source[1] === null) {
        return cells[16]?.identityRef ?? { kind: "unknown" };
      }
      return cells[source[0] === "sire" ? 0 : 16]?.mareRefs?.[source[1]]
        ?? { kind: "unknown" };
    });
    var fatherRef = cells[0]?.identityRef ?? null;
    var motherRef = cells[16]?.identityRef ?? null;
    // 既存の参照は維持し、盤面から解決できる欠損だけを補完する。
    // context/nodeTable がない呼出しでは unknown も含めて旧値をそのまま返す。
    if (context?.nodeTable) {
      var usable = function (ref) {
        return ref && ref.kind && ref.kind !== "unknown" ? ref : null;
      };
      var sireBoard = window.Dabimas.logic.pedigree.resolveBoardRefs(cells, 0, context);
      var damBoard = window.Dabimas.logic.pedigree.resolveBoardRefs(cells, 16, context);
      fatherRef = usable(fatherRef) ?? usable(sireBoard.rootRef) ?? null;
      motherRef = usable(motherRef) ?? usable(damBoard.rootRef) ?? null;
      mareRefs = mareRefs.map(function (ref, slot) {
        var source = MARE_SOURCE_IDS[slot];
        var resolved = source[1] === null ? damBoard.rootRef
          : (source[0] === "sire" ? sireBoard : damBoard).mareRefs[source[1]];
        return usable(ref) ?? usable(resolved) ?? { kind: "unknown" };
      });
      descendants.forEach(function (descendant, index) {
        if (descendant.identityRef?.kind !== "unknown") {
          return;
        }
        var source = DESCENDANT_SOURCES[index];
        var board = source[1] === "sire" ? sireBoard : damBoard;
        var resolved = usable(board.refByPath.get(source[2]));
        if (resolved) {
          descendant.identityRef = resolved;
        }
      });
    }
    var id = "ch_" + window.Dabimas.logic.pedigree.generateUuid();
    return {
      id: id,
      pedigreeSchemaVersion: 2,
      identityRef: { kind: "custom", id: id },
      fatherRef: fatherRef,
      motherRef: motherRef,
      mareRefs: mareRefs,
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
      mares: mares,
    };
  }

  window.Dabimas.logic.horses.buildSavedHorseRecord = buildSavedHorseRecord;
  window.Dabimas.logic.horses.fillMissingSon = fillMissingSon;
  window.Dabimas.logic.horses.DESCENDANT_CELL_IDS = DESCENDANT_CELL_IDS;
  window.Dabimas.logic.horses.MARE_SOURCE_IDS = MARE_SOURCE_IDS;
})(window);
