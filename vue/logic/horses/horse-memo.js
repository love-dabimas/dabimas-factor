/**
 * このファイルの役割:
 * - 馬ごとのメモ（100 文字まで）の「どの馬のメモか」の見分けと、公式の馬のメモの読み書き。
 * - 自家製馬のメモは配合の保存の画面と同じもの（configs / customHorses の memo）を使い、
 *   ここでは「自家製馬のメモである」ことと、その id を返すだけにする。
 * - 公式の馬のメモは、この端末の localStorage（dabimasHorseMemos）に馬ごとに持つ。
 *   別の端末には引き継がれない。
 *
 * どの馬か:
 * - 公式の馬は nodeId（血統の番号）で見分ける。同じ馬でもサブ名違い（瑚闘と 1973 など）は
 *   別の番号なので別のメモになる。祖先のマスに出てくるときも同じ番号なので同じメモが出る。
 * - 深いマスで牝馬を選んだマスは、その牝馬（placeholderMareRef）のメモにする。
 * - ★N薄めの仮の馬とワタシノヒンバは実際の馬ではないので、メモの対象にしない。
 *
 * このファイルに置かない処理:
 * - メモの入力ダイアログ（vue/components/memo/horse-memo-dialog.js）と、保存の段取り
 *   （vue/app/methods/horse-loading.js の saveHorseMemo）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.horses = window.Dabimas.logic.horses || {};

  var STORAGE_KEY = "dabimasHorseMemos";
  var MAX_LENGTH = 100;

  function readStored() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  // 公式の馬のメモ。画面が書き換えに追従するよう、リアクティブにしておく。
  var state = Vue.observable({ memos: readStored() });

  function writeStored() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memos));
    } catch (error) {
      // 保存できなくても、この画面では反映されるようにする。
    }
  }

  // このマス（または候補）の馬が、どの馬のメモになるか。対象外なら null。
  //   { kind: "custom", id }  自家製馬（メモは配合の保存の画面と同じもの）
  //   { kind: "master", key } 公式の馬
  function memoTargetOf(horse) {
    if (!horse || !horse.name) {
      return null;
    }
    var mareRef = horse.placeholderMareRef;
    if (mareRef) {
      if (mareRef.kind === "custom" && mareRef.id) {
        return { kind: "custom", id: mareRef.id };
      }
      if (mareRef.kind === "master" && mareRef.nodeId) {
        return { kind: "master", key: "n:" + mareRef.nodeId };
      }
      return null;
    }
    if (horse.source === "custom" || horse.customHorseId) {
      var id = horse.customHorseId || horse.id;
      return id ? { kind: "custom", id: id } : null;
    }
    if (horse.identityRef && horse.identityRef.kind === "custom" && horse.identityRef.id) {
      return { kind: "custom", id: horse.identityRef.id };
    }
    if (horse.disabled === true || horse.name === "ワタシノヒンバ") {
      return null;
    }
    if (horse.nodeId) {
      return { kind: "master", key: "n:" + horse.nodeId };
    }
    return null;
  }

  // 馬のメモ。自家製馬は savedHorseSummaries（選ぶ画面に出す自家製馬の一覧）から引く。
  function getMemo(horse, savedHorseSummaries) {
    var target = memoTargetOf(horse);
    if (!target) {
      return "";
    }
    if (target.kind === "custom") {
      var list = savedHorseSummaries || [];
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] && list[i].id === target.id) {
          return list[i].memo || "";
        }
      }
      return "";
    }
    return state.memos[target.key] || "";
  }

  function setMasterMemo(key, memo) {
    var text = String(memo || "").trim().slice(0, MAX_LENGTH);
    if (text) {
      Vue.set(state.memos, key, text);
    } else {
      Vue.delete(state.memos, key);
    }
    writeStored();
    return text;
  }

  window.Dabimas.logic.horses.horseMemo = {
    MAX_LENGTH: MAX_LENGTH,
    state: state,
    memoTargetOf: memoTargetOf,
    getMemo: getMemo,
    setMasterMemo: setMasterMemo,
  };
})(window, window.Vue);
