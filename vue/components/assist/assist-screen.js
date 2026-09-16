// 配合理論補助の表示とダビ娘への選択依頼。判定・後続世代の管理は assist-plan に委譲する。
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};
  var logic = window.Dabimas.logic;

  var AssistScreen = {
    name: "assist-screen",
    data() {
      return {
        plan: null, baseMare: null,
        busy: false, error: "", requestVersion: 0,
        capturing: false,
        pedigreeDialog: { open: false, title: "", note: "", sections: null },
      };
    },
    computed: {
      steps() {
        return this.plan ? this.plan.steps : [1, 2, 3].map(stepNo => ({ stepNo }));
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
      factorBadges(horse) {
        return logic.horses.getHorseFactorBadges(horse);
      },
      theoryName(result) {
        return window.Dabimas.constants.breedingTheories.DISPLAY_NAME[result.displayed] || "理論なし";
      },
      // ゲームと同じ理論の画像。css/style.css の .theory_01〜08 をそのまま使う。
      theoryClass(result) {
        return window.Dabimas.constants.breedingTheories.CLASS_NAME[result.displayed] || "";
      },
      openPicker(stepNo) {
        if (this.busy || (stepNo && (!this.plan || !this.plan.isSelectable(stepNo)))) return;
        var version = ++this.requestVersion;
        this.error = "";
        var request = {
          sex: stepNo === 0 ? "1" : "0",
          label: stepNo === 0 ? "繁殖牝馬を選ぶ" : stepNo + "代目の種牡馬を選ぶ",
          select: horse => {
            if (version !== this.requestVersion) return;
            return this.confirmSelection(stepNo, horse);
          },
        };
        if (stepNo) {
          var mother = logic.musumeLink.toMusumeKey(this.baseMare.id, this.baseMare.sex);
          request.theoryMap = {
            mareKey: stepNo === 1 ? mother : "virtual-" + stepNo + "-" + JSON.stringify([
              mother, this.plan.steps.slice(0, stepNo - 1).map(step => step.sire.id),
            ]),
            damLines: this.plan.steps[stepNo - 1].mareLines.slice(),
            mareBoard: this.plan.mareBoardFor(stepNo),
          };
        }
        this.$root.$emit("musume:open-search", request);
      },
      async confirmSelection(stepNo, horse) {
        if (this.busy || !horse) return;
        var version = ++this.requestVersion;
        this.busy = true;
        this.error = "";
        try {
          var detail = await this.$root.ensureHorseDetail(horse);
          if (version !== this.requestVersion) return;
          if (!detail || !Array.isArray(detail.descendants) || detail.descendants.length !== 15 ||
              !Array.from(detail.descendants).every(entry => entry && typeof entry === "object")) {
            throw new Error("horse detail is incomplete");
          }
          if (stepNo === 0) {
            var nextPlan = logic.plan.createAssistPlan({ baseMare: detail, brosData: this.$root.brosData,
              inbreedExceptions: this.$root.inbreedExceptions,
              nodeTable: window.Dabimas.pedigreeNodes || null, resolver: this.$root.identityResolver || null });
            this.plan = nextPlan;
            this.baseMare = detail;
          } else {
            this.plan.selectSire(stepNo, detail);
          }
        } catch (error) {
          if (version !== this.requestVersion) return;
          this.error = "馬の詳細を取得できませんでした。もう一度選んでください。";
        } finally {
          if (version === this.requestVersion) {
            this.busy = false;
          }
        }
      },
      // 仮想繁殖牝馬の中身を見せるだけ。選ばせない。
      openPedigree(step) {
        var board = this.plan && this.plan.mareBoardFor(step.stepNo);
        if (!board) return;
        this.pedigreeDialog = { open: true, title: step.mareLabel || "仮想の繁殖牝馬",
          note: "1代目の種牡馬と繁殖牝馬から組み上がった血統です。ここでは選べません。",
          sections: [{ label: "", board: board }] };
      },
      // 選んだ1組の配合結果（32セル）。種牡馬側と繁殖牝馬側を並べて見せる。
      // diagnosis.selected が buildStepSelected の戻り値そのものなので、
      // 前半16が種牡馬、後半16が繁殖牝馬になっている。
      openResult(step) {
        var selected = step.diagnosis && step.diagnosis.selected;
        if (!selected) return;
        this.pedigreeDialog = { open: true, title: step.stepNo + "代目の配合結果",
          note: "選んだ1組の血統です。ここでは選べません。",
          sections: [
            { label: "種牡馬", board: selected.slice(0, 16) },
            { label: "繁殖牝馬", board: selected.slice(16, 32) },
          ] };
      },
      goHome() {
        window.Dabimas.workspaceSync.goHome().catch(() => {
          this.error = "ホームを開けませんでした。もう一度お試しください。";
        });
      },
      // 画面は3代ぶんあって1画面に収まらないので、見えている範囲ではなく
      // 画面まるごとの全高を撮る。血統表の撮影（ui-viewport.js）と違い、
      // 実画面のレイアウトは触らない。html2canvas は複製した DOM を描くので、
      // onclone でその複製だけスクロール枠を外せば、画面はちらつかない。
      // 上のバーごと撮るのは、題名（配合理論補助）を画像に残すため。
      // バーのボタンは data-html2canvas-ignore で写らない。
      async captureScreen() {
        if (this.capturing) return;
        this.capturing = true;
        this.error = "";
        try {
          var html2canvas = await this.$root.loadHtml2Canvas();
          var page = this.$el.querySelector(".assist-page");
          var bar = this.$el.querySelector(".assist-bar");
          var width = Math.ceil(page.scrollWidth);
          var height = Math.ceil(bar.getBoundingClientRect().height) + Math.ceil(page.scrollHeight);
          var canvas = await html2canvas(this.$el, {
            // ダークのときに白地で抜けないよう、実際の地の色をそのまま使う。
            backgroundColor: window.getComputedStyle(this.$el).backgroundColor,
            scale: Math.min(window.devicePixelRatio || 1, 3),
            width: width,
            height: height,
            windowWidth: Math.max(document.documentElement.clientWidth, width),
            windowHeight: height + 64,
            scrollX: 0,
            scrollY: 0,
            ignoreElements: (element) => element.hasAttribute("data-html2canvas-ignore"),
            onclone: (doc) => {
              var screen = doc.querySelector(".assist-screen");
              if (screen) {
                screen.style.height = "auto";
                screen.style.overflow = "visible";
              }
              var scroll = doc.querySelector(".assist-scroll");
              if (scroll) {
                scroll.style.height = "auto";
                scroll.style.overflow = "visible";
                scroll.style.flex = "none";
              }
              // 下部の説明文は sticky。全高で撮ると本文に重なるので普通の流れに戻す。
              var foot = doc.querySelector(".assist-foot");
              if (foot) {
                foot.style.position = "static";
                foot.style.backdropFilter = "none";
              }
            },
          });
          var blob = await this.$root.canvasToPngBlob(canvas);
          if (!blob) throw new Error("Failed to create screenshot blob");
          await this.$root.saveScreenshotBlob(blob, this.$root.buildScreenshotFileName());
        } catch (error) {
          // 共有シートを閉じただけ（AbortError）は失敗ではない。
          if (!error || error.name !== "AbortError") {
            this.error = "画像を保存できませんでした。もう一度お試しください。";
          }
        } finally {
          this.capturing = false;
        }
      },
    },
    template: `
      <div class="assist-screen">
        <header class="dabimas-appbar assist-bar">
          <button type="button" class="assist-bar-back" aria-label="ホームへ戻る"
            data-html2canvas-ignore @click="goHome"><span class="mdi mdi-arrow-left"></span></button>
          <span class="dabimas-appbar-title">配合理論補助</span>
          <v-btn text small class="assist-shot" data-html2canvas-ignore
            :loading="capturing" :disabled="busy || capturing" @click="captureScreen"
          ><v-icon left small>mdi-camera</v-icon>画像を保存</v-btn>
        </header>
        <div class="assist-scroll">
        <div class="assist-page">
          <p class="assist-lead">繁殖牝馬を起点に、代ごとに種牡馬を選び、その組み合わせで成立する配合理論を確認する画面です。</p>
          <v-alert v-if="error" dense outlined type="error" role="alert">{{ error }}</v-alert>
          <section v-for="step in steps" :key="step.stepNo" class="assist-gen"
            :class="['assist-gen--' + step.stepNo, { 'is-locked': step.stepNo > 1 && !step.mareLines }]">
            <div class="assist-gen-head"><span>STEP {{ step.stepNo }}</span>{{ step.stepNo }}代目
              <i v-if="step.result" class="assist-gen-theory" :class="theoryClass(step.result)"
                role="img" :aria-label="theoryName(step.result)" :title="theoryName(step.result)"></i>
            </div>
            <div class="assist-gen-body">
              <template v-if="step.mareLines">
                <div class="assist-horse">
                  <div class="assist-role">{{ step.stepNo === 1 ? '繁殖牝馬' : '繁殖牝馬（' + (step.stepNo - 1) + '代目の産駒）' }}</div>
                  <div class="assist-horse-name">
                    <b>{{ step.stepNo === 1 ? horseName(baseMare) : step.mareLabel }}</b>
                    <span v-if="step.stepNo > 1" class="assist-virtual">仮想</span>
                    <v-btn v-if="step.stepNo > 1" text x-small class="assist-reselect"
                      @click="openPedigree(step)">血統表を見る</v-btn>
                    <span v-else-if="baseMare.rare" class="assist-rare">{{ baseMare.rare }}</span>
                    <v-btn v-if="step.stepNo === 1" text x-small class="assist-reselect" :disabled="busy" @click="openPicker(0)">選び直す</v-btn>
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
                      <v-btn text x-small class="assist-reselect" :disabled="busy" @click="openPicker(step.stepNo)">選び直す</v-btn>
                    </div>
                    <div class="assist-horse-meta">{{ step.sire.son }}　種牡馬</div>
                    <div v-if="factorBadges(step.sire).length" class="assist-horse-factors">
                      <span v-for="factor in factorBadges(step.sire)" :key="factor.key" :class="['exp-option-factor-badge', factor.className]">{{ factor.text }}</span>
                    </div>
                    <div class="assist-lines">
                      <div v-for="kind in ['omoshiro', 'migoto']" :key="kind" class="assist-line-row">
                        <span class="assist-line-label" :class="{ 'is-migoto': kind === 'migoto' }">{{ kind === 'omoshiro' ? '面白' : '見事' }}</span>
                        <span v-for="(code, index) in step.sireLines[kind]" :key="index" class="assist-line-code">{{ code || 'ー' }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="assist-result" aria-live="polite">
                    <div class="assist-result-bar">
                      <v-btn text x-small class="assist-reselect" data-html2canvas-ignore
                        @click="openResult(step)">配合結果を見る</v-btn>
                    </div>
                    <assist-factor-table :diagnosis="step.diagnosis"></assist-factor-table>
                    <div class="assist-cross">
                      <button type="button" class="assist-cross-toggle" :aria-expanded="String(step.crossOpen)"
                        @click="step.crossOpen = !step.crossOpen"
                      ><span class="assist-cross-caret">{{ step.crossOpen ? '▲' : '▼' }}</span>クロスの詳細（{{ step.diagnosis.crosses.length }}件）</button>
                      <ul v-if="step.crossOpen" class="assist-cross-list">
                        <li v-if="!step.diagnosis.crosses.length">クロスなし</li>
                        <li v-for="(cross, index) in step.diagnosis.crosses" :key="index">
                          {{ cross.name }}
                          {{ cross.generations.join(' × ') }}
                          <strong v-if="cross.bloodVolume >= 50000">危険</strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                </template>
                <v-btn v-else block depressed class="assist-pick" :disabled="busy" @click="openPicker(step.stepNo)">＋ 種牡馬を選ぶ</v-btn>
              </template>
              <v-btn v-else-if="step.stepNo === 1" block depressed class="assist-pick" :disabled="busy" @click="openPicker(0)">＋ 繁殖牝馬を選ぶ</v-btn>
              <div v-else class="assist-waiting">{{ step.stepNo - 1 }}代目の種牡馬を選ぶと使えるようになります</div>
            </div>
          </section>
          <assist-pedigree-dialog v-model="pedigreeDialog.open"
            :title="pedigreeDialog.title" :note="pedigreeDialog.note"
            :sections="pedigreeDialog.sections"
            data-html2canvas-ignore></assist-pedigree-dialog>
          <footer class="assist-foot">1代目で選んだ種牡馬と繁殖牝馬から生まれる産駒が、そのまま2代目の繁殖牝馬になります。前の代を変えると、後ろの代は組み直しになります。</footer>
        </div>
        </div>
      </div>
    `,
  };
  window.Dabimas.components.AssistScreen = AssistScreen;
  Vue.component("assist-screen", AssistScreen);
})(window, window.Vue);
