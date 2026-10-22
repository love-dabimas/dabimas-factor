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

  // 自家製馬のマスをこの時間押し続けたら長押しとみなし、メモの全文を吹き出しに出す。
  var CELL_MEMO_LONG_PRESS_MS = 500;
  // マスの下にこれだけの余白が無ければ、吹き出しをマスの上に出す。
  var CELL_MEMO_BUBBLE_MIN_SPACE = 140;

  // カスタムコンポーネント定義（コンボボックス）
  Vue.component("horse-cell", {
      template: `
      <div
        class="exp-mobile-autocomplete-root"
        :class="{ 'exp-horse-cell--select': dispCategory%2 === 0 }"
      >
        <template v-if="dispCategory%2 === 0">
          <span v-if="cellBadges.length" class="exp-horse-badges">
            <span
              v-for="badge in cellBadges"
              :key="badge.key"
              :class="['exp-horse-badge', badge.className]"
              :title="badge.title"
            >{{ badge.text }}</span>
          </span>
          <template v-if="isMobileLayout">
            <!-- 自家製馬のマスは長押しでメモの全文を吹き出しに出す（下の exp-cell-memo-bubble）。 -->
            <button
              type="button"
              class="exp-mobile-horse-trigger"
              :class="{ 'exp-mobile-horse-trigger--memo': !!cellMemo }"
              @pointerdown="onTriggerPressStart"
              @pointermove="onTriggerPressMove"
              @pointerup="onTriggerPressEnd"
              @pointerleave="onTriggerPressEnd"
              @pointercancel="onTriggerPressEnd"
              @contextmenu="onTriggerContextMenu"
              @click="onTriggerClick"
            >
              <span class="exp-mobile-horse-text">{{ mobileTriggerLabel }}</span>
              <i class="mdi mdi-chevron-down"></i>
            </button>
            <div
              v-if="memoBubble"
              class="exp-cell-memo-bubble"
              :style="memoBubble.style"
            >
              <div class="exp-cell-memo-bubble-name">{{ memoBubble.name }}</div>
              <div class="exp-cell-memo-bubble-text">{{ memoBubble.text }}</div>
            </div>
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
      // ここに持つのは、自家製馬のメモを長押しで出す吹き出しの状態だけ。
      data() {
        return {
          memoBubble: null,
          memoPressTimer: null,
          memoPressStart: null,
          memoLongPressFired: false,
          memoBubbleJustClosed: false,
        };
      },
      beforeDestroy() {
        this.clearMemoPressTimer();
        this.removeMemoBubbleListeners();
      },
      // 注意: 以前ここに getStableViewportHeight / applyMobileViewportLayout /
      // captureMobileScreenshot 等（root app 側と同名の重複コード、約369行）があったが、
      // このコンポーネントのテンプレート・他メソッドのどこからも呼ばれていない
      // 到達不能コードだったため削除した（実際に使われているのは root app 側のみ）。
      methods: {
        // ===== 自家製馬のメモの吹き出し =====
        clearMemoPressTimer() {
          if (this.memoPressTimer) {
            clearTimeout(this.memoPressTimer);
            this.memoPressTimer = null;
          }
        },
        // メモのある自家製馬のマスを 0.5 秒押し続けたら、メモの全文を吹き出しに出す。
        onTriggerPressStart(event) {
          this.memoLongPressFired = false;
          this.clearMemoPressTimer();
          if (!this.cellMemo || (event.button !== undefined && event.button !== 0)) {
            return;
          }
          var trigger = event.currentTarget;
          this.memoPressStart = { x: event.clientX, y: event.clientY };
          this.memoPressTimer = setTimeout(() => {
            this.memoPressTimer = null;
            this.memoLongPressFired = true;
            this.showMemoBubble(trigger);
          }, CELL_MEMO_LONG_PRESS_MS);
        },
        // 血統表をスクロールしようとして指が動いたら、長押しにしない。
        onTriggerPressMove(event) {
          if (!this.memoPressTimer || !this.memoPressStart) {
            return;
          }
          var dx = event.clientX - this.memoPressStart.x;
          var dy = event.clientY - this.memoPressStart.y;
          if (dx * dx + dy * dy > 100) {
            this.clearMemoPressTimer();
          }
        },
        onTriggerPressEnd() {
          this.clearMemoPressTimer();
        },
        // iPhone の長押しメニュー（コピーなど）を出さない。
        onTriggerContextMenu(event) {
          if (this.cellMemo) {
            event.preventDefault();
          }
        },
        onTriggerClick() {
          // 長押しで吹き出しを出したとき・吹き出しを消すタップでは、選ぶ画面を開かない。
          if (this.memoLongPressFired || this.memoBubbleJustClosed) {
            this.memoLongPressFired = false;
            this.memoBubbleJustClosed = false;
            return;
          }
          this.$refs.mobilePicker.openMobileEditor();
        },
        // マスのすぐ下（入りきらなければ上）に吹き出しを出す。血統表は画面に固定で
        // 並んでいるので、画面を基準に置く。
        showMemoBubble(trigger) {
          var memo = this.cellMemo;
          if (!trigger || !memo) {
            return;
          }
          var rect = trigger.getBoundingClientRect();
          var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
          var width = Math.min(viewportWidth - 24, 320);
          var left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
          var style = { left: Math.round(left) + "px", width: Math.round(width) + "px" };
          if (rect.bottom + CELL_MEMO_BUBBLE_MIN_SPACE > viewportHeight) {
            style.bottom = Math.round(viewportHeight - rect.top + 4) + "px";
          } else {
            style.top = Math.round(rect.bottom + 4) + "px";
          }
          this.memoBubble = {
            name: this.cellMemoHorseName,
            text: memo,
            style: style,
          };
          // 次に画面のどこかを触るか、スクロールしたら消す。
          this.removeMemoBubbleListeners();
          this.memoBubbleCloser = () => {
            this.hideMemoBubble();
            this.memoBubbleJustClosed = true;
            setTimeout(() => {
              this.memoBubbleJustClosed = false;
            }, 600);
          };
          this.memoBubbleScrollCloser = () => this.hideMemoBubble();
          document.addEventListener("pointerdown", this.memoBubbleCloser, true);
          window.addEventListener("scroll", this.memoBubbleScrollCloser, true);
        },
        hideMemoBubble() {
          this.memoBubble = null;
          this.removeMemoBubbleListeners();
        },
        removeMemoBubbleListeners() {
          if (this.memoBubbleCloser) {
            document.removeEventListener("pointerdown", this.memoBubbleCloser, true);
            this.memoBubbleCloser = null;
          }
          if (this.memoBubbleScrollCloser) {
            window.removeEventListener("scroll", this.memoBubbleScrollCloser, true);
            this.memoBubbleScrollCloser = null;
          }
        },
        // normalizeSearchText / getHorseKey / getHorseListKey は
        // vue/components/pedigree/mobile-horse-picker.js に外部化済み。
        getHorseNameText(horse) {
          return window.Dabimas.logic.horses.getHorseNameText(horse);
        },
        getHorseSelectedText(horse) {
          return this.getHorseNameText(horse);
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
        // このマスの自家製馬（深いマスで選んだ自家製の繁殖牝馬を含む）のメモ。
        // 血統表に入っている馬はメモを付ける前に選んだこともあるので、
        // 自家製馬の一覧（配合の保存の画面でメモを付けると更新される）から引く。
        cellMemoHorse() {
          var horse = this.selected[this.index];
          if (!horse) {
            return null;
          }
          var mareRef = horse.placeholderMareRef;
          var id =
            mareRef && mareRef.kind === "custom"
              ? mareRef.id
              : horse.customHorseId ||
                (horse.identityRef && horse.identityRef.kind === "custom" ? horse.identityRef.id : null);
          if (!id) {
            return null;
          }
          var summaries = this.$root.savedHorseSummaries || [];
          return summaries.find((summary) => summary.id === id) || null;
        },
        cellMemo() {
          var horse = this.cellMemoHorse;
          return horse && horse.memo ? horse.memo : "";
        },
        cellMemoHorseName() {
          var horse = this.cellMemoHorse;
          return horse ? this.getHorseNameText(horse) : "";
        },
        cellBadges() {
          const horse = this.selected[this.index];
          return horse
            ? window.Dabimas.logic.horses.getHorseBadges(horse)
            : [];
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
