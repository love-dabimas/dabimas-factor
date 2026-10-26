/**
 * このコンポーネントの役割:
 * - 馬のメモ（100 文字まで・改行あり）を書くダイアログ。血統表のマスの吹き出しの
 *   「書く」ボタンと、馬を選ぶ画面の行の鉛筆ボタンから開く。
 * - 見た目は配合の保存の画面のメモ（vue/CombinationDialog.js）と同じクラスを使う。
 *
 * このコンポーネントに置かない処理:
 * - 保存先の振り分け（自家製馬は配合の記録、公式の馬は端末の中）。root app の
 *   saveHorseMemo（vue/app/methods/horse-loading.js）が受け持つ。
 *
 * css/vuetify_compact.min.css は v-textarea や小さいアイコンの大きさを持たないので、
 * 入力欄は素の textarea にし、アイコンにも大きさを持たせている。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var HorseMemoDialog = {
    name: "horse-memo-dialog",
    props: {
      value: { type: Boolean, default: false },
      // ダイアログの帯に出す馬名。
      horseName: { type: String, default: "" },
      // 開いたときに入っているメモ。
      initialText: { type: String, default: "" },
      saving: { type: Boolean, default: false },
    },
    data: function () {
      return {
        text: "",
        maxLength: window.Dabimas.logic.horses.horseMemo.MAX_LENGTH,
      };
    },
    watch: {
      value: function (open) {
        if (open) {
          this.text = this.initialText || "";
        }
      },
    },
    methods: {
      close: function () {
        this.$emit("input", false);
      },
      save: function () {
        this.$emit("save", (this.text || "").trim().slice(0, this.maxLength));
      },
    },
    template: `
      <v-dialog
        :value="value"
        @input="$emit('input', $event)"
        max-width="360"
        content-class="combination-memo-dialog"
      >
        <v-card class="combination-memo-card">
          <div class="combination-memo-head">
            <v-icon class="combination-memo-head-icon">mdi-pencil-outline</v-icon>
            <div class="combination-memo-head-text">
              <div class="combination-memo-title">メモ</div>
              <div class="combination-memo-target">{{ horseName }}</div>
            </div>
          </div>
          <div class="combination-memo-body">
            <textarea
              v-model="text"
              class="combination-memo-input"
              rows="5"
              :maxlength="maxLength"
              placeholder="例：凱旋門賞狙い。母父に底を2つ入れた版"
            ></textarea>
            <div class="combination-memo-counter">{{ (text || '').length }} / {{ maxLength }}</div>
          </div>
          <div class="combination-memo-actions">
            <v-btn depressed rounded class="combination-memo-cancel" @click="close">キャンセル</v-btn>
            <v-btn depressed rounded color="primary" :loading="saving" @click="save">保存</v-btn>
          </div>
        </v-card>
      </v-dialog>
    `,
  };

  window.Dabimas.components.HorseMemoDialog = HorseMemoDialog;
  Vue.component("horse-memo-dialog", HorseMemoDialog);
})(window, window.Vue);
