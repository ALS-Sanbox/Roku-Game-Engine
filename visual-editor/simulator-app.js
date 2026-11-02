'use strict';
const state = document.getElementById('state'), logs = document.getElementById('logs');
let current;
function log(message) { logs.textContent = (logs.textContent + message + '\n').slice(-60000); logs.scrollTop = logs.scrollHeight; }
function run() { if (current) { logs.textContent = ''; brs.execute(current.name, current.data, { entryPoint: true, debugOnCrash: false }); } }
async function start() {
  try {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('Open the simulator through npm.cmd start; cross-origin isolation is required.');
    if (!globalThis.brs) throw new Error('Simulator runtime missing. Run npm.cmd run simulator:setup first.');
    brs.subscribe('roku-editor', (event, data) => {
      if (event === 'debug') log(data.content || String(data));
      else if (event === 'error' || event === 'warning') { log(typeof data === 'string' ? data : JSON.stringify(data)); if (event === 'error') state.textContent = 'Simulator error — see BrightScript output below.'; }
      else if (event === 'started') state.textContent = 'Running ' + current?.name;
      else if (event === 'closed') state.textContent = 'Game stopped.';
    });
    await brs.initialize({ developerId: 'roku-visual-editor', displayMode: '720p', maxFps: 60, extensions: new Map() }, { debugToConsole: true });
    document.getElementById('restart').disabled = document.getElementById('stop').disabled = false;
    document.getElementById('package').disabled = false;
    state.textContent = 'Ready. Open a Roku ZIP or choose Build & test in the visual editor.';
    const build = new URLSearchParams(location.search).get('build');
    if (build) {
      const token = document.querySelector('meta[name=editor-token]').content;
      const url = `/api/package?build=${encodeURIComponent(build)}&token=${token}`;
      const response = await fetch(url); if (!response.ok) throw new Error('Game package not found. Build it again from the editor.');
      const name = new URLSearchParams(location.search).get('name') || 'game.zip';
      current = { name, data: await response.arrayBuffer() };
      const download = document.getElementById('download'); download.href = url; download.download = name; download.hidden = false;
      run();
    }
  } catch (error) { state.textContent = error.message; log(error.stack || error.message); }
}
document.getElementById('restart').onclick = run;
document.getElementById('stop').onclick = () => brs.terminate();
document.getElementById('package').onchange = async event => { try { const file = event.target.files[0]; if (!file) return; current = { name: file.name, data: await file.arrayBuffer() }; run(); } catch (error) { log(error.message); } };
start();
