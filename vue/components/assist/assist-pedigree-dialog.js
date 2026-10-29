/**
 * このコンポーネントの役割:
 * - 配合理論補助から「見るだけ」で開く血統表。ダビふぁく本体の血統表と
 *   同じ見た目にする（行の形・行の色・世代番号・系統コード・因子セル）。
 * - 1組の配合結果（32セル）と、仮想繁殖牝馬1頭（16セル）の両方に使う。
 *
 * このコンポーネントに置かない処理:
 * - 馬を選ぶ・書き換える・クロスを押す。読むだけにする。
 * - 判定・集計。受け取った盤面を並べるだけ。
 *
 * 本体の pedigree-table / pedigree-row を直接使わない理由:
 * - あちらは root app の selected / factorName / styleFactorClasses /
 *   isInbreedButtonClicked などを前提にした rowState を必要とし、
 *   ❤ ボタンや因子ボタンといった操作も抱えている。ここは操作を出さないので、
 *   **行の形だけ**を本体と同じ純粋関数（createPedigreeRowConfigs）から取り、
 *   中身は盤面の配列から自前で組む。使うCSSクラスは本体と同じなので見た目は揃う。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  // 系統コードを出すセル。本体の judgeSetParentLine（vue/app/methods/pedigree-cells.js）
  // と同じで、理論に使うセルだけに入れる。種牡馬側は面白4つ＋見事4つ、
  // 繁殖牝馬側は面白4つだけ（見事側の 25/27/29/31 は本体でも空のまま）。
  var LINE_INDEXES = [1, 3, 5, 7, 9, 11, 13, 15, 1 + 16, 3 + 16, 5 + 16, 7 + 16];

  var AssistPedigreeDialog = {
    name: "assist-pedigree-dialog",
    props: {
      value: { type: Boolean, default: false },
      title: { type: String, default: "" },
      note: { type: String, default: "" },
      // { side, board } の配列。side は "stallion" / "broodmare"、board は16セル。
      sections: { type: Array, default: null },
      // クロスが成立しているセル番号（0〜31）。本体の血統表と同じく馬名を赤くする。
      crossCells: { type: Array, default: null },
    },
    computed: {
      blocks: function () {
        var list = Array.isArray(this.sections) ? this.sections : [];
        var logic = window.Dabimas.logic;
        var factorMap = logic.factor.factorMap;
        var generations =
          window.Dabimas.constants.pedigreeIndexes.INDEX_GENERATION_ASSIGNMENTS;
        var crossCells = Array.isArray(this.crossCells) ? this.crossCells : [];
        return list.filter(function (section) { return Array.isArray(section.board); })
          .map(function (section) {
            var side = section.side === "broodmare" ? "broodmare" : "stallion";
            var configs = logic.pedigree.createPedigreeRowConfigs(side);
            return {
              side: side,
              rows: configs.map(function (config) {
                // config.index は32セル通しの番号。盤面は16セルなので側の分を引く。
                var cell = side === "broodmare" ? config.index - 16 : config.index;
                var entry = section.board[cell];
                // 本体と同じ組み立て（pedigree-cells.js の judgeSetParentLine →
                // setParentLine → fillInParentLineCells）。理論に使わないセルは
                // 空のまま行のテーマ色にフォールバックする。
                var line =
                  LINE_INDEXES.indexOf(config.index) !== -1 && entry
                    ? entry.parentLine || ""
                    : "";
                return {
                  key: config.key,
                  headCells: config.headCells,
                  autoClass: config.autoClass,
                  autoColspan: config.autoColspan,
                  parentLineText: config.showParentLine ? line : "",
                  parentLineClass: (line
                    ? line
                    : logic.pedigree.getCss(config.index)) + " styleParentLine",
                  generationClass: logic.pedigree.getCss(config.index) + " styleFactorClassMain",
                  generationLabel: generations[config.index] || "",
                  name: entry ? logic.horses.getHorseNameText(entry) : "",
                  // 本体の血統表が dispColor="inbreed" で赤くしているのと同じセル。
                  isCross: crossCells.indexOf(config.index) !== -1,
                  // 非凡・自家製・因名祭のバッジ。本体の horse-cell と同じ
                  // getHorseBadges を使うので、祖先セル（rare を持たない
                  // descendants レコード）には本体同様バッジが付かない。
                  badges: entry ? logic.horses.getHorseBadges(entry) : [],
                  // 繁殖牝馬の1行目は、本体では因子3セルを結合して操作ボタンを置く。
                  // 読むだけのここでは空のまま結合して桁を合わせる。
                  mergedFactors: side === "broodmare" && cell === 0,
                  factorTexts: [0, 1, 2].map(function (i) {
                    return (entry && entry.factors && entry.factors[i]) || "";
                  }),
                  factorClasses: [0, 1, 2].map(function (i) {
                    var name = entry && entry.factors ? entry.factors[i] : "";
                    var code = name ? factorMap.get(name) || "00" : "00";
                    return logic.factor.fillInFactorCells(code, config.index);
                  }),
                };
              }),
            };
          });
      },
    },
    watch: {
      value: function (open) {
        if (open) this.fitSoon();
      },
      sections: function () {
        if (this.value) this.fitSoon();
      },
    },
    mounted: function () {
      this.onResize = this.fit.bind(this);
      window.addEventListener("resize", this.onResize);
      if (this.value) this.fitSoon();
    },
    beforeDestroy: function () {
      window.removeEventListener("resize", this.onResize);
    },
    methods: {
      close: function () {
        this.$emit("input", false);
      },
      // 32行を1画面に収める。行の高さは端末の字形で変わる（iPhone は
      // Chrome より行が高くなる）ので、CSS の固定値では足りない。
      // 縮める前の表の高さを測り、ダイアログに入る高さを超えるぶんだけ
      // zoom で縮める。幅は zoom を掛けても枠いっぱいに広がるので触らない。
      // v-dialog は開いてから中身を描くので、表が出るまで少しずつ待つ。
      fitSoon: function (tries) {
        var self = this;
        var left = tries === undefined ? 20 : tries;
        window.setTimeout(function () {
          if (!self.fit() && left > 0) self.fitSoon(left - 1);
        }, 50);
      },
      fit: function () {
        var shell = this.$refs.shell;
        var head = this.$refs.head;
        if (!shell || !head) return false;
        var body = shell.parentNode;
        var style = window.getComputedStyle(body);
        // max-height は calc(100% - 余白) なので計算値が px にならない。
        // 外枠（.v-dialog__content は画面いっぱい）から上下の余白を引く。
        var dialog = body.closest(".v-dialog");
        if (!dialog) return false;
        var outer = window.getComputedStyle(dialog);
        var room = dialog.parentNode.clientHeight -
          parseFloat(outer.marginTop) - parseFloat(outer.marginBottom) -
          // v-card-title は関数型コンポーネントなので ref は要素そのもの。
          head.offsetHeight -
          parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        // 縮めた後の高さは測り方がブラウザで揃わないので、一度戻して測る。
        // style は Vue に持たせず直接書く（値が同じだと書き戻されないため）。
        shell.style.zoom = "";
        var natural = shell.offsetHeight;
        // 閉じている間（2回目以降の開き始め）は表示が消えていて高さが 0。
        if (!natural) return false;
        shell.style.zoom = natural > room && room > 0 ? String(room / natural) : "";
        return true;
      },
    },
    template: `
      <v-dialog :value="value" scrollable max-width="560"
        content-class="assist-ped-dialog" @input="$emit('input', $event)">
        <v-card class="assist-ped-card">
          <v-card-title ref="head" class="assist-ped-head">
            <span class="assist-ped-title">{{ title }}</span>
            <v-btn icon small aria-label="閉じる" @click="close"><v-icon small>mdi-close</v-icon></v-btn>
          </v-card-title>
          <v-card-text class="assist-ped-body">
            <p v-if="note" class="assist-ped-note">{{ note }}</p>
            <div ref="shell" class="assist-ped-shell pedigree-card-shell">
              <table v-for="(block, index) in blocks" :key="index" class="table_main assist-ped-table">
                <colgroup>
                  <col class="assist-ped-col-label" />
                  <col class="assist-ped-col-label" />
                  <col class="assist-ped-col-label" />
                  <col class="assist-ped-col-label" />
                  <col class="assist-ped-col-horse" />
                  <col class="assist-ped-col-gen" />
                  <col class="assist-ped-col-line" />
                  <col class="assist-ped-col-factor" />
                  <col class="assist-ped-col-factor" />
                  <col class="assist-ped-col-factor" />
                </colgroup>
                <tbody>
                  <tr v-for="row in block.rows" :key="row.key">
                    <td v-for="cell in row.headCells" :key="cell.key"
                      :class="cell.class" :rowspan="cell.rowspan" :colspan="cell.colspan"
                      :width="cell.width" :align="cell.align">{{ cell.text }}</td>
                    <td class="assist-ped-horse" :class="row.autoClass"
                      :colspan="row.autoColspan">
                      <span v-if="row.badges.length" class="exp-horse-badges">
                        <span v-for="badge in row.badges" :key="badge.key"
                          :class="['exp-horse-badge', badge.className]"
                          :title="badge.title">{{ badge.text }}</span>
                      </span>
                      <span class="assist-ped-horse-name"
                        :class="{ 'assist-ped-horse-name--cross': row.isCross }"
                        :title="row.isCross ? 'クロス' : null">{{ row.name }}</span>
                    </td>
                    <td :class="row.generationClass">{{ row.generationLabel }}</td>
                    <td :class="row.parentLineClass">
                      <span class="styleParentLineText">{{ row.parentLineText }}</span>
                    </td>
                    <template v-if="row.mergedFactors">
                      <td colspan="3" :class="row.factorClasses[0]"></td>
                    </template>
                    <template v-else>
                      <td v-for="i in [0, 1, 2]" :key="i" :class="row.factorClasses[i]"
                      >{{ row.factorTexts[i] }}</td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
    `,
  };

  window.Dabimas.components.AssistPedigreeDialog = AssistPedigreeDialog;
  Vue.component("assist-pedigree-dialog", AssistPedigreeDialog);
})(window, window.Vue);
