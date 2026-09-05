/**
 * このファイルの役割:
 * - root app の computed（rowConfigsOptimized 〜 rowDisplayOptions）と
 *   watch（dispCategory）をまとめる。
 * - pedigree-row / horse-cell へ橋渡しする値の詰め合わせ
 *   （selectionArraysForRowState, horseSelectionOptions,
 *   rowDisplayOptions）と、種牡馬側・繁殖牝馬側の rowState 生成
 *   （stallionRowStates, broodmareRowStates）。
 *
 * このファイルに置かない処理:
 * - data() の初期値（vue/app/app-state.js の仕事）。
 * - メソッド本体（vue/app/methods/*.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   computed / watch だけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-9）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};

  window.Dabimas.app.computed = {
        // 頻繁に使用される計算をキャッシュ
        rowConfigsOptimized() {
          // rowConfigsは変更されないのでフリーズ
          return this.rowConfigs;
        },
        // カテゴリー番号の文字列表現（キャッシュ）
        categoryNumComputed() {
          const allSet = this.selected.every((e) => e) ? 0 : -1;
          return (new Set(this.category).size + allSet).toString();
        },
        // すべての馬がセットされているか（キャッシュ）
        allHorsesSet() {
          return this.selected.every((e) => e);
        },
        affinityScore() {
          if (!this.nicksReady) return null;

          try {
            return window.Dabimas.logic.theory.calculateAffinity({
              selected: this.selected,
              parentLines: this.parentLines,
              category: this.category,
              inbreedList: this.inbreedList,
            });
          } catch (error) {
            return null;
          }
        },
        affinityDisplayText() {
          switch (this.affinityScore) {
            case 1:
              return "完璧";
            case 2:
              return "優れた";
            case 3:
              return "良い";
            case 4:
              return "程々";
            default:
              return "--";
          }
        },
        // 工程診断: 現在の血統表のハッシュ。診断結果はこれと一致する間だけ有効
        //（種牡馬・繁殖牝馬・血統セルのどれが変わってもずれる。仕様 §13）。
        planCurrentSnapshotHash() {
          return window.Dabimas.logic.plan.createSnapshotHash(this.selected);
        },
        // 現在の選択に対して有効な診断結果だけを返す。古い結果はここで捨てる。
        planDiagnosisResult() {
          const result = this.planDiagnosis;
          if (!result || result.status !== "completed") {
            return null;
          }
          return result.snapshotHash === this.planCurrentSnapshotHash ? result : null;
        },
        planEmptyCellCount() {
          return this.selected.filter((entry) => !entry || !entry.name).length;
        },
        planDiagnosisState() {
          if (this.planDiagnosisRunning) {
            return "RUNNING";
          }
          if (this.planEmptyCellCount > 0) {
            return "INCOMPLETE";
          }
          const result = this.planDiagnosisResult;
          if (!result) {
            return "READY";
          }
          if (result.summary.totalDangerCount > 0) {
            return "DANGER";
          }
          // 判定不能（データ不足）は安全側にまとめる。安全と危険以外の状態は
          // 出さない（危険が分かるところだけ拾えれば十分という運用判断）。
          return "SAFE";
        },
        // 色が判別できなくても状態が分かるよう、必ず文字を出す（仕様 UI-08）。
        planDiagnosisBadgeText() {
          const result = this.planDiagnosisResult;
          switch (this.planDiagnosisState) {
            case "RUNNING":
              return "診断中";
            case "INCOMPLETE":
              return "残り" + this.planEmptyCellCount + "枠";
            case "READY":
              return "未診断";
            case "SAFE":
              return "危険0";
            case "DANGER":
              return "危険" + result.summary.totalDangerCount;
            default:
              return "";
          }
        },
        planDiagnosisDisabled() {
          return this.planDiagnosisState === "INCOMPLETE" ||
            this.planDiagnosisState === "RUNNING";
        },
        // ⚠ を出す血統セル。診断結果を参照するだけで、ここでは危険判定をやり直さない
        //（仕様 §16.2）。
        planDangerCellIndexes() {
          const result = this.planDiagnosisResult;
          return result ? result.summary.dangerCellIndexes : [];
        },
        isCompactMobileLayout() {
          return this.$vuetify.breakpoint.smAndDown;
        },
        combinationCellStyle() {
          // 常にダイアログを開けるようにする
          return {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            cursor: "pointer",
          };
        },
        // pedigree-row（vue/logic/pedigree/pedigree-selection.js）が rowState を作るのに
        // 必要な32行ぶんの配列一式をまとめる。ここで名前を1箇所に集めておくことで、
        // 種牡馬側・繁殖牝馬側の rowState 生成が同じ入力形から作られることを保証する。
        selectionArraysForRowState() {
          return {
            selected: this.selected,
            indexGenerationAssignments: this.INDEX_GENERATION_ASSIGNMENTS,
            parentLines: this.parentLines,
            styleParentLineClasses: this.styleParentLineClasses,
            isInbreedButtonClicked: this.isInbreedButtonClicked,
            styleInbreedButtonClasses: this.styleInbreedButtonClasses,
            dispColor: this.dispColor,
            styleFactorClasses: this.styleFactorClasses,
            factorName: this.factorName,
            dispCategory: this.dispCategory,
            category: this.category,
            sireLineColors: this.sireLineColorSettings,
            planDangerCellIndexes: this.planDangerCellIndexes,
          };
        },
        // 種牡馬側16行ぶんの rowState。selected 等が変わるたびに作り直される
        // （pedigree-row 側の :key で行単位の描画コストを抑えている）。
        stallionRowStates() {
          return window.Dabimas.logic.pedigree.buildRowStates(
            this.rowConfigs,
            this.selectionArraysForRowState
          );
        },
        // 繁殖牝馬側16行ぶんの rowState。
        broodmareRowStates() {
          return window.Dabimas.logic.pedigree.buildRowStates(
            this.rowConfigsBloodmare,
            this.selectionArraysForRowState
          );
        },
        // 馬選択・メモ入力セル（horse-cell、旧 common-autocomplete。
        // memo-cell / desktop-horse-autocomplete / mobile-horse-picker に
        // 分割済み）へ pedigree-row 経由で橋渡しする値の詰め合わせ。
        horseSelectionOptions() {
          return {
            selected: this.selected,
            lists: this.horseDataLists,
            onChange: this.onChange,
            dispCategory: this.dispCategory,
            category: this.category,
            inputed: this.inputed,
            memoChange: this.memoChange,
            sireLineColors: this.sireLineColorSettings,
          };
        },
        // pedigree-row の表示だけに関わる値（ボタンサイズ・:key用のreload・
        // 子系統ボタンのラベル）の詰め合わせ。種牡馬側・繁殖牝馬側で共通。
        rowDisplayOptions() {
          return {
            size: this.size,
            reload: this.reload,
            dispButtonName: this.dispButtonName,
          };
        },
  };

  window.Dabimas.app.watch = {
        dispCategory: function(value) {
          this.$nextTick(() => {
            this.applyMobileViewportLayout();
            // 子系統表示ではヘッダが1段高くなる。PC表示の行高はヘッダ下の
            // 残り高さから決めているので、ここでも計算し直す。
            this.applyDesktopViewportLayout();
          });
          this.dispButtonName = value%2 === 0 ? '子系統' : '因　子';
        },
        // ホーム／設定画面から血統表へ戻ってきた直後は、それまで表示されて
        // いなかった血統表の行高がここで初めて測れるようになる。
        currentScreen: function (value) {
          if (value !== 'category') {
            return;
          }
          this.$nextTick(() => {
            this.applyDesktopViewportLayout();
          });
        },
  };
})(window);
