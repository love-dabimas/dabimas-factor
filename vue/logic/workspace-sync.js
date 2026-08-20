/**
 * このファイルの役割:
 * - 統合版のオーケストレーション層。localStorage 6キー（アクティブ作業枠の
 *   バッファ）と IndexedDB "dabifaku_unified"（workspaces.snapshot）の
 *   相互同期、起動時の移行チェック・画面決定、画面切替シーケンスをまとめる
 *   （docs/dabifaku_unified_spec_draft.md §5, §9.1, §15）。
 * - home-page / category-dialog / workspace-tab-bar が参照する軽量な
 *   リアクティブ状態（window.Dabimas.workspaceSync.state）を提供する
 *   （Vuex は使わず Vue.observable で代替）。
 *
 * このファイルに置かない処理:
 * - IndexedDB の生の読み書き（vue/logic/storage/*-repository.js の仕事）。
 * - ダビふぁく本体の血統計算・UI（本体側のコードは一切呼び出し以外で触れない）。
 *
 * 本体との接点:
 * - 本体の root app インスタンスは window.__debugAppInstance に保持されている
 *   （vue/app/main.js が既に同名でグローバル公開している既存パターン）。
 *   ここではそれを掴んで .currentScreen の代入と
 *   .refreshLocalDataFromStorage() / .scheduleInitialMobileViewportLayout() の
 *   呼び出しだけを行う。本体側に新しいメソッドは追加しない。
 * - boot() は vue/app/main.js から new Vue(...) の前に呼ばれる想定
 *   （起動時点で localStorage 6キーを正しいアクティブ作業枠の内容にしてから
 *   本体の起動シーケンス c1→dbinitializer→c4 に読ませるため）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};

  var unifiedDb = window.Dabimas.logic.storage.unifiedDb;
  var categoryRepo = window.Dabimas.repositories.categories;
  var workspaceRepo = window.Dabimas.repositories.workspaces;
  var appMetaRepo = window.Dabimas.repositories.appMeta;
  var localStorageHelper = window.Dabimas.logic.storage.localStorage;

  // snapshot の短縮キー名 ⇔ localStorage の実キー名の対応（統合版仕様 §12.2）。
  var SNAPSHOT_KEY_MAP = {
    factor: "dabimasFactor",
    factorCategory: "dabimasFactorCategory",
    memo: "dabimasMemo",
    memoStallion: "dabimasMemoStallion",
    memoBroodmare: "dabimasMemoBroodmare",
    manualInbreed: "dabimasManualInbreed",
  };

  var state = Vue.observable({
    dbUnavailable: false,
    categories: [],
    workspaceCounts: {},
    activeCategoryId: null,
    activeCategoryName: null,
    workspaces: [],
    activeWorkspaceId: null,
  });

  var flushDebounceTimer = null;
  var lastFlushedSnapshotString = null;

  function readSnapshotFromLocalStorage() {
    var snapshot = {};
    Object.keys(SNAPSHOT_KEY_MAP).forEach(function (shortKey) {
      snapshot[shortKey] = window.localStorage.getItem(SNAPSHOT_KEY_MAP[shortKey]);
    });
    return snapshot;
  }

  function injectSnapshot(snapshot) {
    var source = snapshot || {};
    Object.keys(SNAPSHOT_KEY_MAP).forEach(function (shortKey) {
      localStorageHelper.setOrRemove(SNAPSHOT_KEY_MAP[shortKey], source[shortKey]);
    });
  }

  function hasAnyLegacyData(snapshot) {
    return Object.keys(SNAPSHOT_KEY_MAP).some(function (shortKey) {
      return snapshot[shortKey] !== null && snapshot[shortKey] !== undefined;
    });
  }

  function getRootApp() {
    return window.__debugAppInstance || null;
  }

  function setRootScreen(screen) {
    var root = getRootApp();
    if (root) {
      root.currentScreen = screen;
    }
  }

  // 本体の refreshLocalDataFromStorage() は dabimasFactor が null のとき
  // selected/category/horses 等の血統表状態を空へリセットする分岐を持たない
  // （既存の呼び出し元は「起動直後（既に空）」か「保存済み配合の復元（常に
  // 値あり）」のみだったため、この分岐が無くても問題が表面化しなかった）。
  // 空 snapshot の作業枠へ切り替えると、これが原因で前の作業枠の血統表が
  // 残ってしまう。本体側の同メソッドは変更できないため、その場合だけ
  // 本体の既存公開メソッド initializer()（リセットボタンと同じフルリセット）
  // を先に呼んでから対象 snapshot を再注入する（initializer() は
  // localStorage も消してしまうため、注入し直しが必要）。
  function refreshRootApp(snapshot) {
    var root = getRootApp();
    if (!root) {
      return Promise.resolve();
    }
    var needsFullReset = !snapshot || !snapshot.factor;
    if (needsFullReset && typeof root.initializer === "function") {
      root.initializer();
      injectSnapshot(snapshot);
    }
    if (typeof root.refreshLocalDataFromStorage !== "function") {
      return Promise.resolve();
    }
    return Promise.resolve(root.refreshLocalDataFromStorage());
  }

  function relayoutRootAppViewport() {
    var root = getRootApp();
    if (!root || typeof root.scheduleInitialMobileViewportLayout !== "function") {
      return;
    }
    Vue.nextTick(function () {
      root.scheduleInitialMobileViewportLayout();
    });
  }

  // ===== flush（localStorage 6キー → アクティブ作業枠 snapshot）=====

  function flushNow() {
    if (flushDebounceTimer) {
      clearTimeout(flushDebounceTimer);
      flushDebounceTimer = null;
    }
    if (!state.activeWorkspaceId) {
      return Promise.resolve();
    }
    var snapshot = readSnapshotFromLocalStorage();
    var snapshotString = JSON.stringify(snapshot);
    if (snapshotString === lastFlushedSnapshotString) {
      return Promise.resolve();
    }
    var workspaceId = state.activeWorkspaceId;
    return workspaceRepo.saveSnapshot(workspaceId, snapshot).then(function () {
      lastFlushedSnapshotString = snapshotString;
      var cached = state.workspaces.find(function (w) {
        return w.id === workspaceId;
      });
      if (cached) {
        cached.snapshot = snapshot;
      }
    });
  }

  function notifyLocalChange() {
    if (flushDebounceTimer) {
      clearTimeout(flushDebounceTimer);
    }
    flushDebounceTimer = setTimeout(function () {
      flushDebounceTimer = null;
      flushNow().catch(function (error) {
        console.error("flush failed", error);
      });
    }, 500);
  }

  window.addEventListener("pagehide", function () {
    flushNow().catch(function (error) {
      console.error("flush failed (pagehide)", error);
    });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      flushNow().catch(function (error) {
        console.error("flush failed (visibilitychange)", error);
      });
    }
  });

  // ===== 画面遷移の中核: 指定した作業枠を localStorage へ注入し本体を再構築する =====
  // (flush は呼び出し側の責務。ここでは「切替先へ適用する」ことだけを行う。)
  function applyWorkspace(workspaceId) {
    var workspace = state.workspaces.find(function (w) {
      return w.id === workspaceId;
    });
    if (!workspace) {
      return Promise.reject(new Error("workspace not found: " + workspaceId));
    }
    injectSnapshot(workspace.snapshot);
    lastFlushedSnapshotString = JSON.stringify(readSnapshotFromLocalStorage());
    state.activeWorkspaceId = workspaceId;
    return refreshRootApp(workspace.snapshot).then(function () {
      return categoryRepo.update(state.activeCategoryId, {
        lastActiveWorkspaceId: workspaceId,
      });
    });
  }

  function loadCategoryIntoState(category) {
    return workspaceRepo.getByCategory(category.id).then(function (workspaces) {
      var activeWorkspace =
        workspaces.find(function (w) {
          return w.id === category.lastActiveWorkspaceId;
        }) || workspaces[0];
      state.activeCategoryId = category.id;
      state.activeCategoryName = category.name;
      state.workspaces = workspaces;
      state.activeWorkspaceId = activeWorkspace ? activeWorkspace.id : null;
      if (activeWorkspace) {
        injectSnapshot(activeWorkspace.snapshot);
        lastFlushedSnapshotString = JSON.stringify(readSnapshotFromLocalStorage());
      }
      return activeWorkspace;
    });
  }

  function loadHomeState() {
    return Promise.all([categoryRepo.getAll(), workspaceRepo.countsByCategory()]).then(
      function (results) {
        state.categories = results[0];
        state.workspaceCounts = results[1];
      }
    );
  }

  // ===== 起動時の移行チェック（統合版仕様 §15.2）=====
  // categories + workspaces + appMeta(migrationDone=true) を単一トランザクションで
  // 保存する（移行成功前に migrationDone を true にしないため。§15.2）。
  function migrateLegacyData(snapshot) {
    return unifiedDb.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(
          [
            unifiedDb.CATEGORY_STORE_NAME,
            unifiedDb.WORKSPACE_STORE_NAME,
            unifiedDb.APP_META_STORE_NAME,
          ],
          "readwrite"
        );
        var categoryStore = tx.objectStore(unifiedDb.CATEGORY_STORE_NAME);
        var workspaceStore = tx.objectStore(unifiedDb.WORKSPACE_STORE_NAME);
        var appMetaStore = tx.objectStore(unifiedDb.APP_META_STORE_NAME);
        var timestamp = new Date().toISOString();

        var category = {
          id: unifiedDb.generateUuid(),
          name: "既存データ",
          iconKey: "mdi-folder",
          sortOrder: 0,
          lastActiveWorkspaceId: null,
          isSystemGenerated: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        var workspace = {
          id: unifiedDb.generateUuid(),
          categoryId: category.id,
          sortOrder: 0,
          snapshot: snapshot,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        category.lastActiveWorkspaceId = workspace.id;

        categoryStore.put(category);
        workspaceStore.put(workspace);
        appMetaStore.put({ key: "migrationDone", value: true });
        appMetaStore.put({ key: "schemaVersion", value: 1 });

        tx.oncomplete = function () {
          resolve({ category: category, workspace: workspace });
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function runMigrationCheck() {
    return appMetaRepo.get("migrationDone").then(function (migrationDone) {
      if (migrationDone) {
        return false;
      }
      var snapshot = readSnapshotFromLocalStorage();
      if (!hasAnyLegacyData(snapshot)) {
        return appMetaRepo
          .set("migrationDone", true)
          .then(function () {
            return appMetaRepo.set("schemaVersion", 1);
          })
          .then(function () {
            return false;
          });
      }
      return migrateLegacyData(snapshot).then(function () {
        return true;
      });
    });
  }

  // ===== 起動シーケンス（統合版仕様 §9.1）=====
  // vue/app/main.js から new Vue(...) より前に呼ばれる。解決時点で
  // localStorage が正しいアクティブ作業枠の内容になっていることを保証する。
  function boot() {
    return unifiedDb
      .openDB()
      .then(function () {
        return runMigrationCheck();
      })
      .then(function (justMigrated) {
        return categoryRepo.getAll().then(function (categories) {
          state.categories = categories;
          if (justMigrated) {
            // 移行直後の初回のみホームを表示する（統合版仕様 §15.2）。
            return workspaceRepo.countsByCategory().then(function (counts) {
              state.workspaceCounts = counts;
              return "home";
            });
          }
          return appMetaRepo.get("lastOpenedCategoryId").then(function (lastOpenedCategoryId) {
            var activeCategory = categories.find(function (c) {
              return c.id === lastOpenedCategoryId;
            });
            if (!activeCategory) {
              return workspaceRepo.countsByCategory().then(function (counts) {
                state.workspaceCounts = counts;
                return "home";
              });
            }
            return loadCategoryIntoState(activeCategory).then(function () {
              return "category";
            });
          });
        });
      })
      .then(function (currentScreen) {
        window.Dabimas.workspaceSync.resolvedInitialScreen = currentScreen;
        return { currentScreen: currentScreen };
      })
      .catch(function (error) {
        console.error("workspace-sync boot failed", error);
        state.dbUnavailable = true;
        window.Dabimas.workspaceSync.resolvedInitialScreen = "category";
        return { currentScreen: "category" };
      });
  }

  // ===== 画面切替（統合版仕様 §5.3, §9.4, §10.1）=====

  function switchToWorkspace(workspaceId) {
    if (workspaceId === state.activeWorkspaceId) {
      return Promise.resolve();
    }
    return flushNow().then(function () {
      return applyWorkspace(workspaceId);
    });
  }

  function switchToCategory(categoryId) {
    var resolvedWorkspace = null;
    return flushNow().then(function () {
      var category = state.categories.find(function (c) {
        return c.id === categoryId;
      });
      if (!category) {
        return Promise.reject(new Error("category not found: " + categoryId));
      }
      return loadCategoryIntoState(category).then(function (activeWorkspace) {
        resolvedWorkspace = activeWorkspace;
        return appMetaRepo.set("lastOpenedCategoryId", categoryId);
      });
    }).then(function () {
      return refreshRootApp(resolvedWorkspace ? resolvedWorkspace.snapshot : null);
    }).then(function () {
      setRootScreen("category");
      relayoutRootAppViewport();
    });
  }

  function goHome() {
    return flushNow()
      .then(function () {
        setRootScreen("home");
        return loadHomeState();
      });
  }

  // ===== カテゴリ CRUD（統合版仕様 §10）=====

  function addCategory(options) {
    return categoryRepo.create(options).then(function (result) {
      return loadHomeState().then(function () {
        return switchToCategory(result.category.id).then(function () {
          return result;
        });
      });
    });
  }

  function updateCategory(id, patch) {
    var updatedCategory = null;
    return categoryRepo
      .update(id, patch)
      .then(function (updated) {
        updatedCategory = updated;
        if (updated && state.activeCategoryId === id) {
          state.activeCategoryName = updated.name;
        }
        return loadHomeState();
      })
      .then(function () {
        return updatedCategory;
      });
  }

  function reorderCategories(orderedIds) {
    return categoryRepo.reorder(orderedIds).then(function () {
      return loadHomeState();
    });
  }

  function removeCategory(id) {
    return categoryRepo.remove(id).then(function () {
      var clearLastOpened = Promise.resolve();
      if (state.activeCategoryId === id) {
        state.activeCategoryId = null;
        state.activeCategoryName = null;
        state.activeWorkspaceId = null;
        state.workspaces = [];
        clearLastOpened = appMetaRepo.set("lastOpenedCategoryId", null);
      }
      return clearLastOpened;
    }).then(function () {
      return loadHomeState();
    });
  }

  // ===== 作業枠 CRUD（統合版仕様 §11）=====

  function addWorkspace() {
    return flushNow()
      .then(function () {
        return workspaceRepo.create(state.activeCategoryId);
      })
      .then(function (workspace) {
        state.workspaces.push(workspace);
        return applyWorkspace(workspace.id);
      });
  }

  function removeWorkspace(workspaceId) {
    if (state.workspaces.length <= 1) {
      return Promise.reject(new Error("最後の作業枠は削除できません"));
    }
    var deletedIndex = state.workspaces.findIndex(function (w) {
      return w.id === workspaceId;
    });
    var wasActive = state.activeWorkspaceId === workspaceId;
    return workspaceRepo.remove(workspaceId).then(function (remaining) {
      state.workspaces = remaining;
      if (!wasActive) {
        return;
      }
      // 削除位置に繰り上がった枠（末尾削除時は新しい末尾）へ切替。
      // ※ flush は行わない（削除された枠の内容を書き戻さない。統合版仕様 §11.2）。
      var nextIndex = Math.min(deletedIndex, remaining.length - 1);
      var next = remaining[nextIndex];
      if (!next) {
        return;
      }
      return applyWorkspace(next.id);
    });
  }

  window.Dabimas.workspaceSync = {
    state: state,
    resolvedInitialScreen: null,
    boot: boot,
    notifyLocalChange: notifyLocalChange,
    flushNow: flushNow,
    switchToWorkspace: switchToWorkspace,
    switchToCategory: switchToCategory,
    goHome: goHome,
    addCategory: addCategory,
    updateCategory: updateCategory,
    reorderCategories: reorderCategories,
    removeCategory: removeCategory,
    addWorkspace: addWorkspace,
    removeWorkspace: removeWorkspace,
  };
})(window, window.Vue);
