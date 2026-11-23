/**
 * このファイルの役割:
 * - IndexedDB の中身の控えを localStorage に置き、IndexedDB が丸ごと消されたときに
 *   控えから戻す（#20）。
 *
 * なぜ localStorage か:
 * - Chrome は空き容量が減ると、保護されていないサイトの IndexedDB を消す。そのとき
 *   localStorage は残っていた（#17 の報告）。ただし iPhone の Safari は両方とも消す
 *   ので、そちらはバックアップのファイル（#19）で守る。
 *
 * 書き込みの拾い方:
 * - 書き込む場所がアプリのあちこちにあるので、IDBObjectStore の put / add / delete /
 *   clear を 1 か所で包み、ダビふぁくの 2 つのデータベースへの書き込みが確定
 *   （トランザクション完了）したら、触ったストアだけ読み直して控えを書き直す。
 * - 控えはストアごと、作業枠は 1 件ごとに別のキーにする。血統表を触るたびに
 *   全部を書き直すと、localStorage は書いている間画面が止まるので重くなる。
 *
 * 容量:
 * - localStorage は 1 サイトあたり約 520 万文字。控えは BUDGET 文字までにして、
 *   残りを他の設定に空けておく。保存した配合は大きい（1 件およそ 3 万文字）ので、
 *   新しいものから入るだけ入れる。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var dataDump = window.Dabimas.logic.storage.dataDump;

  var PREFIX = "dabimasMirror:";
  var META_KEY = PREFIX + "meta";
  var WORKSPACE_PREFIX = PREFIX + "ws:";
  var BUDGET = 3000000;
  var DEBOUNCE_MS = 1000;

  // データベース名 → dataDump のキー
  var WATCHED = {};
  dataDump.KEYS.forEach(function (key) {
    WATCHED[dataDump.databaseName(key)] = key;
  });

  var started = false;
  var disabled = false;
  var running = false;
  var rerun = false;
  var timer = null;
  // "unified/workspaces" のような「どのストアを読み直すか」
  var dirty = {};
  // 最後に書いた文字列（同じなら書かない）
  var written = {};

  function storeKey(dbKey, store) {
    return PREFIX + dbKey + ":" + store;
  }

  // ===== 書き込みを拾う =====

  var trackedTransactions = typeof WeakMap === "function" ? new WeakMap() : null;

  function track(objectStore) {
    if (!trackedTransactions) return;
    try {
      var tx = objectStore.transaction;
      var dbKey = WATCHED[tx.db.name];
      if (!dbKey) return;
      var touched = trackedTransactions.get(tx);
      if (!touched) {
        touched = {};
        trackedTransactions.set(tx, touched);
        tx.addEventListener("complete", function () {
          Object.keys(touched).forEach(function (id) {
            dirty[id] = true;
          });
          schedule();
        });
      }
      touched[dbKey + "/" + objectStore.name] = true;
    } catch (error) {
      // 控えのための処理なので、本来の書き込みは絶対に邪魔しない。
    }
  }

  function wrap(method) {
    var original = window.IDBObjectStore && window.IDBObjectStore.prototype[method];
    if (typeof original !== "function") return;
    window.IDBObjectStore.prototype[method] = function () {
      track(this);
      return original.apply(this, arguments);
    };
  }

  ["put", "add", "delete", "clear"].forEach(wrap);

  // ===== localStorage への書き込み =====

  function setItem(key, value) {
    // 起動して最初の書き直しでは手元に何も覚えていないので、いまの控えと比べる。
    // 中身が同じなら書かない（書くほうが読むよりずっと重い）。
    if (!(key in written)) written[key] = window.localStorage.getItem(key);
    if (written[key] === value) return;
    window.localStorage.setItem(key, value);
    written[key] = value;
  }

  // 別のタブが控えを書いたら、このタブの「最後に書いた中身」は当てにならないので忘れる。
  // 覚えたままだと「同じだから書かない」と判断して、控えが古いまま残ることがある。
  window.addEventListener("storage", function (event) {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    if (event.key === null) {
      written = {};
    } else if (event.key.indexOf(PREFIX) === 0) {
      delete written[event.key];
    }
  });

  function removeItem(key) {
    window.localStorage.removeItem(key);
    delete written[key];
  }

  function mirrorKeys() {
    var keys = [];
    for (var i = 0; i < window.localStorage.length; i++) {
      var key = window.localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) keys.push(key);
    }
    return keys;
  }

  function usedExcept(skipKey) {
    return mirrorKeys().reduce(function (sum, key) {
      if (key === skipKey) return sum;
      return sum + key.length + (window.localStorage.getItem(key) || "").length;
    }, 0);
  }

  function writeWorkspaces(records) {
    var alive = {};
    records.forEach(function (record) {
      var key = WORKSPACE_PREFIX + record.id;
      alive[key] = true;
      setItem(key, JSON.stringify(record));
    });
    mirrorKeys().forEach(function (key) {
      if (key.indexOf(WORKSPACE_PREFIX) === 0 && !alive[key]) removeItem(key);
    });
  }

  // 保存した配合は新しい順に、残りの容量に入るだけ入れる。
  function writeConfigs(records) {
    var key = storeKey("combination", "configs");
    var room = BUDGET - usedExcept(key) - key.length;
    var sorted = records.slice().sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    var picked = [];
    var size = 2;
    for (var i = 0; i < sorted.length; i++) {
      var length = JSON.stringify(sorted[i]).length + 1;
      if (size + length > room) break;
      picked.push(sorted[i]);
      size += length;
    }
    setItem(key, JSON.stringify(picked));
    return { total: records.length, included: picked.length };
  }

  function writeStore(dbKey, store, records, meta) {
    if (dbKey === "unified" && store === "workspaces") {
      writeWorkspaces(records);
    } else if (dbKey === "combination" && store === "configs") {
      var counts = writeConfigs(records);
      meta.configsTotal = counts.total;
      meta.configsIncluded = counts.included;
    } else {
      setItem(storeKey(dbKey, store), JSON.stringify(records));
    }
  }

  function readMeta() {
    try {
      return JSON.parse(window.localStorage.getItem(META_KEY) || "null") || {};
    } catch (error) {
      return {};
    }
  }

  function isQuotaError(error) {
    return error && (error.name === "QuotaExceededError" || error.code === 22);
  }

  // 触ったストアだけ読み直して控えを書き直す。
  function rebuild() {
    var targets = dirty;
    dirty = {};
    var byDb = {};
    Object.keys(targets).forEach(function (id) {
      var parts = id.split("/");
      (byDb[parts[0]] = byDb[parts[0]] || []).push(parts[1]);
    });
    return Promise.all(
      Object.keys(byDb).map(function (dbKey) {
        return dataDump.readStores(dbKey, byDb[dbKey]).then(function (data) {
          return { dbKey: dbKey, data: data };
        });
      })
    ).then(function (results) {
      var meta = readMeta();
      // 配合（保存したもの）は容量の残りで決まるので、最後に書く。
      var later = [];
      results.forEach(function (result) {
        Object.keys(result.data).forEach(function (store) {
          var item = { dbKey: result.dbKey, store: store, records: result.data[store] };
          if (item.dbKey === "combination" && item.store === "configs") later.push(item);
          else writeOne(item, meta);
        });
      });
      later.forEach(function (item) {
        writeOne(item, meta);
      });
      meta.v = 1;
      meta.savedAt = new Date().toISOString();
      setItem(META_KEY, JSON.stringify(meta));
    });
  }

  function writeOne(item, meta) {
    try {
      writeStore(item.dbKey, item.store, item.records, meta);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      // 入らないときは、いちばん大きい「保存した配合」を空けてもう一度だけ試す。
      // 配合の控えは次に配合を保存したときに入るだけ入れ直す。
      setItem(storeKey("combination", "configs"), "[]");
      meta.configsIncluded = 0;
      writeStore(item.dbKey, item.store, item.records, meta);
    }
  }

  function schedule() {
    if (!started || disabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  function run() {
    timer = null;
    if (running) {
      rerun = true;
      return;
    }
    if (!Object.keys(dirty).length) return;
    running = true;
    rebuild()
      .catch(function (error) {
        console.warn("storage mirror failed", error);
      })
      .then(function () {
        running = false;
        if (rerun) {
          rerun = false;
          run();
        }
      });
  }

  function markAllDirty() {
    dataDump.KEYS.forEach(function (dbKey) {
      dataDump.storeNames(dbKey).forEach(function (store) {
        dirty[dbKey + "/" + store] = true;
      });
    });
  }

  // 起動が終わってから控えを書き始める。最初の 1 回は全部書く（控えがまだ無い人や、
  // 控えから戻した直後でも、今のデータベースの中身にそろえる）。
  // 画面が出るのを邪魔しないよう、少し待ってから書く。
  var START_DELAY_MS = 3000;

  function start() {
    if (started || disabled) return;
    started = true;
    markAllDirty();
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, START_DELAY_MS);
  }

  // ===== 控えから戻す =====

  function parse(key) {
    var raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function readMirror() {
    var unified = {};
    dataDump.storeNames("unified").forEach(function (store) {
      if (store === "workspaces") return;
      unified[store] = parse(storeKey("unified", store)) || [];
    });
    unified.workspaces = mirrorKeys()
      .filter(function (key) {
        return key.indexOf(WORKSPACE_PREFIX) === 0;
      })
      .map(parse);
    var combination = {};
    dataDump.storeNames("combination").forEach(function (store) {
      combination[store] = parse(storeKey("combination", store)) || [];
    });
    return { unified: unified, combination: combination, meta: readMeta() };
  }

  // workspace-sync.js の起動の最初に呼ばれる。データベースが空（初めて開いた、
  // またはブラウザに消された）で、控えに配合があるときだけ戻す。
  // 戻したら { configsTotal, configsIncluded } を、戻さなかったら null を返す。
  function restoreIfWiped() {
    var mirror;
    try {
      if (!window.localStorage.getItem(META_KEY)) return Promise.resolve(null);
      mirror = readMirror();
    } catch (error) {
      console.warn("storage mirror unreadable", error);
      return Promise.resolve(null);
    }
    if (!mirror.unified.categories.length) return Promise.resolve(null);

    return dataDump.isEmpty("unified").then(function (unifiedEmpty) {
      if (!unifiedEmpty) return null;
      var hasMigrationFlag = mirror.unified.appMeta.some(function (row) {
        return row && row.key === "migrationDone";
      });
      if (!hasMigrationFlag) {
        mirror.unified.appMeta.push({ key: "migrationDone", value: true });
      }
      return dataDump
        .replaceStores("unified", mirror.unified)
        .then(function () {
          // 保存した配合と自家製馬は、データベースが空のときだけ戻す（自分で全部
          // 消した人のところへ勝手に戻さない）。
          return dataDump.isEmpty("combination");
        })
        .then(function (combinationEmpty) {
          if (combinationEmpty) {
            return dataDump.replaceStores("combination", mirror.combination);
          }
        })
        .then(function () {
          return {
            configsTotal: mirror.meta.configsTotal || 0,
            configsIncluded: mirror.meta.configsIncluded || 0,
          };
        })
        .catch(function (error) {
          // 戻しに失敗した控えを、空のデータベースで上書きしないよう止める。
          disabled = true;
          throw error;
        });
    });
  }

  // バックアップを読み込むときなど、控えを書かずに再読み込みしたいときに使う。
  function stop() {
    disabled = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  window.Dabimas.logic.storage.storageMirror = {
    PREFIX: PREFIX,
    BUDGET: BUDGET,
    start: start,
    stop: stop,
    restoreIfWiped: restoreIfWiped,
    readMeta: readMeta,
    // 検証用: 待たずに今すぐ書く
    flush: function () {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!Object.keys(dirty).length) return Promise.resolve();
      return rebuild();
    },
  };
})(window);
