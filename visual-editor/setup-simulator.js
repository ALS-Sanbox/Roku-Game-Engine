'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const workspace = path.resolve(__dirname, '..');
const lock = require('../tools/brs-engine.lock.json');
const root = path.join(workspace, lock.directory);
function npm(args) {
  // Only fixed commands are passed to cmd; no user input is evaluated by the shell.
  if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')], { cwd: root, stdio: 'inherit', windowsHide: true });
  else execFileSync('npm', args, { cwd: root, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(root, '.git'))) {
  fs.mkdirSync(path.dirname(root), { recursive: true });
  execFileSync('git', ['clone', lock.repository, root], { stdio: 'inherit', windowsHide: true });
  execFileSync('git', ['checkout', lock.revision], { cwd: root, stdio: 'inherit', windowsHide: true });
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (revision !== lock.revision) throw new Error('Clone revision differs from tools/brs-engine.lock.json. Review the clone before updating the lock.');
npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
npm(['run', 'build:api']);
for (const file of ['lib/brs.api.js', 'lib/brs.worker.js', 'assets/common.zip']) if (!fs.existsSync(path.join(root, 'packages/browser', file))) throw new Error('Missing build artifact: ' + file);
console.log('Simulator ready. Run npm.cmd start, then open http://127.0.0.1:4173/simulator/');
