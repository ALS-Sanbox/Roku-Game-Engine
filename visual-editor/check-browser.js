'use strict';
// Optional real-browser smoke check; requires a running editor and Chrome.
const { spawn } = require('node:child_process');
const path = require('node:path');
const base = process.env.RGE_EDITOR_URL || 'http://127.0.0.1:4173';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = path.resolve(__dirname, '../.visual-editor/browser-check-' + Date.now());
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const page = await (await fetch(base)).text();
  const token = page.match(/name="editor-token" content="([^"]+)"/)[1];
  const projects = await (await fetch(base + '/api/projects', { headers: { 'x-editor-token': token } })).json();
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const address = await new Promise((resolve, reject) => {
      let logs = ''; const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + logs.slice(-2000))), 15000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', chunk => { logs += chunk; const found = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (found) { clearTimeout(timer); resolve(found[1]); } });
    });
    socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0; const pending = new Map(); const errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); } }
      if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
    };
    function send(method, params = {}, sessionId) {
      const id = ++sequence;
      return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000); pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
    }
    for (const project of projects.filter(p => ['MOL', 'DOM'].includes(p.name))) {
      const opened = await (await fetch(base + '/api/project?id=' + project.id, { headers: { 'x-editor-token': token } })).json();
      const response = await fetch(base + '/api/build?id=' + project.id, { method: 'POST', headers: { 'x-editor-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ edits: opened.edits }) });
      const build = await response.json(); if (!response.ok) throw new Error(build.error);
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Runtime.enable', {}, sessionId); await send('Log.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
      errors.length = 0; await send('Page.navigate', { url: base + build.preview }, sessionId);
      let result;
      for (let attempt = 0; attempt < 50; attempt++) {
        await pause(400);
        const evaluation = await send('Runtime.evaluate', { expression: 'JSON.stringify({state:document.getElementById("state")?.textContent,logs:document.getElementById("logs")?.textContent,isolated:crossOriginIsolated})', returnByValue: true }, sessionId);
        result = JSON.parse(evaluation.result.value || '{}');
        if (result.state?.startsWith('Running') || result.state?.includes('error') || errors.length) break;
      }
      if (result?.state?.startsWith('Running')) {
        for (let attempt = 0; attempt < 25; attempt++) {
          await pause(800);
          const settled = await send('Runtime.evaluate', { expression: 'JSON.stringify({state:document.getElementById("state").textContent,logs:document.getElementById("logs").textContent,isolated:crossOriginIsolated,painted:document.getElementById("display").getContext("2d").getImageData(0,0,1280,720).data.some((v,i)=>i%4!==3&&v>0)})', returnByValue: true }, sessionId);
          result = JSON.parse(settled.result.value || '{}');
          if (result.painted || !result.state?.startsWith('Running') || errors.length) break;
        }
      }
      console.log(JSON.stringify({ game: project.name, ...result, errors }));
      if (!result?.state?.startsWith('Running') || errors.length || !result.isolated || !result.painted) throw new Error(project.name + ' browser startup failed.');
      await send('Target.closeTarget', { targetId });
    }
    await send('Browser.close');
  } finally { socket?.close(); child.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
