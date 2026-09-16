const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({window: {}, console});
[
  'constants/pedigree-indexes', 'constants/breeding-theories', 'constants/factor-definitions',
  'logic/factor/factor-map', 'logic/factor/factor-counts',
  'logic/pedigree/identity-resolver', 'logic/pedigree/pedigree-node-table',
  'logic/pedigree/pedigree-builder', 'logic/pedigree/board-refs',
  'logic/inbreed/inbreed-detector', 'logic/inbreed/inbreed-counts',
  'logic/theory/compatibility', 'logic/theory/theory-session',
  'logic/plan/plan-diagnosis', 'logic/plan/assist-diagnosis', 'logic/plan/assist-plan',
].forEach(file => vm.runInContext(read('vue/' + file + '.js'), context));
const logic = context.window.Dabimas.logic;
const horses = JSON.parse(read('json/dabimasFactor.json')).horseLists;
const brosData = JSON.parse(read('json/brosData.json')).brosData;
const nodeTable = logic.pedigree.buildNodeTable(JSON.parse(read('json/pedigreeNodes.json')));
const raw = JSON.parse(read('json/inbreed-exceptions.json'));
const options = {nodeTable, inbreedExceptions: Array.isArray(raw) ? raw : raw.exceptions,
  resolver: logic.pedigree.buildIdentityResolver({ nodeTable, customRecordsById: new Map(),
    editRecordsById: new Map(), baseHorseNodeIdById: new Map(horses.map(h => [h.id, h.nodeId])) })};
const board = horse => logic.plan.expandHorseBoard(horse, brosData);
const plain = value => JSON.parse(JSON.stringify(value));
const mare = horses.find(h => h.name === 'スターベガ' && h.sex === '1');
const sire = horses.find(h => h.name === 'スターアルタイル' && h.subName === '瓏覇');
function verify() {
  const sb = board(sire), mb = board(mare);
  const start = performance.now();
  const result = logic.plan.diagnoseStep(sb, mb, options);
  const first = performance.now() - start;
  const selected = logic.plan.buildStepSelected(sb, mb);
  const cross = logic.inbreed.judgeInbreed(selected, options.inbreedExceptions, nodeTable, options.resolver);
  const counts = logic.inbreed.buildInbreedFactorCounts(cross.sameNameGroups, cross.siblingGroups, new Array(32).fill(null));
  assert.deepEqual(plain(result.crossFactor), plain(logic.factor.dispFactorCounts(counts.factorCd)));
  assert.equal(result.dangerous, cross.dangerous);
  assert.ok(result.nitro.some(n => n !== '00'));
  assert.deepEqual(plain(result.nitro), ['01','17','12','04','03','01','00','00','01','01','00','00','00','00']);
  assert.ok(result.crosses.length > 0);
  assert.ok(result.crosses.every(c => c.name));
  assert.equal(logic.plan.diagnoseStep(board(horses.find(h => h.name === 'アイアムアカペラオー')), mb, options).crosses.length, 0);
  assert.equal(logic.plan.diagnoseStep(new Array(16).fill(null), new Array(16).fill(null), {}).crosses.length, 0);
  assert.doesNotThrow(() => logic.plan.diagnoseStep(sb, mb, {nodeTable: null, resolver: null}));
  const dangerMare = horses.find(h => h.name === 'エアグルーヴ' && h.sex === '1');
  const dangerSire = horses.find(h => h.name === 'トニービン' && h.sex === '0');
  const assist = logic.plan.createAssistPlan(Object.assign({baseMare: dangerMare, brosData}, options));
  assist.selectSire(1, dangerSire);
  assert.equal(assist.steps[0].diagnosis.dangerous, true);
  assert.equal(assist.steps[0].result.displayed, 'DANGEROUS');
  const begin = performance.now();
  for (let i = 0; i < 100; i++) logic.plan.diagnoseStep(sb, mb, options);
  console.log('[phase5a] OK', {nitro: plain(result.nitro), firstMs: first, meanMs: (performance.now() - begin) / 100});
}
if (require.main === module) verify();
module.exports = {context, logic, horses, brosData, options, board, plain, mare, sire, read};
