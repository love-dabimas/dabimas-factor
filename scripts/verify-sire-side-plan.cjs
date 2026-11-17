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

// 4) 祖先のマスから引いた種牡馬は性別欄が空で、マスの印（sexKind）だけを持つ
//    （画面では {...セル, descendants} の形）。性別欄だけを見て繁殖牝馬として展開すると
//    getCellIdQue が戻らず、画面が固まった（#13）。印で牡牝を決める（#15）。
const damascus = find("ダマスカス", "1967");
const fromCell = Object.assign({}, damascus, { sexKind: "male" });
delete fromCell.sex;
assert.deepEqual(
  plain(plan.expandHorseBoard(fromCell, bros)).map((cell) => cell && cell.name),
  plain(plan.expandHorseBoard(damascus, bros)).map((cell) => cell && cell.name),
  "マスの印が牡なら種牡馬として展開する"
);
const mareCell = Object.assign({}, find("センドバック"), { sexKind: "female" });
delete mareCell.sex;
assert.equal(plan.expandHorseBoard(mareCell, bros)[0].sexKind, "female",
  "マスの印が牝なら繁殖牝馬として展開する");
const unknownSex = Object.assign({}, damascus);
delete unknownSex.sex;
assert.throws(() => plan.expandHorseBoard(unknownSex, bros), /牡牝の分からない馬/,
  "牡牝の分からない馬は組み立てない");
const loopQue = pedigree.getCellIdQue(0, Object.assign(new Array(16).fill(null), {
  0: { subName: "(牝馬)" },
  15: "broodmares",
}));
assert.ok(loopQue.length <= 16, "セル0を繁殖牝馬の経路で展開しても止まる");

// 5) 自家製の母の母が公式の牝馬なら、そこが基礎繁殖牝馬で 2 工程になる（#14）。
//    3 代目の "(センドバック)" はセンドバックの祖先に付く飾りで、3 代目の牝馬の名前ではない。
//    これを読み違えると「センドバック × ダマスカス（センドバックの父）」の工程が出来て危険になる。
const sendBack = find("センドバック");
const admiralMare = custom("broodmare", "ア牝", find("アドミラルドレイク", "瞬闘"), sendBack);
// テスト用の uuid は盤面を作るたびに振り直されるので、2 頭の id が重ならないように付け直す。
admiralMare.id = "ch_admiral_mare";
admiralMare.identityRef = { kind: "custom", id: admiralMare.id };
const bustedStallion = custom("stallion", "バステッドの牡馬", find("バステッド", "1967"), admiralMare);
bustedStallion.id = "ch_busted_stallion";
bustedStallion.identityRef = { kind: "custom", id: bustedStallion.id };
const bustedResolver = pedigree.buildIdentityResolver({
  nodeTable: table,
  customRecordsById: Object.fromEntries(
    [admiralMare, bustedStallion].map((record) => [record.id, record])
  ),
});
const bustedById = new Map([admiralMare, bustedStallion].map((record) => [record.id, record]));
const bustedResult = plan.diagnoseBreedingPlan({
  selected: board(bustedStallion, mezon),
  brosData: bros,
  nodeTable: table,
  resolver: bustedResolver,
  inbreedExceptions: exceptions,
  resolveHorse: (entry) => {
    if (!entry) return null;
    const customId = entry.customHorseId || (entry.identityRef?.kind === "custom" && entry.identityRef.id);
    return (customId && bustedById.get(customId)) || byNodeId.get(entry.nodeId) || null;
  },
  resolveMareByRef: (ref) =>
    ref?.kind === "master" ? byNodeId.get(ref.nodeId) || null : null,
});
const bustedSteps = sireSideSummary(bustedResult);
console.log("バステッド:", JSON.stringify(bustedSteps));
assert.equal(bustedResult.sireSide.baseMareName, "センドバック");
assert.deepEqual(bustedSteps.map((step) => step.sireIndex), [3, 1],
  "センドバック × アドミラルドレイク、その産駒 × バステッドの 2 工程");
assert.ok(bustedSteps.every((step) => step.status === "safe"), "父と娘の工程は作らない");

console.log("OK: 組んだ種牡馬（自家製・★薄め）の母系も種牡馬側の工程として診断される");
