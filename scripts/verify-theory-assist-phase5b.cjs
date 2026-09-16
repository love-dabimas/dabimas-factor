const assert = require('node:assert/strict');
const vm = require('node:vm');
const {context, logic, horses, options, board, plain, mare, read} = require('./verify-theory-assist-phase5a.cjs');
['logic/musume/theory-map', 'logic/musume/theory-map-heavy'].forEach(file => vm.runInContext(read('vue/' + file + '.js'), context));
const chips = ['PERFECT','SUPER_PERFECT','MIRACLE','SUPREME'].map((key,i) => ({key,bit:1<<i,pending:i===3}));
const dangerSire = horses.find(h => h.name === 'トニービン' && h.sex === '0');
const dangerMare = horses.find(h => h.name === 'エアグルーヴ' && h.sex === '1');
const safeSire = horses.find(h => h.name === 'アイアムアカペラオー');
const boards = [board(dangerSire), board(safeSire)];
const map = {type:'dabimas:theory-map',v:1,mareKey:'test',chips,entries:[['danger',7],['other',1]]};
const initial = plain(map);
function run(limit) {
  let state = {map, boards, mareBoard:board(dangerMare), options:{...options,candidateKeys:['danger','other']}, cursor:0,limit};
  let result;
  do { result = logic.musume.refineTheoryMapStep(state); state = {...state,...result}; } while (!result.done);
  return result.map;
}
const one = run(1), all = run(100);
assert.deepEqual(plain(one),plain(all));
assert.equal(one.entries.some(([key])=>key==='danger'),false,'実在する父娘の危険候補は全ビットから除外');
assert.deepEqual(plain(map),initial,'中断しても元のmapを変更しない');
assert.ok(one.chips.every(chip=>!chip.pending));
const synthetic = Array.from({length:32},(_,i)=>({name:'馬'+i,factors:[],index:i}));
[[2,['短','速']],[5,['底','長']],[31,['適','丈']]].forEach(([i,factors])=>Object.assign(synthetic[i],{name:'共通祖先',factors}));
const supreme = logic.plan.diagnoseStep(synthetic.slice(0,16),synthetic.slice(16),{});
assert.ok(supreme.sameNameSpecialChecks.length>0);
assert.equal(supreme.dangerous,false);
const refined = logic.musume.refineTheoryMapStep({map:{...map,entries:[]},boards:[synthetic.slice(0,16)],
  mareBoard:synthetic.slice(16),options:{candidateKeys:['supreme']},cursor:0,limit:1});
assert.deepEqual(plain(refined.map.entries),[['supreme',8]]);
console.log('[phase5b] OK: 分割一致、実在父娘の危険除外、至高1頭、入力不変');
// 画面の実データシナリオ（スターベガ）と同じ母で、至高の期待件数を固定する。
const realSires = horses.filter(h => h.sex === '0');
assert.ok(realSires.length > 2000);
const real = logic.musume.refineTheoryMapStep({ map:{...map, entries:[]},
  boards:realSires.map(board), mareBoard:board(mare),
  options:{...options,candidateKeys:realSires.map(h=>h.id)}, cursor:0,limit:realSires.length });
assert.equal(real.map.entries.filter(entry=>entry[1]&8).length,0);
console.log('[phase5b] スターベガ × '+realSires.length+'頭: 至高0頭（画面の期待値）');
