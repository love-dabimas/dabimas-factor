const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const horseSearch = window.Dabimas.logic.horses;
const fixtures = {
  none: { id: "none", name: "無印馬", subName: "極走", sex: "0", rare: 5, abilityType: "none" },
  normal: { id: "normal", name: "通常馬", sex: "0", rare: 5, abilityType: "normal" },
  double: { id: "double", name: "二重馬", sex: "0", rare: 5, abilityType: "double" },
  focused: {
    id: "focused",
    source: "edit",
    name: "特化馬",
    subName: "央天",
    nature: "颶風",
    sex: "0",
    rare: 5,
    abilityType: "focused",
    categoryIcon: "14",
  },
};

assert.deepEqual(
  horseSearch.getHorseBadges(fixtures.focused).map((badge) => badge.text),
  ["E", "颶", "特", "祭"],
  "バッジは E → 天性 → 非凡 → 祭 の順で返す"
);
assert.deepEqual(
  horseSearch.getHorseBadges(fixtures.focused, { hideEditBadge: true }).map((badge) => badge.text),
  ["颶", "特", "祭"],
  "hideEditBadge は E バッジだけを省く"
);
assert.equal(horseSearch.getHorseNameText(fixtures.focused), "特化馬央天");
assert.equal(horseSearch.getHorseBaseText(fixtures.focused), "[E][颶][特][祭]特化馬央天");
assert.equal(
  horseSearch.getHorseBaseText(fixtures.focused, { hideEditTag: true }),
  "[颶][特][祭]特化馬央天"
);

for (const horse of [
  { ...fixtures.none, rare: 4 },
  { ...fixtures.none, sex: "1" },
  { ...fixtures.none, abilityType: undefined },
  { ...fixtures.none, abilityType: "mystery" },
]) {
  assert.equal(
    horseSearch.getHorseBadges(horse).some((badge) => badge.key === "ability"),
    false,
    "★5種牡馬かつ既知の abilityType 以外は非凡バッジを出さない"
  );
  assert.equal(horseSearch.filterHorse(horse, "凡"), false, "凡検索へ誤一致させない");
}

assert.equal(horseSearch.isInmeisai({ categoryIcon: "14" }), true);
assert.equal(horseSearch.isInmeisai({ categoryIcon: "05" }), false);
assert.deepEqual(horseSearch.getHorseBadges({ categoryIcon: "14" }).map((badge) => badge.text), ["祭"]);

const searchCases = [
  [fixtures.normal, "非"],
  [fixtures.normal, "非凡あり"],
  [fixtures.double, "弐"],
  [fixtures.double, "にじゅうひぼん"],
  [fixtures.focused, "特"],
  [fixtures.focused, "とっかひぼん"],
  [fixtures.none, "凡"],
  [fixtures.none, "非凡なし"],
  [fixtures.focused, "祭"],
  [fixtures.focused, "いんめいさい"],
  [fixtures.focused, "颶"],
];
for (const [horse, query] of searchCases) {
  assert.equal(horseSearch.filterHorse(horse, query), true, `${query} で対象fixtureを検索できる`);
}

const methods = window.Dabimas.app.methods;
const normalized = methods.normalizeHorseSummary({
  id: "summary",
  name: "正規化馬",
  sex: "0",
  rare: 5,
  abilityType: "double",
  categoryIcon: "14",
});
assert.equal(normalized.abilityType, "double");
assert.equal(normalized.categoryIcon, "14");

const legacyNormalized = methods.normalizeHorseSummary({
  id: "legacy",
  name: "旧馬",
  sex: "0",
  rare: 5,
});
assert.equal(legacyNormalized.abilityType, null);
assert.equal(legacyNormalized.categoryIcon, null);
assert.deepEqual(
  horseSearch.getHorseBadges({ ...legacyNormalized, source: "edit", nature: "飛燕" }).map(
    (badge) => badge.text
  ),
  ["E", "飛"],
  "旧snapshotは非凡・祭だけを省き、従来の E・天性を残す"
);

