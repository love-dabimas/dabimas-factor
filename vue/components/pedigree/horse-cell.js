/**
 * このファイルの役割:
 * - 血統表の1セル分の「馬を選ぶ／メモを書く」部品（horse-cell）。
 * - PC 向け選択は desktop-horse-autocomplete、モバイル向け選択・検索は
 *   mobile-horse-picker、子系統＋メモ表示は memo-cell に委譲し、
 *   isMobileLayout / dispCategory で出し分けるだけの薄い親になっている
 *   （docs/index-split-completion-plan.md Phase 3）。
 *
 * このファイルに置かない処理:
 * - 保存、fetch、IndexedDB、血統計算、インブリード判定。
 * - 馬名の正規化・絞り込み（vue/logic/horses/horse-search.js に委譲）。
 *
 * 分けている理由:
 * - index.html に全部書くと変更箇所が広がるため、この部品だけ見れば
 *   検索・選択・メモまわりを直せるようにする。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  // horseListKeyCache/horseListKeySeq は
  // vue/components/pedigree/mobile-horse-picker.js へ外部化済み。

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりメソッド本体を1文字も変えずに移動できる（逐語移動原則）。
  var INDEX_TO_ROW_NUMBER = window.Dabimas.constants.pedigreeIndexes.INDEX_TO_ROW_NUMBER;

  // カスタムコンポーネント定義（コンボボックス）
  Vue.component("horse-cell", {
      template: `
      <div class="exp-mobile-autocomplete-root">
        <template v-if="dispCategory%2 === 0">
          <template v-if="isMobileLayout">
            <button
              type="button"
              class="exp-mobile-horse-trigger"
              @click="$refs.mobilePicker.openMobileEditor()"
            >
              <span class="exp-mobile-horse-text">{{ mobileTriggerLabel }}</span>
              <i class="mdi mdi-chevron-down"></i>
            </button>
            <mobile-horse-picker
              ref="mobilePicker"
              :index="index"
              :sex="sex"
              :selected="selected"
              :lists="lists"
              :placeholder-text="placeholderText"
              @horse-change="onChange(sex, $event.localIndex, $event.horse)"
            ></mobile-horse-picker>
          </template>

          <desktop-horse-autocomplete
            v-else
            :index="index"
            :sex="sex"
            :selected="selected"
            :lists="lists"
            :placeholder-text="placeholderText"
            @horse-change="onChange(sex, $event.localIndex, $event.horse)"
          ></desktop-horse-autocomplete>
        </template>
      <memo-cell
        v-else
        :index="index"
        :category="category"
        :inputed="inputed"
        :color-settings="colorSettings"
        @memo-change="memoChange(index, $event)"
      ></memo-cell>
    </div>    `,
      props: {
        index: {
          type: Number,
          required: true,
        },
        inputed: {
          type: Array,
          required: true,
        },
        selected: {
          type: Array,
          required: true,
        },
        horses: {
          type: Array,
          required: true,
        },
        onChange: {
          type: Function,
          required: true,
        },
        memoChange: {
          type: Function,
          required: true,
        },
        dispCategory: {
          type: Number,
          required: true,
        },
        category: {
          type: Array,
          required: true,
        },
        colorSettings: {
          type: Object,
          default: null,
        },
      },
      // data() / beforeDestroy() は mobile-horse-picker.js に外部化済み
      // （mobileDialogVisible 等のダイアログ状態と、その破棄処理）。
      // 注意: 以前ここに getStableViewportHeight / applyMobileViewportLayout /
      // captureMobileScreenshot 等（root app 側と同名の重複コード、約369行）があったが、
      // このコンポーネントのテンプレート・他メソッドのどこからも呼ばれていない
      // 到達不能コードだったため削除した（実際に使われているのは root app 側のみ）。
      methods: {
        // normalizeSearchText / getHorseKey / getHorseListKey は
        // vue/components/pedigree/mobile-horse-picker.js に外部化済み。
        getHorseBaseText(horse) {
          return window.Dabimas.logic.horses.getHorseBaseText(horse);
        },
        getHorseSelectedText(horse) {
          return this.getHorseBaseText(horse);
        },
        // getHorseSearchIndexText / getHorseFactorBadges /
        // clearMobileQuerySyncTimer 〜 isSelectedHorse（ダイアログ本体の
        // 状態・IME・検索絞り込み一式）は
        // vue/components/pedigree/mobile-horse-picker.js に外部化済み。
      },
      computed: {
        computedStyle(newValue) {
          return {
            maxWidth: `calc(50% + ${this.getOffset(newValue.index)}px)`
          };
        },
        placeholderText(newValue) {
          if (
            Math.floor(newValue.index / 16) === 1 &&
            newValue.index % 16 === 0
          ) {
            return "繫殖牝馬を選んでください";
          } else {
            switch (newValue.index % 16) {
              case 3:
              case 5:
              case 7:
              case 9:
              case 11:
              case 13:
              case 15:
                return "種牡馬 or 繫殖牝馬を選んでください";
                break;
              default:
                return "種牡馬を選んでください";
                break;
            }
          }
        },
        sex(newValue) {
          // index>=16が牝馬
          return Math.floor(newValue.index / 16);
        },
        isMobileLayout() {
          return this.$vuetify.breakpoint.smAndDown;
        },
        placeholderText() {
          const currentIndex = Number(this.index) || 0;
          const rowNumber = INDEX_TO_ROW_NUMBER[currentIndex] || "";
          let baseText;
          if (Math.floor(currentIndex / 16) === 1 && currentIndex % 16 === 0) {
            baseText = "繁殖牝馬を選んでください";
          } else if ([3, 5, 7, 9, 11, 13, 15].includes(currentIndex % 16)) {
            baseText = "種牡馬または繁殖牝馬を選んでください";
          } else {
            baseText = "種牡馬を選んでください";
          }
          return rowNumber ? `${rowNumber}${baseText}` : baseText;
        },
        mobilePlaceholderText() {
          const currentIndex = Number(this.index) || 0;
          const rowNumber = INDEX_TO_ROW_NUMBER[currentIndex] || "";
          let baseText;
          if (Math.floor(currentIndex / 16) === 1 && currentIndex % 16 === 0) {
            baseText = "繁殖牝馬を選択";
          } else if ([3, 5, 7, 9, 11, 13, 15].includes(currentIndex % 16)) {
            baseText = "種牡馬/牝馬を選択";
          } else {
            baseText = "種牡馬を選択";
          }
          return rowNumber ? `${rowNumber}${baseText}` : baseText;
        },
        mobileTriggerLabel() {
          const horse = this.selected[this.index];
          if (!horse) {
            return this.mobilePlaceholderText;
          }
          return this.getHorseSelectedText(horse) || this.placeholderText;
        },
        // mobileDialogTitle / mobileDialogContextLabel / mobileCurrentSelectionLabel /
        // mobileInputId / filteredMobileLists は
        // vue/components/pedigree/mobile-horse-picker.js に外部化済み。
        sex() {
          return Math.floor((Number(this.index) || 0) / 16);
        },
        // 馬のリスト
        lists(newValue) {
          let retList;

          if (this.sex === 1 && this.index % 16 === 0) {
            //繫殖牝馬をセット
            retList = this.horses[2];
          } else {
            switch (this.index % 16) {
              case 3:
              case 5:
              case 7:
              case 9:
              case 11:
              case 13:
              case 15:
                // 種牡馬と繫殖牝馬をセット
                retList = this.horses[0];
                break;
              default:
                // 種牡馬のみをセット
                retList = this.horses[1];
                break;
            }
          }
          return retList;
        },
      },
    });
})(window, window.Vue);
