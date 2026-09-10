/**
 * 工程診断で「判定不能：種牡馬の血統データが足りません」になっていた2つの穴の回帰テスト。
 *
 *   node scripts/verify-plan-sire-resolution.cjs
 *
 * 1. 母側へ牝馬を置いたセルの父は subName が "(牝馬名)" に差し替わるため、
 *    名前＋馬名補足では summary を引けない（nodeId で引けば分かる）。
 * 2. 種牡馬側①の ★N薄め はマスターに無い合成馬だが、種牡馬側の16マスが
 *    そのままその馬の5代血統なので、通常判定に使える。
 *
 * あわせて、1 を直すと "(牝馬名)" 付きの馬が expandHorseBoard へ渡り、
 * getCellIdQue がセル0を積み続けて戻ってこなくなる問題も踏む。
 */
const {
  assert, horses, pedigree, table, run, window, bros, exceptions, plain,
} = require("./verify-p2d-common.cjs");

for (const file of [
  "constants/factor-definitions", "constants/parent-lines", "constants/pedigree-indexes",
  "constants/breeding-theories", "logic/factor/factor-map", "logic/factor/factor-counts",
  "logic/pedigree/pedigree-css", "logic/theory/compatibility", "logic/plan/plan-diagnosis",
]) {
  run("vue/" + file + ".js");
}
run("vue/app/methods/pedigree-cells.js");

const plan = window.Dabimas.logic.plan;
const find = (name, subName) => {
  const horse = horses.find(
    (item) => item.name === name && item.subName === (subName || "")
  );
  assert.ok(horse, name + " " + (subName || ""));
  return horse;
};

function makeApp() {
  const app = {
    selected: new Array(32).fill(null), category: new Array(32).fill(null),
    horses: [], stallions: [], broodmares: [],
    factorName: new Array(32).fill(null), factorCd: new Array(32).fill(null),
    styleFactorClasses: new Array(32).fill(null), parentLines: new Array(32).fill(null),
    styleParentLineClasses: new Array(32).fill(null),
    $set(target, key, value) { target[key] = value; },
  };
  Object.assign(app, window.Dabimas.app.methods);
  return app;
}
const place = (app, side, cell, horse) =>
  app.setPedigree(side, cell, pedigree.setDataForPedigree(String(horse.sex), cell, horse, bros));

const customRecords = {};
const makeResolver = () => pedigree.buildIdentityResolver({
  nodeTable: table, customRecordsById: customRecords, editRecordsById: new Map(),
  baseHorseNodeIdById: new Map(horses.map((horse) => [horse.id, horse.nodeId])),
});
const saveHorse = (kind, title, cells) => {
  const record = window.Dabimas.logic.horses.buildSavedHorseRecord(
    kind, title, cells, [], { nodeTable: table, resolver: makeResolver() }
  );
  customRecords[record.id] = record;
  return { ...record, source: "custom", customHorseId: record.id,
    identityRef: { kind: "custom", id: record.id } };
};

// ☆ドリメゾ牝馬 = ドリームジャーニー央瓏 × メゾンフォルティー
const first = makeApp();
place(first, 0, 0, find("ドリームジャーニー", "央瓏"));
place(first, 1, 0, find("メゾンフォルティー"));
const customMare = saveHorse("broodmare", "ドリメゾ牝馬", first.selected);

// ☆ドリメゾの次 = ステイゴールド × ☆ドリメゾ牝馬
const second = makeApp();
place(second, 0, 0, find("ステイゴールド"));
place(second, 1, 0, customMare);
const customSire = saveHorse("stallion", "ドリメゾの次", second.selected);

// 種牡馬側②へ種牡馬（①は ★１薄め になる）／母側②へ自家製種牡馬・母側⑩へ自家製牝馬
const app = makeApp();
place(app, 0, 1, find("ディープインパクト"));
place(app, 0, 3, find("スイープトウショウ"));
place(app, 1, 1, customSire);
place(app, 1, 3, customMare);
const selected = app.selected;
assert.ok(plan.isPedigreeTableComplete(selected), "32セルが埋まっていること");
assert.equal(selected[19].subName, "(☆ドリメゾ牝馬)", "母側⑩は牝馬名つきの父セル");
assert.ok(!selected[0].nodeId && !selected[0].id, "種牡馬側①は ★N薄めの合成馬");

