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
      embedUrl() { return link.embedUrl(this.$root.musumePedigreeOpen); },
      targetLabel() { return this.target ? this.target.label : ""; },
      // horsesBase は root の data に無くリアクティブでないので、buildHorseLists() で
      // 直後に代入される stallionsBase（data にある）で読み込み完了を判定する。
      horsesReady() { return this.$root.stallionsBase.length > 0; },
      favoriteVersion() { return favorites.state.version; },
      favoritesOnly() { return favorites.state.only; },
    },
    watch: {
      sheetOpen(open) { if (!open) this.cancelTheoryRefinement(); },
      "$root.currentScreen": {
        immediate: true,
        handler(screen, previous) {
          if (screen === "musume") this.screenOpened = true;
          if (previous !== undefined && previous !== screen) {
            this.sheetOpen = false;
            this.target = null;
          }
          if (previous !== undefined && previous !== screen) workspaceSync.rememberScreen(screen);
        },
      },
      horsesReady(ready) {
        if (!ready) return;
        this.prepareSupported();
        this.pendingHello.forEach(source => {
          if (this.sources().includes(source)) this.replyHello(source);
        });
        this.pendingHello.clear();
      },
      favoriteVersion() { this.broadcastFavorites(); },
      favoritesOnly() { this.broadcastFavorites(); },
      "$root.savedHorseSummaries": {
        deep: true,
        handler() {
          this.customPayloadPromise = null;
          this.theoryMapCache.clear();
          this.sireBoardCache.clear();
          this.cancelTheoryRefinement();
          this.readySources.forEach(source => {
            if (this.sources().includes(source)) this.sendCustomAndTheory(source);
          });
        },
      },
    },
    created() {
      this.pendingHello = new Set();
      this.supportedIds = null;
      this.supportedKeys = [];
      this.readySources = new Set();
      this.candidateRows = null;
      this.customPayloadPromise = null;
      this.theoryJob = null;
      this.theoryMapCache = new Map();
      this.sireBoardCache = new Map();
      this.$root.$on("musume:open-search", this.openSearch);
      window.addEventListener("message", this.onMessage);
    },
    beforeDestroy() {
      this.cancelTheoryRefinement();
      this.$root.$off("musume:open-search", this.openSearch);
      window.removeEventListener("message", this.onMessage);
      this.pendingHello.clear();
      this.readySources.clear();
      this.customPayloadPromise = null;
    },
    methods: {
      cancelTheoryRefinement() {
        if (this.theoryJob) clearTimeout(this.theoryJob.timer);
        this.theoryJob = null;
      },
      // 1頭を計測してから頭数を決める。予算の半分を余裕として残し、
      // 詳細の取得・盤面展開も同じスライス内で行う。
      startTheoryRefinement(source, target, map, horses) {
        this.cancelTheoryRefinement();
        var input = target.theoryMap;
        if (!input.mareBoard) return;
        var cached = this.theoryMapCache.get(input.mareKey);
        if (cached) { this.send(source, cached); return; }
        var logic = window.Dabimas.logic;
        var keys = this.candidateRows.map(row => row[0]).concat(horses.map(horse => horse.key))
          .filter(key => key.endsWith("-0"));
        var summaries = new Map(this.$root.horsesBase.concat(this.$root.savedHorseSummaries || [])
          .map(horse => [link.toMusumeKey(horse.id, horse.sex), horse]));
        var job = { timer: null, maxPerHorse: 0, metrics: { slices: [], started: performance.now(), count: keys.length } };
        this.theoryJob = job;
        var state = { map: map, boards: new Array(keys.length), mareBoard: input.mareBoard,
          cursor: 0, limit: 1, options: { candidateKeys: keys,
            inbreedExceptions: this.$root.inbreedExceptions,
            nodeTable: window.Dabimas.pedigreeNodes || null,
            resolver: this.$root.identityResolver || null } };
        var current = () => this.theoryJob === job && this.sheetOpen && this.target === target &&
          this.sources().includes(source);
        var run = async () => {
          if (!current()) return;
          try {
            var started = performance.now();
            var limit = job.maxPerHorse ? Math.max(1, Math.floor(8 / job.maxPerHorse)) : 1;
            var processed = 0;
            while (state.cursor < keys.length && processed < limit) {
              var key = keys[state.cursor];
              var board = this.sireBoardCache.get(key);
              if (!board && summaries.has(key)) {
                var detail = await this.$root.ensureHorseDetail(summaries.get(key));
                if (!current()) return;
                if (!detail || !Array.isArray(detail.descendants) || detail.descendants.length !== 15) {
                  throw new Error("候補の血統が取得できませんでした");
                }
                board = logic.plan.expandHorseBoard(detail, this.$root.brosData);
                this.sireBoardCache.set(key, board);
              }
              state.boards[state.cursor] = board || null;
              var result = logic.musume.refineTheoryMapStep(state);
              state.cursor = result.cursor;
              state.map = result.map;
              processed += 1;
              // 実測から予算を超えそうな次の1頭は次スライスへ回す。
              var elapsed = performance.now() - started;
              job.maxPerHorse = Math.max(job.maxPerHorse, elapsed / processed);
              if (elapsed + job.maxPerHorse >= 8) break;
            }
            job.metrics.slices.push(performance.now() - started);
            if (!current()) return;
            if (state.cursor === keys.length) {
              // 候補0件でもpendingを解除する。
              state.map = logic.musume.refineTheoryMapStep(state).map;
              job.metrics.totalMs = performance.now() - job.metrics.started;
              this.lastTheoryMetrics = job.metrics;
              this.theoryMapCache.set(input.mareKey, state.map);
              this.theoryJob = null;
              this.send(source, state.map);
            } else job.timer = setTimeout(run, 0);
          } catch (error) {
            if (!current()) return;
            this.cancelTheoryRefinement();
            this.showError("配合理論を計算できませんでした。もう一度開いてください");
          }
        };
        job.timer = setTimeout(run, 0);
      },
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
      customPayloads() {
        if (!this.customPayloadPromise) {
          this.customPayloadPromise = Promise.all((this.$root.savedHorseSummaries || [])
            .filter(horse => horse.source !== "edit")
            .map(async horse => {
              var detail = await this.$root.ensureHorseDetail(horse);
              var board = window.Dabimas.logic.plan.expandHorseBoard(detail, this.$root.brosData);
              return window.Dabimas.logic.musume.buildCustomHorsePayload(detail, board);
            }));
        }
        return this.customPayloadPromise;
      },
      replyHello(source) {
        this.readySources.add(source);
        this.sendFavorites(source, true);
        this.sendCustomAndTheory(source);
      },
      async sendCustomAndTheory(source) {
        var target = this.target;
        var pending = this.customPayloads();
        try {
          var horses = await pending;
          if (pending !== this.customPayloadPromise || !this.sources().includes(source)) return;
          this.send(source, { type: "dabimas:custom-horses", v: 1, horses });
          if (target !== this.target || !target || !this.sheetOpen ||
              !this.$refs.sheetFrame || source !== this.$refs.sheetFrame.contentWindow) return;
          // 理論を出さない検索（繁殖牝馬を選ぶときや血統表のセル）では、空のチップを
          // 送ってダビ娘側の理論チップを消す。前の母のチップが残るのを防ぐ。
          if (!target.theoryMap) {
            this.send(source, { type: "dabimas:theory-map", v: 1, mareKey: "", chips: [], entries: [] });
            return;
          }
          // 候補が届くまでは送らない。空のチップを先に送ると、出るはずのチップが
          // 一瞬消えて見える。
          if (!this.candidateRows) return;
          var input = target.theoryMap;
          var map = input.entries ? input : window.Dabimas.logic.musume.buildTheoryMap({
            mareKey: input.mareKey, damLines: input.damLines,
            rows: this.candidateRows, customHorses: horses,
          });
          this.send(source, map);
          if (!input.entries) this.startTheoryRefinement(source, target, map, horses);
        } catch (error) {
          if (pending !== this.customPayloadPromise || !this.sources().includes(source)) return;
          this.customPayloadPromise = null;
          this.showError("自家製馬・配合理論を読み込めませんでした。もう一度開いてください");
        }
      },
      leaveScreen() { return workspaceSync.goHome(); },
      openSearch({ index, label, select, sex, theoryMap }) {
        sex = sex === undefined ? link.allowedSexForCell(index) : sex;
        if (!["0", "1", "any"].includes(sex)) return;
        this.cancelTheoryRefinement();
        this.target = { index, label, select, sex, theoryMap };
        // 母が変わっても iframe は作り直さない。作り直すとダビ娘の起動に毎回
        // 1.4〜1.8 秒かかる（8MB の検索データを読み直すため）。母が変わったことは
        // mareKey で伝わり、理論を出さない検索へ戻すときは空のチップを送る。
        var src = link.BASE_URL + "?picker=1&sex=" + sex +
          link.pedigreeParam(this.$root.musumePedigreeOpen);
        if (src !== this.sheetSrc) {
          var previous = this.$refs.sheetFrame && this.$refs.sheetFrame.contentWindow;
          this.readySources.delete(previous);
          this.pendingHello.delete(previous);
          this.sheetSrc = src;
        }
        else {
          this.resetPick();
          var source = this.$refs.sheetFrame && this.$refs.sheetFrame.contentWindow;
          if (this.readySources.has(source)) this.sendCustomAndTheory(source);
        }
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
          if (this.horsesReady) this.replyHello(event.source);
          else this.pendingHello.add(event.source);
          return;
        }
        if (data.type === "dabimas:candidates") {
          if (!Array.isArray(data.rows) || !data.rows.every(row => Array.isArray(row) && row.length === 5 &&
              row.every(value => typeof value === "string") && /^\d+-[01]$/.test(row[0]) &&
              /^[A-Za-z]{2}$/.test(row[1]) && /^[A-Za-z]{2}$/.test(row[2]) &&
              /^[A-Za-z]{4}$/.test(row[3]) && /^[A-Za-z]{6}([A-Za-z]{2})?$/.test(row[4]))) return;
          this.candidateRows = data.rows;
          this.theoryMapCache.clear();
          this.cancelTheoryRefinement();
          var source = this.$refs.sheetFrame && this.$refs.sheetFrame.contentWindow;
          if (this.readySources.has(source)) this.sendCustomAndTheory(source);
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
        // findSummaryHorse が見るのは horsesBase（マスター）だけなので、自家製馬は
        // そのままでは「未対応」になる。自家製馬は savedHorseSummaries にいる。
        var summary = id
          ? this.$root.findSummaryHorse({ id }) ||
            (this.$root.savedHorseSummaries || []).find(horse => horse.id === id) || null
          : null;
        if (!summary) {
          this.showError("『" + (typeof data.name === "string" ? data.name : "") + "』はダビふぁく未対応の馬です");
          return;
        }
        var sex = this.target.sex;
        if (summary.sex !== data.gender || (sex !== "any" && sex !== data.gender)) {
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
            <button type="button" class="musume-frame-back" aria-label="ホームへ戻る" @click="leaveScreen">
              <span class="mdi mdi-arrow-left"></span>
            </button>
            <span class="musume-frame-title dabimas-appbar-title">ダビ娘</span>
          </div>
          <iframe ref="screenFrame" :src="embedUrl" class="musume-iframe musume-iframe--fill" title="ダビ娘"></iframe>
        </div>
        <v-bottom-sheet v-model="sheetOpen" content-class="musume-sheet-dialog">
          <v-sheet class="musume-sheet">
            <div class="musume-sheet-grip"></div>
            <div class="musume-frame-header">
              <button type="button" class="musume-frame-back" aria-label="閉じる" @click="sheetOpen = false">
                <span class="mdi mdi-arrow-left"></span>
              </button>
              <span class="musume-frame-title dabimas-appbar-title">ダビ娘で探す<small>{{ targetLabel }}</small></span>
            </div>
            <iframe v-if="sheetSrc" :key="sheetSrc" ref="sheetFrame" :src="sheetSrc" class="musume-iframe musume-iframe--sheet" title="ダビ娘で探す"></iframe>
          </v-sheet>
        </v-bottom-sheet>
        <v-snackbar v-model="snackbar.show" :timeout="3500" top color="error">{{ snackbar.text }}</v-snackbar>
      </div>
    `,
  };
  window.Dabimas.components.MusumeHost = MusumeHost;
  Vue.component("musume-host", MusumeHost);
})(window, window.Vue);
