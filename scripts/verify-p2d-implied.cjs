const { assert, horses, pedigree, table, plain, judge, window } = require('./verify-p2d-common.cjs');
const master = nodeId => ({ kind: 'master', nodeId });
const custom = id => ({ kind: 'custom', id });
const find = (name, subName) => {
  const horse = horses.find(h => h.name === name && (subName === undefined || h.subName === subName));
  assert.ok(horse, name + ' ' + subName); return horse;
};
function place(selected, side, local, horse) {
  const cells = pedigree.setDataForPedigree(String(side), local, horse, []);
  pedigree.getCellIdQue(local, cells).forEach((slot, i) => {
    if (cells[i] && cells[i] !== 'broodmares') selected[side * 16 + slot] = { ...cells[i], index: side * 16 + slot };
  });
}
function board(sire, dam) {
  const selected = Array(32).fill(null); place(selected, 0, 0, sire);
  if (dam.identityRef?.kind === 'unknown') selected[16] = {...dam,index:16};
  else place(selected, 1, 0, dam);
  return selected;
}
const partholon = find('パーソロン', '1971'), luna = find('スイートルナ');
const teio = find('トウカイテイオー', ''), iron = find('アイアンリージ', '巌瓏');
const save = (id, sire, dam) => ({ ...window.Dabimas.logic.horses.buildSavedHorseRecord('broodmare', id, board(sire, dam)), id, identityRef: custom(id), source: 'custom' });
const A = save('ch_A', partholon, luna);
const B = save('ch_B', find('サンデーサイレンス', '1989'), A);
const resolver = pedigree.buildIdentityResolver({ nodeTable: table, customRecordsById: { ch_A: A, ch_B: B } });
const rudolf = result => result.crosses.find(c => c.representativeNodeId === '0000140567-00');
const unknown = { name: 'ワタシノヒンバ', sex: '1', identityRef: { kind: 'unknown' }, factors: ['', '', ''] };
for (const mode of [1, 2, 3]) {
  const selected = board(mode === 1 ? find('トウカイテイオー', '央獅') : mode === 2 ? find('トウカイテイオー', '覇魂') : teio, unknown);
  place(selected, 1, 1, iron);
  if (mode === 1) { place(selected, 1, 3, partholon); place(selected, 1, 7, luna); }
  if (mode === 2) place(selected, 1, 3, A);
  if (mode === 3) {
    place(selected, 1, 15, B);
    // 報告で残る既存クロスの2セル（B以外の枝）も再現する。
    selected[30] = {...selected[12],index:30};
    selected[26] = {...selected[14],index:26};
  }
  const result = judge(selected, [], table, resolver), cross = rudolf(result);
  assert.ok(cross, 'report ' + mode);
  assert.equal(cross.bloodVolume, mode === 3 ? 28125 : 50000);
  assert.deepEqual(plain(result.inbreedColorIndexes), mode === 3 ? [1,12,30,14,26] : [1]);
  assert.deepEqual(plain(cross.occurrences.map(o => [o.index, o.path, o.generation])), [[1,'F',2],[null,mode === 3 ? 'MMMM' : 'M',mode === 3 ? 5 : 2]]);
  assert.equal(result.crosses.length, mode === 3 ? 3 : 1);
  assert.equal(result.dangerous, mode !== 3);
  if (mode === 1) assert.deepEqual(plain(cross.occurrences[1].ref), { kind:'implied', fatherRef:master('0000333257-01'), motherRef:master('0000050973-00') });
  if (mode === 3) assert.deepEqual(plain(cross.occurrences[1].ref), custom('ch_A'));
}
// Root inference, and no inference at an unknown male ancestor with the same parents.
const rootBoard = board(teio, unknown); place(rootBoard,1,1,partholon); place(rootBoard,1,3,luna);
assert.equal(rudolf(judge(rootBoard,[],table,resolver)).bloodVolume,75000);
const dummyBoard = board(teio,unknown);
place(dummyBoard,1,1,partholon); place(dummyBoard,1,2,partholon); place(dummyBoard,1,5,luna);
dummyBoard[17] = {name:'★1薄めパーソロン', index:17, factors:['','','']};
assert.equal(rudolf(judge(dummyBoard,[],table,resolver)),undefined);
assert.equal(pedigree.createIdentityRef(dummyBoard[17]).kind,'unknown');
const implied = {kind:'implied',fatherRef:A.fatherRef,motherRef:A.motherRef};
for(const key of ['identityKey','crossHorseKey','parentComparisonKey']) assert.equal(resolver[key](implied),null);
// One diagnostic per invocation, only for the missing fourth argument.
let warnings=0; const originalWarn=console.warn; console.warn=()=>warnings++;
try {
  assert.equal(judge(rootBoard,[],table,null).crosses.length,0); assert.equal(warnings,1);
  judge(rootBoard,[],null,null); judge(rootBoard,[],table,resolver); assert.equal(warnings,1);
} finally {console.warn=originalWarn;}
console.log('OK: reports 1–3, root implied, unknown male ancestor, resolver keys, missing-resolver warnings');
module.exports = { find, place, board, A, B, resolver, teio, partholon, luna, iron };
