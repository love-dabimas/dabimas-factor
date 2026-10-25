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
        @mouseenter="onCellMouseEnter"
        @mouseleave="onCellMouseLeave"
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
              :class="{ 'exp-mobile-horse-trigger--memo': !!cellMemoTarget }"
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
      <!-- 馬のメモの吹き出し。スマホはマスの長押し（「書く」ボタンつき）、
           PC はマウスを重ねたとき（メモがあるときだけ・見るだけ）に出す。 -->
      <div
        v-if="memoBubble"
        ref="memoBubbleEl"
        class="exp-cell-memo-bubble"
        :class="{ 'exp-cell-memo-bubble--hover': memoBubble.hover }"
        :style="memoBubble.style"
      >
        <div class="exp-cell-memo-bubble-name">{{ memoBubble.name }}</div>
        <div v-if="memoBubble.text" class="exp-cell-memo-bubble-text">{{ memoBubble.text }}</div>
        <div v-else class="exp-cell-memo-bubble-empty">メモはまだありません</div>
        <button
          v-if="!memoBubble.hover"
          type="button"
          class="exp-cell-memo-bubble-write"
          @click.stop="onBubbleWrite"
        >
          <v-icon class="exp-cell-memo-bubble-write-icon">mdi-pencil-outline</v-icon>
          <span>書く</span>
        </button>
      </div>
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
        // メモの対象になる馬のマスを 0.5 秒押し続けたら、メモの吹き出しを出す。
        onTriggerPressStart(event) {
          this.memoLongPressFired = false;
          this.clearMemoPressTimer();
          if (!this.cellMemoTarget || (event.button !== undefined && event.button !== 0)) {
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
          if (this.cellMemoTarget) {
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
        // hover が true なら PC のマウスオーバー（見るだけ。触っても消す仕組みは付けない）。
        showMemoBubble(trigger, hover) {
          var memo = this.cellMemo;
          if (!trigger || !this.cellMemoTarget || (hover && !memo)) {
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
            hover: !!hover,
          };
          this.removeMemoBubbleListeners();
          if (hover) {
            return;
          }
          // 次に画面のどこかを触るか、スクロールしたら消す（吹き出しの中の「書く」は除く）。
          this.memoBubbleCloser = (event) => {
            var bubble = this.$refs.memoBubbleEl;
            if (bubble && event && bubble.contains(event.target)) {
              return;
            }
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
        // 吹き出しの「書く」。吹き出しを閉じて、メモを書くダイアログを開く。
        onBubbleWrite() {
          var horse = this.selected[this.index];
          this.hideMemoBubble();
          this.$root.openHorseMemoEditor(horse);
        },
        // PC はマウスを重ねている間だけ吹き出しを出す（メモがあるときだけ）。
        onCellMouseEnter() {
          if (this.isMobileLayout || this.dispCategory % 2 !== 0 || !this.cellMemo) {
            return;
          }
          this.showMemoBubble(this.$el, true);
        },
        onCellMouseLeave() {
          if (this.memoBubble && this.memoBubble.hover) {
            this.hideMemoBubble();
          }
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
        // このマスの馬が、どの馬のメモになるか（vue/logic/horses/horse-memo.js）。
        // ★N薄めの仮の馬・ワタシノヒンバ・空のマスは null。
        cellMemoTarget() {
          return window.Dabimas.logic.horses.horseMemo.memoTargetOf(this.selected[this.index]);
        },
        // このマスの馬のメモ。自家製馬は配合の保存の画面のメモ、公式の馬は端末に持つメモ。
        // 血統表の馬はメモを付ける前に選んだこともあるので、マスの中ではなく一覧から引く。
        cellMemo() {
          void window.Dabimas.logic.horses.horseMemo.state.memos;
          return this.cellMemoTarget ? this.$root.getHorseMemo(this.selected[this.index]) : "";
        },
        cellMemoHorseName() {
          var horse = this.selected[this.index];
          var target = this.cellMemoTarget;
          if (!horse || !target) {
            return "";
          }
          if (target.kind === "custom") {
            var summaries = this.$root.savedHorseSummaries || [];
            var summary = summaries.find((item) => item.id === target.id);
            if (summary) {
              return this.getHorseNameText(summary);
            }
          }
          // 牝馬を選んだマスは「父(牝馬名)」と出ているので、牝馬名だけにする。
          var match = horse.placeholderMareRef ? /^\((.*)\)$/.exec(horse.subName || "") : null;
          return match ? match[1] : this.getHorseNameText(horse);
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
