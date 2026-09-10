/**
 * このファイルの役割:
 * - 「工程診断」ボタンの入口 runPlanDiagnosis（判定に要る馬の detail を先に揃えて
 *   vue/logic/plan/plan-diagnosis.js を1回だけ呼ぶ）。
 * - 結果パネルの開閉。
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

  Object.assign(window.Dabimas.app.methods, {
        // 馬1頭を hydrate 済みマップで引くためのキー。
        planHorseKey: function (horse) {
          if (!horse) {
            return "";
          }
          return [horse.nodeId || "", horse.name || "", horse.subName || ""].join("|");
        },

        // 工程診断（ボタン押下 1 回につき 1 回だけ全工程を判定する）。
        runPlanDiagnosis: async function () {
          const planLogic = window.Dabimas.logic.plan;

          if (this.planDiagnosisRunning) {
            return;
          }
          if (!planLogic.isPedigreeTableComplete(this.selected)) {
            this.planDiagnosis = null;
            this.planDiagnosisPanelVisible = false;
            return;
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
              return;
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
              return;
            }

            this.planDiagnosis = result;
            this.planDiagnosisPanelVisible = true;
          } finally {
            this.planDiagnosisRunning = false;
          }
        },

        closePlanDiagnosisPanel: function () {
          this.planDiagnosisPanelVisible = false;
        },
  });
})(window);
