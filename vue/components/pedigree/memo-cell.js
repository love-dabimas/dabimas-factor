/**
 * このコンポーネントの役割:
 * - 血統表の1セルぶんの「子系統表示 ＋ メモ入力」部品。
 * - dispCategory が奇数のとき（horse-cell 側の表示切り替え）に、馬選択の
 *   代わりにこのセルが出る。
 * - category[index]（読み取り専用の子系統名）と inputed[index]（このセルの
 *   メモ文字列）をそのまま表示するだけ。
 * - メモ確定時は自分では保存せず、"memo-change" イベントで親（horse-cell）
 *   へ知らせるだけにする。
 *
 * このコンポーネントに置かない処理:
 * - メモの保存（localStorage への書き込みは root app の memoChange の仕事）。
 * - 馬選択・検索（horse-cell / mobile-horse-picker / desktop-horse-autocomplete の仕事）。
 *
 * 分けている理由:
 * - horse-cell（旧 common-autocomplete）が「馬選択」と「子系統＋メモ表示」の
 *   2つの役割を1ファイルに持っていたため、表示だけのこちらを切り出す。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var MemoCell = {
    props: {
      /**
       * index はこのセルが血統表の何行目かを表す（0〜31）。
       * category[index] / inputed[index] を読み書きする位置に使う。
       */
      index: {
        type: Number,
        required: true,
      },
      /**
       * category は32行ぶんの子系統名の配列（root app の this.category）。
       * このセルは自分の index の分だけ読み取り専用で表示する。
       */
      category: {
        type: Array,
        required: true,
      },
      /**
       * inputed は32行ぶんのメモ文字列の配列（root app の this.inputed）。
       * このセルは自分の index の分だけ表示する（値の保存は親が行う）。
       */
      inputed: {
        type: Array,
        required: true,
      },
      colorSettings: {
        type: Object,
        default: null,
      },
    },
    template: `
      <v-row no-gutters>
        <v-col :style="getWidth(index,0)">
          <v-text-field
            :class="colorCellClass"
            :value="categoryDisplayValue"
            solo
            readonly
          ></v-text-field>
        </v-col>
        <v-col :style="getWidth(index,1)">
          <v-text-field
            :class="colorCellClass"
            placeholder="メモ入力"
            :value="inputed[index]"
            @change="handleMemoChange"
            solo
          ></v-text-field>
        </v-col>
      </v-row>
    `,
    computed: {
      colorIndex() {
        return window.Dabimas.logic.sireLineColors.colorIndexForName(
          this.category[this.index],
          this.colorSettings
        );
      },
      colorCellClass() {
        var colorClass = window.Dabimas.logic.sireLineColors.colorClassFor(
          this.colorIndex
        );
        return colorClass ? "sire-color-cell " + colorClass : "";
      },
      categoryDisplayValue() {
        var value = this.category[this.index] || "";
        return (
          window.Dabimas.logic.sireLineColors.badgeFor(this.colorIndex) + value
        );
      },
    },
    methods: {
      getWidth(index, type) {
        let coefficient = 0;
        switch (index % 16) {
          case 0:
            coefficient = 0;
            break;
          case 1:
            coefficient = 1;
            break;
          case 2:
          case 3:
            coefficient = 2;
            break;
          case 4:
          case 5:
          case 6:
          case 7:
            coefficient = 3;
            break;
          default:
            coefficient = 4;
            break;
        }

        // コンテンツ（デバイス）の高さで幅を変えるロジック
        const width = window.innerHeight >= 960 ? 20 : 12;

        const adjustment = coefficient * width;
        if (type === 0) {
          // 左側カラム: (100% - adjustment) / 2
          return { maxWidth: `calc(100% - calc((100% + ${adjustment}px) * 0.35 ))` };
        } else {
          // 右側カラム: 残りの幅
          return { maxWidth: `calc((100% + ${adjustment}px) * 0.35 )` };
        }
      },
      // メモ入力の確定は自分で保存せず、親（horse-cell）へそのまま伝える。
      // memoChange 自体（localStorage 保存を含む）は root app の仕事のまま。
      handleMemoChange(event) {
        this.$emit("memo-change", event);
      },
    },
  };

  window.Dabimas.components.MemoCell = MemoCell;
  Vue.component("memo-cell", MemoCell);
})(window, window.Vue);
