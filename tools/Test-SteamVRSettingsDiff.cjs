const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = process.env.FLUENT_TEST_TYPESCRIPT ? require(process.env.FLUENT_TEST_TYPESCRIPT) : require('../GalaxyXRDriverGUI/node_modules/typescript');
const sourcePath = path.resolve(__dirname, '../GalaxyXRDriverGUI/src-lit/domain/steamvr-settings-diff.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const context = { exports: {} };
vm.runInNewContext(compiled.outputText, context, { filename: sourcePath });
const diff = (a, b) => JSON.parse(JSON.stringify(context.exports.steamVRSettingsDiff(a, b)));
let checks = 0;
let failures = 0;
function test(name, action) {
  ++checks;
  try { action(); }
  catch (error) { ++failures; console.error(`FAIL: ${name}: ${error.message}`); }
}
test('unchanged settings produce no writes', () => {
  const settings = { driver_vrlink: { enabled: false, value: 0, nullable: null }, steamvr: { foo: 'untouched' } };
  assert.deepEqual(diff(settings, structuredClone(settings)), []);
});
test('only changed keys sent; unrelated sections omitted', () => {
  const before = { driver_vrlink: { x: 1, keep: false }, steamvr: { foo: true } };
  const after = structuredClone(before); after.driver_vrlink.x = 2;
  assert.deepEqual(diff(before, after), [{ section: 'driver_vrlink', key: 'x', present: true, value: 2 }]);
  assert.equal(before.driver_vrlink.x, 1);
});
for (const value of [null, false, 0, '', [1, 2], { a: 1 }]) {
  test(`raw ${JSON.stringify(value)} addition distinguished from absence`, () => {
    assert.deepEqual(diff({}, { driver_vrlink: { key: value } }), [{ section: 'driver_vrlink', key: 'key', present: true, value }]);
    assert.deepEqual(diff({ driver_vrlink: { key: value } }, {}), [{ section: 'driver_vrlink', key: 'key', present: false }]);
  });
}
test('whole section removal emits individual key removals', () => {
  assert.deepEqual(diff({ driver_vrlink: { a: 1, b: 2 } }, {}), [
    { section: 'driver_vrlink', key: 'a', present: false }, { section: 'driver_vrlink', key: 'b', present: false },
  ]);
});
for (const malformed of [false, 2, 'bad', [], null]) {
  test(`reject malformed source section ${JSON.stringify(malformed)}`, () => assert.throws(() => diff({ driver_vrlink: malformed }, { driver_vrlink: { key: 1 } }), /must be an object/));
  test(`reject malformed destination section ${JSON.stringify(malformed)}`, () => assert.throws(() => diff({ driver_vrlink: { key: 1 } }, { driver_vrlink: malformed }), /must be an object/));
}
console.log(`${failures ? 'FAIL' : 'PASS'}: ${checks} settings-diff checks; ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
