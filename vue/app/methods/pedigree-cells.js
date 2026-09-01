/**
 * このファイルの役割:
 * - 血統表セルへの表示反映一式：配合理論（dispTheory）、手動因子の反映
 *   （applyManualFactors）、因子数・子系統数の集計表示
 *   （dispFactorCounts, dispCategoryCount）、親系統・因子セルのCSS/文言
 *   設定（judgeSetParentLine, fillInFactorCells, fillInParentLineCells,
 *   setFactorName, setFactorCd, setFactorCss, setParentLine）、
 *   選択馬から血統表1行ぶんのデータを詰める setPedigree、行の色テーマ
 *   判定のラッパ getCss。
 *
 * このファイルに置かない処理:
 * - 血統計算・因子集計のロジック本体（vue/logic/pedigree/*.js,
 *   vue/logic/factor/*.js の仕事）。インブリード判定
 *   （vue/app/methods/inbreed-ui.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   血統表セルへの表示反映だけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-7。root app の
 *   methods 最後のスライス）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりメソッド本体を1文字も変えずに移動できる（逐語移動原則）。
  var factorMap = window.Dabimas.logic.factor.factorMap;

  Object.assign(window.Dabimas.app.methods, {
        // 行位置ごとの色テーマ判定は vue/logic/pedigree/pedigree-css.js に外部化済み。
        // pedigree-row へ prop（Function）として渡しているため、メソッド自体は残す。
        getCss: function (i) {
          return window.Dabimas.logic.pedigree.getCss(i);
        },

        // 配合理論を求めて画面に表示させる
        dispTheory: function () {
          // 使用例
          const S = [
            [
              this.parentLines[1],
              this.parentLines[3],
              this.parentLines[5],
              this.parentLines[7],
            ],
            [
              this.parentLines[9],
              this.parentLines[11],
              this.parentLines[13],
              this.parentLines[15],
            ],
          ];
          const D = [
            [
              this.parentLines[1 + 16],
              this.parentLines[3 + 16],
              this.parentLines[5 + 16],
              this.parentLines[7 + 16],
            ],
            [
              this.parentLines[1 + 16],
              this.parentLines[3 + 16],
              this.parentLines[5 + 16],
              this.parentLines[7 + 16],
            ],
          ];
          const flattenedS = S.flat();
          const flattenedD = D.flat();

          // 血統表全部が埋まっている場合に理論判定（判定ロジックは vue/logic/theory/compatibility.js に外部化済み）。
          if (this.selected.every((e) => e)) {
            if (this.sameNameSpecialChecks)
            this.styleThoeryClass = window.Dabimas.logic.theory.compatibility(S, D, {
              sameNameSpecialChecks: this.sameNameSpecialChecks,
              selected: this.selected,
              dangerous: this.dangerousCombination,
            });
          } else {
            // 理論系統が埋まっていない場合は、空白を設定
            this.styleThoeryClass = "";
          }
        },

        // カウントした因子数を画面に表示させる
        applyManualFactors(rowIndex, factors) {
          const targetRow = Number(rowIndex);
          if (
            !Number.isInteger(targetRow) ||
            targetRow < 0 ||
            targetRow >= this.factorCd.length
          ) {
            return;
          }

          // 有効な因子名のみ・重複なし・最大2個への整形は
          // vue/logic/factor/manual-factors.js に外部化済み。
          const sanitized = window.Dabimas.logic.factor.sanitizeManualFactors(factors);

          sanitized.forEach((value, index) => {
            const columnIndex = index + 1;
            const code = factorMap.get(value) ?? "00";
            this.setFactorName(targetRow, columnIndex, value);
            this.setFactorCd(targetRow, columnIndex, code);
            this.setFactorCss(
              targetRow,
              columnIndex,
              this.fillInFactorCells(code, targetRow)
            );
          });

          const selectedEntry = this.selected[targetRow];
          if (selectedEntry) {
            const updatedFactors = Array.isArray(selectedEntry.factors)
              ? [...selectedEntry.factors]
              : ["", "", ""];
            updatedFactors[1] = sanitized[0] || "";
            updatedFactors[2] = sanitized[1] || "";
            this.$set(this.selected, targetRow, {
              ...selectedEntry,
              factors: updatedFactors,
            });

            if (this.inbreedList[targetRow]?.selfInbreed) {
              this.$set(this.inbreedList, targetRow, {
                ...this.inbreedList[targetRow],
                factors: updatedFactors,
              });
              this.dispInbreedFactorCounts();
            }
          }

          this.factorNumtoString = this.dispFactorCounts(this.factorCd);

          // descendants を含まない軽量 snapshot で保存する
          this.persistSelectedToStorage();
        },

        // 因子数の集計ロジックは vue/logic/factor/factor-counts.js に外部化済み。
        dispFactorCounts: function (factorCdArray) {
          return window.Dabimas.logic.factor.dispFactorCounts(factorCdArray);
        },

        // getValueByKey は vue/logic/pedigree/pedigree-builder.js に外部化済み。
        // カウントした子系統数を画面に表示させる
        dispCategoryCount: function () {
          const allSet = this.selected.every((e) => e) ? 0 : -1;
          return (new Set(this.category).size + allSet).toString();
        },
        // 血統表に埋めるために配列を入れ替える処理は
        // vue/logic/pedigree/pedigree-builder.js に外部化済み
        // （呼び出しは onChangeMain から window.Dabimas.logic.pedigree.setDataForPedigree を直接使う）。

        // isEven / replaceHalfToFull は vue/logic/pedigree/pedigree-builder.js に外部化済み。

        // 親系統配列に詰めるかの判定をする
        judgeSetParentLine: function (str, cell_id) {
          let ParentLine = "";
          switch (cell_id) {
            // （+ 16）は牝馬のほう（面白系統）
            case 1:
            case 3:
            case 5:
            case 7:
            case 1 + 16:
            case 3 + 16:
            case 5 + 16:
            case 7 + 16:
              ParentLine = str ?? "";
              break;
            // 見事系統
            case 9:
            case 11:
            case 13:
            case 15:
              ParentLine = str ?? "";
              break;
            default:
              break;
          }
          return ParentLine;
        },

        // セルに因子CSSを詰める（ロジックは vue/logic/factor/factor-counts.js に外部化済み）。
        fillInFactorCells: function (str, cell_id) {
          return window.Dabimas.logic.factor.fillInFactorCells(str, cell_id);
        },

        // セルに因子CSSを詰める
        fillInParentLineCells: function (str, cell_id) {
          if (str == null || str === "") {
            // nullのときはデフォルトのCSSを返す
            return `${this.getCss(cell_id)} styleParentLine`;
          } else {
            return `${str} styleParentLine`;
          }
        },

        // getCellIdQue は vue/logic/pedigree/pedigree-builder.js に外部化済み。

        // 因子名を詰め込む
        setFactorName: function (row, col, factorName) {
          if (!this.factorName[row]) {
            this.$set(this.factorName, row, ["", "", ""]);
          }
          this.$set(this.factorName[row], col, factorName ?? "");
        },

        // 因子情報を詰め込む
        setFactorCd: function (row, col, factorCd) {
          if (!this.factorCd[row]) {
            this.$set(this.factorCd, row, ["00", "00", "00"]);
          }
          this.$set(this.factorCd[row], col, factorCd ?? "00");
        },

        // 因子情報を詰め込む
        setFactorCss: function (row, col, styleFactorClass) {
          if (!this.styleFactorClasses[row]) {
            const baseCss = typeof this.getCss === "function" ? this.getCss(row) : "";
            const fallback = baseCss
              ? `${baseCss} styleFactorClassMain`
              : "styleFactorClassMain";
            this.$set(
              this.styleFactorClasses,
              row,
              [fallback, fallback, fallback]
            );
          }
          const baseCss = typeof this.getCss === "function" ? this.getCss(row) : "";
          const fallback = baseCss
            ? `${baseCss} styleFactorClassMain`
            : "styleFactorClassMain";
          this.$set(
            this.styleFactorClasses[row],
            col,
            styleFactorClass ?? fallback
          );
        },

        // 親系統を詰め込む
        setParentLine: function (row, parentLine) {
          this.$set(this.parentLines, row, parentLine);
          this.$set(
            this.styleParentLineClasses,
            row,
            this.fillInParentLineCells(parentLine, row)
          );
        },

        // 選択したセルを起点に血統データを入れる関数
        setPedigree: function (sex, cellNo, horseDataList) {
          // 詰めるためのキューを取得する
          const cell_id_que = window.Dabimas.logic.pedigree.getCellIdQue(cellNo, horseDataList);
          // 配列の先頭1件
          let isFirst = true;
          
          // 【最適化】性別オフセットを事前計算
          const sexOffset = sex * 16;
          
          // 先祖に向かって血統表をセットする
          for (let i = 0; i < cell_id_que.length; i++) {
            const cell_id = cell_id_que[i];
            // 【最適化】indexOfの重複呼び出しを排除
            const horseData = horseDataList[i];
            // 【最適化】cellIndexを事前計算
            const cellIndex = cell_id + sexOffset;
            
            // 名前をセットする
            if (
              !(sex === 1 && cell_id === 0) &&
              horseData
            ) {
              // 繁殖牝馬直のリスト選択したときはここに入ってこない
              if (
                this.horses.findIndex(
                  (object) =>
                    object?.name === horseData.name &&
                    object?.subName === horseData.subName
                ) === -1
              ) {
                // リストに無い場合は追加する
                // 【最適化】不要な配列コピーを削減
                this.stallions.push({ ...horseData });
                this.horses.push({ ...horseData });
              }
            }

            // セットする＋自分の位置も併せてセットする
            if (horseData) {
              this.$set(this.selected, cellIndex, {
                ...horseData,
                index: cellIndex,
                selfSelected: isFirst,
              });
              this.$set(
                this.category,
                cellIndex,
                horseData.son
              );
              // 配列の先頭フラグを落とす
              isFirst = false;
            } else {
              this.$set(this.selected, cellIndex, null);
              this.$set(this.category, cellIndex, null);
            }

            // 【最適化】factors配列を事前取得
            const factors = horseData?.factors;

            // 配列に因子名を詰め込む
            // horseDataList[i]がnullの場合、horseData?.factors[0]がundefinedとなるので、''を返却する
            this.setFactorName(cellIndex, 0, factors?.[0] ?? "");
            this.setFactorName(cellIndex, 1, factors?.[1] ?? "");
            this.setFactorName(cellIndex, 2, factors?.[2] ?? "");

            // 配列に因子情報を詰め込む
            // horseDataList[i]がnullの場合、horseData?.factors[0]がundefinedとなるので、'00'を返却する
            this.setFactorCd(
              cellIndex,
              0,
              factorMap.get(factors?.[0]) ?? "00"
            );
            this.setFactorCd(
              cellIndex,
              1,
              factorMap.get(factors?.[1]) ?? "00"
            );
            this.setFactorCd(
              cellIndex,
              2,
              factorMap.get(factors?.[2]) ?? "00"
            );

            // 【最適化】factorCd配列を事前取得
            const factorCdArray = this.factorCd[cellIndex];

            // 因子css
            this.setFactorCss(
              cellIndex,
              0,
              this.fillInFactorCells(factorCdArray[0], cellIndex)
            );
            this.setFactorCss(
              cellIndex,
              1,
              this.fillInFactorCells(factorCdArray[1], cellIndex)
            );
            this.setFactorCss(
              cellIndex,
              2,
              this.fillInFactorCells(factorCdArray[2], cellIndex)
            );

            // 親系統
            this.setParentLine(
              cellIndex,
              this.judgeSetParentLine(horseData?.parentLine, cellIndex)
            );
          }

          // 子孫に選択した種牡馬のＮ薄めを血統データに入れる
          let reverseNum = cellNo;
          let reverseCnt = 0;
          const name = horseDataList[0]?.name;
          const subName = horseDataList[0]?.subName;
          const parentLine = horseDataList[0]?.parentLine;
          const uuid = horseDataList[0]?.uuid;
          const son = horseDataList[0]?.son;
          
          // 【最適化】空配列を事前作成（再利用）
          const emptyFactors = ["", "", ""];
          const emptyFullSiblings = ["", ""];
          
          while (window.Dabimas.logic.pedigree.isEven(reverseNum)) {
            // 2で割る
            reverseNum = Math.floor(reverseNum / 2);
            
            // 【最適化】reverseCellIndexを事前計算
            const reverseCellIndex = reverseNum + sexOffset;

            if (name) {
              // 追加モード
              reverseCnt++;
              // 自家製種牡馬名
              const handMadeName = `★${window.Dabimas.logic.pedigree.replaceHalfToFull(
                reverseCnt.toString(10)
              )}薄め${name.trim().replace(/^☆/, "")}${subName.trim()}`;
              if (reverseNum === 0 && sex === 1) {
                // 【最適化】オブジェクトを事前作成
                const broodmareData = {
                  name: "ワタシノヒンバ",
                  subName: "",
                  disabled: true,
                  factors: [...emptyFactors],
                  fullBrothers: [...emptyFullSiblings],
                  fullSisters: [...emptyFullSiblings],
                  uuid: uuid,
                };
                // 自家製牝馬をセット
                // 【最適化】不要な配列コピーを削減
                this.broodmares.push(broodmareData);
                this.selected[reverseCellIndex] = {
                  ...broodmareData,
                  index: reverseCellIndex,
                  selfSelected: false,
                };
                // 子系統をセット
                this.category[reverseCellIndex] = son;
              } else {
                // 【最適化】オブジェクトを事前作成
                const horseData = {
                  name: handMadeName,
                  subName: "",
                  parentLine: parentLine,
                  factors: [...emptyFactors],
                  fullBrothers: [...emptyFullSiblings],
                  fullSisters: [...emptyFullSiblings],
                  disabled: true,
                  uuid: uuid,
                };
                // 名前をセット
                // 【最適化】不要な配列コピーを削減
                this.horses.push(horseData);
                this.stallions.push({ ...horseData });
                this.selected[reverseCellIndex] = {
                  ...horseData,
                  index: reverseCellIndex,
                  selfSelected: false,
                };
                // 親系統を設定する
                this.setParentLine(
                  reverseCellIndex,
                  this.judgeSetParentLine(parentLine, reverseCellIndex)
                );
                // 子系統をセット
                this.category[reverseCellIndex] = son;
              }
            }
            // 配列に因子名を詰め込む
            this.setFactorName(reverseCellIndex, 0, "");
            this.setFactorName(reverseCellIndex, 1, "");
            this.setFactorName(reverseCellIndex, 2, "");
            // 配列に因子情報を詰め込む
            this.setFactorCd(reverseCellIndex, 0, "00");
            this.setFactorCd(reverseCellIndex, 1, "00");
            this.setFactorCd(reverseCellIndex, 2, "00");
            
            // 【最適化】factorCd配列を事前取得
            const reverseFactor = this.factorCd[reverseCellIndex];
            
            // 因子css
            this.setFactorCss(
              reverseCellIndex,
              0,
              this.fillInFactorCells(reverseFactor[0], reverseCellIndex)
            );
            this.setFactorCss(
              reverseCellIndex,
              1,
              this.fillInFactorCells(reverseFactor[1], reverseCellIndex)
            );
            this.setFactorCss(
              reverseCellIndex,
              2,
              this.fillInFactorCells(reverseFactor[2], reverseCellIndex)
            );
          }

          // 最後に配列に馬リストの配列にセットする
          this.horseDataLists = [this.horses, this.stallions, this.broodmares];
        },
  });
})(window, window.Vue);
