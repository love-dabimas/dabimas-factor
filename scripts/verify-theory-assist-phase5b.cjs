const assert = require('node:assert/strict');
const vm = require('node:vm');
const {context, logic, horses, brosData, options, board, plain, read} = require('./verify-theory-assist-phase5a.cjs');
['logic/musume-link', 'logic/musume/theory-map', 'logic/musume/theory-map-heavy'].forEach(file => vm.runInContext(read('vue/' + file + '.js'), context));
const link = logic.musumeLink;
const chips = ['PERFECT','SUPER_PERFECT','MIRACLE'].map((key,i) => ({key,bit:1<<i,pending:false}));
const dangerSire = horses.find(h => h.name === 'トニービン' && h.sex === '0');
const dangerMare = horses.find(h => h.name === 'エアグルーヴ' && h.sex === '1');
const safeSire = horses.find(h => h.name === 'アイアムアカペラオー');
const candidates = [{key:'danger',board:board(dangerSire)}, {key:'safe',board:board(safeSire)},
  {key:'unmatched',board:board(dangerSire)}];
const map = {type:'dabimas:theory-map',v:1,mareKey:'test',chips,
  entries:[['danger',7],['safe',5],['unsupported',1],['zero',0]]};
const initial = plain(map);
const original = logic.plan.diagnoseStep;
let calls = 0;
logic.plan.diagnoseStep = (...args) => { calls++; return original(...args); };
const result = logic.musume.refineTheoryMap(map,candidates,board(dangerMare),options);
assert.deepEqual(plain(result.map.entries),[['safe',5]],'実在父娘の全ビットを除き、安全な候補のビットを保つ');
assert.equal(result.diagnosedCount,2);
assert.equal(calls,2,'軽い判定でビットが立った対応候補だけ診断する');
assert.deepEqual(plain(map),initial,'入力を変更しない');
assert.ok(result.map.chips.every(chip => !chip.pending));
assert.equal(logic.musume.refineTheoryMap({...map,entries:[]},candidates,board(dangerMare),options).diagnosedCount,0);
// 至高は選んだ1組では引き続き成立するが、候補チップには足さない。
const synthetic = Array.from({length:32},(_,i)=>({name:'馬'+i,factors:[],index:i}));
[[2,['短','速']],[5,['底','長']],[31,['適','丈']]].forEach(([i,factors])=>Object.assign(synthetic[i],{name:'共通祖先',factors}));
assert.ok(original(synthetic.slice(0,16),synthetic.slice(16),{}).sameNameSpecialChecks.length);
assert.deepEqual(plain(logic.musume.refineTheoryMap({...map,entries:[]},
  [{key:'supreme',board:synthetic.slice(0,16)}],synthetic.slice(16),{}).map.entries),[]);
logic.plan.diagnoseStep = original;
const sires = horses.filter(h => h.sex === '0');
assert.equal(sires.length,2433);
const rows = sires.map(h => {
  const b = board(h);
  return [link.toMusumeKey(h.id),b[1].parentLine,b[3].parentLine,
    b[5].parentLine+b[7].parentLine,[9,11,13,15].map(i=>b[i].parentLine).join('')];
});
const summaries = new Map(sires.map(h=>[link.toMusumeKey(h.id),h]));
for (const [name,count] of [['アイウィルフォロー',1],['アイシテマース',3],['アイムホーム',0]]) {
  const mb = board(horses.find(h => h.name === name && h.sex === '1'));
  const started = performance.now();
  const light = logic.musume.buildTheoryMap({mareKey:name,damLines:logic.theory.prepareMareLines(mb),rows});
  const refined = logic.musume.refineTheoryMap(light,light.entries.map(([key])=>({key,board:board(summaries.get(key))})),mb,options);
  assert.equal(refined.diagnosedCount,count,name);
  assert.equal(light.chips.length,3);
  assert.ok(light.chips.every(c=>!c.pending));
  console.log('[phase5b]',name,{candidateCount:sires.length,diagnosedCount:refined.diagnosedCount,totalMs:performance.now()-started});
}
// 実際の送信経路: 詳細取得は該当候補だけ、判定後に1通だけ送る。
context.performance = performance;
context.window.Vue = {component(){}};
context.window.location = {origin:'http://localhost'};
context.window.addEventListener = context.window.removeEventListener = () => {};
context.window.Dabimas.favorites = {state:{},ids:()=>[]};
context.window.Dabimas.workspaceSync = {};
vm.runInContext(read('vue/components/musume/musume-host.js'),context);
async function verifyHost() {
  const definition = context.window.Dabimas.components.MusumeHost;
  const messages = [], fetched = [];
  const source = {postMessage:m=>messages.push(plain(m))};
  const mare = horses.find(h=>h.name==='アイシテマース' && h.sex==='1');
  const mb = board(mare);
  const input = {mareKey:mare.id,damLines:logic.theory.prepareMareLines(mb),mareBoard:mb};
  const host = Object.assign(definition.data(),{$refs:{sheetFrame:{contentWindow:source}},
    $root:{horsesBase:sires,savedHorseSummaries:[],brosData,inbreedExceptions:options.inbreedExceptions,
      identityResolver:options.resolver,$on(){},$off(){},
      ensureHorseDetail:async h=>{fetched.push(h.id);return h;}}});
  context.window.Dabimas.pedigreeNodes = options.nodeTable;
  Object.entries(definition.methods).forEach(([key,method])=>host[key]=method.bind(host));
  definition.created.call(host);
  host.candidateRows = rows;
  host.target = {theoryMap:input}; host.sheetOpen = true;
  await host.sendCustomAndTheory(source);
  assert.equal(fetched.length,3);
  assert.equal(messages.filter(m=>m.type==='dabimas:theory-map').length,1);
  assert.equal(host.lastTheoryMetrics.diagnosedCount,3);
  // 詳細待ち中の変更によって古い結果を送らない。
  for (const invalidate of [()=>{host.sheetOpen=false;},()=>{host.target={theoryMap:input};},
    ()=>{host.candidateRows=rows.slice();},()=>{host.customPayloadPromise=null;}]) {
    host.sheetOpen=true; host.target={theoryMap:input};
    const waiting=[];
    host.$root.ensureHorseDetail=h=>new Promise(resolve=>waiting.push(()=>resolve(h)));
    const before=messages.filter(m=>m.type==='dabimas:theory-map').length;
    const pending=host.sendCustomAndTheory(source);
    await Promise.resolve();
    assert.equal(waiting.length,3);
    invalidate(); waiting.forEach(f=>f()); await pending;
    assert.equal(messages.filter(m=>m.type==='dabimas:theory-map').length,before);
  }
  console.log('[phase5b] PASS: 3チップ、危険除外、対象限定、1回送信、詳細待ち中の変更');
}
verifyHost().catch(error=>{console.error(error);process.exitCode=1;});
