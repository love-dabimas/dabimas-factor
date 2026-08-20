/**
 * このファイルの役割:
 * - "dabifaku_unified" の workspaces ストアに対する読み書き（カテゴリ内一覧・
 *   作成・snapshot保存・削除+再採番）をまとめる
 *   （docs/dabifaku_unified_spec_draft.md §14, §11, §13.7）。
 *
 * このファイルに置かない処理:
 * - DB の open / onupgradeneeded（vue/logic/storage/unified-db.js の仕事）。
 * - localStorage 6キーとの相互変換（vue/logic/workspace-sync.js の仕事）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.repositories = window.Dabimas.repositories || {};

  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var WORKSPACE_STORE_NAME = unifiedDb.WORKSPACE_STORE_NAME;

  function nowIso() {
    return new Date().toISOString();
  }

  function emptySnapshot() {
    return {
      factor: null,
      factorCategory: null,
      memo: null,
      memoStallion: null,
      memoBroodmare: null,
      manualInbreed: null,
    };
  }

  // ホーム画面のカード表示用: 個別 count クエリを避け、全件取得して
  // categoryId ごとに集計する（統合版仕様 §19）。
  function countsByCategory() {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([WORKSPACE_STORE_NAME], "readonly");
        var store = tx.objectStore(WORKSPACE_STORE_NAME);
        var request = store.getAll();
        request.onsuccess = function () {
          var counts = {};
          (request.result || []).forEach(function (row) {
            counts[row.categoryId] = (counts[row.categoryId] || 0) + 1;
          });
          resolve(counts);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  function getByCategory(categoryId) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([WORKSPACE_STORE_NAME], "readonly");
        var store = tx.objectStore(WORKSPACE_STORE_NAME);
        var index = store.index("categoryId");
        var request = index.getAll(IDBKeyRange.only(categoryId));
        request.onsuccess = function () {
          var rows = (request.result || []).sort(function (a, b) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          });
          resolve(rows);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  // 空 snapshot の作業枠を、同カテゴリの末尾（sortOrder最大+1）に作成する。
  function create(categoryId) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([WORKSPACE_STORE_NAME], "readwrite");
        var store = tx.objectStore(WORKSPACE_STORE_NAME);
        var index = store.index("categoryId");
        var workspace = null;

        var cursorRequest = index.getAll(IDBKeyRange.only(categoryId));
        cursorRequest.onsuccess = function () {
          var rows = cursorRequest.result || [];
          var maxSortOrder = rows.reduce(function (acc, row) {
            return Math.max(acc, row.sortOrder || 0);
          }, -1);
          var timestamp = nowIso();
          workspace = {
            id: unifiedDb.generateUuid(),
            categoryId: categoryId,
            sortOrder: maxSortOrder + 1,
            snapshot: emptySnapshot(),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          store.put(workspace);
        };
        cursorRequest.onerror = function () {
          reject(cursorRequest.error);
        };

        tx.oncomplete = function () {
          resolve(workspace);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // flush用: 指定した作業枠の snapshot を上書きし updatedAt を更新する。
  function saveSnapshot(id, snapshot) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([WORKSPACE_STORE_NAME], "readwrite");
        var store = tx.objectStore(WORKSPACE_STORE_NAME);
        var getRequest = store.get(id);
        var updated = null;
        getRequest.onsuccess = function () {
          var workspace = getRequest.result;
          if (!workspace) {
            return;
          }
          updated = Object.assign({}, workspace, {
            snapshot: snapshot,
            updatedAt: nowIso(),
          });
          store.put(updated);
        };
        getRequest.onerror = function () {
          reject(getRequest.error);
        };
        tx.oncomplete = function () {
          resolve(updated);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // 削除 + 同カテゴリの残存作業枠を sortOrder 0 起点で再採番（同一トランザクション）。
  // 削除後の残存一覧（sortOrder昇順）を resolve する。
  function remove(id) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([WORKSPACE_STORE_NAME], "readwrite");
        var store = tx.objectStore(WORKSPACE_STORE_NAME);
        var remaining = [];

        var getRequest = store.get(id);
        getRequest.onsuccess = function () {
          var target = getRequest.result;
          if (!target) {
            return;
          }
          store.delete(id);

          var index = store.index("categoryId");
          var cursorRequest = index.getAll(IDBKeyRange.only(target.categoryId));
          cursorRequest.onsuccess = function () {
            remaining = (cursorRequest.result || [])
              .filter(function (row) {
                return row.id !== id;
              })
              .sort(function (a, b) {
                return (a.sortOrder || 0) - (b.sortOrder || 0);
              });
            remaining.forEach(function (row, idx) {
              row.sortOrder = idx;
              row.updatedAt = nowIso();
              store.put(row);
            });
          };
          cursorRequest.onerror = function () {
            reject(cursorRequest.error);
          };
        };
        getRequest.onerror = function () {
          reject(getRequest.error);
        };

        tx.oncomplete = function () {
          resolve(remaining);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  window.Dabimas.repositories.workspaces = {
    getByCategory: getByCategory,
    countsByCategory: countsByCategory,
    create: create,
    saveSnapshot: saveSnapshot,
    remove: remove,
    emptySnapshot: emptySnapshot,
  };
})(window);
