/**
 * このファイルの役割:
 * - 配合理論（面白・見事・よくでき・完璧・奇跡・至高など）の判定ロジックを持つ。
 * - 種牡馬側・繁殖牝馬側それぞれの親系統リスト（S・D）を受け取り、
 *   どの理論に該当するかを表す文字列（例: "theory_04"）を返す。
 *
 * このファイルに置かない処理:
 * - Vue state（styleThoeryClass）への代入。呼び出し側（root app の dispTheory）が行う。
 * - parentLines から S・D を組み立てる処理（root app 側に残す。血統表の index
 *   構造そのものは pedigree 側の関心事のため）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.theory = window.Dabimas.logic.theory || {};

  // AとBに共通する要素数（重複要素はそれぞれの出現数までカウント）の
  // うち、少ない方の個数を返す。
  function countCommonElements(A, B) {
    var uniqueCommonElements = Array.from(
      new Set(A.filter(function (element) {
        return B.indexOf(element) !== -1;
      }))
    );

    var countA = uniqueCommonElements.reduce(function (count, element) {
      return count + A.filter(function (a) { return a === element; }).length;
    }, 0);

    var countB = uniqueCommonElements.reduce(function (count, element) {
      return count + B.filter(function (b) { return b === element; }).length;
    }, 0);

    return Math.min(countA, countB);
  }

  // AとBを合わせた集合から、重複を除いた要素数を返す。
  function countUniqueElements(A, B) {
    var union = A.concat(B);
    var uniqueElements = Array.from(new Set(union));
    return uniqueElements.length;
  }

  // Sire, Dam は [[面白系統], [見事系統]] の書式。面白内・見事内は順不同。
  // 例えばドゥラメンテなら [["Na","Ne","Ro","Ns"],["Ne","He","Te","Ne"]]。
  //
  // context には、この判定だけでは分からない「盤面全体」の情報を渡す。
  // - sameNameSpecialChecks: 至高判定（同名馬の特別ルール）に該当する組み合わせの一覧。
  // - selected: 血統表32行ぶんの選択済み馬（奇跡判定で特定の代の馬名を参照するため）。
  // - dangerous: judgeInbreed が返す危険な配合フラグ（クロス血量 50% 以上の群がある）。
  function compatibility(Sire, Dam, context) {
    var sameNameSpecialChecks = (context && context.sameNameSpecialChecks) || [];
    var selected = (context && context.selected) || [];
    var dangerous = !!(context && context.dangerous);

    // 危険な配合はどの理論よりも優先して表示する。
    // ゲームの master でも priority=999 で、有効レコードを priority 降順に
    // 走査したときの先頭になる（設計 docs/pedigree-master-integration-design.md §7.2.4）。
    if (dangerous) {
      return "theory_08";
    }

    // 面白配合判定
    var omoshiro_count = countUniqueElements(Sire[0], Dam[0]);
    var omoshiro_flag = omoshiro_count >= 7;

    // 共通要素数の算出
    var common_elms = countCommonElements(Sire[1], Dam[0]);

    // 理論なし
    var result = "";

    // 至高判定OKなら至高
    if (sameNameSpecialChecks.length > 0) {
      return "theory_07";
    }

    if (omoshiro_flag) {
      // 面白＋よくでき
      if (common_elms == 3) {
        result = "theory_03";
      }
      // 完璧
      if (common_elms == 4) {
        // 牝馬の3代目
        var mother3 = selected[3 + 16] ? selected[3 + 16].name : undefined;
        // 牡馬の4代目
        var father4 = [
          selected[4] ? selected[4].name : undefined,
          selected[5] ? selected[5].name : undefined,
          selected[6] ? selected[6].name : undefined,
          selected[7] ? selected[7].name : undefined,
        ];

        var includesNum = father4.filter(function (value) {
          // 牝馬の3代目に合致する種牡馬を配列で取得
          return value === mother3;
        });

        // 4×3のみ奇跡になる。4×4×3は奇跡にならない。
        if (includesNum.length === 1) {
          // 奇跡
          result = "theory_06";
        } else if (omoshiro_count == 8) {
          // 超完璧
          result = "theory_05";
        } else {
          // 普通の完璧
          result = "theory_04";
        }
      }
      // 面白
      if (common_elms < 3) {
        result = "theory_01";
      }
    } else {
      // よくでき
      if (common_elms == 3) {
        result = "theory_03";
      }
      // 見事
      if (common_elms == 4) {
        result = "theory_02";
      }
    }

    return result;
  }

  window.Dabimas.logic.theory.countCommonElements = countCommonElements;
  window.Dabimas.logic.theory.countUniqueElements = countUniqueElements;
  window.Dabimas.logic.theory.compatibility = compatibility;
})(window);
