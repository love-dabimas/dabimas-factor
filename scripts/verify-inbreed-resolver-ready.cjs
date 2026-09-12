// クロスが 1 つも出なくなった不具合（identityResolver が血統ノード表を持たないまま
// 固定される）の回帰検証。
//
// 症状: window.Dabimas.pedigreeNodes は起動後に fetch で入るが、リアクティブではない。
// identityResolver（computed）がそれより前に一度評価されると、nodeTable が null の
// まま結果がキャッシュされ、同じ馬を同じと判定できなくなる。判定側は名前ベースの
// 旧経路で件数だけ数えるため、クロスの色も因子数も出ないのに count だけ立つ。
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..");

global.window = { Dabimas: { app: {}, logic: {} } };
window.Vue = { observable: (value) => value, component() {} };

require(path.join(root, "vue/constants/pedigree-indexes.js"));
require(path.join(root, "vue/logic/pedigree/identity-resolver.js"));
require(path.join(root, "vue/app/app-state.js"));
require(path.join(root, "vue/app/app-computed.js"));

const computed = window.Dabimas.app.computed;
const state = window.Dabimas.app.createInitialState();

assert.equal(
  typeof state.identityResolverVersion,
  "number",
  "identityResolver を作り直す合図の state がある"
);

// 1. computed が identityResolverVersion を読むこと。
//    読まないと、ノード表が後から入っても Vue が resolver を作り直さない。
let readVersion = false;
const context = {
  customHorseDetails: {},
  editStallions: [],
  horsesBase: [],
  get identityResolverVersion() {
    readVersion = true;
    return 0;
  },
};
window.Dabimas.pedigreeNodes = null;
computed.identityResolver.call(context);
assert.ok(readVersion, "identityResolver は identityResolverVersion を読む");

// 2. ノード表が入った後に作り直せば、同じ馬を同じと判定すること。
const node = { nodeId: "0000225628-00", pedigreeId: "0000225628", subname: "" };
window.Dabimas.pedigreeNodes = {
  getNode: (nodeId) => (nodeId === node.nodeId ? node : null),
  getPedigree: (pedigreeId) => (pedigreeId === node.pedigreeId ? { pedigreeId } : null),
  parentsOf: () => ({ father: "0000145106", mother: "0000169374" }),
};
const ref = { kind: "master", nodeId: node.nodeId };

const before = computed.identityResolver.call({ ...context, identityResolverVersion: 0 });
assert.equal(before.sameCrossHorse(ref, ref), true, "ノード表があれば同じ馬を同じと判定する");
assert.ok(before.parentsOf(ref), "ノード表があれば父母を引ける");

// 3. ノード表が無いときは判定できない（ここが固定されてしまうのが不具合だった）。
window.Dabimas.pedigreeNodes = null;
const without = computed.identityResolver.call({ ...context, identityResolverVersion: 1 });
assert.equal(without.sameCrossHorse(ref, ref), false, "ノード表が無ければ判定できない");

console.log("inbreed identity resolver readiness: OK");
