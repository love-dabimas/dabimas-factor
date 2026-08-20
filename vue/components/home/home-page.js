/**
 * このコンポーネントの役割:
 * - ホーム画面（カテゴリ一覧・空状態・編集モード）を丸ごと担当する
 *   （docs/dabifaku_unified_spec_draft.md §9.2）。
 * - カテゴリ一覧・作業枠数は window.Dabimas.workspaceSync.state から読み取る。
 * - カテゴリを開く／追加／編集／削除／並び替えはすべて
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
        errorSnackbar: { show: false, message: "" },
      };
    },
    computed: {
      categories() {
        return workspaceSync.state.categories;
      },
      workspaceCounts() {
        return workspaceSync.state.workspaceCounts;
      },
    },
    methods: {
      workspaceCount(categoryId) {
        return this.workspaceCounts[categoryId] || 0;
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
          this.showError("カテゴリを開けませんでした。");
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
        <v-app-bar flat color="white" class="dabimas-home-appbar">
          <v-toolbar-title class="dabimas-home-title">ダビふぁく</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon large class="dabimas-home-action" @click="openAddDialog" aria-label="カテゴリを追加">
            <v-icon size="28">mdi-plus</v-icon>
          </v-btn>
          <v-btn text class="dabimas-home-action dabimas-home-edit" :color="editMode ? 'primary' : undefined" @click="editMode = !editMode">
            {{ editMode ? '完了' : '編集' }}
          </v-btn>
          <v-btn icon large class="dabimas-home-action" @click="openSettings" aria-label="設定">
            <v-icon size="26">mdi-cog</v-icon>
          </v-btn>
        </v-app-bar>

        <div v-if="categories.length === 0" class="dabimas-home-empty">
          <v-icon size="48" color="grey">mdi-folder-open-outline</v-icon>
          <p>まだカテゴリがありません</p>
          <v-btn color="primary" rounded @click="openAddDialog">＋ カテゴリを追加</v-btn>
        </div>

        <v-container v-else fluid>
          <v-row dense>
            <v-col
              v-for="(category, index) in categories"
              :key="category.id"
              cols="6"
              sm="4"
              md="3"
            >
              <v-card outlined ripple class="dabimas-category-card" @click="onCardClick(category)">
                <div v-if="editMode" class="dabimas-category-delete">
                  <v-btn icon x-small color="error" @click.stop="confirmDelete(category)">
                    <v-icon>mdi-close-circle</v-icon>
                  </v-btn>
                </div>
                <div class="dabimas-category-card-body">
                  <v-icon size="32" color="primary">{{ category.iconKey }}</v-icon>
                  <div class="dabimas-category-name">{{ category.name }}</div>
                  <div class="dabimas-category-count caption">
                    作業枠 {{ workspaceCount(category.id) }}
                  </div>
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
          </v-row>
        </v-container>

        <category-dialog v-model="dialogVisible" :category="dialogCategory"></category-dialog>

        <v-dialog v-model="deleteDialogVisible" max-width="320">
          <v-card v-if="deleteTarget">
            <v-card-title class="text-subtitle-1">
              カテゴリ「{{ deleteTarget.name }}」を削除しますか？
            </v-card-title>
            <v-card-text>
              このカテゴリの作業枠 {{ workspaceCount(deleteTarget.id) }} 件と、
              保存されている配合の状態もすべて削除されます。
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
