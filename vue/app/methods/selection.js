/**
 * このファイルの役割:
 * - 血統表セルの選択・削除・メモ入力に関わるメソッド一式
 *   （memoChange系、onChange/onChangeMain、deleteHorses）。
 * - pedigree-row からの emit（inbreed-toggle / manual-factor-update）を
 *   既存の handleInbreedButtonClick / applyManualFactors へ橋渡しする
 *   onRowInbreedToggle / onRowManualFactorUpdate。
 * - ハート（強制インブリード）ボタン押下時の handleInbreedButtonClick。
 *
 * このファイルに置かない処理:
 * - 血統計算・インブリード判定そのもの（vue/logic/inbreed/*.js の仕事）。
 * - 起動・復元・リセット（vue/app/methods/bootstrap.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   セル選択・削除・メモまわりだけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-5）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりメソッド本体を1文字も変えずに移動できる（逐語移動原則）。
  var ROWS_PER_SIDE = window.Dabimas.constants.pedigreeIndexes.ROWS_PER_SIDE;

  Object.assign(window.Dabimas.app.methods, {
        // ハート（強制インブリード）ボタンクリック時
        handleInbreedButtonClick: function (index) {
          // それぞれのボタンコンポーネントのキーを更新（再レンダリングさせたいから）
          const changedIsButtonClicked =
            this.isInbreedButtonClicked[index] * -1;
          if (changedIsButtonClicked === 1) {
            this.$set(this.dispColor, index, "inbreed");
            this.inbreedList[index] = {
              ...this.selected[index],
              selfInbreed: true,
            };
          } else {
            this.$set(this.dispColor, index, "");
            this.inbreedList[index] = null;
          }

          // async/await関数を定義
          const dispFunction = async () => {
            // インブリード本数判定表示
            await this.dispInbreedFactorCounts();
            // フラグを反転結果
            this.$set(this.isInbreedButtonClicked, index, changedIsButtonClicked);
            this.reload++;
            this.persistManualInbreedState();
          };
          // async/await関数を実行
          dispFunction().catch(() => {
            this.persistManualInbreedState();
          });
        },

        // pedigree-row からの emit（{ index }）を、既存の handleInbreedButtonClick(index) に橋渡しする。
        onRowInbreedToggle(payload) {
          this.handleInbreedButtonClick(payload.index);
        },
        // pedigree-row からの emit（{ index, factors }）を、既存の applyManualFactors(index, factors) に橋渡しする。
        onRowManualFactorUpdate(payload) {
          this.applyManualFactors(payload.index, payload.factors);
        },
        memoChange: function (index, input) {
          this.$set(this.inputed, index, input);
          localStorage.setItem("dabimasMemo", JSON.stringify(this.inputed));
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        memoChangeStallion: function (input) {
          this.inputedMemoStallion = input;
          localStorage.setItem("dabimasMemoStallion", this.inputedMemoStallion);
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        memoChangeBroodmare: function (input) {
          this.inputedMemoBroodmare = input;
          localStorage.setItem("dabimasMemoBroodmare", this.inputedMemoBroodmare);
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        // ドロップダウンリスト選択時
        // onChange: function (sex, id, horseData, event) {
        onChange: function (sex, id, horseData) {
          this.onChangeMain(sex, id, horseData);
        },

        // 選択時のメイン処理
        onChangeMain: async function (sex, id, horseData) {
          // 16 は「片側の行数」＝ ROWS_PER_SIDE（vue/constants/pedigree-indexes.js）。
          const targetIndex = Number(id) + Number(sex) * ROWS_PER_SIDE;

          // state を壊す前に detail（descendants 15 件）を確定させる（指摘 F）。
          // 取得に失敗した場合は何も変更せず return（既存セルを保持）。
          let hydratedHorseData = null;
          if (horseData) {
            if (Number.isInteger(targetIndex)) {
              this.$set(this.horseDetailLoadingIndexes, targetIndex, true);
            }
            try {
              hydratedHorseData = await this.ensureHorseDetail(horseData);
            } catch (error) {
              console.warn("ensureHorseDetail failed", error);
              if (Number.isInteger(targetIndex)) {
                this.$delete(this.horseDetailLoadingIndexes, targetIndex);
              }
              this.notifyHorseDetailError();
              return;
            }
            if (Number.isInteger(targetIndex)) {
              this.$delete(this.horseDetailLoadingIndexes, targetIndex);
            }
          }

          if (Number.isInteger(targetIndex)) {
            this.$set(this.isInbreedButtonClicked, targetIndex, -1);
            this.$set(this.dispColor, targetIndex, "");
            this.$set(this.inbreedList, targetIndex, null);
            this.clearManualInbreedForIndex(targetIndex);
          }
          const selectedEntry = Number.isInteger(targetIndex)
            ? this.selected[targetIndex]
            : null;
          if (hydratedHorseData && selectedEntry?.uuid) {
            this.deleteHorses(sex, id);
          }
          if (hydratedHorseData) {
            // リストにセットされた場合
            // 血統表データセット用に詰め替える
            if (window.Dabimas.debug) console.time('setDataForPedigree');
            this.selectedSex = hydratedHorseData.sex;
            const dataForPedigree = window.Dabimas.logic.pedigree.setDataForPedigree(
              sex,
              id,
              hydratedHorseData,
              this.brosData
            );
            if (window.Dabimas.debug) console.timeEnd('setDataForPedigree');
            // 血統表にデータをセットする
            if (window.Dabimas.debug) console.time('setPedigree');
            this.setPedigree(sex, id, dataForPedigree);
            if (window.Dabimas.debug) console.timeEnd('setPedigree');
          } else {
            // リストを空にした場合（削除モード）
            this.deleteHorses(sex, id);
          }

          if (window.Dabimas.debug) console.time('画面表示');
          // カウントした画面に表示させる
          this.factorNumtoString = this.dispFactorCounts(this.factorCd);
          // カウントした子系統数を表示させる
          this.categoryNumtoString = this.dispCategoryCount();
          if (window.Dabimas.debug) console.timeEnd('画面表示');

          if (window.Dabimas.debug) console.time('クロス');
          // クロスを判定して表示させる
          await this.dispInbreed();
          if (window.Dabimas.debug) console.timeEnd('クロス');

          this.restoreManualInbreedState();

          if (window.Dabimas.debug) console.time('理論');
          // 配合理論を求めて画面に表示させる
          this.dispTheory();
          if (window.Dabimas.debug) console.timeEnd('理論');

          // 内容をローカルに保存する（descendants を含まない軽量 snapshot）
          this.persistSelectedToStorage();
        },

        // リストから削除
        deleteHorses: function (sex, id) {
          // 削除したいUUIDを取得する
          const deleteUuid = this.selected[id + sex * 16].uuid;

          // 削除するUUIDを持つリストを検索する
          const deleteHorseList = this.selected.filter(
            (horse) => horse && horse.uuid === deleteUuid
          );
          // 該当するものがあれば、それに該当するものを削除する
          for (const deleteHorse of deleteHorseList) {
            const deleteIndex = deleteHorse.index;

            // リストから選択できない種牡馬をリストから削除する
            // 削除したい名前をセット
            const deleteName = this.selected[deleteIndex]?.name;
            const deleteSubName = this.selected[deleteIndex]?.subName;
            const deleteDisabled = this.selected[deleteIndex]?.disabled;

            // ほかのところで同じ馬が設定されているのかチェック
            const duplicateCheck = this.selected.filter(
              (horse) =>
                horse &&
                horse.name === deleteName &&
                horse.subName === deleteSubName &&
                horse.uuid !== deleteUuid
            );

            // ほかのところで同じ馬が設定されていない場合は配列から削除する
            if (duplicateCheck.length === 0) {
              // 削除したい名前が配列のどこにあるのか取得
              const deleteHorsesIndex = this.horses.findIndex(
                (object) =>
                  object?.name === deleteName &&
                  object?.subName === deleteSubName &&
                  object?.disabled === true
              );
              const deleteStallionsIndex = this.stallions.findIndex(
                (object) =>
                  object?.name === deleteName &&
                  object?.subName === deleteSubName &&
                  object?.disabled === true
              );
              const deleteBroodmaresIndex = this.broodmares.findIndex(
                (object) =>
                  object?.name === deleteName && object?.disabled === true
              );

              // 取得した配列の位置のものを削除する
              if (deleteHorsesIndex !== -1) {
                this.horses.splice(deleteHorsesIndex, 1);
              }
              if (deleteStallionsIndex !== -1) {
                this.stallions.splice(deleteStallionsIndex, 1);
              }
              if (deleteBroodmaresIndex !== -1) {
                this.broodmares.splice(deleteBroodmaresIndex, 1);
              }
            }
            // リストから消す
            this.$set(this.selected, deleteHorse.index, null);
            this.$set(this.category, deleteHorse.index, null);

            this.$set(this.factorName[deleteIndex], 0, '');
            this.$set(this.factorName[deleteIndex], 1, '');
            this.$set(this.factorName[deleteIndex], 2, '');

            this.$set(this.factorCd[deleteIndex], 0, '');
            this.$set(this.factorCd[deleteIndex], 1, '');
            this.$set(this.factorCd[deleteIndex], 2, '');

            this.$set(this.parentLines, deleteIndex, '');
            // CSSを初期化
            let css = "";
            css = this.getCss(deleteIndex);
            this.$set(this.styleFactorClasses[deleteIndex], 0, `${css} styleFactorClassMain`);
            this.$set(this.styleFactorClasses[deleteIndex], 1, `${css} styleFactorClassMain`);
            this.$set(this.styleFactorClasses[deleteIndex], 2, `${css} styleFactorClassMain`);
            this.$set(this.styleParentLineClasses, deleteIndex, `${css} styleParentLine`);
            this.$set(this.isInbreedButtonClicked, deleteIndex, -1);
            this.$set(this.dispColor, deleteIndex, "");
            this.$set(this.inbreedList, deleteIndex, null);
            this.clearManualInbreedForIndex(deleteIndex);
          }
          this.horseDataLists = [this.horses, this.stallions, this.broodmares];
        },
  });
})(window, window.Vue);
