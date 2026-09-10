// Compare the extracted detector with the exact pre-2e implementation on the same boards.
const common = require('./verify-p2d-common.cjs');
const { assert, plain, context, window } = common;
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const baseline = '28ef75e0b800c62ed3d8eee27cca3eb249ad2593';
const currentJudge = common.judge;
// Phase 2f intentionally changes the male-line implied case in this suite.
// Run those focused expectations against the current detector outside the
// phase 2e exact-comparison wrapper.
require('./verify-p2d-implied.cjs');
vm.runInContext(execFileSync('git', ['show', baseline + ':vue/logic/inbreed/inbreed-detector.js'], {encoding:'utf8'}), context);
const previousJudge = window.Dabimas.logic.inbreed.judgeInbreed;
let comparisons = 0;
const compare = (...args) => {
  const current = currentJudge(...args);
  let previous;
  const warn = console.warn;
  try { console.warn = () => {}; previous = previousJudge(...args); }
  finally { console.warn = warn; }
  assert.deepEqual(plain(current), plain(previous), 'detector comparison ' + comparisons++);
  return current;
};
common.judge = compare;
window.Dabimas.logic.inbreed.judgeInbreed = compare;
require('./verify-p2d-prior-cases.cjs');
require('./verify-p2d-regression.cjs');
require('./verify-p2d-plan.cjs');
console.log('OK: exact pre-2e detector comparison, ' + comparisons + ' evaluations');
