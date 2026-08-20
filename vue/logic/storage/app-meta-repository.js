/**
 * このファイルの役割:
 * - "dabifaku_unified" の appMeta ストア（key-value、schemaVersion /
 *   migrationDone / lastOpenedCategoryId）への get / set をまとめる
 *   （docs/dabifaku_unified_spec_draft.md §13.5）。
 *
 * このファイルに置かない処理:
 * - DB の open / onupgradeneeded（vue/logic/storage/unified-db.js の仕事）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.repositories = window.Dabimas.repositories || {};

  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var APP_META_STORE_NAME = unifiedDb.APP_META_STORE_NAME;

  function get(key) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([APP_META_STORE_NAME], "readonly");
        var store = tx.objectStore(APP_META_STORE_NAME);
        var request = store.get(key);
        request.onsuccess = function () {
          resolve(request.result ? request.result.value : undefined);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  function set(key, value) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([APP_META_STORE_NAME], "readwrite");
        var store = tx.objectStore(APP_META_STORE_NAME);
        store.put({ key: key, value: value });
        tx.oncomplete = function () {
          resolve(value);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  window.Dabimas.repositories.appMeta = {
    get: get,
    set: set,
  };
})(window);
