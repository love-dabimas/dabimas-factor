/**
 * このファイルの役割:
 * - "dabifaku_unified" の categories ストアに対する読み書き（一覧・作成・更新・
 *   並び替え・削除）をまとめる（docs/dabifaku_unified_spec_draft.md §14）。
 * - カテゴリ作成・削除は配下の作業枠（workspaces ストア）も同一トランザクションで
 *   扱う（§13.7）。
 *
 * このファイルに置かない処理:
 * - DB の open / onupgradeneeded（vue/logic/storage/unified-db.js の仕事）。
 * - Vue state への反映（vue/logic/workspace-sync.js の仕事）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.repositories = window.Dabimas.repositories || {};

  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var CATEGORY_STORE_NAME = unifiedDb.CATEGORY_STORE_NAME;
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

  function getAll() {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([CATEGORY_STORE_NAME], "readonly");
        var store = tx.objectStore(CATEGORY_STORE_NAME);
        var request = store.getAll();
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

  function getMaxSortOrder(store) {
    return new Promise(function (resolve, reject) {
      var request = store.getAll();
      request.onsuccess = function () {
        var rows = request.result || [];
        var max = rows.reduce(function (acc, row) {
          return Math.max(acc, row.sortOrder || 0);
        }, -1);
        resolve(max);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  // カテゴリ1件+作業枠1件を同一トランザクションで作成し、{ category, workspace } を返す。
  function create(options) {
    var name = options && options.name;
    var iconKey = options && options.iconKey;
    var isSystemGenerated = !!(options && options.isSystemGenerated);
    var initialSnapshot = (options && options.initialSnapshot) || emptySnapshot();

    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(
          [CATEGORY_STORE_NAME, WORKSPACE_STORE_NAME],
          "readwrite"
        );
        var categoryStore = tx.objectStore(CATEGORY_STORE_NAME);
        var workspaceStore = tx.objectStore(WORKSPACE_STORE_NAME);

        var category = null;
        var workspace = null;

        getMaxSortOrder(categoryStore)
          .then(function (maxSortOrder) {
            var timestamp = nowIso();
            category = {
              id: unifiedDb.generateUuid(),
              name: name,
              iconKey: iconKey,
              sortOrder: maxSortOrder + 1,
              lastActiveWorkspaceId: null,
              isSystemGenerated: isSystemGenerated,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            workspace = {
              id: unifiedDb.generateUuid(),
              categoryId: category.id,
              sortOrder: 0,
              snapshot: initialSnapshot,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            category.lastActiveWorkspaceId = workspace.id;

            categoryStore.put(category);
            workspaceStore.put(workspace);
          })
          .catch(reject);

        tx.oncomplete = function () {
          resolve({ category: category, workspace: workspace });
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // name / iconKey / lastActiveWorkspaceId の部分更新。
  function update(id, patch) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([CATEGORY_STORE_NAME], "readwrite");
        var store = tx.objectStore(CATEGORY_STORE_NAME);
        var getRequest = store.get(id);
        var updated = null;
        getRequest.onsuccess = function () {
          var category = getRequest.result;
          if (!category) {
            return;
          }
          updated = Object.assign({}, category, patch, {
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

  // 渡された順序どおりに sortOrder を 0 起点で振り直す。
  function reorder(orderedIds) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([CATEGORY_STORE_NAME], "readwrite");
        var store = tx.objectStore(CATEGORY_STORE_NAME);

        orderedIds.forEach(function (id, index) {
          var getRequest = store.get(id);
          getRequest.onsuccess = function () {
            var category = getRequest.result;
            if (!category) {
              return;
            }
            category.sortOrder = index;
            category.updatedAt = nowIso();
            store.put(category);
          };
        });

        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // カテゴリと、その配下の作業枠を全て同一トランザクションで削除する。
  function remove(id) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(
          [CATEGORY_STORE_NAME, WORKSPACE_STORE_NAME],
          "readwrite"
        );
        var categoryStore = tx.objectStore(CATEGORY_STORE_NAME);
        var workspaceStore = tx.objectStore(WORKSPACE_STORE_NAME);

        categoryStore.delete(id);

        var index = workspaceStore.index("categoryId");
        var cursorRequest = index.openCursor(IDBKeyRange.only(id));
        cursorRequest.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            workspaceStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };

        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  window.Dabimas.repositories.categories = {
    getAll: getAll,
    create: create,
    update: update,
    reorder: reorder,
    remove: remove,
    emptySnapshot: emptySnapshot,
  };
})(window);
