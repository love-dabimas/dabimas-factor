const { assert, horses, pedigree, table, plain, judge: newJudge, oldJudge } = require('./verify-p2d-common.cjs');
const judge = newJudge; // Phase 2d intentionally adds formerly missing mare occurrences.
const master = nodeId => ({ kind: 'master', nodeId });
const customRef = id => ({ kind: 'custom', id });
const find = nodeId => { const h = horses.find(h => h.nodeId === nodeId); assert.ok(h, nodeId); return h; };
const blank = () => Array(32).fill(null);
const custom = (id, index, sex = '1') => ({ name: '☆' + id, subName: '', nodeId: null, pedigreeId: null, index, sex, source: 'custom', customHorseId: id, identityRef: customRef(id), factors: ['', '', ''], mareNodeIds: Array(15).fill(null) });
function place(selected, side, local, horse) {
  const cells = pedigree.setDataForPedigree(String(side), local, horse, []);
  pedigree.getCellIdQue(local, cells).forEach((slot, i) => { selected[side * 16 + slot] = { ...cells[i], index: side * 16 + slot }; });
}
const resolver = records => pedigree.buildIdentityResolver({ nodeTable: table, customRecordsById: records });
const coords = c => plain(c.occurrences.map(o => [o.index, o.path]));
const crossFor = (result, id) => result.crosses.find(c => c.representativeNodeId === id);
function expect(result, colors, volumes, danger) {
  assert.deepEqual(plain(result.inbreedColorIndexes), colors);
  assert.deepEqual(plain(result.crosses.map(c => c.bloodVolume)).sort((a,b)=>a-b), volumes.slice().sort((a,b)=>a-b));
  assert.equal(result.dangerous, danger);
}
const teio = horses.find(h => h.name === 'トウカイテイオー' && h.subName === '');
assert.ok(teio);
// A01: only the male is displayed; both occurrences and count remain.
{
  const selected = blank(); place(selected,0,0,find('0000274883-00')); place(selected,1,0,find('0000262374-00'));
  const result = judge(selected,[],table,resolver({}));
  expect(result,[0],[100000],true);
  assert.equal(result.count,2);
  assert.deepEqual(plain(result.siblingGroups.map(g=>g.map(h=>h.index))),[[0]]);
  assert.deepEqual(coords(result.crosses[0]),[[0,''],[16,'']]);
}
// Female exact matches remain visible, including a mixed sibling/exact group.
{
  const selected = blank(); place(selected,0,0,find('0000262374-00')); place(selected,1,0,find('0000262374-00'));
  const result = judge(selected,[],table,resolver({}));
  assert.deepEqual(plain(result.inbreedColorIndexes),[0,16]);
  selected[1]={...find('0000274883-00'),index:1};
  const mixed=judge(selected,[],table,resolver({}));
  assert.ok(mixed.inbreedColorIndexes.includes(0) && mixed.inbreedColorIndexes.includes(16));
}
// Female-only sibling display is empty without changing the internal cross.
{
  const selected=blank(); selected[0]=custom('ch_A',0); selected[16]=custom('ch_B',16);
  const parents={fatherRef:master('0000333862-00'),motherRef:master('0000430846-00')};
  const result=judge(selected,[],table,resolver({ch_A:parents,ch_B:parents}));
  assert.deepEqual(plain(result.inbreedColorIndexes),[]);
  assert.equal(result.crosses.length,1); assert.equal(result.crosses[0].bloodVolume,100000);
}
// B01 and B03: father variant affects the parent key, not master identity.
for (const [father, colors, volumes, danger] of [
  ['0000333257-01',[1],[75000],true],
  ['0000333257-10',[2,17],[37500,37500],false],
]) {
  const selected = blank(); place(selected,0,0,teio); selected[16] = custom('ch_A',16);
  selected[16].mareNodeIds[0] = '0000050973-00'; place(selected,1,1,find(father));
  const r = resolver({ ch_A: { fatherRef: master(father), motherRef: master('0000050973-00') } });
  const result = judge(selected,[],table,r); expect(result,colors,volumes,danger);
  if(father.endsWith('-10')) {
    const before=oldJudge(selected,[],table,r);
    console.log(JSON.stringify({case:'B03 classification',beforeSame:before.sameNameGroups.map(g=>g.map(h=>h.index)),beforeSibling:before.siblingGroups.map(g=>g.map(h=>h.index)),afterSame:result.sameNameGroups.map(g=>g.map(h=>h.index)),afterSibling:result.siblingGroups.map(g=>g.map(h=>h.index))}));
  }
  const rudolf = crossFor(result,'0000140567-00');
  if (father.endsWith('-01')) { assert.ok(rudolf); assert.deepEqual(coords(rudolf), [[1,'F'],[16,'']]); }
  else { assert.equal(rudolf,undefined); assert.ok(crossFor(result,'0000333257-01') || crossFor(result,'0000333257-10')); assert.ok(crossFor(result,'0000050973-00')); }
}
// C01 and C02: custom mother is not promoted to her master full sibling.
for (const [motherRef, colors, volumes, representative] of [
  [customRef('ch_A'),[1,17],[50000,50000],'0000729458-00'],
  [master('0000713851-00'),[0],[100000],'0001151936-00'],
]) {
  const selected = blank(); place(selected,0,0,find('0001151936-00'));
  selected[16] = custom('ch_B',16); place(selected,1,1,find('0000729458-00'));
  const r = resolver({ ch_A: { fatherRef: master('0000333862-00'), motherRef: master('0000274849-00') }, ch_B: { fatherRef: master('0000729458-00'), motherRef } });
  const result = judge(selected,[],table,r); expect(result,colors,volumes,true); assert.ok(crossFor(result,representative));
}
// E01 and early return: only custom cells, including ancestors without roots.
for (const [left,right,volume] of [[0,16,100000],[0,17,75000],[4,20,12500]]) {
  const selected = blank(); selected[left] = custom('ch_X',left,'0'); selected[right] = custom('ch_X',right);
  const r = resolver({ ch_X: {} });
  const result = judge(selected,[],table,r);
  assert.equal(result.crosses.length,1); assert.equal(result.crosses[0].bloodVolume,volume);
  assert.equal(result.dangerous,volume >= 50000);
  assert.deepEqual(plain(judge(selected,[],null,r)),plain(oldJudge(selected,[],null,r)));
}
// A05: a custom mare occupies the hidden M path, with no master nodeId.
{
  const selected = blank(); place(selected,0,0,find('0000742976-00')); place(selected,1,0,find('0000274849-00'));
  const mare = { ...find('0000262374-00'), ...custom('ch_A',0), descendants: find('0000262374-00').descendants };
  place(selected,1,3,mare);
  const r = resolver({ ch_A: { fatherRef: master('0000333862-00'), motherRef: master('0000430846-00') } });
  const result = judge(selected,[],table,r);
  const cross = crossFor(result,'0000742976-00'); assert.ok(cross);
  assert.equal(cross.bloodVolume,75000); assert.deepEqual(coords(cross),[[0,''],[null,'M']]);
  assert.equal(cross.occurrences[1].nodeId,null); assert.deepEqual(plain(cross.occurrences[1].ref),customRef('ch_A'));
  assert.ok(result.inbreedColorIndexes.includes(0));
}
// D08: edit is a cross match for its base, but a distinct parent.
{
  const selected=blank(); place(selected,0,0,find('0000742976-00'));
  selected[17] = { name:'編集ディープ', index:17, source:'edit', id:'edit_1', nodeId:null, identityRef:{kind:'edit',id:'edit_1'}, factors:['','',''] };
  const r=pedigree.buildIdentityResolver({nodeTable:table,editRecordsById:{edit_1:{baseHorseId:'deep'}},baseHorseNodeIdById:{deep:'0000742976-00'}});
  const cross=crossFor(judge(selected,[],table,r),'0000742976-00');
  assert.ok(cross); assert.equal(cross.bloodVolume,75000); assert.deepEqual(coords(cross),[[0,''],[17,'F']]);
  assert.equal(r.parentComparisonKey({kind:'edit',id:'edit_1'}),'edit:edit_1');
  assert.equal(r.sameKnownParent({kind:'edit',id:'edit_1'},master('0000742976-00')),false);
}
// D07 and unknown parents: equal names/unknown refs do not create crosses.
for (const make of [i=>({name:'★1薄めナントカ',index:i,factors:['','','']}), i=>custom('ch_'+i,i)]) {
  const selected=blank(); selected[0]=make(0); selected[16]=make(16);
  const r=resolver({}); assert.equal(judge(selected,[],table,r).crosses.length,0);
  assert.deepEqual(plain(judge(selected,[],null,r)),plain(oldJudge(selected,[],null,r)));
}
// F01: different master variants remain cross-related.
{
  const selected=blank(); place(selected,0,0,find('0000333257-01')); place(selected,1,1,find('0000333257-10'));
  const result=judge(selected,[],table,resolver({})); const c=crossFor(result,'0000333257-01');
  assert.ok(c); assert.equal(c.bloodVolume,75000); assert.deepEqual(coords(c),[[0,''],[17,'F']]);
  assert.ok(result.sameNameGroups.some(g=>JSON.stringify(g.map(h=>h.index))==='[0,17]'));
  assert.equal(result.siblingGroups.some(g=>g.some(h=>h.index===0 || h.index===17)),false);
  assert.equal(judge(selected,[],table,null).crosses.length,0);
}
console.log('cases OK: B01/B03 C01/C02 E01 custom-only A05 D08 D07 F01; expected colors, blood volumes and occurrences; null resolver and legacy behavior');
