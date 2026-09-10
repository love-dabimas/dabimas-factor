const { assert, horses, pedigree, table, plain, window } = require('./verify-p2d-common.cjs');

const find = (name, subName) => {
  const horse = horses.find((item) =>
    item.name === name && (subName === undefined || item.subName === subName));
  assert.ok(horse, name + ' ' + (subName ?? ''));
  return horse;
};
const ref = (horse) => pedigree.createIdentityRef(horse);
const unknownHorse = (name, index) => ({
  name,
  subName: '',
  index,
  factors: ['', '', ''],
  identityRef: { kind: 'unknown' },
});
const resolverFor = (records = new Map()) => pedigree.buildIdentityResolver({
  nodeTable: table,
  customRecordsById: records,
});
const rudolfCross = (result) => result.crosses.find(
  (cross) => cross.representativeNodeId === '0000140567-00');

const partholon = find('パーソロン', '1971');
const luna = find('スイートルナ');
const rudolf = find('シンボリルドルフ', '');

// Case A: the unknown male-line cell at FF is the implied child of FFF and FFM.
const caseA = Array(32).fill(null);
caseA[0] = unknownHorse('父側ルート', 0);
caseA[0].mareRefs = Array(15).fill(null);
caseA[0].mareRefs[3] = ref(luna); // FFM
caseA[2] = unknownHorse('★１薄めパーソロン1971', 2); // FF
caseA[4] = { ...partholon, index: 4 }; // FFF
caseA[17] = { ...rudolf, index: 17 }; // F
caseA[10] = { ...luna, index: 10 };
caseA[28] = { ...luna, index: 28 };
const resultA = window.Dabimas.logic.inbreed.judgeInbreed(
  caseA, [], table, resolverFor());
const crossA = rudolfCross(resultA);
assert.ok(crossA, 'case A must detect the implied full sibling');
assert.equal(crossA.bloodVolume, 37500);
assert.deepEqual(plain(crossA.occurrences.map((item) => item.path)), ['FF', 'F']);
assert.deepEqual(plain(resultA.inbreedColorIndexes), [2, 17, 10, 28]);
assert.equal(resultA.dangerous, false);

// Case B: saving the same implied individual must retain it in descendants[0].
const source = Array.from({ length: 32 }, (_, index) => unknownHorse('dummy-' + index, index));
source[0] = unknownHorse('★１薄めパーソロン1971', 0);
source[0].mareRefs = Array(15).fill(null);
source[0].mareRefs[0] = ref(luna); // M
source[1] = { ...partholon, index: 1 }; // F
source[16] = { ...luna, index: 16 };
const options = { nodeTable: table, resolver: resolverFor() };
const record = window.Dabimas.logic.horses.buildSavedHorseRecord(
  'stallion', '自家製種牡馬', source, [], options);
assert.deepEqual(plain(record.descendants[0].identityRef), {
  kind: 'implied',
  fatherRef: { kind: 'master', nodeId: '0000333257-01' },
  motherRef: { kind: 'master', nodeId: '0000050973-00' },
});
const caseB = Array(32).fill(null);
caseB[14] = { ...record.descendants[0], index: 14 }; // MMFF
caseB[17] = { ...rudolf, index: 17 }; // F
const resultB = window.Dabimas.logic.inbreed.judgeInbreed(
  caseB, [], table, resolverFor(new Map([[record.id, record]])));
const crossB = rudolfCross(resultB);
assert.ok(crossB, 'case B must retain the implied full sibling after saving');
assert.equal(crossB.bloodVolume, 28125);
assert.deepEqual(plain(crossB.occurrences.map((item) => item.path)), ['MMFF', 'F']);
assert.deepEqual(plain(resultB.inbreedColorIndexes), [14, 17]);

const previousNodes = window.Dabimas.pedigreeNodes;
window.Dabimas.pedigreeNodes = null;
try {
  assert.doesNotThrow(() => window.Dabimas.logic.horses.buildSavedHorseRecord(
    'stallion', 'resolverなし', source, []));
  assert.doesNotThrow(() => window.Dabimas.logic.horses.buildSavedHorseRecord(
    'stallion', 'node tableなし', source, [], { nodeTable: null }));
} finally {
  window.Dabimas.pedigreeNodes = previousNodes;
}

console.log('OK: phase 2f cases A and B male-line implied individuals');
