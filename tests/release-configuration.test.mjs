import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('standalone lock admits only the approved compiler and no runtime dependency', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(manifest.private, true);
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.devDependencies, { typescript: '5.9.3' });
  assert.deepEqual(Object.keys(lock.packages).sort(), ['', 'node_modules/typescript']);
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
  assert.equal(lock.packages['node_modules/typescript'].version, '5.9.3');
  assert.equal(lock.packages['node_modules/typescript'].integrity,
    'sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==');
});

test('build is standalone and CI does not authorize publication', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.extends, undefined);
  assert.deepEqual(config.compilerOptions.types, []);
  assert.deepEqual(config.compilerOptions.lib, ['ES2022']);
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm test/);
  assert.doesNotMatch(workflow, /id-token:|npm publish|secrets\./);
  const runtime = read('scripts/select-ci-runtime.sh');
  assert.match(runtime, /24\.20\.0/);
  assert.doesNotMatch(runtime, /curl|wget|npx|npm install/);
});
