/**
 * このファイルの役割:
 * - 起動シーケンス（c1〜c4、mounted から順に呼ばれる初期化ステップ）と、
 *   localStorage からの復元（restoreInputData）、全リセット（initializer）、
 *   子系統トグル（handleClick）、インブリード例外ルールの読み込みラッパ
 *   （loadInbreedExceptions、fetch本体は
 *   vue/logic/inbreed/inbreed-exceptions.js）をまとめる。
 *
 * このファイルに置かない処理:
 * - 血統計算そのもの、インブリード判定そのもの。
 * - 配合保存ダイアログ・手動クロス永続化（vue/app/methods/combination.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   起動・リセット・復元まわりだけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-4）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりメソッド本体を1文字も変えずに移動できる（逐語移動原則）。
  var factorMap = window.Dabimas.logic.factor.factorMap;
  var MANUAL_INBREED_STORAGE_KEY = "dabimasManualInbreed";

  Object.assign(window.Dabimas.app.methods, {
        // インブリード例外ルールを読み込む
        loadInbreedExceptions: function () {
          // fetch本体は vue/logic/inbreed/inbreed-exceptions.js に外部化済み。
          return window.Dabimas.logic.inbreed.loadInbreedExceptions()
            .then(data => {
              this.inbreedExceptions = data;
              console.log('Loaded inbreed exceptions:', this.inbreedExceptions);
            })
            .catch(error => {
              console.error('Error loading inbreed-exceptions.json:', error);
              this.inbreedExceptions = [];
            });
        },
        c1: function (readyPromise) {
          // dbinitializer が返す Promise（summary 読み込み→復元処理まで）をそのまま返す。
          // readyPromise（loadInbreedExceptions の Promise）はそのまま dbinitializer へ渡し、
          // 復元処理内の dispInbreed が例外ルールの読み込み完了を待てるようにする。
          return this.dbinitializer(readyPromise);
        },
        c2: function () {
          return new Promise((resolve, reject) => {
            console.log(this.$vuetify.breakpoint.name);
            console.log("window.innerHeight", window.innerHeight);
            resolve((this.windowSize = window.innerHeight));
          });
        },
        c3: function () {
          return new Promise((resolve, reject) => {
            // 因子名→コードの変換は vue/logic/factor/factor-map.js で
            // スクリプト読み込み時に構築済み（ここでは何もしない）。

            // 因子部分のCSS設定
            for (var i = 0; i < this.styleFactorClasses.length; i++) {
              let css = "";
              css = this.getCss(i);
              this.styleFactorClasses[i][0] = `${css} styleFactorClassMain`;
              this.styleFactorClasses[i][1] = `${css} styleFactorClassMain`;
              this.styleFactorClasses[i][2] = `${css} styleFactorClassMain`;
            }

            // 血統理論部分のCSS
            for (var i = 0; i < this.styleParentLineClasses.length; i++) {
              let css = "";
              css = this.getCss(i);
              this.styleParentLineClasses[i] = `${css} styleParentLine`;
            }

            // インブリードボタン部分のCSS
            for (var i = 0; i < this.styleInbreedButtonClasses.length; i++) {
              let css = "";
              css = this.getCss(i);
              this.styleInbreedButtonClasses[i] = `${css} styleInbreedButton`;
            }
          });
        },
        c4: async function () {
          if (!window.localStorage) {
            return;
          }
          await this.refreshLocalDataFromStorage();
        },
        // 復元処理
        restoreInputData: async function () {
          const parseArray = JSON.parse(localStorage.getItem("dabimasFactor"));
          // 【最適化】不要なArray.fromを削減
          // ローカルストレージから取得したものでnull要素は排除してからセット
          const filteredArray = parseArray.filter((v) => v);
          this.refreshCandidateLists(filteredArray, [
            parseArray[16] ? parseArray[16] : "",
          ]);
          this.selected = JSON.parse(localStorage.getItem("dabimasFactor"));
          this.category = JSON.parse(localStorage.getItem("dabimasFactorCategory"));

          // 【最適化】mapではなくforEachを使用（戻り値を使わないため）
          // 因子・親系統を詰める
          this.selected.forEach((element, index) => {
            // 【最適化】factorCd配列を事前取得
            const factorCdArray = this.factorCd[index];
            
            for (let i = 0; i < 3; i++) {
              this.setFactorName(index, i, element?.factors?.[i]);
              this.setFactorCd(
                index,
                i,
                factorMap.get(element?.factors?.[i]) ?? "00"
              );
              this.setFactorCss(
                index,
                i,
                this.fillInFactorCells(factorCdArray[i], index)
              );
            }
            this.setParentLine(
              index,
              this.judgeSetParentLine(element?.parentLine, index)
            );
          });

          // カウントした画面に表示させる
          this.factorNumtoString = this.dispFactorCounts(this.factorCd);
          this.categoryNumtoString = this.dispCategoryCount();

          // クロスを判定して表示させる
          await this.dispInbreed();

          this.restoreManualInbreedState();

          // 配合理論を求めて画面に表示させる
          this.dispTheory();
        },
        initializer() {
          // localStorageをクリア
          localStorage.removeItem("dabimasFactor");
          localStorage.removeItem("dabimasMemo");
          localStorage.removeItem("dabimasMemoStallion");
          localStorage.removeItem("dabimasMemoBroodmare");
          localStorage.removeItem(MANUAL_INBREED_STORAGE_KEY);

          this.selected = Array.from(new Array(32).fill(null));
          this.category = Array.from(new Array(32).fill(null));
          // memo欄
          this.inputed = Array.from(new Array(32).fill(null));
          this.inputedMemoStallion = null;
          this.inputedMemoBroodmare = null;

          this.dispColor = Array.from(new Array(32).fill(""));
          // baseをコピーする
          this.refreshCandidateLists();

          // 因子部分のCSS初期設定
          for (var i = 0; i < this.styleFactorClasses.length; i++) {
            let css = "";
            css = this.getCss(i);
            this.$set(this.styleFactorClasses[i], 0, `${css} styleFactorClassMain`);
            this.$set(this.styleFactorClasses[i], 1, `${css} styleFactorClassMain`);
            this.$set(this.styleFactorClasses[i], 2, `${css} styleFactorClassMain`);
          }

          // 血統理論部分のCSS初期設定
          for (var i = 0; i < this.styleParentLineClasses.length; i++) {
            let css = "";
            css = this.getCss(i);
            this.$set(this.styleParentLineClasses, i, `${css} styleParentLine`);
          }

          // factorNameを二次元配列で定義
          this.factorName = Array.from(new Array(32), () =>
            new Array(3).fill("")
          );

          // 合計因子数表示
          this.factorNumtoString = Array.from(new Array(14).fill("00"));

          // インブリード因子数表示
          this.inbreedFactorNumtoString = Array.from(new Array(14).fill("00"));

          // 子系統数
          this.categoryNumtoString = "00";

          // 合計因子数内部変数
          this.factorCd = Array.from(new Array(32), () =>
            new Array(3).fill("00")
          );
          // 親系統表示
          this.parentLines = Array.from(new Array(32).fill(""));

          // 理論表示
          this.styleThoeryClass = "";
          // インブリードされているところを格納する変数
          this.inbreedList = Array.from(new Array(32).fill(null));
          this.sameNameGroups = [];
          this.siblingGroups = [];
          this.sameNameSpecialChecks = [];
          this.sameNameSpecialChecksByIndex = Array.from(
            new Array(32).fill(false)
          );

          // インブリードボタン押下フラグを一次元配列で定義（-1：未クリック　1：クリック　0:使用不可）
          this.isInbreedButtonClicked = Array.from(new Array(32).fill(0));
          // 子系統を表示させるフラグ
          this.dispCategory = 0;

          this.reload++;

          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        handleClick() {
          this.dispCategory++;
        },
  });
})(window, window.Vue);
