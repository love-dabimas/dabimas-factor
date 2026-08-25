/**
 * このファイルの役割:
 * - モバイル表示のビューポート計算・レイアウト固定（applyMobileViewportLayout
 *   とその周辺）と、スクリーンショット撮影（captureMobileScreenshot と
 *   その周辺のcanvas/Blob変換・ダウンロード処理）をまとめる。
 * - root app の data() が持つ状態（this.mobileViewport* 等）を直接操作する
 *   前提のメソッド群のため、window.Dabimas.app.methods への Object.assign
 *   という形で root app の methods にマージされる（this の束縛は変えない）。
 *
 * このファイルに置かない処理:
 * - 血統計算、インブリード判定、保存処理。
 * - モバイル馬選択ダイアログ自体（vue/components/pedigree/
 *   mobile-horse-picker.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   ビューポート／スクリーンショット関連だけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-1）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // PC表示の行高の下限・上限。下限は 607px 級（Chromeのツールバーとタスクバーを
  // 引いた 768px クラスのPC）で16行を収めるための値、上限は縦に十分広い画面で
  // 行が間延びしないための値。
  var DESKTOP_ROW_HEIGHT_MIN = 28;
  var DESKTOP_ROW_HEIGHT_MAX = 44;
  // 1回の適用で行高を詰め直す回数。1回目で実測との差はほぼ埋まり、
  // 残りは罫線・小数px丸め分の追い込み。
  var DESKTOP_ROW_HEIGHT_FIT_STEPS = 4;

  Object.assign(window.Dabimas.app.methods, {
        getStableViewportHeight: function () {
          const docEl = document.documentElement || {};
          const body = document.body || {};
          const candidates = [
            Number(window.innerHeight) || 0,
            Number(docEl.clientHeight) || 0,
            Number(body.clientHeight) || 0,
          ];
          if (window.visualViewport) {
            candidates.push(Number(window.visualViewport.height) || 0);
          }
          return Math.max(
            0,
            ...candidates
              .filter((value) => Number.isFinite(value) && value > 0)
              .map((value) => Math.floor(value))
          );
        },
        getStableViewportWidth: function () {
          const docEl = document.documentElement || {};
          const body = document.body || {};
          const candidates = [
            Number(window.innerWidth) || 0,
            Number(docEl.clientWidth) || 0,
            Number(body.clientWidth) || 0,
          ];
          if (window.visualViewport) {
            candidates.push(Number(window.visualViewport.width) || 0);
          }
          return Math.max(
            0,
            ...candidates
              .filter((value) => Number.isFinite(value) && value > 0)
              .map((value) => Math.floor(value))
          );
        },
        buildScreenshotFileName: function () {
          const now = new Date();
          const pad = (value) => String(value).padStart(2, "0");
          return [
            "dabimas",
            now.getFullYear(),
            pad(now.getMonth() + 1),
            pad(now.getDate()),
            "-",
            pad(now.getHours()),
            pad(now.getMinutes()),
            pad(now.getSeconds()),
            ".png",
          ].join("");
        },
        canvasToPngBlob: function (canvas) {
          return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/png");
          });
        },
        downloadScreenshotBlob: function (blob, filename) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        },
        saveScreenshotBlob: async function (blob, filename) {
          if (
            typeof File === "function" &&
            navigator.share &&
            navigator.canShare
          ) {
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "dabimas",
              });
              return;
            }
          }
          this.downloadScreenshotBlob(blob, filename);
        },
        loadHtml2Canvas: function () {
          if (typeof window.html2canvas === "function") {
            return Promise.resolve(window.html2canvas);
          }
          if (this.html2CanvasLoadPromise) {
            return this.html2CanvasLoadPromise;
          }

          this.html2CanvasLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "./cdn/html2canvas.min.js";
            script.async = true;
            script.onload = () => {
              if (typeof window.html2canvas === "function") {
                resolve(window.html2canvas);
              } else {
                this.html2CanvasLoadPromise = null;
                reject(new Error("html2canvas is not available"));
              }
            };
            script.onerror = () => {
              this.html2CanvasLoadPromise = null;
              reject(new Error("Failed to load html2canvas"));
            };
            document.head.appendChild(script);
          });

          return this.html2CanvasLoadPromise;
        },
        captureMobileScreenshot: async function () {
          if (!this.$vuetify.breakpoint.smAndDown || this.isCapturingScreenshot) {
            return;
          }

          this.isCapturingScreenshot = true;
          try {
            const html2canvas = await this.loadHtml2Canvas();
            this.applyMobileViewportLayout();
            await this.$nextTick();
            await new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            });

            const target = this.$el;
            const rect = target.getBoundingClientRect();
            const width = Math.ceil(rect.width);
            const height = Math.ceil(rect.height);
            const scale = Math.min(window.devicePixelRatio || 1, 3);
            const canvas = await html2canvas(target, {
              backgroundColor: "#ffffff",
              scale,
              width,
              height,
              windowWidth: Math.max(document.documentElement.clientWidth, width),
              windowHeight: Math.max(document.documentElement.clientHeight, height),
              scrollX: -window.scrollX,
              scrollY: -window.scrollY,
              ignoreElements: (element) =>
                element.hasAttribute("data-html2canvas-ignore"),
            });
            const blob = await this.canvasToPngBlob(canvas);
            if (!blob) {
              throw new Error("Failed to create screenshot blob");
            }
            await this.saveScreenshotBlob(blob, this.buildScreenshotFileName());
          } catch (error) {
            if (!error || error.name !== "AbortError") {
              console.error("Screenshot capture failed:", error);
              alert("Failed to save screenshot.");
            }
          } finally {
            this.isCapturingScreenshot = false;
          }
        },
        // PC表示（smAndDown 以外）の血統表の行高を決める。
        // css/unified.css の --exp-pc-row-height はヘッダ高を固定値で近似した
        // フォールバックなので、ここで実測値へ寄せる。
        // 「16行がヘッダ下をどれだけ余らせている / はみ出しているか」を1行あたりに
        // 割り戻して足す、を数回繰り返して詰める。container の padding や表の外枠
        // ボーダー、子系統表示でヘッダが高くなるケースを個別に数えずに済み、
        // 行高と実際に使う高さの差（罫線分など）も繰り返しの中で吸収される。
        applyDesktopViewportLayout: function () {
          const app = this.$el;
          if (!app) {
            return;
          }
          if (this.$vuetify.breakpoint.smAndDown) {
            app.style.removeProperty("--exp-pc-row-height");
            return;
          }
          const docEl = document.documentElement || {};
          // clientHeight は横スクロールバーを含まない実際の表示領域。
          const viewportHeight =
            Number(docEl.clientHeight) || Number(window.innerHeight) || 0;
          if (!(viewportHeight > 0)) {
            return;
          }
          // 余白の測定は列（.pedigree-card-col）の下端で行う。カード自身の下端だと
          // 列の padding-bottom が漏れて、その分だけ縦スクロールバーが出てしまう。
          const col = app.querySelector(".pedigree-card-col");
          const row = col
            ? col.querySelector(".pedigree-card-shell .table_main > tbody > tr")
            : null;
          if (!col || !row) {
            return;
          }
          let rowHeight = row.getBoundingClientRect().height;
          if (!(rowHeight > 0)) {
            // 画面が非表示（currentScreen が category 以外）のときはまだ測れない。
            return;
          }
          for (let i = 0; i < DESKTOP_ROW_HEIGHT_FIT_STEPS; i++) {
            const scrollTop = window.scrollY || window.pageYOffset || 0;
            const slack =
              viewportHeight - (col.getBoundingClientRect().bottom + scrollTop);
            if (Math.abs(slack) < 1) {
              break;
            }
            const nextRowHeight = Math.min(
              DESKTOP_ROW_HEIGHT_MAX,
              Math.max(DESKTOP_ROW_HEIGHT_MIN, rowHeight + slack / 16)
            );
            if (Math.abs(nextRowHeight - rowHeight) < 0.01) {
              // 上限／下限に張り付いていて、これ以上詰められない。
              break;
            }
            rowHeight = nextRowHeight;
            app.style.setProperty(
              "--exp-pc-row-height",
              `${Math.round(rowHeight * 100) / 100}px`
            );
          }
        },
        scheduleInitialDesktopViewportLayout: function () {
          if (this.$vuetify.breakpoint.smAndDown) {
            return;
          }
          // 起動直後は血統表がまだ描画途中で行高が測れないことがあるため、
          // モバイル側と同じく数回に分けて適用する。
          [0, 160, 480, 960].forEach((delay) => {
            const timerId = setTimeout(() => {
              this.applyDesktopViewportLayout();
            }, delay);
            this.mobileViewportLockTimerIds.push(timerId);
          });
        },
        clearMobileViewportGeometryTimer: function () {
          if (this.mobileViewportGeometryTimerId !== null) {
            clearTimeout(this.mobileViewportGeometryTimerId);
            this.mobileViewportGeometryTimerId = null;
          }
        },
        isEditableElement: function (element) {
          if (!element) {
            return false;
          }
          if (element.isContentEditable) {
            return true;
          }
          const tagName = typeof element.tagName === "string"
            ? element.tagName.toLowerCase()
            : "";
          return tagName === "input" || tagName === "textarea";
        },
        shouldForceResetMobileViewportLock: function (viewportHeight) {
          if (!(viewportHeight > 0)) {
            return false;
          }
          if (!this.lockedMobileAppHeight || viewportHeight >= this.lockedMobileAppHeight) {
            return true;
          }
          const shrinkAmount = this.lockedMobileAppHeight - viewportHeight;
          if (shrinkAmount <= 140) {
            return true;
          }
          const activeElement = typeof document !== "undefined"
            ? document.activeElement
            : null;
          return !this.isEditableElement(activeElement);
        },
        clearMobileViewportLayoutTimers: function () {
          if (!Array.isArray(this.mobileViewportLockTimerIds)) {
            this.mobileViewportLockTimerIds = [];
            return;
          }
          this.mobileViewportLockTimerIds.forEach((timerId) => {
            clearTimeout(timerId);
          });
          this.mobileViewportLockTimerIds = [];
        },
        queueMobileViewportLayoutRetry: function (delay) {
          if (!this.$vuetify.breakpoint.smAndDown) {
            return;
          }
          const timerId = setTimeout(() => {
            this.applyMobileViewportLayout();
          }, delay);
          this.mobileViewportLockTimerIds.push(timerId);
        },
        scheduleInitialMobileViewportLayout: function () {
          if (!this.$vuetify.breakpoint.smAndDown) {
            return;
          }
          this.clearMobileViewportLayoutTimers();
          [0, 160, 480, 960, 1600, 2400].forEach((delay) => {
            const timerId = setTimeout(() => {
              this.refreshMobileViewportLock(delay === 0);
            }, delay);
            this.mobileViewportLockTimerIds.push(timerId);
          });
        },
        refreshMobileViewportLock: function (forceReset) {
          if (!this.$vuetify.breakpoint.smAndDown) {
            return;
          }
          const viewportHeight = this.getStableViewportHeight();
          if (!(viewportHeight > 0)) {
            return;
          }
          const shouldForceReset =
            forceReset || this.shouldForceResetMobileViewportLock(viewportHeight);
          if (shouldForceReset || !this.lockedMobileAppHeight) {
            this.lockedMobileAppHeight = viewportHeight;
          } else {
            this.lockedMobileAppHeight = Math.max(
              this.lockedMobileAppHeight,
              viewportHeight
            );
          }
          this.windowSize = this.getStableViewportHeight();
          this.$nextTick(() => {
            this.applyMobileViewportLayout();
          });
        },
        applyMobileViewportLayout: function () {
          const app = this.$el;
          if (!app) {
            return;
          }
          const rowEl =
            app.querySelector("main .container > .spacer > .row.mx-1") ||
            app.querySelector("main .container > .row.mx-1");
          const cardCols = Array.from(
            app.querySelectorAll(".pedigree-card-col")
          );

          if (!this.$vuetify.breakpoint.smAndDown) {
            if (rowEl) {
              rowEl.style.removeProperty("grid-template-rows");
            }
            cardCols.forEach((col) => {
              col.style.removeProperty("height");
              const card = col.querySelector(".pedigree-card-shell");
              if (card) {
                card.style.removeProperty("height");
              }
            });
            return;
          }
          if (!rowEl || cardCols.length !== 2) {
            this.queueMobileViewportLayoutRetry(120);
            return;
          }
          if (!this.lockedMobileAppHeight) {
            this.lockedMobileAppHeight = this.getStableViewportHeight();
          }
          const viewportHeight = this.lockedMobileAppHeight;
          const headerEl = this.$refs.appHeader;
          const headerHeight = headerEl
            ? Math.ceil(headerEl.getBoundingClientRect().height)
            : 0;
          const mainHeight = Math.max(120, viewportHeight - headerHeight);

          app.style.setProperty("--exp-mobile-app-height", `${viewportHeight}px`);
          app.style.setProperty("--exp-mobile-main-height", `${mainHeight}px`);

          void app.offsetHeight;

          const container = app.querySelector("main .container");
          const containerStyle = container
            ? window.getComputedStyle(container)
            : null;
          const containerPaddingHeight =
            containerStyle
              ? (parseFloat(containerStyle.paddingTop) || 0) +
                (parseFloat(containerStyle.paddingBottom) || 0)
              : 0;
          const rowStyle = rowEl ? window.getComputedStyle(rowEl) : null;
          const rowGap = rowStyle ? parseFloat(rowStyle.rowGap) || 0 : 0;
          // collapsed table の罫線と小数px丸めを含む内部予算。カード高の式にも
          // 同じ値を足すため外枠は変えず、320x568 でも16行を wrap 内へ収める。
          const safetyPerCard = 15;
          // container / gap / border は個別計上済みなので、残りの高さは
          // 2枚のカードへ使い切る。
          const layoutSafety = 0;

          const measuredCards = cardCols
            .map((col) => {
              const card = col.querySelector(".pedigree-card-shell");
              if (!card) {
                return null;
              }
              const toolbar = card.querySelector(".pedigree-card-toolbar");
              const tableWrap = card.querySelector(".pedigree-card-table-wrap");
              const toolbarRect = toolbar
                ? toolbar.getBoundingClientRect()
                : { height: 0 };
              const tableRect = tableWrap
                ? tableWrap.getBoundingClientRect()
                : { height: 0 };
              const cardStyle = window.getComputedStyle(card);
              const toolbarHeight = Math.ceil(toolbarRect.height || 0);
              const tableHeight = Math.ceil(tableRect.height || 0);
              const borderHeight =
                (parseFloat(cardStyle.borderTopWidth) || 0) +
                (parseFloat(cardStyle.borderBottomWidth) || 0) +
                safetyPerCard;
              return {
                col,
                card,
                toolbarHeight,
                tableHeight,
                borderHeight,
              };
            })
            .filter(Boolean);
          if (
            measuredCards.length !== cardCols.length ||
            measuredCards.some((value) => value.tableHeight <= 0)
          ) {
            this.queueMobileViewportLayoutRetry(120);
            return;
          }

          const fixedHeight =
            containerPaddingHeight +
            rowGap +
            layoutSafety +
            measuredCards.reduce(
              (sum, value) => sum + value.toolbarHeight + value.borderHeight,
              0
            );
          const rowHeight = Math.max(8, (mainHeight - fixedHeight) / 32);
          const cardHeights = measuredCards.map(
            (value) => rowHeight * 16 + value.toolbarHeight + value.borderHeight
          );

          if (rowEl && cardHeights.length === measuredCards.length) {
            rowEl.style.gridTemplateRows = cardHeights
              .map((height) => `${height}px`)
              .join(" ");
          }
          measuredCards.forEach((value, index) => {
            const height = cardHeights[index];
            value.col.style.height = `${height}px`;
            value.card.style.height = `${height}px`;
          });

          this.mobileRowHeight = rowHeight;
          app.style.setProperty("--exp-mobile-row-height", `${rowHeight}px`);

          this.markPedigreeStairEdges();
        },
        // 父母カラーバーの段の区切り(白線)は、真上に色セルがある箇所だけに出す。
        // 階段の外縁（真上が空白＝セレクタ/コンテンツ）の先頭セルでは白線を消す。
        // rowspan/colspan の格子なので CSS では判定できず、矩形の隣接で判定する。
        markPedigreeStairEdges: function () {
          const app = this.$el;
          if (!app) {
            return;
          }
          const EDGE_CLASS = "exp-mobile-colorseg-edge";
          const SELECTOR =
            "td.father, td.father_0, td.father_1, td.mother, td.mother_0, td.mother_1";
          const tables = app.querySelectorAll(
            ".pedigree-card-shell .table_main"
          );
          const isMobile = this.$vuetify.breakpoint.smAndDown;
          tables.forEach((table) => {
            const cells = Array.from(table.querySelectorAll(SELECTOR));
            if (!isMobile) {
              cells.forEach((cell) => cell.classList.remove(EDGE_CLASS));
              return;
            }
            const rects = cells.map((cell) => ({
              cell,
              rect: cell.getBoundingClientRect(),
            }));
            rects.forEach(({ cell, rect }) => {
              // 自分の上辺に底辺が接し、横方向に重なる色セルがあれば「真上が色」
              const hasColoredAbove = rects.some(
                ({ rect: other }) =>
                  Math.abs(other.bottom - rect.top) <= 2 &&
                  other.left < rect.right - 1 &&
                  other.right > rect.left + 1
              );
              cell.classList.toggle(EDGE_CLASS, !hasColoredAbove);
            });
          });
        },
  });
})(window, window.Vue);
