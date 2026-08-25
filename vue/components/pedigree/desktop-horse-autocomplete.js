/**
 * このコンポーネントの役割:
 * - 血統表の1セルぶんの「PC向け馬選択」部品（Vuetify の v-autocomplete）。
 * - horse-cell（親）から、選択済み一覧・候補一覧・placeholder文言・
 *   sex/index を受け取って表示するだけ。
 * - 選択が確定したら "horse-change" イベントで
 *   { index, sex, localIndex, horse } を親へ知らせる
 *   （localIndex = index - sex * 16）。実際の onChange 呼び出しは
 *   horse-cell 側が担当する。
 *
 * このコンポーネントに置かない処理:
 * - モバイル向けダイアログ・IME まわり（mobile-horse-picker の仕事）。
 * - 実際の選択反映（root app の onChange/onChangeMain の仕事）。
 *
 * 分けている理由:
 * - horse-cell（旧 common-autocomplete）が PC 向けとモバイル向けの両方の
 *   UI を1ファイルに持っていたため、PC 専用の v-autocomplete 分岐だけを
 *   切り出す（docs/index-split-completion-plan.md Phase 3-3）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var DesktopHorseAutocomplete = {
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
      /** placeholderText は未選択時のプレースホルダー文言。 */
      placeholderText: {
        type: String,
        default: "",
      },
    },
    template: `
      <v-autocomplete
        :value="selected[index]"
        :items="lists"
        :item-text="getHorseNameText"
        :filter="filterHorse"
        solo
        dense
        :placeholder="placeholderText"
        no-data-text="該当するデータはありません"
        @input="handleInput"
        return-object
      >
        <template v-slot:item="data">
          <template >
            <v-list-item-content>
              <v-list-item-title>
                <span
                  v-if="getHorseBadges(data.item).length"
                  class="exp-horse-badges"
                >
                  <span
                    v-for="badge in getHorseBadges(data.item)"
                    :key="badge.key"
                    :class="['exp-horse-badge', badge.className]"
                    :title="badge.title"
                  >{{ badge.text }}</span>
                </span>
                <span v-html="getHorse(data.item)"></span>
              </v-list-item-title>
            </v-list-item-content>
          </template>
        </template>
      </v-autocomplete>
    `,
    methods: {
      filterHorse(horse, queryText, itemText) {
        return window.Dabimas.logic.horses.filterHorse(horse, queryText, itemText);
      },
      getHorseBadges(horse) {
        return window.Dabimas.logic.horses.getHorseBadges(horse);
      },
      getHorseNameText(horse) {
        return window.Dabimas.logic.horses.getHorseNameText(horse);
      },
      getHorse(horse) {
        if (!horse?.disabled) {
          const text = this.getHorseNameText(horse);
          return text + this.getFactor(horse.factors);
        }
      },
      getFactor(factors) {
        let retFactor = "";
        if (factors[2] != "") {
          retFactor = "(";
          for (const factor in factors) {
            if (factor) {
              retFactor += factors[factor];
            }
          }
          retFactor += ")";
        }
        return retFactor;
      },
      // 選択確定は自分では反映せず、"horse-change" で親（horse-cell）へ知らせる。
      // 実際の this.onChange(sex, localIndex, horse) 呼び出しは親側の仕事のまま。
      handleInput(horse) {
        const localIndex = this.index - this.sex * 16;
        this.$emit("horse-change", {
          index: this.index,
          sex: this.sex,
          localIndex,
          horse,
        });
      },
    },
  };

  window.Dabimas.components.DesktopHorseAutocomplete = DesktopHorseAutocomplete;
  Vue.component("desktop-horse-autocomplete", DesktopHorseAutocomplete);
})(window, window.Vue);
