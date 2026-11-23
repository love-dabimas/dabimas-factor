/**
 * このファイルの役割:
 * - ダビふぁくが IndexedDB に持っているデータ（2 つのデータベースの全ストア）を
 *   まとめて読み出す・まとめて置き換える（#19 のバックアップ、#20 の控え）。
 *
 * このファイルに置かない処理:
 * - ファイルへの書き出し・読み込み（vue/logic/storage/backup-file.js）。
 * - localStorage の控え（vue/logic/storage/storage-mirror.js）。
 *
 * 分けている理由:
 * - バックアップと控えが同じ「全部読む・全部戻す」を使うので、ストアの一覧を
 *   ここ 1 か所にまとめる。ストアを足したときはここに足せば両方に効く。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var storage = window.Dabimas.logic.storage;

  // 対象のデータベースとストア。名前は各 DB の定義ファイルと同じ。
  var DATABASES = {
    unified: {
      name: "dabifaku_unified",
      stores: ["categories", "workspaces", "appMeta", "favorites", "editStallions"],
      // unified-db.js は接続を使い回すので閉じない。
      open: function () {
        return storage.unifiedDb.openDB();
      },
      shared: true,
    },
    combination: {
      name: "DabifacCombinationDB",
      stores: ["configs", "customHorses"],
      // combination-storage.js は呼ぶたびに新しく開くので、使い終わったら閉じる。
      open: function () {
        return storage.combinationStorage.openDB();
      },
      shared: false,
    },
  };

  function withDb(key, work) {
    var def = DATABASES[key];
    return def.open().then(function (db) {
      return Promise.resolve()
        .then(function () {
          return work(db, def);
        })
        .then(
          function (result) {
            if (!def.shared) db.close();
            return result;
          },
          function (error) {
            if (!def.shared) db.close();
            throw error;
          }
        );
    });
  }

  // { ストア名: レコードの配列 } を返す。storeNames を省くと全ストア。
  function readStores(key, storeNames) {
    return withDb(key, function (db, def) {
      var names = (storeNames || def.stores).filter(function (name) {
        return db.objectStoreNames.contains(name);
      });
      if (!names.length) return {};
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(names, "readonly");
        var result = {};
        names.forEach(function (name) {
          var request = tx.objectStore(name).getAll();
          request.onsuccess = function () {
            result[name] = request.result || [];
          };
        });
        tx.oncomplete = function () {
          resolve(result);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // data に入っているストアを、中身を消してから data のレコードで埋める。
  // data に無いストアには触らない。1 つのトランザクションなので、途中で
  // 失敗したら何も変わらない。
  function replaceStores(key, data) {
    return withDb(key, function (db, def) {
      var names = def.stores.filter(function (name) {
        return Array.isArray(data[name]) && db.objectStoreNames.contains(name);
      });
      if (!names.length) return;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(names, "readwrite");
        names.forEach(function (name) {
          var store = tx.objectStore(name);
          store.clear();
          data[name].forEach(function (record) {
            store.put(record);
          });
        });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error("aborted"));
        };
      });
    });
  }

  // 全ストアが空かどうか。
  function isEmpty(key) {
    return withDb(key, function (db, def) {
      var names = def.stores.filter(function (name) {
        return db.objectStoreNames.contains(name);
      });
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(names, "readonly");
        var total = 0;
        names.forEach(function (name) {
          var request = tx.objectStore(name).count();
          request.onsuccess = function () {
            total += request.result;
          };
        });
        tx.oncomplete = function () {
          resolve(total === 0);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function storeNames(key) {
    return DATABASES[key].stores.slice();
  }

  function databaseName(key) {
    return DATABASES[key].name;
  }

  storage.dataDump = {
    KEYS: Object.keys(DATABASES),
    storeNames: storeNames,
    databaseName: databaseName,
    readStores: readStores,
    replaceStores: replaceStores,
    isEmpty: isEmpty,
  };
})(window);
