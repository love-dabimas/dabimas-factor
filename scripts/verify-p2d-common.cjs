const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const base = 'abccc16c89d6cec9eb8ba413f39f794a1fe29fa1';
const read = p => fs.readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
const window = {};
let uuid = 0;
const context = vm.createContext({ window, console, Map, crypto: { randomUUID: () => 'test-' + uuid++ } });
const run = p => vm.runInContext(read(p), context);
function old(p) {
  const source = execFileSync('git', ['show', base + ':' + p], { encoding: 'utf8' });
  vm.runInContext(source, context);
}
old('vue/logic/pedigree/pedigree-builder.js');
old('vue/logic/horses/saved-horse-builder.js');
old('vue/logic/inbreed/inbreed-detector.js');
const oldBuilder = window.Dabimas.logic.pedigree.setDataForPedigree;
const oldSave = window.Dabimas.logic.horses.buildSavedHorseRecord;
const oldJudge = window.Dabimas.logic.inbreed.judgeInbreed;
for (const p of ['pedigree/pedigree-node-table', 'pedigree/identity-resolver', 'pedigree/pedigree-builder', 'horses/saved-horse-builder', 'inbreed/inbreed-detector']) run('vue/logic/' + p + '.js');
run('vue/app/methods/horse-loading.js');
run('vue/app/app-computed.js');
const pedigree = window.Dabimas.logic.pedigree;
const table = pedigree.buildNodeTable(json('json/pedigreeNodes.json'));
const details = new Map();
for (const file of fs.readdirSync('json/dabimasFactor-details')) {
  if (file.endsWith('.json')) for (const detail of json('json/dabimasFactor-details/' + file).horseDetails) details.set(detail.id, detail);
}
const horses = json('json/dabimasFactor.summary.json').horseLists.map(h => ({ ...h, ...details.get(h.id) }));
const bros = json('json/brosData.json').brosData;
const exceptions = json('json/inbreed-exceptions.json');
function board(sire, dam, builder = pedigree.setDataForPedigree) {
  uuid = 0;
  return [...builder('0', 0, sire, bros), ...builder('1', 0, dam, bros)].map((cell, index) => cell ? { ...cell, index } : null);
}
const plain = value => JSON.parse(JSON.stringify(value));
const added = new Set(['identityRef','sexKind','placeholderMareRef','mareRefs','ref','fatherRef','motherRef','pedigreeSchemaVersion']);
const withoutRefs = value => JSON.parse(JSON.stringify(value, (key, item) => added.has(key) ? undefined : item));
module.exports = { assert, fs, run, read, context, window, base, horses, bros, pedigree, table, exceptions, board, plain, withoutRefs, oldBuilder, oldSave, oldJudge, judge: window.Dabimas.logic.inbreed.judgeInbreed };
