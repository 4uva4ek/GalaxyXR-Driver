'use strict';
// Shared, fixture-testable portable staging. Use the renamed Cargo package while preserving the display name.
const fs = require('node:fs');
const path = require('node:path');
const BINARY_NAME = 'Galaxy XR Companion.exe';
function stageCompanion(sourceDir, destinationDir) {
  const source = path.join(sourceDir, 'galaxyxrdriver-gui.exe');
  if (!fs.existsSync(source) || !fs.statSync(source).isFile() || fs.statSync(source).size === 0) {
    throw new Error(`Tauri did not produce a nonempty executable: ${source}`);
  }
  fs.mkdirSync(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, BINARY_NAME);
  // Copy to a temporary name first. A failed copy cannot leave a truncated
  // executable with the final release name.
  const temporary = destination + '.tmp';
  try {
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  const oldDestination = path.join(destinationDir, 'galaxyxrdriver-gui.exe');
  if (fs.existsSync(oldDestination)) fs.unlinkSync(oldDestination);
  return destination;
}
module.exports = { stageCompanion, BINARY_NAME };
if (require.main === module) {
  if (process.argv.length !== 4) throw new Error('Usage: node stage-companion.cjs <Tauri release directory> <portable GUI directory>');
  console.log(stageCompanion(process.argv[2], process.argv[3]));
}
