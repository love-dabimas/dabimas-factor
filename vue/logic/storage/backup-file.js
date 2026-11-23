/**
 * このファイルの役割:
 * - ダビふぁくの保存データを 1 つの JSON ファイルにまとめて書き出す・読み込んで
 *   置き換える（#19）。
 *
 * 入れるもの:
 * - IndexedDB の 2 つのデータベースの全ストア（配合・作業枠・保存した配合・
 *   自家製馬・お気に入り・エディット種牡馬・子系統カラーなど）
 * - localStorage の設定（表示テーマ・馬のメモなど、dabimas で始まるキー）
 *   ただし控え（#20）と、最後に書き出した日は入れない。
 *
 * スマホでの保存:
 * - 共有メニュー（navigator.share）にファイルを渡す。iPhone は「"ファイル"に保存」、
 *   LINE・メールなどを選べる。ホーム画面に追加したアプリでは a[download] が
 *   うまく動かないことがあるので、スマホでは共有を先に使う。
 * - 共有は「タップした直後」でないと断られるので、ファイルは先に作っておき、
 *   保存ボタンを押したときには渡すだけにする（prepare → save の 2 段階）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.storage = window.Dabimas.logic.storage || {};

  var dataDump = window.Dabimas.logic.storage.dataDump;

  var FORMAT = "dabifaku-backup";
  var VERSION = 1;
  var LAST_BACKUP_KEY = "dabimasLastBackupAt";
  // 編集中の血統表（旧版の置き場所）。作業枠に入っているので要らない。
  var WORKING_KEYS = [
    "dabimasFactor",
    "dabimasFactorCategory",
    "dabimasMemo",
    "dabimasMemoStallion",
    "dabimasMemoBroodmare",
    "dabimasManualInbreed",
  ];

  function mirror() {
    return window.Dabimas.logic.storage.storageMirror;
  }

  function isSettingKey(key) {
    if (!key || key.indexOf("dabimas") !== 0) return false;
    if (key === LAST_BACKUP_KEY) return false;
    if (WORKING_KEYS.indexOf(key) >= 0) return false;
    var mirrorApi = mirror();
    if (mirrorApi && key.indexOf(mirrorApi.PREFIX) === 0) return false;
    return true;
  }

  function readSettings() {
    var result = {};
    for (var i = 0; i < window.localStorage.length; i++) {
      var key = window.localStorage.key(i);
      if (isSettingKey(key)) result[key] = window.localStorage.getItem(key);
    }
    return result;
  }

  function summarize(databases) {
    var unified = databases.unified || {};
    var combination = databases.combination || {};
    var count = function (rows) {
      return Array.isArray(rows) ? rows.length : 0;
    };
    return {
      categories: count(unified.categories),
      workspaces: count(unified.workspaces),
      configs: count(combination.configs),
      customHorses: count(combination.customHorses),
      favorites: count(unified.favorites),
      editStallions: count(unified.editStallions),
    };
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function fileName(date) {
    return (
      "dabifaku-backup-" +
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "-" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      ".json"
    );
  }

  // 書き出す中身を作る。開いている配合の最新の内容を先に書き戻してから読む。
  function prepare() {
    var sync = window.Dabimas.workspaceSync;
    var flush = sync && typeof sync.flushNow === "function" ? sync.flushNow() : Promise.resolve();
    return flush
      .catch(function () {})
      .then(function () {
        return Promise.all(
          dataDump.KEYS.map(function (key) {
            return dataDump.readStores(key);
          })
        );
      })
      .then(function (results) {
        var databases = {};
        dataDump.KEYS.forEach(function (key, index) {
          databases[key] = results[index];
        });
        var now = new Date();
        var payload = {
          format: FORMAT,
          version: VERSION,
          exportedAt: now.toISOString(),
          databases: databases,
          settings: readSettings(),
        };
        var text = JSON.stringify(payload);
        return {
          fileName: fileName(now),
          text: text,
          size: text.length,
          summary: summarize(databases),
        };
      });
  }

  function isMobile() {
    var ua = navigator.userAgent || "";
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    // iPadOS の Safari は Mac を名乗るので、タッチの有無で見分ける。
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  // prepare() の結果を保存する。保存ボタンのクリックの中から同期的に呼ぶこと。
  // 戻り値: "shared"（共有メニューで送った）/ "downloaded" / "cancelled"
  function save(prepared) {
    var blob = new Blob([prepared.text], { type: "application/json" });
    var file = null;
    try {
      file = new File([blob], prepared.fileName, { type: "application/json" });
    } catch (error) {
      file = null;
    }
    var canShare =
      file &&
      isMobile() &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShare) {
      return navigator
        .share({ files: [file], title: "ダビふぁくのバックアップ" })
        .then(function () {
          markBackedUp();
          return "shared";
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") return "cancelled";
          // 共有が使えなかったときはダウンロードに切り替える。
          download(blob, prepared.fileName);
          markBackedUp();
          return "downloaded";
        });
    }
    download(blob, prepared.fileName);
    markBackedUp();
    return Promise.resolve("downloaded");
  }

  function markBackedUp() {
    try {
      window.localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    } catch (error) {
      // 日付が残らなくてもバックアップそのものには関係ない。
    }
  }

  function lastBackupAt() {
    try {
      return window.localStorage.getItem(LAST_BACKUP_KEY);
    } catch (error) {
      return null;
    }
  }

  // ===== 読み込み =====

  function readFileText(file) {
    if (file && typeof file.text === "function") return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsText(file);
    });
  }

  // ファイルを読んで中身を確かめる。ダビふぁくのバックアップでなければ失敗にする。
  function parse(file) {
    return readFileText(file).then(function (text) {
      var payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error("ダビふぁくのバックアップのファイルではありません");
      }
      if (!payload || payload.format !== FORMAT || !payload.databases) {
        throw new Error("ダビふぁくのバックアップのファイルではありません");
      }
      if (payload.version > VERSION) {
        throw new Error("新しい版のダビふぁくで作ったファイルです。ページを更新してからもう一度お試しください");
      }
      var unified = payload.databases.unified || {};
      if (!Array.isArray(unified.categories) || !Array.isArray(unified.workspaces)) {
        throw new Error("ファイルの中身が壊れています");
      }
      return {
        payload: payload,
        exportedAt: payload.exportedAt,
        summary: summarize(payload.databases),
      };
    });
  }

  // いまのデータを、読み込んだファイルの内容で置き換える。終わったら呼び出し側で
  // ページを読み直す（画面の状態を全部作り直すため）。
  function restore(parsed) {
    var payload = parsed.payload;
    var sync = window.Dabimas.workspaceSync;
    // 置き換えた後で、開いていた配合の古い内容が書き戻されないよう止める。
    if (sync && typeof sync.detachForReload === "function") sync.detachForReload();
    var mirrorApi = mirror();
    if (mirrorApi) mirrorApi.stop();

    var unified = Object.assign({}, payload.databases.unified);
    unified.appMeta = (unified.appMeta || []).filter(function (row) {
      return row && row.key !== "migrationDone";
    });
    unified.appMeta.push({ key: "migrationDone", value: true });
    var combination = payload.databases.combination || {};

    return dataDump
      .replaceStores("unified", {
        categories: unified.categories || [],
        workspaces: unified.workspaces || [],
        appMeta: unified.appMeta,
        favorites: unified.favorites || [],
        editStallions: unified.editStallions || [],
      })
      .then(function () {
        return dataDump.replaceStores("combination", {
          configs: combination.configs || [],
          customHorses: combination.customHorses || [],
        });
      })
      .then(function () {
        var settings = payload.settings || {};
        Object.keys(settings).forEach(function (key) {
          if (!isSettingKey(key) || typeof settings[key] !== "string") return;
          try {
            window.localStorage.setItem(key, settings[key]);
          } catch (error) {
            console.warn("setting restore failed", key, error);
          }
        });
      });
  }

  window.Dabimas.logic.storage.backupFile = {
    prepare: prepare,
    save: save,
    parse: parse,
    restore: restore,
    lastBackupAt: lastBackupAt,
  };
})(window);
