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
  'constants/factor-definitions.js', 'logic/factor/factor-map.js',
  'logic/pedigree/identity-resolver.js', 'logic/pedigree/pedigree-builder.js',
  'logic/pedigree/board-refs.js', 'logic/horses/horse-search.js',
  'logic/theory/compatibility.js',
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
// ダビ娘の行の並びは [key, Paternal_t, Paternal_ht, Paternal_jik, Paternal_mig]。
// 盤面ではセル3が Paternal_ht、セル5・7が Paternal_jik（設計書 §1.2 の訂正）。
const rows = boards.map((board, i) => [link.toMusumeKey(sires[i].id), board[1].parentLine,
  board[3].parentLine, board[5].parentLine + board[7].parentLine,
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
// 至高はクロス判定が要るのでまだ出さない（Phase 5）。pending で出すと
// 「計算中」のまま止まって見える、と実機で指摘された。
assert.deepEqual(plain(map.chips), [
  { key: 'PERFECT', label: '完璧', bit: 1, pending: false },
  { key: 'SUPER_PERFECT', label: '超完璧', bit: 2, pending: false },
  { key: 'MIRACLE', label: '奇跡', bit: 4, pending: false },
]);
assert.ok(map.entries.every(entry => entry[1] > 0 && entry[1] < 8));
assert.equal(link.fromMusume('ch_a1b2', '0'), 'a1b2');
assert.equal(link.toMusumeKey('a1b2', '0'), 'ch_a1b2-0');
assert.equal(link.toMusumeKey('a1b2', '1'), 'ch_a1b2-1');
assert.equal(link.fromMusume('1774722353', '0'), 's1774722353');
assert.equal(link.fromMusume('ch_', '0'), null);
assert.equal(link.fromMusume('ch_a', '2'), null);
const synthetic = Array.from({ length: 16 }, (_, cell) => ({ name: 'ancestor' + cell,
  son: 'son' + cell, parentLine: String(cell).padStart(2, '0'), factors: ['短', '', ''] }));
for (const sex of ['0', '1']) {
  const payload = musume.buildCustomHorsePayload({ id: 'a1b2', sex, name: '自家製', factors: ['速', '堅', ''] }, synthetic);
  assert.deepEqual(plain(payload.factors), ['02', '09', '']);
  assert.equal(payload.paternalMig, sex === '0' ? '09111315' : '091315');
  assert.equal(payload.paternalHt, '03', 'Paternal_ht は盤面のセル3');
  assert.equal(payload.paternalJik, '0507', 'Paternal_jik は盤面のセル5と7');
  // 面白4枠はダビ娘の並び [t, jik前半, ht, jik後半] に戻ること。
  assert.deepEqual([payload.paternalT, payload.paternalJik.slice(0, 2), payload.paternalHt, payload.paternalJik.slice(2)], ['01', '05', '03', '07']);
  // 系統コードは理論に使うセルだけ。種牡馬は 1/3/5/7/9/11/13/15、繁殖牝馬は 1/3/5/7。
  const lineCells = sex === '0' ? [1, 3, 5, 7, 9, 11, 13, 15] : [1, 3, 5, 7];
  assert.deepEqual(plain(payload.pedigree), [1,2,4,8,9,5,10,11,3,6,12,13,7,14,15]
    .map(cell => ['ancestor' + cell, 'son' + cell,
      lineCells.includes(cell) ? String(cell).padStart(2, '0') : '', ['01', '', '']]));
}
// 実機で見つかった不具合の回帰。自家製馬の父は利用者が選んだ種牡馬そのものなので、
// 因子名（サブ名）と3つ目の因子を落とすと、本体の血統表と食い違って見える。
{
  const withSub = synthetic.map((entry, cell) => cell === 1
    ? { ...entry, name: 'ドリームジャーニー', subName: '央瓏', factors: ['中', '長', '長'] }
    : entry);
  const payload = musume.buildCustomHorsePayload(
    { id: 'dj', sex: '1', name: '☆ドリメゾ牝馬', factors: ['', '', ''] }, withSub);
  assert.equal(payload.name, 'ドリメゾ牝馬', '自家製馬の ☆ は外す（ダビ娘側で 自 バッジを出す）');
  assert.equal(payload.pedigree[0][0], 'ドリームジャーニー央瓏', '父は因子名まで出す');
  assert.deepEqual(plain(payload.pedigree[0][3]), ['12', '04', '04'], '父の因子は3つとも送る');
}

const factorNames = ['短','速','底','長','適','丈','早','晩','堅','難','走','中','強','雷',''];
const expectedCodes = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14',''];
const allFactors = musume.buildCustomHorsePayload({ id: 'factors', sex: '0', factors: factorNames },
  synthetic.map(entry => ({ ...entry, factors: factorNames })));
assert.deepEqual(plain(allFactors.factors), expectedCodes);
allFactors.pedigree.forEach(entry => assert.deepEqual(plain(entry[3]), expectedCodes));
const altair = sires.find(h => h.name === 'スターアルタイル' && h.subName === '瓏覇');
const custom = { ...altair, id: 'a1b2', source: 'custom' };
const payload = musume.buildCustomHorsePayload(custom, plan.expandHorseBoard(custom, brosData));
assert.ok(musume.buildTheoryMap({ ...input, customHorses: [payload] }).entries.some(([key, bits]) => key === payload.key && (bits & 1)));

// --- 実在馬でダビ娘のマスターと突き合わせる ---------------------------------
// 自家製馬にマスターは無いが、変換規則が合っているかは実在馬で検算できる。
// ダビ娘の配信物が手元に無い環境（CI など）では飛ばす。
const musumeJsonPath = path.join(root, 'dabimas-data/dist/json/horselist.json');
if (!fs.existsSync(musumeJsonPath)) {
  console.log('[verify-theory-assist-phase4a] 注意: dabimas-data/dist が無いのでマスター突き合わせは飛ばした');
} else {
  const master = new Map(JSON.parse(fs.readFileSync(musumeJsonPath, 'utf8'))
    .map(entry => [entry.card.name + '|' + entry.Gender, entry]));
  const detailDir = path.join(root, 'json/dabimasFactor-details');
  const details = new Map();
  for (const file of fs.readdirSync(detailDir).slice(0, 3)) {
    for (const detail of JSON.parse(fs.readFileSync(path.join(detailDir, file), 'utf8')).horseDetails || []) {
      details.set(detail.id, detail);
    }
  }
  let compared = 0;
  for (const horse of horses) {
    const detail = details.get(horse.id);
    if (!detail || !Array.isArray(detail.descendants) || detail.descendants.length !== 15) continue;
    const ref = master.get((horse.subName ? `${horse.name}-${horse.subName}-` : horse.name) + '|' + horse.sex);
    if (!ref) continue;
    const merged = { ...horse, descendants: detail.descendants };
    const built = musume.buildCustomHorsePayload(merged, plan.expandHorseBoard(merged, brosData));
    const where = `${ref.card.name}（${horse.sex === '1' ? '繁殖牝馬' : '種牡馬'}）`;
    assert.equal(built.paternalT, ref.Paternal_t, where + ' の Paternal_t');
    assert.equal(built.paternalHt, ref.Paternal_ht, where + ' の Paternal_ht');
    assert.equal(built.paternalJik, ref.Paternal_jik, where + ' の Paternal_jik');
    assert.equal(built.paternalMig, ref.Paternal_mig, where + ' の Paternal_mig');
    assert.equal(built.category, ref.Category, where + ' の Category');
    assert.equal(built.categoryHt, ref.Category_ht, where + ' の Category_ht');
    built.pedigree.forEach((row, i) => {
      assert.equal(row[0], ref.card.pedigree[i][0], `${where} の血統表 ${i} 行目の名前`);
      assert.equal(row[2], ref.card.pedigree[i][2], `${where} の血統表 ${i} 行目の系統コード`);
    });
    compared += 1;
    if (compared >= 150) break;
  }
  assert.ok(compared >= 100, '突き合わせた実在馬が少なすぎる: ' + compared);
  console.log('[verify-theory-assist-phase4a] マスター突き合わせ ' + compared + '頭 OK');
}

async function runHost() {
  const definition = D.components.MusumeHost;
  const messages = [];
  const source = { postMessage(message) { messages.push(plain(message)); } };
  const host = Object.assign(definition.data(), { $refs: { sheetFrame: { contentWindow: source } }, horsesReady: true,
    $root: { savedHorseSummaries: [custom, { source: 'edit' }], brosData, horsesBase: sires,
      $on() {}, $off() {}, ensureHorseDetail: async horse => horse,
      // 本物の findSummaryHorse は horsesBase（マスター）しか見ない。自家製馬を
      // ここで拾えるように見せかけると、実機で「ダビふぁく未対応」になる不具合を
      // 見逃す（実際に見逃した）。同じ振る舞いにしておく。
      findSummaryHorse: ({ id }) => sires.find(horse => horse.id === id) || null } });
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
  // 理論を出さない検索（繁殖牝馬を選ぶとき）に切り替えたら、空のチップを送って
  // 前の母のチップを消す。iframe を作り直すとダビ娘の起動に毎回 1.4〜1.8 秒かかるので、
  // 作り直しではなくメッセージで消す。
  host.$root.ensureHorseDetail = async horse => horse;
  host.customPayloadPromise = null;
  host.openSearch({ sex: '1', select() {} });
  await host.sendCustomAndTheory(source);
  const cleared = messages.at(-1);
  assert.equal(cleared.type, 'dabimas:theory-map', '理論なしの検索では空のチップを送る');
  assert.deepEqual(plain(cleared.chips), []);
  assert.deepEqual(plain(cleared.entries), []);
  host.openSearch({ index: 16, select() {} });
  assert.equal(host.target.sex, '1', '既存セル経由は維持');
  definition.beforeDestroy.call(host);
  console.log('[verify-theory-assist-phase4a] OK: 完璧6頭、純粋変換、通信順序、自家製増減、性別・非同期境界');
}
runHost().catch(error => { console.error(error); process.exitCode = 1; });
