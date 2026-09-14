// 実データ・メッセージ境界を DOM なしで検証する。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({ window: { Vue: { component() {} },
  location: { origin: 'http://localhost' }, addEventListener() {}, removeEventListener() {} }, console });
[
  'constants/pedigree-indexes.js', 'constants/breeding-theories.js',
  'logic/pedigree/identity-resolver.js', 'logic/pedigree/pedigree-builder.js',
  'logic/pedigree/board-refs.js', 'logic/theory/compatibility.js',
  'logic/theory/theory-session.js', 'logic/plan/plan-diagnosis.js',
  'logic/musume-link.js', 'logic/musume/custom-horse-payload.js', 'logic/musume/theory-map.js',
].forEach(file => vm.runInContext(read('vue/' + file), context, { filename: file }));
const D = context.window.Dabimas;
D.favorites = { ids: () => [], state: { available: true } };
D.workspaceSync = {};
vm.runInContext(read('vue/components/musume/musume-host.js'), context);
const { musume, musumeLink: link, plan, theory } = D.logic;
const plain = value => JSON.parse(JSON.stringify(value));
const horses = JSON.parse(read('json/dabimasFactor.json')).horseLists;
const brosData = JSON.parse(read('json/brosData.json')).brosData;
const mare = horses.find(h => h.name === 'スターベガ' && h.sex === '1');
const sires = horses.filter(h => h.sex === '0');
const boards = sires.map(h => plan.expandHorseBoard(h, brosData));
const rows = boards.map((board, i) => [link.toMusumeKey(sires[i].id), board[1].parentLine,
  board[5].parentLine, board[3].parentLine + board[7].parentLine,
  [9, 11, 13, 15].map(cell => board[cell].parentLine).join('')]);
const damLines = theory.prepareMareLines(plan.expandHorseBoard(mare, brosData));
const input = { mareKey: link.toMusumeKey(mare.id), damLines, rows };
const map = musume.buildTheoryMap(input);
const session = theory.createTheorySession({ damLines, sires: boards.map(theory.prepareSireOperands) });
const expected = sires.flatMap((horse, index) => {
  const bits = session.get(index).matched.reduce((bits, key) => bits | ({ PERFECT: 1, SUPER_PERFECT: 2, MIRACLE: 4 }[key] || 0), 0);
  return bits ? [[link.toMusumeKey(horse.id), bits]] : [];
});
assert.deepEqual(plain(map.entries), expected);
const perfect = map.entries.filter(entry => entry[1] & 1);
assert.equal(perfect.length, 6);
perfect.forEach(([key]) => assert.equal(sires.find(h => link.toMusumeKey(h.id) === key).name, 'スターアルタイル'));
assert.deepEqual(plain(map.chips), [
  { key: 'PERFECT', label: '完璧', bit: 1, pending: false },
  { key: 'SUPER_PERFECT', label: '超完璧', bit: 2, pending: false },
  { key: 'MIRACLE', label: '奇跡', bit: 4, pending: false },
  { key: 'SUPREME', label: '至高', bit: 8, pending: true },
]);
assert.ok(map.entries.every(entry => entry[1] > 0 && entry[1] < 8));
assert.equal(link.fromMusume('ch_a1b2', '0'), 'a1b2');
assert.equal(link.toMusumeKey('a1b2', '0'), 'ch_a1b2-0');
assert.equal(link.toMusumeKey('a1b2', '1'), 'ch_a1b2-1');
assert.equal(link.fromMusume('1774722353', '0'), 's1774722353');
assert.equal(link.fromMusume('ch_', '0'), null);
assert.equal(link.fromMusume('ch_a', '2'), null);
const synthetic = Array.from({ length: 16 }, (_, cell) => ({ name: 'ancestor' + cell,
  son: 'son' + cell, parentLine: String(cell).padStart(2, '0'), factors: ['01', '', ''] }));
