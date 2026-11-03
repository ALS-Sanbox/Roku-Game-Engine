const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildNativeProject } = require('../native_build');
const { validateSnapshot, BuildError } = require('../build_diagnostics');
const { packageFiles } = require('../../visual-editor/roku-package');
function scene(name) { return { formatVersion: 2, scene: { name, rootNodeId: 'root' }, nodes: [{ id: 'root', name: 'Root', type: 'SceneRoot', parentId: null, children: [], transform: {}, properties: {}, components: [] }] }; }
test('build overlays unsaved edits, retains unopened transitions, selects startup, and preserves source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-native-'));
  try {
    const first = scene('First'), second = scene('Second');
    fs.writeFileSync(path.join(root, 'First.rkscene'), JSON.stringify(first));
    fs.writeFileSync(path.join(root, 'Second.rkscene'), JSON.stringify(second));
    const source = fs.readFileSync(path.join(root, 'First.rkscene'));
    first.nodes[0].properties.action = 'scene:Second';
    first.nodes[0].metadata = { unsaved: 'retained' };
    const payload = { projectRoot: root, startupScene: 'Second', scenes: [{ filePath: path.join(root, 'First.rkscene'), runtimeScene: first }] };
    const a = buildNativeProject(payload, { buildRoot: path.join(root, '.builds') });
    const b = buildNativeProject(payload, { buildRoot: path.join(root, '.builds') });
    assert.deepEqual(a.scenes, ['First', 'Second']);
    assert.match(fs.readFileSync(path.join(a.output, 'source/main.brs'), 'utf8'), /RokuEngine_Create\("Second"\)/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(a.output, 'assets/scenes/First.json'))).nodes[0].metadata.unsaved, 'retained');
    assert.deepEqual(fs.readFileSync(path.join(root, 'First.rkscene')), source);
    const content = dir => packageFiles(dir).filter(f => f !== 'build-result.json').map(f => [f, fs.readFileSync(path.join(dir, f)).toString('base64')]);
    assert.deepEqual(content(a.output), content(b.output));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('invalid references and package paths produce contextual errors before normalization', () => {
  const doc = scene('Bad');
  doc.nodes.push({ ...doc.nodes[0], name: 'Duplicate', parentId: 'missing', properties: { imagePath: 'res://../outside.png', followTargetName: 'absent', action: 'scene:Missing' } });
  const errors = validateSnapshot(os.tmpdir(), [{ runtimeScene: doc }], 'Unknown');
  for (const code of ['NODE_ID', 'PARENT_REFERENCE', 'PACKAGE_PATH', 'TARGET_REFERENCE', 'SCENE_REFERENCE', 'STARTUP_SCENE']) assert.ok(errors.some(d => d.code === code), code);
  assert.ok(errors.some(d => d.node === 'Duplicate' && d.property === 'properties.imagePath' && d.path));
});
test('sample includes converted SVG and registered scripts; compiler errors retain path and line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-sample-'));
  try {
    fs.cpSync(path.resolve(__dirname, '../../samples/collect-the-stars'), root, { recursive: true });
    const original = fs.readFileSync(path.join(root, 'assets/star.svg'));
    const result = buildNativeProject({ projectRoot: root }, { buildRoot: path.join(root, '.builds') });
    assert.equal(result.scriptCount, 1);
    assert.ok(fs.existsSync(path.join(result.output, result.conversions['assets/star.svg'])));
    assert.deepEqual(fs.readFileSync(path.join(root, 'assets/star.svg')), original);
    assert.match(fs.readFileSync(path.join(result.output, 'source/engine/user_scripts_registry.brs'), 'utf8'), /collect_Collision/);
    fs.writeFileSync(path.join(root, 'components/bad.brs'), 'sub Broken(\n');
    assert.throws(() => buildNativeProject({ projectRoot: root }, { buildRoot: path.join(root, '.builds') }), e => e instanceof BuildError && e.diagnostics.some(d => d.path?.includes('game_scripts') && d.line === 1));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
