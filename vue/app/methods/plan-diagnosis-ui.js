/**
 * このファイルの役割:
 * - 工程診断の入口 runPlanDiagnosis（判定に要る馬の detail を先に揃えて
 *   vue/logic/plan/plan-diagnosis.js を1回だけ呼ぶ）。
 * - 血統表が変わるたびに工程診断を自動で走らせる段取り（schedulePlanAutoDiagnosis /
 *   runPlanAutoDiagnosis）。設定「工程診断を自動で行う」がオフなら何もしない。
 * - 結果パネルの開閉。自動で開くのは、新しく危険が見つかったときだけ。
 *
 * このファイルに置かない処理:
 * - 工程の切り出し・クロス判定・理論判定（vue/logic/plan/plan-diagnosis.js の仕事）。
 * - ボタン状態の算出（vue/app/app-computed.js の planDiagnosis* computed の仕事）。
 *
 * 診断結果の無効化について:
 * - 結果は診断時の snapshotHash を持ち、computed 側で現在の血統表のハッシュと
 *   突き合わせる。種牡馬・繁殖牝馬・血統セルのどれが変わってもハッシュがずれるので、
 *   古い結果と ⚠ はその時点で画面から消える（仕様 §13）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // 血統表が変わってから自動診断を始めるまでの待ち時間。
  var PLAN_AUTO_DELAY_MS = 150;

  Object.assign(window.Dabimas.app.methods, {
        // 馬1頭を hydrate 済みマップで引くためのキー。
        planHorseKey: function (horse) {
          if (!horse) {
            return "";
          }
          return [horse.nodeId || "", horse.name || "", horse.subName || ""].join("|");
        },

        // 工程診断（呼ぶたびに 1 回だけ全工程を判定する）。結果は planDiagnosis に
        // 入れて返す。判定できなかったとき・途中で血統表が変わったときは null を返す。
        runPlanDiagnosis: async function () {
          const planLogic = window.Dabimas.logic.plan;

          if (this.planDiagnosisRunning) {
            return null;
          }
          if (!planLogic.isPedigreeTableComplete(this.selected)) {
            this.planDiagnosis = null;
            this.planDiagnosisPanelVisible = false;
            return null;
          }

          this.planDiagnosisRunning = true;
          const snapshotHash = planLogic.createSnapshotHash(this.selected);

          try {
            const detected = planLogic.detectPlan(
              this.selected,
              this.identityResolver
            );
            const horsesByKey = new Map();
            const maresByName = new Map();
            const maresByRef = new Map();
            const refKey = (ref) =>
              this.identityResolver?.identityKey(ref) || "";

            const targets = detected.steps.map((step) => this.selected[step.sireIndex]);
            if (detected.baseMareRef?.kind === "custom") {
              targets.push(
                this.customHorseDetails[detected.baseMareRef.id] || null
              );
            } else if (detected.baseMareRef?.kind === "master") {
              targets.push(
                (this.horsesBase || []).find(
                  (horse) =>
                    horse.nodeId === detected.baseMareRef.nodeId &&
                    horse.sex === "1"
                ) || null
              );
            }
            if (detected.baseMareName) {
              targets.push(
                this.findSummaryHorse({ name: detected.baseMareName, sex: "1" })
              );
            }

            await Promise.all(
              targets.map(async (entry) => {
                if (!entry) {
                  return;
                }
                try {
                  const detail = await this.ensureHorseDetail(entry);
                  if (
                    detail &&
                    Array.isArray(detail.descendants) &&
                    detail.descendants.length === 15
                  ) {
                    horsesByKey.set(this.planHorseKey(entry), detail);
                    if (detail.sex === "1") {
                      maresByName.set(detail.name, detail);
                      // summary 由来の馬（horsesBase）も hydrate 後の detail も
                      // identityRef を持たない。nodeId から組み立てないと master の
                      // 基礎繁殖牝馬が maresByRef に載らない。
                      const detailRef =
                        window.Dabimas.logic.pedigree.createIdentityRef(detail);
                      if (detailRef && detailRef.kind !== "unknown") {
                        maresByRef.set(refKey(detailRef), detail);
                      }
                    }
                  }
                } catch (error) {
                  // 判定不能として扱う。診断そのものは止めない（仕様 §15.1）。
                  if (window.Dabimas.debug) {
                    console.warn("plan diagnosis detail load failed", entry, error);
                  }
                }
              })
            );

            // 詳細取得の間に選択が変わっていたら、その結果は表示しない（仕様 §13.2）。
            if (planLogic.createSnapshotHash(this.selected) !== snapshotHash) {
              return null;
            }

            const result = planLogic.diagnoseBreedingPlan({
              selected: this.selected,
              brosData: this.brosData,
              nodeTable: window.Dabimas.pedigreeNodes || null,
              resolver: this.identityResolver,
              inbreedExceptions: this.inbreedExceptions,
              resolveHorse: (entry) =>
                entry ? horsesByKey.get(this.planHorseKey(entry)) || null : null,
              resolveMare: (name) => maresByName.get(name) || null,
              resolveMareByRef: (ref) => maresByRef.get(refKey(ref)) || null,
            });

            if (result.status !== "completed") {
              this.planDiagnosis = null;
              this.planDiagnosisPanelVisible = false;
              return null;
            }

            this.planDiagnosis = result;
            return result;
          } finally {
            this.planDiagnosisRunning = false;
          }
        },

        // 血統表が変わったら、少し待ってから 1 回だけ自動診断する。保存した配合の
        // 呼び出しなどで何十マスもまとめて変わるときに、判定を 1 回にまとめるため。
        schedulePlanAutoDiagnosis: function () {
          if (this.planAutoTimer) {
            clearTimeout(this.planAutoTimer);
            this.planAutoTimer = null;
          }
          if (!this.planAutoDiagnosis) {
            return;
          }
          this.planAutoTimer = setTimeout(() => {
            this.planAutoTimer = null;
            this.runPlanAutoDiagnosis();
          }, PLAN_AUTO_DELAY_MS);
        },

        runPlanAutoDiagnosis: async function () {
          if (!this.planAutoDiagnosis) {
            return;
          }
          if (this.planDiagnosisRunning) {
            // 走っている診断が終わったら、最新の血統表でやり直す。
            this.planAutoRerunPending = true;
            return;
          }
          const isBaseline = this.planAutoBaselinePending;
          this.planAutoBaselinePending = false;
          if (!window.Dabimas.logic.plan.isPedigreeTableComplete(this.selected)) {
            return;
          }

          const startedHash = this.planCurrentSnapshotHash;
          const result = await this.runPlanDiagnosis();
          if (this.planAutoRerunPending || this.planCurrentSnapshotHash !== startedHash) {
            this.planAutoRerunPending = false;
            this.schedulePlanAutoDiagnosis();
            return;
          }
          if (!result) {
            return;
          }

          const current = this.warningCellIndexes.slice();
          const previous = this.planLastWarningCellIndexes;
          this.planLastWarningCellIndexes = current;
          if (isBaseline) {
            return;
          }
          // 前回は無かった ⚠ が 1 つでもあれば、新しく危険が見つかったとみなす。
          // 同じ危険が残っているだけなら開かない（直している途中に何度も開かないように）。
          if (current.some((index) => previous.indexOf(index) === -1)) {
            this.planDiagnosisPanelVisible = true;
          }
        },

        // 配合を開いた直後・保存した配合を呼び出した直後に呼ぶ。次の自動診断では
        // 結果パネルを開かず、その時点の ⚠ を比較の起点として覚えるだけにする。
        resetPlanAutoBaseline: function () {
          this.planAutoBaselinePending = true;
          this.planLastWarningCellIndexes = [];
        },

        // 「理論」のマスを押したとき。自動診断の結果があるときだけ開く。
        openPlanDiagnosisPanel: function () {
          if (!this.planAutoDiagnosis || !this.planDiagnosisResult) {
            return;
          }
          this.planDiagnosisPanelVisible = true;
        },

        closePlanDiagnosisPanel: function () {
          this.planDiagnosisPanelVisible = false;
        },
  });
})(window);
