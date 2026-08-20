/**
 * このファイルの役割:
 * - 統合版（カテゴリ・作業枠）専用の IndexedDB "dabifaku_unified" の
 *   open / onupgradeneeded を1箇所にまとめる（categories / workspaces /
 *   appMeta / editStallions の4ストア、docs/dabifaku_unified_spec_draft.md §13）。
 * - フォールバック付き UUID v4 生成（generateUuid）を提供する。
 *
 * このファイルに置かない処理:
 * - Vue state への反映、UI表示。呼び出し側（workspace-sync.js 経由）が行う。
 * - カテゴリ/作業枠/appMeta それぞれの読み書きロジック（各 *-repository.js の仕事）。
 *
 * 分けている理由:
 * - 既存 DB "DabifacCombinationDB"（vue/logic/storage/combination-storage.js）
 *   とはスキーマ・version が異なる別データベースのため、既存 DB のバージョンや
 *   ストア構成には一切触れない（統合版仕様 §5.5）。
 * - generateUuid は vue/logic/pedigree/pedigree-builder.js に同方式の実装が
 *   あるが非公開関数のため、統合版仕様 §13.6 の許可に従いここへ複製する
 *   （pedigree-builder.js は本体側ファイルのため変更しない）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var DB_NAME = "dabifaku_unified";
  var DB_VERSION = 2;
  var CATEGORY_STORE_NAME = "categories";
  var WORKSPACE_STORE_NAME = "workspaces";
  var APP_META_STORE_NAME = "appMeta";
  var EDIT_STALLION_STORE_NAME = "editStallions";

  // crypto.randomUUID() は secure context（HTTPS / localhost）でしか使えない。
  // LAN IPへの素のHTTPアクセス（実機テスト等）では crypto.randomUUID が
  // 存在せず即例外になるため、getRandomValues（secure context不要）ベースの
  // フォールバックを用意する（vue/logic/pedigree/pedigree-builder.js と同方式）。
  function generateUuid() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      var bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.from(bytes, function (b) {
        return b.toString(16).padStart(2, "0");
      });
      return (
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10, 16).join("")
      );
    }
    // 最終手段（crypto自体が無い極めて古い環境向け）
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // 接続をキャッシュして使い回す。統合版はflushが500ms debounceで頻発するため、
  // 呼び出しのたびに indexedDB.open() し直すと接続が積み上がってしまう
  // （既存の combination-storage.js は呼び出し側が1回openして使い回す設計だが、
  // こちらは repository 層が個別に openDB() を呼ぶ設計にしたため、ここで
  // 内部的にキャッシュして同じ効果を得る）。
  var dbConnectionPromise = null;

  function openDB() {
    if (dbConnectionPromise) {
      return dbConnectionPromise;
    }
    dbConnectionPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDBに対応していません"));
        return;
      }

      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        var db = request.result;
        // 他タブでのDB削除等によりconnectionが閉じられたら、次回openDB()で
        // 再接続できるようキャッシュを破棄する。
        db.onclose = function () {
          dbConnectionPromise = null;
        };
        resolve(db);
      };

      request.onupgradeneeded = function (event) {
        var db = event.target.result;

        if (!db.objectStoreNames.contains(CATEGORY_STORE_NAME)) {
          var categoryStore = db.createObjectStore(CATEGORY_STORE_NAME, {
            keyPath: "id",
          });
          categoryStore.createIndex("sortOrder", "sortOrder", { unique: false });
        }

        if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
          var workspaceStore = db.createObjectStore(WORKSPACE_STORE_NAME, {
            keyPath: "id",
          });
          workspaceStore.createIndex("categoryId", "categoryId", { unique: false });
          // unique制約は付けない（再採番トランザクションの途中状態で一時的に
          // 重複し得るため。整合性はトランザクション完了条件で担保する）。
          workspaceStore.createIndex(
            "categoryId_sortOrder",
            ["categoryId", "sortOrder"],
            { unique: false }
          );
        }

        if (!db.objectStoreNames.contains(APP_META_STORE_NAME)) {
          db.createObjectStore(APP_META_STORE_NAME, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(EDIT_STALLION_STORE_NAME)) {
          var editStallionStore = db.createObjectStore(
            EDIT_STALLION_STORE_NAME,
            { keyPath: "id" }
          );
          editStallionStore.createIndex("createdAt", "createdAt", {
            unique: false,
          });
        }
      };
    });
    // 失敗した接続はキャッシュせず、次回呼び出しで再試行できるようにする。
    dbConnectionPromise.catch(function () {
      dbConnectionPromise = null;
    });
    return dbConnectionPromise;
  }

  window.Dabimas.logic.storage.unifiedDb = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    CATEGORY_STORE_NAME: CATEGORY_STORE_NAME,
    WORKSPACE_STORE_NAME: WORKSPACE_STORE_NAME,
    APP_META_STORE_NAME: APP_META_STORE_NAME,
    EDIT_STALLION_STORE_NAME: EDIT_STALLION_STORE_NAME,
    openDB: openDB,
    generateUuid: generateUuid,
  };
})(window);
