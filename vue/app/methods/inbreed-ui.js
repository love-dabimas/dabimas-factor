/**
 * このファイルの役割:
 * - インブリード（クロス）表示の入口 dispInbreed（選択状態を見て
 *   judgeInbreed を呼ぶかどうかを判定し、色・因子数表示を更新する）と、
 *   その因子数表示 dispInbreedFactorCounts / performInbreedFactorCounts。
 * - judgeInbreed 本体は vue/logic/inbreed/inbreed-detector.js の純関数
 *   （Phase 1 で外部化済み）を呼ぶだけの薄いラッパとしてここに置く。
 *
 * このファイルに置かない処理:
 * - クロス判定・因子集計のロジック本体（vue/logic/inbreed/*.js の仕事）。
 * - セル選択・メモ（vue/app/methods/selection.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   インブリード表示の入口だけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-6）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  Object.assign(window.Dabimas.app.methods, {
        // インブリード表示
        dispInbreed: async function () {
          //
          // let retInbreedArray = [];
          let retInbreedCount = 0;
          // 血統表が全部埋まっている場合に判定処理を行う
          if (this.selected.every((e) => e)) {
            // インブリードボタンクリック済フラグを未クリックに設定
            this.isInbreedButtonClicked = Array.from(new Array(32).fill(-1));
            // インブリードされているところを格納する変数
            this.inbreedList = Array.from(new Array(32).fill(null));
            // インブリードの色も初期化
            this.dispColor = Array.from(new Array(32).fill(""));
            // インブリード判定処理のメイン
            if (window.Dabimas.debug) console.time('インブリード判定');
            retInbreedCount = this.judgeInbreed();
            if (window.Dabimas.debug) console.timeEnd('インブリード判定');
          } else {
            // インブリードボタンクリック済フラグを非活性モードに設定
            this.isInbreedButtonClicked = Array.from(new Array(32).fill(0));
            this.reload++;
            // インブリードの色も初期化
            this.dispColor = Array.from(new Array(32).fill(""));
            // インブリード因子数表示（中長強雷因子も）
            this.inbreedFactorNumtoString = Array.from(new Array(14).fill("00"));
            // インブリードされているところを格納する変数
            this.inbreedList = Array.from(new Array(32).fill(null));
            this.sameNameGroups = [];
            this.siblingGroups = [];
            this.sameNameSpecialChecks = [];
            this.sameNameSpecialChecksByIndex = Array.from(
              new Array(32).fill(false)
            );
          }

          if (window.Dabimas.debug) console.time('インブリード表示');
          // インブリードが発生した場合
          if (retInbreedCount > 0) {
            await this.dispInbreedFactorCounts();
          }
          if (window.Dabimas.debug) console.timeEnd('インブリード表示');
        },

        // インブリード本数表示
        dispInbreedFactorCounts: function () {
          if (this.deferInbreedCount) {
            this.deferredInbreedCountRequested = true;
            return;
          }
          this.performInbreedFactorCounts();
        },
        performInbreedFactorCounts: function () {
          // マージ・集計本体は vue/logic/inbreed/inbreed-counts.js に外部化済み。
          const result = window.Dabimas.logic.inbreed.buildInbreedFactorCounts(
            this.sameNameGroups,
            this.siblingGroups,
            this.inbreedList
          );

          // 自動クロスされたところのボタンを非活性化させる
          result.disabledIndexes.forEach(element => {
            this.$set(this.isInbreedButtonClicked, element, 0);
          });

          // inbreedListへ反映（元実装と同じ非リアクティブな直接代入のまま）
          result.inbreedEntries.forEach(({ index, element }) => {
            this.inbreedList[index] = element;
          });

          // インブリードした因子数をカウントする
          this.inbreedFactorNumtoString = this.dispFactorCounts(result.factorCd);

          if (window.Dabimas.debug) console.log(this.inbreedFactorNumtoString);
        },

        // インブリード判定
        judgeInbreed: function () {
          // 逐語移動した純関数（vue/logic/inbreed/inbreed-detector.js）を呼ぶ。
          const result = window.Dabimas.logic.inbreed.judgeInbreed(
            this.selected,
            this.inbreedExceptions,
            window.Dabimas.pedigreeNodes || null
          );

          // 結果を Vue state へ反映する（旧実装が this へ直接代入していた分）。
          this.dispColor = Array.from(new Array(32).fill(""));
          this.sameNameGroups = result.sameNameGroups;
          this.siblingGroups = result.siblingGroups;
          this.sameNameSpecialChecks = result.sameNameSpecialChecks;
          this.sameNameSpecialChecksByIndex = result.sameNameSpecialChecksByIndex;
          result.inbreedColorIndexes.forEach((index) => {
            this.$set(this.dispColor, index, "inbreed");
          });
          return result.count;
        },
  });
})(window, window.Vue);
