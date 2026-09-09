const { assert, pedigree, table, plain, judge, run, context, window } = require('./verify-p2d-common.cjs');
const { board, place, teio, A, B, resolver } = require('./verify-p2d-implied.cjs');
let methods;
context.Vue={component:(_name,component)=>{methods=component.methods;}};
run('vue/CombinationDialog.js');
async function main() {
  const edit={id:'es_test',name:'edited',baseHorseId:'base'};
  const parent={...A,id:'ch_parent',identityRef:{kind:'custom',id:'ch_parent'},fatherRef:{kind:'custom',id:'ch_child'}};
  const child={...B,id:'ch_child',identityRef:{kind:'custom',id:'ch_child'},fatherRef:parent.identityRef,mareRefs:[{kind:'edit',id:edit.id}]};
  const records=new Map([A,B,parent,child].map(r=>[r.id,r]));
  let editReads=0; const savedEdits=[];
  window.Dabimas.repositories={editStallions:{loadAll:async()=>{editReads++;return [edit];},save:async record=>savedEdits.push(record)}};
  const owner={...methods,readCustomHorses:async ids=>ids.map(id=>records.get(id)).filter(Boolean)};
  const selected=board(teio,teio); place(selected,1,3,A);
  // Only ancestor identityRef and mareRefs are roots, no customHorseId/id.
  selected[20]={...selected[20],identityRef:child.identityRef};
  selected[21]={...selected[21],mareRefs:[B.identityRef,{kind:'custom',id:'missing',name:A.name}]};
  const bundle=await owner.collectReferencedHorseRecords(JSON.stringify(selected));
  assert.deepEqual(plain(bundle.customHorses.map(r=>r.id).sort()),['ch_A','ch_B','ch_child','ch_parent']);
  assert.equal(editReads,1); assert.deepEqual(plain(bundle.editStallions),[edit]);
  assert.deepEqual(plain(await owner.collectReferencedHorseRecords('{')),{});
  const received=new Map(), restoredSnapshot=new Map();
  const configData={...plain(bundle),dabimasFactor:JSON.stringify(selected)};
  // Exercise actual restoreConfig, including repository writes before restore event.
  const db={transaction:()=>({objectStore:()=>({get:()=>{
    const request={}; queueMicrotask(()=>{request.result={title:'shared',configData};request.onsuccess();}); return request;
  }})})};
  context.localStorage={setItem:(k,v)=>restoredSnapshot.set(k,v)};
  let emitted;
  await methods.restoreConfig.call({...methods,db,selectedId:1,writeCustomHorses:async rows=>rows.forEach(r=>received.set(r.id,r)),
    showToast:()=>{},close:()=>{},$emit:(event,value)=>{assert.equal(event,'restore');assert.equal(savedEdits.length,1);emitted=value;}});
  assert.ok(emitted); assert.equal(restoredSnapshot.get('dabimasFactor'),configData.dabimasFactor);
  const recipientResolver=pedigree.buildIdentityResolver({nodeTable:table,customRecordsById:received,editRecordsById:new Map(savedEdits.map(r=>[r.id,r]))});
  for(const record of bundle.customHorses) assert.deepEqual(plain(recipientResolver.parentsOf(record.identityRef)),plain(pedigree.buildIdentityResolver({nodeTable:table,customRecordsById:records}).parentsOf(record.identityRef)));
  assert.deepEqual(plain(judge(selected,[],table,recipientResolver)),plain(judge(selected,[],table,pedigree.buildIdentityResolver({nodeTable:table,customRecordsById:records,editRecordsById:new Map([[edit.id,edit]])}))));
  assert.equal(recipientResolver.parentsOf({kind:'custom',id:'missing',name:A.name}),null);
  // The restored UI must load both registries before judging the snapshot.
  run('vue/app/methods/combination.js');
  const order=[]; window.Dabimas.workspaceSync={notifyLocalChange:()=>order.push('notify')};
  await window.Dabimas.app.methods.onCombinationRestore.call({loadCustomHorseDetails:async()=>order.push('custom'),loadEditStallions:async()=>order.push('edit'),restoreInputData:async()=>{assert.ok(order.includes('custom')&&order.includes('edit'));order.push('restore');}},{});
  assert.deepEqual(order,['custom','edit','restore','notify']);
  console.log('OK: ancestor + nested parents + mare refs, cycle/dedup, missing refs, fresh-store restore/judgment parity, edit repository restore, UI cache reload');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
