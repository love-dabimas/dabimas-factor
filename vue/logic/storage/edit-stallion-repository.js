/**
 * dabifaku_unified の editStallions ストアを扱う薄い CRUD リポジトリ。
 * Vue state や候補リストの更新は呼び出し側で行う。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.repositories = window.Dabimas.repositories || {};

  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var STORE_NAME = unifiedDb.EDIT_STALLION_STORE_NAME;

  function loadAll() {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME], "readonly");
        var request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = function () {
          resolve(
            (request.result || []).sort(function (a, b) {
              var createdOrder = String(a.createdAt || "").localeCompare(
                String(b.createdAt || "")
              );
              return createdOrder || String(a.id || "").localeCompare(String(b.id || ""));
            })
          );
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  function save(record) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var timestamp = new Date().toISOString();
        var saved = Object.assign({}, record, {
          id: record.id || "es_" + unifiedDb.generateUuid(),
          factors: [0, 1, 2].map(function (index) {
            return String((record.factors || [])[index] || "");
          }),
          createdAt: record.createdAt || timestamp,
          updatedAt: timestamp,
        });
        var tx = db.transaction([STORE_NAME], "readwrite");
        tx.objectStore(STORE_NAME).put(saved);
        tx.oncomplete = function () {
          resolve(saved);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function remove(id) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME], "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  window.Dabimas.repositories.editStallions = {
    loadAll: loadAll,
    save: save,
    remove: remove,
  };
})(window);
