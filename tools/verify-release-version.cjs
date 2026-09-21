#!/usr/bin/env node
'use strict';

// No npm dependencies: this must run before npm ci, using the Node.js that the
// Windows build already requires. Never rewrite version files or the lockfile.
const fs = require('node:fs');
const path = require('node:path');

const layouts = [
  { gui: 'GalaxyXRDriverGUI', driver: 'GalaxyXRDriver' },
  { gui: 'CustomHeadsetGUI', driver: 'CustomHeadsetOpenVR' },
];

function selectLayout(repo) {
  for (const layout of layouts) {
    const present = [layout.gui, layout.driver].map(name => fs.existsSync(path.join(repo, name)));
    if (present.some(Boolean)) {
      if (!present.every(Boolean)) {
        throw new Error(`Incomplete source layout: keep ${layout.gui} and ${layout.driver} together. Do not mix old and renamed source folders.`);
      }
      return layout;
    }
  }
  throw new Error('Could not locate the GUI and native driver folders in the repository root.');
}

function readText(repo, relative) {
  try {
    // Also accept the BOM-prefixed inputs created by older Windows tooling.
    return fs.readFileSync(path.join(repo, relative), 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    throw new Error(`Cannot read release input ${relative}: ${error.message}`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(repo, relative) {
  let result;
  try {
    result = JSON.parse(readText(repo, relative));
  } catch (error) {
    throw new Error(`Cannot parse release JSON ${relative}: ${error.message}`);
  }
  if (!isObject(result)) throw new Error(`${relative} must contain a JSON object.`);
  return result;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid ${label}: expected a nonempty string.`);
  }
  return value;
}

// Read the explicitly quoted package metadata used in the project's Cargo
// files. Bound each section so a dependency's version can never stand in for
// a missing application version. This is not a general-purpose TOML parser.
function tomlString(section, key, label) {
  const matches = [...section.matchAll(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*"([^"\\r\\n]*)"[ \\t]*(?:#.*)?\\r?$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`Could not read exactly one ${label}.`);
  return requiredString(matches[0][1], label);
}

function verifyReleaseVersion(repo, { expectedVersion = '', tag = '' } = {}) {
  repo = path.resolve(repo);
  const layout = selectLayout(repo);
  const messages = [`[version] source folders: ${layout.driver} / ${layout.gui}`];
  const configPath = `${layout.driver}/src/Config/Config.cpp`;
  const versionMatches = [...readText(repo, configPath).matchAll(/^[ \t]*std::string\s+driverVersion\s*=\s*"([^"\r\n]+)"/gm)];
  if (versionMatches.length !== 1) throw new Error(`Could not read exactly one driverVersion from ${configPath}.`);
  const version = requiredString(versionMatches[0][1], 'driverVersion');
  messages.push(`[version] C++ driver = ${version}`);

  function requireMatch(label, actual) {
    actual = requiredString(actual, `${label} version`);
    if (actual !== version) throw new Error(`${label} version mismatch: expected '${version}', found '${actual}'.`);
    messages.push(`[version] ${label} = ${actual}`);
  }

  if (expectedVersion) requireMatch('Requested release', expectedVersion);
  if (tag) {
    if (tag !== `v${version}`) throw new Error(`Git tag '${tag}' does not match project version '${version}' (expected 'v${version}').`);
    messages.push(`[version] tag = ${tag}`);
  }

  requireMatch('OpenVR manifest', readJson(repo, `${layout.driver}/DriverFiles/driver.vrdrivermanifest`).version);
  requireMatch('npm package', readJson(repo, `${layout.gui}/package.json`).version);

  const lockPath = `${layout.gui}/package-lock.json`;
  const lock = readJson(repo, lockPath);
  requireMatch('npm lockfile root', lock.version);
  // npm intentionally names the root package "". JSON.parse preserves that
  // key; PowerShell's default ConvertFrom-Json/PSCustomObject does not.
  if (!isObject(lock.packages) || !Object.hasOwn(lock.packages, '') || !isObject(lock.packages[''])) {
    throw new Error(`Could not read packages[""] (the root package entry) from ${lockPath}.`);
  }
  requireMatch('npm lockfile package', lock.packages[''].version);

  requireMatch('Tauri configuration', readJson(repo, `${layout.gui}/src-tauri/tauri.conf.json`).version);

  const cargoToml = readText(repo, `${layout.gui}/src-tauri/Cargo.toml`);
  const packageSections = [...cargoToml.matchAll(/^[ \t]*\[package\][ \t]*(?:#.*)?\r?\n([\s\S]*?)(?=^[ \t]*\[|(?![\s\S]))/gm)];
  if (packageSections.length !== 1) throw new Error('Could not read exactly one [package] section from Cargo.toml.');
  const cargoName = tomlString(packageSections[0][1], 'name', 'package name from Cargo.toml');
  requireMatch('Cargo.toml', tomlString(packageSections[0][1], 'version', 'package version from Cargo.toml'));

  const cargoLock = readText(repo, `${layout.gui}/src-tauri/Cargo.lock`);
  const lockPackages = cargoLock.split(/^[ \t]*\[\[package\]\][ \t]*(?:#.*)?\r?$/m).slice(1);
  const rootCrates = lockPackages.filter(section => {
    // The local application crate has no registry/git source. Match the name
    // from Cargo.toml, not a hardcoded name left over from the source rename.
    const name = section.match(/^[ \t]*name[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*(?:#.*)?\r?$/m);
    return name && name[1] === cargoName && !/^[ \t]*source[ \t]*=/m.test(section);
  });
  if (rootCrates.length !== 1) throw new Error(`Could not read exactly one local ${cargoName} package from Cargo.lock.`);
  requireMatch('Cargo.lock', tomlString(rootCrates[0], 'version', `${cargoName} version from Cargo.lock`));

  messages.push(`[version] all release version sources agree on ${version}`);
  return { version, layout, messages };
}

function parseArguments(args) {
  const options = { repo: path.resolve(__dirname, '..'), expectedVersion: '', tag: '', json: false, versionOnly: false };
  const valued = { '--repo': 'repo', '--expected-version': 'expectedVersion', '--tag': 'tag' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--version-only') options.versionOnly = true;
    else if (Object.hasOwn(valued, arg)) {
      if (i + 1 === args.length || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[valued[arg]] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.json && options.versionOnly) throw new Error('Use either --json or --version-only, not both.');
  return options;
}

function main(args) {
  const json = args.includes('--json');
  try {
    const options = parseArguments(args);
    const result = verifyReleaseVersion(options.repo, options);
    if (options.json) console.log(JSON.stringify({ ok: true, ...result }));
    else if (options.versionOnly) console.log(result.version);
    else console.log(result.messages.join('\n'));
    return 0;
  } catch (error) {
    // In machine mode use a safe, fixed-key JSON envelope even for errors.
    // This avoids native stderr being turned into RemoteException by PS 5.1.
    if (json) console.log(JSON.stringify({ ok: false, error: error.message }));
    else console.error(`[version] ${error.message}`);
    return 1;
  }
}

module.exports = { verifyReleaseVersion, parseArguments, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
