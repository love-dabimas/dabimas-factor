/**
 * このコンポーネントの役割:
 * - 工程診断の結果（vue/logic/plan/plan-diagnosis.js の戻り値）を、血統表と
 *   同じ画面の下部シートに表示する。別画面は作らない（仕様 §6.3）。
 * - 最終工程の理論と、途中工程の危険件数を別項目として並べる（仕様 §9.3）。
 *
 * このコンポーネントに置かない処理:
 * - 判定そのもの。ここは受け取った結果を文字にするだけで、危険判定を
 *   やり直さない（仕様 §16.2）。
 * - 血統セルの ⚠ 表示（pedigree-row の仕事）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var REASON_TEXTS = {
    MISSING_SIRE_DATA: "種牡馬の血統データが足りません",
    MISSING_MARE_DATA: "繁殖牝馬の血統データが足りません",
    INCOMPLETE_PEDIGREE: "判定に必要な祖先データが不足しています",
    PREVIOUS_STEP_BLOCKED: "前工程の仮想繁殖牝馬が生成できませんでした",
    EVALUATION_ERROR: "配合理論判定でエラーが発生しました",
  };

  function theoryName(displayedTheory) {
    if (!displayedTheory) {
      return "";
    }
    var names = window.Dabimas.constants.breedingTheories.DISPLAY_NAME;
    return names[displayedTheory] || "";
  }

  var PlanDiagnosisPanel = {
    name: "plan-diagnosis-panel",
    props: {
      value: { type: Boolean, default: false },
      result: { type: Object, default: null },
    },
    computed: {
      steps: function () {
        return this.result ? this.result.steps : [];
      },
      summaryLines: function () {
        if (!this.result) {
          return [];
        }
        var summary = this.result.summary;
        var finalTheory = theoryName(summary.finalDisplayedTheory);
        var lines = [
          this.result.planDepth +
            "工程の計画（基礎繁殖牝馬: " +
            (this.result.baseMareName || "指定なし") +
            "）",
          "最終理論：" + (finalTheory || "理論なし"),
          "途中工程：" +
            (summary.intermediateDangerCount > 0
              ? "危険 " + summary.intermediateDangerCount + "件"
              : "危険なし"),
          "最終工程：" + (summary.finalStepDanger ? "危険な配合" : "危険なし"),
        ];
        if (summary.unknownCount > 0) {
          lines.push("判定不能：" + summary.unknownCount + "件");
        }
        return lines;
      },
    },
    methods: {
      stepHeading: function (step) {
        return "工程" + step.stepNo + "　" + step.mareLabel + " × " + step.sireName;
      },
      stepResultText: function (step) {
        if (step.status === "danger") {
          return "⚠ 危険な配合";
        }
        if (step.status === "safe") {
          var name = theoryName(step.displayedTheory);
          return name ? name + "（危険なし）" : "危険なし";
        }
        return (
          "判定不能：" +
          (REASON_TEXTS[step.reasonCode] || "判定に必要なデータが足りません")
        );
      },
      stepClass: function (step) {
        return ["plan-diagnosis-step", "plan-diagnosis-step--" + step.status];
      },
    },
    template: `
      <v-bottom-sheet :value="value" @input="$emit('input', $event)">
        <v-sheet class="plan-diagnosis-panel">
          <div
            v-for="line in summaryLines"
            :key="line"
            class="plan-diagnosis-panel-summary"
          >{{ line }}</div>

          <div
            v-for="step in steps"
            :key="step.stepNo"
            :class="stepClass(step)"
          >
            <div class="plan-diagnosis-step-heading">{{ stepHeading(step) }}</div>
            <div class="plan-diagnosis-step-result">{{ stepResultText(step) }}</div>
          </div>

          <v-btn text block class="mt-2" @click="$emit('input', false)">閉じる</v-btn>
        </v-sheet>
      </v-bottom-sheet>
    `,
  };

  window.Dabimas.components.PlanDiagnosisPanel = PlanDiagnosisPanel;
  Vue.component("plan-diagnosis-panel", PlanDiagnosisPanel);
})(window, window.Vue);
