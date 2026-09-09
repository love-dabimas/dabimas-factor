const { assert, horses, pedigree, table, exceptions, plain, oldJudge, judge } = require('./verify-p2d-common.cjs');
const { board } = require('./verify-p2d-implied.cjs');
const resolver = pedigree.buildIdentityResolver({ nodeTable: table });
const sires = horses.filter(h => h.sex === '0'), dams = horses.filter(h => h.sex === '1');
let seed = 0x20260909;
const random = n => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed % n; };
for (let i=0; i<1500; i++) {
  const selected = board(sires[random(sires.length)], dams[random(dams.length)]);
  for (const rules of [[], exceptions]) {
    const before = oldJudge(selected,rules,table,resolver), after = judge(selected,rules,table,resolver);
    for (const key of ['count','inbreedColorIndexes','dangerous','crosses','selfAncestorWarningIndexes','sameNameSpecialChecks']) {
      assert.deepEqual(plain(after[key]),plain(before[key]),'pair '+i+' '+key);
    }
    assert.deepEqual(plain(judge(selected,rules,null,resolver)),plain(oldJudge(selected,rules,null,resolver)));
  }
}
console.log('OK: 1500 pairs, seed 0x20260909, with/without exceptions, zero differences; legacy unchanged');
