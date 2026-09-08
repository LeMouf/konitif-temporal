import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'konitif-temporal-package-'));
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false', npm_config_cache: join(temp, 'cache') },
});
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@konitif/temporal');
assert.deepEqual(manifest.dependencies ?? {}, {});
const args = ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', temp];
let packedOutput;
if (process.platform === 'win32') {
  const cli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  assert.ok(existsSync(cli), 'Installed npm CLI required; no automatic installation');
  packedOutput = run(process.execPath, [cli, ...args]);
} else {
  packedOutput = run('npm', args);
}
const [packed] = JSON.parse(packedOutput);
const files = packed.files.map(file => file.path).sort();
assert.deepEqual(files, [...manifest.files, 'package.json'].sort(), 'Archive must match the explicit file list');
assert.match(packed.filename, /^konitif-temporal-\d+\.\d+\.\d+\.tgz$/);
const archive = join(temp, packed.filename);
const bytes = readFileSync(archive);
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
assert.equal(integrity, packed.integrity);
assert.equal(bytes.length, packed.size);
const consumer = join(temp, 'consumer');
const dependency = join(consumer, 'node_modules/@konitif/temporal');
mkdirSync(dependency, { recursive: true });
// The archive was produced locally by npm, with its full file list checked above.
run('tar', ['-xzf', archive, '-C', dependency, '--strip-components=1']);
const extracted = JSON.parse(readFileSync(join(dependency, 'package.json'), 'utf8'));
assert.deepEqual(extracted, manifest);
for (const file of files.filter(file => file.endsWith('.map'))) {
  const map = JSON.parse(readFileSync(join(dependency, file), 'utf8'));
  assert.equal(map.sourcesContent?.length, map.sources.length, 'Source maps must not need omitted source files');
  assert.ok(map.sourcesContent.every(source => typeof source === 'string'));
}
copyFileSync(join(root, 'tests/contracts.test.mjs'), join(consumer, 'contracts.test.mjs'));
// The parsed report must not depend on Node's default reporter or terminal mode.
const contracts = run(process.execPath, ['--test-reporter=tap', 'contracts.test.mjs'], consumer);
assert.match(contracts, /# tests 19\b/);
assert.match(contracts, /# pass 19\b/);
assert.match(contracts, /# fail 0\b/);
copyFileSync(join(root, 'tests/consumer.mts'), join(consumer, 'consumer.mts'));
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
  '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], consumer);
console.log(JSON.stringify({ consumer: 'passed (19 ESM contracts and TypeScript)',
  integrity, bytes: bytes.length, files: files.length, evidence: temp }));
