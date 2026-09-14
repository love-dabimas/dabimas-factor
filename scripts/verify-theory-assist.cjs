// 配合理論補助 Phase 1。実データと、週次更新に依存しない不変条件で検証する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const context = vm.createContext({ window: {}, console });
[
  "constants/pedigree-indexes.js",
  "constants/breeding-theories.js",
  "logic/pedigree/identity-resolver.js",
  "logic/pedigree/pedigree-builder.js",
  "logic/pedigree/board-refs.js",
  "logic/theory/compatibility.js",
  "logic/theory/theory-session.js",
  "logic/plan/plan-diagnosis.js",
  "logic/plan/assist-plan.js",
].forEach((file) => vm.runInContext(
  fs.readFileSync(path.join(ROOT, "vue", file), "utf8"), context, { filename: file }
));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const horses = readJson("json/dabimasFactor.json").horseLists;
const brosData = readJson("json/brosData.json").brosData;
const { theory, plan } = context.window.Dabimas.logic;
const priority = context.window.Dabimas.constants.breedingTheories.PRIORITY;
const plain = (value) => JSON.parse(JSON.stringify(value));
const sorted = (lines) => Array.from(lines).sort();
const rangeError = (error) => error.name === "RangeError";
const vega = horses.find((h) => h.name === "スターベガ" && h.sex === "1");
const altair = horses.find((h) => h.name === "スターアルタイル" && h.subName === "瓏覇");
assert.ok(vega && altair, "代表シナリオの馬が存在する");
const sires = horses.filter((h) => h.sex === "0");
assert.ok(sires.length > 0);
const prepared = sires.map((h) => Object.freeze({
  key: "duplicate-key", // key の重複で候補をまとめないこと。
  ...theory.prepareSireOperands(plan.expandHorseBoard(h, brosData)),
}));
prepared.forEach((s) => { Object.freeze(s.omoshiro); Object.freeze(s.migoto); });
Object.freeze(prepared);
const damLines = Object.freeze(theory.prepareMareLines(plan.expandHorseBoard(vega, brosData)));
const otherMare = horses.find((h) => h.name === "アドマイヤグルーヴ" && h.sex === "1");
assert.ok(otherMare);
const otherLines = theory.prepareMareLines(plan.expandHorseBoard(otherMare, brosData));

// セッションの作成・判定は盤面を展開しない。母だけを変えた結果も比較する。
const expand = plan.expandHorseBoard;
plan.expandHorseBoard = () => { throw new Error("セッション内で盤面を再構築した"); };
const session = theory.createTheorySession({ sires: prepared, damLines });
const other = theory.createTheorySession({ sires: prepared, damLines: otherLines });
assert.equal(session.size, sires.length);
const results = session.evaluateAll();
assert.notDeepEqual(plain(results), plain(other.evaluateAll()));
plan.expandHorseBoard = expand;
const altairIndex = sires.indexOf(altair);
assert.ok(altairIndex >= 0);
assert.equal(session.get(altairIndex).displayed, "PERFECT");
const perfectIndexes = session.indexesFor("PERFECT");
assert.ok(perfectIndexes.length > 0);
perfectIndexes.forEach((index) => assert.deepEqual(sorted(prepared[index].migoto), sorted(damLines)));
const counts = session.countsByTheory();
Object.keys(priority).forEach((key) => {
  const expected = results.flatMap((r, i) => r.matched.includes(key) ? [i] : []);
  assert.deepEqual(Array.from(session.indexesFor(key)), Array.from(expected));
  assert.equal(counts[key], expected.length);
});
assert.deepEqual(Array.from(session.indexesFor("UNKNOWN")), []);
["DANGEROUS", "SUPREME", "MIRACLE"].forEach((key) => assert.equal(counts[key], 0));
// 全候補について既存判定の結果と一致する（表示の優先順位も含む）。
prepared.forEach((sire, index) => {
  const matched = theory.detectMatchedTheories(
    [sire.omoshiro, sire.migoto], [damLines, damLines.slice()], {}
  );
  assert.deepEqual(plain(results[index]), {
    matched: plain(matched), displayed: theory.selectDisplayedTheory(matched, priority),
  });
});

