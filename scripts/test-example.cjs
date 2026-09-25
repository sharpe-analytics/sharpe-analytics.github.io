const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { module: { exports: {} }, document: { querySelector: () => null, getElementById: () => null } };
vm.runInNewContext(fs.readFileSync('assets/site.js', 'utf8'), context);
const { calculateExample } = context.module.exports;
for (const deposit of [0, 5000, 10000]) {
 const result = calculateExample(deposit);
 assert.equal(result.value, 11000 + deposit);
 assert.equal(result.gain, 1000);
 assert.ok(Math.abs(result.twr - .1) < 1e-12);
}
const zero = calculateExample(5000, 10000, 0);
assert.equal(zero.value, 15000); assert.equal(zero.gain, 0); assert.equal(zero.twr, 0);
const loss = calculateExample(5000, 10000, -.1);
assert.equal(loss.value, 14000); assert.equal(loss.gain, -1000); assert.ok(Math.abs(loss.twr + .1) < 1e-12);
assert.throws(() => calculateExample(-1)); assert.throws(() => calculateExample(NaN));
console.log('Passed: cash-flow examples including no deposit, larger deposits, zero return and a loss.');
