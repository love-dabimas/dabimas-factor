// 配合理論補助の表示とローカル候補の選択。判定・後続世代の管理は assist-plan に委譲する。
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};
  var logic = window.Dabimas.logic;

  var AssistScreen = {
    name: "assist-screen",
    data() {
      return {
        plan: null, baseMare: null, sireLines: [null, null, null],
        pickerOpen: false, pickerStep: 0, selectedCandidate: null,
        busy: false, error: "", requestVersion: 0,
      };
    },
    computed: {
      steps() {
        return this.plan ? this.plan.steps : [1, 2, 3].map(stepNo => ({ stepNo }));
      },
      candidates() {
        return (this.pickerStep === 0 ? this.$root.broodmares : this.$root.stallions) || [];
      },
      pickerTitle() {
        return this.pickerStep === 0 ? "繁殖牝馬を選ぶ" : this.pickerStep + "代目の種牡馬を選ぶ";
      },
    },
    beforeDestroy() {
      // 画面を離れた後に完了した詳細取得は反映しない。
      this.requestVersion += 1;
    },
    methods: {
      // 馬名の作り方は本体と揃える。ここだけ独自にすると、同じ馬が血統表と
      // この画面で違う名前に見える（自家製馬の ☆ の扱いも共通関数が持っている）。
      horseName(horse) {
        return horse ? logic.horses.getHorseNameText(horse) : "";
      },
      candidateName(horse) {
        return logic.horses.getHorseBaseText(horse);
      },
      filterHorse(horse, query) {
        return logic.horses.filterHorse(horse, query);
      },
      factorBadges(horse) {
        return logic.horses.getHorseFactorBadges(horse);
      },
      theoryName(result) {
        return window.Dabimas.constants.breedingTheories.DISPLAY_NAME[result.displayed] || "理論なし";
      },
      // Phase 4 ではこの選択入口を差し替える。
      openPicker(stepNo) {
        if (this.busy || (stepNo && (!this.plan || !this.plan.isSelectable(stepNo)))) return;
        this.pickerStep = stepNo;
        this.selectedCandidate = null;
        this.error = "";
        this.pickerOpen = true;
      },
      async confirmSelection() {
        if (this.busy || !this.selectedCandidate) return;
        var stepNo = this.pickerStep;
        var version = ++this.requestVersion;
        this.busy = true;
        this.error = "";
        try {
          var detail = await this.$root.ensureHorseDetail(this.selectedCandidate);
          if (version !== this.requestVersion) return;
          if (!detail || !Array.isArray(detail.descendants) || detail.descendants.length !== 15 ||
              !Array.from(detail.descendants).every(entry => entry && typeof entry === "object")) {
            throw new Error("horse detail is incomplete");
          }
          if (stepNo === 0) {
            var nextPlan = logic.plan.createAssistPlan({ baseMare: detail, brosData: this.$root.brosData });
            this.plan = nextPlan;
            this.baseMare = detail;
            this.sireLines = [null, null, null];
          } else {
            var lines = logic.theory.prepareSireOperands(logic.plan.expandHorseBoard(detail, this.$root.brosData));
            this.plan.selectSire(stepNo, detail);
            this.sireLines = this.sireLines.map((previous, index) =>
              index < stepNo - 1 ? previous : index === stepNo - 1 ? lines : null);
          }
          this.pickerOpen = false;
        } catch (error) {
          if (version !== this.requestVersion) return;
          this.error = "馬の詳細を取得できませんでした。もう一度選んでください。";
        } finally {
          if (version === this.requestVersion) {
            this.busy = false;
            this.selectedCandidate = null;
          }
        }
      },
      goHome() {
        window.Dabimas.workspaceSync.goHome().catch(() => {
          this.error = "ホームを開けませんでした。もう一度お試しください。";
        });
      },
    },
    template: `
      <div class="assist-screen">
        <div class="assist-page">
          <div class="assist-head">
            <v-btn text small class="align-self-start" @click="goHome"><v-icon left small>mdi-arrow-left</v-icon>ホーム</v-btn>
            <h1>配合理論補助</h1>
            <p>繁殖牝馬を起点に、代ごとに種牡馬を選び、その組み合わせで成立する配合理論を確認する画面です。</p>
          </div>
          <v-alert v-if="error && !pickerOpen" dense outlined type="error" role="alert">{{ error }}</v-alert>
          <section v-for="step in steps" :key="step.stepNo" class="assist-gen"
            :class="['assist-gen--' + step.stepNo, { 'is-locked': step.stepNo > 1 && !step.mareLines }]">
            <div class="assist-gen-head"><span>STEP {{ step.stepNo }}</span>{{ step.stepNo }}代目</div>
            <div class="assist-gen-body">
              <template v-if="step.mareLines">
                <div class="assist-horse">
                  <div class="assist-role">{{ step.stepNo === 1 ? '繁殖牝馬' : '繁殖牝馬（' + (step.stepNo - 1) + '代目の産駒）' }}</div>
                  <div class="assist-horse-name">
                    <b>{{ step.stepNo === 1 ? horseName(baseMare) : step.mareLabel }}</b>
                    <span v-if="step.stepNo > 1" class="assist-virtual">仮想</span>
                    <span v-else-if="baseMare.rare" class="assist-rare">{{ baseMare.rare }}</span>
                    <v-btn v-if="step.stepNo === 1" text x-small :disabled="busy" @click="openPicker(0)">選び直す</v-btn>
                  </div>
                  <div class="assist-horse-meta">{{ step.stepNo === 1 ? baseMare.son : '仮想の繁殖牝馬' }}　繁殖牝馬</div>
                  <div v-if="step.stepNo === 1 && factorBadges(baseMare).length" class="assist-horse-factors">
                    <span v-for="factor in factorBadges(baseMare)" :key="factor.key" :class="['exp-option-factor-badge', factor.className]">{{ factor.text }}</span>
                  </div>
                  <div class="assist-lines">
                    <div v-for="kind in ['面白', '見事']" :key="kind" class="assist-line-row">
                      <span class="assist-line-label" :class="{ 'is-migoto': kind === '見事' }">{{ kind }}</span>
                      <span v-for="(code, index) in step.mareLines" :key="index" class="assist-line-code">{{ code || 'ー' }}</span>
                    </div>
                  </div>
                </div>
                <template v-if="step.sire">
                  <div class="assist-horse">
                    <div class="assist-role">種牡馬（選択済み）</div>
                    <div class="assist-horse-name"><b>{{ horseName(step.sire) }}</b>
                      <span v-if="step.sire.rare" class="assist-rare">{{ step.sire.rare }}</span>
                      <v-btn text x-small :disabled="busy" @click="openPicker(step.stepNo)">選び直す</v-btn>
                    </div>
                    <div class="assist-horse-meta">{{ step.sire.son }}　種牡馬</div>
                    <div v-if="factorBadges(step.sire).length" class="assist-horse-factors">
                      <span v-for="factor in factorBadges(step.sire)" :key="factor.key" :class="['exp-option-factor-badge', factor.className]">{{ factor.text }}</span>
                    </div>
                    <div class="assist-lines">
                      <div v-for="kind in ['omoshiro', 'migoto']" :key="kind" class="assist-line-row">
                        <span class="assist-line-label" :class="{ 'is-migoto': kind === 'migoto' }">{{ kind === 'omoshiro' ? '面白' : '見事' }}</span>
                        <span v-for="(code, index) in sireLines[step.stepNo - 1][kind]" :key="index" class="assist-line-code">{{ code || 'ー' }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="assist-result" aria-live="polite">
                    <div><div class="assist-block-title">成立した配合理論</div>
                      <span class="assist-theory-badge">{{ theoryName(step.result) }}</span>
                    </div>
                    <div><div class="assist-block-title">因子</div><div class="assist-placeholder">未計算</div></div>
                    <div class="assist-placeholder assist-cross">クロスの詳細 — 未計算</div>
                  </div>
                </template>
                <v-btn v-else block depressed class="assist-pick" :disabled="busy" @click="openPicker(step.stepNo)">＋ 種牡馬を選ぶ</v-btn>
              </template>
              <v-btn v-else-if="step.stepNo === 1" block depressed class="assist-pick" :disabled="busy" @click="openPicker(0)">＋ 繁殖牝馬を選ぶ</v-btn>
              <div v-else class="assist-waiting">{{ step.stepNo - 1 }}代目の種牡馬を選ぶと使えるようになります</div>
            </div>
          </section>
          <footer class="assist-foot">1代目で選んだ種牡馬と繁殖牝馬から生まれる産駒が、そのまま2代目の繁殖牝馬になります。前の代を変えると、後ろの代は組み直しになります。</footer>
        </div>
        <v-dialog v-model="pickerOpen" :persistent="busy" max-width="480">
          <v-card>
            <v-card-title class="text-subtitle-1">{{ pickerTitle }}</v-card-title>
            <v-card-text>
              <v-alert v-if="error" dense outlined type="error" role="alert">{{ error }}</v-alert>
              <v-autocomplete v-model="selectedCandidate" :items="candidates" :item-text="candidateName"
                item-value="id" return-object :filter="filterHorse" label="馬名で検索" no-data-text="候補がありません"
                :disabled="busy" :loading="busy" hide-details outlined dense></v-autocomplete>
            </v-card-text>
            <v-card-actions><v-spacer></v-spacer>
              <v-btn text :disabled="busy" @click="pickerOpen = false">キャンセル</v-btn>
              <v-btn color="primary" :disabled="!selectedCandidate || busy" :loading="busy" @click="confirmSelection">選択する</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    `,
  };
  window.Dabimas.components.AssistScreen = AssistScreen;
  Vue.component("assist-screen", AssistScreen);
})(window, window.Vue);
