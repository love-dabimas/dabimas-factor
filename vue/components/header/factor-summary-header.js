/**
 * このコンポーネントの役割:
 * - appHeader 内のニトロ／クロス集計テーブルだけを担当する。
 * - root app から集計値と表示状態を props で受け取り、操作はイベントとして返す。
 * - 左上のマスはホームへ戻るボタン（go-home）。
 * - 「理論」（子系統表示では「相性」）のマスは、押すと工程診断の結果パネル
 *   （plan-open）、長押しで血統表の画像保存（capture-screenshot）。血統表が
 *   埋まりきるまでは理論の代わりに「残り○枠」を出す。
 *
 * このコンポーネントに置かない処理:
 * - ヘッダ外殻（<header ref="appHeader">）。$refs.appHeader は素の DOM 要素で
 *   applyMobileViewportLayout() が高さを測るため、index.html 側に残す。
 * - 血統計算、保存処理、スクリーンショット処理。
 *
 * 分けている理由:
 * - index.html には header の殻だけを残し、大きい集計テーブルは独立部品にする。
 * - ルート要素を table にして、描画後の DOM を既存と同じ header > table に保つ。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  // この時間押し続けたら長押しとみなす。
  var LONG_PRESS_MS = 500;

  var FactorSummaryHeader = {
    name: "factor-summary-header",
    props: {
      factorNums: { type: Array, required: true },
      inbreedFactorNums: { type: Array, required: true },
      categoryNum: { type: String, required: true },
      affinityText: { type: String, default: "--" },
      theoryClass: { type: String, required: true },
      dispCategory: { type: Number, required: true },
      combinationCellStyle: { type: [Object, String], required: true },
      isCapturingScreenshot: { type: Boolean, required: true },
      sireLineCounts: { type: Object, default: null },
      // 血統表の空きマス数。0 より大きい間は理論の代わりに「残り○枠」を出す。
      remainingCellCount: { type: Number, default: 0 },
      // 戻るボタンを押してからホームに切り替わるまで true。
      goingHome: { type: Boolean, default: false },
    },
    data: function () {
      return {
        longPressTimer: null,
        // 長押しの時間に達して、指を離せば画像保存する状態。マスの色を変えて知らせる。
        longPressArmed: false,
        longPressFired: false,
      };
    },
    computed: {
      remainingText: function () {
        return this.remainingCellCount > 0 ? "残り" + this.remainingCellCount + "枠" : "";
      },
      theoryValueClass: function () {
        return this.remainingText ? "theory-remaining" : this.theoryClass;
      },
      theoryArmedClass: function () {
        return { "theory-press-cell--armed": this.longPressArmed };
      },
      // 「理論」「相性」のマスに付けるイベント一式。押す・長押しを 1 か所で扱う。
      theoryPressHandlers: function () {
        return {
          pointerdown: this.onTheoryPressStart,
          pointerup: this.onTheoryPressRelease,
          pointerleave: this.onTheoryPressCancel,
          pointercancel: this.onTheoryPressCancel,
          contextmenu: this.onTheoryContextMenu,
          click: this.onTheoryClick,
        };
      },
      sireLineBuckets: function () {
        return Array.from({ length: 10 }, function (_, index) {
          return {
            index: index,
            label: index === 0 ? "未" : window.Dabimas.logic.sireLineColors.badgeFor(index),
            className: window.Dabimas.logic.sireLineColors.colorClassFor(index),
          };
        });
      },
    },
    beforeDestroy: function () {
      this.clearLongPressTimer();
    },
    methods: {
      onBackClick: function () {
        if (this.goingHome) {
          return;
        }
        this.$emit("go-home");
      },
      clearLongPressTimer: function () {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      },
      onTheoryPressStart: function (event) {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        this.clearLongPressTimer();
        this.longPressArmed = false;
        this.longPressFired = false;
        this.longPressTimer = setTimeout(() => {
          this.longPressTimer = null;
          this.longPressArmed = true;
        }, LONG_PRESS_MS);
      },
      // 画像保存は指を離した瞬間に始める。iPhone の共有シートは、指を離す操作の
      // 直後でないと開けないため（押している最中に始めると失敗する）。
      onTheoryPressRelease: function () {
        var armed = this.longPressArmed;
        this.clearLongPressTimer();
        this.longPressArmed = false;
        if (armed) {
          this.longPressFired = true;
          this.$emit("capture-screenshot");
        }
      },
      onTheoryPressCancel: function () {
        this.clearLongPressTimer();
        this.longPressArmed = false;
      },
      // iPhone の長押しメニュー（コピーなど）を出さない。
      onTheoryContextMenu: function (event) {
        event.preventDefault();
      },
      onTheoryClick: function () {
        // 長押しで画像保存したときは、指を離したときのクリックを無視する。
        if (this.longPressFired) {
          this.longPressFired = false;
          return;
        }
        this.$emit("plan-open");
      },
      sireLineBucketValue: function (kind, index) {
        var values = this.sireLineCounts && this.sireLineCounts[kind];
        return values && typeof values[index] === "number" ? values[index] : 0;
      },
    },
    template: `
        <table width="100%" style="border-collapse: collapse">
          <tbody v-if="$vuetify.breakpoint.mdAndUp && dispCategory % 2 === 0">
            <tr>
              <th
                rowspan="3"
                width="3%"
                class="summary-back-cell"
                aria-label="ホームへ戻る"
                title="ホームへ戻る"
                @click="onBackClick"
              >
                <v-icon size="x-large" color="white">mdi-arrow-left</v-icon>
              </th>
              <th rowspan="3" class="f00_nitro_space"></th>
              <th width="1%" rowspan="3" class="f00_nitro">
                <span>ニトロ</span>
              </th>
              <th colspan="14" class="f00_nitro_header"></th>
              <th rowspan="3" class="f00_inbreed_space"></th>
              <th width="1%" rowspan="3" class="f00_inbreed" @click="$emit('toggle-category')">
                <span>クロス</span>
              </th>
              <th colspan="14" class="f00_inbreed_header"></th>
              <th v-if="dispCategory % 2 === 0" rowspan="2" class="table_footer_TH_theory theory-press-cell" :class="theoryArmedClass" v-on="theoryPressHandlers">理論</th>
              <th v-else rowspan="2" class="table_footer_TH_theory">子系統数</th>
              <th
                rowspan="3"
                width="3%"
                :style="combinationCellStyle"
                aria-label="保存"
                title="保存"
                @click="$emit('combination-open')"
              >
                <v-icon size="x-large" color="white">mdi-content-save</v-icon>
              </th>
              <th
                rowspan="3"
                width="3%"
                @click="$emit('reset')"
                style="background-color: #aa0000; cursor: pointer"
              >
                <v-icon size="x-large" color="white">mdi-reload</v-icon>
              </th>
            </tr>
            <tr class="f00">
              <th width="1%" class="f01">短</th>
              <th class="f02">速</th>
              <th class="f03">底</th>
              <th class="f04">長</th>
              <th class="f11">走</th>
              <th class="f12">中</th>
              <th class="f13">強</th>
              <th class="f14">雷</th>
              <th class="f09">堅</th>
              <th class="f10">難</th>
              <th class="f05">適</th>
              <th class="f06">丈</th>
              <th class="f07">早</th>
              <th class="f08">晩</th>
              <th class="f01">短</th>
              <th class="f02">速</th>
              <th class="f03">底</th>
              <th class="f04">長</th>
              <th class="f11">走</th>
              <th class="f12">中</th>
              <th class="f13">強</th>
              <th class="f14">雷</th>
              <th class="f09">堅</th>
              <th class="f10">難</th>
              <th class="f05">適</th>
              <th class="f06">丈</th>
              <th class="f07">早</th>
              <th class="f08">晩</th>
            </tr>
            <tr>
              <th class="factorNumCell">{{factorNums[0]}}</th>
              <th class="factorNumCell">{{factorNums[1]}}</th>
              <th class="factorNumCell">{{factorNums[2]}}</th>
              <th class="factorNumCell">{{factorNums[3]}}</th>
              <th class="factorNumCell">{{factorNums[10]}}</th>
              <th class="factorNumCell">{{factorNums[11]}}</th>
              <th class="factorNumCell">{{factorNums[12]}}</th>
              <th class="factorNumCell">{{factorNums[13]}}</th>
              <th class="factorNumCell">{{factorNums[8]}}</th>
              <th class="factorNumCell">{{factorNums[9]}}</th>
              <th class="factorNumCell">{{factorNums[4]}}</th>
              <th class="factorNumCell">{{factorNums[5]}}</th>
              <th class="factorNumCell">{{factorNums[6]}}</th>
              <th class="factorNumCell">{{factorNums[7]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[0]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[1]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[2]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[3]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[10]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[11]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[12]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[13]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[8]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[9]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[4]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[5]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[6]}}</th>
              <th class="factorNumCell">{{inbreedFactorNums[7]}}</th>
              <th v-if="dispCategory % 2 === 0" :class="[theoryValueClass, 'theory-press-cell', theoryArmedClass]" v-on="theoryPressHandlers">{{ remainingText }}</th>
              <th v-else >{{categoryNum}}</th>
            </tr>
          </tbody>

          <tbody
            v-if="$vuetify.breakpoint.mdAndUp && dispCategory % 2 === 1"
            class="sire-line-summary sire-line-summary--desktop"
          >
            <tr>
              <th
                rowspan="3"
                width="3%"
                class="summary-back-cell"
                aria-label="ホームへ戻る"
                title="ホームへ戻る"
                @click="onBackClick"
              >
                <v-icon size="x-large" color="white">mdi-arrow-left</v-icon>
              </th>
              <th
                width="1%"
                rowspan="3"
                class="f00_inbreed sire-line-summary-back"
                @click="$emit('toggle-category')"
              ><span>系統</span></th>
              <!-- 見出しの列（色／系統数／出現数）に幅を指定しないと、colspan の
                   ぶんを割り振ったあとの余りが全部ここへ来て、PC幅では 790px の
                   赤い帯になっていた（1366px のうち6割）。ニトロ・クロス側の
                   見出しと同じ 1% にして、余りは①〜⑨の列へ回す。 -->
              <th width="5%" class="f00_inbreed_header">色</th>
              <th
                v-for="bucket in sireLineBuckets"
                :key="'desktop-head-' + bucket.index"
                colspan="3"
                width="8%"
                :class="bucket.className"
              >{{ bucket.label }}</th>
              <th width="5%" rowspan="2" class="table_footer_TH_theory theory-press-cell" :class="theoryArmedClass" v-on="theoryPressHandlers">相性</th>
              <th
                rowspan="3"
                width="3%"
                :style="combinationCellStyle"
                aria-label="保存"
                title="保存"
                @click="$emit('combination-open')"
              ><v-icon size="x-large" color="white">mdi-content-save</v-icon></th>
              <th
                rowspan="3"
                width="3%"
                @click="$emit('reset')"
                style="background-color: #aa0000; cursor: pointer"
              ><v-icon size="x-large" color="white">mdi-reload</v-icon></th>
            </tr>
            <tr>
              <th width="5%" class="f00_nitro">系統数</th>
              <td
                v-for="bucket in sireLineBuckets"
                :key="'desktop-distinct-' + bucket.index"
                colspan="3"
                class="factorNumCell"
              >{{ sireLineBucketValue('distinct', bucket.index) }}</td>
            </tr>
            <tr>
              <th width="5%" class="f00_inbreed">出現数</th>
              <td
                v-for="bucket in sireLineBuckets"
                :key="'desktop-total-' + bucket.index"
                colspan="3"
                class="factorNumCell"
              >{{ sireLineBucketValue('total', bucket.index) }}</td>
              <td
                class="sire-line-affinity-value theory-press-cell"
                :class="[{ 'theory-remaining': remainingText }, theoryArmedClass]"
                v-on="theoryPressHandlers"
              >{{ remainingText || affinityText }}</td>
            </tr>
          </tbody>

          <tbody v-if="$vuetify.breakpoint.smAndDown && dispCategory % 2 === 0">
            <tr>
              <td colspan="2" class="exp-mobile-back-cell summary-back-cell">
                <button
                  type="button"
                  class="exp-mobile-back-button"
                  :disabled="goingHome"
                  aria-label="ホームへ戻る"
                  title="ホームへ戻る"
                  data-html2canvas-ignore="true"
                  @click.stop.prevent="onBackClick"
                >
                  <v-icon color="white">mdi-arrow-left</v-icon>
                </button>
              </td>
              <td class="f01">短</td>
              <td class="f02">速</td>
              <td class="f03">底</td>
              <td class="f04">長</td>
              <td class="f11">走</td>
              <td class="f12">中</td>
              <td class="f13">強</td>
              <td class="f14">雷</td>
              <td class="f09">堅</td>
              <td class="f10">難</td>
              <td class="f05">適</td>
              <td class="f06">丈</td>
              <td class="f07">早</td>
              <td class="f08">晩</td>
              <th v-if="dispCategory % 2 === 0" class="f00_theory theory-press-cell" :class="theoryArmedClass" v-on="theoryPressHandlers">理論</th>
              <th v-else class="f00_theory">子系統</th>
            </tr>
            <tr class="mobile-nitro-header-row">
              <td colspan="16" class="f00_nitro_header"></td>
              <td
                v-if="dispCategory % 2 === 0"
                rowspan="2"
                :class="['mobile-nitro-rowspan', 'theory-press-cell', theoryValueClass, theoryArmedClass]"
                align="center"
                v-on="theoryPressHandlers"
              >{{ remainingText }}</td>
              <td v-else rowspan="2" align="center" class="mobile-nitro-rowspan">{{categoryNum}}</td>

            </tr>
            <tr class="mobile-nitro-value-row">
              <td class="f00_nitro" colspan="2">ニトロ</td>
              <td class="factorNumCell">{{factorNums[0]}}</td>
              <td class="factorNumCell">{{factorNums[1]}}</td>
              <td class="factorNumCell">{{factorNums[2]}}</td>
              <td class="factorNumCell">{{factorNums[3]}}</td>
              <td class="factorNumCell">{{factorNums[10]}}</td>
              <td class="factorNumCell">{{factorNums[11]}}</td>
              <td class="factorNumCell">{{factorNums[12]}}</td>
              <td class="factorNumCell">{{factorNums[13]}}</td>
              <td class="factorNumCell">{{factorNums[8]}}</td>
              <td class="factorNumCell">{{factorNums[9]}}</td>
              <td class="factorNumCell">{{factorNums[4]}}</td>
              <td class="factorNumCell">{{factorNums[5]}}</td>
              <td class="factorNumCell">{{factorNums[6]}}</td>
              <td class="factorNumCell">{{factorNums[7]}}</td>
            </tr>
            <tr class="mobile-cross-header-row">
              <td colspan="16" class="f00_inbreed_header"></td>
              <td v-if="dispCategory % 2 === 0" rowspan="2" @click="$emit('reset')" class="mobile-cross-rowspan" style="background-color: #aa0000" align="center"><v-icon size="large" color="white">mdi-reload</v-icon></td>
              <td
                v-else
                rowspan="2"
                :style="combinationCellStyle"
                align="center"
                class="mobile-cross-rowspan"
                @click="$emit('combination-open')"
              ><v-icon size="large" color="white">mdi-content-save</v-icon></td>
            </tr>
            <tr class="mobile-cross-value-row">
              <td colspan="2" class="f00_inbreed">クロス</td>
              <td class="factorNumCell">{{inbreedFactorNums[0]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[1]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[2]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[3]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[10]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[11]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[12]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[13]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[8]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[9]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[4]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[5]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[6]}}</td>
              <td class="factorNumCell">{{inbreedFactorNums[7]}}</td>
            </tr>            <!-- ここから下がいらない -->
          </tbody>

          <tbody
            v-if="$vuetify.breakpoint.smAndDown && dispCategory % 2 === 1"
            class="sire-line-summary sire-line-summary--mobile"
          >
            <tr>
              <td colspan="2" class="exp-mobile-back-cell summary-back-cell">
                <button
                  type="button"
                  class="exp-mobile-back-button"
                  :disabled="goingHome"
                  aria-label="ホームへ戻る"
                  title="ホームへ戻る"
                  data-html2canvas-ignore="true"
                  @click.stop.prevent="onBackClick"
                ><v-icon color="white">mdi-arrow-left</v-icon></button>
              </td>
              <th
                v-for="bucket in sireLineBuckets"
                :key="'mobile-head-' + bucket.index"
                :class="bucket.className"
              >{{ bucket.label }}</th>
              <th class="f00_theory theory-press-cell" :class="theoryArmedClass" v-on="theoryPressHandlers">相性</th>
            </tr>
            <tr>
              <td colspan="2" class="f00_nitro">系統数</td>
              <td
                v-for="bucket in sireLineBuckets"
                :key="'mobile-distinct-' + bucket.index"
                class="factorNumCell"
              >{{ sireLineBucketValue('distinct', bucket.index) }}</td>
              <td
                class="mobile-nitro-rowspan sire-line-affinity-value theory-press-cell"
                :class="[{ 'theory-remaining': remainingText }, theoryArmedClass]"
                align="center"
                v-on="theoryPressHandlers"
              >{{ remainingText || affinityText }}</td>
            </tr>
            <tr>
              <td colspan="2" class="f00_inbreed">出現数</td>
              <td
                v-for="bucket in sireLineBuckets"
                :key="'mobile-total-' + bucket.index"
                class="factorNumCell"
              >{{ sireLineBucketValue('total', bucket.index) }}</td>
              <td
                :style="combinationCellStyle"
                align="center"
                class="mobile-cross-rowspan"
                aria-label="保存"
                title="保存"
                @click="$emit('combination-open')"
              ><v-icon size="large" color="white">mdi-content-save</v-icon></td>
            </tr>
          </tbody>
        </table>
    `,
  };

  window.Dabimas.components.FactorSummaryHeader = FactorSummaryHeader;
  Vue.component("factor-summary-header", FactorSummaryHeader);
})(window, window.Vue);
