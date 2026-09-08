import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPublishingTools, assertReleaseInputs } from '../scripts/check-release.mjs';

const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const policy = read('release-policy.json');
const manifest = read('package.json');
const lock = read('package-lock.json');
const env = { GITHUB_REPOSITORY: 'LeMouf/konitif-temporal', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: `refs/tags/v${manifest.version}` };

test('private manifests still refuse publication even with a matching tag', () => {
  assert.throws(() => assertReleaseInputs(policy, { ...manifest, private: true }, lock, env));
});

test('candidate public manifest admits only the exact release identity', () => {
  assert.equal(manifest.private, false);
  const candidate = manifest;
  assert.doesNotThrow(() => assertReleaseInputs(policy, candidate, lock, env));
  for (const change of [{ GITHUB_REPOSITORY: 'LeMouf/foreign' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF: 'refs/tags/v0.0.0' }]) {
    assert.throws(() => assertReleaseInputs(policy, candidate, lock, { ...env, ...change }));
  }
  assert.throws(() => assertReleaseInputs(policy, candidate, { ...lock, version: '0.0.0' }, env));
});

test('publishing tools refuse obsolete versions without an automatic upgrade', () => {
  assert.doesNotThrow(() => assertPublishingTools('24.20.0', '11.5.1'));
  assert.throws(() => assertPublishingTools('22.13.0', '11.5.1'));
  assert.throws(() => assertPublishingTools('24.20.0', '11.5.0'));
});

test('workflow requires explicit enablement, exact repository and publication environment', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes("github.repository == 'LeMouf/konitif-temporal'"));
  assert.ok(workflow.includes("vars.TEMPORAL_NPM_PUBLISH_ENABLED == 'true'"));
  assert.ok(workflow.includes('environment: npm-release'));
  assert.ok(workflow.includes('git merge-base --is-ancestor HEAD origin/main'));
  assert.ok(workflow.includes('npm publish .release/package.tgz'));
});
