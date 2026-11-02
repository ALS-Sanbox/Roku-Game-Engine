'use strict';
const path = require('node:path');
const { fork } = require('node:child_process');
let child, ready;
function startSimulatorHost() {
  if (ready) return ready;
  child = fork(path.resolve(__dirname, '../visual-editor/server.js'), [], { silent: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', RGE_EDITOR_PORT: '0' } });
  child.stdout.on('data', data => console.log(String(data).trim()));
  child.stderr.on('data', data => console.error(String(data).trim()));
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Simulator server startup timed out.')); }, 15000);
    child.on('message', message => { if (message.type === 'ready') { clearTimeout(timer); resolve(message.port); } });
    child.once('error', error => { clearTimeout(timer); ready = undefined; reject(error); });
    child.once('exit', () => { clearTimeout(timer); ready = undefined; reject(new Error('Simulator server stopped.')); });
  });
  return ready;
}
async function registerSimulatorPackage(zipPath, name) {
  const port = await startSimulatorHost();
  return new Promise((resolve, reject) => {
    const requestId = require('node:crypto').randomUUID();
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error('Simulator registration timed out.')); }, 10000);
    function handler(message) {
      if (message.requestId !== requestId) return;
      clearTimeout(timer); child.off('message', handler);
      if (message.error) reject(new Error(message.error));
      else resolve(`http://127.0.0.1:${port}/simulator/?build=${message.build}&name=${encodeURIComponent(name + '.zip')}`);
    }
    child.on('message', handler); child.send({ type: 'register-package', requestId, zipPath });
  });
}
function stopSimulatorHost() { child?.kill(); ready = undefined; }
module.exports = { registerSimulatorPackage, stopSimulatorHost };
