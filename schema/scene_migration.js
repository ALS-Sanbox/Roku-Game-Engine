globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  'use strict';

  function assertNodesLoaded() {
    if (!window.RokuNodes) throw new Error('schema/nodes.js must be loaded before schema/scene_migration.js');
  }

  function assertResourcesLoaded() {
    if (!window.RokuSchemaResources) throw new Error('schema/resources.js must be loaded before schema/scene_migration.js');
  }

  function assertTerrainMigrationLoaded() {
    if (!window.RokuTerrainMigration) throw new Error('schema/terrain_migration.js must be loaded before schema/scene_migration.js');
  }

  function inferSceneFormatVersion(doc) {
    assertNodesLoaded();
    return window.RokuNodes.inferSceneFormatVersion(doc);
  }

  function migrateSceneDocument(doc) {
    assertNodesLoaded();
    return window.RokuNodes.migrateSceneDocument(doc);
  }

  // ── Phase 1 UI node defaults used during backfill migration ─────────────────
  var UI_NODE_DEFAULTS = {
    CanvasLayer:    { width: 1280, height: 720, opacity: 1, layer: 0, followViewport: true },
    Control:        { width: 240,  height: 64,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, clipContent: false, focusMode: 'none' },
    HBoxContainer:  { width: 320,  height: 64,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, separation: 4, alignment: 'begin' },
    VBoxContainer:  { width: 120,  height: 320, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, separation: 4, alignment: 'begin' },
    MarginContainer:{ width: 280,  height: 180, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, paddingLeft: 8, paddingTop: 8, paddingRight: 8, paddingBottom: 8 },
    ScrollContainer:{ width: 320,  height: 240, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, scrollHorizontal: 'auto', scrollVertical: 'auto', scrollOffsetX: 0, scrollOffsetY: 0 },
    Panel:          { width: 280,  height: 120, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, color: '#263247', borderColor: '#5e7594', borderWidth: 2 },
    Label:          { width: 240,  height: 36,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, text: 'Label', fontSize: 24, textColor: '#e7eef7', align: 'left', valign: 'center' },
    TextureRect:    { width: 160,  height: 90,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, imagePath: '', imageDataUrl: '', fitMode: 'contain' },
    Button:         { width: 220,  height: 56,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, text: 'Button', normalColor: '#375a7f', focusedColor: '#5b8def', pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563', disabled: false, focusMode: 'all', action: 'action' },
    CircleButton:   { width: 80,   height: 80,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, text: '', normalColor: '#375a7f', focusedColor: '#5b8def', pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563', disabled: false, focusMode: 'all', action: 'action' },
    TriangleButton: { width: 80,   height: 80,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, text: '', normalColor: '#375a7f', focusedColor: '#5b8def', pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563', disabled: false, focusMode: 'all', action: 'action' },
    OvalButton:     { width: 160,  height: 56,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, text: 'Button', normalColor: '#375a7f', focusedColor: '#5b8def', pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563', disabled: false, focusMode: 'all', action: 'action' },
    NineSlicePanel: { width: 320,  height: 200, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, imagePath: '', imageDataUrl: '', sliceLeft: 16, sliceTop: 16, sliceRight: 16, sliceBottom: 16, color: '#ffffff' },
    MenuList:       { width: 280,  height: 240, opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, items: [], selectedIndex: 0, itemHeight: 48, normalColor: '#263247', selectedColor: '#375a7f', textColor: '#e7eef7', selectedTextColor: '#ffffff', fontSize: 22, focusMode: 'all' },
    ProgressBar:    { width: 300,  height: 28,  opacity: 1, anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0, marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0, value: 0.5, minValue: 0, maxValue: 1, fillColor: '#4a90d9', trackColor: '#1a2638', borderColor: '#5e7594', borderWidth: 1, showLabel: false, labelColor: '#e7eef7', fontSize: 18 }
  };

  /**
   * migrateUiNodesInScene
   * Walks a runtime scene's node list and backfills any missing Phase-1 UI
   * properties using the canonical defaults table above. Idempotent.
   * Returns { scene, warnings[] }.
   */
  function migrateUiNodesInScene(runtimeScene) {
    var warnings = [];
    if (!runtimeScene || !Array.isArray(runtimeScene.nodes)) {
      return { scene: runtimeScene, warnings: warnings };
    }

    var nodes = runtimeScene.nodes.map(function (node) {
      if (!node || typeof node !== 'object') return node;
      var defaults = UI_NODE_DEFAULTS[node.type];
      if (!defaults) return node;

      var props = (node.properties && typeof node.properties === 'object') ? node.properties : {};
      var merged = Object.assign({}, defaults, props);

      if (props.width === undefined || props.height === undefined) {
        warnings.push({
          code: 'UI_NODE_MISSING_SIZE_BACKFILLED',
          nodeId: node.id || null,
          message: 'UI node "' + (node.name || node.id || '?') + '" (' + node.type + ') was missing width/height — backfilled from defaults.'
        });
      }

      return Object.assign({}, node, { properties: merged });
    });

    return { scene: Object.assign({}, runtimeScene, { nodes: nodes }), warnings: warnings };
  }

  /**
   * Migrate and normalize the full editor resource state.
   *
   * Pipeline (order is intentional):
   *   1. terrain_migration  — converts legacy terrain data to the v35 model.
   *      terrainId → terrainTypeId, edgeLabels/cornerLabels → neighbors{},
   *      autotileMask → neighbors{} (fallback), terrains[] → terrainTypes[],
   *      tileMetadata entries → synthesised rules[] (when rules was empty).
   *      Old fields are kept as _legacy_* until Step 2 strips them.
   *
   *   2. resources normalizer — enforces the v35 schema and removes all
   *      legacy fields (terrainId, autotileMask, edgeLabels, cornerLabels,
   *      terrains, type, enableTransforms, preferUntransformed, _legacy_*).
   *
   *   3. Validation — emits console warnings for any remaining issues.
   *      These are warnings only; the project still loads.
   *
   * Idempotent: already-migrated data passes through Steps 1–2 without
   * modification and produces no log output.
   */
  function migrateEditorResourceState(editorState) {
    assertResourcesLoaded();
    assertTerrainMigrationLoaded();

    // Step 1: legacy terrain migration
    var terrainApi = window.RokuTerrainMigration;
    var migrationResult = terrainApi.migrateEditorResourceState(editorState || {});
    var migrated = migrationResult.editorState;
    var log = migrationResult.log;

    if (log && log.length > 0) {
      console.group('[RGE v35.1] Terrain data migrated');
      log.forEach(function (msg) { console.info(msg); });
      console.groupEnd();
    }

    // Step 2: schema normalisation (strips _legacy_* and remaining old fields)
    var normalized = window.RokuSchemaResources.normalizeEditorResourceState(migrated);

    // Step 3: validation warnings (non-blocking)
    var validation = window.RokuSchemaResources.validateEditorResourceState(normalized);
    if (validation.issues && validation.issues.length > 0) {
      console.group('[RGE v35.1] Terrain validation warnings');
      validation.issues.forEach(function (msg) { console.warn(msg); });
      console.groupEnd();
    }

    return normalized;
  }

  window.RokuSceneMigration = {
    inferSceneFormatVersion,
    migrateSceneDocument,
    migrateEditorResourceState,
    migrateUiNodesInScene,
    migrateUiMeta,
    UI_NODE_DEFAULTS
  };

  /**
   * migrateUiMeta
   * Upgrades legacy uiMeta structures to the Phase-3 schema.
   * Idempotent: already-migrated data passes through unchanged.
   */
  function migrateUiMeta(uiMeta) {
    if (!uiMeta || typeof uiMeta !== 'object') return null;
    var out = Object.assign({}, uiMeta);

    // snap block
    if (!out.snap || typeof out.snap !== 'object') {
      out.snap = {};
    }
    var s = out.snap;
    if (typeof s.enabled      !== 'boolean') s.enabled      = false;
    if (typeof s.gridSize     !== 'number')  s.gridSize     = 8;
    if (typeof s.showGrid     !== 'boolean') s.showGrid     = true;
    if (typeof s.showGuides   !== 'boolean') s.showGuides   = true;
    if (typeof s.tolerance    !== 'number')  s.tolerance    = 6;
    if (!s.modes || typeof s.modes !== 'object') s.modes = {};
    var m = s.modes;
    if (typeof m.grid          !== 'boolean') m.grid          = true;
    if (typeof m.parentEdge    !== 'boolean') m.parentEdge    = true;
    if (typeof m.parentCenter  !== 'boolean') m.parentCenter  = false;
    if (typeof m.siblingEdge   !== 'boolean') m.siblingEdge   = true;
    if (typeof m.siblingCenter !== 'boolean') m.siblingCenter = false;
    if (typeof m.safeArea      !== 'boolean') m.safeArea      = true;
    if (typeof m.guides        !== 'boolean') m.guides        = true;

    // guides
    if (!Array.isArray(out.guides)) out.guides = [];

    // layers
    if (!Array.isArray(out.layers)) out.layers = [];

    // misc
    if (typeof out.showSafeArea !== 'boolean') out.showSafeArea = false;
    if (typeof out.resolution   !== 'string')  out.resolution   = '1280x720';

    return out;
  }
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
