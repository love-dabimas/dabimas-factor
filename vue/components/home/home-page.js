/**
 * このコンポーネントの役割:
 * - 馬を探すダビ娘の入口を持つ。
 * - ホーム画面（配合の一覧・空状態・編集モード）を丸ごと担当する
 *   （docs/dabifaku_unified_spec_draft.md §9.2）。ホームの 1 項目が配合 1 本。
 *   データ上は「カテゴリ 1 件に作業枠 1 件」の形のまま持っている。
 * - 配合の一覧は window.Dabimas.workspaceSync.state から読み取る。
 * - 配合を開く／追加／編集／複製／削除／並び替えはすべて
 *   window.Dabimas.workspaceSync の公開APIを呼ぶだけで、IndexedDBには
 *   直接触れない（統合版仕様 §14）。
 *
 * このコンポーネントに置かない処理:
 * - ダビふぁく本体の画面・ロジック（v-if="currentScreen === 'home'" で
 *   排他表示されるため、本体とは完全に分離されている）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var workspaceSync = window.Dabimas.workspaceSync;

  var HomePage = {
    name: "home-page",
    data() {
      return {
        editMode: false,
        dialogVisible: false,
        dialogCategory: null,
        deleteDialogVisible: false,
        deleteTarget: null,
        deleting: false,
        duplicating: false,
        errorSnackbar: { show: false, message: "" },
      };
    },
    computed: {
      categories() {
        return workspaceSync.state.categories;
      },
    },
    methods: {
      openAssist() {
        this.$root.currentScreen = "assist";
      },
      openMusume() {
        this.$root.currentScreen = "musume";
      },
      showError(message) {
        this.errorSnackbar = { show: true, message: message };
      },
      openAddDialog() {
        this.dialogCategory = null;
        this.dialogVisible = true;
      },
      openEditDialog(category) {
        this.dialogCategory = category;
        this.dialogVisible = true;
      },
      onCardClick(category) {
        if (this.editMode) {
          this.openEditDialog(category);
          return;
        }
        workspaceSync.switchToCategory(category.id).catch((error) => {
          console.error(error);
          this.showError("配合を開けませんでした。");
        });
      },
      duplicate(category) {
        if (this.duplicating) {
          return;
        }
        this.duplicating = true;
        workspaceSync
          .duplicateCategory(category.id)
          .catch((error) => {
            console.error(error);
            this.showError("複製に失敗しました。もう一度お試しください。");
          })
          .finally(() => {
            this.duplicating = false;
          });
      },
      confirmDelete(category) {
        this.deleteTarget = category;
        this.deleteDialogVisible = true;
      },
      executeDelete() {
        if (!this.deleteTarget) {
          return;
        }
        this.deleting = true;
        workspaceSync
          .removeCategory(this.deleteTarget.id)
          .then(() => {
            this.deleting = false;
            this.deleteDialogVisible = false;
            this.deleteTarget = null;
          })
          .catch((error) => {
            console.error(error);
            this.deleting = false;
            this.showError("削除に失敗しました。もう一度お試しください。");
          });
      },
      moveUp(index) {
        if (index === 0) {
          return;
        }
        this.reorder(index, index - 1);
      },
      moveDown(index) {
        if (index === this.categories.length - 1) {
          return;
        }
        this.reorder(index, index + 1);
      },
      reorder(i, j) {
        var ids = this.categories.map((c) => c.id);
        var tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
        workspaceSync.reorderCategories(ids).catch((error) => {
          console.error(error);
          this.showError("並び替えに失敗しました。");
        });
      },
      openSettings() {
        this.$root.currentScreen = "settings";
      },
    },
    template: `
      <div class="dabimas-home">
        <v-app-bar dense flat color="white" class="dabimas-appbar dabimas-home-appbar">
          <v-toolbar-title class="dabimas-appbar-title dabimas-home-title">ダビふぁく</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon large class="dabimas-home-action" @click="openAddDialog" aria-label="配合を追加">
            <v-icon size="28">mdi-plus</v-icon>
          </v-btn>
          <v-btn text class="dabimas-home-action dabimas-home-edit" :color="editMode ? 'primary' : undefined" @click="editMode = !editMode">
            {{ editMode ? '完了' : '編集' }}
          </v-btn>
          <v-btn icon large class="dabimas-home-action" @click="openSettings" aria-label="設定">
            <v-icon size="26">mdi-cog</v-icon>
          </v-btn>
        </v-app-bar>

        <div class="dabimas-home-section-title">馬を探す</div>
        <div class="dabimas-musume-tile-wrap dabimas-search-tiles">
          <v-card outlined ripple class="dabimas-musume-tile" @click="openMusume">
            <v-icon size="28" color="primary">mdi-magnify</v-icon>
            <div class="dabimas-musume-tile__text">
              <div class="dabimas-musume-tile__title">ダビ娘</div>
              <div class="dabimas-musume-tile__sub">馬を探す・お気に入りを付ける</div>
            </div>
            <v-icon color="grey">mdi-chevron-right</v-icon>
          </v-card>
          <v-card outlined ripple class="dabimas-musume-tile" @click="openAssist">
            <v-icon size="28" color="primary">mdi-family-tree</v-icon>
            <div class="dabimas-musume-tile__text">
              <div class="dabimas-musume-tile__title">配合理論補助</div>
              <div class="dabimas-musume-tile__sub">繁殖牝馬から3代先の配合を試す</div>
            </div>
            <v-icon color="grey">mdi-chevron-right</v-icon>
          </v-card>
        </div>
        <div class="dabimas-home-section-title">配合</div>

        <div v-if="categories.length === 0" class="dabimas-home-empty">
          <v-icon size="48" color="grey">mdi-folder-open-outline</v-icon>
          <p>まだ配合がありません</p>
          <v-btn color="primary" rounded @click="openAddDialog">＋ 配合を追加</v-btn>
        </div>

        <v-container v-else fluid class="dabimas-category-grid">
          <v-row dense>
            <v-col
              v-for="(category, index) in categories"
              :key="category.id"
              cols="6"
              sm="4"
              md="3"
            >
              <v-card outlined ripple class="dabimas-category-card" @click="onCardClick(category)">
                <div v-if="editMode" class="dabimas-category-duplicate">
                  <v-btn
                    x-small
                    text
                    color="primary"
                    :disabled="duplicating"
                    aria-label="複製"
                    @click.stop="duplicate(category)"
                  >
                    <v-icon x-small left>mdi-content-copy</v-icon>複製
                  </v-btn>
                </div>
                <div v-if="editMode" class="dabimas-category-delete">
                  <v-btn icon x-small color="error" @click.stop="confirmDelete(category)">
                    <v-icon>mdi-close-circle</v-icon>
                  </v-btn>
                </div>
                <div class="dabimas-category-card-body">
                  <v-icon size="32" color="primary">{{ category.iconKey }}</v-icon>
                  <div class="dabimas-category-name">{{ category.name }}</div>
                </div>
                <div v-if="editMode" class="dabimas-category-reorder">
                  <v-btn icon x-small :disabled="index === 0" @click.stop="moveUp(index)">
                    <v-icon>mdi-chevron-up</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    x-small
                    :disabled="index === categories.length - 1"
                    @click.stop="moveDown(index)"
                  >
                    <v-icon>mdi-chevron-down</v-icon>
                  </v-btn>
                </div>
              </v-card>
            </v-col>
            <!-- 並びの最後に追加のカードを置く。右上の＋だけだと見つけにくいため。
                 編集モードの間は並び替えの邪魔になるので出さない。 -->
            <v-col v-if="!editMode" cols="6" sm="4" md="3">
              <v-card outlined ripple class="dabimas-category-card dabimas-category-add" @click="openAddDialog">
                <div class="dabimas-category-card-body">
                  <v-icon size="32" color="primary">mdi-plus</v-icon>
                  <div class="dabimas-category-name">配合を追加</div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </v-container>

        <category-dialog v-model="dialogVisible" :category="dialogCategory"></category-dialog>

        <v-dialog v-model="deleteDialogVisible" max-width="320">
          <v-card v-if="deleteTarget">
            <v-card-title class="text-subtitle-1">
              配合「{{ deleteTarget.name }}」を削除しますか？
            </v-card-title>
            <v-card-text>
              血統表・メモ・クロス指定も削除されます。
              この操作は取り消せません。
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="deleting" @click="deleteDialogVisible = false">キャンセル</v-btn>
              <v-btn color="error" :loading="deleting" @click="executeDelete">削除</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="errorSnackbar.show" color="error" :timeout="4000">
          {{ errorSnackbar.message }}
        </v-snackbar>
      </div>
    `,
  };

  window.Dabimas.components.HomePage = HomePage;
  Vue.component("home-page", HomePage);
})(window, window.Vue);
