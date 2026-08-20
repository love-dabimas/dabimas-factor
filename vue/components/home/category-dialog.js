/**
 * このコンポーネントの役割:
 * - カテゴリの追加・編集ダイアログ（docs/dabifaku_unified_spec_draft.md §9.3）。
 * - name/iconKey の入力を受け取り、保存処理（追加時は作成して開く、編集時は
 *   更新のみ）まで自己完結で行う。呼び出し側（home-page）はダイアログの
 *   開閉と対象カテゴリ（null なら新規作成）を渡すだけでよい。
 *
 * このコンポーネントに置かない処理:
 * - IndexedDB への直接アクセス（window.Dabimas.workspaceSync 経由でのみ操作する。
 *   統合版仕様 §14「画面コンポーネントから IndexedDB API を直接呼ばない」）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var ICON_CANDIDATES = [
    "mdi-horse-variant",
    "mdi-trophy",
    "mdi-flag-checkered",
    "mdi-star",
    "mdi-fire",
    "mdi-heart",
    "mdi-flash",
    "mdi-crown",
    "mdi-flask-outline",
    "mdi-run-fast",
    "mdi-shield",
    "mdi-folder",
  ];
  var DEFAULT_ICON_KEY = "mdi-horse-variant";

  var CategoryDialog = {
    name: "category-dialog",
    props: {
      value: { type: Boolean, default: false },
      // null: 新規作成モード、Object: 編集モード
      category: { type: Object, default: null },
    },
    data() {
      return {
        name: "",
        iconKey: DEFAULT_ICON_KEY,
        submitting: false,
        errorMessage: "",
        iconCandidates: ICON_CANDIDATES,
      };
    },
    computed: {
      isOpen: {
        get() {
          return this.value;
        },
        set(val) {
          this.$emit("input", val);
        },
      },
      isEdit() {
        return !!this.category;
      },
      dialogTitle() {
        return this.isEdit ? "カテゴリを編集" : "カテゴリを追加";
      },
      submitLabel() {
        return this.isEdit ? "保存" : "作成";
      },
      nameValid() {
        return this.name.trim().length > 0;
      },
    },
    watch: {
      value(newVal) {
        if (!newVal) {
          return;
        }
        this.errorMessage = "";
        this.submitting = false;
        if (this.category) {
          this.name = this.category.name;
          this.iconKey = this.category.iconKey || DEFAULT_ICON_KEY;
        } else {
          this.name = "";
          this.iconKey = DEFAULT_ICON_KEY;
        }
      },
    },
    methods: {
      close() {
        if (this.submitting) {
          return;
        }
        this.isOpen = false;
      },
      selectIcon(iconKey) {
        this.iconKey = iconKey;
      },
      submit() {
        if (!this.nameValid || this.submitting) {
          return;
        }
        this.submitting = true;
        this.errorMessage = "";
        var payload = { name: this.name.trim(), iconKey: this.iconKey };
        var action = this.isEdit
          ? window.Dabimas.workspaceSync.updateCategory(this.category.id, payload)
          : window.Dabimas.workspaceSync.addCategory(payload);
        action
          .then(() => {
            this.submitting = false;
            this.isOpen = false;
          })
          .catch((error) => {
            console.error(error);
            this.submitting = false;
            this.errorMessage = "保存に失敗しました。もう一度お試しください。";
          });
      },
    },
    template: `
      <v-dialog v-model="isOpen" max-width="360" persistent content-class="dabimas-category-dialog">
        <v-card>
          <v-card-title class="text-subtitle-1">{{ dialogTitle }}</v-card-title>
          <v-card-text>
            <div class="dabimas-field-label">カテゴリ名</div>
            <v-text-field
              v-model="name"
              outlined
              dense
              hide-details
              maxlength="12"
              placeholder="カテゴリ名を入力（12文字まで）"
              class="dabimas-category-name-input"
            ></v-text-field>

            <div class="dabimas-icon-grid">
              <v-item-group v-model="iconKey" mandatory>
                <v-item
                  v-for="icon in iconCandidates"
                  :key="icon"
                  :value="icon"
                  v-slot="{ active }"
                >
                  <v-btn
                    :color="active ? 'primary' : undefined"
                    :dark="active"
                    outlined
                    fab
                    small
                    class="ma-1"
                    @click="selectIcon(icon)"
                  >
                    <v-icon>{{ icon }}</v-icon>
                  </v-btn>
                </v-item>
              </v-item-group>
            </div>

            <v-alert v-if="errorMessage" type="error" dense text class="mt-2">
              {{ errorMessage }}
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text :disabled="submitting" @click="close">キャンセル</v-btn>
            <v-btn
              color="primary"
              :disabled="!nameValid || submitting"
              :loading="submitting"
              @click="submit"
            >{{ submitLabel }}</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    `,
  };

  window.Dabimas.components.CategoryDialog = CategoryDialog;
  Vue.component("category-dialog", CategoryDialog);
})(window, window.Vue);
