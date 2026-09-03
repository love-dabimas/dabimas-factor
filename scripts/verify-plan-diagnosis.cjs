/**
 * 工程診断（vue/logic/plan/plan-diagnosis.js）の検証スクリプト。
 *
 *   node scripts/verify-plan-diagnosis.cjs
 *
 * 確定データ（json/dabimasFactor.json・brosData.json・pedigreeNodes.json）を
 * そのまま使い、代表シナリオ「繁殖牝馬側 ⑤ にアドマイヤグルーヴ／その上の ④ に
 * ガーサント」で工程1が危険な配合になることを確かめる。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

global.window = { Dabimas: { logic: {}, constants: {}, app: { methods: {} } } };
if (typeof global.crypto === "undefined") {
  global.crypto = require("node:crypto").webcrypto;
}

require(path.join(ROOT, "vue/constants/pedigree-indexes.js"));
require(path.join(ROOT, "vue/constants/breeding-theories.js"));
require(path.join(ROOT, "vue/logic/pedigree/pedigree-builder.js"));
require(path.join(ROOT, "vue/logic/pedigree/pedigree-node-table.js"));
require(path.join(ROOT, "vue/logic/theory/compatibility.js"));
require(path.join(ROOT, "vue/logic/inbreed/inbreed-detector.js"));
require(path.join(ROOT, "vue/logic/plan/plan-diagnosis.js"));

const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

const horses = readJson("json/dabimasFactor.json").horseLists;
const brosData = readJson("json/brosData.json").brosData;
const nodeTable = window.Dabimas.logic.pedigree.buildNodeTable(
  readJson("json/pedigreeNodes.json")
);
const rawExceptions = readJson("json/inbreed-exceptions.json");
const inbreedExceptions = Array.isArray(rawExceptions)
  ? rawExceptions
  : rawExceptions.exceptions || [];

const plan = window.Dabimas.logic.plan;
const { setDataForPedigree, getCellIdQue } = window.Dabimas.logic.pedigree;

function findHorse(name, subName) {
  return horses.find(
    (horse) =>
      horse.name === name && (subName === undefined || horse.subName === subName)
  );
}

// 画面の setPedigree（vue/app/methods/pedigree-cells.js）と同じ詰め方をする。
function selectInto(selected, side, cellNo, horse) {
  const list = setDataForPedigree(side, cellNo, horse, brosData);
  const que = getCellIdQue(cellNo, list);
  for (let i = 0; i < que.length; i += 1) {
    const value = list[i];
    const index = que[i] + side * 16;
    if (value && value !== "broodmares") {
      selected[index] = Object.assign({}, value, {
        index,
        selfSelected: i === 0,
      });
    }
  }
}

function resolveHorse(entry) {
  if (!entry) {
    return null;
  }
  if (Array.isArray(entry.descendants) && entry.descendants.length === 15) {
    return entry;
  }
  if (typeof entry.nodeId === "string") {
    const byNode = horses.find((horse) => horse.nodeId === entry.nodeId);
    if (byNode) {
      return byNode;
    }
  }
  return (
    horses.find(
      (horse) => horse.name === entry.name && horse.subName === entry.subName
    ) || horses.find((horse) => horse.name === entry.name) || null
  );
}

function resolveMare(name) {
  return horses.find((horse) => horse.name === name && horse.sex === "1") || null;
}

function diagnose(selected) {
  return plan.diagnoseBreedingPlan({
    selected,
    brosData,
    nodeTable,
    inbreedExceptions,
    resolveHorse,
    resolveMare,
  });
}

function describe(result) {
  return result.steps
    .map(
      (step) =>
        `  工程${step.stepNo} ${step.mareLabel} × ${step.sireName}` +
        ` [cell ${step.sireIndex}] -> ${step.status}` +
        ` (${step.displayedTheory || step.reasonCode || "-"})`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// 代表シナリオ: 繁殖牝馬側 ⑤(cell 31) アドマイヤグルーヴ / ④(cell 23) ガーサント
// ---------------------------------------------------------------------------
const baseBroodmare = horses.find(
  (horse) => horse.sex === "1" && Array.isArray(horse.descendants) && horse.descendants.length === 15
);
const finalSire = findHorse("ディープインパクト") || horses.find((horse) => horse.sex === "0");
const admireGroove = findHorse("アドマイヤグルーヴ");
const gersant = findHorse("ガーサント", "神狂");
const step2Sire = findHorse("アイスカペイド", "1973");
const step3Sire = findHorse("アイアンリージ", "巌瓏");

assert.ok(baseBroodmare, "繁殖牝馬マスターが読み込めていること");
assert.ok(
  admireGroove && gersant && finalSire && step2Sire && step3Sire,
  "検証に使う馬がマスターに存在すること"
);

// 画面での操作順（浅いセルから埋めて、深いセルを後から上書きする）と同じにする。
const selected = new Array(32).fill(null);
selectInto(selected, 0, 0, finalSire);
selectInto(selected, 1, 0, baseBroodmare);
selectInto(selected, 1, 1, step3Sire);
selectInto(selected, 1, 3, step2Sire);
selectInto(selected, 1, 7, gersant);
selectInto(selected, 1, 15, admireGroove);

assert.ok(
  plan.isPedigreeTableComplete(selected),
  "血統表の全馬枠が埋まっていること（32セル）"
);

const detected = plan.detectPlan(selected);
assert.equal(detected.baseDepth, 3, "基礎繁殖牝馬は母母母（深さ3）の位置");
assert.equal(detected.planDepth, 4, "4工程（4代計画）として認識する");
assert.equal(detected.baseCellIndex, 31, "基礎繁殖牝馬のセルは 31");
assert.equal(detected.baseMareName, "アドマイヤグルーヴ", "基礎繁殖牝馬名を復元できる");
assert.deepEqual(
  detected.steps.map((step) => step.sireIndex),
  [23, 19, 17, 0],
  "工程の種牡馬セルは 23 → 19 → 17 → 種牡馬側0"
);

const result = diagnose(selected);
console.log("代表シナリオ:");
console.log(describe(result));
console.log("  summary:", JSON.stringify(result.summary));

assert.equal(result.status, "completed", "診断が完了すること");
assert.equal(result.steps.length, 4, "4工程ぶんの結果が出ること");
assert.equal(result.steps[0].status, "danger", "工程1（アドマイヤグルーヴ×ガーサント）が危険");
assert.equal(result.steps[0].sireIndex, 23, "危険マークはガーサントのセル（23）に出す");
assert.equal(result.steps[0].displayedTheory, "DANGEROUS", "工程1の表示理論は危険");
assert.ok(
  result.summary.dangerCellIndexes.includes(23),
  "dangerCellIndexes にガーサントのセルが入る"
);
assert.ok(
  result.summary.intermediateDangerCount >= 1,
  "途中工程の危険として数えられる"
);

// ---------------------------------------------------------------------------
// 対照シナリオ: ガーサントを置かなければ工程1は危険にならない
// ---------------------------------------------------------------------------
// アドマイヤグルーヴの5代内に出てこない種牡馬なら、工程1は危険にならない。
const safeSelected = new Array(32).fill(null);
selectInto(safeSelected, 0, 0, finalSire);
selectInto(safeSelected, 1, 0, baseBroodmare);
selectInto(safeSelected, 1, 1, step3Sire);
selectInto(safeSelected, 1, 3, step2Sire);
selectInto(safeSelected, 1, 7, findHorse("アイカタカタオモイ"));
selectInto(safeSelected, 1, 15, admireGroove);

const safeResult = diagnose(safeSelected);
console.log("\n対照シナリオ（工程1の種牡馬を差し替え）:");
console.log(describe(safeResult));
assert.equal(safeResult.steps.length, 4, "対照シナリオも4工程");
assert.notEqual(
  safeResult.steps[0].status,
  "danger",
  "血量50%未満の組み合わせを危険にしない"
);

// ---------------------------------------------------------------------------
// 3代計画: 基礎繁殖牝馬を ④(cell 23) に置くと3工程になる
// ---------------------------------------------------------------------------
const threeStep = new Array(32).fill(null);
selectInto(threeStep, 0, 0, finalSire);
selectInto(threeStep, 1, 0, baseBroodmare);
selectInto(threeStep, 1, 7, admireGroove);

const threeStepPlan = plan.detectPlan(threeStep);
assert.equal(threeStepPlan.planDepth, 3, "④に繁殖牝馬を置いたら3工程（3代計画）");
assert.deepEqual(
  threeStepPlan.steps.map((step) => step.sireIndex),
  [19, 17, 0],
  "3代計画の工程セルは 19 → 17 → 種牡馬側0"
);
const threeStepResult = diagnose(threeStep);
console.log("\n3代計画シナリオ:");
console.log(describe(threeStepResult));
assert.equal(threeStepResult.steps.length, 3, "3工程ぶんの結果が出ること");

// ---------------------------------------------------------------------------
// 未入力: 空セルがあれば incomplete
// ---------------------------------------------------------------------------
const incomplete = selected.slice();
incomplete[31] = null;
assert.equal(
  diagnose(incomplete).status,
  "incomplete",
  "空セルがあるときは診断しない"
);

console.log("\nOK: 工程診断の検証がすべて通りました");
