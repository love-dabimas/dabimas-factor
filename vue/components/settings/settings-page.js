/** 設定メニューと各管理ビューの切り替えを担当する。 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  function backupFile() {
    return window.Dabimas.logic.storage.backupFile;
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate()) +
      " " + pad(date.getHours()) + ":" + pad(date.getMinutes())
    );
  }

  // 件数の一覧（書き出し・読み込みの確認で見せる）
  function summaryLines(summary) {
    if (!summary) return [];
    var lines = ["配合 " + summary.categories + " 個（作業枠 " + summary.workspaces + " 個）"];
    lines.push("保存した配合 " + summary.configs + " 件");
    if (summary.customHorses) lines.push("自家製馬 " + summary.customHorses + " 頭");
    if (summary.editStallions) lines.push("エディット種牡馬 " + summary.editStallions + " 頭");
    if (summary.favorites) lines.push("お気に入り " + summary.favorites + " 件");
    return lines;
  }

  var SettingsPage = {
    name: "settings-page",
    data: function () {
      var theme = window.Dabimas.logic.theme;
      var link = window.Dabimas.logic.musumeLink;
      var planAuto = window.Dabimas.logic.plan.autoSetting;
      var nameSize = window.Dabimas.logic.nameSize;
      var heartColor = window.Dabimas.logic.heartColor;
      return {
        activeMenu: null,
        themeMode: theme ? theme.get() : "light",
        pedigreeOpen: !!(link && link.pedigreeOpen()),
        planAutoDiagnosis: planAuto.get(),
        nameSize: nameSize ? nameSize.get() : "small",
        heartColor: heartColor ? heartColor.get() : "modern",
        // バックアップ（#19）
        lastBackupAt: backupFile().lastBackupAt(),
        backupBusy: false,
        exportDialog: { show: false, prepared: null },
        importDialog: { show: false, parsed: null },
        backupSnackbar: { show: false, message: "", color: "success" },
      };
    },
    watch: {
      // 押した瞬間に画面へ反映し、次に開いたときも同じになるよう覚える。
      themeMode: function (mode) {
        var theme = window.Dabimas.logic.theme;
        if (theme) theme.set(mode);
      },
      // ダビ娘の URL に載せている値なので、変えると iframe を読み直す。
      pedigreeOpen: function (value) {
        var link = window.Dabimas.logic.musumeLink;
        if (link) link.setPedigreeOpen(value);
        this.$root.musumePedigreeOpen = !!value;
      },
      nameSize: function (size) {
        var nameSize = window.Dabimas.logic.nameSize;
        if (nameSize) nameSize.set(size);
      },
      heartColor: function (mode) {
        var heartColor = window.Dabimas.logic.heartColor;
        if (heartColor) heartColor.set(mode);
      },
      planAutoDiagnosis: function (value) {
        this.$root.planAutoDiagnosis = window.Dabimas.logic.plan.autoSetting.set(value);
      },
    },
    computed: {
      lastBackupText: function () {
        var text = formatDateTime(this.lastBackupAt);
        return text ? "最後に書き出した日 " + text : "まだ書き出していません";
      },
      exportLines: function () {
        return summaryLines(this.exportDialog.prepared && this.exportDialog.prepared.summary);
      },
      importLines: function () {
        return summaryLines(this.importDialog.parsed && this.importDialog.parsed.summary);
      },
      importDateText: function () {
        return formatDateTime(this.importDialog.parsed && this.importDialog.parsed.exportedAt);
      },
    },
    methods: {
      notify: function (message, color) {
        this.backupSnackbar = { show: true, message: message, color: color || "success" };
      },
      // 書き出す中身を先に作ってから、保存ボタンを出す（共有メニューはタップの
      // 直後でないと開けないため。vue/logic/storage/backup-file.js）。
      openExport: function () {
        if (this.backupBusy) return;
        this.backupBusy = true;
        backupFile()
          .prepare()
          .then((prepared) => {
            this.exportDialog = { show: true, prepared: prepared };
          })
          .catch((error) => {
            console.error("backup prepare failed", error);
            this.notify("バックアップを作れませんでした", "error");
          })
          .then(() => {
            this.backupBusy = false;
          });
      },
      saveExport: function () {
        var prepared = this.exportDialog.prepared;
        if (!prepared) return;
        backupFile()
          .save(prepared)
          .then((result) => {
            if (result === "cancelled") return;
            this.exportDialog = { show: false, prepared: null };
            this.lastBackupAt = backupFile().lastBackupAt();
            this.notify(result === "downloaded" ? "バックアップをダウンロードしました" : "バックアップを書き出しました");
          })
          .catch((error) => {
            console.error("backup save failed", error);
            this.notify("バックアップを保存できませんでした", "error");
          });
      },
      pickImportFile: function () {
        if (this.backupBusy) return;
        this.$refs.backupFileInput.value = "";
        this.$refs.backupFileInput.click();
      },
      onImportFile: function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;
        this.backupBusy = true;
        backupFile()
          .parse(file)
          .then((parsed) => {
            this.importDialog = { show: true, parsed: parsed };
          })
          .catch((error) => {
            this.notify(error.message || "ファイルを読めませんでした", "error");
          })
          .then(() => {
            this.backupBusy = false;
          });
      },
      confirmImport: function () {
        var parsed = this.importDialog.parsed;
        if (!parsed || this.backupBusy) return;
        this.backupBusy = true;
        backupFile()
          .restore(parsed)
          .then(() => {
            // 画面の状態を全部作り直すため、ページを読み直す。
            window.location.reload();
          })
          .catch((error) => {
            console.error("backup restore failed", error);
            this.backupBusy = false;
            this.importDialog = { show: false, parsed: null };
            this.notify("読み込みに失敗しました。ページを読み直してください", "error");
          });
      },
      goHome: function () {
        this.activeMenu = null;
        this.$root.currentScreen = "home";
      },
    },
    template: `
      <div>
        <sire-line-color-manager
          v-if="activeMenu === 'sire-line-colors'"
          @back="activeMenu = null"
        ></sire-line-color-manager>
        <edit-stallion-manager
          v-else-if="activeMenu === 'edit-stallions'"
          @back="activeMenu = null"
        ></edit-stallion-manager>
        <div v-else class="dabimas-settings">
          <v-app-bar dense flat color="white" class="dabimas-appbar dabimas-settings-appbar">
            <v-btn icon aria-label="ホームへ戻る" @click="goHome">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="dabimas-appbar-title dabimas-settings-title">設定</v-toolbar-title>
          </v-app-bar>
          <v-list class="dabimas-settings-menu">
            <v-list-item @click="activeMenu = 'edit-stallions'">
              <v-list-item-icon><v-icon>mdi-horse</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>エディット種牡馬</v-list-item-title>
                <v-list-item-subtitle>登録・編集・削除</v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-icon><v-icon>mdi-chevron-right</v-icon></v-list-item-icon>
            </v-list-item>
            <v-list-item class="dabimas-theme-item">
              <v-list-item-icon><v-icon>mdi-file-tree</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>ダビ娘の血統表</v-list-item-title>
                <v-list-item-subtitle>最初から開く（一覧のスクロールは重くなります）</v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action>
                <v-switch v-model="pedigreeOpen" dense hide-details inset aria-label="血統表を最初から開く"></v-switch>
              </v-list-item-action>
            </v-list-item>
            <v-list-item class="dabimas-theme-item">
              <v-list-item-icon><v-icon>mdi-magnify-scan</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>工程診断を自動で行う</v-list-item-title>
                <v-list-item-subtitle>血統表が埋まると危険な工程を赤枠で示す</v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action>
                <v-switch v-model="planAutoDiagnosis" dense hide-details inset aria-label="工程診断を自動で行う"></v-switch>
              </v-list-item-action>
            </v-list-item>
            <v-list-item class="dabimas-theme-item">
              <v-list-item-icon><v-icon>mdi-theme-light-dark</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>表示テーマ</v-list-item-title>
                <v-list-item-subtitle>画面全体の明るさ</v-list-item-subtitle>
                <v-btn-toggle v-model="themeMode" mandatory dense class="dabimas-theme-toggle">
                  <v-btn value="dark" small>ダーク</v-btn>
                  <v-btn value="light" small>ライト</v-btn>
                  <v-btn value="auto" small>端末に合わせる</v-btn>
                </v-btn-toggle>
              </v-list-item-content>
            </v-list-item>
            <v-list-item class="dabimas-theme-item">
              <v-list-item-icon><v-icon>mdi-format-size</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>馬名の文字の大きさ</v-list-item-title>
                <v-list-item-subtitle>スマホの血統表。大は長い名前の後ろが切れやすい</v-list-item-subtitle>
                <v-btn-toggle v-model="nameSize" mandatory dense class="dabimas-theme-toggle">
                  <v-btn value="large" small>大</v-btn>
                  <v-btn value="small" small>小</v-btn>
                </v-btn-toggle>
              </v-list-item-content>
            </v-list-item>
            <v-list-item class="dabimas-theme-item">
              <v-list-item-icon><v-icon>mdi-heart-outline</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>クロスのハートの色</v-list-item-title>
                <v-btn-toggle v-model="heartColor" mandatory dense class="dabimas-theme-toggle">
                  <v-btn value="modern" small>標準</v-btn>
                  <v-btn value="classic" small>クラシック</v-btn>
                </v-btn-toggle>
              </v-list-item-content>
            </v-list-item>
            <v-list-item class="dabimas-theme-item dabimas-backup-item">
              <v-list-item-icon><v-icon>mdi-content-save-outline</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>バックアップ</v-list-item-title>
                <v-list-item-subtitle>{{ lastBackupText }}</v-list-item-subtitle>
                <div class="dabimas-backup-actions">
                  <v-btn small outlined :disabled="backupBusy" @click="openExport">
                    <v-icon left small>mdi-export</v-icon>書き出す
                  </v-btn>
                  <v-btn small outlined :disabled="backupBusy" @click="pickImportFile">
                    <v-icon left small>mdi-import</v-icon>読み込む
                  </v-btn>
                </div>
                <input
                  ref="backupFileInput"
                  type="file"
                  accept=".json,application/json"
                  class="dabimas-backup-input"
                  @change="onImportFile"
                />
              </v-list-item-content>
            </v-list-item>
            <v-list-item @click="activeMenu = 'sire-line-colors'">
              <v-list-item-icon><v-icon>mdi-palette</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>子系統カラー</v-list-item-title>
                <v-list-item-subtitle>色分けの割り当て・ラベル</v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-icon><v-icon>mdi-chevron-right</v-icon></v-list-item-icon>
            </v-list-item>
          </v-list>
        </div>

        <v-dialog v-model="exportDialog.show" max-width="360">
          <v-card>
            <v-card-title class="text-subtitle-1">バックアップを書き出す</v-card-title>
            <v-card-text>
              <div v-for="line in exportLines" :key="line">{{ line }}</div>
              <div class="dabimas-backup-note">
                スマホでは、出てきたメニューから「"ファイル"に保存」を選ぶか、LINE やメールで自分に送ってください。
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text @click="exportDialog.show = false">キャンセル</v-btn>
              <v-btn text color="primary" @click="saveExport">保存する</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="importDialog.show" max-width="360" :persistent="backupBusy">
          <v-card>
            <v-card-title class="text-subtitle-1">バックアップを読み込む</v-card-title>
            <v-card-text>
              <div v-if="importDateText" class="dabimas-backup-date">{{ importDateText }} に書き出したものです</div>
              <div v-for="line in importLines" :key="line">{{ line }}</div>
              <div class="dabimas-backup-warning">
                いまの配合・保存した配合・設定は、この内容に置き換わります。元には戻せません。
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="backupBusy" @click="importDialog.show = false">キャンセル</v-btn>
              <v-btn text color="error" :loading="backupBusy" @click="confirmImport">置き換える</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="backupSnackbar.show" :color="backupSnackbar.color" :timeout="4000">
          {{ backupSnackbar.message }}
        </v-snackbar>
      </div>
    `,
  };

  window.Dabimas.components.SettingsPage = SettingsPage;
  Vue.component("settings-page", SettingsPage);
})(window, window.Vue);
