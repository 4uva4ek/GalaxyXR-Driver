#!/usr/bin/env node
// Compatibility entry point: run the complete readiness regression suite.
// Test-FluentFixes can also be imported by focused tests without auto-running.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [path.join(__dirname, 'Test-FluentFixes.cjs')], {
  stdio: 'inherit', env: process.env,
});
if (result.error) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
