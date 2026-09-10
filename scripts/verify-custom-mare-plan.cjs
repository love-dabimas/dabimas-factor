const {
  assert, horses, pedigree, table, plain, judge, run, window, bros, exceptions, board,
} = require("./verify-p2d-common.cjs");

for (const file of [
  "constants/pedigree-indexes",
  "constants/breeding-theories",
  "logic/theory/compatibility",
  "logic/plan/plan-diagnosis",
]) {
  run("vue/" + file + ".js");
}

const find = (name, subName) => {
  const horse = horses.find(
    (item) => item.name === name && item.subName === (subName || "")
  );
  assert.ok(horse, name + " " + (subName || ""));
  return horse;
};
const firstSire = find("ドリームジャーニー", "央瓏");
const finalSire = find("ドリームジャーニー", "翔天");
const baseMare = find("メゾンフォルティー");
const customMare = window.Dabimas.logic.horses.buildSavedHorseRecord(
  "broodmare",
  "ドリームジャーニー産駒",
  board(firstSire, baseMare)
);
customMare.source = "custom";

const selected = board(finalSire, customMare);
selected[0].selfSelected = true;
selected[16].selfSelected = true;
const resolver = pedigree.buildIdentityResolver({
  nodeTable: table,
  customRecordsById: { [customMare.id]: customMare },
});
const byNodeId = new Map(horses.map((horse) => [horse.nodeId, horse]));
const diagnosis = window.Dabimas.logic.plan.diagnoseBreedingPlan({
  selected,
  brosData: bros,
  nodeTable: table,
  resolver,
  inbreedExceptions: exceptions,
  resolveHorse: (entry) => byNodeId.get(entry?.nodeId) || null,
  resolveMareByRef: (ref) =>
    ref?.kind === "master" ? byNodeId.get(ref.nodeId) || null : null,
});

assert.equal(diagnosis.planDepth, 2);
assert.equal(diagnosis.baseMareName, "メゾンフォルティー");
assert.deepEqual(
  plain(diagnosis.steps.map(({ status, displayedTheory, matchedTheories, sireIndex }) => ({
    status, displayedTheory, matchedTheories, sireIndex,
  }))),
  [
    {
      status: "safe",
      displayedTheory: "PERFECT",
      matchedTheories: ["INTERESTING", "WONDERFUL", "PERFECT"],
      sireIndex: 17,
    },
    {
      status: "danger",
      displayedTheory: "DANGEROUS",
      matchedTheories: ["DANGEROUS"],
      sireIndex: 0,
    },
  ]
);
assert.deepEqual(
  plain({
    totalDangerCount: diagnosis.summary.totalDangerCount,
    intermediateDangerCount: diagnosis.summary.intermediateDangerCount,
    finalStepDanger: diagnosis.summary.finalStepDanger,
    dangerStepNumbers: diagnosis.summary.dangerStepNumbers,
    dangerCellIndexes: diagnosis.summary.dangerCellIndexes,
    unknownCount: diagnosis.summary.unknownCount,
  }),
  {
    totalDangerCount: 1,
    intermediateDangerCount: 0,
    finalStepDanger: true,
    dangerStepNumbers: [2],
    dangerCellIndexes: [0],
    unknownCount: 0,
  }
);

// runPlanDiagnosis の配線をそのまま通す。resolveMareByRef をテスト側で自作すると、
// 実アプリで maresByRef が空のままでも通ってしまう（一度これを見落とした）。
run("vue/app/methods/plan-diagnosis-ui.js");
const summaryOf = (horse) => ({
  id: horse.id, nodeId: horse.nodeId ?? null, name: horse.name,
  subName: horse.subName || "", sex: horse.sex, parentLine: horse.parentLine || "",
  son: horse.son || "", factors: horse.factors, source: "base",
});
const app = {
  selected, brosData: bros, inbreedExceptions: exceptions,
  identityResolver: resolver,
  horsesBase: horses.map(summaryOf),
  customHorseDetails: { [customMare.id]: customMare },
  planDiagnosisRunning: false, planDiagnosis: null, planDiagnosisPanelVisible: false,
};
// horse-loading.js の本物の ensureHorseDetail は fetch を使うので、
// methods を載せたあとで差し替える（先に置くと Object.assign に潰される）。
Object.assign(app, window.Dabimas.app.methods, {
  findSummaryHorse(horse) {
    return this.horsesBase.find((item) => item.name === horse.name && item.sex === horse.sex) || null;
  },
  // hydrateHorseWithDetail と同じく identityRef は付けない。
  ensureHorseDetail(entry) {
    if (Array.isArray(entry.descendants) && entry.descendants.length === 15) {
      return Promise.resolve(entry);
    }
    const full = horses.find(
      (item) => item.name === entry.name && (item.subName || "") === (entry.subName || "")
    );
    return full ? Promise.resolve({ ...entry, descendants: full.descendants, mares: full.mares })
      : Promise.reject(new Error("detail not found"));
  },
});
window.Dabimas.pedigreeNodes = table;

app.runPlanDiagnosis().then(() => {
  assert.equal(app.planDiagnosis.planDepth, 2, "実配線でも2工程");
  assert.equal(
    app.planDiagnosis.baseMareName,
    "メゾンフォルティー",
    "基礎繁殖牝馬が ref から解決されてパネル見出しに出る"
  );
  assert.equal(app.planDiagnosis.steps[0].displayedTheory, "PERFECT");
  console.log("OK: runPlanDiagnosis の配線でも基礎繁殖牝馬が解決される");
});

const ordinary = board(finalSire, baseMare);
ordinary[0].selfSelected = true;
ordinary[16].selfSelected = true;
const ordinaryDiagnosis = window.Dabimas.logic.plan.diagnoseBreedingPlan({
  selected: ordinary,
  brosData: bros,
  nodeTable: table,
  resolver,
  inbreedExceptions: exceptions,
  resolveHorse: (entry) => byNodeId.get(entry?.nodeId) || null,
  resolveMare: (name) => horses.find((horse) => horse.name === name && horse.sex === "1") || null,
});
assert.equal(ordinaryDiagnosis.planDepth, 1);
assert.equal(ordinaryDiagnosis.steps[0].displayedTheory, "PERFECT");
assert.equal(ordinaryDiagnosis.summary.totalDangerCount, 0);

console.log("OK: 自家製繁殖牝馬は2工程、DB繁殖牝馬は従来どおり1工程");
