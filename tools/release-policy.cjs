'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyReleaseVersion } = require('./verify-release-version.cjs');

function releasePolicy({ eventName, ref, version, previousVersion, manualPublish = false }) {
  const tag = `v${version}`;
  if (eventName === 'push' && ref.startsWith('refs/tags/')) {
    if (ref !== `refs/tags/${tag}`) throw new Error('Tag does not match the verified source version.');
    return { tag, publish: true };
  }
  const main = ref === 'refs/heads/main';
  const publish = main && ((eventName === 'push' && version !== previousVersion) ||
    (eventName === 'workflow_dispatch' && manualPublish === true));
  return { tag, publish };
}

function planRelease(repo, env, event) {
  const { version, layout } = verifyReleaseVersion(repo);
  let previousVersion = version;
  if (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main') {
    if (!/^[a-f\d]{40}$/.test(event.before || '')) throw new Error('Missing push base commit; refusing to guess a release.');
    if (/^0+$/.test(event.before)) previousVersion = null;
    else {
      const previous = execFileSync('git', ['show', `${event.before}:${layout.gui}/package.json`],
        { cwd: repo, encoding: 'utf8', windowsHide: true });
      previousVersion = JSON.parse(previous).version;
      if (typeof previousVersion !== 'string') throw new Error('Missing previous package version.');
    }
  }
  return { version, ...releasePolicy({ eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
    version, previousVersion, manualPublish: event.inputs?.publish === true || event.inputs?.publish === 'true' }) };
}

module.exports = { releasePolicy, planRelease };
if (require.main === module) {
  try {
    const plan = planRelease(path.resolve(__dirname, '..'), process.env, JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([k,v]) => `${k}=${v}\n`).join(''));
    console.log(`Version ${plan.version}: ${plan.publish ? 'publish after all build checks pass' : 'build and test only'}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