const editSummary = methods.createEditStallionSummary(
  { id: "edit", baseHorseId: "base", factorName: "編集因名" },
  {
    ...normalized,
    id: "base",
    ruby: "せいきかうま",
    nature: "洞察",
    parentLine: "Ne",
    parentLineId: 5,
    son: "ノーザンダンサー系",
    sonId: 22,
    factors: ["速", "底", ""],
  }
);
assert.equal(editSummary.abilityType, "double");
assert.equal(editSummary.categoryIcon, "14");

const stored = methods.stripHorseForStorage({
  ...editSummary,
  descendants: [],
  displayName: "表示名",
  searchText: "検索",
});
assert.equal(stored.abilityType, "double");
assert.equal(stored.categoryIcon, "14");
assert.equal("descendants" in stored, false);
assert.equal("displayName" in stored, false);
assert.equal("searchText" in stored, false);

const savedHorse = methods.createSavedHorseSummary({
  id: "custom",
  name: "自家製馬",
  sex: "0",
  factors: [],
});
assert.equal("rare" in savedHorse, false);
assert.equal(horseSearch.getHorseBadges(savedHorse).some((badge) => badge.key === "ability"), false);

const summaryPath = path.join(__dirname, "..", "json", "dabimasFactor.summary.json");
const summaryJson = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const horses = summaryJson.horseLists;
const stallions = horses.filter((horse) => horse.sex === "0");
const broodmares = horses.filter((horse) => horse.sex === "1");
assert.equal(summaryJson.version, 1);
// 件数は json/dabimasFactor.summary.json を再生成するたびに変わる。
// データの取りこぼしを検出するための固定値なので、更新するときは
// 増減の内訳を確認してから直すこと。
// 2026-09-01: 血統マスター統合ビルド（dataset_version 2026-09-01T052756Z+raw.f7018232c481）
//             で全書更新分 +52 / -11 を取り込み、2873 -> 2914 になった。
assert.equal(horses.length, 2914);
assert.equal(stallions.length, 2415);
assert.equal(broodmares.length, 499);

const fiveStarAbilityCounts = { none: 0, normal: 0, double: 0, focused: 0 };
stallions
  .filter((horse) => horse.rare === 5)
  .forEach((horse) => {
    assert.equal(horse.abilityType in fiveStarAbilityCounts, true);
    fiveStarAbilityCounts[horse.abilityType] += 1;
  });
assert.deepEqual(fiveStarAbilityCounts, {
  none: 586,
  normal: 1046,
  double: 13,
  focused: 266,
});
assert.equal(
  horses.find((horse) => horse.id === "s3537931452").abilityType,
  "focused",
  "icon_ability_98 は特化非凡"
);
assert.equal(
  horses.find((horse) => horse.id === "s3452991073").abilityType,
  "double",
  "icon_ability_97 は弐重非凡"
);

const lowerRareStallions = stallions.filter((horse) => horse.rare <= 4);
assert.equal(lowerRareStallions.length, 504);
assert.equal(lowerRareStallions.every((horse) => horse.abilityType === "none"), true);
assert.equal(
  lowerRareStallions.every(
    (horse) => !horse.displayName.includes("[凡]") && !horse.searchText.includes("ひぼんなし")
  ),
  true
);
assert.equal(broodmares.every((horse) => horse.abilityType === null), true);

const inmeisai = horses.filter((horse) => horse.categoryIcon === "14");
assert.equal(inmeisai.length, 64);
assert.equal(
  inmeisai.every((horse) => horse.abilityType === "none" && horse.nature === ""),
  true
);
assert.equal(
  horses.every((horse) => horseSearch.getHorseBaseText(horse) === horse.displayName),
  true,
  "Python summary の displayName は JS のタグ順と一致する"
);

console.log("horse badges regression: OK");
