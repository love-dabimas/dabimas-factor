const { assert, pedigree, table, plain, judge, run, window, bros, context, read, base } = require('./verify-p2d-common.cjs');
const { board, place, teio, partholon, luna, A, resolver } = require('./verify-p2d-implied.cjs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
for (const file of ['constants/pedigree-indexes','constants/breeding-theories','logic/theory/compatibility','logic/plan/plan-diagnosis']) run('vue/'+file+'.js');
const plan = window.Dabimas.logic.plan;
const currentDiagnosis = plan.diagnoseBreedingPlan;
vm.runInContext(execFileSync('git',['show',base+':vue/logic/plan/plan-diagnosis.js'],{encoding:'utf8'}),context);
const oldDiagnosis = plan.diagnoseBreedingPlan;
vm.runInContext(read('vue/logic/plan/plan-diagnosis.js'),context);
const selected = board(teio,luna);
place(selected,1,1,partholon); place(selected,1,3,luna);
selected[19].selfSelected=true;
const options = {
  selected, brosData:bros, nodeTable:table, resolver,
  resolveMare: name => name === luna.name ? luna : null,
  resolveHorse: entry => [teio,partholon].find(h=>h.nodeId === entry.nodeId),
};
const initial = plain(A);
let captured=[];
window.Dabimas.logic.inbreed.judgeInbreed=(cells,rules,nodes,r)=>{
  const result=judge(cells,rules,nodes,r);
  captured.push({cells:plain(cells),result:plain(result),parents:plain(r.parentsOf(cells[16].identityRef))});
  return result;
};
const first=currentDiagnosis(options);
assert.equal(first.steps.length,2); assert.ok(first.steps.every(s=>s.reasonCode !== 'EVALUATION_ERROR'));
assert.equal(captured.length,2);
const virtual=captured[1];
assert.deepEqual(virtual.cells[16].identityRef,{kind:'custom',id:'plan:step:1'});
assert.equal(virtual.cells[16].sexKind,'female');
assert.deepEqual(virtual.parents,plain({father:A.fatherRef,mother:A.motherRef}));
const screen=judge(board(teio,A),[],table,resolver);
const summary=result=>({dangerous:result.dangerous,crosses:result.crosses.map(c=>({node:c.representativeNodeId,blood:c.bloodVolume,generations:c.generations}))});
assert.deepEqual(summary(virtual.result),plain(summary(screen)));
assert.equal(virtual.result.crosses[0].bloodVolume,75000);
const stableCapture = entries => plain(entries.map(entry => ({
  refs:entry.cells.map(cell=>cell?.identityRef), parents:entry.parents,
  crosses:entry.result.crosses,dangerous:entry.result.dangerous,
})));
const firstCaptured=stableCapture(captured); captured=[];
const second=currentDiagnosis(options);
assert.deepEqual(stableCapture(captured),firstCaptured);
assert.deepEqual(plain(second.steps),plain(first.steps));
assert.deepEqual(plain(A),initial); assert.equal(resolver.parentsOf(virtual.cells[16].identityRef),null);
// A single real-mare step retains all existing status/reason/label output.
const single={...options,selected:board(teio,luna)};
assert.deepEqual(plain(currentDiagnosis(single).steps),plain(oldDiagnosis(single).steps));
window.Dabimas.logic.inbreed.judgeInbreed=judge;
console.log('OK: plan B01 parity (75000/danger), deterministic refs/results, no persistent mutations, single-step output unchanged');
