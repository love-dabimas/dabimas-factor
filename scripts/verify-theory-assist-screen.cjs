// DOMなしで配線と、詳細取得・世代選択の境界を確認する。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const componentPath = 'vue/components/assist/assist-screen.js';
assert.match(html, /<assist-screen v-if="currentScreen === 'assist'"><\/assist-screen>/);
assert.ok(html.indexOf(componentPath) > html.indexOf('vue/logic/plan/assist-plan.js'));
const worker = read('service-worker.js');
assert.ok(worker.includes("BASE_PATH + '" + componentPath + "'"));
const cache = worker.match(/var CACHE_NAME = 'dabimas-factor-v(\d{8})-(\d+)'/);
assert.ok(cache && (Number(cache[1]) > 20260912 ||
  (Number(cache[1]) === 20260912 && Number(cache[2]) > 4)));
const home = read('vue/components/home/home-page.js');
assert.match(home, /@click="openAssist"/);
assert.match(home, /配合理論補助/);
assert.match(home, /currentScreen = "assist"/);
const sync = read('vue/logic/workspace-sync.js');
assert.match(sync, /\["musume", "assist"\]\.includes\(lastScreen\) \? lastScreen : screen/);
assert.match(sync, /\["home", "category", "settings", "musume", "assist"\]\.includes\(screen\)/);
// 常駐ホストの既存watchがassistへの遷移も記憶する。
assert.match(read('vue/components/musume/musume-host.js'), /workspaceSync\.rememberScreen\(screen\)/);

const context = vm.createContext({ window: { Vue: { component() {} } }, console });
[
  'constants/pedigree-indexes.js', 'constants/breeding-theories.js',
  'logic/pedigree/identity-resolver.js', 'logic/pedigree/pedigree-builder.js',
  'logic/pedigree/board-refs.js', 'logic/theory/compatibility.js',
  'logic/theory/theory-session.js', 'logic/plan/plan-diagnosis.js',
  'logic/plan/assist-plan.js', 'logic/musume-link.js', 'components/assist/assist-screen.js',
].forEach(file => vm.runInContext(read('vue/' + file), context, { filename: file }));
const definition = context.window.Dabimas.components.AssistScreen;
const horses = JSON.parse(read('json/dabimasFactor.json')).horseLists;
const mare = horses.find(h => h.name === 'スターベガ' && h.sex === '1');
const sire = horses.find(h => h.name === 'スターアルタイル' && h.subName === '瓏覇');
const brosData = JSON.parse(read('json/brosData.json')).brosData;
function mount() {
  const component = Object.assign(definition.data(), { $root: { brosData } });
  component.$root.$emit = (type, request) => {
    assert.equal(type, 'musume:open-search');
    component.request = request;
  };
  Object.entries(definition.methods).forEach(([key, method]) => component[key] = method.bind(component));
  return component;
}
async function select(component, step, detail) {
  component.openPicker(step);
  const { descendants, ...summary } = detail;
  component.$root.ensureHorseDetail = async candidate => {
    assert.strictEqual(candidate, summary);
    assert.equal(candidate.descendants, undefined);
    return detail;
  };
  assert.equal(component.request.sex, step === 0 ? '1' : '0');
  assert.equal(!!component.request.theoryMap, step > 0);
  await component.request.select(summary);
  assert.equal(component.error, '');
}
(async () => {
  const component = mount();
  component.openPicker(2);
  assert.equal(component.request, undefined);
  await select(component, 0, mare);
  assert.equal(component.plan.isSelectable(2), false);
  await select(component, 1, sire);
  assert.equal(component.theoryName(component.plan.steps[0].result), '完璧な配合');
  assert.equal(component.plan.steps[1].mareLabel, '1代目配合の繁殖牝馬');
  await select(component, 2, sire);
  await select(component, 3, sire);
  assert.ok(component.plan.steps.every(step => step.sire && step.result));
  await select(component, 1, horses.find(h => h.sex === '0' && h !== sire));
  assert.ok(component.plan.steps.slice(1).every(step => !step.sire && !step.result));
  assert.equal(component.plan.steps[2].mareLabel, null);
  assert.deepEqual(Array.from(component.plan.steps.slice(1), step => step.sireLines), [null, null]);
  assert.equal(Object.hasOwn(component, 'sireLines'), false);
  assert.equal(component.theoryName({ displayed: null }), '理論なし');
  const previous = component.plan;
  // reject / 詳細未取得 / 祖先不足は現在の計画を壊さない。
  for (const loader of [async () => { throw Error('offline'); }, async () => ({}),
    async () => ({ descendants: new Array(15).fill(null) })]) {
    component.openPicker(0);
    component.$root.ensureHorseDetail = loader;
    await component.request.select({ id: 'bad' });
    assert.ok(component.error);
    assert.equal(component.busy, false);
    assert.strictEqual(component.plan, previous);
  }
  await select(component, 0, mare);
  assert.notStrictEqual(component.plan, previous);
  assert.ok(component.plan.steps.every(step => !step.sire));
  // 二重送信と、画面を離れた後の非同期結果を無視する。
  component.openPicker(1);
  let finish;
  let calls = 0;
  component.$root.ensureHorseDetail = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = component.request.select(sire);
  await component.request.select(sire);
  assert.equal(calls, 1);
  definition.beforeDestroy.call(component);
  finish(sire);
  await pending;
  assert.equal(component.plan.steps[0].sire, null);
  // 開き直し前の選択コールバックは現在の選択を上書きしない。
  const replacement = mount();
  replacement.openPicker(0);
  const stale = replacement.request;
  await select(replacement, 0, mare);
  const currentPlan = replacement.plan;
  await stale.select(sire);
  assert.strictEqual(replacement.plan, currentPlan);
  const { plan } = context.window.Dabimas.logic;
  const expand = plan.expandHorseBoard;
  let expansions = 0;
  plan.expandHorseBoard = (...args) => { expansions++; return expand(...args); };
  await select(replacement, 1, sire);
  assert.equal(expansions, 1, '種牡馬選択1回につき盤面展開1回');
  plan.expandHorseBoard = expand;
  assert.ok(!definition.template.includes('v-autocomplete'));
  console.log('[verify-theory-assist-screen] OK: 配線、実データ3世代、選び直し、詳細取得失敗、非同期境界');
})().catch(error => { console.error(error); process.exitCode = 1; });
