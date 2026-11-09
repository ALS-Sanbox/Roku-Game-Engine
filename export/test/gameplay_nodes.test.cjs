const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { getSchema } = require('../project_snapshot');
const { buildNativeProject } = require('../native_build');
const { validateGameplayNode } = require('../gameplay_diagnostics');
const { validateSnapshot } = require('../build_diagnostics');
const { getClassicRuntimeSourceFiles } = require('../classic2d_export');
const schema = getSchema();
const types = ['Marker2D','Timer','TriggerZone2D','Path2D','PathFollow2D','Parallax2D','VisibilityEnabler2D','Spawner2D','FocusGroup'];

test('gameplay nodes are creatable, editable, independently defaulted and survive scene round trips', () => {
  const root = schema.createDefaultNode('SceneRoot', { id: 'root' });
  const nodes = types.map(type => schema.createDefaultNode(type, { id: type, parentId: root.id }));
  const follower = nodes.find(n => n.type === 'PathFollow2D'); follower.parentId = 'Path2D';
  const doc = { formatVersion: 2, scene: { name: 'Helpers', rootNodeId: root.id }, nodes: [root, ...nodes] };
  for (const node of doc.nodes) node.children = doc.nodes.filter(n => n.parentId === node.id).map(n => n.id);
  const normalized = schema.normalizeScene(JSON.parse(JSON.stringify(doc)));
  for (const type of types) {
    const node = normalized.nodes.find(n => n.type === type);
    assert.ok(node, type); assert.equal(node.transform.pivotX, 0); assert.equal(node.transform.pivotY, 0);
    assert.ok(schema.getCreatableNodeTypes().some(def => def.type === type));
    assert.ok(schema.getNodeFields(type).some(field => field.key.startsWith('properties.')));
  }
  assert.equal(schema.isUiNodeType('FocusGroup'), true);
  assert.equal(schema.isUiNodeType('Timer'), false);
  const a = schema.createDefaultNode('Path2D'), b = schema.createDefaultNode('Path2D');
  a.properties.points[0].x = 42; assert.equal(b.properties.points[0].x, 0);
});

test('gameplay validation catches invalid paths, timing, spawn recursion and focus targets', () => {
  const root = { id: 'root', type: 'SceneRoot', name: 'Root' };
  const pathNode = schema.createDefaultNode('Path2D', { id: 'path', parentId: 'root' });
  const follow = schema.createDefaultNode('PathFollow2D', { id: 'follow', parentId: 'path' });
  const spawn = schema.createDefaultNode('Spawner2D', { id: 'spawn', parentId: 'path', properties: { template: 'path', interval: 0, spawnPoints: ['missing'] } });
  const focus = schema.createDefaultNode('FocusGroup', { id: 'focus', parentId: 'root', properties: { initialFocus: 'follow' } });
  const timer = schema.createDefaultNode('Timer', { id: 'timer', properties: { waitTime: -1 } });
  const doc = { nodes: [root, pathNode, follow, spawn, focus, timer] };
  const errors = [];
  for (const node of doc.nodes) validateGameplayNode(doc, node, (code, message, property) => errors.push({ node: node.id, property, message }));
  for (const [node, property] of [['spawn','properties.template'],['spawn','properties.interval'],['spawn','properties.spawnPoints'],['focus','properties.initialFocus'],['timer','properties.waitTime']]) assert.ok(errors.some(e => e.node === node && e.property === property), node + property);
  assert.ok(!errors.some(e => e.node === 'follow'));
});

test('native export accepts the implemented UI shapes, containers and menu input', () => {
  const root = schema.createDefaultNode('SceneRoot', { id: 'root' });
  const missing = ['CircleButton','TriangleButton','OvalButton','HBoxContainer','VBoxContainer','MarginContainer','ScrollContainer','MenuList'];
  const nodes = [root, ...missing.map(type => schema.createDefaultNode(type, { id: type, parentId: 'root' }))];
  root.children = missing;
  const doc = { formatVersion: 2, scene: { name: 'Audit', rootNodeId: 'root' }, nodes };
  const diagnostics = validateSnapshot(os.tmpdir(), [{ runtimeScene: doc }], 'Audit');
  assert.ok(!diagnostics.some(d => d.severity === 'error'), JSON.stringify(diagnostics));
  assert.ok(!diagnostics.some(d => /^NATIVE_(UI_SHAPE|UI_LAYOUT|MENU_INPUT)$/.test(d.code)));
});

