/**
 * このファイルの役割:
 * - root app のライフサイクルフック created / mounted / beforeDestroy を
 *   window.Dabimas.app.lifecycle = { created, mounted, beforeDestroy } と
 *   してまとめる。
 * - created: rowConfigs / rowConfigsBloodmare を Object.freeze で
 *   非リアクティブに設定し、ボタンサイズ（size）を決める。
 * - mounted: 起動シーケンス（loadInbreedExceptions→c1→c2→c3）の開始、
 *   初期ローダを隠すタイミング制御、リサイズ/向き変更イベントの登録。
 * - beforeDestroy: mounted で登録したイベントリスナ・タイマーの後始末。
 *
 * このファイルに置かない処理:
 * - data() の初期値（vue/app/app-state.js の仕事）。
 * - メソッド本体（vue/app/methods/*.js の仕事）。
 *
 * 逐語移動の例外（構造上必要な最小限の置換）:
 * - mounted 内の bare な scheduleInitialLoaderHide() 呼び出し（2箇所）は
 *   index.html の boot スクリプトのモジュールスコープ関数を参照していた。
 *   外部ファイルからは見えないため、boot スクリプト側に
 *   window.Dabimas.boot.scheduleInitialLoaderHide を公開してもらい、
 *   ここでは window.Dabimas.boot.scheduleInitialLoaderHide() として呼ぶ。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   ライフサイクルフックだけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-10）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};

  window.Dabimas.app.lifecycle = {
      //async created () {
      created() {
        // rowConfigs / rowConfigsBloodmare は行の形（headCells・結合セル・親系統表示可否・
        // 背景テーマ）を表す不変データ。data() ではなくここで直接 this に代入することで
        // Vue のリアクティブ化対象から外す（doc補足8: 起動コストと変更検知コストの削減）。
        this.rowConfigs = Object.freeze(
          window.Dabimas.logic.pedigree.createPedigreeRowConfigs("stallion")
        );
        this.rowConfigsBloodmare = Object.freeze(
          window.Dabimas.logic.pedigree.createPedigreeRowConfigs("broodmare")
        );

        const btnSize = {
          xs: "x-small",
          md: "small",
          sm: "small",
          lg: "small",
          xl: "small",
        };
        const size = btnSize[this.$vuetify.breakpoint.name];
        this.size = { [size]: true };
      },

      mounted: function () {
        try {
          this.onNicksReadyHandler = () => {
            this.nicksReady = true;
          };
          window.addEventListener("dabimas:nicks-ready", this.onNicksReadyHandler);
          const nicks = window.Dabimas.logic && window.Dabimas.logic.nicks;
          if (nicks && typeof nicks.isReady === "function" && nicks.isReady()) {
            this.nicksReady = true;
          }

          // インブリード例外ルールの読み込み（loadInbreedExceptions）と血統データの
          // 読み込み（c1 → dbinitializer の summary fetch）は互いに依存しないため、
          // 直列 then ではなく並行に開始する（起動時のネットワーク待ちを縮める）。
          // 復元処理（c4 内の dispInbreed）だけが例外ルールを使うため、その待ち合わせは
          // dbinitializer 内部（readyPromise）で行う。
          const inbreedExceptionsPromise = this.loadInbreedExceptions();
          const dataReadyPromise = this.c1(inbreedExceptionsPromise);
          // c2 / c3 は取得済みデータに依存しないため、復元処理の完了を待たず実行する
          // （従来どおりの速さで画面サイズ・CSS初期設定を終わらせる）。
          Promise.resolve()
            .then(() => this.c2())
            .then(() => this.c3())
            .finally(() => {
              this.windowSize = this.getStableViewportHeight();
              this.$nextTick(() => {
                this.scheduleInitialMobileViewportLayout();
              });
            });
          // 血統表の復元（保存データの反映）が終わるまで起動ローダーを隠さない。
          // 以前は c1 の完了を待たずに隠していたため、復元前の空の血統表が
          // 一瞬見えてしまうことがあった。
          Promise.resolve(dataReadyPromise).finally(() => {
            window.Dabimas.boot.scheduleInitialLoaderHide();
          });
          this.$nextTick(() => {
            this.scheduleInitialMobileViewportLayout();
          });
          this.onOrientationChangeHandler = () => {
            if (this.$vuetify.breakpoint.smAndDown) {
              this.lockedMobileAppHeight = null;
              this.scheduleInitialMobileViewportLayout();
            }
          };
          window.addEventListener("orientationchange", this.onOrientationChangeHandler);
          this.onViewportGeometryChangeHandler = () => {
            if (!this.$vuetify.breakpoint.smAndDown) {
              return;
            }
            this.clearMobileViewportGeometryTimer();
            this.mobileViewportGeometryTimerId = setTimeout(() => {
              this.mobileViewportGeometryTimerId = null;
              this.refreshMobileViewportLock(false);
            }, 48);
          };
          window.addEventListener("resize", this.onViewportGeometryChangeHandler);
          if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", this.onViewportGeometryChangeHandler);
            window.visualViewport.addEventListener("scroll", this.onViewportGeometryChangeHandler);
          }
        } catch (error) {
          console.error(error);
          window.Dabimas.boot.scheduleInitialLoaderHide();
        }
      },

      beforeDestroy() {
        if (this.onNicksReadyHandler) {
          window.removeEventListener("dabimas:nicks-ready", this.onNicksReadyHandler);
        }
        if (this.onOrientationChangeHandler) {
          window.removeEventListener("orientationchange", this.onOrientationChangeHandler);
        }
        if (this.onViewportGeometryChangeHandler) {
          window.removeEventListener("resize", this.onViewportGeometryChangeHandler);
          if (window.visualViewport) {
            window.visualViewport.removeEventListener("resize", this.onViewportGeometryChangeHandler);
            window.visualViewport.removeEventListener("scroll", this.onViewportGeometryChangeHandler);
          }
        }
        this.clearMobileViewportGeometryTimer();
        this.clearMobileViewportLayoutTimers();
      },
  };
})(window);
