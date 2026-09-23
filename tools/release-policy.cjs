'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { verifyReleaseVersion } = require('./verify-release-version.cjs');
const { bumpVersion } = require('../bump-version.js');

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha = /^[a-f\d]{40}$/;
function git(repo, args, env = {}) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, ...env } }).trim();
}
function versionParts(version) {
  if (!stable.test(version)) throw new Error('Automatic versioning requires a stable x.y.z version; use bump-version.js for prereleases.');
  return version.split('.').map(Number);
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}
function commitType(subject) {
  return /^(rework|feat|fix)(?:\([^\r\n)]+\))?!?:\s+\S/.exec(subject)?.[1];
}
function nextVersion(version, commits) {
  // Project policy (2026-09-23): fix = patch, feat = minor, rework = major.
  const types = commits.map(c => commitType(c.subject));
  const [major, minor, patch] = versionParts(version);
  if (types.includes('rework')) return `${major + 1}.0.0`;
  if (types.includes('feat')) return `${major}.${minor + 1}.0`;
  if (types.includes('fix')) return `${major}.${minor}.${patch + 1}`;
  return version;
}

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
  const source = git(repo, ['rev-parse', 'HEAD']);
  const manualPublish = event.inputs?.publish === true || event.inputs?.publish === 'true';
  const initial = { version, source, commit: source, generated: false,
    ...releasePolicy({ eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
      version, previousVersion: version, manualPublish }) };
  if (env.GITHUB_REF !== 'refs/heads/main' ||
      !(env.GITHUB_EVENT_NAME === 'push' || (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && manualPublish))) return initial;

  // Published tags, including explicitly versioned prereleases, are immutable.
  if (git(repo, ['tag', '--points-at', source, '--list', `v${version}`])) return initial;

  // Retry the persisted bot commit without bumping or rewriting its changelog.
  const message = git(repo, ['log', '-1', '--format=%B']);
  if (message.startsWith(`chore(release): v${version}\n`) && /^Release-source: [a-f\d]{40}$/m.test(message)) {
    return { ...initial, publish: true };
  }
  const reachableTags = git(repo, ['tag', '--merged', source, '--list', 'v*']).split('\n');
  if (!stable.test(version) && reachableTags.includes(`v${version}`)) {
    throw new Error('Change the already tagged prerelease version with bump-version.js before releasing more changes.');
  }
  const tags = reachableTags.filter(tag => stable.test(tag.slice(1))).sort((a, b) => compareVersions(b.slice(1), a.slice(1)));
  const baseTag = tags[0];
  let previousVersion, base;
  if (baseTag) { previousVersion = baseTag.slice(1); base = baseTag; }
  else {
    if (!sha.test(event.before || '') || /^0+$/.test(event.before)) {
      throw new Error('Missing release tag or push base; create an initial version tag before automatic releases.');
    }
    base = event.before;
    previousVersion = JSON.parse(git(repo, ['show', `${base}:${layout.gui}/package.json`])).version;
  }
  const commits = git(repo, ['log', '--no-merges', '--reverse', '--format=%H%x09%s', `${base}..${source}`])
    .split('\n').filter(Boolean).map(line => ({ hash: line.slice(0, 40), subject: line.slice(41) }))
    .filter(c => !/^chore\(release\): v/.test(c.subject));
  const manualVersion = version !== previousVersion;
  // Explicit prerelease bumps remain supported; automatic bumps use stable versions.
  if (manualVersion && stable.test(version) && compareVersions(version, previousVersion) < 0) throw new Error('Source version is older than the latest reachable release.');
  const planned = manualVersion ? version : nextVersion(version, commits);
  if (!manualVersion && planned === version) {
    if (manualPublish && git(repo, ['rev-parse', `${base}^{commit}`]) !== source) {
      throw new Error('No new release version: use a fix:/feat:/rework: commit or bump-version.js before publishing changed source.');
    }
    return initial;
  }
  return { ...initial, version: planned, tag: `v${planned}`, baseTag, commits,
    publish: manualVersion || planned !== version || manualPublish };
}

