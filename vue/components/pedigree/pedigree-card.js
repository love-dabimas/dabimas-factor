/**
 * このコンポーネントの役割:
 * - 血統表1枚分の外枠（v-col / v-card / .pedigree-card-table-wrap）を担当する。
 * - side="stallion" または side="broodmare" を受け取り、種牡馬側・繁殖牝馬側の
 *   どちらにも同じ部品を使う。
 * - 行そのものの描画は pedigree-table に任せる。
 *
 * このコンポーネントに置かない処理:
 * - 行の中身（馬名・因子・インブリード等）の描画。pedigree-table / pedigree-row の仕事。
 * - 血統計算、保存処理。
 *
 * 分けている理由:
 * - 元の index.html では種牡馬側・繁殖牝馬側で v-col/v-card の外枠がほぼ丸ごと
 *   重複していたため、side の違いだけを吸収する1つの部品にまとめる。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var PedigreeCard = {
    name: "pedigree-card",
    // side / rows / rowStates 以外の props（pedigree-row 用の値）は、この部品の
    // ルート要素（v-col）には付けず、$attrs / $listeners として pedigree-table 経由で流す。
    inheritAttrs: false,
    props: {
      side: { type: String, required: true },
      rows: { type: Array, required: true },
      rowStates: { type: Array, required: true },
      categoryMode: { type: Boolean, default: false },
    },
    computed: {
      // この class は見た目だけでなく、mobile-viewport が高さ計算の目印として使う。
      // 名前を変えるとスマホで血統表の高さが崩れるため、CSS を整理する時も残す。
      isStallionSide() {
        return this.side === "stallion";
      },
    },
    template: `
      <v-col sm="12" md="6" lg="6" xl="6" cols="12" class="pedigree-card-col">
        <v-card elevation="3" align-content="center" class="custom-card pedigree-card-shell">
          <div
            class="pedigree-card-table-wrap"
            :class="{ 'exp-category-mode': categoryMode }"
          >
            <pedigree-table
              :rows="rows"
              :row-states="rowStates"
              v-bind="$attrs"
              v-on="$listeners"
            ></pedigree-table>
          </div>
          <!--
            種牡馬側だけ末尾に v-spacer を入れる。元の index.html でも繁殖牝馬側の
            v-spacer はコメントアウトされていた（見た目の差ではなく既存仕様）ため、
            side で出し分けて挙動を保つ。
          -->
          <v-spacer v-if="isStallionSide" class="my-1 px-0 mx-0 my-0" />
        </v-card>
      </v-col>
    `,
  };

  window.Dabimas.components.PedigreeCard = PedigreeCard;
  Vue.component("pedigree-card", PedigreeCard);
})(window, window.Vue);
