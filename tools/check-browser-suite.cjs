const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.visual-editor/artifacts/results');
fs.mkdirSync(output, { recursive: true });
async function run(name, args) {
  const start = Date.now();
  let log = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/check-engine.cjs', ...args], { cwd: root, windowsHide: true });
    child.stdout.on('data', chunk => { log += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { log += chunk; process.stderr.write(chunk); });
    child.on('error', reject); child.on('exit', resolve);
  });
  fs.writeFileSync(path.join(output, name + '.log'), log);
  return { name, command: 'node tools/check-engine.cjs ' + args.join(' '), passed: code === 0, exitCode: code, elapsedMs: Date.now() - start };
}
(async () => {
  const results = [];
  for (const [name, args] of [['camera-follow-hud', []], ['coordinates', ['--coordinates']], ['editable-sample', ['--sample']]]) {
    results.push(await run(name, args));
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
    if (!results.at(-1).passed) { process.exitCode = 1; break; }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
