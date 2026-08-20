const assert = require("node:assert/strict");

global.window = {
  Dabimas: {
    app: { methods: {} },
    logic: {
      factor: { factorMap: new Map() },
    },
  },
};
global.Vue = {};
window.Vue = global.Vue;

require("../vue/logic/horses/horse-search.js");
require("../vue/app/methods/horse-loading.js");

const methods = window.Dabimas.app.methods;

function createContext(baseHorses) {
  return {
    savedHorseSummaries: [],
    editStallions: [],
    horsesBase: baseHorses,
    stallionsBase: baseHorses,
    broodmaresBase: [],
    createEditStallionSummary: methods.createEditStallionSummary,
    insertEditStallions: methods.insertEditStallions,
  };
}

const nearctic = "\u30cb\u30a2\u30fc\u30af\u30c6\u30a3\u30c3\u30af";
const baseHorses = [
  { id: "s8142543839", name: nearctic, subName: "\u592e\u5929", ruby: "nearctic-1", sex: "0" },
  { id: "s4217351593", name: nearctic, subName: "\u71d5\u95d8", ruby: "nearctic-2", sex: "0" },
  { id: "s5112334989", name: nearctic, subName: "\u795e\u901f", ruby: "nearctic-3", sex: "0" },
  { id: "s7210373245", name: nearctic, subName: "\u7fd4\u745a", ruby: "nearctic-4", sex: "0" },
];
const selectedSnapshots = [
  { ...baseHorses[0], index: 0, uuid: "selection-1" },
  { ...baseHorses[3], index: 4, uuid: "selection-2" },
  { ...baseHorses[1], index: 8, uuid: "selection-3" },
];

const context = createContext(baseHorses);
methods.refreshCandidateLists.call(context, selectedSnapshots, []);

assert.deepEqual(
  context.stallions.map((horse) => horse.id),
  baseHorses.map((horse) => horse.id),
  "選択状態の復元後も、マスターに存在する種牡馬は候補へ重複追加しない"
);

const legacyContext = createContext(baseHorses);
methods.refreshCandidateLists.call(
  legacyContext,
  [
    {
      name: baseHorses[0].name,
      subName: baseHorses[0].subName,
      factors: [],
      index: 0,
    },
  ],
  []
);

assert.equal(
  legacyContext.stallions.length,
  baseHorses.length,
  "idを持たない旧snapshotも表示内容が同じマスター馬なら重複追加しない"
);

const uniqueExtra = {
  id: "custom-1",
  name: "custom horse",
  subName: "",
  ruby: "custom horse",
  sex: "0",
};
const contextWithUniqueExtra = createContext(baseHorses);
methods.refreshCandidateLists.call(
  contextWithUniqueExtra,
  [uniqueExtra, { ...uniqueExtra, index: 12 }],
  []
);

assert.equal(
  contextWithUniqueExtra.stallions.filter((horse) => horse.id === uniqueExtra.id).length,
  1,
  "マスターにない選択由来候補は残しつつ、同じ馬の複数選択は1件にまとめる"
);

const distinctIdContext = createContext(baseHorses);
const distinctIdHorse = { ...baseHorses[0], id: "edit-1", source: "edit" };
methods.refreshCandidateLists.call(distinctIdContext, [distinctIdHorse], []);

assert.equal(
  distinctIdContext.stallions.filter(
    (horse) => horse.name === baseHorses[0].name && horse.subName === baseHorses[0].subName
  ).length,
  2,
  "表示内容が同じでも別idの保存馬・エディット馬は別候補として残す"
);

console.log("horse candidate list regression: OK");
