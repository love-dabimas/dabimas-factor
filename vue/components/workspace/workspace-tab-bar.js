/**
 * このコンポーネントの役割:
 * - カテゴリ画面の作業枠タブバー（docs/dabifaku_unified_spec_draft.md §9.4）。
 * - <header ref="appHeader"> の内側最上段に置かれる想定（本体の
 *   applyMobileViewportLayout がヘッダー高さを実測するため、追加対応は不要）。
 * - タブ切替・追加・削除・戻る操作はすべて window.Dabimas.workspaceSync の
 *   公開APIを呼ぶだけで、IndexedDB・localStorageには直接触れない。
 *
 * このコンポーネントに置かない処理:
 * - ダビふぁく本体の集計ヘッダー（factor-summary-header.js が担当、無改変）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var workspaceSync = window.Dabimas.workspaceSync;

  var WorkspaceTabBar = {
    name: "workspace-tab-bar",
    data() {
      return {
        editMode: false,
        switching: false,
        deleteDialogVisible: false,
        deleteTarget: null,
        deleting: false,
        errorSnackbar: { show: false, message: "" },
      };
    },
    computed: {
      categoryName() {
        return workspaceSync.state.activeCategoryName;
      },
      workspaces() {
        return workspaceSync.state.workspaces;
      },
      activeWorkspaceId() {
        return workspaceSync.state.activeWorkspaceId;
      },
      canDeleteWorkspace() {
        return this.workspaces.length > 1;
      },
      deleteTargetLabel() {
        if (!this.deleteTarget) {
          return "";
        }
        var index = this.workspaces.findIndex((w) => w.id === this.deleteTarget.id);
        return "作業枠" + (index + 1);
      },
    },
    methods: {
      showError(message) {
        this.errorSnackbar = { show: true, message: message };
      },
      onBack() {
        if (this.switching) {
          return;
        }
        this.switching = true;
        workspaceSync
          .goHome()
          .catch((error) => {
            console.error(error);
            this.showError("ホームへ戻れませんでした。");
          })
          .finally(() => {
            this.switching = false;
          });
      },
      onTabClick(workspaceId) {
        if (this.switching || this.editMode) {
          return;
        }
        this.switching = true;
        workspaceSync
          .switchToWorkspace(workspaceId)
          .catch((error) => {
            console.error(error);
            this.showError("保存に失敗しました。もう一度お試しください。");
          })
          .finally(() => {
            this.switching = false;
          });
      },
      onAddWorkspace() {
        if (this.switching) {
          return;
        }
        this.switching = true;
        workspaceSync
          .addWorkspace()
          .catch((error) => {
            console.error(error);
            this.showError("作業枠を追加できませんでした。");
          })
          .finally(() => {
            this.switching = false;
          });
      },
      confirmDeleteWorkspace(workspace) {
        this.deleteTarget = workspace;
        this.deleteDialogVisible = true;
      },
      executeDeleteWorkspace() {
        if (!this.deleteTarget) {
          return;
        }
        this.deleting = true;
        workspaceSync
          .removeWorkspace(this.deleteTarget.id)
          .then(() => {
            this.deleting = false;
            this.deleteDialogVisible = false;
            this.deleteTarget = null;
          })
          .catch((error) => {
            console.error(error);
            this.deleting = false;
            this.showError("作業枠を削除できませんでした。");
          });
      },
    },
    template: `
      <div class="dabimas-tab-bar">
        <v-btn icon small :disabled="switching" @click="onBack" aria-label="ホームへ戻る">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <span class="dabimas-tab-bar-name">{{ categoryName }}</span>

        <v-slide-group class="dabimas-tab-bar-tabs" show-arrows>
          <v-slide-item v-for="(workspace, index) in workspaces" :key="workspace.id">
            <div class="dabimas-tab-wrapper">
              <v-btn
                class="dabimas-tab-btn"
                small
                :disabled="switching"
                :outlined="workspace.id !== activeWorkspaceId"
                :color="workspace.id === activeWorkspaceId ? 'primary' : undefined"
                :dark="workspace.id === activeWorkspaceId"
                @click="onTabClick(workspace.id)"
              >
                {{ index + 1 }}
              </v-btn>
              <v-btn
                v-if="editMode && canDeleteWorkspace"
                icon
                x-small
                color="error"
                class="dabimas-tab-btn-close"
                @click.stop="confirmDeleteWorkspace(workspace)"
              >
                <v-icon x-small>mdi-close-circle</v-icon>
              </v-btn>
            </div>
          </v-slide-item>
          <v-slide-item v-if="!editMode">
            <v-btn icon small class="dabimas-tab-btn" :disabled="switching" @click="onAddWorkspace" aria-label="作業枠を追加">
              <v-icon>mdi-plus</v-icon>
            </v-btn>
          </v-slide-item>
        </v-slide-group>

        <v-btn text small class="dabimas-tab-bar-edit" :color="editMode ? 'primary' : undefined" @click="editMode = !editMode">
          {{ editMode ? '完了' : '編集' }}
        </v-btn>

        <v-dialog v-model="deleteDialogVisible" max-width="320">
          <v-card v-if="deleteTarget">
            <v-card-title class="text-subtitle-1">{{ deleteTargetLabel }}を削除しますか？</v-card-title>
            <v-card-text>
              保存されている配合の状態
              （血統表・メモ・クロス指定）も削除されます。
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="deleting" @click="deleteDialogVisible = false">キャンセル</v-btn>
              <v-btn color="error" :loading="deleting" @click="executeDeleteWorkspace">削除</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="errorSnackbar.show" color="error" :timeout="4000">
          {{ errorSnackbar.message }}
        </v-snackbar>
      </div>
    `,
  };

  window.Dabimas.components.WorkspaceTabBar = WorkspaceTabBar;
  Vue.component("workspace-tab-bar", WorkspaceTabBar);
})(window, window.Vue);
