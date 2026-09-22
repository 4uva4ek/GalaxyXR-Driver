'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifyReleaseVersion } = require('./tools/verify-release-version.cjs');

function bumpVersion(repo, version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(version || '')) {
    throw new Error('Invalid version. Use x.y.z or x.y.z-tag.x.');
  }
  // Validate every old source before writing any of them (2026-09-22).
  // npm ci and cargo --locked also require their root package versions to agree.
  const { layout: { gui, driver } } = verifyReleaseVersion(repo);
  const edits = new Map();
  const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
  for (const file of [`${gui}/src-tauri/tauri.conf.json`, `${driver}/DriverFiles/driver.vrdrivermanifest`,
    `${gui}/package.json`, `${gui}/package-lock.json`]) {
    const before = read(file);
    const data = JSON.parse(before.replace(/^\uFEFF/, ''));
    data.version = version;
    if (file.endsWith('package-lock.json')) data.packages[''].version = version;
    const indent = before.match(/\n([ \t]+)"/)?.[1] || '  ';
    edits.set(file, JSON.stringify(data, null, indent) + '\n');
  }
  const cpp = `${driver}/src/Config/Config.cpp`;
  edits.set(cpp, read(cpp).replace(/(std::string\s+driverVersion\s*=\s*")[^"]+"/, `$1${version}"`));
  const cargo = `${gui}/src-tauri/Cargo.toml`;
  const cargoText = read(cargo);
  const packageSection = cargoText.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)[1];
  const crate = packageSection.match(/^name\s*=\s*"([^"]+)"/m)[1];
  edits.set(cargo, cargoText.replace(packageSection, packageSection.replace(/^(version\s*=\s*")[^"]+"/m, `$1${version}"`)));
  const lock = `${gui}/src-tauri/Cargo.lock`;
  edits.set(lock, read(lock).split(/(?=^\[\[package\]\])/m).map(section => {
    if (section.match(/^name\s*=\s*"([^"]+)"/m)?.[1] !== crate || /^source\s*=/m.test(section)) return section;
    return section.replace(/^(version\s*=\s*")[^"]+"/m, `$1${version}"`);
  }).join(''));
  for (const [file, text] of edits) fs.writeFileSync(path.join(repo, file), text);
  verifyReleaseVersion(repo, { expectedVersion: version });
  return [...edits.keys()];
}

module.exports = { bumpVersion };
if (require.main === module) {
  try { console.log(`Updated ${bumpVersion(__dirname, process.argv[2]).length} files to ${process.argv[2]}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
