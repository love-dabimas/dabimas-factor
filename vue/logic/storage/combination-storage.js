/**
 * このファイルの役割:
 * - 配合保存（IndexedDB "DabifacCombinationDB"）の低レベル操作を1箇所にまとめる。
 * - 自家製馬ライブラリ（customHorses ストア）の読み書きもここに含む。
 *
 * このファイルに置かない処理:
 * - Vue state への反映、UI表示。呼び出し側（combination-dialog、root app の
 *   ensureCustomHorseDb 経由）が結果を state に反映する。
 *
 * 分けている理由:
 * - もともと同じ DB_VERSION / ストア構成の定義が vue/combinationDB.js（未使用の
 *   ES module）・vue/CombinationDialog.js のインライン openDB()・index.html の
 *   ensureCustomHorseDb() の3箇所に重複していた。version がずれると
 *   IndexedDB は VersionError になるため、定義を1箇所へ集約する。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var DB_NAME = "DabifacCombinationDB";
  // v2: 自家製馬ライブラリ（customHorses）ストアを追加。
  // このファイルが version / ストア構成の単一の定義元。
  var DB_VERSION = 2;
  var STORE_NAME = "configs";
  var CUSTOM_STORE_NAME = "customHorses";

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDBに対応していません"));
        return;
      }

      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function () {
        reject(request.error);
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onupgradeneeded = function (event) {
        var db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var objectStore = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          objectStore.createIndex("savedAt", "savedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(CUSTOM_STORE_NAME)) {
          var customStore = db.createObjectStore(CUSTOM_STORE_NAME, {
            keyPath: "id",
          });
          customStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
    });
  }

  // ===== 配合保存（configs ストア）=====

  function saveConfig(db, title, configData) {
    return new Promise(function (resolve, reject) {
      try {
        var configDataCopy = JSON.parse(JSON.stringify(configData));

        var config = {
          title: title,
          savedAt: new Date().toISOString(),
          configData: configDataCopy,
        };

        var transaction = db.transaction([STORE_NAME], "readwrite");
        var objectStore = transaction.objectStore(STORE_NAME);
        var request = objectStore.add(config);

        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          reject(request.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  function loadConfigs(db) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORE_NAME], "readonly");
      var objectStore = transaction.objectStore(STORE_NAME);
      var index = objectStore.index("savedAt");

      var request = index.openCursor(null, "prev");
      var configs = [];

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor && configs.length < 15) {
          configs.push(cursor.value);
          cursor.continue();
        } else {
          resolve(configs);
        }
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function deleteConfig(db, id) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORE_NAME], "readwrite");
      var objectStore = transaction.objectStore(STORE_NAME);
      var request = objectStore.delete(id);

      request.onsuccess = function () {
        resolve();
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function getConfig(db, id) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORE_NAME], "readonly");
      var objectStore = transaction.objectStore(STORE_NAME);
      var request = objectStore.get(id);

      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  // 保存済み配合のメモ（100 文字まで）を書き換える。空文字ならメモを消す。
  function updateConfigMemo(db, id, memo) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([STORE_NAME], "readwrite");
      var objectStore = transaction.objectStore(STORE_NAME);
      var getRequest = objectStore.get(id);
      var updated = null;
      getRequest.onsuccess = function () {
        var config = getRequest.result;
        if (!config) {
          return;
        }
        updated = Object.assign({}, config, { memo: memo || "" });
        objectStore.put(updated);
      };
      getRequest.onerror = function () {
        reject(getRequest.error);
      };
      transaction.oncomplete = function () {
        resolve(updated);
      };
      transaction.onerror = function () {
        reject(transaction.error);
      };
    });
  }

  // ===== 自家製馬ライブラリ（customHorses ストア）=====

  function saveCustomHorse(db, customHorse) {
    return new Promise(function (resolve, reject) {
      try {
        if (!customHorse || typeof customHorse.id !== "string" || !customHorse.id) {
          reject(new Error("customHorse.id（安定キー）が必要です"));
          return;
        }

        var record = JSON.parse(JSON.stringify(customHorse));
        if (!record.createdAt) {
          record.createdAt = new Date().toISOString();
        }
        record.updatedAt = new Date().toISOString();

        var transaction = db.transaction([CUSTOM_STORE_NAME], "readwrite");
        var objectStore = transaction.objectStore(CUSTOM_STORE_NAME);
        var request = objectStore.put(record);

        request.onsuccess = function () {
          resolve(record);
        };
        request.onerror = function () {
          reject(request.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  function loadCustomHorses(db) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([CUSTOM_STORE_NAME], "readonly");
      var objectStore = transaction.objectStore(CUSTOM_STORE_NAME);
      var index = objectStore.index("createdAt");

      var request = index.openCursor(null, "prev");
      var horses = [];

      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          horses.push(cursor.value);
          cursor.continue();
        } else {
          resolve(horses);
        }
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function getCustomHorse(db, id) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([CUSTOM_STORE_NAME], "readonly");
      var objectStore = transaction.objectStore(CUSTOM_STORE_NAME);
      var request = objectStore.get(id);

      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function deleteCustomHorse(db, id) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([CUSTOM_STORE_NAME], "readwrite");
      var objectStore = transaction.objectStore(CUSTOM_STORE_NAME);
      var request = objectStore.delete(id);

      request.onsuccess = function () {
        resolve();
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  // 自家製馬にも同じメモを写す。馬を選ぶ画面の一覧に出すため（一覧は customHorses から作る）。
  function updateCustomHorseMemo(db, id, memo) {
    return getCustomHorse(db, id).then(function (record) {
      if (!record) {
        return null;
      }
      return saveCustomHorse(db, Object.assign({}, record, { memo: memo || "" }));
    });
  }

  // ===== ストレージ永続化 / 残量 =====

  function ensurePersistentStorage() {
    if (
      typeof navigator === "undefined" ||
      !navigator.storage ||
      typeof navigator.storage.persist !== "function"
    ) {
      return Promise.resolve(false);
    }
    return Promise.resolve()
      .then(function () {
        if (typeof navigator.storage.persisted === "function") {
          return navigator.storage.persisted();
        }
        return false;
      })
      .then(function (alreadyPersisted) {
        if (alreadyPersisted) {
          return true;
        }
        return navigator.storage.persist();
      })
      .catch(function () {
        return false;
      });
  }

  function estimateStorage() {
    if (
      typeof navigator === "undefined" ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== "function"
    ) {
      return Promise.resolve(null);
    }
    return navigator.storage
      .estimate()
      .then(function (result) {
        return { usage: result.usage, quota: result.quota };
      })
      .catch(function () {
        return null;
      });
  }

  window.Dabimas.logic.storage.combinationStorage = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE_NAME: STORE_NAME,
    CUSTOM_STORE_NAME: CUSTOM_STORE_NAME,
    openDB: openDB,
    saveConfig: saveConfig,
    loadConfigs: loadConfigs,
    deleteConfig: deleteConfig,
    getConfig: getConfig,
    updateConfigMemo: updateConfigMemo,
    saveCustomHorse: saveCustomHorse,
    loadCustomHorses: loadCustomHorses,
    getCustomHorse: getCustomHorse,
    deleteCustomHorse: deleteCustomHorse,
    updateCustomHorseMemo: updateCustomHorseMemo,
    ensurePersistentStorage: ensurePersistentStorage,
    estimateStorage: estimateStorage,
  };
})(window);
