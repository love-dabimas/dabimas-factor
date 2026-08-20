/**
 * このファイルの役割:
 * - 配合保存ダイアログ（CombinationDialog）まわりの保存・一覧取得・復元
 *   （combinationDialog, handleCombinationCellClick, onCombinationRestore,
 *   fetchSavedCombinations, enforceCombinationLimit, applySavedCombination）。
 * - localStorage への保存/削除の薄いラッパ（setOrRemoveLocalStorage）と、
 *   手動クロス（インブリード強制表示）の永続化・復元
 *   （persistManualInbreedState, clearManualInbreedForIndex,
 *   restoreManualInbreedState）。
 * - リロード・復元後にローカルデータを作り直す refreshLocalDataFromStorage。
 *
 * このファイルに置かない処理:
 * - 血統計算、インブリード判定そのもの。
 * - IndexedDB のスキーマ定義（vue/CombinationDialog.js /
 *   vue/logic/storage/combination-storage.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   配合保存・手動クロス永続化まわりだけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-2）。
 *
 * 発見メモ（直さずそのまま移動）:
 * - fetchSavedCombinations / enforceCombinationLimit は COMBINATION_STORE_NAME
 *   という、index.html のどこにも宣言されていない変数を参照している
 *   （未定義参照＝呼ばれれば ReferenceError）。ただし両メソッドとも
 *   コードベースのどこからも呼び出されていない到達不能コードのため、
 *   実害はない。逐語移動原則により、ここで定義を足す等の修正はしない。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりメソッド本体を1文字も変えずに移動できる（逐語移動原則）。
  var MANUAL_INBREED_STORAGE_KEY = "dabimasManualInbreed";

  Object.assign(window.Dabimas.app.methods, {
        combinationDialog: function () {
          console.log('combinationDialog called');
          this.combinationDialogVisible = true;
          console.log('combinationDialogVisible set to:', this.combinationDialogVisible);
        },
        handleCombinationCellClick: function () {
          // 常にダイアログを開く（中身の活性/非活性はallHorsesSetで制御）
          this.combinationDialog();
        },
        onCombinationRestore: function (configData) {
          // localStorageには既にコンポーネント内で復元済み
          // 画面を再読み込み
          this.restoreInputData();
          
          if (configData.dabimasMemo) {
            const parseArray = JSON.parse(configData.dabimasMemo);
            this.inputed = parseArray;
          }
          if (configData.dabimasMemoStallion) {
            this.inputedMemoStallion = configData.dabimasMemoStallion;
          }
          if (configData.dabimasMemoBroodmare) {
            this.inputedMemoBroodmare = configData.dabimasMemoBroodmare;
          }
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        fetchSavedCombinations: function () {
          return new Promise((resolve, reject) => {
            if (!this.combinationDb) {
              this.savedCombinations = [];
              resolve([]);
              return;
            }
            const transaction = this.combinationDb.transaction(
              [COMBINATION_STORE_NAME],
              "readonly"
            );
            transaction.onerror = (event) => {
              reject(event.target.error);
            };
            const store = transaction.objectStore(COMBINATION_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
              const rows = (request.result || []).sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              this.savedCombinations = rows;
              resolve(rows);
            };
            request.onerror = (event) => {
              reject(event.target.error);
            };
          });
        },
        enforceCombinationLimit: function (maxCount = 10) {
          return new Promise((resolve, reject) => {
            if (!this.combinationDb) {
              resolve();
              return;
            }
            const transaction = this.combinationDb.transaction(
              [COMBINATION_STORE_NAME],
              "readwrite"
            );
            const store = transaction.objectStore(COMBINATION_STORE_NAME);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) =>
              reject(event.target.error || new Error("transaction error"));
            const request = store.getAll();
            request.onsuccess = () => {
              const rows = request.result || [];
              if (rows.length <= maxCount) {
                return;
              }
              const sorted = rows
                .slice()
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
              const deleteTargets = sorted.slice(0, rows.length - maxCount);
              deleteTargets.forEach((item) => {
                if (item?.id !== undefined) {
                  store.delete(item.id);
                }
              });
            };
            request.onerror = (event) =>
              reject(event.target.error || new Error("request error"));
          });
        },
        applySavedCombination: async function (record) {
          if (!window.localStorage) {
            return;
          }
          const snapshot = record || {};
          this.setOrRemoveLocalStorage("dabimasFactor", snapshot.factor);
          this.setOrRemoveLocalStorage(
            "dabimasFactorCategory",
            snapshot.factorCategory
          );
          this.setOrRemoveLocalStorage("dabimasMemo", snapshot.memo);
          this.setOrRemoveLocalStorage(
            "dabimasMemoStallion",
            snapshot.memoStallion
          );
          this.setOrRemoveLocalStorage(
            "dabimasMemoBroodmare",
            snapshot.memoBroodmare
          );
          this.setOrRemoveLocalStorage(
            MANUAL_INBREED_STORAGE_KEY,
            snapshot.manualInbreed
          );
          await this.refreshLocalDataFromStorage();
        },
        setOrRemoveLocalStorage: function (key, value) {
          window.Dabimas.logic.storage.localStorage.setOrRemove(key, value);
        },
        persistManualInbreedState: function () {
          if (typeof window === "undefined" || !window.localStorage) {
            return;
          }
          const manualIndexes =
            window.Dabimas.logic.storage.localStorage.computeManualInbreedIndexesFromList(
              this.inbreedList
            );
          window.Dabimas.logic.storage.localStorage.writeManualInbreedIndexes(
            manualIndexes
          );
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        clearManualInbreedForIndex: function (index) {
          if (
            typeof window === "undefined" ||
            !window.localStorage ||
            !Number.isInteger(index)
          ) {
            return;
          }
          const manualIndexes =
            window.Dabimas.logic.storage.localStorage.readManualInbreedIndexes();
          if (!manualIndexes) {
            return;
          }
          const filtered =
            window.Dabimas.logic.storage.localStorage.removeIndexFromManualInbreedIndexes(
              manualIndexes,
              index
            );
          window.Dabimas.logic.storage.localStorage.writeManualInbreedIndexes(
            filtered
          );
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        restoreManualInbreedState: function () {
          if (typeof window === "undefined" || !window.localStorage) {
            return;
          }
          const manualIndexes =
            window.Dabimas.logic.storage.localStorage.readManualInbreedIndexes();
          if (!manualIndexes) {
            return;
          }
          let hasUpdates = false;
          manualIndexes.forEach((value) => {
            const index = Number(value);
            if (!Number.isInteger(index) || index < 0 || index >= this.inbreedList.length) {
              return;
            }
            const base = this.selected[index];
            if (!base) {
              return;
            }
            this.$set(this.inbreedList, index, {
              ...base,
              selfInbreed: true,
            });
            this.$set(this.isInbreedButtonClicked, index, 1);
            this.$set(this.dispColor, index, "inbreed");
            hasUpdates = true;
          });
          if (hasUpdates) {
            this.dispInbreedFactorCounts();
          }
        },
        refreshLocalDataFromStorage: async function () {
          if (!window.localStorage) {
            return;
          }
          this.deferInbreedCount = true;
          this.deferredInbreedCountRequested = false;
          try {
            if (JSON.parse(localStorage.getItem("dabimasFactor"))) {
              await this.restoreInputData();
            }
            if (JSON.parse(localStorage.getItem("dabimasMemo"))) {
              const parseArray = JSON.parse(localStorage.getItem("dabimasMemo"));
              this.inputed = parseArray;
            } else {
              this.inputed = Array.from(new Array(32).fill(null));
            }
            if (localStorage.getItem("dabimasMemoStallion")) {
              this.inputedMemoStallion = localStorage.getItem(
                "dabimasMemoStallion"
              );
            } else {
              this.inputedMemoStallion = null;
            }
            if (localStorage.getItem("dabimasMemoBroodmare")) {
              this.inputedMemoBroodmare = localStorage.getItem(
                "dabimasMemoBroodmare"
              );
            } else {
              this.inputedMemoBroodmare = null;
            }
            this.restoreManualInbreedState();
          } finally {
            this.deferInbreedCount = false;
            if (this.deferredInbreedCountRequested) {
              this.dispInbreedFactorCounts();
            }
          }
        },
  });
})(window, window.Vue);