// 理論なしを含め、判定・表示選択とも同じ添字では一度だけ実行する。
const detect = theory.detectMatchedTheories;
const display = theory.selectDisplayedTheory;
let detectCalls = 0;
let displayCalls = 0;
theory.detectMatchedTheories = (...args) => {
  detectCalls += 1;
  assert.deepEqual(plain(args[2]), {});
  return detect(...args);
};
theory.selectDisplayedTheory = (...args) => { displayCalls += 1; return display(...args); };
const cached = theory.createTheorySession({ sires: [prepared[altairIndex], {
  key: "duplicate-key", omoshiro: ["Ns", "Ns", "Ns", "Ns"],
  migoto: ["Ns", "Ns", "Ns", "Ns"],
}], damLines: ["Ns", "Ns", "Ns", "Ns"] });
assert.strictEqual(cached.get(0), cached.get(0));
assert.equal(detectCalls, 1);
assert.equal(displayCalls, 1);
// 同じ系統4枠は WONDERFUL になるので、共通しない1系統で理論なしを作る。
const emptyTheory = theory.createTheorySession({ sires: [{
  omoshiro: ["He", "He", "He", "He"], migoto: ["He", "He", "He", "He"],
}], damLines: ["Ns", "Ns", "Ns", "Ns"] });
assert.equal(emptyTheory.get(0).displayed, null);
assert.strictEqual(emptyTheory.get(0), emptyTheory.get(0));
emptyTheory.evaluateAll();
emptyTheory.countsByTheory();
assert.equal(detectCalls, 2);
assert.equal(displayCalls, 2);
theory.detectMatchedTheories = detect;
theory.selectDisplayedTheory = display;
[-1, session.size, 0.5, NaN, Infinity, "0", null, undefined].forEach(
  (index) => assert.throws(() => session.get(index), rangeError)
);
const empty = theory.createTheorySession({ sires: [], damLines });
assert.equal(empty.size, 0);
assert.deepEqual(plain(empty.evaluateAll()), []);
assert.throws(() => empty.get(0), rangeError);

const assist = plan.createAssistPlan({ baseMare: vega, brosData });
assert.equal(assist.steps.length, 3);
assert.equal(assist.steps[0].mareLabel, vega.name);
assert.deepEqual(plain(assist.mareLinesFor(1)), plain(damLines));
assert.equal(assist.isSelectable(1), true);
assert.equal(assist.isSelectable(2), false);
assert.equal(assist.mareLinesFor(2), null);
assert.throws(() => assist.selectSire(2, altair), /前工程/);
assist.selectSire(1, altair);
assert.equal(assist.steps[0].result.displayed, "PERFECT");
assert.deepEqual(sorted(assist.mareLinesFor(2)), ["Ha", "He", "Ma", "Ns"]);
assist.selectSire(2, altair);
assert.equal(assist.isSelectable(3), true);
assist.selectSire(3, altair);
assert.ok(assist.steps.every((step) => step.sire && step.result));
assert.equal(assist.isSelectable(4), false);
assert.equal(assist.steps[3], undefined);
[0, 4, 1.5, "1"].forEach((n) => {
  assert.throws(() => assist.selectSire(n, altair), rangeError);
  assert.throws(() => assist.clearSire(n), rangeError);
  assert.throws(() => assist.mareLinesFor(n), rangeError);
});
const replacement = sires.find((h) => h !== altair);
assist.selectSire(1, replacement);
assert.strictEqual(assist.steps[0].sire, replacement);
for (const step of assist.steps.slice(1)) {
  assert.equal(step.sire, null);
  assert.equal(step.result, null);
}
assert.equal(assist.isSelectable(2), true);
assert.equal(assist.isSelectable(3), false);
assert.equal(assist.mareLinesFor(3), null);
assert.equal(assist.steps[2].mareLabel, null);
const fresh = plan.createAssistPlan({ baseMare: vega, brosData });
fresh.selectSire(1, replacement);
assert.deepEqual(plain(assist.steps), plain(fresh.steps));
assist.selectSire(2, altair);
assist.selectSire(3, altair);
const secondMare = plain(assist.mareLinesFor(2));
assist.clearSire(2);
assert.deepEqual(plain(assist.mareLinesFor(2)), secondMare);
assert.equal(assist.steps[1].sire, null);
assert.equal(assist.steps[1].result, null);
assert.equal(assist.isSelectable(3), false);
assert.equal(assist.steps[2].result, null);
assist.clearSire(1);
assert.deepEqual(plain(assist.mareLinesFor(1)), plain(damLines));
assert.equal(assist.isSelectable(2), false);
assert.equal(assist.mareLinesFor(2), null);
assert.ok(assist.steps.every((step) => step.sire === null && step.result === null));

// classic script の依存順とオフライン資産の登録も確認する。
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
for (const [file, dependency] of [
  ["theory/theory-session.js", "theory/compatibility.js"],
  ["plan/assist-plan.js", "plan/plan-diagnosis.js"],
]) {
  assert.ok(html.indexOf("vue/logic/" + dependency) >= 0);
  assert.ok(html.indexOf("vue/logic/" + file) > html.indexOf("vue/logic/" + dependency));
  assert.ok(worker.includes("BASE_PATH + 'vue/logic/" + file + "'"));
}
assert.match(worker, /dabimas-factor-v\d{8}-\d{2}/);
console.log("[verify-theory-assist] OK: 受け入れ基準 a〜h、解除・集計・入力境界・資産登録");
