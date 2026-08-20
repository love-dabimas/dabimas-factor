/**
 * このコンポーネントの役割:
 * - 血統表の1行だけを描画する。種牡馬側・繁殖牝馬側のどちらでも同じものを使う。
 * - row（行の形。headCells・結合セル数・親系統表示可否など、行が変わらない限り
 *   不変）と rowState（今この行に表示する値。選択馬名・因子・インブリード状態など、
 *   root app の状態が変わるたびに作り直される）を分けて受け取る。
 * - horseOptions は「馬を選ぶ／メモを書く」セル（horse-cell）が
 *   必要とする、行をまたぐ情報（選択済み一覧・候補一覧・保存用コールバック等）の詰め合わせ。
 * - displayOptions はボタンサイズ・:key用のreload値・子系統ボタンのラベルなど、
 *   表示の微調整に使う値の詰め合わせ。
 *
 * このコンポーネントに置かない処理:
 * - 保存、fetch、IndexedDB、localStorage、血統計算、インブリード判定。
 * - 種牡馬側か繁殖牝馬側かの判定（row.index と row.showParentLine から外側で決まる）。
 *
 * 分けている理由:
 * - root app の selected / factorName / styleFactorClasses などの配列名を
 *   直接知っていると、配列の持ち方を変えるたびにこの行コンポーネントも
 *   直す必要が出る。rowState という「完成品」だけを受け取る形にして、
 *   将来の変更をここに波及させない。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var PedigreeRow = {
      template: `
    <tr>
      <template v-for="cell in row.headCells" :key="cell.key">
        <td
          :class="cell.class"
          :rowspan="cell.rowspan"
          :colspan="cell.colspan"
          :width="cell.width"
          :align="cell.align"
        >{{ cell.text }}</td>
      </template>

      <td :class="[row.autoClass, rowState.categoryColorClass]" :colspan="row.autoColspan">
        <horse-cell
          :class="rowState.rowColorClass"
          :index="row.index"
          :selected="horseOptions.selected"
          :horses="horseOptions.lists"
          :on-change="horseOptions.onChange"
          :disp-category="horseOptions.dispCategory"
          :category="horseOptions.category"
          :inputed="horseOptions.inputed"
          :memo-change="horseOptions.memoChange"
          :color-settings="horseOptions.sireLineColors"
        />
      </td>

      <td :class="rowState.generationCellClass">
        {{ rowState.generationLabel }}
      </td>

      <td :class="rowState.parentLineClass">
        <span class="styleParentLineText">
          {{ row.showParentLine ? rowState.parentLineText : '' }}
        </span>
      </td>

      <td :class="rowState.inbreedButtonClass">
        <template v-if="$vuetify.breakpoint.smAndDown">
          <button
            v-if="rowState.inbreedButtonState === -1"
            type="button"
            class="exp-mobile-icon-btn"
            @click="onInbreedButtonClick"
          ><i class="mdi mdi-heart-outline"></i></button>
          <button
            v-else-if="rowState.inbreedButtonState === 1"
            type="button"
            class="exp-mobile-icon-btn exp-mobile-icon-btn--active"
            @click="onInbreedButtonClick"
          ><i class="mdi mdi-heart"></i></button>
          <button
            v-else
            type="button"
            class="exp-mobile-icon-btn exp-mobile-icon-btn--disabled"
            disabled
          ><i class="mdi mdi-heart"></i></button>
        </template>
        <template v-else>
          <v-btn
            v-if="rowState.inbreedButtonState === -1"
            :key="displayOptions.reload"
            @click="onInbreedButtonClick"
            icon
            v-bind="displayOptions.size"
          ><v-icon>mdi-heart-outline</v-icon></v-btn>
          <v-btn
            v-else-if="rowState.inbreedButtonState === 1"
            :key="displayOptions.reload"
            @click="onInbreedButtonClick"
            icon
            color="pink"
            v-bind="displayOptions.size"
          ><v-icon>mdi-heart</v-icon></v-btn>
          <v-btn
            v-else
            :key="displayOptions.reload"
            icon
            color="pink"
            disabled
            v-bind="displayOptions.size"
          ><v-icon>mdi-heart</v-icon></v-btn>
        </template>
      </td>

      <template v-if="rowIndex === 16">
        <td
          colspan="3"
          :class="rowState.factorClasses[0]"
        >
          <button
            v-if="$vuetify.breakpoint.smAndDown"
            type="button"
            class="exp-mobile-text-btn"
            @click="handleToggleCategory"
          >{{ displayOptions.dispButtonName || '' }}</button>
          <v-btn v-else variant="outlined" block @click="handleToggleCategory">{{ displayOptions.dispButtonName || '' }}</v-btn>
        </td>
      </template>
      <template v-else>
        <td
          :class="rowState.factorClasses[0]"
          :colspan="shouldCollapseFactors ? 3 : null"
        >
          <template v-if="shouldCollapseFactors">
            <v-btn v-if="$vuetify.breakpoint.mdAndUp" variant="outlined" block @click.stop.prevent="openFactorDialog">因子</v-btn>
            <v-btn v-if="$vuetify.breakpoint.smAndDown" variant="outlined" x-small block @click.stop.prevent="openFactorDialog">因子</v-btn>
          </template>
          <template v-else>
            <!-- <v-btn v-if="shouldShowFirstFactorButton" class="manual-factor-trigger" @click.stop.prevent="openFactorDialog">因</v-btn> -->
            <template v-if="shouldShowFirstFactorButton">
              <v-btn
                v-if="$vuetify.breakpoint.mdAndUp"
                variant="outlined"
                block
                @click.stop.prevent="openFactorDialog"
              >
                因
              </v-btn>
              <v-btn
                v-if="$vuetify.breakpoint.smAndDown"
                variant="outlined"
                x-small
                block
                @click.stop.prevent="openFactorDialog"
              >
                因
              </v-btn>
            </template>
            <template v-else>
              {{ rowState.factorTexts[0] }}
            </template>
          </template>

          <factor-dialog
            v-if="isStarSelection"
            :visible.sync="factorDialogVisible"
            :selected-horse-name="selectedHorseName"
            :current-factors="extractCurrentManualFactors()"
            @confirm="handleFactorConfirm"
          ></factor-dialog>
        </td>
        <template v-if="!shouldCollapseFactors">
          <td
            :class="rowState.factorClasses[1]"
            :style="isStarSelection ? 'cursor: pointer' : ''"
            @click.stop.prevent="isStarSelection ? openFactorDialog() : null"
          >
            {{ rowState.factorTexts[1] }}
          </td>
          <td
            :class="rowState.factorClasses[2]"
            :style="isStarSelection ? 'cursor: pointer' : ''"
            @click.stop.prevent="isStarSelection ? openFactorDialog() : null"
          >
            {{ rowState.factorTexts[2] }}
          </td>
        </template>
      </template>
    </tr>
    `,
      props: {
        /**
         * row は「この行の形」。例: 先頭に父母セルが何個あるか、馬名セルを何列分にするか。
         * vue/logic/pedigree/row-configs.js が作る、行が変わらない限り変化しない値。
         */
        row: { type: Object, required: true },
        /**
         * rowState は「この行の中身」。選ばれている馬名、因子、ハートボタンの状態など。
         * vue/logic/pedigree/pedigree-selection.js が root app の32行ぶんの配列から
         * この行の分だけ切り出して作る。
         */
        rowState: { type: Object, required: true },
        /**
         * horseOptions は馬選択・メモ入力セル（horse-cell）に橋渡しする値の束。
         * horse-cell 自体は memo-cell / desktop-horse-autocomplete /
         * mobile-horse-picker にさらに分割済み（docs/index-split-completion-plan.md Phase 3）。
         */
        horseOptions: { type: Object, required: true },
        /**
         * displayOptions はボタンサイズ・reload（:key用）・子系統ボタンのラベルなど、
         * 表示にだけ関わる値の束。
         */
        displayOptions: { type: Object, default: () => ({}) },
      },
      data() {
        return {
          factorDialogVisible: false,
        };
      },
      computed: {
        rowIndex() {
          const value =
            this.row && typeof this.row.index !== "undefined"
              ? this.row.index
              : 0;
          const index = Number(value);
          return Number.isFinite(index) ? index : 0;
        },
        selectedHorseName() {
          return (this.rowState && this.rowState.selectedHorseName) || "";
        },
        isStarSelection() {
          const name = this.selectedHorseName;
          return (
            !!name && name.startsWith("★") && !this.rowState.factorLocked
          );
        },
        hasConfiguredFactorClasses() {
          const classes = (this.rowState && this.rowState.factorClasses) || [];
          return classes.some((value) => /^f\d{2}/.test((value || "").trim()));
        },
        shouldCollapseFactors() {
          return this.isStarSelection && !this.hasConfiguredFactorClasses;
        },
        shouldShowFirstFactorButton() {
          return this.isStarSelection && this.hasConfiguredFactorClasses;
        },
      },
      methods: {
        // ハートボタンを押した後の再集計・保存は親（root app）の仕事。
        // この部品で全部やると種牡馬側・繁殖牝馬側で使い回せなくなるため、
        // ここでは「何行目が押されたか」だけを親に伝える。
        onInbreedButtonClick() {
          this.$emit("inbreed-toggle", { index: this.rowIndex });
        },
        openFactorDialog() {
          if (!this.isStarSelection) {
            return;
          }
          this.factorDialogVisible = true;
        },
        handleFactorConfirm(selectedFactors) {
          // dialog は「選んだ結果」を返すだけ。どの行のどの状態に反映するかは
          // root app の仕事なので、行番号とセットで返す。
          this.$emit("manual-factor-update", {
            index: this.rowIndex,
            factors: selectedFactors,
          });
        },
        handleToggleCategory() {
          this.$emit("toggle-category");
        },
        extractCurrentManualFactors() {
          const manualFactorOptions =
            window.Dabimas.constants.factorDefinitions.MANUAL_FACTOR_OPTIONS;
          const texts = (this.rowState && this.rowState.factorTexts) || [];
          return [texts[1], texts[2]]
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter((value) => value && manualFactorOptions.includes(value));
        },
      },
  };

  window.Dabimas.components.PedigreeRow = PedigreeRow;
  Vue.component("pedigree-row", PedigreeRow);
})(window, window.Vue);
