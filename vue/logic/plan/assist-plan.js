// 種牡馬の選択から前へ進める3代の計画。仮想産駒は盤面だけを保持する。
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.plan = window.Dabimas.logic.plan || {};

  var STEP_COUNT = 3;
  var plan = window.Dabimas.logic.plan;

  function createAssistPlan(input) {
    var theory = window.Dabimas.logic.theory;
    var mareBoards = new Array(STEP_COUNT).fill(null);
    var steps = [];
    for (var i = 0; i < STEP_COUNT; i += 1) {
      steps.push({ stepNo: i + 1, mareLabel: null, mareLines: null, sire: null, sireLines: null, result: null, diagnosis: null, crossOpen: false });
    }
    mareBoards[0] = plan.expandHorseBoard(input.baseMare, input.brosData);
    steps[0].mareLabel = input.baseMare.name;
    steps[0].mareLines = theory.prepareMareLines(mareBoards[0]);

    function stepIndex(stepNo) {
      if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > STEP_COUNT) {
        throw new RangeError("工程番号が範囲外です: " + stepNo);
      }
      return stepNo - 1;
    }

    function isSelectable(stepNo) {
      return Number.isInteger(stepNo) && stepNo >= 1 && stepNo <= STEP_COUNT &&
        mareBoards[stepNo - 1] !== null;
    }

    function clearSire(stepNo) {
      var index = stepIndex(stepNo);
      steps[index].sire = null;
      steps[index].sireLines = null;
      steps[index].result = null;
      steps[index].diagnosis = null;
      steps[index].crossOpen = false;
      for (var later = index + 1; later < STEP_COUNT; later += 1) {
        mareBoards[later] = null;
        steps[later].mareLabel = null;
        steps[later].mareLines = null;
        steps[later].sire = null;
        steps[later].sireLines = null;
        steps[later].result = null;
        steps[later].diagnosis = null;
        steps[later].crossOpen = false;
      }
    }

    function selectSire(stepNo, sireDetail) {
      var index = stepIndex(stepNo);
      if (!isSelectable(stepNo)) throw new Error("前工程の種牡馬を選択してください");
      var sireBoard = plan.expandHorseBoard(sireDetail, input.brosData);
      var sireLines = theory.prepareSireOperands(sireBoard);
      var diagnosis = plan.diagnoseStep(sireBoard, mareBoards[index], input);
      var dam = steps[index].mareLines;
      var matched = theory.detectMatchedTheories([sireLines.omoshiro, sireLines.migoto],
        [dam, dam], diagnosis);
      var result = { matched: matched, displayed: theory.selectDisplayedTheory(matched,
        window.Dabimas.constants.breedingTheories.PRIORITY) };
      var label = stepNo + "代目配合の繁殖牝馬";
      var nextBoard = index + 1 < STEP_COUNT
        ? plan.composeVirtualMareBoard(sireBoard, mareBoards[index],
          null, label)
        : null;

      clearSire(stepNo);
      steps[index].sire = sireDetail;
      steps[index].sireLines = sireLines;
      steps[index].result = result;
      steps[index].diagnosis = diagnosis;
      if (nextBoard) {
        mareBoards[index + 1] = nextBoard;
        steps[index + 1].mareLabel = label;
        steps[index + 1].mareLines = theory.prepareMareLines(nextBoard);
      }
    }

    function mareLinesFor(stepNo) {
      return steps[stepIndex(stepNo)].mareLines;
    }

    return { steps: steps, selectSire: selectSire, clearSire: clearSire,
      mareLinesFor: mareLinesFor, mareBoardFor: function (stepNo) { return mareBoards[stepIndex(stepNo)]; },
      isSelectable: isSelectable };
  }

  plan.createAssistPlan = createAssistPlan;
})(window);
