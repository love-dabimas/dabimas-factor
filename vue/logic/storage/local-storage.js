/**
 * このファイルの役割:
 * - localStorage への保存・削除の共通処理（値が空なら削除、それ以外は保存）。
 * - 手動インブリード指定（dabimasManualInbreed キー）の読み込み・検証・
 *   書き込みで共通する parse/validate 部分をまとめる。
 *
 * このファイルに置かない処理:
 * - Vue state（inbreedList・isInbreedButtonClicked・dispColor 等）への反映。
 *   反映は root app 側（restoreManualInbreedState 等）が行う。
 *
 * 分けている理由:
 * - persistManualInbreedState / clearManualInbreedForIndex / restoreManualInbreedState の
 *   3箇所で「読み込み→JSON.parse→配列チェック」が重複していたため、1箇所にまとめる。
 * - localStorage のキー名・保存形式（配列を JSON.stringify したもの）は
 *   統合版ドキュメントが前提にしているため、ここでも変更しない。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var MANUAL_INBREED_STORAGE_KEY = "dabimasManualInbreed";

  // 編集中の血統表（開いている配合の中身）を置くキー。workspace-sync.js の
  // SNAPSHOT_KEY_MAP と同じ 6 つ。
  var WORKING_KEYS = [
    "dabimasFactor",
    "dabimasFactorCategory",
    "dabimasMemo",
    "dabimasMemoStallion",
    "dabimasMemoBroodmare",
    MANUAL_INBREED_STORAGE_KEY,
  ];

  // 編集中の血統表はタブごとに持つ（sessionStorage）。localStorage はタブ間で
  // 共有されるので、2 つのタブで別々の配合を触ると、裏に回ったタブが相手の
  // 中身を自分の配合として保存してしまっていた（issue #10）。
  // 配合の中身の正本は IndexedDB の作業枠で、開くたびにここへ書き込むので、
  // タブを閉じて消えても困らない。IndexedDB が使えないときだけは、配合を
  // 残す先がここしか無いので、従来どおり localStorage に置く（useShared）。
  var workingUsesShared = false;

  function workingBackend() {
    if (!workingUsesShared) {
      try {
        if (window.sessionStorage) {
          return window.sessionStorage;
        }
      } catch (error) {
        // sessionStorage が使えない環境は localStorage へ縮退する。
      }
    }
    return window.localStorage;
  }

  function storageFor(key) {
    return WORKING_KEYS.indexOf(key) !== -1 ? workingBackend() : window.localStorage;
  }

  var working = {
    getItem: function (key) {
      return storageFor(key).getItem(key);
    },
    setItem: function (key, value) {
      storageFor(key).setItem(key, value);
    },
    removeItem: function (key) {
      storageFor(key).removeItem(key);
    },
    // IndexedDB が使えないとき（workspace-sync.js の boot 失敗）に呼ぶ。
    useShared: function () {
      workingUsesShared = true;
    },
  };

  // 値が null/undefined なら削除、それ以外は保存する。
  function setOrRemove(key, value) {
    if (value === null || value === undefined) {
      storageFor(key).removeItem(key);
    } else {
      storageFor(key).setItem(key, value);
    }
  }

  // dabimasManualInbreed キーを読み込み、検証済みの配列にして返す。
  // キーが無い／JSONとして壊れている／配列でない場合は null を返す
  // （呼び出し側はこれを「何もしない」の合図として扱う）。
  function readManualInbreedIndexes() {
    var rawIndexes = working.getItem(MANUAL_INBREED_STORAGE_KEY);
    if (!rawIndexes) {
      return null;
    }
    var manualIndexes;
    try {
      manualIndexes = JSON.parse(rawIndexes) || [];
    } catch (error) {
      console.error(error);
      return null;
    }
    if (!Array.isArray(manualIndexes)) {
      return null;
    }
    return manualIndexes;
  }

  // 配列が空なら削除、それ以外は JSON 文字列として保存する。
  function writeManualInbreedIndexes(indexes) {
    if (!indexes || indexes.length === 0) {
      working.removeItem(MANUAL_INBREED_STORAGE_KEY);
      return;
    }
    working.setItem(
      MANUAL_INBREED_STORAGE_KEY,
      JSON.stringify(indexes)
    );
  }

  // inbreedList（selfInbreed フラグ付きの32行配列）から、
  // 手動インブリード指定されている行番号だけを取り出す。
  function computeManualInbreedIndexesFromList(inbreedList) {
    return inbreedList
      .map(function (value, index) {
        return value && value.selfInbreed ? index : null;
      })
      .filter(function (index) {
        return index !== null;
      });
  }

  // 指定した index を配列から取り除く（数値化・整数チェック込み）。
  function removeIndexFromManualInbreedIndexes(indexes, indexToRemove) {
    var target = Number(indexToRemove);
    return indexes
      .map(function (value) {
        return Number(value);
      })
      .filter(function (value) {
        return Number.isInteger(value) && value !== target;
      });
  }

  window.Dabimas.logic.storage.localStorage = {
    MANUAL_INBREED_STORAGE_KEY: MANUAL_INBREED_STORAGE_KEY,
    setOrRemove: setOrRemove,
    readManualInbreedIndexes: readManualInbreedIndexes,
    writeManualInbreedIndexes: writeManualInbreedIndexes,
    computeManualInbreedIndexesFromList: computeManualInbreedIndexesFromList,
    removeIndexFromManualInbreedIndexes: removeIndexFromManualInbreedIndexes,
  };
  // 編集中の血統表の 6 キーを読み書きする窓口（タブごと。上の working の説明）。
  window.Dabimas.logic.storage.working = working;
})(window);