test('sample exports all helper types and event hooks in the native package', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'roku-gameplay-'));
  try {
    const root = path.resolve(__dirname, '../../samples/gameplay-helpers');
    const result = buildNativeProject({ projectRoot: root, profile: 'debug' }, { buildRoot: directory });
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'assets/project_settings.json'))).runtimeTelemetry, true);
    const scene = JSON.parse(fs.readFileSync(path.join(result.output, 'assets/scenes/Helpers.json')));
    for (const type of types) assert.ok(scene.nodes.some(n => n.type === type), type);
    const registry = fs.readFileSync(path.join(result.output, 'source/engine/user_scripts_registry.brs'), 'utf8');
    for (const hook of ['Timeout','PathFinished','ScreenEntered','ScreenExited','Spawned','CollisionEnter','MenuSelectionChanged','MenuItemSelected','AnimationEvent','AnimationStateChanged']) assert.ok(registry.includes('_' + hook + '(context)'), hook);
    assert.ok(fs.existsSync(path.join(result.output, 'source/engine/gameplay_nodes.brs')));
    assert.ok(fs.existsSync(path.join(result.output, 'source/engine/focus_group.brs')));
    for (const file of ['ui_layout.brs', 'animation_graph_player.brs']) assert.ok(fs.existsSync(path.join(result.output, 'source/engine', file)), file);
    const release = buildNativeProject({ projectRoot: root, profile: 'release', settings: { runtimeTelemetry: true } }, { buildRoot: directory });
    assert.equal(JSON.parse(fs.readFileSync(path.join(release.output, 'assets/project_settings.json'))).runtimeTelemetry, false);
    assert.throws(() => buildNativeProject({ projectRoot: root, profile: 'unknown' }, { buildRoot: directory }), /Unknown build profile/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Path2D shares waypoint editing and helper bounds exclude labels', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../editor/scene_editor.js'), 'utf8');
  const Konva = require('konva/lib/_FullInternals').Konva;
  class Text extends Konva.Group { constructor(attrs) { super({ x: attrs.x, y: attrs.y }); } }
  const context = { Konva: { ...Konva, Text }, clampOpacity: () => 1, hexWithAlpha: () => 'rgba(0,0,0,0.1)' };
  vm.createContext(context);
  for (const name of ['isEditablePathNode','ensureCameraPathPoints','getKonvaNodeBaseAttrs','getNodeOutlineAttrs','buildGameplayHelperGroup']) {
    const start = source.indexOf('function ' + name + '('), end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end < 0 ? undefined : end), context);
  }
  const n = schema.createDefaultNode('Path2D');
  assert.equal(context.isEditablePathNode(n), true);
  assert.equal(context.ensureCameraPathPoints(n).length, 2);
  const marker = context.buildGameplayHelperGroup(schema.createDefaultNode('Marker2D', { name: 'Very long marker name', transform: { scaleX: 2, scaleY: 3 } }));
  const local = marker.getClientRect({ skipTransform: true }), world = marker.getClientRect();
  assert.equal(local.width, 32); assert.equal(local.x, -16); assert.equal(world.width, 64); assert.equal(world.height, 96);
  marker.destroy();
});

// Optional local simulator dependency. The ordinary package checks remain usable
// before simulator setup; with the interpreter built these execute native code.
const interpreterPath = path.resolve(__dirname, '../../tools/brs-engine/packages/node/bin/brs.node.js');
test('native gameplay behaviors execute correctly in BrightScript', { skip: !fs.existsSync(interpreterPath) }, () => {
  const brs = require(interpreterPath);
  const runtime = Object.values(getClassicRuntimeSourceFiles()).join('\n');
  const fixture = ['gameplay_checks.brs', 'runtime_audit_checks.brs', 'remaining_gaps_checks.brs', 'collision_methods_checks.brs'].map(file => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8')).join('\n');
  const tokens = brs.Lexer.scan(runtime + '\n' + fixture);
  assert.deepEqual(tokens.errors, []);
  const parsed = brs.Parser.parse(tokens.tokens);
  assert.deepEqual(parsed.errors, []);
  let output = '';
  const interpreter = new brs.Interpreter({ stdout: { write: value => { output += value; } }, stderr: { write: value => { output += value; } }, post: false });
  interpreter.exec(parsed.statements);
  assert.deepEqual(interpreter.errors, [], output);
  assert.ok(!output.includes('FAIL:'), output);
  assert.ok(output.includes('PASS: gameplay runtime'), output);
  assert.ok(output.includes('PASS: runtime audit regressions'), output);
  assert.ok(output.includes('PASS: remaining gaps repaired'), output);
  assert.ok(output.includes('PASS: collision methods'), output);
});
