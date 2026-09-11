/**
 * このファイルの役割: favorites ストアの読み書きをまとめる。
 * このファイルに置かない処理: Vue state・画面への反映。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.repositories = window.Dabimas.repositories || {};
  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var STORE_NAME = unifiedDb.FAVORITE_STORE_NAME;

  function getAll() {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME], "readonly");
        var request = tx.objectStore(STORE_NAME).getAll();
        tx.oncomplete = function () { resolve(request.result || []); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function write(id, remove) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME], "readwrite");
        var store = tx.objectStore(STORE_NAME);
        if (remove) store.delete(id);
        else store.put({ id: id, createdAt: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  window.Dabimas.repositories.favorites = {
    getAll: getAll,
    add: function (id) { return write(id, false); },
    remove: function (id) { return write(id, true); },
  };
})(window);
