const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, '.visual-editor/engine-smoke-project');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function node(id, type, parentId, x, y, properties = {}) {
  return { id, name: id, type, parentId, children: [], visible: true, zIndex: 0, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 }, properties, components: [] };
}
const scene = { formatVersion: 2, scene: { name: 'SmokeScene', rootNodeId: 'root' }, nodes: [
  node('root', 'SceneRoot', null, 0, 0),
  node('player', 'Node2D', 'root', 100, 150, { width: 64, height: 64, tint: '#00ff80' }),
  node('sprite', 'Sprite2D', 'player', 100, 0, { width: 64, height: 64, imagePath: 'res://images/pixel.png' }),
  node('camera', 'Camera2D', 'root', 0, 0, { enabled: true, current: true, followTargetName: 'player', followLerp: 1, zoom: 1 }),
  node('hud', 'CanvasLayer', 'root', 0, 0),
  node('panel', 'Panel', 'hud', 20, 20, { width: 400, height: 100, color: '#224466', opacity: 1 }),
  node('label', 'Label', 'hud', 30, 30, { width: 360, height: 60, text: 'Native Roku engine running', textColor: '#ffffff', fontSize: 22, opacity: 1 }),
  node('texture', 'TextureRect', 'hud', 500, 150, { width: 80, height: 80, imagePath: 'res://images/pixel.png', opacity: 1 })
] };
scene.nodes.find(n => n.id === 'player').components = [{ type: 'MoveComponent', enabled: true, vx: 60, vy: 0 }];
for (const n of scene.nodes) n.children = scene.nodes.filter(c => c.parentId === n.id).map(c => c.id);
fs.mkdirSync(fixtureRoot, { recursive: true });
fs.mkdirSync(path.join(fixtureRoot, 'images'), { recursive: true });
function pngChunk(type, data) {
  const name = Buffer.from(type), header = Buffer.alloc(4), crc = Buffer.alloc(4); header.writeUInt32BE(data.length);
  crc.writeUInt32BE(require('../visual-editor/roku-package').crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, crc]);
}
const dimensions = Buffer.alloc(13); dimensions.writeUInt32BE(1, 0); dimensions.writeUInt32BE(1, 4); dimensions[8] = 8; dimensions[9] = 6;
fs.writeFileSync(path.join(fixtureRoot, 'images/pixel.png'), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', dimensions), pngChunk('IDAT', require('node:zlib').deflateSync(Buffer.from([0, 0, 80, 255, 255]))), pngChunk('IEND', Buffer.alloc(0))]));
fs.writeFileSync(path.join(fixtureRoot, 'SmokeScene.rkscene'), JSON.stringify(scene));
async function main() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), ['.', '--engine-smoke-test', '--remote-debugging-port=0'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    const address = await new Promise((resolve, reject) => {
      let logs = ''; const timer = setTimeout(() => reject(new Error('Engine startup timed out: ' + logs)), 20000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', chunk => { logs += chunk; const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.stdout.on('data', chunk => process.stdout.write(chunk));
    });
    socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0; const waiting = new Map(); const errors = [];
    socket.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id && waiting.has(m.id)) { const cb = waiting.get(m.id); waiting.delete(m.id); m.error ? cb.reject(new Error(m.error.message)) : cb.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    };
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++seq, timer = setTimeout(() => { waiting.delete(id); reject(new Error('Timed out: ' + method)); }, 30000);
        waiting.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    const evaluate = async (session, expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await delay(1000);
    const targets = await send('Target.getTargets');
    const page = targets.targetInfos.find(t => t.type === 'page');
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await evaluate(sessionId, `window.electronAPI.openProjectInEditor(${JSON.stringify(fixtureRoot)})`);
    await delay(2500);
    console.log('EDITOR', JSON.stringify(await evaluate(sessionId, '({title:document.title,scene:typeof state!=="undefined"?state.sceneState.scene.name:null,projectRoot:state.projectRoot,status:state.status,logs:state.logs.slice(-8),viewportError:window.__viewportInitError?.message,konva:typeof Konva,buildButton:!!document.getElementById("btn-test-simulator")})')));
    if (errors.length) throw new Error(errors.join('\n'));
    const result = await evaluate(sessionId, 'testInRokuSimulator()');
    console.log('BUILD', JSON.stringify(result));
    if (!result?.success) throw new Error('Build & Test failed: ' + await evaluate(sessionId, 'state.status'));
    await delay(1000);
    const next = await send('Target.getTargets'); const preview = next.targetInfos.find(t => t.type === 'page' && t.url.includes('/simulator/'));
    if (!preview) throw new Error('Simulator window did not open.');
    const attached = await send('Target.attachToTarget', { targetId: preview.targetId, flatten: true });
    await send('Runtime.enable', {}, attached.sessionId);
    let snapshot;
    for (let i = 0; i < 30; i++) {
      await delay(500);
      snapshot = await evaluate(attached.sessionId, '({state:document.getElementById("state")?.textContent,logs:document.getElementById("logs")?.textContent,painted:document.getElementById("display")?.getContext("2d").getImageData(0,0,1280,720).data.some((v,i)=>i%4!==3&&v>0),isolated:crossOriginIsolated})');
      if (snapshot.painted || snapshot.state?.includes('error') || snapshot.state === 'Game stopped.') break;
    }
    console.log('SIMULATOR', JSON.stringify(snapshot));
    if (!snapshot.painted || !snapshot.state?.startsWith('Running') || /runtime error|compile error|error:/i.test(snapshot.logs) || errors.length) throw new Error('Engine simulator failed: ' + JSON.stringify({ snapshot, errors }));
    await delay(1000);
    const pixelExpression = '(()=>{const c=brs.getDisplayBuffer(),ctx=c.getContext("2d"),pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(c.width*x/1280),Math.floor(c.height*y/720),1,1).data);return {player:pixel(640,360),sprite:pixel(740,360),hud:pixel(390,100),texture:pixel(550,190),outsideTexture:pixel(600,190),state:document.getElementById("state").textContent};})()';
    const first = await evaluate(attached.sessionId, pixelExpression); await delay(800); const second = await evaluate(attached.sessionId, pixelExpression);
    console.log('CAMERA_AND_UI', JSON.stringify({ first, second }));
    const equal = (a, b) => JSON.stringify(a.slice(0, 3)) === JSON.stringify(b);
    if (!equal(second.player, [0, 255, 128]) || !equal(second.sprite, [0, 80, 255]) || !equal(second.hud, [34, 68, 102]) || !equal(second.texture, [0, 80, 255]) || equal(second.outsideTexture, [0, 80, 255]) || JSON.stringify(first) !== JSON.stringify(second)) throw new Error('Camera-follow, sprite or UI rendering regression.');
    await send('Target.closeTarget', { targetId: preview.targetId });
    await evaluate(sessionId, 'window.electronAPI.closeWindow(); true');
  } finally { socket?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
