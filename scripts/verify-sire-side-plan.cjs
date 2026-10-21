// 左上の種牡馬を自分で組んだとき（★N薄めの仮の馬・自家製馬）に、その種牡馬を
// 作るまでの母系も「種牡馬側の工程」として診断されることを確かめる。
// 形は実際に報告のあった配合に合わせる:
//   種牡馬側  ★1薄めドリメゾ牡馬 = ドリメゾ牡馬（自家製）× 母（父 アイアンリージ瓏闘）
//             その母の母の父 アイスカペイド瑚闘、母母母の父 アイスカペイド1973
//   繁殖牝馬側 メゾンフォルティー
const {
  assert, horses, pedigree, table, plain, run, window, bros, exceptions, board,
} = require("./verify-p2d-common.cjs");

for (const file of [
  "constants/pedigree-indexes",
  "constants/breeding-theories",
  "logic/theory/compatibility",
  "logic/plan/plan-diagnosis",
]) {
  run("vue/" + file + ".js");
}

const plan = window.Dabimas.logic.plan;
const build = window.Dabimas.logic.horses.buildSavedHorseRecord;

const find = (name, subName) => {
  const horse = horses.find(
    (item) => item.name === name && item.subName === (subName || "")
  );
  assert.ok(horse, name + " " + (subName || ""));
  return horse;
};
const custom = (kind, title, sire, dam) => {
  const record = build(kind, title, board(sire, dam));
  record.source = "custom";
  return record;
};

const mezon = find("メゾンフォルティー");
const anyMare = horses.find((horse) => horse.sex === "1" && horse.name !== mezon.name);
const dorimezo = custom("stallion", "ドリメゾ牡馬", find("ドリームジャーニー", "央瓏"), mezon);
const mare3 = custom("broodmare", "母母母", find("アイスカペイド", "1973"), anyMare);
const mare2 = custom("broodmare", "母母", find("アイスカペイド", "瑚闘"), mare3);
const mare1 = custom("broodmare", "母", find("アイアンリージ", "瓏闘"), mare2);
const builtStallion = custom("stallion", "組んだ種牡馬", dorimezo, mare1);

const customs = [dorimezo, mare3, mare2, mare1, builtStallion];
const resolver = pedigree.buildIdentityResolver({
  nodeTable: table,
  customRecordsById: Object.fromEntries(customs.map((record) => [record.id, record])),
});
const byNodeId = new Map(horses.map((horse) => [horse.nodeId, horse]));
const byCustomId = new Map(customs.map((record) => [record.id, record]));
const resolveHorse = (entry) => {
  if (!entry) return null;
  const customId = entry.customHorseId || (entry.identityRef?.kind === "custom" && entry.identityRef.id);
  return (customId && byCustomId.get(customId)) || byNodeId.get(entry.nodeId) || null;
};
const diagnose = (selected) =>
  plan.diagnoseBreedingPlan({
    selected,
    brosData: bros,
    nodeTable: table,
    resolver,
    inbreedExceptions: exceptions,
    resolveHorse,
    resolveMareByRef: (ref) =>
      ref?.kind === "master" ? byNodeId.get(ref.nodeId) || null : null,
  });
const sireSideSummary = (diagnosis) =>
  plain(diagnosis.sireSide.steps.map(({ stepNo, status, sireIndex, sireName }) => ({
    stepNo, status, sireIndex, sireName,
  })));

// 1) 左上が自家製馬。
const withCustom = board(builtStallion, mezon);
withCustom[16].selfSelected = true;
withCustom[15].selfSelected = true;
assert.equal(plan.isBuiltStallion(withCustom[0]), true, "自家製馬は組んだ種牡馬として扱う");
const customResult = diagnose(withCustom);
assert.ok(customResult.sireSide, "自家製の種牡馬なら種牡馬側の工程を作る");
const customSteps = sireSideSummary(customResult);
console.log("自家製:", JSON.stringify(customSteps));
assert.deepEqual(customSteps.map((step) => step.sireIndex), [7, 3, 1],
  "種牡馬側は母母母→母母→母の順に、母母父・母父・父を付ける 3 工程");
assert.equal(customSteps[0].sireName, "アイスカペイド");
assert.equal(customSteps[0].status, "danger",
  "アイスカペイド1973 の娘にアイスカペイド瑚闘を付ける工程は危険");

// 2) 左上が ★1薄め の仮の馬（深いマスを選んだときに自動で作られる馬）。
const withPlaceholder = board(builtStallion, mezon);
withPlaceholder[0] = {
  ...withPlaceholder[0],
  name: "★１薄めドリメゾ牡馬",
  subName: "",
  source: undefined,
  customHorseId: undefined,
  identityRef: undefined,
  nodeId: undefined,
  disabled: true,
  selfSelected: false,
};
withPlaceholder[1].selfSelected = true;
withPlaceholder[15].selfSelected = true;
withPlaceholder[16].selfSelected = true;
assert.equal(plan.isBuiltStallion(withPlaceholder[0]), true, "★N薄めは組んだ種牡馬として扱う");
const placeholderResult = diagnose(withPlaceholder);
assert.ok(placeholderResult.sireSide, "★N薄めの種牡馬なら種牡馬側の工程を作る");
const placeholderSteps = sireSideSummary(placeholderResult);
console.log("★薄め:", JSON.stringify(placeholderSteps));
assert.equal(placeholderSteps[0].status, "danger", "★薄めでも同じ工程が危険と出る");

// 3) 左上が公式の種牡馬なら、種牡馬側の工程は作らない（組み立てる工程が無い）。
const master = board(find("ドリームジャーニー", "央瓏"), mezon);
master[16].selfSelected = true;
assert.equal(plan.isBuiltStallion(master[0]), false);
assert.equal(diagnose(master).sireSide, null, "公式の種牡馬では種牡馬側の工程は無い");

// 4) 繁殖牝馬側の工程は今までどおり別に出て、最後は左上の種牡馬を付ける工程。
const mareSteps = plain(customResult.steps.map((step) => step.sireIndex));
assert.equal(mareSteps[mareSteps.length - 1], 0, "繁殖牝馬側の最後の工程は左上の種牡馬");
assert.ok(mareSteps.every((index) => index === 0 || index >= 16), "繁殖牝馬側の工程に種牡馬側のマスは混ざらない");

console.log("OK: 組んだ種牡馬（自家製・★薄め）の母系も種牡馬側の工程として診断される");