// 実アプリと同じく findSummaryHorse で summary を引く。
const lookup = {
  horsesBase: horses,
  findSummaryHorse: window.Dabimas.app.methods.findSummaryHorse,
};
const ensureHorseDetail = (entry) => {
  if (!entry) return null;
  if (Array.isArray(entry.descendants) && entry.descendants.length === 15) return entry;
  const summary = lookup.findSummaryHorse(entry);
  return summary && Array.isArray(summary.descendants) && summary.descendants.length === 15
    ? { ...entry, descendants: summary.descendants, mares: summary.mares }
    : null;
};
const planHorseKey = (horse) =>
  (horse ? [horse.nodeId || "", horse.name || "", horse.subName || ""].join("|") : "");

const detected = plan.detectPlan(selected, makeResolver());
assert.deepEqual(plain(detected.steps.map((step) => step.sireIndex)), [19, 17, 0]);

const horsesByKey = new Map();
for (const step of detected.steps) {
  const detail = ensureHorseDetail(selected[step.sireIndex]);
  if (detail) horsesByKey.set(planHorseKey(selected[step.sireIndex]), detail);
}
assert.ok(
  horsesByKey.has(planHorseKey(selected[19])),
  "牝馬名つきの父セルも nodeId で summary を引ける"
);

const maresByRef = new Map();
if (detected.baseMareRef) {
  const entry = detected.baseMareRef.kind === "custom"
    ? customRecords[detected.baseMareRef.id]
    : horses.find((horse) => horse.nodeId === detected.baseMareRef.nodeId && horse.sex === "1");
  const detail = ensureHorseDetail(entry);
  if (detail) {
    maresByRef.set(
      makeResolver().identityKey(pedigree.createIdentityRef(detail)),
      detail
    );
  }
}

const result = plan.diagnoseBreedingPlan({
  selected, brosData: bros, nodeTable: table, resolver: makeResolver(),
  inbreedExceptions: exceptions,
  resolveHorse: (entry) => (entry ? horsesByKey.get(planHorseKey(entry)) || null : null),
  resolveMare: (name) => horses.find((horse) => horse.name === name && horse.sex === "1") || null,
  resolveMareByRef: (ref) => maresByRef.get(makeResolver().identityKey(ref)) || null,
});

assert.equal(result.planDepth, 3);
assert.equal(result.baseMareName, "メゾンフォルティー");
assert.deepEqual(
  plain(result.steps.map((step) => [step.sireIndex, step.status, step.reasonCode])),
  [[19, "safe", null], [17, "danger", null], [0, "safe", null]],
  "3工程とも判定できる（MISSING_SIRE_DATA が残らない）"
);
assert.equal(result.steps[0].displayedTheory, "PERFECT", "工程1は完璧な配合");

// 最終工程は種牡馬側の盤面をそのまま使うので、盤面自身の判定と一致するはず。
const theory = window.Dabimas.logic.theory;
const cross = window.Dabimas.logic.inbreed.judgeInbreed(
  selected, exceptions, table, makeResolver()
);
const parentLineAt = (index) =>
  (selected[index] && typeof selected[index].parentLine === "string"
    ? selected[index].parentLine : "");
const damLines = [17, 19, 21, 23].map(parentLineAt);
const boardTheories = theory.detectMatchedTheories(
  [[1, 3, 5, 7].map(parentLineAt), [9, 11, 13, 15].map(parentLineAt)],
  [damLines, damLines.slice()],
  {
    sameNameSpecialChecks: cross.sameNameSpecialChecks,
    selected, dangerous: cross.dangerous === true,
  }
);
const finalStep = result.steps[result.steps.length - 1];
assert.deepEqual(
  plain(finalStep.matchedTheories), plain(boardTheories),
  "最終工程の理論が盤面自身の理論と一致する"
);
assert.equal(finalStep.isDangerous, cross.dangerous === true);

console.log("OK: 牝馬名つきの父セルと ★N薄めの種牡馬も工程診断で判定できる");
