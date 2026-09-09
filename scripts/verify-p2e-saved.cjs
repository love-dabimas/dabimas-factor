const {assert,plain,window,pedigree,table,horses,context} = require('./verify-p2d-common.cjs');
const {board,place,find,teio,partholon,luna} = require('./verify-p2d-implied.cjs');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const save = window.Dabimas.logic.horses.buildSavedHorseRecord;
vm.runInContext(execFileSync('git',['show','28ef75e0b800c62ed3d8eee27cca3eb249ad2593:vue/logic/horses/saved-horse-builder.js'],{encoding:'utf8'}),context);
const oldSave = window.Dabimas.logic.horses.buildSavedHorseRecord;
window.Dabimas.logic.horses.buildSavedHorseRecord = save;
const resolver = pedigree.buildIdentityResolver({nodeTable:table});
const options = {nodeTable:table,resolver};
const sunday = find('サンデーサイレンス','1989');
const selected = board(sunday,luna);
place(selected,1,1,partholon); place(selected,1,3,luna);
selected[16] = {name:'ワタシノヒンバ',subName:'',index:16,factors:['','','']};
const before = plain(selected);
const record = save('broodmare','ザサンデー',selected,[],options);
assert.deepEqual(plain(record.fatherRef),{kind:'master',nodeId:'0000333862-01'});
assert.deepEqual(plain(record.motherRef),{kind:'implied',fatherRef:{kind:'master',nodeId:'0000333257-01'},motherRef:{kind:'master',nodeId:'0000050973-00'}});
window.Dabimas.logic.horses.MARE_SOURCE_IDS.forEach((source,slot)=>{
  if(source[0] === 'dam') assert.ok(record.mareRefs[slot] && record.mareRefs[slot].kind !== 'unknown');
});
assert.deepEqual(plain(selected),before,'input not mutated');
const target = board(teio,luna);
place(target,1,1,find('アイネスフウジン','覇煌'));
place(target,1,3,find('アイリッシュリヴァー','覇走'));
place(target,1,7,find('アイスカペイド','極走'));
place(target,1,15,{...record,source:'custom'});
target[16] = {...selected[16]};
const result = window.Dabimas.logic.inbreed.judgeInbreed(target,[],table,
  pedigree.buildIdentityResolver({nodeTable:table,customRecordsById:new Map([[record.id,record]])}));
assert.deepEqual(plain(result.inbreedColorIndexes),[1,12,30,14,26]);
assert.equal(result.count,5); assert.equal(result.dangerous,false);
assert.deepEqual(plain(result.crosses.map(c=>c.bloodVolume)),[28125,6250,6250]);
assert.deepEqual(plain(result.crosses[0].occurrences.map(o=>o.path)),['F','MMMM']);
assert.equal(result.crosses[0].representativeNodeId,'0000140567-00');
// Real placeholder metadata has no sexKind: extraction must retain its existing display.
const live = [...target.slice(0,16),...selected.slice(16)];
const liveResult = window.Dabimas.logic.inbreed.judgeInbreed(live,[],table,resolver);
assert.deepEqual(plain(liveResult.inbreedColorIndexes),[1,16]);
assert.equal(liveResult.count,7); assert.equal(liveResult.dangerous,true);
assert.equal(liveResult.crosses[0].bloodVolume,75000);
// Father-side accumulation must also be saved as an implied individual.
const paternal = board(sunday,luna);
place(paternal,0,1,partholon); place(paternal,0,3,luna);
paternal[0] = {name:'★１薄めパーソロン1971',subName:'',index:0,factors:['','','']};
assert.equal(save('stallion','父積み上げ',paternal,[],options).fatherRef.kind,'implied');
const fields = r => plain({fatherRef:r.fatherRef,motherRef:r.motherRef,mareRefs:r.mareRefs,mares:r.mares});
// Context-free and unavailable-node-table calls preserve old unknown/null values exactly.
for(const cells of [selected,paternal,board(teio,luna)]) {
  for(const ctx of [undefined,{}, {nodeTable:null,resolver}]) {
    assert.deepEqual(fields(save('broodmare','compat',cells,[],ctx)),fields(oldSave('broodmare','compat',cells,[])));
  }
  assert.doesNotThrow(()=>save('broodmare','no resolver',cells,[],{nodeTable:table}));
}
const empty = pedigree.resolveBoardRefs(selected,16,{});
assert.equal(empty.rootRef.kind,'unknown'); assert.ok(empty.mareRefs.every(ref=>ref===null));
assert.ok(Object.isFrozen(empty)); assert.equal(empty.refByPath.size,31);
// Known saved values must win even when a board offers another candidate.
const known = board(teio,luna); const custom = {kind:'custom',id:'keep-me'};
known[16].identityRef=custom; known[16].mareRefs[0]=custom;
const retained=save('broodmare','keep',known,[],options);
assert.equal(retained.motherRef,custom); assert.equal(retained.mareRefs[2],custom);
let seed=0x20260910;
const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const sires=horses.filter(h=>h.sex==='0'), dams=horses.filter(h=>h.sex==='1');
for(let i=0;i<1500;i++) {
  const cells=board(sires[random(sires.length)],dams[random(dams.length)]);
  assert.deepEqual(fields(save('broodmare','normal',cells,[],options)),fields(oldSave('broodmare','normal',cells,[])),'normal pair '+i);
}
console.log('OK: report 4 (28125 / count 5), saved parent/mare refs, paternal stacking, live 75000, compatibility, 1500 normal saves unchanged');
