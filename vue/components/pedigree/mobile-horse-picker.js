/**
 * このコンポーネントの役割:
 * - 血統表の1セルぶんの「モバイル向け馬選択ダイアログ」部品。
 * - horse-cell（親）にある検索トリガーのボタンから開かれ、検索・候補一覧・
 *   選択・クリアをこのダイアログの中だけで完結させる。
 * - 選択・クリアが確定したら "horse-change" イベントで
 *   { index, sex, localIndex, horse }（horse は null のときクリア）を
 *   親へ知らせる（localIndex = index - sex * 16）。実際の onChange 呼び出しは
 *   horse-cell 側が担当する（desktop-horse-autocomplete と同じ経路）。
 * - 検索トリガーの見た目（ボタン本体・選択済みラベル）は horse-cell 側に残す。
 *   理由は下の「このコンポーネントに置かない処理」を参照。
 *
 * このコンポーネントに置かない処理:
 * - トリガーボタン本体（`.exp-mobile-horse-trigger`）。
 *   css/mobile.css の `.exp-mobile-autocomplete-root.inbreed > .exp-mobile-horse-trigger`
 *   等が「horse-cell の描画するルート要素の直下（direct child）」を前提にした
 *   セレクタになっているため、ここでボタンをラップすると
 *   （Vue コンポーネントは単一ルート要素が必須なため、ボタンと v-dialog を
 *   両方ルートに置くには何らかの要素で包む必要がある）直下関係が崩れて
 *   クロス発生時の赤字装飾が効かなくなる。そのため v-dialog 自体を
 *   このコンポーネントの単一ルートにし、トリガーボタンは horse-cell に
 *   残して `$refs` 経由で `openMobileEditor()` を呼んでもらう形にした
 *   （docs/index-split-completion-plan.md Phase 3-4 実施時に判明した、
 *   計画書 §7.4 からの意図的な変更点）。
 * - PC 向け v-autocomplete（desktop-horse-autocomplete の仕事）。
 *
 * IME まわりの不変条件（変更禁止。docs/index-split-completion-plan.md §7.0）:
 * - v-for の :key は getHorseListKey（WeakMap による instance 単位採番）を使う。
 * - クエリ同期は DOM 実値ベースの debounce ＋変換中 700ms フォールバック。
 * - isComposing === false の input で合成フラグを自己修復する。
 * - Enter 判定は event.isComposing 優先、@keydown.enter.prevent は使わない。
 * - 検索 input は手動 :value バインド（v-model にしない）。
 * - runAfterMobileDialogClose（選択後にダイアログを閉じてから親処理を走らせる）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  // v-forの:key用に、馬オブジェクトごとの一意で安定したキーを採番する。
  // データにはid空＋同名(キタサンブラック等)で内容が完全一致する馬が複数あり、
  // 内容ベースのkeyだとVueのkeyed diffが重複keyで破綻してリストが正しく
  // 更新されない/ダイアログが閉じない等の不具合を起こすため、instance単位で一意化する。
  var horseListKeyCache = new WeakMap();
  var horseListKeySeq = 0;

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  var INDEX_TO_ROW_NUMBER = window.Dabimas.constants.pedigreeIndexes.INDEX_TO_ROW_NUMBER;

  var MobileHorsePicker = {
    props: {
      /** index はこのセルが血統表の何行目かを表す（0〜31）。 */
      index: {
        type: Number,
        required: true,
      },
      /** sex は 0=父側 / 1=母側（horse-cell の computed sex をそのまま渡す）。 */
      sex: {
        type: Number,
        required: true,
      },
      /** selected は32行ぶんの選択済み馬の配列（root app の this.selected）。 */
      selected: {
        type: Array,
        required: true,
      },
      /** lists はこのセルの候補一覧（horse-cell の computed lists をそのまま渡す）。 */
      lists: {
        type: Array,
        required: true,
      },
      /** placeholderText は検索欄のプレースホルダー文言（horse-cell の computed をそのまま渡す）。 */
      placeholderText: {
        type: String,
        default: "",
      },
    },
    data() {
      return {
        mobileDialogVisible: false,
        mobileQueryInput: "",
        mobileQuery: "",
        mobileSearchCompositionActive: false,
        mobileQuerySyncTimer: null,
      };
    },
    beforeDestroy() {
      this.clearMobileQuerySyncTimer();
    },
    template: `
      <v-dialog
        v-model="mobileDialogVisible"
        content-class="exp-mobile-picker-dialog"
        max-width="560"
      >
        <v-card>
          <div class="exp-mobile-picker-header">
            <div>
              <div class="exp-mobile-picker-title">{{ mobileDialogTitle }}</div>
              <div class="exp-mobile-picker-subtitle">{{ mobileDialogContextLabel }}</div>
            </div>
            <div class="exp-mobile-picker-actions">
              <button
                v-if="selected[index]"
                type="button"
                class="exp-mobile-picker-action exp-mobile-picker-action--clear"
                @click="clearMobileHorse"
              >クリア</button>
              <button
                type="button"
                class="exp-mobile-picker-action exp-mobile-picker-action--close"
                @click="closeMobileEditor"
              >閉じる</button>
            </div>
          </div>
          <div class="exp-mobile-picker-body">
            <div class="exp-mobile-current-selection">
              <div class="exp-mobile-current-selection-label">現在の選択</div>
              <div class="exp-mobile-current-selection-context">
                {{ mobileDialogContextLabel }}
              </div>
              <div class="exp-mobile-current-selection-value">
                <span
                  v-if="mobileCurrentSelectionBadges.length"
                  class="exp-horse-badges"
                >
                  <span
                    v-for="badge in mobileCurrentSelectionBadges"
                    :key="badge.key"
                    :class="['exp-horse-badge', badge.className]"
                    :title="badge.title"
                  >{{ badge.text }}</span>
                </span>
                <span>{{ mobileCurrentSelectionLabel }}</span>
              </div>
            </div>
            <label
              class="exp-mobile-search-label"
              :for="mobileInputId"
            >候補を検索</label>
            <div class="exp-mobile-search-shell">
              <i class="mdi mdi-magnify"></i>
              <input
                :id="mobileInputId"
                ref="mobileSearchInput"
                :value="mobileQueryInput"
                class="exp-mobile-search-input"
                type="text"
                :placeholder="placeholderText"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                inputmode="search"
                lang="ja"
                :aria-busy="mobileSearchCompositionActive ? 'true' : 'false'"
                enterkeyhint="search"
                @input="onMobileSearchInput"
                @compositionstart="onMobileCompositionStart"
                @compositionend="onMobileCompositionEnd"
                @keydown.enter="onMobileSearchEnter"
              />
              <button
                v-if="mobileQueryInput"
                type="button"
                class="exp-mobile-search-clear"
                @click="clearMobileQuery"
              >クリア</button>
            </div>
            <div class="exp-mobile-option-list">
              <button
                v-for="horse in filteredMobileLists"
                :key="getHorseListKey(horse)"
                type="button"
                :class="[
                  'exp-mobile-option-btn',
                  { 'exp-mobile-option-btn--selected': isSelectedHorse(horse) }
                ]"
                @click="selectMobileHorse(horse)"
              >
                <div class="exp-option-item">
                  <span
                    v-if="getHorseBadges(horse).length"
                    class="exp-horse-badges"
                  >
                    <span
                      v-for="badge in getHorseBadges(horse)"
                      :key="badge.key"
                      :class="['exp-horse-badge', badge.className]"
                      :title="badge.title"
                    >{{ badge.text }}</span>
                  </span>
                  <span class="exp-option-label exp-mobile-option-name">
                    {{ getHorseListText(horse) }}
                  </span>
                  <span
                    v-for="(factor, factorIndex) in getHorseFactorBadges(horse)"
                    :key="getHorseListKey(horse) + '-factor-' + factorIndex"
                    :class="['exp-option-factor-badge', factor.className]"
                  >{{ factor.text }}</span>
                </div>
              </button>
              <div
                v-if="filteredMobileLists.length === 0"
                class="exp-mobile-option-empty"
              >
                該当するデータはありません
              </div>
            </div>
          </div>
        </v-card>
      </v-dialog>
    `,
    computed: {
      mobileDialogTitle() {
        if (this.sex === 1 && this.index % 16 === 0) {
          return "繁殖牝馬を選択";
        }
        if ([3, 5, 7, 9, 11, 13, 15].includes(this.index % 16)) {
          return "種牡馬 / 繁殖牝馬を選択";
        }
        return "種牡馬を選択";
      },
      mobileDialogContextLabel() {
        const sideLabel = this.sex === 0 ? "種牡馬検索" : "繁殖牝馬検索";
        const rowNumber = INDEX_TO_ROW_NUMBER[Number(this.index) || 0] || "";
        return rowNumber ? `${sideLabel} ${rowNumber}` : sideLabel;
      },
      mobileCurrentSelectionLabel() {
        const horse = this.selected[this.index];
        if (!horse) {
          return "未選択";
        }
        return this.getHorseSelectedText(horse) || "未選択";
      },
      mobileCurrentSelectionBadges() {
        return this.getHorseBadges(this.selected[this.index]);
      },
      mobileInputId() {
        return `exp-mobile-search-${this.index}`;
      },
      filteredMobileLists() {
        const source = Array.isArray(this.lists) ? this.lists : [];
        const normalizedQuery = this.normalizeSearchText(this.mobileQuery);
        const limit = normalizedQuery ? 80 : 60;
        const filtered = [];

        for (let i = 0; i < source.length; i++) {
          const horse = source[i];
          if (!horse || horse.disabled) {
            continue;
          }
          if (
            normalizedQuery &&
            !this.getHorseSearchIndexText(horse).includes(normalizedQuery)
          ) {
            continue;
          }
          filtered.push(horse);
          if (filtered.length >= limit) {
            break;
          }
        }

        return filtered;
      },
    },
    methods: {
      normalizeSearchText(text) {
        return window.Dabimas.logic.horses.normalizeSearchText(text);
      },
      getHorseKey(horse) {
        return window.Dabimas.logic.horses.getHorseKey(horse);
      },
      // v-forの:key専用。馬オブジェクトのinstance単位で一意かつ安定なキーを返す。
      // （内容一致の重複馬でもkeyが衝突しないようにし、keyed diffの破綻を防ぐ）
      getHorseListKey(horse) {
        if (!horse || typeof horse !== "object") {
          return "empty";
        }
        let key = horseListKeyCache.get(horse);
        if (key === undefined) {
          key = "h" + ++horseListKeySeq;
          horseListKeyCache.set(horse, key);
        }
        return key;
      },
      getHorseBadges(horse) {
        return window.Dabimas.logic.horses.getHorseBadges(horse);
      },
      getHorseNameText(horse) {
        return window.Dabimas.logic.horses.getHorseNameText(horse);
      },
      getHorseListText(horse) {
        return this.getHorseNameText(horse);
      },
      getHorseSelectedText(horse) {
        return this.getHorseNameText(horse);
      },
      getHorseSearchIndexText(horse) {
        return window.Dabimas.logic.horses.getHorseSearchIndexText(horse);
      },
      getHorseFactorBadges(horse) {
        return window.Dabimas.logic.horses.getHorseFactorBadges(horse);
      },
      clearMobileQuerySyncTimer() {
        if (this.mobileQuerySyncTimer) {
          clearTimeout(this.mobileQuerySyncTimer);
          this.mobileQuerySyncTimer = null;
        }
      },
      resetMobileQuery() {
        this.clearMobileQuerySyncTimer();
        this.mobileQueryInput = "";
        this.mobileQuery = "";
        this.mobileSearchCompositionActive = false;
      },
      getMobileInputValue(event) {
        return event &&
          event.target &&
          typeof event.target.value === "string"
          ? event.target.value
          : "";
      },
      // DOMの実値を基準に検索クエリを同期する。compositionイベントの発火に
      // 依存しないため、iOS標準IMEでもサードパーティIME(flick等)でも確実に反映される。
      syncMobileQueryFromDom() {
        const input = this.$refs.mobileSearchInput;
        const value =
          input && typeof input.value === "string"
            ? input.value
            : this.mobileQueryInput;
        this.mobileQueryInput = value;
        this.mobileQuery = value;
      },
      scheduleMobileQuerySync(delay = 120) {
        this.clearMobileQuerySyncTimer();
        if (delay <= 0) {
          this.syncMobileQueryFromDom();
          return;
        }
        this.mobileQuerySyncTimer = setTimeout(() => {
          this.mobileQuerySyncTimer = null;
          this.syncMobileQueryFromDom();
        }, delay);
      },
      runAfterMobileDialogClose(callback) {
        const invoke = () => {
          if (typeof callback === "function") {
            callback();
          }
        };
        this.$nextTick(() => {
          if (
            typeof window !== "undefined" &&
            typeof window.requestAnimationFrame === "function"
          ) {
            window.requestAnimationFrame(invoke);
            return;
          }
          setTimeout(invoke, 0);
        });
      },
      // horse-cell側のトリガーボタンから $refs 経由で呼ばれる（このコンポーネントの
      // 公開エントリポイント）。中身は元の openMobileEditor と同一。
      openMobileEditor() {
        this.mobileDialogVisible = true;
        this.resetMobileQuery();
        this.$nextTick(() => {
          const input = this.$refs.mobileSearchInput;
          if (input && typeof input.focus === "function") {
            input.focus();
          }
        });
      },
      closeMobileEditor() {
        this.mobileDialogVisible = false;
        this.resetMobileQuery();
      },
      // 選択確定・クリアはdesktop-horse-autocompleteと同じhorse-changeペイロード
      // （{index, sex, localIndex, horse}）をemitする。実際の
      // this.onChange(sex, localIndex, horse)呼び出しは親（horse-cell）が行う
      // （元実装はここでthis.onChangeを直接呼んでいた。構造上必要な最小限の置換）。
      emitHorseChange(horse) {
        const localIndex = this.index - this.sex * 16;
        this.$emit("horse-change", {
          index: this.index,
          sex: this.sex,
          localIndex,
          horse,
        });
      },
      clearMobileHorse() {
        this.resetMobileQuery();
        this.mobileDialogVisible = false;
        this.runAfterMobileDialogClose(() => {
          this.emitHorseChange(null);
        });
      },
      selectMobileHorse(horse) {
        if (!horse || horse.disabled) {
          return;
        }
        this.resetMobileQuery();
        this.mobileDialogVisible = false;
        this.runAfterMobileDialogClose(() => {
          this.emitHorseChange(horse);
        });
      },
      onMobileSearchInput(event) {
        // iOSサードパーティIME(flick等)対策:
        // compositionendが発火しない/isComposing=false のinputが来た場合は、
        // 合成は終了したものとみなしてフラグを補正する（合成状態のまま固まるのを防ぐ）。
        if (
          event &&
          event.isComposing === false &&
          this.mobileSearchCompositionActive
        ) {
          this.mobileSearchCompositionActive = false;
          if (event.target) {
            event.target.composing = false;
          }
          // 非合成状態に補正した直後の再描画でvalueが古い値に書き戻されるのを防ぐため、
          // モデルをDOM実値に合わせておく。
          this.mobileQueryInput = this.getMobileInputValue(event);
        }
        // クエリ同期はcompositionイベントに依存せずdebounceで行う。
        // 変換中は確定待ちで長めの保険のみ（標準IMEはcompositionendで即時反映される）。
        // compositionendが来ない端末でも、この保険で最終的に必ず反映される。
        this.scheduleMobileQuerySync(
          this.mobileSearchCompositionActive ? 700 : 120
        );
      },
      onMobileSearchEnter(event) {
        // IME変換確定中はEnterのデフォルト動作（変換確定）を妨げない。
        // event.isComposing を優先し、無い場合のみ自前フラグで判定する。
        const composing = event
          ? event.isComposing === true
          : this.mobileSearchCompositionActive;
        if (composing) {
          return;
        }
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        this.selectFirstMobileHorse();
      },
      onMobileCompositionStart(event) {
        this.mobileSearchCompositionActive = true;
        // IME変換中はVueによるvalue書き戻しを抑止する（v-modelと同等のガード）
        if (event && event.target) {
          event.target.composing = true;
        }
      },
      onMobileCompositionEnd(event) {
        this.mobileSearchCompositionActive = false;
        // 変換確定後はvalue書き戻しを再開する
        if (event && event.target) {
          event.target.composing = false;
        }
        // DOM実値から即時同期する
        this.scheduleMobileQuerySync(0);
      },
      clearMobileQuery() {
        this.resetMobileQuery();
        this.$nextTick(() => {
          const input = this.$refs.mobileSearchInput;
          if (input && typeof input.focus === "function") {
            input.focus();
          }
        });
      },
      selectFirstMobileHorse() {
        // 変換中の判定は呼び出し元(onMobileSearchEnter)で済んでいるため、ここでは
        // 合成フラグに依存しない（flick等でフラグが残っても選択できるようにする）。
        if (this.filteredMobileLists.length > 0) {
          this.selectMobileHorse(this.filteredMobileLists[0]);
        }
      },
      isSelectedHorse(horse) {
        const current = this.selected[this.index];
        return this.getHorseKey(current) !== "" &&
          this.getHorseKey(current) === this.getHorseKey(horse);
      },
    },
  };

  window.Dabimas.components.MobileHorsePicker = MobileHorsePicker;
  Vue.component("mobile-horse-picker", MobileHorsePicker);
})(window, window.Vue);
