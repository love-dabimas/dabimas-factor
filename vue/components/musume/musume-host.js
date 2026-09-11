/**
 * このコンポーネントの役割: ダビ娘の単体画面・検索シート・メッセージ・トースト。
 * このコンポーネントに置かない処理: DB 操作、血統表への選択反映。
 */
(function (window, Vue) {
  window.Dabimas.components = window.Dabimas.components || {};
  var link = window.Dabimas.logic.musumeLink;
  var favorites = window.Dabimas.favorites;
  var workspaceSync = window.Dabimas.workspaceSync;
  var MusumeHost = {
    data() {
      return {
        screenOpened: false, sheetOpen: false, sheetSrc: "",
        target: null, lastTargetIndex: null,
        snackbar: { show: false, text: "" },
      };
    },
    computed: {
      isMusumeScreen() { return this.$root.currentScreen === "musume"; },
      embedUrl() { return link.embedUrl(); },
      targetLabel() { return this.target ? this.target.label : ""; },
      // horsesBase は root の data に無くリアクティブでないので、buildHorseLists() で
      // 直後に代入される stallionsBase（data にある）で読み込み完了を判定する。
      horsesReady() { return this.$root.stallionsBase.length > 0; },
      favoriteVersion() { return favorites.state.version; },
      favoritesOnly() { return favorites.state.only; },
    },
    watch: {
      "$root.currentScreen": {
        immediate: true,
        handler(screen, previous) {
          if (screen === "musume") this.screenOpened = true;
          if (previous !== undefined && previous !== screen) workspaceSync.rememberScreen(screen);
        },
      },
      horsesReady(ready) {
        if (!ready) return;
        this.prepareSupported();
        this.pendingHello.forEach(source => {
          if (this.sources().includes(source)) this.sendFavorites(source, true);
        });
        this.pendingHello.clear();
      },
      favoriteVersion() { this.broadcastFavorites(); },
      favoritesOnly() { this.broadcastFavorites(); },
    },
    created() {
      this.pendingHello = new Set();
      this.supportedIds = null;
      this.supportedKeys = [];
      this.$root.$on("musume:open-search", this.openSearch);
      window.addEventListener("message", this.onMessage);
    },
    beforeDestroy() {
      this.$root.$off("musume:open-search", this.openSearch);
      window.removeEventListener("message", this.onMessage);
      this.pendingHello.clear();
    },
    methods: {
      sources() {
        return [this.$refs.screenFrame, this.$refs.sheetFrame].filter(Boolean).map(frame => frame.contentWindow);
      },
      send(source, message) {
        if (source) source.postMessage(message, window.location.origin);
      },
      prepareSupported() {
        if (this.supportedIds || !this.horsesReady) return;
        this.supportedIds = new Set(this.$root.horsesBase.map(horse => horse.id).filter(link.isMasterHorseId));
        this.supportedKeys = Array.from(this.supportedIds).map(link.toMusumeKey);
      },
      sendFavorites(source, includeSupported) {
        var message = { type: "dabimas:favorites", v: 1,
          favoriteKeys: favorites.ids().map(link.toMusumeKey), favoritesOnly: favorites.state.only };
        if (includeSupported) {
          this.prepareSupported();
          message.supportedKeys = favorites.state.available ? this.supportedKeys : [];
        }
        this.send(source, message);
      },
      broadcastFavorites() { this.sources().forEach(source => this.sendFavorites(source, false)); },
      leaveScreen() { return workspaceSync.goHome(); },
      openSearch({ index, label, select }) {
        this.target = { index, label, select };
        var src = link.pickerUrl(index);
        if (src !== this.sheetSrc) this.sheetSrc = src;
        else if (this.lastTargetIndex !== index) this.resetPick();
        this.lastTargetIndex = index;
        this.sheetOpen = true;
      },
      resetPick() {
        this.send(this.$refs.sheetFrame && this.$refs.sheetFrame.contentWindow, { type: "dabimas:reset-pick", v: 1 });
      },
      showError(text) { this.snackbar = { show: true, text }; },
      onMessage(event) {
        var data = link.readMessage(event, this.sources(), window.location.origin);
        if (!data) return;
        if (data.type === "dabimas:hello") {
          if (this.horsesReady) this.sendFavorites(event.source, true);
          else this.pendingHello.add(event.source);
          return;
        }
        if (data.type === "dabimas:favorites-only") {
          favorites.setOnly(data.value === true);
          return;
        }
        var id = link.fromMusume(data.horseId, data.gender);
        if (data.type === "dabimas:favorite-toggle") {
          this.prepareSupported();
          if (!id || !this.supportedIds || !this.supportedIds.has(id)) return;
          favorites.toggle(id).catch(() => this.showError("お気に入りを保存できませんでした"));
          return;
        }
        if (!this.sheetOpen || !this.target || !this.$refs.sheetFrame || event.source !== this.$refs.sheetFrame.contentWindow) return;
        var summary = id ? this.$root.findSummaryHorse({ id }) : null;
        if (!summary) {
          this.showError("『" + (typeof data.name === "string" ? data.name : "") + "』はダビふぁく未対応の馬です");
          return;
        }
        var sex = link.allowedSexForCell(this.target.index);
        if (sex !== "any" && sex !== data.gender) {
          this.showError(sex === "0" ? "このセルには種牡馬しか入りません" : "このセルには繁殖牝馬しか入りません");
          return;
        }
        this.sheetOpen = false;
        this.resetPick();
        this.target.select(summary);
      },
    },
    template: `
      <div class="musume-host">
        <div v-if="screenOpened" v-show="isMusumeScreen" class="musume-screen">
          <div class="musume-frame-header">
            <button type="button" class="musume-frame-back" @click="leaveScreen">‹ ホーム</button>
            <span class="musume-frame-title">ダビ娘</span>
          </div>
          <iframe ref="screenFrame" :src="embedUrl" class="musume-iframe musume-iframe--fill" title="ダビ娘"></iframe>
        </div>
        <v-bottom-sheet v-model="sheetOpen" content-class="musume-sheet-dialog">
          <v-sheet class="musume-sheet">
            <div class="musume-sheet-grip"></div>
            <div class="musume-frame-header">
              <button type="button" class="musume-frame-back" @click="sheetOpen = false">‹ 戻る</button>
              <span class="musume-frame-title">ダビ娘で探す<small>{{ targetLabel }}</small></span>
            </div>
            <iframe v-if="sheetSrc" ref="sheetFrame" :src="sheetSrc" class="musume-iframe musume-iframe--sheet" title="ダビ娘で探す"></iframe>
          </v-sheet>
        </v-bottom-sheet>
        <v-snackbar v-model="snackbar.show" :timeout="3500" top color="error">{{ snackbar.text }}</v-snackbar>
      </div>
    `,
  };
  window.Dabimas.components.MusumeHost = MusumeHost;
  Vue.component("musume-host", MusumeHost);
})(window, window.Vue);
