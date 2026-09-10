const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
global.window = {
  Dabimas: {
    logic: {
      factor: { factorMap: new Map() },
      pedigree: {
        DESCENDANT_SLOTS: [1, 2, 4, 8, 9, 5, 10, 11, 3, 6, 12, 13, 7, 14, 15],
        getCellIdQue: (cellNo) => [cellNo],
        isEven: (value) => value === 1 || (value > 0 && value % 2 === 0),
        replaceHalfToFull: (value) => value,
      },
    },
    constants: {},
    app: { methods: {} },
  },
};
global.Vue = {};

require(path.join(ROOT, "vue/logic/horses/saved-horse-builder.js"));
require(path.join(ROOT, "vue/logic/plan/plan-diagnosis.js"));
require(path.join(ROOT, "vue/app/methods/pedigree-cells.js"));

const horses = window.Dabimas.logic.horses;
const plan = window.Dabimas.logic.plan;

const cells = {
  selected: new Array(32).fill(null),
  category: new Array(32).fill(null),
  horses: [],
  stallions: [],
  broodmares: [],
  factorCd: Array.from({ length: 32 }, () => ["00", "00", "00"]),
  $set(target, key, value) { target[key] = value; },
};
Object.assign(cells, window.Dabimas.app.methods);
Object.assign(cells, {
  setFactorName() {},
  setFactorCd(row, col, value) { this.factorCd[row][col] = value; },
  setFactorCss() {},
  setParentLine() {},
  judgeSetParentLine(value) { return value; },
  fillInFactorCells() { return ""; },
});
cells.setPedigree(0, 8, [{
  name: "パーソロン1971",
  subName: "",
  parentLine: "ヘロド系",
  son: "マイバブー系",
  factors: ["", "", ""],
}]);
for (const index of [0, 1, 2, 4, 8]) {
  assert.equal(cells.selected[index].son, "マイバブー系", `cell ${index}`);
  assert.equal(cells.category[index], "マイバブー系", `category ${index}`);
}

const legacy = {
  son: "",
  descendants: [
    { son: "" },
    { son: "マイバブー系" },
    { son: "" },
    { son: "" },
  ],
};
const repaired = horses.fillMissingSon(legacy);
assert.equal(repaired, legacy, "読込み時の補完は同じレコードを使う");
assert.equal(repaired.son, "マイバブー系", "本体の子系統を父方から復元する");
assert.equal(repaired.descendants[0].son, "マイバブー系", "父セルの子系統を復元する");
const reread = horses.fillMissingSon(JSON.parse(JSON.stringify(legacy)));
assert.equal(reread.son, "マイバブー系", "再読込みでも復元結果が変わらない");

const selected = new Array(32).fill(null);
selected[16] = {
  name: "☆自家製繁殖牝馬",
  selfSelected: true,
  identityRef: { kind: "custom", id: "custom-mare" },
};
selected[17] = {
  name: "工程1種牡馬",
  placeholderMareRef: { kind: "master", nodeId: "base-mare" },
};

const resolver = {
  parentsOf(ref) {
    if (ref && ref.kind === "custom" && ref.id === "custom-mare") {
      return {
        father: { kind: "master", nodeId: "sire" },
        mother: { kind: "master", nodeId: "base-mare" },
      };
    }
    return null;
  },
};

const detected = plan.detectPlan(selected, resolver);
assert.equal(detected.planDepth, 2, "自家製牝馬を作る配合を1工程追加する");
assert.deepEqual(detected.baseMareRef, { kind: "master", nodeId: "base-mare" });
assert.equal(plan.detectPlan(selected).planDepth, 1, "resolver なしは従来どおり");

console.log("OK: 自家製馬の子系統と工程診断の回帰テストが通りました");
