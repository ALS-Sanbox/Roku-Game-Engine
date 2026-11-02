const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { inside } = require('../project');
test('HTTP open, save and export preserve original and reject stale source', { timeout: 20000 }, async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-editor-test-'));
  const workspace = path.resolve(__dirname, '../..');
  const storage = path.join(workspace, '.visual-editor');
  let output, buildOutput, id;
  fs.mkdirSync(path.join(fixture, 'source'));
  const original = 'sub Main()\r\n screen.DrawText("HELLO",10,20,&hffffffff,font)\r\nend sub\r\n';
  const source = path.join(fixture, 'source/main.brs');
  fs.writeFileSync(source, original); fs.writeFileSync(path.join(fixture, 'manifest'), 'title=Fixture\n');
  const child = spawn(process.execPath, [path.join(workspace, 'visual-editor/server.js')], { env: { ...process.env, RGE_EDITOR_PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      let logs = ''; const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + logs)), 10000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', chunk => { logs += chunk; const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', chunk => { logs += chunk; });
    });
    const page = await (await fetch(base)).text(); const token = page.match(/name="editor-token" content="([^"]+)"/)[1];
    const request = async (route, body) => {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'x-editor-token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await fetch(base + '/api/projects')).status, 403);
    const opened = await request('/api/open', { root: fixture }); assert.equal(opened.status, 200);
    const project = opened.body; id = project.id;
    const edits = { [project.elements[0].id]: { x: 48, text: 'EDITED' } };
    assert.equal((await request('/api/save?id=' + id, { edits })).status, 200);
    assert.deepEqual((await request('/api/project?id=' + id)).body.edits, edits);
    const exported = await request('/api/export?id=' + id, { edits }); assert.equal(exported.status, 200); output = exported.body.output;
    assert.ok(inside(path.join(storage, 'exports'), output));
    assert.equal(fs.readFileSync(source, 'utf8'), original);
    assert.match(fs.readFileSync(path.join(output, 'source/main.brs'), 'utf8'), /"EDITED",48,20/);
    assert.equal(fs.readFileSync(path.join(output, 'manifest'), 'utf8'), 'title=Fixture\n');
    const isolated = await fetch(base + '/simulator/');
    assert.equal(isolated.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(isolated.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.match(await isolated.text(), /brs.api.js/);
    if (fs.existsSync(path.join(workspace, 'tools/brs-engine/packages/browser/lib/brs.api.js'))) {
      const built = await request('/api/build?id=' + id, { edits }); assert.equal(built.status, 200);
      buildOutput = path.dirname(built.body.output);
      const buildId = new URL(built.body.preview, base).searchParams.get('build');
      const zip = await fetch(base + '/api/package?build=' + buildId, { headers: { 'x-editor-token': token } });
      assert.equal(zip.status, 200); assert.equal(Buffer.from(await zip.arrayBuffer()).readUInt32LE(), 0x04034b50);
      assert.equal((await fetch(base + '/simulator/assets/common.zip')).status, 200);
    }
    fs.writeFileSync(source, original + "' external change\r\n");
    assert.equal((await request('/api/export?id=' + id, { edits })).status, 400);
    assert.equal((await request('/api/project?id=' + id)).body.stale, true);
  } finally {
    child.kill();
    if (output && inside(path.join(storage, 'exports'), output)) fs.rmSync(output, { recursive: true });
    if (buildOutput && inside(path.join(storage, 'exports'), buildOutput)) fs.rmSync(buildOutput, { recursive: true });
    if (id && /^[a-f0-9]{16}$/.test(id)) fs.rmSync(path.join(storage, id + '.json'), { force: true });
    if (inside(os.tmpdir(), fixture) && path.basename(fixture).startsWith('roku-editor-test-')) fs.rmSync(fixture, { recursive: true });
  }
});
