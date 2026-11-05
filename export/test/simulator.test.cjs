const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getClassicRuntimeSourceFiles, buildMainBrightScriptTemplate } = require('../classic2d_export');
const { buildSimulatorProject, runtimeWarnings } = require('../simulator_build');
const { inside } = require('../../visual-editor/project');
test('engine build includes canonical UI runtime, resource metadata, and valid native source', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-engine-build-'));
  try {
    const scene = { formatVersion: 2, scene: { name: 'First Scene', rootNodeId: 'root' }, nodes: [{ id: 'root', type: 'SceneRoot', name: 'First Scene', parentId: null, children: [], properties: {}, components: [], transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 } }] };
    const result = buildSimulatorProject({ projectRoot: temp, scenes: [{ runtimeScene: scene, editorState: { uiScreens: [{ name: 'Title', startupScreen: true, rootNodeIds: [] }] } }] }, { buildRoot: path.join(temp, 'builds') });
    assert.ok(fs.existsSync(result.zipPath));
    assert.ok(fs.readFileSync(path.join(result.output, 'source/main.brs'), 'utf8').includes('RokuEngine_Create("First Scene")'));
    assert.ok(fs.readFileSync(path.join(result.output, 'source/engine/ui_system.brs'), 'utf8').includes('NineSlicePanel'));
    assert.ok(fs.existsSync(path.join(result.output, 'source/engine/runtime_bindings.brs')));
    const resources = JSON.parse(fs.readFileSync(path.join(result.output, 'assets/resources.json')));
    assert.equal(resources.uiScreens.Title.startupScreen, true);
    assert.ok(!getClassicRuntimeSourceFiles()['source/engine/focus_manager.brs'].includes('sub RokuEngine_MoveFocus'));
    assert.match(buildMainBrightScriptTemplate('A "quoted" scene', 'A "quoted" title'), /RokuEngine_Create\("A ""quoted"" scene"\)/);
  } finally { if (inside(os.tmpdir(), temp) && path.basename(temp).startsWith('roku-engine-build-')) fs.rmSync(temp, { recursive: true }); }
});
test('warnings distinguish supported cameras/clipping from remaining UI rotation limits', () => {
  const warnings = runtimeWarnings([{ runtimeScene: { nodes: [
    { name: 'Path', type: 'CameraPath2D' },
    { name: 'Camera', type: 'Camera2D', properties: { zoom: 2 } },
    { name: 'Menu', type: 'TextureRect', properties: { imagePath: 'res://menu.svg', clipContent: true, anchorPreset: 'center' }, transform: { rotation: 10, pivotX: 20, scaleX: 2 } }
  ] } }]);
  assert.ok(!warnings.some(w => /zoom is not applied|anchor layout needs|pivots are not applied/.test(w)));
  assert.ok(!warnings.some(w=>/CameraPath2D|clipping/.test(w)));
  assert.ok(warnings.some(w=>w.includes('rotation')));
});
