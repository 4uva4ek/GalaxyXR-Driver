'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { bumpVersion } = require('../../bump-version.js');
const { verifyReleaseVersion } = require('../verify-release-version.cjs');
const { releasePolicy, planRelease } = require('../release-policy.cjs');
const { publishRelease } = require('../publish-release.cjs');
const project = path.resolve(__dirname, '../..');
const files = ['GalaxyXRDriver/src/Config/Config.cpp', 'GalaxyXRDriver/DriverFiles/driver.vrdrivermanifest',
  ...['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'].map(f => `GalaxyXRDriverGUI/${f}`)];
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'GalaxyXR release '));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.copyFileSync(path.join(project, file), path.join(repo, file)); }
  return repo;
}
test('one bump updates all eight version fields without changing dependency versions', t => {
  const repo = fixture(t);
  const lock = JSON.parse(fs.readFileSync(path.join(repo, files[3])));
  const cargo = fs.readFileSync(path.join(repo, files[6]), 'utf8');
  assert.equal(bumpVersion(repo, '9.8.7-beta.1').length, 7);
  assert.equal(verifyReleaseVersion(repo, { tag: 'v9.8.7-beta.1' }).version, '9.8.7-beta.1');
  const after = JSON.parse(fs.readFileSync(path.join(repo, files[3])));
  delete lock.packages['']; delete after.packages[''];
  assert.deepEqual(after.packages, lock.packages);
  const dependencies = text => text.split(/(?=^\[\[package\]\])/m).filter(s => /^source\s*=/m.test(s));
  assert.deepEqual(dependencies(fs.readFileSync(path.join(repo, files[6]), 'utf8')), dependencies(cargo));
});
test('invalid bump and inconsistent inputs leave every file untouched', t => {
  const repo = fixture(t);
  fs.appendFileSync(path.join(repo, files[0]), '\nstd::string driverVersion = "bad";\n');
  const before = files.map(f => fs.readFileSync(path.join(repo, f)));
  assert.throws(() => bumpVersion(repo, '../bad'), /Invalid version/);
  assert.throws(() => bumpVersion(repo, '9.8.7'), /exactly one/);
  files.forEach((f,i) => assert.deepEqual(fs.readFileSync(path.join(repo, f)), before[i]));
});
test('only main version changes, matching tag pushes, and explicit main retries publish', () => {
  const base = { eventName: 'push', ref: 'refs/heads/main', version: '1.2.1', previousVersion: '1.2.0' };
  assert.equal(releasePolicy(base).publish, true);
  assert.equal(releasePolicy({ ...base, previousVersion: '1.2.1' }).publish, false);
  assert.equal(releasePolicy({ ...base, ref: 'refs/heads/feature' }).publish, false);
  assert.equal(releasePolicy({ ...base, eventName: 'pull_request' }).publish, false);
  assert.equal(releasePolicy({ ...base, eventName: 'workflow_dispatch' }).publish, false);
  assert.equal(releasePolicy({ ...base, eventName: 'workflow_dispatch', manualPublish: true }).publish, true);
  assert.equal(releasePolicy({ ...base, ref: 'refs/heads/feature', eventName: 'workflow_dispatch', manualPublish: true }).publish, false);
  assert.equal(releasePolicy({ ...base, ref: 'refs/tags/v1.2.1' }).publish, true);
  assert.throws(() => releasePolicy({ ...base, ref: 'refs/tags/v1.2.0' }), /Tag does not match/);
});
test('main compares against the entire push base, including multi-commit pushes', t => {
  const repo = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet'); git('add', '.');
  git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Initial');
  const before = git('rev-parse','HEAD');
  const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' };
  assert.equal(planRelease(repo, env, { before }).publish, false);
  bumpVersion(repo, '9.8.7');
  assert.equal(planRelease(repo, env, { before }).publish, true);
  assert.throws(() => planRelease(repo, env, {}), /Missing push base/);
});
function publishing(t, options = {}) {
  const directory = fixture(t), version = '1.2.1', commit = 'a'.repeat(40), calls = [];
  const prefix = 'GalaxyXRDriver-v1.2.1-Windows-x64';
  const zip = Buffer.from('test ZIP fixture');
  fs.writeFileSync(path.join(directory, `${prefix}.zip`), zip);
  fs.writeFileSync(path.join(directory, `${prefix}.zip.sha256`), `${createHash('sha256').update(zip).digest('hex')}  ${prefix}.zip\n`);
  fs.writeFileSync(path.join(directory, `${prefix}-release-notes.md`), 'Release fixture');
  const release = { id: 42, draft: true, assets: [], html_url: 'https://github.com/owner/repo/releases/tag/v1.2.1',
    upload_url: 'https://uploads.github.com/repos/owner/repo/releases/42/assets{?name,label}', ...options.release };
  const api = async (method, route, body) => {
    calls.push({ method, route, body });
    if (route.includes('/git/ref/')) return options.ref || null;
    if (route.includes('/releases/tags/')) return options.release ? release : null;
    if (route.startsWith('https://uploads.')) { if (options.uploadFails) throw new Error('Upload interrupted'); return {}; }
    if (method === 'PATCH') return { ...release, draft: false };
    return release;
  };
  return { args: { repo: 'owner/repo', version, commit, directory, api }, calls, prefix };
}
test('publication pins the built SHA and publishes only after both assets upload', async t => {
  const f = publishing(t); await publishRelease(f.args);
  assert.deepEqual(f.calls.find(c => c.route.endsWith('/git/refs')).body, { ref: 'refs/tags/v1.2.1', sha: f.args.commit });
  assert.equal(f.calls.find(c => c.method === 'POST' && c.route.endsWith('/releases')).body.draft, true);
  assert.equal(f.calls.filter(c => c.route.startsWith('https://uploads.')).length, 2);
  assert.equal(f.calls.at(-1).method, 'PATCH'); assert.equal(f.calls.at(-1).body.draft, false);
});
test('upload failure leaves a draft and a later retry can finish it', async t => {
  const fail = publishing(t, { uploadFails: true });
  await assert.rejects(publishRelease(fail.args), /Upload interrupted/);
  assert.equal(fail.calls.some(c => c.method === 'PATCH'), false);
  const retry = publishing(t, { ref: { object: { type: 'commit', sha: 'a'.repeat(40) } },
    release: { assets: [{ id: 1, name: 'GalaxyXRDriver-v1.2.1-Windows-x64.zip' }] } });
  await publishRelease(retry.args);
  assert.equal(retry.calls.filter(c => c.method === 'DELETE').length, 1);
  assert.equal(retry.calls.at(-1).body.draft, false);
});
test('reruns preserve published releases and never move a conflicting tag', async t => {
  const assets = ['.zip', '.zip.sha256'].map(ext => ({ name: `GalaxyXRDriver-v1.2.1-Windows-x64${ext}`, size: 12, state: 'uploaded' }));
  const f = publishing(t, { ref: { object: { type: 'commit', sha: 'a'.repeat(40) } }, release: { draft: false, assets } });
  assert.match(await publishRelease(f.args), /Already published/);
  assert.ok(f.calls.every(c => c.method === 'GET'));
  const conflict = publishing(t, { ref: { object: { type: 'commit', sha: 'b'.repeat(40) } } });
  await assert.rejects(publishRelease(conflict.args), /another commit/);
  assert.ok(conflict.calls.every(c => c.method === 'GET'));
});
test('bad checksum is rejected before making any GitHub request', async t => {
  const f = publishing(t); fs.appendFileSync(path.join(f.args.directory, `${f.prefix}.zip`), 'corrupt');
  await assert.rejects(publishRelease(f.args), /checksum/); assert.equal(f.calls.length, 0);
});
