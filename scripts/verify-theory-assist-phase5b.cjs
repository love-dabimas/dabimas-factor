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
  
// 奇跡は盤面が要る（compatibility.js の isMiracleMatch が selected[4..7] と
// selected[19] を見る）。軽い判定は盤面を渡さないので必ず落ちる。
// refineTheoryMap が盤面ありで立て直していることを確かめる。
{
  const theory = logic.theory;
  const sireLines = { omoshiro: ['Ne', 'Ro', 'Na', 'Ha'], migoto: ['Ha', 'Sw', 'He', 'Ns'] };
  const damLines = ['Ns', 'Ha', 'He', 'Sw'];
  const cheap = theory.detectMatchedTheories([sireLines.omoshiro, sireLines.migoto], [damLines, damLines], {});
  assert.ok(cheap.includes('PERFECT'), '完璧が立つ組でないと意味がない');
  assert.ok(!cheap.includes('MIRACLE'), '盤面なしで奇跡が出てしまっている');

  // 4〜7 のうち1つだけが 19 と同じ馬になる盤面を作る。
  const cell = (name, line) => ({ name, parentLine: line });
  const sireBoard = new Array(16).fill(null).map((_, i) => cell('S' + i, 'Ne'));
  [1, 3, 5, 7].forEach((c, i) => { sireBoard[c] = cell('S' + c, sireLines.omoshiro[i]); });
  [9, 11, 13, 15].forEach((c, i) => { sireBoard[c] = cell('S' + c, sireLines.migoto[i]); });
  sireBoard[5] = cell('ノーザンダンサー', sireLines.omoshiro[2]);
  const mareBoard = new Array(16).fill(null).map((_, i) => cell('M' + i, 'Ne'));
  [1, 3, 5, 7].forEach((c, i) => { mareBoard[c] = cell('M' + c, damLines[i]); });
  mareBoard[3] = cell('ノーザンダンサー', damLines[1]);   // selected[19]

  const full = theory.detectMatchedTheories([sireLines.omoshiro, sireLines.migoto], [damLines, damLines],
    { selected: logic.plan.buildStepSelected(sireBoard, mareBoard) });
  assert.ok(full.includes('MIRACLE'), 'この盤面は奇跡になるはず');

  const chips = [{ key: 'PERFECT', bit: 1, pending: false },
    { key: 'SUPER_PERFECT', bit: 2, pending: false }, { key: 'MIRACLE', bit: 4, pending: false }];
  const before = { chips, entries: [['k-0', 1]] };
  const after = logic.musume.refineTheoryMap(before, [{ key: 'k-0', board: sireBoard }], mareBoard,
    { damLines, inbreedExceptions: [], nodeTable: null, resolver: null });
  // 理論は 完璧 < 超完璧 < 奇跡 の序列。いちばん強い1つだけを立てる
  // （奇跡の馬が完璧にも数えられて二重に出るのを防ぐ）。
  assert.deepEqual(plain(after.map.entries), [['k-0', 4]], '奇跡のビットだけが立っていない');
  assert.deepEqual(plain(before.entries), [['k-0', 1]], '入力が変わっている');

  // 奇跡でない候補には立てない（軽い判定が誤って立てていたら落とす）。
  const notMiracle = logic.musume.refineTheoryMap({ chips, entries: [['k-0', 1 | 4]] },
    [{ key: 'k-0', board: sireBoard.map((c, i) => (i === 5 ? cell('別の馬', 'Na') : c)) }],
    mareBoard, { damLines, inbreedExceptions: [], nodeTable: null, resolver: null });
  assert.deepEqual(plain(notMiracle.map.entries), [['k-0', 1]], '奇跡でない候補のビットが落ちていない');
}

console.log('[phase5b] PASS: 3チップ、危険除外、対象限定、1回送信、詳細待ち中の変更');
}
verifyHost().catch(error=>{console.error(error);process.exitCode=1;});