function changelogEntry(version, date, commits) {
  const escape = value => value.replace(/[\\`*_[\]<>]/g, '\\$&');
  const groups = [['Reworks', 'rework'], ['Features', 'feat'], ['Fixes', 'fix'], ['Other changes', undefined]];
  const lines = [`## [${version}] - ${date}`, ''];
  for (const [heading, type] of groups) {
    const selected = commits.filter(c => commitType(c.subject) === type);
    if (!selected.length) continue;
    lines.push(`### ${heading}`, '');
    for (const c of selected) {
      const description = c.subject.replace(/^(?:rework|feat|fix)(?:\(([^)]+)\))?!?:\s+/, (_, scope) => scope ? `${scope}: ` : '');
      lines.push(`- ${escape(description)} (\`${c.hash.slice(0, 7)}\`)`);
    }
    lines.push('');
  }
  if (!commits.length) lines.push('- Release metadata update.', '');
  return lines.join('\n');
}
function updateChangelog(text, entry, version) {
  // Keep authored history and manually supplied release entries intact.
  if (text.split(/\r?\n/).some(line => line.startsWith(`## [${version}]`))) return text;
  const start = text.search(/^## \[/m);
  return start < 0 ? `${text.trimEnd()}\n\n${entry}\n` : `${text.slice(0, start).trimEnd()}\n\n${entry}\n${text.slice(start)}`;
}
function prepareRelease(repo, env, event) {
  const plan = planRelease(repo, env, event);
  if (!plan.publish || env.GITHUB_REF !== 'refs/heads/main' || !plan.commits) return plan;
  if (git(repo, ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Release preparation requires a clean checkout.');
  const { version } = verifyReleaseVersion(repo);
  const files = plan.version === version ? [] : bumpVersion(repo, plan.version);
  const changelog = path.join(repo, 'CHANGELOG.md');
  const before = fs.readFileSync(changelog, 'utf8');
  const date = git(repo, ['show', '-s', '--format=%cI', plan.source]);
  const after = updateChangelog(before, changelogEntry(plan.version, new Date(date).toISOString().slice(0, 10), plan.commits), plan.version);
  if (after !== before) { fs.writeFileSync(changelog, after); files.push('CHANGELOG.md'); }
  if (!files.length) return plan;
  git(repo, ['add', '--', ...files]);
  // Fixed identity/date/message make a rerun reproduce the same release SHA.
  const identity = { GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  git(repo, ['-c', 'commit.gpgsign=false', 'commit', '-m', `chore(release): v${plan.version}\n\nRelease-source: ${plan.source}`], identity);
  return { ...plan, commit: git(repo, ['rev-parse', 'HEAD']), generated: true };
}
function persistRelease(repo, plan, ref) {
  if (!plan.publish) return false;
  if (!plan.generated) return true;
  if (ref !== 'refs/heads/main' || !sha.test(plan.source) || !sha.test(plan.commit) ||
      git(repo, ['rev-parse', 'HEAD']) !== plan.commit) throw new Error('Invalid prepared release commit.');
  git(repo, ['fetch', 'origin', 'refs/heads/main']);
  const remote = git(repo, ['rev-parse', 'FETCH_HEAD']);
  if (remote === plan.commit) return true;
  if (remote !== plan.source) {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', plan.commit, remote], { cwd: repo, windowsHide: true });
    if (ancestor.status === 0) return true;
    if (ancestor.status !== 1) throw new Error('Cannot compare prepared release with remote main.');
    console.log('Main advanced while building; the newer main run will prepare the release.');
    return false;
  }
  // Ordinary fast-forward only. A concurrent user push is never overwritten.
  git(repo, ['push', 'origin', `${plan.commit}:refs/heads/main`]);
  return true;
}
module.exports = { releasePolicy, planRelease, prepareRelease, persistRelease, nextVersion, changelogEntry, updateChangelog };
if (require.main === module) {
  try {
    const repo = path.resolve(__dirname, '..'), env = process.env;
    if (process.argv[2] === '--persist') {
      const publish = persistRelease(repo, { publish: env.RELEASE_PUBLISH === 'true', generated: env.RELEASE_GENERATED === 'true',
        commit: env.RELEASE_COMMIT, source: env.RELEASE_SOURCE }, env.GITHUB_REF);
      fs.appendFileSync(env.GITHUB_OUTPUT, `publish=${publish}\n`);
    } else {
      const plan = prepareRelease(repo, env, JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')));
      const outputs = { version: plan.version, publish: plan.publish, commit: plan.commit, source: plan.source, generated: plan.generated };
      fs.appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([k,v]) => `${k}=${v}\n`).join(''));
      fs.appendFileSync(env.GITHUB_ENV, Object.entries(outputs).map(([k,v]) => `RELEASE_${k.toUpperCase()}=${v}\n`).join(''));
      console.log(`Version ${plan.version}: ${plan.publish ? 'publish after all build checks pass' : 'build and test only'}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
