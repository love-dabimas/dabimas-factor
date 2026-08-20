/** 設定メニューと各管理ビューの切り替えを担当する。 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var SettingsPage = {
    name: "settings-page",
    data: function () {
      return { activeMenu: null };
    },
    methods: {
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
          <v-app-bar dense flat color="white" class="dabimas-settings-appbar">
            <v-btn icon aria-label="ホームへ戻る" @click="goHome">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="dabimas-settings-title">設定</v-toolbar-title>
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
      </div>
    `,
  };

  window.Dabimas.components.SettingsPage = SettingsPage;
  Vue.component("settings-page", SettingsPage);
})(window, window.Vue);
