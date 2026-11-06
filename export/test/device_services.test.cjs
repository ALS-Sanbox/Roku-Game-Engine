const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once, EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DeviceServices } = require('../../deployment/device_services.cjs');

test('device ping and restart use ECP and never call uninstall', async () => {
  const requests = [];
  const server = http.createServer((req, res) => { requests.push([req.method, req.url]); res.end('<device-info><model-name>Local test</model-name></device-info>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const service = new DeviceServices({ ecpPort: server.address().port });
  try {
    const ping = await service.ping('127.0.0.1');
    assert.equal(ping.success, true); assert.equal(ping.model, 'Local test');
    assert.equal((await service.restart('127.0.0.1')).success, true);
    assert.deepEqual(requests, [['GET','/query/device-info'],['POST','/keypress/Home'],['POST','/launch/dev']]);
    assert.throws(() => service.target('not-an-ip'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('debug stream handles split UTF-8, telnet negotiation, telemetry and disconnect', async () => {
  let peer;
  const server = net.createServer(socket => { peer = socket; });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const service = new DeviceServices({ debugPort: server.address().port });
  const messages = [];
  try {
    const accepted = once(server, 'connection');
    assert.equal((await service.connect('test', '127.0.0.1', value => messages.push(value))).success, true);
    [peer] = await accepted;
    peer.write(Buffer.from([255, 251])); peer.write(Buffer.from([1]));
    const unicode = Buffer.from('café\n'); peer.write(unicode.subarray(0,4)); peer.write(unicode.subarray(4));
    peer.write('RGE_STATS {"fps":59.5,"memKb":4096,"estimated":true}\n');
    peer.write('RGE_STATS invalid-json\n');
    for (let i = 0; i < 100 && !messages.some(m => m.line === 'RGE_STATS invalid-json'); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(messages.some(m => m.type === 'log' && m.line === 'café'));
    assert.ok(messages.some(m => m.type === 'stats' && m.stats.fps === 59.5 && m.stats.estimated));
    service.disconnect('test'); assert.equal(service.sessions.size, 0);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(!messages.some(m => m.type === 'debug-disconnected'), 'intentional disconnect does not trigger reconnect');
  } finally { service.close(); peer?.destroy(); await new Promise(resolve => server.close(resolve)); }
});

test('SSDP discovery parses only Roku replies and deduplicates device addresses', async () => {
  class Socket extends EventEmitter {
    bind(port, callback) { callback(); }
    send(query, port, host, callback) {
      assert.equal(port, 1900); assert.equal(host, '239.255.255.250'); assert.match(query.toString(), /ST: roku:ecp/);
      for (const text of ['ST: roku:ecp\r\nLOCATION: http://192.168.1.9:8060/\r\n', 'ST: roku:ecp\r\nLocation: http://192.168.1.9:8060/\r\n', 'ST: other\r\nLocation: http://192.168.1.8/\r\n']) this.emit('message', Buffer.from(text));
      callback();
    }
    close() { this.closed = true; }
  }
  const socket = new Socket();
  const service = new DeviceServices({ udp: { createSocket: () => socket } });
  const result = await service.discover(10);
  assert.equal(result.success, true); assert.deepEqual(result.devices, [{ ip:'192.168.1.9' }]); assert.equal(socket.closed, true);
});

function managerContext(api) {
  const context = { window: { electronAPI: api }, console };
  context.globalThis = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../deployment/deployment_manager.js'), 'utf8'), context);
  return context.RGE_ROOT.RGEDeploymentManager;
}

test('deployment manager passes the current IPC credentials and native build snapshot', async () => {
  const calls = [];
  const manager = managerContext({
    sideloadPing: async () => ({ success:true, model:'test' }),
    sideloadBuild: async payload => { calls.push(['build',payload]); return { success:true, zipPath:'C:/fixture/game.zip', zipBytes:4096, warnings:['test warning'] }; },
    sideloadUpload: async payload => { calls.push(['upload',payload]); return { success:true }; },
    sideloadRestart: async payload => { calls.push(['restart',payload]); return { success:true }; },
    sideloadDelete: async () => { throw new Error('Restart must never uninstall'); }
  });
  manager.addDevice('192.168.1.2', 'rokudev', 'test-password');
  assert.equal(await manager.pingDevice('192.168.1.2'), true);
  const result = await manager.deploy({ ip:'192.168.1.2', exportPayload:{ projectRoot:'fixture', scenes:[{runtimeScene:{}}] } });
  assert.equal(result.status, 'done'); assert.equal(result.packageSizeKb, 4); assert.ok(result.buildWarnings.includes('test warning'));
  assert.equal(calls[0][1].projectRoot, 'fixture');
  assert.equal(calls[1][1].zipPath, 'C:/fixture/game.zip'); assert.equal(calls[1][1].user, 'rokudev'); assert.equal(calls[1][1].pass, 'test-password');
  await manager.remoteRestart('192.168.1.2'); assert.equal(calls.at(-1)[0], 'restart');
});

test('deployment build failures preserve their reason and never upload', async () => {
  let uploads = 0;
  const manager = managerContext({ sideloadBuild: async () => ({ success:false, reason:'Compile failed' }), sideloadUpload: async () => { uploads++; } });
  manager.addDevice('192.168.1.2');
  const result = await manager.deploy({ ip:'192.168.1.2', exportPayload:{ scenes:[{}] } });
  assert.equal(result.status, 'error'); assert.equal(result.error, 'Compile failed'); assert.equal(uploads, 0);
});

test('bridge disconnect cancels a pending connection without reconnecting', async () => {
  let release, timerCalls = 0;
  const context = { window: { electronAPI: { onSideloadProgress: () => () => {}, sideloadDebugDisconnect: async () => {}, sideloadPing: () => new Promise(resolve => { release = resolve; }), sideloadDebugConnect: async () => ({ success:true }) } }, setTimeout: () => { timerCalls++; }, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}, console };
  context.globalThis = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../deployment/roku_device_bridge.js'), 'utf8'), context);
  const bridge = context.RGE_ROOT.RGEDeviceBridge;
  const connecting = bridge.connect('192.168.1.2');
  await new Promise(resolve => setImmediate(resolve));
  await bridge.disconnect(); release({success:false}); await connecting;
  assert.equal(bridge.connected, false); assert.equal(timerCalls, 0);
});
