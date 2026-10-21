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

// 性別のバッジ: 牝馬（セール牝馬・自家製の繁殖牝馬・深いマスで選んだ牝馬）には「牝」、
// 自家製の種牡馬には「牡」。公式の種牡馬には付けない。「自」の後ろに並べる。
const sexBadges = (horse) => horseSearch.getHorseBadges(horse).map((badge) => badge.text).filter((text) => "自牡牝".includes(text));
assert.deepEqual(sexBadges({ name: "セール牝馬", sex: "1" }), ["牝"], "セール牝馬は牝");
assert.deepEqual(sexBadges({ name: "☆自家製牝馬", sex: "1", source: "custom" }), ["自", "牝"], "自家製の繁殖牝馬は 自・牝");
assert.deepEqual(sexBadges({ name: "☆自家製牡馬", sex: "0", source: "custom" }), ["自", "牡"], "自家製の種牡馬は 自・牡");
assert.deepEqual(sexBadges({ name: "公式の種牡馬", sex: "0" }), [], "公式の種牡馬には付けない");
assert.deepEqual(
  sexBadges({ name: "ストームキャット", subName: "(メゾンフォルティー)", sex: "0", placeholderMareRef: { kind: "master", nodeId: "x" } }),
  ["牝"],
  "深いマスでセール牝馬を選んだマスは牝"
);
assert.deepEqual(
  sexBadges({ name: "ドリームジャーニー", subName: "(☆ドリメゾ牝馬)", sex: "0", placeholderMareRef: { kind: "custom", id: "c" } }),
  ["自", "牝"],
  "深いマスで自家製の繁殖牝馬を選んだマスは 自・牝"
);
assert.equal(
  horseSearch.getHorseBaseText({ name: "セール牝馬", sex: "1" }),
  "セール牝馬",
  "性別のバッジは文字列（displayName と揃える側）には入れない"
);

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
// 2026-09-04: 週次のデータ更新で +24 / -11。2914 -> 2927（種牡馬 2415 -> 2428）。
// 2026-09-11: 週次のデータ更新で +11 / -6。2927 -> 2932（種牡馬 2428 -> 2433）。
// 日次・週次の自動更新で増えるので固定値では持てない。取りこぼし（生成が
// 途中で止まる等）を捕まえるための下限として見る。数字は 2026-09-11 時点。
assert.ok(horses.length >= 2932, '馬の数が減っている: ' + horses.length);
assert.ok(stallions.length >= 2433, '種牡馬が減っている: ' + stallions.length);
assert.ok(broodmares.length >= 499, '繁殖牝馬が減っている: ' + broodmares.length);
assert.equal(horses.length, stallions.length + broodmares.length);

const fiveStarAbilityCounts = { none: 0, normal: 0, double: 0, focused: 0 };
stallions
  .filter((horse) => horse.rare === 5)
  .forEach((horse) => {
    assert.equal(horse.abilityType in fiveStarAbilityCounts, true);
    fiveStarAbilityCounts[horse.abilityType] += 1;
  });
// 内訳も週次のデータ更新でずれる。2026-09-11 のデータでの値。
// 内訳も自動更新で動く。種別が増減していないこと（4 種類すべてに馬がいて、
// 合計が 5 星の頭数と一致すること）と、下限だけを見る。数字は 2026-09-11 時点。
const fiveStarTotal = stallions.filter((horse) => horse.rare === 5).length;
assert.equal(
  Object.values(fiveStarAbilityCounts).reduce((sum, value) => sum + value, 0),
  fiveStarTotal
);
for (const [kind, floor] of Object.entries({ none: 593, normal: 1055, double: 13, focused: 268 })) {
  assert.ok(
    fiveStarAbilityCounts[kind] >= floor,
    `5星の ${kind} が減っている: ${fiveStarAbilityCounts[kind]}`
  );
}
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
// レア 4 以下も自動更新で動く。種別の規則（全部 none）が本体なので、数は目安の下限で見る。
assert.ok(lowerRareStallions.length >= 500, 'レア4以下が減っている: ' + lowerRareStallions.length);
assert.equal(lowerRareStallions.every((horse) => horse.abilityType === "none"), true);
assert.equal(
  lowerRareStallions.every(
    (horse) => !horse.displayName.includes("[凡]") && !horse.searchText.includes("ひぼんなし")
  ),
  true
);
assert.equal(broodmares.every((horse) => horse.abilityType === null), true);

const inmeisai = horses.filter((horse) => horse.categoryIcon === "14");
assert.ok(inmeisai.length >= 64, '因名祭が減っている: ' + inmeisai.length);
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
