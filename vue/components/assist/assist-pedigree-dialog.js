/**
 * このコンポーネントの役割:
 * - 配合理論補助の仮想繁殖牝馬が「どんな血統でできているか」を見るだけのダイアログ。
 *   16セルの盤面を、血統表と同じ深さ優先の並び（DESCENDANT_SLOTS）で縦に並べる。
 *
 * このコンポーネントに置かない処理:
 * - 馬を選ぶ・書き換える操作。見るだけにする（選択の入口はここには置かない）。
 * - 判定・集計。受け取った盤面を文字にするだけ。
 *
 * 血統表そのもの（vue/components/pedigree/*）を使い回さない理由:
 * - あちらは root app の selected / factorName / styleFactorClasses を前提にした
 *   headCells を受け取る作りで、ここで組み直すと本体の内部構造に依存してしまう。
 *   ここは盤面の配列だけを見る独立した部品にしておく。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var AssistPedigreeDialog = {
    name: "assist-pedigree-dialog",
    props: {
      value: { type: Boolean, default: false },
      title: { type: String, default: "" },
      note: { type: String, default: "" },
      // { label, board } の配列。board は16セル。1組を見せるときは種牡馬側と
      // 繁殖牝馬側の2つを渡す。
      sections: { type: Array, default: null },
    },
    computed: {
      blocks: function () {
        var list = Array.isArray(this.sections) ? this.sections : [];
        var logic = window.Dabimas.logic;
        var cellOf = function (board, cell) {
          var entry = board[cell];
          return {
            cell: cell,
            // セル1は馬の父。それ以降は偶数が父側、奇数が母側になる。
            mark: cell === 1 || cell % 2 === 0 ? "父" : "母",
            // 世代の深さ。1が1段目、2〜3が2段目、4〜7が3段目、8〜15が4段目。
            depth: Math.floor(Math.log2(cell)),
            name: entry ? logic.horses.getHorseNameText(entry) : "",
            son: (entry && entry.son) || "",
            factors: entry ? logic.horses.getHorseFactorBadges(entry) : [],
          };
        };
        return list.filter(function (section) { return Array.isArray(section.board); })
          .map(function (section) {
            var head = section.board[0];
            return {
              label: section.label || "",
              headName: head ? logic.horses.getHorseNameText(head) : (section.label || ""),
              headSon: (head && head.son) || "",
              rows: logic.pedigree.DESCENDANT_SLOTS.map(function (cell) {
                return cellOf(section.board, cell);
              }),
            };
          });
      },
    },
    methods: {
      close: function () {
        this.$emit("input", false);
      },
    },
    template: `
      <v-dialog :value="value" scrollable max-width="520" @input="$emit('input', $event)">
        <v-card class="assist-ped-card">
          <v-card-title class="assist-ped-head">
            <span class="assist-ped-title">{{ title }}</span>
            <v-btn icon aria-label="閉じる" @click="close"><v-icon>mdi-close</v-icon></v-btn>
          </v-card-title>
          <v-card-text class="assist-ped-body">
            <p class="assist-ped-note">{{ note }}</p>
            <section v-for="(block, index) in blocks" :key="index" class="assist-ped-block">
              <h3 v-if="block.label" class="assist-ped-block-title">
                <span class="assist-ped-block-role">{{ block.label }}</span>
                <span class="assist-ped-block-name">{{ block.headName }}</span>
                <span class="assist-ped-son">{{ block.headSon }}</span>
              </h3>
              <ul class="assist-ped-list">
                <li v-for="row in block.rows" :key="row.cell" class="assist-ped-row"
                  :style="{ paddingLeft: (row.depth * 12) + 'px' }">
                  <span class="assist-ped-mark" :class="row.mark === '母' ? 'is-dam' : ''">{{ row.mark }}</span>
                  <span class="assist-ped-main">
                    <span class="assist-ped-name">{{ row.name || 'ー' }}</span>
                    <span class="assist-ped-meta">
                      <span class="assist-ped-son">{{ row.son }}</span>
                      <span v-for="factor in row.factors" :key="factor.key"
                        :class="['exp-option-factor-badge', factor.className]">{{ factor.text }}</span>
                    </span>
                  </span>
                </li>
              </ul>
            </section>
          </v-card-text>
          <v-card-actions class="assist-ped-actions">
            <v-spacer></v-spacer>
            <v-btn text @click="close">閉じる</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    `,
  };

  window.Dabimas.components.AssistPedigreeDialog = AssistPedigreeDialog;
  Vue.component("assist-pedigree-dialog", AssistPedigreeDialog);
})(window, window.Vue);
