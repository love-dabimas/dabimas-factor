/**
 * このコンポーネントの役割:
 * - 工程診断の結果（vue/logic/plan/plan-diagnosis.js の戻り値）を、血統表と
 *   同じ画面の下部シートに表示する。別画面は作らない（仕様 §6.3）。
 * - 最終工程の理論と、途中工程の危険件数を別項目として並べる（仕様 §9.3）。
 * - 左上の種牡馬を自分で組んだときは、「繁殖牝馬側の工程」と「種牡馬側の工程」を
 *   分けて並べる。
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

  function isUnknownStep(step) {
    return step.status !== "danger" && step.status !== "safe";
  }

  // 判定できなかった工程も数えて出す。危険が 0 でも判定不能があれば
  // 「危険なし」とは書かない（自動診断でまとめだけ見て安心しないように）。
  function intermediateText(steps) {
    // 最後の工程が最終工程（plan-diagnosis.js の buildDiagnosisSummary と同じ数え方）。
    var intermediate = steps.slice(0, -1);
    var dangerCount = intermediate.filter(function (step) {
      return step.status === "danger";
    }).length;
    var unknownCount = intermediate.filter(isUnknownStep).length;
    var parts = [];
    if (dangerCount > 0) parts.push("危険 " + dangerCount + "件");
    if (unknownCount > 0) parts.push("判定不能 " + unknownCount + "件");
    return parts.length > 0 ? parts.join("・") : "危険なし";
  }

  function planHeading(planDepth, baseMareName) {
    return planDepth + "工程の計画（基礎繁殖牝馬: " + (baseMareName || "指定なし") + "）";
  }

  function finalStepText(steps) {
    var finalStep = steps.length > 0 ? steps[steps.length - 1] : null;
    if (!finalStep || isUnknownStep(finalStep)) return "判定不能";
    return finalStep.status === "danger" ? "危険な配合" : "危険なし";
  }

  var PlanDiagnosisPanel = {
    name: "plan-diagnosis-panel",
    props: {
      value: { type: Boolean, default: false },
      result: { type: Object, default: null },
      // 血統表のセルに ⚠ が付いた自己重複（同一実馬 variant）の件数。
      // 工程ごとの判定ではないので、工程一覧とは別にサマリーへ出す。
      selfAncestorWarningCount: { type: Number, default: 0 },
    },
    computed: {
      steps: function () {
        return this.result ? this.result.steps : [];
      },
      sireSide: function () {
        return this.result ? this.result.sireSide || null : null;
      },
      sireSideSummaryLines: function () {
        var side = this.sireSide;
        if (!side) {
          return [];
        }
        return [
          planHeading(side.planDepth, side.baseMareName),
          "途中工程：" + intermediateText(side.steps),
          "種牡馬が生まれる工程：" + finalStepText(side.steps),
        ];
      },
      summaryLines: function () {
        if (!this.result) {
          return [];
        }
        var summary = this.result.summary;
        var finalTheory = theoryName(summary.finalDisplayedTheory);
        var lines = [
          planHeading(this.result.planDepth, this.result.baseMareName),
          "最終理論：" + (finalTheory || "理論なし"),
          "途中工程：" + intermediateText(this.result.steps),
          "最終工程：" + finalStepText(this.result.steps),
        ];
        if (this.selfAncestorWarningCount > 0) {
          lines.push(
            "血統内の自己重複：" + this.selfAncestorWarningCount + "件（⚠のセル）"
          );
        }
        return lines;
      },
    },
    methods: {
      stepHeading: function (step) {
        return "工程" + step.stepNo + "　" + step.mareLabel + " × " + step.sireName + (step.sireSubName || "");
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
          <div v-if="sireSide" class="plan-diagnosis-section-title">繁殖牝馬側の工程</div>
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

          <template v-if="sireSide">
            <div class="plan-diagnosis-section-title">種牡馬側の工程</div>
            <div
              v-for="line in sireSideSummaryLines"
              :key="'sire-' + line"
              class="plan-diagnosis-panel-summary"
            >{{ line }}</div>
            <div
              v-for="step in sireSide.steps"
              :key="'sire-step-' + step.stepNo"
              :class="stepClass(step)"
            >
              <div class="plan-diagnosis-step-heading">{{ stepHeading(step) }}</div>
              <div class="plan-diagnosis-step-result">{{ stepResultText(step) }}</div>
            </div>
          </template>

          <v-btn text block class="mt-2" @click="$emit('input', false)">閉じる</v-btn>
        </v-sheet>
      </v-bottom-sheet>
    `,
  };

  window.Dabimas.components.PlanDiagnosisPanel = PlanDiagnosisPanel;
  Vue.component("plan-diagnosis-panel", PlanDiagnosisPanel);
})(window, window.Vue);