for (const sex of ['0', '1']) {
  const payload = musume.buildCustomHorsePayload({ id: 'a1b2', sex, name: '自家製', factors: ['02'] }, synthetic);
  assert.equal(payload.paternalMig, sex === '0' ? '09111315' : '091315');
  assert.equal(payload.paternalJik, '0307');
  assert.deepEqual([payload.paternalT, payload.paternalJik.slice(0, 2), payload.paternalHt, payload.paternalJik.slice(2)], ['01', '03', '05', '07']);
  assert.deepEqual(plain(payload.pedigree), [1,2,4,8,9,5,10,11,3,6,12,13,7,14,15]
    .map(cell => ['ancestor' + cell, 'son' + cell, String(cell).padStart(2, '0'), ['01', '', '']]));
}
const altair = sires.find(h => h.name === 'スターアルタイル' && h.subName === '瓏覇');
const custom = { ...altair, id: 'a1b2', source: 'custom' };
const payload = musume.buildCustomHorsePayload(custom, plan.expandHorseBoard(custom, brosData));
assert.ok(musume.buildTheoryMap({ ...input, customHorses: [payload] }).entries.some(([key, bits]) => key === payload.key && (bits & 1)));

async function runHost() {
  const definition = D.components.MusumeHost;
  const messages = [];
  const source = { postMessage(message) { messages.push(plain(message)); } };
  const host = Object.assign(definition.data(), { $refs: { sheetFrame: { contentWindow: source } }, horsesReady: true,
    $root: { savedHorseSummaries: [custom, { source: 'edit' }], brosData, horsesBase: sires,
      $on() {}, $off() {}, ensureHorseDetail: async horse => horse, findSummaryHorse: ({ id }) => id === custom.id ? custom : null } });
  Object.entries(definition.methods).forEach(([key, method]) => host[key] = method.bind(host));
  definition.created.call(host);
  const receive = data => host.onMessage({ origin: 'http://localhost', source, data: { v: 1, ...data } });
  let picked = null;
  host.openSearch({ sex: '0', theoryMap: input, select: horse => picked = horse });
  receive({ type: 'dabimas:hello' });
  await host.sendCustomAndTheory(source);
  assert.equal(messages[0].type, 'dabimas:favorites');
  assert.ok(messages.some(m => m.type === 'dabimas:custom-horses' && m.horses.length === 1));
  assert.ok(!messages.some(m => m.type === 'dabimas:theory-map'), '候補が来るまで送らない');
  receive({ type: 'dabimas:candidates', rows });
  await host.sendCustomAndTheory(source);
  assert.equal(messages.at(-1).mareKey, input.mareKey);
  receive({ type: 'dabimas:select', horseId: 'ch_a1b2', gender: '1' });
  assert.equal(picked, null, '保存馬の実際の性別も照合');
  receive({ type: 'dabimas:select', horseId: 'ch_a1b2', gender: '0' });
  assert.strictEqual(picked, custom);
  host.$root.savedHorseSummaries = [];
  definition.watch['$root.savedHorseSummaries'].handler.call(host);
  await host.sendCustomAndTheory(source);
  assert.deepEqual(messages.at(-1).horses, [], '削除後は空リストも送り直す');
  // 取得中に母が変わった場合、旧母の理論を送らない。
  let finish;
  host.$root.savedHorseSummaries = [custom];
  host.$root.ensureHorseDetail = () => new Promise(resolve => finish = resolve);
  host.customPayloadPromise = null;
  host.openSearch({ sex: '0', theoryMap: input, select() {} });
  const pending = host.sendCustomAndTheory(source);
  host.openSearch({ sex: '1', select() {} });
  const count = messages.filter(m => m.type === 'dabimas:theory-map').length;
  finish(custom); await pending;
  assert.equal(messages.filter(m => m.type === 'dabimas:theory-map').length, count);
  host.openSearch({ index: 16, select() {} });
  assert.equal(host.target.sex, '1', '既存セル経由は維持');
  definition.beforeDestroy.call(host);
  console.log('[verify-theory-assist-phase4a] OK: 完璧6頭、純粋変換、通信順序、自家製増減、性別・非同期境界');
}
runHost().catch(error => { console.error(error); process.exitCode = 1; });
