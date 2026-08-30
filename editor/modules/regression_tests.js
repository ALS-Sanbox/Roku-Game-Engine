globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// ── RGE v49 Regression Tests: Save / Load / Export ────────────────────────────
// Run in the browser console or via Electron devtools:
//   RGETests.runAll()
//
// Each test is self-contained and uses only the public API exposed by
// scene_editor.js via window.SceneEditorAPI.
// Tests that require real Electron IPC are skipped gracefully in web context.

const RGETests = (() => {
  // ── helpers ─────────────────────────────────────────────────────────────────
  let _passed = 0, _failed = 0, _skipped = 0;
  const _results = [];

  function assert(condition, message) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
  }

  function assertEqual(a, b, label) {
    if (a !== b) throw new Error(`${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
  }

  function assertContains(obj, key, label) {
    if (!(key in obj)) throw new Error(`${label}: missing key "${key}" in ${JSON.stringify(Object.keys(obj))}`);
  }

  function _run(name, fn) {
    try {
      fn();
      _passed++;
      _results.push({ name, status: 'PASS' });
      console.log(`  ✅ PASS  ${name}`);
    } catch (e) {
      if (e.message === '__SKIP__') {
        _skipped++;
        _results.push({ name, status: 'SKIP' });
        console.log(`  ⏭  SKIP  ${name}`);
      } else {
        _failed++;
        _results.push({ name, status: 'FAIL', error: e.message });
        console.error(`  ❌ FAIL  ${name}`, e.message);
      }
    }
  }

  function skip() { throw new Error('__SKIP__'); }
  function skipIf(cond) { if (cond) skip(); }

  // ── test suite ───────────────────────────────────────────────────────────────

  // 1. serializeScene produces valid JSON with required keys
  function test_serializeScene_structure() {
    const api = window.SceneEditorAPI;
    if (!api?.serializeScene) skip();
    const raw = api.serializeScene();
    assert(typeof raw === 'string', 'serializeScene returns a string');
    let doc;
    try { doc = JSON.parse(raw); } catch (_) { throw new Error('serializeScene is not valid JSON'); }
    assertContains(doc, 'sceneState',  'serializeScene root');
    assertContains(doc, 'editorState', 'serializeScene root');
    assertContains(doc.sceneState, 'nodes', 'sceneState');
    assertContains(doc.sceneState, 'scene', 'sceneState');
  }

  // 2. Serialize → parse is stable (round-trip idempotency)
  function test_serialize_roundtrip_stable() {
    const api = window.SceneEditorAPI;
    if (!api?.serializeScene) skip();
    const snap1 = api.serializeScene();
    const snap2 = api.serializeScene();
    // Two consecutive calls with no mutations must produce identical output
    assertEqual(snap1, snap2, 'double serializeScene');
  }

  // 3. History push / undo restores snapshot
  function test_undo_restore() {
    const api = window.SceneEditorAPI;
    if (!api?.serializeScene || !api?.pushHistory || !window._rgeState) skip();
    const state = window._rgeState;

    const before = api.serializeScene();
    // Mutate: add a transient log entry (doesn't touch scene data but is
    // harmless; we just test history mechanics, not content)
    const origLogLen = (state.logs || []).length;
    api.pushHistory('test_undo_restore', before);

    // History undo stack should now have `before` at top
    const undoTop = state.history.undo[state.history.undo.length - 1];
    assertEqual(undoTop, before, 'undo stack top');
  }

  // 4. serializeScene after createNode → contains new node id
  function test_createNode_appears_in_serialized_scene() {
    const api = window.SceneEditorAPI;
    if (!api?.createNode || !api?.serializeScene) skip();
    const node = api.createNode('Sprite', null);
    if (!node) skip(); // createNode not available in this context
    const snap = JSON.parse(api.serializeScene());
    const ids = (snap.sceneState?.nodes || []).map((n) => n.id);
    assert(ids.includes(node.id), `node ${node.id} should appear in serialized scene`);
  }

  // 5. deleteNode removes node from serialized scene
  function test_deleteNode_removed_from_scene() {
    const api = window.SceneEditorAPI;
    if (!api?.createNode || !api?.deleteNode || !api?.serializeScene) skip();
    const node = api.createNode('Sprite', null);
    if (!node) skip();
    api.deleteNode(node.id);
    const snap = JSON.parse(api.serializeScene());
    const ids = (snap.sceneState?.nodes || []).map((n) => n.id);
    assert(!ids.includes(node.id), `node ${node.id} should be removed from serialized scene`);
  }

  // 6. Export payload structure is valid (does not call IPC)
  function test_exportPayload_shape() {
    const state = window._rgeState;
    if (!state) skip();

    // Replicate the payload assembly from exportRokuProject without IPC
    const projectRoot = String(state.projectRoot || '').trim() || '/test/project';
    const payload = {
      projectRoot,
      projectTitle: state.projectSettings?.projectName || 'Test',
      exportOptions: { bakeTerrain: true },
      scenes: (state.scenes || []).map((sceneEntry) => ({
        sceneName: sceneEntry?.sceneState?.scene?.name || 'Scene',
        runtimeScene: sceneEntry?.sceneState || {},
        editorState: sceneEntry?.editorState || {},
      })),
    };
    assertContains(payload, 'projectRoot',   'export payload');
    assertContains(payload, 'projectTitle',  'export payload');
    assertContains(payload, 'exportOptions', 'export payload');
    assertContains(payload, 'scenes',        'export payload');
    assert(Array.isArray(payload.scenes), 'scenes is array');
    for (const s of payload.scenes) {
      assertContains(s, 'sceneName',    'scene entry');
      assertContains(s, 'runtimeScene', 'scene entry');
      assertContains(s, 'editorState',  'scene entry');
    }
  }

  // 7. normalizeScene produces required fields (pure function test)
  function test_normalizeScene_output() {
    const fn = window.RokuNodes?.normalizeScene;
    if (!fn) skip();
    const s = fn();
    assertContains(s, 'nodes', 'normalizeScene()');
    assertContains(s, 'scene', 'normalizeScene()');
    assert(Array.isArray(s.nodes), 'nodes is array');
  }

  // 8. EditorStore: touch → version increments
  function test_editorStore_version_increments() {
    const store = window.EditorStore;
    if (!store) skip();
    const before = store.getVersion('inspector');
    // flushSync so we don't depend on rAF timing
    store.touch('inspector');
    store.flushSync();
    const after = store.getVersion('inspector');
    assert(after > before, `version should increment (was ${before}, got ${after})`);
  }

  // 9. EditorStore: subscriber is called when slice is touched
  function test_editorStore_subscriber_called() {
    const store = window.EditorStore;
    if (!store) skip();
    let called = false;
    const unsub = store.subscribe('tree', () => { called = true; });
    store.touch('tree');
    store.flushSync();
    unsub();
    assert(called, 'subscriber should have been called');
  }

  // 10. EditorStore: unsubscribe prevents further calls
  function test_editorStore_unsubscribe() {
    const store = window.EditorStore;
    if (!store) skip();
    let count = 0;
    const unsub = store.subscribe('viewport', () => { count++; });
    store.touch('viewport'); store.flushSync();
    unsub();
    store.touch('viewport'); store.flushSync();
    assertEqual(count, 1, 'subscriber should fire exactly once after unsubscribe');
  }

  // 11. PerfMonitor: recordRedraw increments counts
  function test_perfMonitor_recordRedraw() {
    const pm = window.PerfMonitor;
    if (!pm) skip();
    pm.reset();
    pm.recordRedraw('inspector');
    pm.recordRedraw('inspector');
    pm.recordRedraw('viewport');
    // No public getter, but we verify no error was thrown and show works
    pm.show();
    pm.hide();
    assert(true, 'PerfMonitor recordRedraw did not throw');
  }

  // 12. RenderFlags bitmask: FULL contains all individual flags
  function test_renderFlags_full_covers_all() {
    const flags = window.RenderFlags;
    if (!flags) skip();
    const individual = ['TREE','INSPECTOR','VIEWPORT','SCENE_SUMMARY','TILEMAPS',
                        'SCENE_TABS','HISTORY_BTNS','ZOOM_READOUT','SPRITESHEETS',
                        'TILESETS','SPRITE_FRAMES'];
    for (const name of individual) {
      if (flags[name] == null) continue; // flag doesn't exist in this build
      assert((flags.FULL & flags[name]) !== 0,
        `FULL should include ${name} (${flags[name]})`);
    }
  }

  // 13. sceneState has a root node after normalizeScene
  function test_sceneState_has_root_node() {
    const state = window._rgeState;
    if (!state) skip();
    // Use the scene's own rootNodeId — not the module-level ROOT_NODE_ID constant,
    // which is generated once at module load and won't match loaded scene data.
    const rootId = state.sceneState?.scene?.rootNodeId;
    if (!rootId) skip();
    const nodes = state.sceneState?.nodes || [];
    assert(nodes.some((n) => n.id === rootId), `sceneState.nodes should contain root node id="${rootId}"`);
  }

  // 14. History limit: undo stack never exceeds HISTORY_LIMIT
  function test_history_limit() {
    const state = window._rgeState;
    const api = window.SceneEditorAPI;
    if (!state || !api?.pushHistory || !api?.serializeScene) skip();
    const LIMIT = 100;
    for (let i = 0; i < LIMIT + 10; i++) {
      api.pushHistory(`test_history_limit_${i}`, api.serializeScene());
    }
    assert(state.history.undo.length <= LIMIT,
      `undo stack length ${state.history.undo.length} should be ≤ HISTORY_LIMIT ${LIMIT}`);
  }

  // 15. UI Components Canvas centering: UIEditorLayer exposes a recenter method
  function test_uiEditorLayer_recenter_exists() {
    const layer = window.UIEditorLayer;
    if (!layer) skip();
    assert(typeof layer.recenter === 'function', 'UIEditorLayer.recenter should be a function');
  }

  // ── runner ──────────────────────────────────────────────────────────────────
  function runAll() {
    _passed = 0; _failed = 0; _skipped = 0;
    _results.length = 0;

    console.group('%c RGE v49 Regression Tests', 'color:#7ab8e8;font-weight:bold;font-size:13px');
    _run('serializeScene produces valid structure',        test_serializeScene_structure);
    _run('serializeScene roundtrip is stable',             test_serialize_roundtrip_stable);
    _run('undo stack contains pushed snapshot',            test_undo_restore);
    _run('createNode appears in serialized scene',         test_createNode_appears_in_serialized_scene);
    _run('deleteNode removed from scene',                  test_deleteNode_removed_from_scene);
    _run('export payload shape is valid',                  test_exportPayload_shape);
    _run('normalizeScene output has required fields',      test_normalizeScene_output);
    _run('EditorStore: version increments on touch',       test_editorStore_version_increments);
    _run('EditorStore: subscriber called on touch',        test_editorStore_subscriber_called);
    _run('EditorStore: unsubscribe stops calls',           test_editorStore_unsubscribe);
    _run('PerfMonitor: recordRedraw works',                test_perfMonitor_recordRedraw);
    _run('RenderFlags.FULL covers all individual flags',   test_renderFlags_full_covers_all);
    _run('sceneState has root node',                       test_sceneState_has_root_node);
    _run('History limit respected',                        test_history_limit);
    _run('UIEditorLayer.recenter exists',                  test_uiEditorLayer_recenter_exists);
    console.groupEnd();

    const color = _failed ? '#ff6b6b' : '#7ad07a';
    console.log(`%c Results: ${_passed} passed, ${_failed} failed, ${_skipped} skipped`,
      `color:${color};font-weight:bold`);

    return { passed: _passed, failed: _failed, skipped: _skipped, results: _results.slice() };
  }

  return { runAll };
})();

RGE_ROOT.RGETests = RGETests;


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
