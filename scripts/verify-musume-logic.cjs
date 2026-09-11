// Phase B の純粋ロジック・保存失敗・候補上限・組み込み漏れの回帰検証。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.window = { Dabimas: { logic: {}, repositories: {}, constants: { pedigreeIndexes: { INDEX_TO_ROW_NUMBER: [] } } } };
window.Vue = { observable: value => value, component() {} };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const use = file => require(path.join(root, file));
use('vue/logic/musume-link.js');
use('vue/logic/storage/unified-db.js');
use('vue/logic/horses/horse-search.js');
use('vue/components/pedigree/mobile-horse-picker.js');
use('vue/components/pedigree/desktop-horse-autocomplete.js');
const D = window.Dabimas;
const link = D.logic.musumeLink;

async function run() {
  for (let i = 0; i < 32; i++) {
    const expected = i === 16 ? '1' : [3,5,7,9,11,13,15,19,21,23,25,27,29,31].includes(i) ? 'any' : '0';
    assert.equal(link.allowedSexForCell(i), expected, 'criterion 3 cell ' + i);
    assert.equal(link.pickerUrl(i), link.BASE_URL + '?picker=1&sex=' + expected);
  }
  assert.equal(link.embedUrl(), link.BASE_URL + '?embed=1');
  assert.equal(link.toMusumeKey('s3315497239'), '3315497239-0');
  assert.equal(link.toMusumeKey('b1234'), '1234-1');
  assert.equal(link.fromMusume('3315497239', '0'), 's3315497239');
  assert.equal(link.fromMusume('1234', '1'), 'b1234');
  assert.equal(link.fromMusume('12a', '0'), null);
  assert.equal(link.fromMusume('1234', '2'), null);
  assert.equal(link.fromMusume(1234, '0'), null);
  assert.equal(link.fromMusume('0314537268', '0'), 's0314537268');
  for (const id of [null, {}, 'ch_1', 'es_1', 's12a', 123]) assert.equal(link.isMasterHorseId(id), false);
  const source = {}, origin = 'https://example.test';
  const event = { origin, source, data: { type: 'dabimas:select', v: 1 } };
  assert.equal(link.readMessage(event, [source], origin), event.data);
  for (const patch of [{origin:'https://other.test'}, {source:{}}, {data:'hello'}, {data:null},
    {data:{type:'dabimas:select',v:2}}, {data:{type:'unknown',v:1}}]) {
    assert.equal(link.readMessage({...event,...patch}, [source], origin), null);
  }
  let failRead = false, failWrite = false, failMeta = false;
  const calls = [], records = new Map([['s1',{id:'s1'}]]), meta = new Map([['favoritesOnly',true]]);
  D.repositories.favorites = {
    async getAll() { if (failRead) throw Error('read failure'); return [...records.values()]; },
    async add(id) { calls.push('add'); if (failWrite) throw Error('write failure'); records.set(id,{id}); },
    async remove(id) { calls.push('remove'); if (failWrite) throw Error('write failure'); records.delete(id); },
  };
  D.repositories.appMeta = {
    async get(key) { return meta.get(key); },
    async set(key,value) { if (failMeta) throw Error('meta failure'); meta.set(key,value); },
  };
  use('vue/logic/favorites.js');
  const f = D.favorites;
  await f.load();
  assert.equal(f.state.ready, true); assert.equal(f.state.only, true); assert.equal(f.has('s1'), true);
  const version = f.state.version;
  await f.toggle('s2'); await f.toggle('s2');
  assert.deepEqual(calls, ['add','remove']); assert.equal(f.state.version, version + 2);
  failWrite = true;
  await assert.rejects(f.toggle('s2')); assert.equal(f.has('s2'), false);
  await assert.rejects(f.toggle('s1')); assert.equal(f.has('s1'), true);
  failWrite = false;
  await Promise.all([f.toggle('s2'),f.toggle('s2')]); assert.equal(f.has('s2'), false); assert.equal(records.has('s2'),false);
  for (const [horse,pass] of [[{id:'s1'},true],[{id:'s2'},false],[{id:'ch_1'},true],[{id:'es_1'},true],[{},true]]) {
    assert.equal(f.passesFavoritesOnly(horse),pass);
  }
  const copy = f.ids(); copy.push('s999'); assert.equal(f.has('s999'),false);
  const warn = console.warn; const warnings = []; console.warn = (...args) => warnings.push(args);
  failMeta = true; await f.setOnly(false); assert.equal(f.state.only,false); failMeta = false;
  failRead = true; await f.load(); assert.equal(f.state.available,false); assert.equal(f.state.ready,true);
  const before = f.state.version; await assert.rejects(f.toggle('s3')); assert.equal(f.state.version,before);
  console.warn = warn; assert.equal(warnings.length,2);
  failRead = false; await f.load();
  const lists = Array.from({length:100},(_,i)=>({id:'s'+(i+1),name:'horse '+i}));
  for (let i = 2; i <= 70; i++) await f.toggle('s'+i);
  const mobile = D.components.MobileHorsePicker.computed.filteredMobileLists;
  const context = {lists,mobileQuery:'',normalizeSearchText:t=>t,getHorseSearchIndexText:h=>h.name};
  await f.setOnly(false); assert.equal(mobile.call(context).length,60);
  await f.setOnly(true); assert.equal(mobile.call(context).length,70);
  for (let i = 71; i <= 90; i++) await f.toggle('s'+i);
  context.mobileQuery = 'horse'; assert.equal(mobile.call(context).length,90);
  lists[0].disabled = true; assert.equal(mobile.call(context).length,89); lists[0].disabled = false;
  const desktop = D.components.DesktopHorseAutocomplete.computed.candidateItems;
  const pc = {lists,selected:[{...lists[99]}],index:0};
  await f.setOnly(false); assert.equal(desktop.call(pc), lists);
  await f.setOnly(true); assert.deepEqual(desktop.call(pc), [...lists.slice(0,90),lists[99]]);
  assert.equal(D.logic.storage.unifiedDb.DB_VERSION,3);
  assert.equal(D.logic.storage.unifiedDb.FAVORITE_STORE_NAME,'favorites');
  const html = read('index.html'), sw = read('service-worker.js');
  const cacheList = sw.slice(sw.indexOf('var urlsToCache'),sw.indexOf('];',sw.indexOf('var urlsToCache')));
  for (const match of html.matchAll(/<script src="\.\/([^"?]+\.js)"/g)) assert.ok(cacheList.includes("'"+match[1]+"'"),match[1]);
  assert.equal((html.match(/<musume-host>/g)||[]).length,1);
  console.log('musume logic regression: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
