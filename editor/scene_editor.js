globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// Modular Scene Editor Bootstrap
// Extracted high-frequency systems into dedicated modules for
// future incremental migration away from the monolithic editor file.

window.SceneEditorModules = {
  SelectionManager: window.SelectionManager,
  ViewportRenderer: window.ViewportRenderer,
  InputController: window.InputController,
  GizmoRenderer: window.GizmoRenderer,
  HierarchyPanel: window.HierarchyPanel,
  PropertySync: window.PropertySync,
  SceneUndoRedo: window.SceneUndoRedo,
  AssetPreview: window.AssetPreview,
  SceneSerializer: window.SceneSerializer,
  SceneRuntimeBridge: window.SceneRuntimeBridge
};

'use strict';

const {
  getCreatableNodeTypes,
  createDefaultNode,
  getCreatableComponentTypes,
  createDefaultComponent,
  getComponentDef,
  getNodeDef,
  getNodeFieldsBySection,
  getValueByPath,
  setValueByPath,
  normalizeScene,
  normalizeEditorState,
  parseSceneJson,
  validateSceneDocument,
  migrateSceneDocument,
  generateNodeId,
  ROOT_NODE_ID,
  isUiNodeType,
  resolveCTGLegacyTargetNames
} = window.RokuNodes;

const GRID_SIZE = 32;
const HISTORY_LIMIT = 100;

// Monotonically-incrementing counter bumped on every mutation.
// Used as a cheap substitute for JSON.stringify equality checks in hot paths.
let _sceneVersion = 0;
function _bumpSceneVersion() { _sceneVersion += 1; }
function _getSceneVersion() { return _sceneVersion; }
// Returns true if the scene was mutated since `vBefore` was captured.
// Use this to replace the expensive second serializeScene() call in
// before/after dirty checks: capture version before, mutate, then call
// _sceneChanged(vBefore) instead of `before !== serializeScene()`.
function _sceneChanged(vBefore) { return _sceneVersion !== vBefore; }

// ── Render Scheduler ──────────────────────────────────────────────────────────
// Extracted into editor/modules/render_scheduler.js to reduce
// monolithic editor responsibilities and centralize redraw batching.
const {
  RenderFlags,
  scheduleRender,
  flushScheduledRender,
  flushRender,
} = window.SceneRenderScheduler;

// RGE v91 fix: these rAF handle variables were used but never declared (pre-existing bug)
let _tileMapCanvasRafId = null;
let _tileMapViewportCommitRafId = null;

function scheduleTileMapCanvasRedraw(nodeOrId) {
  const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
  if (!nodeId) return;
  if (_tileMapCanvasRafId !== null) return;
  _tileMapCanvasRafId = requestAnimationFrame(() => {
    _tileMapCanvasRafId = null;
    const active = getNode?.(nodeId);
    if (active) drawTileMapEditorCanvas?.(active);
  });
}
function scheduleTileMapViewportCommit(extraFlags = 0) {
  if (_tileMapViewportCommitRafId !== null) return;
  _tileMapViewportCommitRafId = requestAnimationFrame(() => {
    _tileMapViewportCommitRafId = null;
    scheduleRender(RenderFlags.VIEWPORT | extraFlags);
  });
}
function ensureSavedBrushIdentity(group, index = 0) {
  if (!group || typeof group !== 'object') return '';
  if (!group.id) group.id = `bg_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
  return group.id;
}
function isSavedBrushActive(group) {
  const id = ensureSavedBrushIdentity(group);
  return !!id && state.tilemapEditor.activeBrushGroupId === id;
}

const state = {
  scenes: [],
  activeSceneIndex: -1,
  sceneState: normalizeScene(),
  editorState: normalizeEditorState(null, normalizeScene()),
  selectedId: ROOT_NODE_ID,
  selectedIds: [ROOT_NODE_ID],
  imageCache: new Map(),
  status: 'Ready.',
  viewport: { x: 0, y: 0, scale: 1, isPanning: false, panStart: null },
  tool: 'select',
  showGrid: true,
  snapEnabled: false,
  history: { undo: [], redo: [], applying: false },
  projectRoot: '',
  spritesheets: [],
  selectedSheetId: null,
  spriteFramesLibraries: [],
  selectedSpriteFramesId: null,
  nineSliceStyles: [],
  selectedNineSliceStyleId: null,
  uiScreens: [],
  selectedUIScreenId: null,
  uiTransitionPresets: [],
  selectedUITransitionPresetId: null,
  uiOptionDefs: [],
  uiHighScoreTables: [],
  logs: [],
  spritePanel: {
    searchQuery: '',
    sortMode: 'name-asc',
    categoryFilter: ''
  },
  spriteEditor: {
    showGrid: true,
    selectedTileIndex: 0,
    selectedFrameIndex: -1,
    animationFrames: [],
    previewFps: 8,
    previewTimer: null,
    previewTick: 0,
    playbackDirection: 1,
    isPlaying: false,
    zoom: 1,
    editingClipName: null,
    pendingNewClipName: null
  },
  tree: { expanded: { [ROOT_NODE_ID]: true } },
  contextMenu: { nodeId: null, x: 0, y: 0 },
  selectionDrag: null,
  statusLogTarget: null,
  statusFlashTimer: null,
  ui: { sceneMenuOpen: false, fileMenuOpen: false, sceneRenameIndex: null, nodeRenameId: null, inspectorCollapsed: new Set(), activeWorkspace: 'game' },
  instanceEditor: { selectedSourceNodeByInstance: {} },
  startupState: { recentScenes: [], recoveries: [] },
  cameraPreview: { enabled: true, selectedCameraId: null,
    overlays: { showFrame: true, showDeadZone: true, showLookAhead: true, showBounds: true, showLabels: true, showZones: true, showPaths: true,
      showTargetGroups: true },
    gizmo: { active: false, type: null, handle: null, nodeId: null, startWorld: null, startProps: null },
  },
  cameraPathEditor: { selectedNodeId: null, selectedPointIndices: new Set(), drag: null, contextMenu: null, previewPlaying: false, previewPaused: false, previewTime: 0, previewLoop: false, _previewRaf: null, _previewTs: 0, _previewNodeId: null, _previewMarker: null },
  filesystem: { searchQuery: '', selectedPath: '', expanded: {}, renamingPath: '', creating: null },
  document: {
    currentScenePath: '',
    currentEditStatePath: '',
    pendingRecoveryId: '',
    lastSavedSnapshot: '',
    lastAutosaveSnapshot: '',
    autosaveTimer: null,
    dirty: false
  },
  instanceCache: new Map(),
  projectSettings: {
    projectName: 'RokuEngine Game',
    input: {
      movement: 'standard',
      action: 'ok',
      pause: 'play',
      actionMap: { move_up: 'up', move_down: 'down', move_left: 'left', move_right: 'right', action: 'ok', pause: 'play', back: 'back' }
    },
    screen: { width: 1280, height: 720, mode: '720p', fullscreen: true }
  },
  tilesets: [],
  selectedTilesetId: null,
  tilemapEditor: {
    tool: 'paint',
    paintMode: 'tile',
    terrainUiMode: 'brush',
    terrainPanelTab: 'terrains',
    selectedTerrainSetId: null,
    selectedTerrainId: null,
    selectedTileIndex: 0,
    selectedTerrain: 1,
    collisionValue: 1,
    hoverCol: -1,
    hoverRow: -1,
    isPointerDown: false,
    lastAppliedCellKey: '',
    activeLayerId: null,
    terrainFillSettings: { randomizeInterior: true, respectProbability: true },
    terrainDebug: false,
    terrainDebugInfo: null,
    terrainActionDepth: 0,
    terrainActionBefore: '',
    terrainActionLabel: '',
    showTerrainOverlay: true,
    showCollisionOverlay: true,
    viewportPaint: { active: false, nodeId: null, beforeSnapshot: '', pointerId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1, previewCells: [] },
    viewportGroupSelect: { active: false, nodeId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1 },
    lastPick: null,
    brushGroup: null,
    activeBrushGroupId: null,
    savedBrushGroups: []
  },
  tilesetTerrainEditor: {
    selectedTerrainSetId: null,
    selectedTerrainId: null,
    tool: 'paint',
    hoverTarget: null,
    selectedTileIndices: [],
    lastAnchorIndex: 0,
    dragSelect: { active: false, anchorIndex: null, append: false, baseSelection: [], moved: false, suppressClick: false },
    overlayRules: false,
    overlayCollision: false
  }
};

// ── DOM refs ───────────────────────────────────────────────────────────
const sceneTreeEl        = document.getElementById('scene-tree');
const inspectorEl        = document.getElementById('inspector');
const inspectorEmpty     = document.getElementById('inspector-empty');
const logViewEl          = document.getElementById('log-view');
const nodeSummaryEl      = document.getElementById('node-summary');
const statusbarEl        = document.getElementById('statusbar');
const zoomReadoutEl      = document.getElementById('zoom-readout');
const workspaceMetaEl    = document.getElementById('workspace-meta');
const sceneTabsEl        = document.getElementById('scene-tabs');
const filesystemEl       = document.getElementById('filesystem');
const sheetListEl        = document.getElementById('sheet-list');
const audioListEl        = document.getElementById('audio-list');
const sheetSearchEl      = document.getElementById('sheet-search');
const sheetSortEl        = document.getElementById('sheet-sort');
const spriteTileGridEl   = document.getElementById('sprite-tile-grid');
const sheetCanvasEl      = document.getElementById('sheet-canvas');
const sheetSelectionMetaEl = document.getElementById('sheet-selection-meta');

const tsItemsEl          = document.getElementById('ts-items');
const tsMetaEl           = document.getElementById('ts-meta');
const tsSheetSelectEl    = document.getElementById('ts-sheet-select');
const tsTileWEl          = document.getElementById('ts-tile-w');
const tsTileHEl          = document.getElementById('ts-tile-h');
const tsPaddingEl        = document.getElementById('ts-padding');
const tsPaletteGridEl    = document.getElementById('ts-palette-grid');
const tsTerrainPanelEl   = document.getElementById('ts-terrain-panel');
const tmTilesetSelectEl  = document.getElementById('tm-tileset-select');
const tmMapWEl           = document.getElementById('tm-map-w');
const tmMapHEl           = document.getElementById('tm-map-h');
const tmTileWEl          = document.getElementById('tm-tile-w');
const tmTileHEl          = document.getElementById('tm-tile-h');
const tmShowGridEl       = document.getElementById('tm-show-grid');
const tmMetaEl           = document.getElementById('tm-meta');
const tmCanvasEl         = document.getElementById('tm-canvas');
const tmPaletteGridEl    = document.getElementById('tm-palette-grid');
const tmTerrainPanelEl   = document.getElementById('tm-terrain-panel');

// SpriteFrames panel
const sfAnimItemsEl      = document.getElementById('sf-anim-items');
const sfFrameStripEl     = document.getElementById('sf-frame-strip');
const sfPreviewCanvasEl  = document.getElementById('sf-preview-canvas');
const sfPreviewMetaEl    = document.getElementById('sf-preview-meta');
const sfFpsEl            = document.getElementById('sf-fps');
const sfPlaybackModeEl   = document.getElementById('sf-playback-mode');
const sfTimelineEl       = document.getElementById('sf-timeline');
const sfTimelineCurrentEl = document.getElementById('sf-timeline-current');
const sfPlayBtnEl        = document.getElementById('sf-btn-play');


let clipClickTimer = null;

let stage, sceneLayer, cameraGroup, gridGroup, contentGroup, uiContentGroup, transformer;
let camGizmoLayer; // dedicated top-layer for interactive camera gizmo handles
// Dedicated overlay layer for tile-paint hover / preview highlights.
// Redrawn with batchDraw() on pointermove instead of triggering a full renderViewport().
let tileHoverLayer;
let suppressStageClick = false;
let viewportReady = false;
const shapeRefs = new Map();
let marqueeRect = null;

function cloneDocumentState(doc = {}) {
  return {
    currentScenePath: String(doc.currentScenePath || ''),
    currentEditStatePath: String(doc.currentEditStatePath || ''),
    pendingRecoveryId: String(doc.pendingRecoveryId || ''),
    lastSavedSnapshot: String(doc.lastSavedSnapshot || ''),
    lastAutosaveSnapshot: String(doc.lastAutosaveSnapshot || ''),
    autosaveTimer: null,
    dirty: !!doc.dirty
  };
}

function buildSceneEntryFromCurrentState() {
  syncEditorStateFromRuntime();
  return {
    sceneState: JSON.parse(JSON.stringify(state.sceneState)),
    editorState: JSON.parse(JSON.stringify(state.editorState)),
    name: state.sceneState.scene?.name || 'MainScene',
    documentState: cloneDocumentState(state.document)
  };
}

function persistActiveSceneEntry() {
  if (state.activeSceneIndex < 0 || !state.scenes[state.activeSceneIndex]) return;
  state.scenes[state.activeSceneIndex] = buildSceneEntryFromCurrentState();
}

function setActiveScene(index) {
  const sceneEntry = state.scenes[index];
  if (!sceneEntry) return;

  if (index === state.activeSceneIndex) {
    renderSceneTabs();
    return;
  }

  if (state.activeSceneIndex >= 0 && state.scenes[state.activeSceneIndex]) {
    persistActiveSceneEntry();
  }

  state.activeSceneIndex = index;

  applyLoadedSceneData(sceneEntry.sceneState, sceneEntry.editorState);
  const nextDocumentState = cloneDocumentState(sceneEntry.documentState || {});
  nextDocumentState.autosaveTimer = state.document.autosaveTimer;
  state.document = nextDocumentState;

  rebuildImageCache();
  syncSheetInputs(getSelectedSheet());
  scheduleRender(RenderFlags.FULL);
}

function getRootNodeId() {
  return state.sceneState?.scene?.rootNodeId || ROOT_NODE_ID;
}

function isRootNodeId(id) {
  return !!id && id === getRootNodeId();
}

function isRecoverableSceneWarning(code) {
  return new Set([
    'UNKNOWN_NODE_TYPE',
    'MISSING_IMAGE_PATH',
    'MISSING_IMAGE_RESOURCE',
    'MISSING_SPRITESHEET',
    'MISSING_SPRITEFRAMES_RESOURCE',
    'INVALID_ANIMATION_REFERENCE',
    'DISCONNECTED_NODE',
    'MISSING_SCENE_INSTANCE_SOURCE',
    'MISSING_SCENE_INSTANCE_SOURCE_RESOURCE',
    'SCENE_INSTANCE_SOURCE_OPEN_FAILED',
    'SCENE_INSTANCE_SOURCE_INVALID_JSON',
    'SCENE_INSTANCE_SOURCE_MIGRATION_FAILED',
    'SCENE_INSTANCE_SOURCE_VALIDATION_FAILED',
    'MISSING_INHERITED_SCENE_SOURCE',
    'MISSING_INHERITED_SCENE_SOURCE_RESOURCE'
  ]).has(code);
}

function formatValidationIssues(issues = []) {
  return issues.map((issue) => {
    const parts = [];
    if (issue.code) parts.push(`[${issue.code}]`);
    if (issue.nodeId) parts.push(`node=${issue.nodeId}`);
    if (issue.path) parts.push(`path=${issue.path}`);
    if (issue.spriteFramesId) parts.push(`spriteFramesId=${issue.spriteFramesId}`);
    parts.push(issue.message || 'Unknown validation issue.');
    return parts.join(' ');
  });
}

function reportSceneWarnings(warnings = [], contextLabel = 'Scene warnings') {
  if (!warnings.length) return;
  appendLog(`${contextLabel}:`);
  formatValidationIssues(warnings).forEach((line) => appendLog(`  • ${line}`));
  state.statusLogTarget = { tone: 'warning', marker: `${contextLabel}:` };
  if (statusbarEl) statusbarEl.classList.add('has-log-target');
}

function isLikelyEditorStateDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (!Number.isFinite(Number(doc.editorVersion))) return false;
  if (Array.isArray(doc.selection)) return true;
  if (Array.isArray(doc.expandedTreeNodes)) return true;
  if (doc.viewport && typeof doc.viewport === 'object') return true;
  if (Array.isArray(doc.spritesheets)) return true;
  if (Array.isArray(doc.spriteFramesLibraries)) return true;
  return false;
}

function reportSceneFatalErrors(fatalErrors = [], contextLabel = 'Scene load failed') {
  const lines = formatValidationIssues(fatalErrors);
  appendLog(`${contextLabel}:`);
  lines.forEach((line) => appendLog(`  • ${line}`));
  state.statusLogTarget = { tone: 'error', marker: `${contextLabel}:` };
  if (statusbarEl) statusbarEl.classList.add('has-log-target');
  const summary = lines.length
    ? `${contextLabel}

${lines.join('\n')}`
    : contextLabel;
  window.alert(summary);
}

async function validateSceneForOpen(rawScene, scenePath) {
  return validateSceneDocument(rawScene, {
    resourceExists: async (resourcePath) => {
      if (!resourcePath || !window.electronAPI?.resolveSceneResource) return false;
      const result = await window.electronAPI.resolveSceneResource({ scenePath, resourcePath });
      return !!result?.success && !!result?.exists;
    },
    spriteFramesLookup: async (spriteFramesId) => {
      const libs = Array.isArray(state.editorState?.spriteFramesLibraries)
        ? state.editorState.spriteFramesLibraries
        : [];
      return libs.find((lib) => lib?.id === spriteFramesId) || null;
    },
    animationLookup: async (spriteFramesId, animationName) => {
      const libs = Array.isArray(state.editorState?.spriteFramesLibraries)
        ? state.editorState.spriteFramesLibraries
        : [];
      const lib = libs.find((entry) => entry?.id === spriteFramesId);
      if (!lib || !Array.isArray(lib.clips)) return false;
      return lib.clips.some((clip) => clip?.name === animationName);
    }
  });
}

function makeProjectResPathFromAbsolute(filePath) {
  const projectRoot = String(state.projectRoot || '').trim();
  const absolutePath = String(filePath || '').trim();
  if (!projectRoot || !absolutePath) return '';
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedFile = absolutePath.replace(/\\/g, '/');
  if (!(normalizedFile === normalizedRoot || normalizedFile.startsWith(normalizedRoot + '/'))) return '';
  const relative = normalizedFile.slice(normalizedRoot.length).replace(/^\//, '');
  return relative ? `res://${relative}` : '';
}

function getSceneInstanceSourcePath(node) {
  return String(node?.properties?.sourceScenePath || '').trim();
}

function getSceneInstanceCache(nodeId) {
  return state.instanceCache.get(nodeId) || null;
}

function setSceneInstanceCache(nodeId, entry) {
  state.instanceCache.set(nodeId, entry);
  return entry;
}

function clearSceneInstanceCache(nodeId) {
  if (nodeId) state.instanceCache.delete(nodeId);
}

// deepClone → RGE_ROOT.RGEUtils.deepClone (shared, see core/utils.js)
const deepClone = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
  ? RGE_ROOT.RGEUtils.deepClone
  : (v) => JSON.parse(JSON.stringify(v));

function deepMergeObjects(baseValue, patchValue) {
  if (Array.isArray(baseValue) || Array.isArray(patchValue)) return deepClone(patchValue);
  const base = baseValue && typeof baseValue === 'object' ? deepClone(baseValue) : {};
  const patch = patchValue && typeof patchValue === 'object' ? patchValue : {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      base[key] = deepMergeObjects(base[key], value);
    } else {
      base[key] = deepClone(value);
    }
  });
  return base;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stripInheritanceForDiff(sceneLike) {
  const scene = deepClone(sceneLike || {});
  if (scene && scene.scene && typeof scene.scene === 'object') {
    delete scene.scene.inheritance;
  }
  return scene;
}

function getSceneInheritanceInfo(sceneState = state.sceneState) {
  const inheritance = sceneState?.scene?.inheritance;
  return inheritance && typeof inheritance === 'object' && !Array.isArray(inheritance) ? inheritance : null;
}

function isInheritedScene(sceneState = state.sceneState) {
  return !!getSceneInheritanceInfo(sceneState)?.sourceScenePath;
}

function cloneInheritanceSourceSnapshot(runtimeScene) {
  return deepClone(stripInheritanceForDiff(normalizeScene(runtimeScene || {})));
}

function getNodeMap(runtimeScene) {
  return new Map((normalizeScene(runtimeScene || {}).nodes || []).map((node) => [node.id, node]));
}

function diffValues(baseValue, currentValue) {
  if (deepEqual(baseValue, currentValue)) return undefined;
  if (Array.isArray(baseValue) || Array.isArray(currentValue)) return deepClone(currentValue);
  const baseIsObject = isPlainObject(baseValue);
  const currentIsObject = isPlainObject(currentValue);
  if (!baseIsObject || !currentIsObject) return deepClone(currentValue);

  const patch = {};
  const deleted = [];
  const keys = new Set([...Object.keys(baseValue || {}), ...Object.keys(currentValue || {})]);
  keys.forEach((key) => {
    if (!(key in (currentValue || {}))) {
      deleted.push(key);
      return;
    }
    if (!(key in (baseValue || {}))) {
      patch[key] = deepClone(currentValue[key]);
      return;
    }
    const childDiff = diffValues(baseValue[key], currentValue[key]);
    if (childDiff !== undefined) patch[key] = childDiff;
  });
  if (deleted.length) patch.__delete = deleted;
  return Object.keys(patch).length ? patch : undefined;
}

function applyDiffPatch(baseValue, patchValue) {
  if (patchValue === undefined) return deepClone(baseValue);
  if (Array.isArray(patchValue)) return deepClone(patchValue);
  if (!isPlainObject(patchValue)) return deepClone(patchValue);
  const base = isPlainObject(baseValue) ? deepClone(baseValue) : {};
  const result = base;
  const deleted = Array.isArray(patchValue.__delete) ? patchValue.__delete : [];
  deleted.forEach((key) => delete result[key]);
  Object.entries(patchValue).forEach(([key, value]) => {
    if (key === '__delete') return;
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = applyDiffPatch(result[key], value);
    } else if (isPlainObject(value) && !Array.isArray(value) && !('__delete' in value) && !Object.keys(value).length) {
      result[key] = {};
    } else {
      result[key] = applyDiffPatch(result[key], value);
    }
  });
  return result;
}

function buildInheritedSceneDiff(baseRuntimeScene, currentRuntimeScene) {
  const base = cloneInheritanceSourceSnapshot(baseRuntimeScene);
  const current = stripInheritanceForDiff(normalizeScene(currentRuntimeScene || {}));
  const baseMap = getNodeMap(base);
  const currentMap = getNodeMap(current);
  const rootNodeId = current.scene?.rootNodeId || base.scene?.rootNodeId || getRootNodeId();
  const nodeOverrides = {};
  const removedNodeIds = [];
  const addedNodes = [];

  current.nodes.forEach((node) => {
    if (!node || node.id === rootNodeId) return;
    if (!baseMap.has(node.id)) {
      addedNodes.push(deepClone(node));
      return;
    }
    const patch = diffValues(baseMap.get(node.id), node);
    if (patch !== undefined) nodeOverrides[node.id] = patch;
  });

  base.nodes.forEach((node) => {
    if (!node || node.id === rootNodeId) return;
    if (!currentMap.has(node.id)) removedNodeIds.push(node.id);
  });

  const scenePatch = diffValues(
    Object.assign({}, base.scene || {}, { inheritance: undefined, name: undefined }),
    Object.assign({}, current.scene || {}, { inheritance: undefined, name: undefined })
  ) || {};

  const rootPatch = baseMap.has(rootNodeId) && currentMap.has(rootNodeId)
    ? (diffValues(baseMap.get(rootNodeId), currentMap.get(rootNodeId)) || {})
    : {};

  return {
    sceneName: current.scene?.name || base.scene?.name || 'Inherited Scene',
    rootNodeId,
    rootPatch,
    scenePatch,
    nodeOverrides,
    removedNodeIds,
    addedNodes
  };
}

function applyInheritedSceneDiff(sourceRuntimeScene, diff) {
  const source = cloneInheritanceSourceSnapshot(sourceRuntimeScene);
  const sourceMap = getNodeMap(source);
  const rootNodeId = source.scene?.rootNodeId || diff?.rootNodeId || getRootNodeId();
  let nodes = (source.nodes || []).map((node) => {
    const patch = node?.id === rootNodeId
      ? (diff?.rootPatch || null)
      : (diff?.nodeOverrides?.[node.id] || null);
    return patch ? applyDiffPatch(node, patch) : deepClone(node);
  });

  const removed = new Set(Array.isArray(diff?.removedNodeIds) ? diff.removedNodeIds : []);
  if (removed.size) {
    nodes = nodes.filter((node) => node && !removed.has(node.id));
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  (Array.isArray(diff?.addedNodes) ? diff.addedNodes : []).forEach((node) => {
    if (!node || !node.id || nodeIds.has(node.id)) return;
    const clone = deepClone(node);
    if (clone.parentId && !nodeIds.has(clone.parentId)) clone.parentId = rootNodeId;
    nodes.push(clone);
    nodeIds.add(clone.id);
  });

  let runtime = normalizeScene({
    formatVersion: source.formatVersion || 2,
    scene: Object.assign({}, source.scene || {}, diff?.scenePatch ? applyDiffPatch(source.scene || {}, diff.scenePatch) : {}),
    nodes
  });
  runtime.scene.name = diff?.sceneName || runtime.scene?.name || source.scene?.name || 'Inherited Scene';
  return runtime;
}

async function loadInheritanceSourceRuntime(inheritance) {
  const sourceScenePath = String(inheritance?.sourceScenePath || '').trim();
  if (!sourceScenePath) {
    return { ok: false, warning: { code: 'MISSING_INHERITED_SCENE_SOURCE', message: 'Inherited scene is missing sourceScenePath.' } };
  }
  const resolved = await window.electronAPI.resolveSceneResource({ scenePath: state.document.currentScenePath || '', resourcePath: sourceScenePath });
  if (!resolved?.success || !resolved?.exists || !resolved?.resolvedPath) {
    return { ok: false, warning: { code: 'MISSING_INHERITED_SCENE_SOURCE_RESOURCE', path: sourceScenePath, message: `Inherited scene source not found: ${sourceScenePath}` } };
  }
  const loaded = await loadSceneRuntimeFromAbsolutePath(resolved.resolvedPath);
  if (!loaded.ok) {
    return { ok: false, warning: Object.assign({ path: sourceScenePath }, loaded.warning || {}) };
  }
  return {
    ok: true,
    runtime: cloneInheritanceSourceSnapshot(loaded.runtime),
    sourceFilePath: loaded.sourceFilePath || resolved.resolvedPath,
    sourceName: loaded.sourceName || inheritance?.sourceSceneName || 'Scene',
    warnings: Array.isArray(loaded.warnings) ? loaded.warnings : []
  };
}

function updateSceneInheritanceMetadata(runtimeScene, inheritancePatch = {}) {
  const runtime = normalizeScene(runtimeScene || {});
  const current = getSceneInheritanceInfo(runtime) || {};
  runtime.scene.inheritance = Object.assign({}, current, inheritancePatch);
  return runtime;
}

async function rebaseInheritedScene(options = {}) {
  const inheritance = getSceneInheritanceInfo();
  if (!inheritance?.sourceScenePath) {
    setStatus('Active scene is not an inherited scene.', true);
    return false;
  }
  const sourceLoad = await loadInheritanceSourceRuntime(inheritance);
  if (!sourceLoad.ok || !sourceLoad.runtime) {
    reportSceneWarnings([sourceLoad.warning || { code: 'INHERITED_SCENE_REBASE_FAILED', message: 'Could not load inherited scene source.' }], 'Inherited scene warnings');
    setStatus('Could not rebase inherited scene from source.', { tone: 'warning', flashMs: 2600 });
    return false;
  }
  const before = serializeScene(); const _vBefore = _getSceneVersion();
  const baseSnapshot = inheritance.sourceSnapshot ? cloneInheritanceSourceSnapshot(inheritance.sourceSnapshot) : sourceLoad.runtime;
  const diff = options.revert
    ? {
        sceneName: state.sceneState?.scene?.name || `${sourceLoad.sourceName || inheritance.sourceSceneName || 'Scene'} Inherited`,
        rootNodeId: sourceLoad.runtime.scene?.rootNodeId,
        rootPatch: {},
        scenePatch: {},
        nodeOverrides: {},
        removedNodeIds: [],
        addedNodes: []
      }
    : buildInheritedSceneDiff(baseSnapshot, state.sceneState);
  let rebased = applyInheritedSceneDiff(sourceLoad.runtime, diff);
  rebased = updateSceneInheritanceMetadata(rebased, {
    sourceScenePath: inheritance.sourceScenePath,
    sourceSceneName: sourceLoad.sourceName || inheritance.sourceSceneName || '',
    mode: 'live-linked',
    sourceSnapshot: cloneInheritanceSourceSnapshot(sourceLoad.runtime),
    lastRebasedAt: new Date().toISOString()
  });
  applyLoadedSceneData(rebased, state.editorState);
  state.document.dirty = true;
  persistActiveSceneEntry();
  scheduleRender(RenderFlags.FULL);
  if (_sceneChanged(_vBefore)) pushHistory(options.revert ? 'Revert inherited scene to base' : 'Rebase inherited scene', before);
  setStatus(options.revert ? 'Reverted inherited scene to latest source.' : 'Rebased inherited scene from latest source.');
  return true;
}

function getSceneInstanceOverrides(node) {
  const raw = node?.properties?.sourceOverrides;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function ensureSceneInstanceOverrides(node) {
  if (!node.properties || typeof node.properties !== 'object') node.properties = {};
  if (!node.properties.sourceOverrides || typeof node.properties.sourceOverrides !== 'object' || Array.isArray(node.properties.sourceOverrides)) {
    node.properties.sourceOverrides = {};
  }
  return node.properties.sourceOverrides;
}

function getSelectedInstanceSourceNodeId(instanceNode) {
  const key = instanceNode?.id;
  if (!key) return '';
  return String(state.instanceEditor.selectedSourceNodeByInstance[key] || instanceNode?.properties?.selectedOverrideNodeId || '').trim();
}

function setSelectedInstanceSourceNodeId(instanceNode, sourceNodeId) {
  if (!instanceNode?.id) return;
  const nextId = String(sourceNodeId || '').trim();
  state.instanceEditor.selectedSourceNodeByInstance[instanceNode.id] = nextId;
  if (!instanceNode.properties || typeof instanceNode.properties !== 'object') instanceNode.properties = {};
  instanceNode.properties.selectedOverrideNodeId = nextId;
}

function applyOverridesToRuntime(runtimeScene, overridesByNodeId) {
  const runtime = normalizeScene(runtimeScene || {});
  const overrides = overridesByNodeId && typeof overridesByNodeId === 'object' ? overridesByNodeId : {};
  runtime.nodes = runtime.nodes.map((sourceNode) => {
    const patch = overrides[sourceNode.id];
    if (!patch || typeof patch !== 'object') return sourceNode;
    return deepMergeObjects(sourceNode, patch);
  });
  return runtime;
}

function getResolvedSceneInstanceRuntime(node) {
  const cache = getSceneInstanceCache(node?.id);
  if (!cache?.runtime) return null;
  return applyOverridesToRuntime(cache.runtime, getSceneInstanceOverrides(node));
}

function getResolvedInstanceChildren(node, parentId) {
  const runtime = getResolvedSceneInstanceRuntime(node);
  if (!runtime) return [];
  const rootNodeId = runtime.scene?.rootNodeId;
  return (runtime.nodes || [])
    .filter((entry) => (entry.parentId || rootNodeId) === parentId)
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
}

function getSourceNodeOverridePatch(instanceNode, sourceNodeId) {
  const overrides = getSceneInstanceOverrides(instanceNode);
  const patch = overrides[sourceNodeId];
  return patch && typeof patch === 'object' ? patch : null;
}

function updateSceneInstanceSourceOverride(instanceNodeId, sourceNodeId, fieldPath, rawValue, options = {}) {
  const instanceNode = getNode(instanceNodeId);
  if (!instanceNode || instanceNode.type !== 'SceneInstance' || !sourceNodeId || !fieldPath) return false;
  const cache = getSceneInstanceCache(instanceNode.id);
  const baseRuntime = cache?.runtime;
  const sourceNode = (baseRuntime?.nodes || []).find((entry) => entry.id === sourceNodeId);
  if (!sourceNode) return false;
  const baseline = options.baseline || serializeScene(); const _vBaseline = _getSceneVersion();
  const overrides = ensureSceneInstanceOverrides(instanceNode);
  const nextPatch = deepMergeObjects(overrides[sourceNodeId] || {}, {});
  setValueByPath(nextPatch, fieldPath, rawValue);
  const sourceValue = getValueByPath(sourceNode, fieldPath);
  if (JSON.stringify(sourceValue) === JSON.stringify(getValueByPath(nextPatch, fieldPath))) {
    const parts = fieldPath.split('.');
    let cursor = nextPatch;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor?.[parts[i]];
      if (!cursor || typeof cursor !== 'object') break;
    }
    if (cursor && typeof cursor === 'object') delete cursor[parts[parts.length - 1]];
  }
  const serializedPatch = JSON.stringify(nextPatch);
  if (serializedPatch === '{}' || serializedPatch == null) delete overrides[sourceNodeId];
  else overrides[sourceNodeId] = nextPatch;
  setSelectedInstanceSourceNodeId(instanceNode, sourceNodeId);
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  if (_sceneChanged(_vBaseline)) pushHistory(`Override ${fieldPath}`, baseline);
  setStatus(`Updated override on ${instanceNode.name}.`);
  return true;
}

function revertSceneInstanceOverrideNode(instanceNodeId, sourceNodeId) {
  const instanceNode = getNode(instanceNodeId);
  if (!instanceNode || instanceNode.type !== 'SceneInstance') return false;
  const overrides = ensureSceneInstanceOverrides(instanceNode);
  if (!overrides[sourceNodeId]) return false;
  const baseline = serializeScene(); const _vBaseline = _getSceneVersion();
  delete overrides[sourceNodeId];
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  if (_sceneChanged(_vBaseline)) pushHistory('Revert instance override', baseline);
  setStatus(`Reverted override for source node ${sourceNodeId}.`);
  return true;
}

function revertAllSceneInstanceOverrides(instanceNodeId) {
  const instanceNode = getNode(instanceNodeId);
  if (!instanceNode || instanceNode.type !== 'SceneInstance') return false;
  const overrides = ensureSceneInstanceOverrides(instanceNode);
  if (!Object.keys(overrides).length) return false;
  const baseline = serializeScene(); const _vBaseline = _getSceneVersion();
  instanceNode.properties.sourceOverrides = {};
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  if (_sceneChanged(_vBaseline)) pushHistory('Revert all instance overrides', baseline);
  setStatus(`Reverted all overrides on ${instanceNode.name}.`);
  return true;
}

function getInstanceChildren(cacheEntry, parentId) {
  const runtime = cacheEntry?.runtime;
  const rootNodeId = runtime?.scene?.rootNodeId;
  const nodes = Array.isArray(runtime?.nodes) ? runtime.nodes : [];
  return nodes
    .filter((node) => (node.parentId || rootNodeId) === parentId)
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
}

async function loadSceneRuntimeFromAbsolutePath(filePath) {
  const result = await window.electronAPI.openSceneFile(filePath);
  if (!result?.success) {
    return { ok: false, warning: { code: 'SCENE_INSTANCE_SOURCE_OPEN_FAILED', path: filePath, message: `Could not open scene instance source: ${filePath}` } };
  }
  const parsedScene = parseSceneJson(result.json);
  if (!parsedScene.ok) {
    return { ok: false, warning: { code: 'SCENE_INSTANCE_SOURCE_INVALID_JSON', path: filePath, message: `Scene instance source is invalid JSON: ${filePath}` } };
  }
  const migration = migrateSceneDocument(parsedScene.data);
  if (!migration.ok) {
    return { ok: false, warning: { code: 'SCENE_INSTANCE_SOURCE_MIGRATION_FAILED', path: filePath, message: `Scene instance source could not be migrated: ${filePath}` } };
  }
  const validation = await validateSceneForOpen(migration.data, result.filePath);
  if (!validation.ok) {
    return { ok: false, warning: { code: 'SCENE_INSTANCE_SOURCE_VALIDATION_FAILED', path: filePath, message: `Scene instance source failed validation: ${filePath}` } };
  }
  return {
    ok: true,
    runtime: (() => { const s = normalizeScene(migration.data); resolveCTGLegacyTargetNames(s); return s; })(),
    warnings: Array.isArray(validation.warnings) ? validation.warnings : [],
    sourceFilePath: result.filePath || filePath,
    sourceName: migration.data?.scene?.name || parsedScene.data?.scene?.name || 'Scene'
  };
}

async function ensureSceneInstanceLoaded(node, options = {}) {
  if (!node || node.type !== 'SceneInstance') return null;
  const sourceScenePath = getSceneInstanceSourcePath(node);
  if (!sourceScenePath) {
    node.properties.missingSource = true;
    return setSceneInstanceCache(node.id, { status: 'missing', sourceScenePath: '', warning: { code: 'MISSING_SCENE_INSTANCE_SOURCE', nodeId: node.id, message: `SceneInstance "${node.name}" is missing sourceScenePath.` } });
  }
  const existing = getSceneInstanceCache(node.id);
  if (existing && !options.force && existing.sourceScenePath === sourceScenePath) return existing;
  const resolved = await window.electronAPI.resolveSceneResource({ scenePath: state.document.currentScenePath || '', resourcePath: sourceScenePath });
  if (!resolved?.success || !resolved?.exists || !resolved?.resolvedPath) {
    node.properties.missingSource = true;
    return setSceneInstanceCache(node.id, { status: 'missing', sourceScenePath, resolvedPath: resolved?.resolvedPath || '', warning: { code: 'MISSING_SCENE_INSTANCE_SOURCE_RESOURCE', nodeId: node.id, path: sourceScenePath, message: `Scene instance source not found: ${sourceScenePath}` } });
  }
  const loaded = await loadSceneRuntimeFromAbsolutePath(resolved.resolvedPath);
  if (!loaded.ok) {
    node.properties.missingSource = true;
    return setSceneInstanceCache(node.id, { status: 'error', sourceScenePath, resolvedPath: resolved.resolvedPath, warning: Object.assign({ nodeId: node.id }, loaded.warning || {}) });
  }
  node.properties.missingSource = false;
  node.properties.sourceSceneName = loaded.sourceName || node.properties.sourceSceneName || '';
  return setSceneInstanceCache(node.id, {
    status: 'ready',
    sourceScenePath,
    resolvedPath: resolved.resolvedPath,
    runtime: loaded.runtime,
    sourceName: loaded.sourceName,
    warnings: loaded.warnings || []
  });
}

async function resolveAllSceneInstances(options = {}) {
  const warnings = [];
  const instanceNodes = getNodes().filter((node) => node.type === 'SceneInstance');
  for (const node of instanceNodes) {
    const cache = await ensureSceneInstanceLoaded(node, options);
    if (cache?.warning) warnings.push(cache.warning);
    if (Array.isArray(cache?.warnings)) warnings.push(...cache.warnings.filter((warning) => isRecoverableSceneWarning(warning.code)));
  }
  return warnings;
}

function getSubtreeNodeIds(rootId) {
  const ids = [];
  const walk = (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return;
    ids.push(nodeId);
    getChildren(nodeId).forEach((child) => walk(child.id));
  };
  walk(rootId);
  return ids;
}

function buildSubtreeRuntimeScene(rootId) {
  const sourceRoot = getNode(rootId);
  if (!sourceRoot) return null;
  const ids = new Set(getSubtreeNodeIds(rootId));
  const clonedNodes = Array.from(ids).map((id) => JSON.parse(JSON.stringify(getNode(id)))).filter(Boolean);
  clonedNodes.forEach((node) => {
    if (node.id === rootId) node.parentId = null;
    else if (!ids.has(node.parentId)) node.parentId = rootId;
  });
  const rootClone = clonedNodes.find((node) => node.id === rootId);
  if (rootClone) {
    rootClone.type = 'SceneRoot';
    rootClone.parentId = null;
  }
  return normalizeScene({
    formatVersion: 2,
    scene: { name: sourceRoot.name || 'Scene', rootNodeId: rootId },
    nodes: clonedNodes
  });
}

async function saveSelectedSubtreeAsScene(nodeId) {
  const node = getNode(nodeId);
  if (!node || isRootNodeId(node.id)) {
    setStatus('Select a non-root node to save as its own scene.', true);
    return;
  }
  const runtimeScene = buildSubtreeRuntimeScene(node.id);
  if (!runtimeScene) {
    setStatus('Could not build subtree scene.', true);
    return;
  }
  const editorState = normalizeEditorState(null, runtimeScene);
  const result = await window.electronAPI.saveScene({
    runtimeJson: window.Exporter.exportSceneAsJson(runtimeScene, editorState),
    editorStateJson: window.Exporter.exportEditorStateAsJson(runtimeScene, editorState),
    currentScenePath: '',
    recoveryId: '',
    sceneName: runtimeScene.scene?.name || node.name || 'SubScene',
    suggestedPath: `${runtimeScene.scene?.name || node.name || 'SubScene'}.rkscene`
  });
  if (result?.success) setStatus(`Saved subtree as scene: ${result.filePath}`);
}

async function instantiateSceneFromFile(parentId = null) {
  const result = await window.electronAPI.openScene();
  if (!result?.success || !result.filePath) return;
  const sourceScenePath = makeProjectResPathFromAbsolute(result.filePath);
  if (!sourceScenePath) {
    setStatus('Scene instance source must be inside the current project root.', true);
    return;
  }
  const parsed = parseSceneJson(result.json || '{}');
  const migration = parsed.ok ? migrateSceneDocument(parsed.data) : null;
  const sourceName = migration?.ok ? (migration.data?.scene?.name || 'Scene') : 'Scene';
  const targetParentId = parentId || state.selectedId || getRootNodeId();
  const parentNode = getNode(targetParentId) || getNode(getRootNodeId());
  if (!getNodeDef(parentNode?.type)?.canHaveChildren) {
    setStatus('Select a parent node that can contain children before instancing a scene.', true);
    return;
  }
  pushHistory('Instantiate scene');
  const node = createDefaultNode('SceneInstance', {
    name: sourceName,
    parentId: parentNode.id,
    properties: { sourceScenePath, sourceSceneName: sourceName, missingSource: false, width: 160, height: 120, opacity: 1 }
  });
  node.transform.x = snapValue(80 + (getNodes().length * 18));
  node.transform.y = snapValue(80 + (getNodes().length * 18));
  node.zIndex = getChildren(parentNode.id).length;
  getNodes().push(node);
  await ensureSceneInstanceLoaded(node, { force: true });
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(node.id);
  setStatus(`Instanced ${sourceName}.`);
}

async function openSourceSceneFromInstance(nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== 'SceneInstance') return;
  const cache = await ensureSceneInstanceLoaded(node, { force: false });
  const resolvedPath = cache?.resolvedPath;
  if (!resolvedPath) {
    setStatus('This scene instance has no source scene to open.', true);
    return;
  }
  const result = await window.electronAPI.openSceneFile(resolvedPath);
  if (!result?.success) {
    setStatus('Could not open source scene.', true);
    return;
  }
  await openSceneResult(result);
}

async function reloadSceneInstance(nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== 'SceneInstance') return;
  await ensureSceneInstanceLoaded(node, { force: true });
  scheduleRender(RenderFlags.TREE | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  setStatus(`Reloaded scene instance source for ${node.name}.`);
}

window.onResize = function () {
  if (!viewportReady || !stage) return;
  const vp = document.getElementById('stage-container');
  if (!vp) return;
  stage.width(vp.clientWidth || 800);
  stage.height(vp.clientHeight || 600);
  scheduleRender(RenderFlags.VIEWPORT);
};

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════
function init() {
  bindWindowControls();
  bindStatusbar();
  try {
    initViewport();
  } catch (error) {
    console.error('Viewport initialization failed:', error);
    window.__viewportInitError = error;
    const stageContainer = document.getElementById('stage-container');
    if (stageContainer) {
      stageContainer.innerHTML = '<div class="notice" style="padding:12px; margin:12px; border:1px solid #7a2f2f; border-radius:8px; background:#2a1a1a; color:#ffd7d7;">Viewport could not start because Konva failed to load. Launch the editor through Electron and make sure the Konva library is available locally.</div>';
    }
    setStatus('Viewport unavailable: Konva did not load. The rest of the editor is still available.', true);
  }
  populateCreateGrid();
  renderAudioPanel(null);
  initCameraPreviewPanel();
  bindToolbar();
  bindFileMenu();
  bindSceneMenu();
  bindSceneActions();
  bindPrimaryEditorUiFallbacks();
  bindDockUI();
  initPanelResizers();
  bindInspectorSearch();
  ensureSceneTreeContextMenu();
  ensureFilesystemContextMenu();
  state.scenes = [buildSceneEntryFromCurrentState()];
  state.activeSceneIndex = 0;

  markHistoryBaseline();
  appendLog('Ready.');
  scheduleRender(RenderFlags.FULL);
  refreshFilesystem();
  initAutosaveLoop();
  TileCollisionEditor.mount();
  TilePhysicsEditor.mount();
  // v49: mount the UI Components centering layer
  window.UIEditorLayer?.mount();
  if (window.electronAPI?.onProjectFilesChanged && !state.projectFilesUnsubscribe) {
    state.projectFilesUnsubscribe = window.electronAPI.onProjectFilesChanged((payload) => {
      const rootPath = String(payload?.rootPath || state.projectRoot || '').trim();
      if (!rootPath) return;
      if (state.projectRoot && rootPath !== state.projectRoot) return;
      void refreshFilesystem(rootPath);
    });
  }
  if (window.electronAPI?.onProjectSettingsUpdated && !state.projectSettingsUnsubscribe) {
    state.projectSettingsUnsubscribe = window.electronAPI.onProjectSettingsUpdated((payload) => {
      const rootPath = String(payload?.projectRoot || state.projectRoot || '').trim();
      if (state.projectRoot && rootPath && rootPath !== state.projectRoot) return;
      state.projectSettings = normalizeProjectSettings(payload?.settings || {}, rootPath);
      syncAllTileMapsToProjectScreen();
      setStatus(`Updated project settings for ${state.projectSettings.projectName}.`);
    });
  }
  void loadProjectSettings(state.projectRoot);
  void bootLaunchProject();
  void checkStartupRecovery();
  // Enable CSS transitions after the initial render frame so rebuilt DOM nodes
  // don't flash their transitions on first paint or after inspector rebuilds.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.body.classList.add('transitions-ready'); });
  });
}

async function bootLaunchProject() {
  const params = new URLSearchParams(window.location.search || '');
  const queryProjectRoot = String(params.get('projectRoot') || '').trim();
  if (queryProjectRoot) {
    await openProjectFromRoot(queryProjectRoot);
    return;
  }
  if (!window.electronAPI?.getLaunchProject) return;
  const launch = await window.electronAPI.getLaunchProject();
  const rootPath = String(launch?.rootPath || '').trim();
  if (!rootPath || rootPath === '/' || rootPath === '.') return;
  if (rootPath === state.projectRoot) return;
  await openProjectFromRoot(rootPath);
}

function bindWindowControls() {
  bindClick('btn-close',    () => window.electronAPI.closeWindow());
  bindClick('btn-minimize', () => window.electronAPI.minimizeWindow());
  bindClick('btn-maximize', () => window.electronAPI.maximizeWindow());
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (!el || typeof handler !== 'function') return;

  // bindSceneActions can be called again after project/UI restore. Replace the
  // previous click handler instead of stacking another one; stacked handlers
  // caused SpriteFrames +Frame to add two frames and Play to immediately toggle
  // back off.
  if (el.__rgeClickHandler) {
    el.removeEventListener('click', el.__rgeClickHandler);
  }
  el.__rgeClickHandler = handler;
  el.addEventListener('click', handler);
}

function bindStatusbar() {
  if (!statusbarEl) return;
  statusbarEl.addEventListener('click', () => {
    if (!state.statusLogTarget) return;
    activateBottomPanel('output');
    focusLogLine(state.statusLogTarget.marker);
  });
}

function focusLogLine(marker) {
  if (!logViewEl) return;
  const lines = Array.isArray(state.logs) ? state.logs : [];
  let index = -1;
  if (marker) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (String(lines[i]).includes(marker)) {
        index = i;
        break;
      }
    }
  }
  if (index < 0) index = Math.max(0, lines.length - 1);
  const lineHeight = parseFloat(window.getComputedStyle(logViewEl).lineHeight) || 18;
  logViewEl.scrollTop = Math.max(0, index * lineHeight - lineHeight * 2);
}


function getFallbackCreateNodeTypes() {
  const defaults = [
    { type: 'Node2D',           displayName: 'Node2D' },
    { type: 'Sprite2D',         displayName: 'Sprite2D' },
    { type: 'AnimatedSprite2D', displayName: 'AnimatedSprite2D' },
    { type: 'TileMap',          displayName: 'TileMap' },
    { type: 'Camera2D', displayName: 'Camera2D' },
    { type: 'CameraZone2D', displayName: 'CameraZone2D' },
    { type: 'CameraBounds2D', displayName: 'CameraBounds2D' },
    { type: 'CameraPath2D', displayName: 'CameraPath2D' }, // camera path custom editing
    { type: 'SceneInstance',    displayName: 'SceneInstance' },
  ];
  try {
    const types = typeof getCreatableNodeTypes === 'function' ? getCreatableNodeTypes() : [];
    if (Array.isArray(types) && types.length) {
      // Filter out UI node types — those are added from the UI Screens tab
      return types.filter(def => !isUiNodeType(def.type));
    }
  } catch (_) {}
  return defaults;
}

function renderCreateButtons() {
  const host = document.getElementById('node-create-buttons');
  if (!host) return;
  const nodeTypes = getFallbackCreateNodeTypes();
  host.innerHTML = '';
  nodeTypes.forEach((def) => {
    const type = String(def?.type || '').trim();
    if (!type) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'create-node-btn';
    btn.dataset.nodeType = type;
    btn.textContent = def.displayName || type;
    host.appendChild(btn);
  });
}

function populateCreateGrid() {
  const grid = document.getElementById('create-grid');
  if (!grid) return;
  const nodeTypes = getFallbackCreateNodeTypes();
  grid.innerHTML = '';
  nodeTypes.forEach((def) => {
    const type = String(def?.type || '').trim();
    if (!type) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'create-card';
    btn.dataset.nodeType = type;
    btn.textContent = def.displayName || type;
    grid.appendChild(btn);
  });
  if (!grid.children.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = 'No node types available.';
    grid.appendChild(empty);
  }
}

// ══════════════════════════════════════════════════════════════════════
// BINDING
// ══════════════════════════════════════════════════════════════════════
function bindSceneActions() {
  bindClick('btn-add-child', createNewScene);

  bindClick('btn-import-sheet', importSpritesheet);

  if (sheetSearchEl) {
    sheetSearchEl.value = state.spritePanel.searchQuery || '';
    sheetSearchEl.addEventListener('input', () => {
      state.spritePanel.searchQuery = sheetSearchEl.value || '';
      renderSpritesheetsPanel();
    });
  }

  if (sheetSortEl) {
    sheetSortEl.value = state.spritePanel.sortMode || 'name-asc';
    sheetSortEl.addEventListener('change', () => {
      state.spritePanel.sortMode = sheetSortEl.value || 'name-asc';
      renderSpritesheetsPanel();
    });
  }

  const sheetCategoryFilterEl = document.getElementById('sheet-category-filter');
  if (sheetCategoryFilterEl) {
    sheetCategoryFilterEl.value = state.spritePanel.categoryFilter || '';
    sheetCategoryFilterEl.addEventListener('change', () => {
      state.spritePanel.categoryFilter = sheetCategoryFilterEl.value || '';
      renderSpritesheetsPanel();
    });
  }

  bindClick('btn-sheet-grid', () => {
    state.spriteEditor.showGrid = !state.spriteEditor.showGrid;
    document.getElementById('btn-sheet-grid')?.classList.toggle('active', state.spriteEditor.showGrid);
    renderSpritesheetsPanel();
  });

  ['sheet-tile-w', 'sheet-tile-h', 'sheet-padding', 'sheet-offset-x', 'sheet-offset-y'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', updateSelectedSheetMetricsFromInputs);
  });

  if (sheetCanvasEl) sheetCanvasEl.addEventListener('click', onSheetCanvasClick);

  // ── SpriteFrames panel ────────────────────────────────────────────
  bindClick('sf-btn-add-anim',    createAnimationClip);
  bindClick('sf-btn-rename-anim', renameCurrentAnimationClip);
  bindClick('sf-btn-del-anim',    deleteCurrentAnimationClip);

  bindClick('sf-btn-add-frames', () => {
    const sheet = getSelectedSheet();
    if (!sheet) { setStatus('Upload a spritesheet first, then select a tile.', true); return; }
    const node = getSelectedAnimationNode();
    if (node) pushHistory('Add animation frame');
    state.spriteEditor.animationFrames.push(state.spriteEditor.selectedTileIndex);
    state.spriteEditor.selectedFrameIndex = state.spriteEditor.animationFrames.length - 1;
    syncAnimationClipToSelectedNode();
    if (state.spriteEditor.isPlaying) restartAnimationPreview();
    renderSpriteFramesPanel();
    scheduleRender(RenderFlags.VIEWPORT);
    const clip = getCurrentAnimationClip(node);
    setStatus(node
      ? `Added tile #${state.spriteEditor.selectedTileIndex} to clip "${clip?.name}" on ${node.name}.`
      : `Added tile #${state.spriteEditor.selectedTileIndex} to animation preview.`);
  });

  bindClick('sf-btn-del-frame', () => {
    const i = state.spriteEditor.selectedFrameIndex;
    if (i < 0 || i >= state.spriteEditor.animationFrames.length) {
      setStatus('Select a frame to remove.', true); return;
    }
    const node = getSelectedAnimationNode();
    if (node) pushHistory('Remove animation frame');
    state.spriteEditor.animationFrames.splice(i, 1);
    state.spriteEditor.selectedFrameIndex = Math.min(i, state.spriteEditor.animationFrames.length - 1);
    syncAnimationClipToSelectedNode();
    if (state.spriteEditor.isPlaying) restartAnimationPreview();
    renderSpriteFramesPanel();
    scheduleRender(RenderFlags.VIEWPORT);
  });

  bindClick('sf-btn-clear-frames', () => {
    const node = getSelectedAnimationNode();
    if (node) pushHistory('Clear animation frames');
    state.spriteEditor.animationFrames = [];
    state.spriteEditor.selectedFrameIndex = -1;
    syncAnimationClipToSelectedNode();
    stopAnimationPreview();
    renderSpriteFramesPanel();
    scheduleRender(RenderFlags.VIEWPORT);
    const clip = getCurrentAnimationClip(node);
    setStatus(node ? `Cleared clip "${clip?.name}" on ${node.name}.` : 'Cleared animation frames.');
  });

  bindClick('sf-btn-play', () => {
    state.spriteEditor.isPlaying ? stopAnimationPreview() : restartAnimationPreview();
  });

  bindClick('sf-btn-stop', () => stopAnimationPreview());

  if (sfFpsEl) {
    sfFpsEl.addEventListener('change', () => {
      state.spriteEditor.previewFps = Math.max(1, Number(sfFpsEl.value) || 8);
      syncAnimationClipToSelectedNode({ updateFps: true });
      if (state.spriteEditor.isPlaying) restartAnimationPreview();
      else renderSFPreview();
    });
  }

  if (sfPlaybackModeEl) {
    sfPlaybackModeEl.addEventListener('change', () => {
      const node = getSelectedAnimationNode();
      const clip = getCurrentAnimationClip(node);
      if (clip) {
        const mode = sfPlaybackModeEl.value || 'loop';
        clip.playbackMode = mode;
        clip.loop = mode !== 'once';
        syncAnimationClipToSelectedNode({ updatePlaybackMode: true });
        if (state.spriteEditor.isPlaying) restartAnimationPreview();
        renderSpriteFramesPanel();
      }
    });
  }

  if (sfTimelineEl) {
    const seekFromTimeline = () => {
      const frameIndex = Math.max(0, Number(sfTimelineEl.value) || 0);
      seekAnimationPreview(frameIndex, { fromTimeline: true, preserveSelection: false });
    };
    sfTimelineEl.addEventListener('input', seekFromTimeline);
    sfTimelineEl.addEventListener('change', seekFromTimeline);
  }
}

function bindToolbar() {
  bindClick('btn-export-json', () => { log(window.Exporter.exportSceneAsJson(state.sceneState)); setStatus('Scene exported to output.'); });
  bindClick('btn-undo',  performUndo);
  bindClick('btn-redo',  performRedo);
  bindClick('btn-frame', frameSelectionOrAll);
  bindClick('btn-grid', () => {
    state.showGrid = !state.showGrid;
    updateToggleButtons();
    scheduleRender(RenderFlags.VIEWPORT);
    setStatus(state.showGrid ? 'Grid enabled.' : 'Grid hidden.');
  });
  bindClick('btn-export', () => { void exportRokuProject(); });
  bindClick('menu-sideload', () => {
    if (window.electronAPI?.openSideloadWindow) {
      window.electronAPI.openSideloadWindow();
    }
  });
  bindClick('btn-snap', () => {
    state.snapEnabled = !state.snapEnabled;
    updateToggleButtons();
    setStatus(state.snapEnabled ? 'Snap enabled.' : 'Snap disabled.');
  });

  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (stage?.container()) stage.container().style.cursor = state.tool === 'pan' ? 'grab' : state.tool === 'camera-path' ? 'crosshair' : 'default';
      if (state.tool === 'camera-path') {
        const selected = getNode(state.selectedId);
        if (selected?.type !== 'CameraPath2D') setStatus('Select a CameraPath2D node to edit its points.');
      }
      closeCameraPathPointMenu();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
    });
  });

  updateToggleButtons();
}

function bindToolbarMenu({ triggerId, dropdownId, stateKey, onBindItems }) {
  const trigger = document.getElementById(triggerId);
  const dropdown = document.getElementById(dropdownId);
  if (!trigger || !dropdown) return null;

  const closeMenu = () => {
    state.ui[stateKey] = false;
    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
  };

  const openMenu = () => {
    state.ui[stateKey] = true;
    dropdown.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.ui[stateKey]) closeMenu();
    else openMenu();
  });

  dropdown.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });


  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && typeof isCameraPathEditMode === 'function' && isCameraPathEditMode()) {
      state.tool = 'select';
      state.cameraPathEditor.selectedNodeId = null;
      state.cameraPathEditor.selectedPointIndices = new Set();
      closeCameraPathPointMenu();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
      setStatus('Exited Camera Path edit mode.');
    }
  });

  if (typeof onBindItems === 'function') onBindItems(closeMenu);
  return { closeMenu, openMenu, trigger, dropdown };
}

function normalizeProjectSettings(settings = {}, projectRoot = '') {
  const fallbackName = String(projectRoot || state.projectRoot || '').trim().split(/[\/]/).pop() || 'RokuEngine Game';
  const input = settings && typeof settings.input === 'object' && !Array.isArray(settings.input) ? settings.input : {};
  const screen = settings && typeof settings.screen === 'object' && !Array.isArray(settings.screen) ? settings.screen : {};
  return {
    projectName: String(settings.projectName || fallbackName).trim() || 'RokuEngine Game',
    input: {
      movement: String(input.movement || 'standard').trim() || 'standard',
      action: String(input.action || 'ok').trim() || 'ok',
      pause: String(input.pause || 'play').trim() || 'play',
      actionMap: {
        move_up: String((input.actionMap && input.actionMap.move_up) || 'up').trim() || 'up',
        move_down: String((input.actionMap && input.actionMap.move_down) || 'down').trim() || 'down',
        move_left: String((input.actionMap && input.actionMap.move_left) || 'left').trim() || 'left',
        move_right: String((input.actionMap && input.actionMap.move_right) || 'right').trim() || 'right',
        action: String((input.actionMap && input.actionMap.action) || 'ok').trim() || 'ok',
        pause: String((input.actionMap && input.actionMap.pause) || 'play').trim() || 'play',
        back: String((input.actionMap && input.actionMap.back) || 'back').trim() || 'back'
      }
    },
    screen: {
      width: Math.max(1, Number(screen.width) || 1280),
      height: Math.max(1, Number(screen.height) || 720),
      mode: String(screen.mode || '720p').trim() || '720p',
      fullscreen: screen.fullscreen !== false
    }
  };
}

async function loadProjectSettings(projectRoot = state.projectRoot) {
  const rootPath = String(projectRoot || '').trim();
  if (!rootPath || !window.electronAPI?.getProjectSettings) {
    state.projectSettings = normalizeProjectSettings(state.projectSettings, rootPath);
    return state.projectSettings;
  }
  const result = await window.electronAPI.getProjectSettings(rootPath);
  if (result?.success) state.projectSettings = normalizeProjectSettings(result.settings || {}, rootPath);
  else state.projectSettings = normalizeProjectSettings(state.projectSettings, rootPath);
  return state.projectSettings;
}

async function openSettingsWindow() {
  let projectRoot = String(state.projectRoot || '').trim();
  if (!projectRoot) {
    const chosen = await window.electronAPI.chooseProjectFolder?.();
    if (!chosen?.success || !chosen.rootPath) return false;
    projectRoot = chosen.rootPath;
    state.projectRoot = projectRoot;
  }
  await loadProjectSettings(projectRoot);
  if (!window.electronAPI?.openProjectSettings) {
    setStatus('Settings is not available.', true);
    return false;
  }
  const result = await window.electronAPI.openProjectSettings();
  if (!result?.success) {
    setStatus(`Could not open Settings: ${result?.reason || 'Unknown error'}`, true);
    return false;
  }
  return true;
}

function sanitizeSceneFileName(name) {
  const clean = String(name || 'Scene').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  return clean || 'Scene';
}

function getUniqueProjectScenePath(baseDir, desiredName, usedPaths = new Set()) {
  const safeBaseDir = String(baseDir || '').trim();
  const safeName = sanitizeSceneFileName(desiredName);
  let candidate = `${safeBaseDir}/${safeName}.rkscene`.replace(/\\/g, '/');
  let counter = 2;
  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${safeBaseDir}/${safeName}_${counter}.rkscene`.replace(/\\/g, '/');
    counter += 1;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

async function saveProjectToRoot(projectRoot, options = {}) {
  persistActiveSceneEntry();

  if (!window.electronAPI?.saveSceneDirect) {
    setStatus('Save Project is not available.', true);
    return false;
  }

  const normalizedRoot = String(projectRoot || '').trim();
  if (!normalizedRoot) {
    setStatus('No project folder selected.', true);
    return false;
  }

  const forceRepath = !!options.forceRepath;
  const usedPaths = new Set();
  if (!forceRepath) {
    state.scenes
      .map((sceneEntry) => String(sceneEntry?.documentState?.currentScenePath || '').trim())
      .filter(Boolean)
      .forEach((scenePath) => usedPaths.add(scenePath.toLowerCase()));
  }

  const originalActiveIndex = state.activeSceneIndex;
  const savedItems = [];

  for (let index = 0; index < state.scenes.length; index += 1) {
    const sceneEntry = state.scenes[index];
    if (!sceneEntry) continue;

    const runtimeScene = normalizeScene(sceneEntry.sceneState);
    const editorState = normalizeEditorState(sceneEntry.editorState, runtimeScene, runtimeScene);
    const documentState = cloneDocumentState(sceneEntry.documentState || {});
    const sceneName = runtimeScene.scene?.name || sceneEntry.name || `Scene ${index + 1}`;

    let targetScenePath = forceRepath ? '' : String(documentState.currentScenePath || '').trim();
    if (!targetScenePath) {
      targetScenePath = getUniqueProjectScenePath(normalizedRoot, sceneName, usedPaths);
    } else {
      usedPaths.add(targetScenePath.toLowerCase());
    }

    const result = await window.electronAPI.saveSceneDirect({
      runtimeJson: window.Exporter.exportSceneAsJson(runtimeScene, editorState),
      editorStateJson: window.Exporter.exportEditorStateAsJson(runtimeScene, editorState),
      targetScenePath,
      currentScenePath: forceRepath ? '' : (documentState.currentScenePath || ''),
      recoveryId: documentState.pendingRecoveryId || '',
      sceneName,
      projectSettings: state.projectSettings
    });

    if (!result?.success) {
      if (originalActiveIndex >= 0 && originalActiveIndex < state.scenes.length) setActiveScene(originalActiveIndex);
      setStatus(`Save Project failed on ${sceneName}: ${result?.reason || 'Unknown error'}`, true);
      return false;
    }

    sceneEntry.sceneState = runtimeScene;
    sceneEntry.editorState = editorState;
    sceneEntry.name = sceneName;
    const savedSnapshot = serializeSceneEntrySnapshot(sceneEntry);
    sceneEntry.documentState = Object.assign({}, documentState, {
      currentScenePath: result.filePath || targetScenePath,
      currentEditStatePath: result.editStatePath || '',
      pendingRecoveryId: '',
      lastAutosaveSnapshot: '',
      lastSavedSnapshot: savedSnapshot,
      dirty: false,
      autosaveTimer: null
    });

    savedItems.push(sceneEntry.documentState.currentScenePath || sceneName);
  }

  state.projectRoot = normalizedRoot;
  if (originalActiveIndex >= 0 && originalActiveIndex < state.scenes.length) {
    restoreActiveSceneFromSavedEntry(originalActiveIndex);
  }
  state.history.undo = [];
  state.history.redo = [];
  updateHistoryButtons();
  persistActiveSceneEntry();
  scheduleRender(RenderFlags.FULL);
  await refreshFilesystem(normalizedRoot);
  setStatus(`Saved project scenes (${savedItems.length}).`);
  return true;
}

async function saveProject() {
  let projectRoot = String(state.projectRoot || '').trim();
  if (!projectRoot) {
    const chosen = await window.electronAPI.chooseProjectFolder?.();
    if (!chosen?.success || !chosen.rootPath) return false;
    projectRoot = chosen.rootPath;
  }
  return saveProjectToRoot(projectRoot, { forceRepath: false });
}

async function saveProjectAs() {
  const chosen = await window.electronAPI.chooseProjectFolder?.();
  if (!chosen?.success || !chosen.rootPath) return false;
  return saveProjectToRoot(chosen.rootPath, { forceRepath: true });
}


async function exportRokuProject() {
  persistActiveSceneEntry();
  let projectRoot = String(state.projectRoot || '').trim();
  if (!projectRoot) {
    const chosen = await window.electronAPI.chooseProjectFolder?.();
    if (!chosen?.success || !chosen.rootPath) return false;
    projectRoot = chosen.rootPath;
    state.projectRoot = projectRoot;
  }
  const saved = await saveProjectToRoot(projectRoot, { forceRepath: false });
  if (!saved) return false;
  if (!window.electronAPI?.exportRokuProject) {
    setStatus('Roku export is not available.', true);
    return false;
  }
  const payload = {
    projectRoot,
    projectTitle: state.projectSettings?.projectName || (projectRoot.split(/[\/]/).pop() || 'RokuEngine Game'),
    exportOptions: { bakeTerrain: true },
    scenes: state.scenes.map((sceneEntry) => ({
      sceneName: sceneEntry?.sceneState?.scene?.name || sceneEntry?.name || 'Scene',
      runtimeScene: sceneEntry?.sceneState || {},
      editorState: sceneEntry?.editorState || {}
    }))
  };
  const result = await window.electronAPI.exportRokuProject(payload);
  if (!result?.success) {
    setStatus(`Roku export failed: ${result?.reason || 'Unknown error'}`, true);
    return false;
  }
  // Flush any pending dirty cells before reading warnings
  flushTerrainDirtyCells();
  // Surface terrain export warnings so the user can see which cells failed
  const exportWarnings = Array.isArray(result.warnings) ? result.warnings : [];
  if (exportWarnings.length > 0) {
    const count = exportWarnings.length;
    const preview = exportWarnings.slice(0, 5).map((w) => `  \u2022 ${w}`).join('\n');
    const more = count > 5 ? `\n  \u2026 and ${count - 5} more (see console for full list)` : '';
    appendLog(`[Terrain Export Warnings]\n${preview}${more}`);
    console.group(`[RGE Export] ${count} terrain warning${count !== 1 ? 's' : ''}`);
    exportWarnings.forEach((w) => console.warn(w));
    console.groupEnd();
    setStatus(`Exported to ${result.exportRoot} with ${count} terrain warning${count !== 1 ? 's' : ''} (see log).`, count > 0);
  } else {
    setStatus(`Exported Roku project to ${result.exportRoot}.`);
  }
  appendLog(`Roku export written to ${result.exportRoot}`);
  return true;
}

async function createProject() {
  if (!window.electronAPI?.createProject) {
    setStatus('Create Project is not available.', true);
    return false;
  }
  const created = await window.electronAPI.createProject();
  if (!created?.success || !created.rootPath) return false;

  state.scenes = [];
  state.activeSceneIndex = -1;
  state.projectRoot = created.rootPath;
  state.projectSettings = normalizeProjectSettings(created.settings || {}, created.rootPath);
  state.instanceCache.clear();
  state.ui.sceneRenameIndex = null;
  state.sceneState = normalizeScene();
  state.editorState = normalizeEditorState(null, state.sceneState);
  state.document = Object.assign({}, state.document, cloneDocumentState({}), { autosaveTimer: state.document.autosaveTimer });
  createNewScene();
  await refreshFilesystem(created.rootPath);
  setStatus(`Created project ${created.rootPath}.`);
  return true;
}

function getSceneFilesFromProjectTree(tree, bucket = []) {
  if (!tree || typeof tree !== 'object') return bucket;
  const nodeType = String(tree.type || '');
  const filePath = String(tree.path || '').trim();
  const lowerPath = filePath.toLowerCase();
  if (nodeType === 'file' && filePath) {
    const isSceneFile = lowerPath.endsWith('.rkscene');
    const isSidecar = lowerPath.endsWith('.editstate') || lowerPath.includes('.autosave');
    if (isSceneFile && !isSidecar) bucket.push(filePath);
  }
  if (Array.isArray(tree.children)) tree.children.forEach((child) => getSceneFilesFromProjectTree(child, bucket));
  return bucket;
}

async function openProjectFromRoot(rootPath) {
  const projectRoot = String(rootPath || '').trim();
  if (!projectRoot) return false;

  // ── Loading overlay: show immediately ────────────────────────────────
  // Derive a display name from the root path (last folder segment).
  const _displayName = projectRoot.replace(/\\/g, '/').split('/').filter(Boolean).pop() || projectRoot;
  ProjectLoader.show(_displayName);

  try {
    state.projectRoot = projectRoot;

    // Phase 1: project settings
    ProjectLoader.step('settings', 'Loading project settings…');
    await loadProjectSettings(projectRoot);

    // Phase 2: file tree
    ProjectLoader.step('files', 'Reading project files…');
    await refreshFilesystem(projectRoot);

    const listResult = await window.electronAPI.listProjectFiles(projectRoot);
    if (!listResult?.success || !listResult.tree) {
      ProjectLoader.fail(listResult?.reason || 'Could not list project files');
      setStatus(`Could not open project: ${listResult?.reason || 'Unknown error'}`, true);
      return false;
    }

    const scenePaths = getSceneFilesFromProjectTree(listResult.tree)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    state.scenes = [];
    state.activeSceneIndex = -1;
    state.ui.sceneRenameIndex = null;
    state.instanceCache.clear();

    // Phase 3: scenes
    ProjectLoader.step('scenes', scenePaths.length ? `Loading ${scenePaths.length} scene${scenePaths.length === 1 ? '' : 's'}…` : 'No scenes found…');

    if (!scenePaths.length) {
      state.projectRoot = projectRoot;
      const runtimeScene = normalizeScene();
      const editorState = normalizeEditorState(null, runtimeScene);
      state.sceneState = runtimeScene;
      applyLoadedSceneData(runtimeScene, editorState);
      state.document = cloneDocumentState({});
      state.scenes = [buildSceneEntryFromCurrentState()];
      state.activeSceneIndex = 0;
      markHistoryBaseline();

      // Phase 4: assets (nothing to load but keep progress consistent)
      ProjectLoader.step('assets', 'Finalizing…');
      scheduleRender(RenderFlags.FULL);
      await refreshFilesystem(projectRoot);
      ProjectLoader.done('Project ready.');
      setStatus(`Opened project ${projectRoot} (no scenes found).`);
      return true;
    }

    for (let i = 0; i < scenePaths.length; i++) {
      const scenePath = scenePaths[i];
      const sceneName = scenePath.replace(/\\/g, '/').split('/').pop() || scenePath;
      ProjectLoader.step('scenes', `Scene ${i + 1} / ${scenePaths.length}: ${sceneName}`);
      const result = await window.electronAPI.openSceneFile(scenePath);
      if (!result?.success) {
        appendLog(`Failed to open project scene: ${scenePath} (${result?.reason || 'Unknown error'})`);
        continue;
      }
      await openSceneResult(result, { suppressFilesystemRefresh: true });
    }

    if (!state.scenes.length) {
      const runtimeScene = normalizeScene();
      const editorState = normalizeEditorState(null, runtimeScene);
      state.sceneState = runtimeScene;
      applyLoadedSceneData(runtimeScene, editorState);
      state.document = cloneDocumentState({});
      state.scenes = [buildSceneEntryFromCurrentState()];
      state.activeSceneIndex = 0;
    }

    if (state.scenes.length > 0) setActiveScene(0);
    markHistoryBaseline();

    // Phase 4: assets — spritesheets, tilesets, image cache
    const sheetCount = Array.isArray(state.spritesheets) ? state.spritesheets.length : 0;
    ProjectLoader.step('assets', sheetCount ? `Loading ${sheetCount} spritesheet${sheetCount === 1 ? '' : 's'}…` : 'Finalizing…');

    scheduleRender(RenderFlags.FULL);
    restoreEssentialEditorUi();
    await refreshFilesystem(projectRoot);

    const sceneCount = state.scenes.length;
    ProjectLoader.done(`${_displayName} ready — ${sceneCount} scene${sceneCount === 1 ? '' : 's'}.`);
    setStatus(`Opened project ${projectRoot} (${sceneCount} scene${sceneCount === 1 ? '' : 's'}).`);
    return true;

  } catch (err) {
    ProjectLoader.fail(err?.message || 'Unexpected error');
    throw err;
  }
}

async function openProject() {
  if (!window.electronAPI?.chooseProjectFolder || !window.electronAPI?.listProjectFiles || !window.electronAPI?.openSceneFile) {
    setStatus('Open Project is not available.', true);
    return;
  }
  const result = await window.electronAPI.chooseProjectFolder();
  if (!result?.success || !result.rootPath) return;
  await openProjectFromRoot(result.rootPath);
}

function restoreEssentialEditorUi() {
  try { renderCreateButtons(); } catch (_) {}
  try { populateCreateGrid(); } catch (_) {}
  try { bindDockUI(); } catch (_) {}
  try { bindPrimaryEditorUiFallbacks(); } catch (_) {}
  try { bindFileMenu(); } catch (_) {}
  try { bindSceneMenu(); } catch (_) {}
  try { bindSceneActions(); } catch (_) {}
}

function getToolbarMenuElements(menuName) {
  if (menuName === 'file') {
    return {
      trigger: document.getElementById('btn-file-menu'),
      dropdown: document.getElementById('file-menu-dropdown'),
      stateKey: 'fileMenuOpen'
    };
  }
  if (menuName === 'scene') {
    return {
      trigger: document.getElementById('btn-scene-menu'),
      dropdown: document.getElementById('scene-menu-dropdown'),
      stateKey: 'sceneMenuOpen'
    };
  }
  return { trigger: null, dropdown: null, stateKey: '' };
}

function setToolbarMenuOpen(menuName, open) {
  const refs = getToolbarMenuElements(menuName);
  if (!refs.trigger || !refs.dropdown || !refs.stateKey) return false;
  state.ui[refs.stateKey] = !!open;
  refs.dropdown.classList.toggle('hidden', !open);
  refs.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  refs.trigger.classList.toggle('active', !!open);
  return true;
}

function toggleToolbarMenuOpen(menuName) {
  const refs = getToolbarMenuElements(menuName);
  if (!refs.stateKey) return false;
  const nextOpen = !state.ui[refs.stateKey];
  if (nextOpen) {
    if (menuName !== 'file') setToolbarMenuOpen('file', false);
    if (menuName !== 'scene') setToolbarMenuOpen('scene', false);
  }
  return setToolbarMenuOpen(menuName, nextOpen);
}

function closeAllToolbarMenus() {
  setToolbarMenuOpen('file', false);
  setToolbarMenuOpen('scene', false);
}

function bindPrimaryEditorUiFallbacks() {
  if (window.__rgePrimaryEditorUiFallbacksBound) return;
  window.__rgePrimaryEditorUiFallbacksBound = true;

  document.addEventListener('click', (event) => {
    const clickTarget = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('.create-card[data-node-type], .create-node-btn[data-node-type], .left-dock .dock-tab, .right-dock .dock-tab, .bottom-tab, #btn-add-child, #btn-file-menu, #btn-scene-menu, #menu-create-project, #menu-open-project, #menu-back-to-manager, #menu-save-project, #menu-save-project-as, #menu-export-game, #menu-settings, #menu-quit, #menu-new-scene, #menu-new-inherited-scene, #menu-rename-scene, #menu-open-scene, #menu-save-scene, #menu-save-scene-as, #menu-reload-saved-scene, #menu-rebase-inherited-scene, #menu-revert-inherited-scene, #menu-close-scene, #menu-close-all-scenes')
      : null;
    if (!clickTarget) return;

    if (clickTarget.matches('.create-card[data-node-type], .create-node-btn[data-node-type]')) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      addNode(String(clickTarget.dataset.nodeType || '').trim());
      return;
    }

    if (clickTarget.matches('.left-dock .dock-tab')) {
      event.preventDefault();
      activateDockPanel('.left-dock', clickTarget.dataset.tab);
      return;
    }
    if (clickTarget.matches('.right-dock .dock-tab')) {
      event.preventDefault();
      activateDockPanel('.right-dock', clickTarget.dataset.tab);
      return;
    }
    if (clickTarget.matches('.bottom-tab')) {
      event.preventDefault();
      activateBottomPanel(clickTarget.dataset.bottom);
      return;
    }

    const id = String(clickTarget.id || '');
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    switch (id) {
      case 'btn-add-child':
        createNewScene();
        return;
      case 'btn-file-menu':
        toggleToolbarMenuOpen('file');
        return;
      case 'btn-scene-menu':
        toggleToolbarMenuOpen('scene');
        return;
      case 'menu-create-project':
        closeAllToolbarMenus();
        void createProject();
        return;
      case 'menu-open-project':
        closeAllToolbarMenus();
        void openProject();
        return;
      case 'menu-back-to-manager':
        closeAllToolbarMenus();
        if (window.electronAPI?.returnToProjectManager) void window.electronAPI.returnToProjectManager();
        else setStatus('Return to Project Manager is not available.', true);
        return;
      case 'menu-save-project':
        closeAllToolbarMenus();
        void saveProject();
        return;
      case 'menu-save-project-as':
        closeAllToolbarMenus();
        void saveProjectAs();
        return;
      case 'menu-export-game':
        closeAllToolbarMenus();
        void exportRokuProject();
        return;
      case 'menu-settings':
        closeAllToolbarMenus();
        void openSettingsWindow();
        return;
      case 'menu-quit':
        closeAllToolbarMenus();
        if (window.electronAPI?.closeWindow) window.electronAPI.closeWindow();
        return;
      case 'menu-new-scene':
        closeAllToolbarMenus();
        createNewScene();
        return;
      case 'menu-new-inherited-scene':
        closeAllToolbarMenus();
        void createNewInheritedScene();
        return;
      case 'menu-rename-scene':
        closeAllToolbarMenus();
        startInlineSceneRename(state.activeSceneIndex);
        return;
      case 'menu-open-scene':
        closeAllToolbarMenus();
        void openScene();
        return;
      case 'menu-save-scene':
        closeAllToolbarMenus();
        void saveScene();
        return;
      case 'menu-save-scene-as':
        closeAllToolbarMenus();
        void saveSceneAs();
        return;
      case 'menu-reload-saved-scene':
        closeAllToolbarMenus();
        void reloadSavedScene();
        return;
      case 'menu-rebase-inherited-scene':
        closeAllToolbarMenus();
        void rebaseInheritedScene();
        return;
      case 'menu-revert-inherited-scene':
        closeAllToolbarMenus();
        void rebaseInheritedScene({ revert: true });
        return;
      case 'menu-close-scene':
        closeAllToolbarMenus();
        closeCurrentScene();
        return;
      case 'menu-close-all-scenes':
        closeAllToolbarMenus();
        closeAllScenes();
        return;
      default:
        return;
    }
  }, true);
}

function bindFileMenu() {
  bindToolbarMenu({
    triggerId: 'btn-file-menu',
    dropdownId: 'file-menu-dropdown',
    stateKey: 'fileMenuOpen',
    onBindItems: (closeMenu) => {
      bindClick('menu-create-project', () => { closeMenu(); void createProject(); });
      bindClick('menu-open-project', () => { closeMenu(); void openProject(); });
      bindClick('menu-back-to-manager', () => { closeMenu(); void window.electronAPI.returnToProjectManager?.(); });
      bindClick('menu-save-project', () => { closeMenu(); void saveProject(); });
      bindClick('menu-save-project-as', () => { closeMenu(); void saveProjectAs(); });
      bindClick('menu-export-game', () => { closeMenu(); void exportRokuProject(); });
      bindClick('menu-settings', () => { closeMenu(); void openSettingsWindow(); });
      bindClick('menu-quit', () => { closeMenu(); window.electronAPI.closeWindow(); });
    }
  });
}

function bindSceneMenu() {
  bindToolbarMenu({
    triggerId: 'btn-scene-menu',
    dropdownId: 'scene-menu-dropdown',
    stateKey: 'sceneMenuOpen',
    onBindItems: (closeMenu) => {
      bindClick('menu-new-scene', () => { closeMenu(); createNewScene(); });
      bindClick('menu-new-inherited-scene', () => { closeMenu(); void createNewInheritedScene(); });
      bindClick('menu-rename-scene', () => { closeMenu(); startInlineSceneRename(state.activeSceneIndex); });
      bindClick('menu-open-scene', () => { closeMenu(); void openScene(); });
      bindClick('menu-save-scene', () => { closeMenu(); void saveScene(); });
      bindClick('menu-save-scene-as', () => { closeMenu(); void saveSceneAs(); });
      bindClick('menu-reload-saved-scene', () => { closeMenu(); void reloadSavedScene(); });
      bindClick('menu-rebase-inherited-scene', () => { closeMenu(); void rebaseInheritedScene(); });
      bindClick('menu-revert-inherited-scene', () => { closeMenu(); void rebaseInheritedScene({ revert: true }); });
      bindClick('menu-close-scene', () => { closeMenu(); closeCurrentScene(); });
      bindClick('menu-close-all-scenes', () => { closeMenu(); closeAllScenes(); });
    }
  });
}

function initPanelResizers() {
  const appShell  = document.getElementById('app-shell');
  const leftDock  = document.getElementById('left-dock');
  const rightDock = document.getElementById('right-dock');
  const workspace = document.getElementById('workspace');
  const bottomDock = document.getElementById('bottom-dock');

  const bindResizer = (handle, onMove) => {
    if (!handle) return;
    let active = false, activeId = null;
    const move = (e) => {
      if (!active || (activeId != null && e.pointerId != null && e.pointerId !== activeId)) return;
      onMove(e);
      if (typeof window.onResize === 'function') window.onResize();
    };
    const stop = (e) => {
      if (!active || (e && activeId != null && e.pointerId != null && e.pointerId !== activeId)) return;
      active = false; activeId = null;
      handle.classList.remove('dragging');
      document.body.classList.remove('is-resizing-panels');
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      active = true; activeId = e.pointerId;
      handle.classList.add('dragging');
      document.body.classList.add('is-resizing-panels');
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  };

  bindResizer(document.getElementById('resize-left'), (e) => {
    const shell = appShell.getBoundingClientRect();
    leftDock.style.width = Math.max(140, Math.min(520, e.clientX - shell.left)) + 'px';
  });
  bindResizer(document.getElementById('resize-right'), (e) => {
    const shell = appShell.getBoundingClientRect();
    rightDock.style.width = Math.max(180, Math.min(600, shell.right - e.clientX)) + 'px';
  });
  bindResizer(document.getElementById('resize-bottom'), (e) => {
    const rect = workspace.getBoundingClientRect();
    bottomDock.style.height = Math.max(60, Math.min(560, rect.bottom - e.clientY)) + 'px';
  });
}

function activateWorkspaceByKey(workspace = 'game', options = {}) {
  const key = workspace === 'ui' ? 'ui' : 'game';
  const previous = state.ui.activeWorkspace || 'game';
  const force = !!options.force;

  if (!force && previous === key) return;

  // Keep UI-created nodes (Panel, Button, Label, etc.) attached to the
  // currently-open scene before the UI editor is hidden. The scene tabs keep
  // their own cached scene entries, so failing to refresh that cache can make
  // newly-created UI nodes appear to vanish after leaving and re-entering the
  // UI workspace or after switching through another scene tab.
  if (previous === 'ui') {
    persistActiveSceneEntry();
  }

  state.ui.activeWorkspace = key;

  document.querySelectorAll('.workspace-tab').forEach((tab) => {
    tab.classList.toggle('active', (tab.dataset.workspace || 'game') === key);
  });

  // Suppress scene-tab active underline when UI Components workspace is active
  const sceneTabsBar = document.getElementById('scene-tabs');
  if (sceneTabsBar) sceneTabsBar.classList.toggle('ui-workspace-active', key === 'ui');

  const vpWrap = document.getElementById('viewport-wrap');
  const uiWrap = document.getElementById('ui-editor-wrap');

  if (key === 'ui') {
    if (vpWrap) {
      vpWrap.classList.remove('active');
      if (vpWrap.style.display !== 'none') vpWrap.style.display = 'none';
    }
    if (uiWrap) {
      uiWrap.classList.add('active');
      if (uiWrap.style.display !== 'grid') uiWrap.style.display = 'grid';
    }
    if (RGE_ROOT.RGEUIEditor && typeof RGE_ROOT.RGEUIEditor.activate === 'function') {
      RGE_ROOT.RGEUIEditor.activate();
    }
    return;
  }

  if (vpWrap) {
    vpWrap.classList.add('active');
    if (vpWrap.style.display) vpWrap.style.display = '';
  }
  if (uiWrap) {
    uiWrap.classList.remove('active');
    if (uiWrap.style.display !== 'none') uiWrap.style.display = 'none';
  }
  if (RGE_ROOT.RGEUIEditor && typeof RGE_ROOT.RGEUIEditor.deactivate === 'function') {
    RGE_ROOT.RGEUIEditor.deactivate();
  }
  // Defensive cleanup: even if the UI editor panel was re-docked or hidden by
  // the Tabs menu, never leave its canvas/handle layer visible over Main Scene.
  if (uiWrap) {
    uiWrap.classList.remove('active');
    uiWrap.style.display = 'none';
  }
  // Single coalesced render after resize event propagates (was: 3 separate rAF scheduleRender calls).
  // scheduleRender is already idempotent (flags merge), so one deferred call is sufficient.
  scheduleRender(RenderFlags.VIEWPORT);
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    scheduleRender(RenderFlags.VIEWPORT);
  });
}

RGE_ROOT.RGEActivateWorkspace = activateWorkspaceByKey;

function bindDockUI() {
  document.querySelectorAll('.left-dock .dock-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateDockPanel('.left-dock', tab.dataset.tab));
  });
  document.querySelectorAll('.right-dock .dock-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateDockPanel('.right-dock', tab.dataset.tab));
  });
  document.querySelectorAll('.bottom-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateBottomPanel(tab.dataset.bottom));
  });
  document.querySelectorAll('.workspace-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateWorkspaceByKey(tab.dataset.workspace || 'game'));
  });
  if (!window.__rgeInspectorSectionToggleBound) {
    window.__rgeInspectorSectionToggleBound = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.section-toggle');
      if (!btn) return;
      const section = btn.closest('.inspector-section');
      if (!section) return;
      const name = btn.dataset.sectionName || btn.textContent.trim();
      const isNowCollapsed = !section.classList.contains('collapsed');
      section.classList.toggle('collapsed', isNowCollapsed);
      if (isNowCollapsed) state.ui.inspectorCollapsed.add(name);
      else state.ui.inspectorCollapsed.delete(name);
    });
  }
}

function activateDockPanel(rootSelector, key) {
  const root = document.querySelector(rootSelector);
  if (!root || !key) return;
  root.querySelectorAll('.dock-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === key));
  root.querySelectorAll('.dock-panel').forEach((panel) => {
    const active = panel.dataset.panel === key;
    panel.classList.toggle('active', active);
    if (rootSelector === '.right-dock') panel.style.display = active ? 'flex' : 'none';
  });
}

function activateRightDockTab(key) {
  activateDockPanel('.right-dock', key);
}

function activateBottomPanel(key) {
  if (!key) return;
  document.querySelectorAll('.bottom-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.bottom === key));
  document.querySelectorAll('.bottom-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.bottomPanel === key));
  if (key === 'spriteframes') renderSpriteFramesPanel();
  if (key === 'tilemaps') scheduleRender(RenderFlags.VIEWPORT);
  if (key === 'nineslice') { if (RGE_ROOT.RGENineSliceEditor?.render) RGE_ROOT.RGENineSliceEditor.render(); }
  if (key === 'transitions') { if (RGE_ROOT.RGETransitionEditor?.render) RGE_ROOT.RGETransitionEditor.render(); }
  if (key === 'optscores')    { if (RGE_ROOT.RGEOptionsEditor?.render)   RGE_ROOT.RGEOptionsEditor.render(); }
  if (key === 'uitemplates')  { if (RGE_ROOT.RGEUITemplates?.render)     RGE_ROOT.RGEUITemplates.render(); }
}

function isTileMapScenePaintModeActive() {
  const tileMapsTabActive = !!document.querySelector('.bottom-tab.active[data-bottom="tilemaps"]');
  const selectedNode = getNode(state.selectedId);
  return tileMapsTabActive && selectedNode?.type === 'TileMap';
}

function bindInspectorSearch() {
  const input = document.getElementById('inspector-search');
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    inspectorEl.querySelectorAll('.inspector-section').forEach((section) => {
      let anyVisible = false;
      section.querySelectorAll('label').forEach((label) => {
        const show = !query || label.textContent.toLowerCase().includes(query);
        label.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });
      section.style.display = anyVisible ? '' : 'none';
    });
  });
}

function updateToggleButtons() {
  document.getElementById('btn-grid')?.classList.toggle('active', state.showGrid);
  document.getElementById('btn-snap')?.classList.toggle('active', state.snapEnabled);
}

// ══════════════════════════════════════════════════════════════════════
// VIEWPORT
// ══════════════════════════════════════════════════════════════════════

async function createSpriteNodeFromFilesystemDrop(fileInfo, worldPos) {
  if (!fileInfo?.resPath || !window.electronAPI?.readProjectAsset) return false;
  const asset = await window.electronAPI.readProjectAsset({ resourcePath: fileInfo.resPath });
  if (!asset?.success) return false;
  const parentId = state.selectedId && getNode(state.selectedId) ? state.selectedId : getRootNodeId();
  const parentNode = getNode(parentId) || getNode(getRootNodeId());
  const node = createDefaultNode('Sprite2D', {
    name: String(fileInfo.name || 'Sprite').replace(/\.[^.]+$/, ''),
    parentId: parentNode.id,
    properties: {
      imagePath: fileInfo.resPath,
      imageDataUrl: asset.dataUrl,
      fitMode: 'contain',
      width: 96,
      height: 96,
      opacity: 1
    }
  });
  node.transform.x = snapValue(worldPos.x || 0);
  node.transform.y = snapValue(worldPos.y || 0);
  node.zIndex = getChildren(parentNode.id).length;
  getNodes().push(node);
  loadImageIntoCache(node.id, asset.dataUrl, () => scheduleRender(RenderFlags.VIEWPORT));
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(node.id);
  setStatus(`Added ${fileInfo.name} to the scene.`);
  return true;
}

function bindFilesystemViewportDrop(container) {
  if (!container) return;
  container.addEventListener('dragover', (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    const hasFile = types.includes('application/x-rokufile') || types.includes('text/plain');
    if (!hasFile) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  container.addEventListener('drop', async (event) => {
    let raw = event.dataTransfer?.getData('application/x-rokufile') || '';
    if (!raw) {
      const textData = event.dataTransfer?.getData('text/plain') || '';
      if (textData.startsWith('rokufile:')) raw = textData.slice('rokufile:'.length);
    }
    if (!raw) return;
    event.preventDefault();
    try {
      const fileInfo = JSON.parse(raw);
      if (fileInfo.kind !== 'image') {
        setStatus('Only image assets can be dropped into the viewport right now.', true);
        return;
      }
      const rect = container.getBoundingClientRect();
      const screenPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const worldPos = { x: (screenPos.x - state.viewport.x) / state.viewport.scale, y: (screenPos.y - state.viewport.y) / state.viewport.scale };
      pushHistory('Add sprite from FileSystem');
      await createSpriteNodeFromFilesystemDrop(fileInfo, worldPos);
    } catch (_error) {
      setStatus('Could not drop file into viewport.', true);
    }
  });
}

function initViewport() {
  if (typeof Konva === 'undefined' || !Konva || typeof Konva.Stage !== 'function') {
    throw new Error('Konva is not available in the renderer context.');
  }
  const container = document.getElementById('stage-container');
  stage = new Konva.Stage({ container: 'stage-container', width: container.clientWidth || 800, height: container.clientHeight || 600 });

  const el = stage.container();
  el.tabIndex = 0; el.style.outline = 'none'; el.style.cursor = 'default';
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    if (key === 'o') {
      state.tilemapEditor.tool = 'pick';
      updateTileMapToolButtons();
      renderTileMapsPanel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (key === 'e') {
      state.tilemapEditor.tool = 'erase';
      updateTileMapToolButtons();
      renderTileMapsPanel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (key !== 'p') return;
    if (paintSelectedTileMapWithKeyboard()) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  bindFilesystemViewportDrop(el);

  sceneLayer   = new Konva.Layer();
  window._sceneLayer = sceneLayer; // exposed for preview transport RAF redraws
  cameraGroup  = new Konva.Group();
  gridGroup    = new Konva.Group({ listening: false });
  contentGroup = new Konva.Group();
  uiContentGroup = new Konva.Group({ visible: false });

  transformer = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    borderStroke: '#478cbf', anchorFill: '#478cbf', anchorStroke: '#141620',
    keepRatio: false, centeredScaling: false, ignoreStroke: true
  });

  transformer.on('transformstart', () => {
    state.history.transformSnapshot = serializeScene(); state.history._vTransform = _getSceneVersion();
    captureTransformerSession();
  });
  transformer.on('transformend', () => {
    syncSelectedNodesFromShapes();
    const before = state.history.transformSnapshot; const _vTransform = state.history._vTransform || 0;
    state.history.transformSnapshot = null; state.history._vTransform = 0;
    state.transformerSession = null;
    scheduleRender(RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
    if (before && _sceneChanged(_vTransform)) pushHistory(getSelectedNodeIds().length > 1 ? 'Transform selection' : 'Transform node', before);
  });

  cameraGroup.add(gridGroup, contentGroup, transformer);
  sceneLayer.add(cameraGroup);
  sceneLayer.add(uiContentGroup);
  stage.add(sceneLayer);

  // Tile-paint hover overlay — sits above sceneLayer, redrawn cheaply on pointermove.
  tileHoverLayer = new Konva.Layer({ listening: false });
  stage.add(tileHoverLayer);

  // Camera gizmo layer — sits on top of everything, handles receive pointer events
  camGizmoLayer = new Konva.Layer({ listening: true });
  stage.add(camGizmoLayer);

  marqueeRect = new Konva.Rect({ visible: false, fill: 'rgba(71,140,191,0.18)', stroke: '#6ec6e8', dash: [6, 4], listening: false });
  sceneLayer.add(marqueeRect);

  // Stage click: deselect
  stage.on('click tap', (e) => {
    if (suppressStageClick) { suppressStageClick = false; return; }
    if (isTileMapScenePaintModeActive()) return;
    if (e.target === stage) selectNode(null);
  });

  stage.on('dblclick dbltap', (e) => {
    if (!isCameraPathEditMode()) return;
    const node = getSelectedCameraPathNode();
    if (!node || node.locked) return;
    const shape = shapeRefs.get(node.id);
    const pos = stage.getPointerPosition();
    if (!shape || !pos) return;
    e.cancelBubble = true;
    const local = shape.getAbsoluteTransform().copy().invert().point(pos);
    addCameraPathPoint(node.id, local);
  });

  // Marquee selection
  stage.on('mousedown touchstart', (e) => {
    const evt = e.evt || {};
    if (isTileMapScenePaintModeActive()) return;
    if (state.tool !== 'select' || e.target !== stage) return;
    if ((evt.button != null && evt.button !== 0) || evt.shiftKey || evt.altKey) return;
    const pos = stage.getPointerPosition();
    if (!pos || !marqueeRect) return;
    state.viewport.isMarqueeSelecting = true;
    state.viewport.marqueeAdditive = !!(evt.ctrlKey || evt.metaKey);
    state.viewport.marqueeStart = { x: pos.x, y: pos.y };
    marqueeRect.position(pos); marqueeRect.size({ width: 0, height: 0 }); marqueeRect.visible(true);
    suppressStageClick = true;
    sceneLayer.batchDraw();
  });

  stage.on('mousemove touchmove', () => {
    if (state.tilemapEditor.viewportGroupSelect?.active) {
      updateViewportTilePaint();
      return;
    }
    if (state.tilemapEditor.viewportPaint?.active) {
      updateViewportTilePaint();
      return;
    }
    if (isTileMapScenePaintModeActive()) {
      const node = getNode(state.selectedId);
      const shape = node ? shapeRefs.get(node.id) : null;
      if (node && shape) {
        const cell = getViewportTilePaintCell(node, shape);
        const newCol = (cell && cell.inside) ? cell.col : -1;
        const newRow = (cell && cell.inside) ? cell.row : -1;
        if (newCol !== state.tilemapEditor.hoverCol || newRow !== state.tilemapEditor.hoverRow) {
          state.tilemapEditor.hoverCol = newCol;
          state.tilemapEditor.hoverRow = newRow;
          scheduleRender(RenderFlags.VIEWPORT);
        }
      }
      return;
    }
    if (!state.viewport.isMarqueeSelecting || !marqueeRect) return;
    const pos = stage.getPointerPosition(); if (!pos) return;
    const start = state.viewport.marqueeStart || marqueeRect.position();
    marqueeRect.setAttrs({ x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) });
    sceneLayer.batchDraw();
  });

  stage.on('mouseup touchend', () => {
    if (state.tilemapEditor.viewportGroupSelect?.active) endViewportGroupSelect();
    if (state.tilemapEditor.viewportPaint?.active) endViewportTilePaint();
    if (!state.viewport.isMarqueeSelecting) return;
    state.viewport.isMarqueeSelecting = false; state.viewport.marqueeStart = null;
    finishMarqueeSelection();
  });

  // Panning
  let activePanId = null;
  const beginPan = (e) => {
    suppressStageClick = true; activePanId = e.pointerId;
    state.viewport.isPanning = true;
    state.viewport.panStart = { x: e.clientX, y: e.clientY, originX: state.viewport.x, originY: state.viewport.y };
    el.style.cursor = 'grabbing';
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };

  el.addEventListener('pointerdown', (e) => {
    const selectedNode = getNode(state.selectedId);
    const isTileMapSelected = selectedNode?.type === 'TileMap';
    // When a TileMap is selected: right-click is pick (handled by Konva), shift/alt allow paint
    // Only pan on middle-click, or when pan tool active, or shift/alt on non-TileMap
    if (state.tool === 'pan' || e.button === 1) { e.preventDefault(); beginPan(e); return; }
    if (e.button === 2 && !isTileMapSelected) { e.preventDefault(); beginPan(e); return; }
    if ((e.shiftKey || e.altKey) && !isTileMapSelected) { e.preventDefault(); beginPan(e); return; }
  });
  el.addEventListener('pointermove', (e) => {
    // Camera gizmo drag takes priority
    if (state.cameraPreview?.gizmo?.active) {
      const rect = el.getBoundingClientRect();
      _updateCamGizmoDrag(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (!state.viewport.isPanning || e.pointerId !== activePanId) return;
    state.viewport.x = state.viewport.panStart.originX + (e.clientX - state.viewport.panStart.x);
    state.viewport.y = state.viewport.panStart.originY + (e.clientY - state.viewport.panStart.y);
    applyViewportTransform();
  });
  const endPan = (e) => {
    // End gizmo drag too
    if (state.cameraPreview?.gizmo?.active) { _endCamGizmoDrag(); return; }
    if (!state.viewport.isPanning || (e && activePanId !== null && e.pointerId != null && e.pointerId !== activePanId)) return;
    state.viewport.isPanning = false; activePanId = null;
    el.style.cursor = state.tool === 'pan' ? 'grab' : 'default';
  };
  el.addEventListener('pointerup', endPan);
  el.addEventListener('pointercancel', endPan);
  el.addEventListener('lostpointercapture', () => endPan());

  // Zoom
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const ptr  = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const old  = state.viewport.scale;
    const world = { x: (ptr.x - state.viewport.x) / old, y: (ptr.y - state.viewport.y) / old };
    const next  = Math.max(0.2, Math.min(4, old * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    state.viewport.scale = next;
    state.viewport.x = ptr.x - world.x * next;
    state.viewport.y = ptr.y - world.y * next;
    applyViewportTransform(); updateZoomReadout();
    setStatus('Zoom ' + Math.round(next * 100) + '%.');
  }, { passive: false });

  window.addEventListener('resize', window.onResize);
  viewportReady = true;
  setTimeout(window.onResize, 0);
}

function applyViewportTransform() {
  if (!cameraGroup) return;
  cameraGroup.position({ x: state.viewport.x, y: state.viewport.y });
  cameraGroup.scale({ x: state.viewport.scale, y: state.viewport.scale });
  if (transformer) transformer.forceUpdate();
  // Keep gizmo layer aligned with scene (no full rebuild needed on pan/zoom)
  _syncGizmoLayerTransform?.();
  if (camGizmoLayer) camGizmoLayer.batchDraw();
  sceneLayer.batchDraw();
}

function updateZoomReadout() {
  if (zoomReadoutEl) zoomReadoutEl.textContent = Math.round(state.viewport.scale * 100) + '%';
}

// ══════════════════════════════════════════════════════════════════════
// NODE HELPERS
// ══════════════════════════════════════════════════════════════════════
function getNodes()     { return state.sceneState.nodes || []; }
function getNode(id)    { return getNodes().find((n) => n.id === id) || null; }

function getChildren(parentId) {
  return getNodes()
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => {
      const az = Number(a.zIndex) || 0, bz = Number(b.zIndex) || 0;
      return az !== bz ? az - bz : String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function getSelectionSet() {
  return new Set(Array.isArray(state.selectedIds) ? state.selectedIds : (state.selectedId ? [state.selectedId] : []));
}
function isNodeSelected(id) { return getSelectionSet().has(id); }

function getNormalizedSelection(ids, fallbackPrimary = null) {
  const valid = [], seen = new Set();
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    if (!id || isRootNodeId(id) || !getNode(id) || seen.has(id)) return;
    seen.add(id); valid.push(id);
  });
  if (!valid.length && fallbackPrimary && !isRootNodeId(fallbackPrimary) && getNode(fallbackPrimary)) valid.push(fallbackPrimary);
  return valid;
}

function syncEditorStateFromRuntime() {
  state.editorState = normalizeEditorState(state.editorState, state.sceneState, state.sceneState);
  const rootId = getRootNodeId();
  state.editorState.selection = getNormalizedSelection(state.selectedIds, state.selectedId);
  state.editorState.expandedTreeNodes = Array.from(new Set([
    rootId,
    ...Object.keys(state.tree.expanded || {}).filter((id) => state.tree.expanded[id])
  ]));
  state.editorState.viewport = {
    x: Number(state.viewport.x) || 0,
    y: Number(state.viewport.y) || 0,
    scale: Math.max(0.2, Number(state.viewport.scale) || 1)
  };
  state.editorState.spritesheets = getSerializableSpritesheets();
  state.editorState.spriteFramesLibraries = getSerializableSpriteFramesLibraries();
  state.editorState.tilesets = getSerializableTilesets();
  state.editorState.selectedSheetId = state.selectedSheetId || null;
  state.editorState.selectedSpriteFramesId = state.selectedSpriteFramesId || null;
  state.editorState.selectedTilesetId = state.selectedTilesetId || null;
  // Persist brush groups
  state.editorState.tilemapEditor = Object.assign({}, state.editorState.tilemapEditor || {}, {
    savedBrushGroups: Array.isArray(state.tilemapEditor.savedBrushGroups) ? state.tilemapEditor.savedBrushGroups : [],
    brushGroup: state.tilemapEditor.brushGroup || null,
    activeBrushGroupId: state.tilemapEditor.activeBrushGroupId || null,
    selectedTileIndex: state.tilemapEditor.selectedTileIndex ?? 0
  });
  // uiMeta is written directly into state.editorState by setEditorStateProp; preserve as-is.
  // NineSlice styles
  state.editorState.nineSliceStyles = getSerializableNineSliceStyles();
  state.editorState.selectedNineSliceStyleId = state.selectedNineSliceStyleId || null;
  // UI Screens
  state.editorState.uiScreens = getSerializableUIScreens();
  state.editorState.selectedUIScreenId = state.selectedUIScreenId || null;
  // UI Transition Presets
  state.editorState.uiTransitionPresets = getSerializableUITransitionPresets();
  state.editorState.selectedUITransitionPresetId = state.selectedUITransitionPresetId || null;
  // UI Options and High Scores
  state.editorState.uiOptionDefs = getSerializableUIOptionDefs();
  state.editorState.uiHighScoreTables = getSerializableUIHighScoreTables();
  // Audio engine state (mixers, clips, bus config)
  if (RGE_ROOT.RGEAudioEngine) {
    state.editorState.audioEngine = RGE_ROOT.RGEAudioEngine.serialize();
  }
}

function applyLoadedSceneData(runtimeScene, editorState) {
  // Invalidate all version guards before replacing scene content.
  // Without this, the viewport/tree guards see an unchanged _sceneVersion
  // and skip the full rebuild after a scene tab switch.
  _bumpSceneVersion();
  invalidateViewportCache();
  // Reset per-flush guards so the new scene always renders fully
  _treeRenderedThisFlush    = false;
  _viewportRenderedThisFlush = false;
  _lastSpriteSheetVersion   = -1;

  state.sceneState = normalizeScene(runtimeScene);
  state.editorState = normalizeEditorState(editorState, state.sceneState, runtimeScene);
  state.selectedIds = getNormalizedSelection(state.editorState.selection || [], null);
  state.selectedId = state.selectedIds[0] || null;
  state.viewport.x = Number(state.editorState.viewport?.x) || 0;
  state.viewport.y = Number(state.editorState.viewport?.y) || 0;
  state.viewport.scale = Math.max(0.2, Number(state.editorState.viewport?.scale) || 1);
  state.tree.expanded = Object.fromEntries((state.editorState.expandedTreeNodes || []).map((id) => [id, true]));
  if (!Object.keys(state.tree.expanded).length) state.tree.expanded = { [getRootNodeId()]: true };
  rebuildSpritesheetsFromSceneState();
  rebuildSpriteFramesLibrariesFromSceneState();
  rebuildTilesetsFromSceneState();
  rebuildNineSliceStylesFromSceneState();
  rebuildUIScreensFromSceneState();
  rebuildUITransitionPresetsFromSceneState();
  rebuildUIOptionDefsFromSceneState();
  rebuildUIHighScoreTablesFromSceneState();
  // Restore tilemap editor state from saved editorState
  if (editorState && editorState.tilemapEditor) {
    const te = editorState.tilemapEditor;
    if (te.activeLayerId) state.tilemapEditor.activeLayerId = te.activeLayerId;
    if (te.tool) state.tilemapEditor.tool = te.tool;
    if (te.paintMode) state.tilemapEditor.paintMode = te.paintMode;
    if (Number.isFinite(Number(te.selectedTileIndex))) state.tilemapEditor.selectedTileIndex = Number(te.selectedTileIndex);
    if (Array.isArray(te.savedBrushGroups)) state.tilemapEditor.savedBrushGroups = te.savedBrushGroups;
    if (Array.isArray(te.brushGroup)) state.tilemapEditor.brushGroup = te.brushGroup;
    state.tilemapEditor.activeBrushGroupId = te.activeBrushGroupId || null;
  }
  // Ensure all TileMap nodes have their layers initialized on load
  (getNodes ? getNodes() : []).forEach((node) => {
    if (node && node.type === 'TileMap') {
      ensureTileMapData(node);
    }
  });
  // Restore audio engine state (mixers, clips, bus config)
  if (RGE_ROOT.RGEAudioEngine && editorState && editorState.audioEngine) {
    RGE_ROOT.RGEAudioEngine.deserialize(editorState.audioEngine);
  }
  // Restore camera preview selection from editorState
  if (editorState?.cameraPreview && window.state?.cameraPreview) {
    window.state.cameraPreview.selectedCameraId = editorState.cameraPreview.selectedCameraId || null;
    if (editorState.cameraPreview.overlays && window.state.cameraPreview.overlays) {
      Object.assign(window.state.cameraPreview.overlays, editorState.cameraPreview.overlays);
    }
  }
  // Refresh camera selector after scene load
  requestAnimationFrame(() => notifyCameraPreviewSceneChanged());
}

function updateEditorSelection() {
  syncEditorStateFromRuntime();
}

function setSelection(ids, primaryId = null, options = {}) {
  const normalized = getNormalizedSelection(ids, primaryId);
  state.selectedIds = normalized;
  state.selectedId  = primaryId && normalized.includes(primaryId) ? primaryId : (normalized[normalized.length - 1] || null);
  if (!state.selectedId || getNode(state.selectedId)?.type !== 'CameraPath2D') {
    if (typeof isCameraPathEditMode === 'function' && isCameraPathEditMode()) {
      state.tool = 'select';
    }
    state.cameraPathEditor.selectedNodeId = null;
    state.cameraPathEditor.selectedPointIndices = new Set();
    closeCameraPathPointMenu();
    // Stop preview if we're deselecting the previewed path node
    if (state.cameraPathEditor.previewPlaying) {
      if (typeof cameraPathPreviewStop === 'function') cameraPathPreviewStop();
    }
  }
  if (state.selectedId) ensureNodeAncestorsExpanded(state.selectedId);
  normalized.forEach((id) => ensureNodeAncestorsExpanded(id));
  updateEditorSelection();
  syncAnimationEditorFromSelection();
  // Only flush VIEWPORT synchronously so attachTransformer() sees the current Konva scene.
  // Tree and inspector are deferred to the next rAF — no visible difference since
  // neither panel paints before the next frame anyway.
  flushRender(RenderFlags.VIEWPORT);
  attachTransformer();
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR);

  // Auto-open bottom editors based on selected node type
  const selNode = getNode(state.selectedId);
  if (selNode?.type === 'AnimatedSprite2D') activateBottomPanel('spriteframes');
  scheduleRender(RenderFlags.SPRITE_FRAMES);

  if (state.selectedIds.length > 1) {
    setStatus(`Selected ${state.selectedIds.length} nodes.`);
    if (nodeSummaryEl) nodeSummaryEl.textContent = `${state.selectedIds.length} nodes selected.`;
  } else if (state.selectedId) {
    const n = getNode(state.selectedId);
    setStatus('Selected ' + (n ? n.name : state.selectedId));
    if (nodeSummaryEl) nodeSummaryEl.textContent = n ? `${n.name} (${n.type}) — x:${n.transform.x} y:${n.transform.y}` : state.selectedId;
  } else {
    setStatus('Selection cleared.');
    if (nodeSummaryEl) nodeSummaryEl.textContent = 'No selection.';
  }
}

function selectNode(id, options = {}) {
  if (!id) return setSelection([], null, options);
  if (options.toggle) {
    const next = Array.isArray(state.selectedIds) ? state.selectedIds.slice() : [];
    const idx  = next.indexOf(id);
    if (idx >= 0) next.splice(idx, 1); else next.push(id);
    return setSelection(next, idx >= 0 ? (next[next.length - 1] || null) : id, options);
  }
  if (options.additive) {
    const next = Array.isArray(state.selectedIds) ? state.selectedIds.slice() : [];
    if (!next.includes(id)) next.push(id);
    return setSelection(next, id, options);
  }
  return setSelection([id], id, options);
}

function getSelectedNodeIds() { return getNormalizedSelection(state.selectedIds, state.selectedId); }
function getMovableSelectedNodeIds() {
  return getSelectedNodeIds().filter((id) => {
    const node = getNode(id);
    return node && !isRootNodeId(node.id) && node.locked !== true;
  });
}
function deleteSelectedNodes() {
  const ids = getSelectedNodeIds().filter((id) => !isRootNodeId(id));
  if (!ids.length) return false;
  const roots = ids.filter((id) => !ids.some((other) => other !== id && isDescendantOf(id, other)));
  if (!roots.length) return false;
  const before = serializeScene(); const _vDelete = _getSceneVersion();
  const toDelete = new Set();
  const walk = (id) => {
    toDelete.add(id);
    getChildren(id).forEach((c) => walk(c.id));
  };
  roots.forEach(walk);
  state.sceneState.nodes = getNodes().filter((n) => !toDelete.has(n.id));
  const fallbackId = getNode(roots[0])?.parentId || getRootNodeId();
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(isRootNodeId(fallbackId) ? null : fallbackId);
  pushHistory(roots.length > 1 ? 'Delete selection' : `Delete ${getNode(roots[0])?.name || 'node'}`, before);
  setStatus(roots.length > 1 ? `Deleted ${roots.length} selected nodes.` : 'Deleted selected node.');
  return true;
}
function duplicateSelectedNodes() {
  const ids = getSelectedNodeIds().filter((id) => !isRootNodeId(id));
  if (!ids.length) return false;
  const roots = ids.filter((id) => !ids.some((other) => other !== id && isDescendantOf(id, other)));
  if (!roots.length) return false;
  const before = serializeScene(); const _vDupe = _getSceneVersion();
  const newRootIds = [];
  roots.forEach((id) => {
    const source = getNode(id);
    if (!source) return;
    const clones = [];
    const cloneBranch = (src, nextParent, isRoot) => {
      const clone = JSON.parse(JSON.stringify(src));
      clone.id = generateNodeId();
      clone.parentId = nextParent;
      if (isRoot) {
        clone.name = getDuplicatedNodeName(src.name);
        clone.transform = { ...(clone.transform || {}), x: (Number(clone.transform?.x) || 0) + GRID_SIZE, y: (Number(clone.transform?.y) || 0) + GRID_SIZE };
        newRootIds.push(clone.id);
      }
      clones.push(clone);
      getChildren(src.id).forEach((child) => cloneBranch(child, clone.id, false));
    };
    cloneBranch(source, source.parentId || getRootNodeId(), true);
    getNodes().push(...clones);
    ensureNodeExpanded(source.parentId || getRootNodeId());
  });
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  setSelection(newRootIds, newRootIds[newRootIds.length - 1] || null);
  pushHistory(roots.length > 1 ? 'Duplicate selection' : `Duplicate ${getNode(roots[0])?.name || 'node'}`, before);
  setStatus(roots.length > 1 ? `Duplicated ${roots.length} selected nodes.` : 'Duplicated selected node.');
  return true;
}
function beginSelectionDrag(activeNodeId) {
  const ids = getMovableSelectedNodeIds();
  if (!ids.length || !ids.includes(activeNodeId)) { state.selectionDrag = null; return; }
  state.selectionDrag = {
    activeNodeId,
    snapshot: serializeScene(), _vDrag: _getSceneVersion(),
    globals: Object.fromEntries(ids.map((id) => [id, { ...getGlobalTransform(id) }]))
  };
}
function updateSelectionDragFromNode(activeNodeId) {
  const drag = state.selectionDrag;
  if (!drag || drag.activeNodeId !== activeNodeId) return;
  const baseBefore = drag.globals[activeNodeId];
  const activeNode = getNode(activeNodeId);
  if (!baseBefore || !activeNode) return;
  const baseNow = getGlobalTransform(activeNodeId);
  const dx = (baseNow.x || 0) - (baseBefore.x || 0);
  const dy = (baseNow.y || 0) - (baseBefore.y || 0);
  Object.entries(drag.globals).forEach(([id, gt]) => {
    if (id === activeNodeId) return;
    const node = getNode(id);
    const shape = shapeRefs.get(id);
    if (!node || !shape) return;
    setNodeLocalFromGlobal(node, { x: (gt.x || 0) + dx, y: (gt.y || 0) + dy, rotation: gt.rotation || 0, scaleX: gt.scaleX || 1, scaleY: gt.scaleY || 1 }, node.parentId || null);
    shape.position({ x: Number(node.transform?.x) || 0, y: Number(node.transform?.y) || 0 });
    shape.rotation(Number(node.transform?.rotation) || 0);
    shape.scale({ x: Number(node.transform?.scaleX) || 1, y: Number(node.transform?.scaleY) || 1 });
  });
}
function endSelectionDrag() {
  const drag = state.selectionDrag;
  state.selectionDrag = null;
  if (!drag) return;
  scheduleRender(RenderFlags.STRUCTURAL | RenderFlags.INSPECTOR);
  const _vDrag = drag._vDrag || 0;
  if (drag.snapshot && _sceneChanged(_vDrag)) pushHistory(getSelectedNodeIds().length > 1 ? 'Move selection' : 'Move node', drag.snapshot);
}
function nudgeSelectedNodes(dx, dy) {
  const ids = getMovableSelectedNodeIds();
  if (!ids.length) return false;
  const before = serializeScene(); const _vNudge = _getSceneVersion();
  ids.forEach((id) => {
    const node = getNode(id);
    if (!node) return;
    const gt = getGlobalTransform(id);
    setNodeLocalFromGlobal(node, {
      x: (gt.x || 0) + dx,
      y: (gt.y || 0) + dy,
      rotation: gt.rotation || 0,
      scaleX: gt.scaleX || 1,
      scaleY: gt.scaleY || 1
    }, node.parentId || null);
    if (state.snapEnabled) {
      node.transform.x = snapValue(node.transform.x);
      node.transform.y = snapValue(node.transform.y);
    }
  });
  scheduleRender(RenderFlags.STRUCTURAL | RenderFlags.INSPECTOR);
  if (_sceneChanged(_vNudge)) pushHistory(ids.length > 1 ? 'Nudge selection' : 'Nudge node', before);
  return true;
}
function captureTransformerSession() {
  const ids = getMovableSelectedNodeIds();
  state.transformerSession = {
    ids,
    perNode: Object.fromEntries(ids.map((id) => {
      const node = getNode(id);
      const shape = shapeRefs.get(id);
      return [id, {
        width: Number(node?.properties?.width),
        height: Number(node?.properties?.height),
        nodeScaleX: Number(node?.transform?.scaleX) || 1,
        nodeScaleY: Number(node?.transform?.scaleY) || 1,
        shapeScaleX: Number(shape?.scaleX?.() ?? 1) || 1,
        shapeScaleY: Number(shape?.scaleY?.() ?? 1) || 1
      }];
    }))
  };
}
function syncSelectedNodesFromShapes() {
  const ids = getMovableSelectedNodeIds();
  const session = state.transformerSession || { perNode: {} };
  ids.forEach((id) => {
    const node = getNode(id);
    const shape = shapeRefs.get(id);
    if (!node || !shape) return;
    const absPos = typeof shape.getAbsolutePosition === 'function' ? shape.getAbsolutePosition(contentGroup) : { x: shape.x(), y: shape.y() };
    const absScale = typeof shape.getAbsoluteScale === 'function' ? shape.getAbsoluteScale() : { x: shape.scaleX(), y: shape.scaleY() };
    setNodeLocalFromGlobal(node, {
      x: absPos.x,
      y: absPos.y,
      rotation: typeof shape.getAbsoluteRotation === 'function' ? shape.getAbsoluteRotation() : shape.rotation(),
      scaleX: absScale?.x ?? shape.scaleX(),
      scaleY: absScale?.y ?? shape.scaleY()
    }, node.parentId || null);

    const baseline = session.perNode?.[id] || {};
    const startShapeScaleX = Number(baseline.shapeScaleX) || 1;
    const startShapeScaleY = Number(baseline.shapeScaleY) || 1;
    const currentShapeScaleX = Number(shape.scaleX()) || 1;
    const currentShapeScaleY = Number(shape.scaleY()) || 1;
    const deltaScaleX = currentShapeScaleX / startShapeScaleX;
    const deltaScaleY = currentShapeScaleY / startShapeScaleY;

    if (node.properties.width != null || node.properties.height != null) {
      const scaleChangedX = Math.abs(deltaScaleX - 1) > 0.0001;
      const scaleChangedY = Math.abs(deltaScaleY - 1) > 0.0001;
      if (node.properties.width != null && scaleChangedX) {
        const startWidth = Number.isFinite(baseline.width) ? baseline.width : (Number(node.properties.width) || 1);
        node.properties.width = Math.max(1, Math.round(startWidth * Math.abs(deltaScaleX)));
      }
      if (node.properties.height != null && scaleChangedY) {
        const startHeight = Number.isFinite(baseline.height) ? baseline.height : (Number(node.properties.height) || 1);
        node.properties.height = Math.max(1, Math.round(startHeight * Math.abs(deltaScaleY)));
      }
      // Scale collider dimensions by the same ratios as the node itself.
      if (scaleChangedX || scaleChangedY) {
        scaleNodeColliders(node, Math.abs(deltaScaleX), Math.abs(deltaScaleY));
      }
      node.transform.scaleX = Number(baseline.nodeScaleX) || 1;
      node.transform.scaleY = Number(baseline.nodeScaleY) || 1;
      // Recalculate pivot after size change so named presets (center, bottom-center, etc.)
      // stay proportionally correct relative to the new dimensions.
      const preset = String(node.transform?.pivotPreset || '').trim();
      if (preset && preset !== 'custom' && (scaleChangedX || scaleChangedY)) {
        applyPivotPreset(node, preset, { keepPivotWorldPosition: true });
      }
    } else {
      node.transform.scaleX = (Number(baseline.nodeScaleX) || 1) * deltaScaleX;
      node.transform.scaleY = (Number(baseline.nodeScaleY) || 1) * deltaScaleY;
    }

    shape.scale({ x: 1, y: 1 });
  });
}
function getFrameTargetIds()  {
  const ids = getSelectedNodeIds();
  return ids.length ? ids : getNodes().filter((n) => !isRootNodeId(n.id) && n.visible !== false).map((n) => n.id);
}
function frameSelectionOrAll() {
  const ids = getFrameTargetIds();
  return ids.length && getSelectedNodeIds().length ? frameNodes(ids, 'Framed selection.') : frameAllNodes();
}


async function createNewInheritedScene() {
  const result = await window.electronAPI.openScene();
  if (!result?.success || !result.json) return false;
  const parsedScene = parseSceneJson(result.json);
  if (!parsedScene.ok) {
    setStatus('Could not create inherited scene: source JSON is invalid.', true);
    return false;
  }
  const migration = migrateSceneDocument(parsedScene.data);
  if (!migration.ok) {
    setStatus('Could not create inherited scene: source scene migration failed.', true);
    return false;
  }
  persistActiveSceneEntry();
  const sourceRuntime = cloneInheritanceSourceSnapshot(migration.data);
  const sourceName = sourceRuntime.scene?.name || 'Scene';
  let inheritedRuntime = normalizeScene(sourceRuntime);
  inheritedRuntime.scene = Object.assign({}, inheritedRuntime.scene || {}, {
    name: `${sourceName} Inherited`,
    inheritance: {
      sourceScenePath: makeProjectResPathFromAbsolute(result.filePath || '') || '',
      sourceSceneName: sourceName,
      mode: 'live-linked',
      sourceSnapshot: cloneInheritanceSourceSnapshot(sourceRuntime),
      lastRebasedAt: new Date().toISOString()
    }
  });
  let inheritedEditorSource = {};
  if (result.editorStateJson) {
    try { inheritedEditorSource = JSON.parse(result.editorStateJson); } catch (_error) {}
  }
  const inheritedEditor = normalizeEditorState(inheritedEditorSource, inheritedRuntime, inheritedRuntime);
  const newSceneEntry = {
    sceneState: inheritedRuntime,
    editorState: inheritedEditor,
    name: inheritedRuntime.scene?.name || 'Inherited Scene',
    documentState: cloneDocumentState({})
  };
  state.scenes.push(newSceneEntry);
  setActiveScene(state.scenes.length - 1);
  markHistoryBaseline();
  scheduleRender(RenderFlags.FULL);
  setStatus(`Created inherited scene from ${result.filePath || 'source scene'}.`);
  return true;
}

function createNewScene() {
  persistActiveSceneEntry();

  const runtimeScene = normalizeScene();
  const editorState = normalizeEditorState(null, runtimeScene);
  const newSceneEntry = {
    sceneState: runtimeScene,
    editorState,
    name: runtimeScene.scene?.name || 'MainScene',
    documentState: cloneDocumentState({})
  };

  state.scenes.push(newSceneEntry);
  setActiveScene(state.scenes.length - 1);

  state.selectedIds = [];
  state.selectedId = null;
  state.viewport.x = 0;
  state.viewport.y = 0;
  state.viewport.scale = 1;
  state.tree.expanded = { [getRootNodeId()]: true };
  syncEditorStateFromRuntime();
  persistActiveSceneEntry();

  markHistoryBaseline();
  persistActiveSceneEntry();
  scheduleRender(RenderFlags.FULL);
  setStatus(`Created new scene "${newSceneEntry.name}".`);
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
function collectMarqueeSelection(rect, additive) {
  const ids = [];
  shapeRefs.forEach((shape, id) => {
    if (!shape || !shape.isVisible()) return;
    const node = getNode(id);
    if (!node || isRootNodeId(node.id) || node.visible === false) return;
    if (rectsIntersect(rect, shape.getClientRect({ relativeTo: stage }))) ids.push(id);
  });
  const next = additive ? Array.from(new Set([...getSelectedNodeIds(), ...ids])) : ids;
  setSelection(next, ids[ids.length - 1] || next[next.length - 1] || null);
}
function finishMarqueeSelection() {
  if (!marqueeRect || !marqueeRect.visible()) return false;
  const rect = { x: marqueeRect.x(), y: marqueeRect.y(), width: marqueeRect.width(), height: marqueeRect.height() };
  marqueeRect.visible(false); sceneLayer.batchDraw();
  if (rect.width < 4 || rect.height < 4) return false;
  collectMarqueeSelection(rect, !!state.viewport.marqueeAdditive);
  return true;
}

function getSiblingNodes(nodeId) {
  const node = getNode(nodeId);
  return node ? getChildren(node.parentId || getRootNodeId()) : [];
}
function getSiblingIndex(nodeId) { return getSiblingNodes(nodeId).findIndex((c) => c.id === nodeId); }
function normalizeSiblingOrderByAppearance(parentId) {
  getNodes().filter((n) => (n.parentId || getRootNodeId()) === parentId).forEach((c, i) => { c.zIndex = i; });
}

function reorderNodeAmongSiblings(nodeId, direction) {
  const node = getNode(nodeId);
  if (!node || isRootNodeId(node.id)) return false;
  const parentId = node.parentId || getRootNodeId();
  const siblings  = getChildren(parentId);
  const fromIndex = siblings.findIndex((c) => c.id === nodeId);
  if (fromIndex < 0) return false;
  let toIndex = fromIndex;
  if (direction === 'up')     toIndex = Math.max(0, fromIndex - 1);
  else if (direction === 'down')   toIndex = Math.min(siblings.length - 1, fromIndex + 1);
  else if (direction === 'top')    toIndex = 0;
  else if (direction === 'bottom') toIndex = siblings.length - 1;
  else if (typeof direction === 'number') toIndex = Math.max(0, Math.min(siblings.length - 1, direction));
  if (toIndex === fromIndex) return false;
  const beforeSnapshot = serializeScene(); const _vReorder = _getSceneVersion();
  const orderedIds = siblings.map((c) => c.id);
  const [moved] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, moved);
  orderedIds.forEach((id, i) => { const c = getNode(id); if (c) c.zIndex = i; });
  scheduleRender(RenderFlags.TREE | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(nodeId);
  pushHistory(`Reorder ${node.name}`, beforeSnapshot);
  setStatus(`Moved ${node.name} ${direction}.`);
  return true;
}

function toggleNodeVisibility(nodeId) {
  const node = getNode(nodeId); if (!node) return false;
  const before = serializeScene(); const _vVisible = _getSceneVersion();
  node.visible = node.visible === false;
  scheduleRender(RenderFlags.TREE | RenderFlags.VIEWPORT);
  pushHistory(`${node.visible ? 'Show' : 'Hide'} ${node.name}`, before);
  setStatus(`${node.visible ? 'Shown' : 'Hidden'} ${node.name}.`);
  return true;
}

function toggleNodeLocked(nodeId) {
  const node = getNode(nodeId); if (!node) return false;
  const before = serializeScene(); const _vLock = _getSceneVersion();
  node.locked = !node.locked;
  scheduleRender(RenderFlags.TREE | RenderFlags.VIEWPORT);
  pushHistory(`${node.locked ? 'Lock' : 'Unlock'} ${node.name}`, before);
  setStatus(`${node.locked ? 'Locked' : 'Unlocked'} ${node.name}.`);
  return true;
}

function getSelectedAncestryIds() {
  const ids = new Set();
  let current = getNode(state.selectedId);
  while (current && current.parentId) { ids.add(current.parentId); current = getNode(current.parentId); }
  return ids;
}

function isDescendantOf(nodeId, ancestorId) {
  if (!nodeId || !ancestorId) return false;
  let current = getNode(nodeId);
  const seen = new Set();
  while (current && current.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.id); current = getNode(current.parentId);
  }
  return false;
}

function canReparentNode(nodeId, nextParentId) {
  const node = getNode(nodeId), parent = getNode(nextParentId);
  if (!node || !parent || isRootNodeId(node.id) || node.id === nextParentId) return false;
  if (isDescendantOf(nextParentId, node.id)) return false;
  return window.RokuNodes.canParentNode(node.type, parent.type);
}

function rotatePoint(x, y, deg) {
  const r = (Number(deg) || 0) * Math.PI / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}
function getNodeLocalTransform(node) {
  return {
    x: Number(node?.transform?.x) || 0, y: Number(node?.transform?.y) || 0,
    rotation: Number(node?.transform?.rotation) || 0,
    scaleX: Number(node?.transform?.scaleX) || 1, scaleY: Number(node?.transform?.scaleY) || 1
  };
}
function composeTransforms(parent, local) {
  const { x, y } = rotatePoint(local.x * parent.scaleX, local.y * parent.scaleY, parent.rotation);
  return { x: parent.x + x, y: parent.y + y, rotation: parent.rotation + local.rotation, scaleX: parent.scaleX * local.scaleX, scaleY: parent.scaleY * local.scaleY };
}
function getGlobalTransform(nodeId) {
  const node = getNode(nodeId);
  if (!node) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  if (!node.parentId || isRootNodeId(node.id)) return getNodeLocalTransform(node);
  const parent = getNode(node.parentId);
  return composeTransforms(parent ? getGlobalTransform(parent.id) : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, getNodeLocalTransform(node));
}
function setNodeLocalFromGlobal(node, gt, parentId) {
  const pg = parentId ? getGlobalTransform(parentId) : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const { x, y } = rotatePoint((gt?.x || 0) - pg.x, (gt?.y || 0) - pg.y, -pg.rotation);
  node.transform.x        = Math.round(x / (pg.scaleX || 1));
  node.transform.y        = Math.round(y / (pg.scaleY || 1));
  node.transform.rotation = Math.round((gt?.rotation || 0) - pg.rotation);
  node.transform.scaleX   = (gt?.scaleX || 1) / (pg.scaleX || 1);
  node.transform.scaleY   = (gt?.scaleY || 1) / (pg.scaleY || 1);
}
function setNodeLocalPositionFromGlobal(node, globalPos, parentId) {
  const pg = parentId ? getGlobalTransform(parentId) : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const { x, y } = rotatePoint((globalPos?.x || 0) - pg.x, (globalPos?.y || 0) - pg.y, -pg.rotation);
  node.transform.x = Math.round(x / (pg.scaleX || 1));
  node.transform.y = Math.round(y / (pg.scaleY || 1));
}

function getDuplicatedNodeName(baseName) {
  const clean = String(baseName || 'Node').replace(/\s*\d+$/, '');
  const existing = new Set(getNodes().map((n) => n.name));
  if (!existing.has(`${clean} 2`)) return `${clean} 2`;
  let i = 3;
  while (existing.has(`${clean} ${i}`)) i++;
  return `${clean} ${i}`;
}

function ensureNodeExpanded(nodeId) { if (nodeId) state.tree.expanded[nodeId] = true; }
function ensureNodeAncestorsExpanded(nodeId) {
  let current = getNode(nodeId);
  while (current && current.parentId) { state.tree.expanded[current.parentId] = true; current = getNode(current.parentId); }
}
function toggleTreeExpanded(nodeId) { if (nodeId) { state.tree.expanded[nodeId] = !state.tree.expanded[nodeId]; refreshTree(); } }

function deleteNode(nodeId) {
  const node = getNode(nodeId);
  if (!node || isRootNodeId(node.id)) return false;
  const before = serializeScene(); const _vDel1 = _getSceneVersion();
  const toDelete = new Set();
  const walk = (id) => { toDelete.add(id); getChildren(id).forEach((c) => walk(c.id)); };
  walk(nodeId);
  state.sceneState.nodes = getNodes().filter((n) => !toDelete.has(n.id));
  if (state.selectedId && toDelete.has(state.selectedId)) {
    state.selectedId = node.parentId || getRootNodeId();
    if (state.selectedId) state.editorState.selection = [state.selectedId];
  }
  // ── Phase 9: Purge deleted node IDs from all CameraTargetGroup target lists ──
  getNodes().forEach(n => {
    if (n && n.type === 'CameraTargetGroup' && Array.isArray(n.properties?.targets)) {
      const before2 = n.properties.targets.length;
      n.properties.targets = n.properties.targets.filter(t => t && !toDelete.has(t.nodeId));
      if (n.properties.targets.length !== before2) _bumpSceneVersion();
    }
  });
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory(`Delete ${node.name}`, before);
  setStatus(`Deleted ${node.name}.`);
  notifyCameraPreviewSceneChanged();
  return true;
}

function duplicateNode(nodeId, parentIdOverride) {
  const source = getNode(nodeId); if (!source) return false;
  const before  = serializeScene();
  const clones  = [];
  const parentId = parentIdOverride || source.parentId || getRootNodeId();
  const cloneBranch = (src, nextParent, isRoot) => {
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = generateNodeId();
    clone.parentId = nextParent;
    if (isRoot) {
      clone.name = getDuplicatedNodeName(src.name);
      clone.transform = { ...(clone.transform || {}), x: (Number(clone.transform?.x) || 0) + GRID_SIZE, y: (Number(clone.transform?.y) || 0) + GRID_SIZE };
    }
    clones.push(clone);
    getChildren(src.id).forEach((child) => cloneBranch(child, clone.id, false));
    return clone;
  };
  const rootClone = cloneBranch(source, parentId, true);
  getNodes().push(...clones);
  ensureNodeExpanded(parentId);
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(rootClone.id);
  pushHistory(`Duplicate ${source.name}`, before);
  setStatus(`Duplicated ${source.name}.`);
  return true;
}

function moveNodeToIndex(nodeId, nextParentId, beforeNodeId) {
  if (!canReparentNode(nodeId, nextParentId)) return false;
  const node = getNode(nodeId); if (!node) return false;
  const previousParentId = node.parentId || getRootNodeId();
  const before  = serializeScene();
  const globalBefore = getGlobalTransform(nodeId);
  const nodes   = getNodes();
  const moving  = nodes.find((n) => n.id === nodeId);
  state.sceneState.nodes = nodes.filter((n) => n.id !== nodeId);
  moving.parentId = nextParentId;
  setNodeLocalFromGlobal(moving, globalBefore, nextParentId);
  const targetNodes = state.sceneState.nodes;
  let insertIndex = targetNodes.length;
  if (beforeNodeId) {
    const idx = targetNodes.findIndex((n) => n.id === beforeNodeId);
    if (idx >= 0) insertIndex = idx;
  } else {
    let last = -1;
    targetNodes.forEach((n, idx) => { if ((n.parentId || getRootNodeId()) === nextParentId) last = idx; });
    insertIndex = last + 1;
  }
  targetNodes.splice(insertIndex, 0, moving);
  normalizeSiblingOrderByAppearance(previousParentId);
  normalizeSiblingOrderByAppearance(nextParentId);
  ensureNodeExpanded(nextParentId);
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(nodeId);
  pushHistory(`Reparent ${node.name}`, before);
  setStatus(`Reparented ${node.name} to ${getNode(nextParentId)?.name || nextParentId}.`);
  return true;
}
function reparentNode(nodeId, nextParentId) { return moveNodeToIndex(nodeId, nextParentId, null); }

function _finishNodeRename(nodeId, newName) {
  state.ui.nodeRenameId = null;
  const node = getNode(nodeId);
  if (!node) { refreshTree(); return; }
  const trimmed = String(newName ?? '').trim();
  if (trimmed && trimmed !== node.name) {
    const before = serializeScene(); const _vRenNode = _getSceneVersion();
    node.name = trimmed;
    pushHistory(`Rename ${trimmed}`, before);
    setStatus(`Renamed to "${trimmed}".`);
    if (node.type === 'Camera2D') notifyCameraPreviewSceneChanged();
  }
  refreshTree();
}

function addNode(type, parentId = getRootNodeId()) {
  if (type === 'SceneInstance') {
    void instantiateSceneFromFile(parentId);
    return;
  }
  const def = getNodeDef(type); if (!def) return;
  const parent = getNode(parentId) || getNode(getRootNodeId());
  pushHistory(`Add ${def.displayName || type}`);
  const node = createDefaultNode(type);
  if (type === 'TileMap' || type === 'CameraPath2D') {
    node.transform.x = 0;
    node.transform.y = 0;
    node.transform.pivotX = 0;
    node.transform.pivotY = 0;
  }
  if (type === 'AnimatedSprite2D') {
	  let lib = null;

	  if (state.selectedSpriteFramesId) {
		lib = getSpriteFramesLibraryById(state.selectedSpriteFramesId);
	  }

	  if (!lib && state.spriteFramesLibraries.length) {
		lib = state.spriteFramesLibraries[0];
	  }

	  if (!lib) {
		lib = createSpriteFramesLibrary('SpriteFrames');
	  }

	  node.properties.spriteFramesId = lib.id;
	  node.properties.animation = lib.clips[0]?.name || '';
	  node.properties.previewFrame = lib.clips[0]?.frames?.[0] ?? 0;
	}
  node.parentId   = parent?.id || getRootNodeId();
  if (type !== 'TileMap' && type !== 'CameraPath2D') {
    // Compute a world-space offset, then convert to local space when parented,
    // so the child appears near center-viewport rather than stuck at 0,0.
    const worldX = snapValue(80 + (getNodes().length * 18));
    const worldY = snapValue(80 + (getNodes().length * 18));
    const isChild = node.parentId && !isRootNodeId(node.parentId);
    if (isChild) {
      const pg = getGlobalTransform(node.parentId);
      node.transform.x = snapValue((worldX - pg.x) / (pg.scaleX || 1));
      node.transform.y = snapValue((worldY - pg.y) / (pg.scaleY || 1));
    } else {
      node.transform.x = worldX;
      node.transform.y = worldY;
    }
  }
  node.zIndex      = getChildren(node.parentId).length;
  getNodes().push(node);
  scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  selectNode(node.id);
  setStatus('Added ' + (def.displayName || type) + '.');
  if (type === 'Camera2D') notifyCameraPreviewSceneChanged();
  
}


function finishInlineSceneRename(index, value, options = {}) {
  const activeBefore = state.ui.sceneRenameIndex;
  state.ui.sceneRenameIndex = null;
  const canceled = !!options.cancel;
  if (canceled) {
    scheduleRender(RenderFlags.SCENE_TABS | RenderFlags.TREE);
    return false;
  }
  const targetIndex = Number.isInteger(index) ? index : state.activeSceneIndex;
  if (targetIndex !== state.activeSceneIndex) setActiveScene(targetIndex);
  const renamed = renameCurrentScene(value);
  scheduleRender(RenderFlags.SCENE_TABS | RenderFlags.TREE | RenderFlags.INSPECTOR);
  return renamed || activeBefore !== null;
}

function startInlineSceneRename(index = state.activeSceneIndex) {
  if (!Number.isInteger(index) || index < 0 || !state.scenes[index]) return false;
  state.ui.sceneRenameIndex = index;
  // Use scheduleRender so the input is built in one pass, then focus.
  scheduleRender(RenderFlags.SCENE_TABS);
  setTimeout(() => {
    const input = sceneTabsEl?.querySelector(`.scene-tab-input[data-scene-index="${index}"]`);
    if (input && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }, 0);
  return true;
}

function renderSceneTabs() {
  if (!sceneTabsEl) return;
  sceneTabsEl.innerHTML = '';
  state.scenes.forEach((sceneEntry, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scene-tab' + (index === state.activeSceneIndex ? ' active' : '');

    const sceneName = sceneEntry?.sceneState?.scene?.name || sceneEntry?.name || `Scene ${index + 1}`;
    const isEditing = state.ui.sceneRenameIndex === index;

    if (isEditing) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'scene-tab-input';
      input.dataset.sceneIndex = String(index);
      input.value = sceneName;
      input.title = sceneName;
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('dblclick', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finishInlineSceneRename(index, input.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finishInlineSceneRename(index, sceneName, { cancel: true });
        }
      });
      input.addEventListener('blur', () => finishInlineSceneRename(index, input.value));
      btn.appendChild(input);
      setTimeout(() => {
        if (document.activeElement !== input) {
          input.focus();
          input.select();
        }
      }, 0);
    } else {
      const name = document.createElement('span');
      name.className = 'scene-tab-name';
      name.textContent = sceneName;
      btn.appendChild(name);
    }

    const isDirty = index === state.activeSceneIndex ? !!state.document.dirty : !!sceneEntry?.documentState?.dirty;
    if (isDirty) {
      const dirty = document.createElement('span');
      dirty.className = 'scene-tab-dirty';
      dirty.textContent = '●';
      btn.appendChild(dirty);
    }

    btn.title = sceneEntry?.documentState?.currentScenePath || sceneName;
    const close = document.createElement('span');
    close.className = 'scene-tab-close';
    close.textContent = '×';
    close.title = 'Close scene';
    close.setAttribute('aria-label', 'Close scene');
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSceneAt(index);
    });
    btn.appendChild(close);

    btn.addEventListener('click', () => {
      activateWorkspaceByKey('game');
      if (state.ui.sceneRenameIndex !== null && state.ui.sceneRenameIndex !== index) {
        finishInlineSceneRename(state.ui.sceneRenameIndex, sceneTabsEl?.querySelector('.scene-tab-input')?.value || '', { cancel: true });
      }
      if (index !== state.activeSceneIndex) setActiveScene(index);
    });
    btn.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Set rename state BEFORE any refreshAll so the input is present in the
      // first render pass and focus isn't lost to a second DOM rebuild.
      state.ui.sceneRenameIndex = index;
      if (index !== state.activeSceneIndex) {
        setActiveScene(index); // calls refreshAll internally
      } else {
        activateWorkspaceByKey('game');
        scheduleRender(RenderFlags.FULL);
      }
      // Input is now in the DOM — focus it.
      const inp = sceneTabsEl?.querySelector(`.scene-tab-input[data-scene-index="${index}"]`);
      if (inp) { inp.focus(); inp.select(); }
    });
    sceneTabsEl.appendChild(btn);
  });
}

function refreshAll() {
  // Schedule a full repaint through the batching system so that multiple
  // synchronous refreshAll() calls within one tick coalesce into a single flush.
  syncAnimationEditorFromSelection({ silent: true });
  scheduleRender(RenderFlags.FULL);
}

function getSerializableSpriteFramesLibraries() {
  return (state.spriteFramesLibraries || []).map((lib) => ({
    id: lib.id,
    name: lib.name,
    defaultSheetId: lib.defaultSheetId || '',
    clips: (lib.clips || []).map((clip) => ({
      name: clip.name,
      frames: Array.isArray(clip.frames) ? clip.frames.slice() : [],
      fps: Math.max(1, Number(clip.fps) || 6),
      loop: clip.loop !== false,
      playbackMode: clip.playbackMode || (clip.loop === false ? 'once' : 'loop'),
      spriteSheetId: clip.spriteSheetId || ''
    }))
  }));
}

function syncSpriteFramesLibrariesToSceneState() {
  state.editorState.spriteFramesLibraries = getSerializableSpriteFramesLibraries();
  state.editorState.selectedSpriteFramesId = state.selectedSpriteFramesId || null;
}

function rebuildSpriteFramesLibrariesFromSceneState() {
  const saved = Array.isArray(state.editorState?.spriteFramesLibraries)
    ? state.editorState.spriteFramesLibraries
    : [];

  state.spriteFramesLibraries = saved.map((lib) =>
    ensureSpriteFramesLibraryShape(JSON.parse(JSON.stringify(lib)))
  );

  state.selectedSpriteFramesId =
    state.editorState?.selectedSpriteFramesId ||
    state.spriteFramesLibraries[0]?.id ||
    null;
}

function ensureTilesetShape(tileset) {
  if (!tileset || typeof tileset !== 'object') return null;
  const resourceApi = window.RokuSchemaResources;
  if (resourceApi?.normalizeTilesetResource) {
    const normalized = resourceApi.normalizeTilesetResource(tileset);
    if (normalized && normalized !== tileset) {
      Object.keys(tileset).forEach((key) => delete tileset[key]);
      Object.assign(tileset, normalized);
    }
  }
  tileset.id = String(tileset.id || `tileset_${Math.random().toString(36).slice(2, 9)}`);
  tileset.name = String(tileset.name || 'TileSet');
  tileset.spriteSheetId = String(tileset.spriteSheetId || '');
  const sheet = getSheetById(tileset.spriteSheetId);
  tileset.tileWidth = Math.max(1, Number(tileset.tileWidth) || Number(sheet?.tileWidth) || 32);
  tileset.tileHeight = Math.max(1, Number(tileset.tileHeight) || Number(sheet?.tileHeight) || 32);
  tileset.padding = Math.max(0, Number(tileset.padding) || Number(sheet?.padding) || 0);
  tileset.selectedTileIndex = Math.max(0, Number(tileset.selectedTileIndex) || 0);
  tileset.tileMetadata = tileset.tileMetadata && typeof tileset.tileMetadata === 'object' ? tileset.tileMetadata : {};
  tileset.terrainSets = Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];
  Object.keys(tileset.tileMetadata).forEach((key) => ensureTilesetTileMetadata(tileset, key));
  return tileset;
}

function getSerializableTilesets() {
  return (state.tilesets || []).map((tileset) => {
    const normalized = ensureTilesetShape(JSON.parse(JSON.stringify(tileset))) || tileset;
    return {
      id: normalized.id,
      name: normalized.name,
      spriteSheetId: normalized.spriteSheetId || '',
      tileWidth: Math.max(1, Number(normalized.tileWidth) || 32),
      tileHeight: Math.max(1, Number(normalized.tileHeight) || 32),
      padding: Math.max(0, Number(normalized.padding) || 0),
      selectedTileIndex: Math.max(0, Number(normalized.selectedTileIndex) || 0),
      terrainSets: JSON.parse(JSON.stringify(normalized.terrainSets || [])),
      tileMetadata: JSON.parse(JSON.stringify(normalized.tileMetadata || {}))
    };
  });
}

function syncTilesetsToSceneState() {
  state.editorState = normalizeEditorState(state.editorState, state.sceneState, state.sceneState);
  state.editorState.tilesets = getSerializableTilesets();
  state.editorState.selectedTilesetId = state.selectedTilesetId || null;
}

function rebuildTilesetsFromSceneState() {
  const migrationApi = window.RokuSceneMigration;
  const sourceEditorState = migrationApi?.migrateEditorResourceState
    ? migrationApi.migrateEditorResourceState(state.editorState || {})
    : (state.editorState || {});
  const saved = Array.isArray(sourceEditorState?.tilesets) ? sourceEditorState.tilesets : [];
  state.tilesets = saved.map((tileset) => ensureTilesetShape(JSON.parse(JSON.stringify(tileset)))).filter(Boolean);
  state.selectedTilesetId = sourceEditorState?.selectedTilesetId || state.tilesets[0]?.id || null;
  if (!state.tilesets.some((tileset) => tileset.id === state.selectedTilesetId)) state.selectedTilesetId = state.tilesets[0]?.id || null;
  syncTilesetsToSceneState();
}

// ── Nine-Slice Style persistence ─────────────────────────────────────────────

function getSerializableNineSliceStyles() {
  const resourcesApi = window.RokuSchemaResources;
  return (state.nineSliceStyles || []).map((s, i) => {
    const normalized = resourcesApi?.normalizeNineSliceStyle ? resourcesApi.normalizeNineSliceStyle(s, i) : Object.assign({}, s);
    // Strip large data URLs from saved state (re-loaded from imagePath)
    const saved = Object.assign({}, normalized);
    return saved;
  });
}

function syncNineSliceStylesToSceneState() {
  state.editorState.nineSliceStyles = getSerializableNineSliceStyles();
  state.editorState.selectedNineSliceStyleId = state.selectedNineSliceStyleId || null;
}

function rebuildNineSliceStylesFromSceneState() {
  const saved = Array.isArray(state.editorState?.nineSliceStyles) ? state.editorState.nineSliceStyles : [];
  const resourcesApi = window.RokuSchemaResources;
  state.nineSliceStyles = saved.map((s, i) =>
    resourcesApi?.normalizeNineSliceStyle ? resourcesApi.normalizeNineSliceStyle(s, i) : Object.assign({}, s)
  ).filter(Boolean);
  state.selectedNineSliceStyleId = state.editorState?.selectedNineSliceStyleId || state.nineSliceStyles[0]?.id || null;
  if (!state.nineSliceStyles.some(s => s.id === state.selectedNineSliceStyleId)) {
    state.selectedNineSliceStyleId = state.nineSliceStyles[0]?.id || null;
  }
  syncNineSliceStylesToSceneState();
}

// ── UIScreen persistence ───────────────────────────────────────────────────────

function getSerializableUIScreens() {
  const resourcesApi = window.RokuSchemaResources;
  return (state.uiScreens || []).map((s, i) => {
    return resourcesApi?.normalizeUIScreen ? resourcesApi.normalizeUIScreen(s, i) : Object.assign({}, s);
  });
}

function syncUIScreensToSceneState() {
  state.editorState.uiScreens = getSerializableUIScreens();
  state.editorState.selectedUIScreenId = state.selectedUIScreenId || null;
}

function rebuildUIScreensFromSceneState() {
  const saved = Array.isArray(state.editorState?.uiScreens) ? state.editorState.uiScreens : [];
  const resourcesApi = window.RokuSchemaResources;
  state.uiScreens = saved.map((s, i) =>
    resourcesApi?.normalizeUIScreen ? resourcesApi.normalizeUIScreen(s, i) : Object.assign({}, s)
  ).filter(Boolean);
  state.selectedUIScreenId = state.editorState?.selectedUIScreenId || state.uiScreens[0]?.id || null;
  if (!state.uiScreens.some(s => s.id === state.selectedUIScreenId)) {
    state.selectedUIScreenId = state.uiScreens[0]?.id || null;
  }
  syncUIScreensToSceneState();
}

// ── UITransitionPreset persistence ────────────────────────────────────────────

function getSerializableUITransitionPresets() {
  const resourcesApi = window.RokuSchemaResources;
  return (state.uiTransitionPresets || []).map((p, i) =>
    resourcesApi?.normalizeUITransitionPreset ? resourcesApi.normalizeUITransitionPreset(p, i) : Object.assign({}, p)
  );
}

function syncUITransitionPresetsToSceneState() {
  state.editorState.uiTransitionPresets = getSerializableUITransitionPresets();
  state.editorState.selectedUITransitionPresetId = state.selectedUITransitionPresetId || null;
}

function rebuildUITransitionPresetsFromSceneState() {
  const saved = Array.isArray(state.editorState?.uiTransitionPresets) ? state.editorState.uiTransitionPresets : [];
  const resourcesApi = window.RokuSchemaResources;
  state.uiTransitionPresets = saved.map((p, i) =>
    resourcesApi?.normalizeUITransitionPreset ? resourcesApi.normalizeUITransitionPreset(p, i) : Object.assign({}, p)
  ).filter(Boolean);
  state.selectedUITransitionPresetId = state.editorState?.selectedUITransitionPresetId || state.uiTransitionPresets[0]?.id || null;
  if (!state.uiTransitionPresets.some(p => p.id === state.selectedUITransitionPresetId)) {
    state.selectedUITransitionPresetId = state.uiTransitionPresets[0]?.id || null;
  }
  syncUITransitionPresetsToSceneState();
}

// ── UIOptionDef persistence ───────────────────────────────────────────────────

function getSerializableUIOptionDefs() {
  const api = window.RokuSchemaResources;
  return (state.uiOptionDefs || []).map((d, i) =>
    api?.normalizeUIOptionDef ? api.normalizeUIOptionDef(d, i) : Object.assign({}, d)
  );
}

function syncUIOptionDefsToSceneState() {
  state.editorState.uiOptionDefs = getSerializableUIOptionDefs();
}

function rebuildUIOptionDefsFromSceneState() {
  const saved = Array.isArray(state.editorState?.uiOptionDefs) ? state.editorState.uiOptionDefs : [];
  const api = window.RokuSchemaResources;
  state.uiOptionDefs = saved.map((d, i) =>
    api?.normalizeUIOptionDef ? api.normalizeUIOptionDef(d, i) : Object.assign({}, d)
  ).filter(Boolean);
  syncUIOptionDefsToSceneState();
}

// ── UIHighScoreTable persistence ──────────────────────────────────────────────

function getSerializableUIHighScoreTables() {
  const api = window.RokuSchemaResources;
  return (state.uiHighScoreTables || []).map((t, i) =>
    api?.normalizeUIHighScoreTable ? api.normalizeUIHighScoreTable(t, i) : Object.assign({}, t)
  );
}

function syncUIHighScoreTablesToSceneState() {
  state.editorState.uiHighScoreTables = getSerializableUIHighScoreTables();
}

function rebuildUIHighScoreTablesFromSceneState() {
  const saved = Array.isArray(state.editorState?.uiHighScoreTables) ? state.editorState.uiHighScoreTables : [];
  const api = window.RokuSchemaResources;
  state.uiHighScoreTables = saved.map((t, i) =>
    api?.normalizeUIHighScoreTable ? api.normalizeUIHighScoreTable(t, i) : Object.assign({}, t)
  ).filter(Boolean);
  syncUIHighScoreTablesToSceneState();
}

function getTilesetById(id) {
  return (state.tilesets || []).find((tileset) => tileset.id === id) || null;
}

function getSelectedTileset() {
  return getTilesetById(state.selectedTilesetId);
}

function getSelectedTileMapNode() {
  const node = getNode(state.selectedId);
  return node?.type === 'TileMap' ? node : null;
}

function getTileMapLayerTilesetId(node, layer = null) {
  const props = ensureTileMapData(node);
  if (!props) return '';
  const resolvedLayer = layer || getActiveTileMapLayer(node);
  const layerTilesetId = String(resolvedLayer?.tilesetId || '');
  return layerTilesetId || String(props.tilesetId || '');
}

function getTileMapAssignedTileset(node, layer = null) {
  const props = ensureTileMapData(node);
  if (!props) return null;
  const tilesetId = getTileMapLayerTilesetId(node, layer);
  return getTilesetById(tilesetId) || getSelectedTileset() || null;
}
// ══════════════════════════════════════════════════════════════════════
// SCENE TREE
// ══════════════════════════════════════════════════════════════════════
// SLUGGISH-FIX: tree version cache — skip full row rebuild when hierarchy unchanged
// _lastTreeSceneVersion removed — replaced by per-flush _treeRenderedThisFlush guard

function _patchTreeRowClasses() {
  // Fast path: just update .active/.primary/.ancestry CSS classes on existing rows
  // without touching innerHTML. Called when selection changes but structure doesn't.
  if (!sceneTreeEl) return;
  const ancestryIds = getSelectedAncestryIds();
  const selectedIds = getSelectionSet();
  sceneTreeEl.querySelectorAll('.tree-row[data-node-id]').forEach((row) => {
    const id = row.dataset.nodeId;
    if (!id) return;
    row.classList.toggle('active',   selectedIds.has(id));
    row.classList.toggle('primary',  id === state.selectedId);
    row.classList.toggle('ancestry', ancestryIds.has(id));
  });
}

// SLUGGISH-FIX: per-flush tree guard — skip full DOM rebuild if already ran this flush.
// The selection fast-path (class patching) is kept: if the tree was already rebuilt
// this flush but only selection changed since, patch classes without rebuilding.
let _treeRenderedThisFlush     = false;
let _treeLastSelectionKey      = '';

function refreshTree() {
  if (!sceneTreeEl) return;

  const selectionKey = state.selectedId + '|' + Array.from(getSelectionSet()).sort().join(',');

  // Already did a full rebuild this flush — only patch selection classes if needed
  if (_treeRenderedThisFlush) {
    if (selectionKey !== _treeLastSelectionKey) {
      _treeLastSelectionKey = selectionKey;
      _patchTreeRowClasses();
    }
    return;
  }
  _treeRenderedThisFlush = true;
  _treeLastSelectionKey  = selectionKey;
  // Reset for next flush pass
  requestAnimationFrame(() => { _treeRenderedThisFlush = false; });

  sceneTreeEl.innerHTML = '';
  const ancestryIds = getSelectedAncestryIds();
  const selectedIds = getSelectionSet();
  const drag = { sourceId: null, overId: null, overMode: null, targetParentId: null, beforeNodeId: null };

  const clearDropTargets = () => sceneTreeEl.querySelectorAll('.tree-row.drag-over, .tree-row.drop-before, .tree-row.drop-after')
    .forEach((r) => r.classList.remove('drag-over', 'drop-before', 'drop-after'));

  // ── Delegated event listeners — bound ONCE per sceneTreeEl lifetime ─────────
  // SLUGGISH-FIX: The original comment said "bound once per refresh" but listeners
  // accumulate on sceneTreeEl across calls because the element itself is never
  // replaced. We now use a sentinel property to bind exactly once.
  if (!sceneTreeEl._rgeListenersBound) {
    sceneTreeEl._rgeListenersBound = true;

  sceneTreeEl.addEventListener('click', (e) => {
    // Visibility toggle
    const visBtn = e.target.closest('.tree-icon-btn[data-action="vis"]');
    if (visBtn) { e.stopPropagation(); const id = visBtn.closest('.tree-row')?.dataset.nodeId; if (id) toggleNodeVisibility(id); return; }
    // Lock toggle
    const lockBtn = e.target.closest('.tree-icon-btn[data-action="lock"]');
    if (lockBtn) { e.stopPropagation(); const id = lockBtn.closest('.tree-row')?.dataset.nodeId; if (id) toggleNodeLocked(id); return; }
    // Expand toggle
    const toggle = e.target.closest('.tree-toggle');
    if (toggle) { e.stopPropagation(); const id = toggle.closest('.tree-row')?.dataset.nodeId; if (id) { state.tree.expanded[id] = !state.tree.expanded[id]; refreshTree(); } return; }
    // Reorder buttons
    const reorderBtn = e.target.closest('.tree-reorder-btn');
    if (reorderBtn) { e.stopPropagation(); const id = reorderBtn.closest('.tree-row')?.dataset.nodeId; const dir = reorderBtn.dataset.dir; if (id && dir) reorderNodeAmongSiblings(id, dir); return; }
    // Main row select
    const rowSelect = e.target.closest('.tree-row');
    if (rowSelect) { const id = rowSelect.dataset.nodeId; if (id) selectNode(id, { toggle: e.ctrlKey || e.metaKey }); return; }
  }, { capture: false });

  // Double-click any tree-main button to start inline rename
  sceneTreeEl.addEventListener('dblclick', (e) => {
    const mainBtn = e.target.closest('.tree-main');
    if (!mainBtn) return;
    e.preventDefault(); e.stopPropagation();
    const id = mainBtn.closest('.tree-row')?.dataset.nodeId;
    if (!id || isRootNodeId(id)) return;
    state.ui.nodeRenameId = id;
    // The preceding click already set _treeRenderedThisFlush=true this frame,
    // so refreshTree() would short-circuit and never render the rename input.
    // Reset the guard to force a full rebuild now.
    _treeRenderedThisFlush = false;
    refreshTree();
    requestAnimationFrame(() => {
      const inp = sceneTreeEl.querySelector('.tree-rename-input');
      if (inp) { inp.focus(); inp.select(); }
    });
  });

  sceneTreeEl.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.tree-row');
    if (!row) return;
    e.preventDefault();
    const id = row.dataset.nodeId;
    if (id) openSceneTreeContextMenu(id, e.clientX, e.clientY);
  });

  // ── Pointer-event drag (replaces slow HTML5 drag API) ───────────────────
  // The HTML5 drag API throttles mousemove to ~8fps during a drag and forces a
  // full DOM snapshot for the ghost image — both cause visible lag. Pointer events
  // fire at full display rate with no ghost overhead, matching the context-menu
  // reparent speed exactly.
  let _ptrDragRow = null;
  let _ptrMoveHandler = null;
  let _ptrUpHandler = null;

  const _endPtrDrag = (commit) => {
    if (_ptrDragRow) { _ptrDragRow.classList.remove('dragging'); _ptrDragRow = null; }
    if (_ptrMoveHandler) { document.removeEventListener('pointermove', _ptrMoveHandler); _ptrMoveHandler = null; }
    if (_ptrUpHandler)   { document.removeEventListener('pointerup',   _ptrUpHandler);   _ptrUpHandler   = null; }
    document.removeEventListener('pointercancel', _endPtrDragCancel);
    if (commit && drag.sourceId && drag.targetParentId !== null) {
      // ── CameraTargetGroup drag-to-assign: drop INTO a CTG → add as target ──
      const dropTargetNode = getNode(drag.overId);
      if (drag.overMode === 'into' && dropTargetNode?.type === 'CameraTargetGroup') {
        // Multi-drag: if multiple nodes are selected, assign all of them.
        // The dragged node is always included; other selected nodes are added too.
        const selected = (getSelectedNodes ? getSelectedNodes() : []).map(n => n?.id).filter(Boolean);
        const toAssign = new Set(selected);
        toAssign.add(drag.sourceId); // always include the actually-dragged node
        const before = serializeScene();
        const group = dropTargetNode;
        const targets = ensureCTGTargets(group);
        const SKIP = new Set(['Camera2D','CameraBounds2D','CameraZone2D','CameraPath2D','CameraTargetGroup','SceneRoot','TileMap']);
        let added = 0;
        for (const nid of toAssign) {
          if (!nid || nid === group.id) continue;
          const tn = getNode(nid);
          if (!tn || SKIP.has(tn.type)) continue;
          if (targets.some(t => t.nodeId === nid)) continue; // duplicate guard
          targets.push({ nodeId: nid });
          added++;
        }
        if (added > 0) {
          _bumpSceneVersion();
          scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
          pushHistory(`CTG: Add ${added} Target${added > 1 ? 's' : ''} (drag)`, before);
        }
        selectNode(dropTargetNode.id);
      } else {
        moveNodeToIndex(drag.sourceId, drag.targetParentId, drag.beforeNodeId);
      }
    } else {
      // Clear visual drop indicators immediately so they don't flicker.
      clearDropTargets();
      // DO NOT call refreshTree() here when commit===false (i.e. this was a click,
      // not a completed drag). The browser fires the 'click' event AFTER pointerup,
      // but if refreshTree() runs first it replaces innerHTML and destroys the DOM
      // node the click was targeting — the bubbling click never reaches the delegated
      // handler on sceneTreeEl, so selectNode() is never called.
      // Defer the rebuild to the next frame; the click handler runs in this frame.
      if (drag.sourceId) {
        // A drag was started but cancelled (e.g. Escape / pointercancel) — rebuild.
        requestAnimationFrame(() => refreshTree());
      }
      // If drag never started (pure click, sourceId still null), no rebuild needed.
    }
    Object.assign(drag, { sourceId: null, overId: null, overMode: null, targetParentId: null, beforeNodeId: null });
  };
  const _endPtrDragCancel = () => _endPtrDrag(false);

  sceneTreeEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const row = e.target.closest('.tree-row');
    if (!row || isRootNodeId(row.dataset.nodeId)) return;
    // Only start a drag from the tree-main area (not icon buttons, toggles, rename input)
    if (!e.target.closest('.tree-main')) return;
    if (e.target.closest('.tree-icon-btn, .tree-toggle, .tree-reorder-btn, .tree-rename-input')) return;

    let moved = false;
    const startX = e.clientX, startY = e.clientY;
    const sourceId = row.dataset.nodeId;

    _ptrMoveHandler = (ev) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!moved && dist < 6) return; // dead zone — treat as click until threshold
      if (!moved) {
        moved = true;
        drag.sourceId = sourceId;
        _ptrDragRow = row;
        row.classList.add('dragging');
        sceneTreeEl.setPointerCapture(e.pointerId);
      }
      // Find row under cursor (pointer capture means events stay on sceneTreeEl)
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const target = els.find(el => el !== row && el.classList?.contains('tree-row') && el.dataset.nodeId && el.dataset.nodeId !== sourceId);
      clearDropTargets();
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const nodeId = target.dataset.nodeId;
      const nodeDef = getNodeDef(getNode(nodeId)?.type);
      if (y < rect.height * 0.25) {
        target.classList.add('drop-before');
        drag.overMode = 'before'; drag.overId = nodeId;
        const parent = getNode(nodeId)?.parentId || getRootNodeId();
        drag.targetParentId = parent; drag.beforeNodeId = nodeId;
      } else if (y > rect.height * 0.75 || !nodeDef?.canHaveChildren) {
        target.classList.add('drop-after');
        drag.overMode = 'after'; drag.overId = nodeId;
        const parent = getNode(nodeId)?.parentId || getRootNodeId();
        const siblings = getChildren(parent);
        const idx = siblings.findIndex((c) => c.id === nodeId);
        drag.targetParentId = parent; drag.beforeNodeId = siblings[idx + 1]?.id || null;
      } else {
        target.classList.add('drag-over');
        drag.overMode = 'into'; drag.overId = nodeId;
        drag.targetParentId = nodeId; drag.beforeNodeId = null;
      }
    };
    _ptrUpHandler = () => _endPtrDrag(moved);
    document.addEventListener('pointermove',   _ptrMoveHandler);
    document.addEventListener('pointerup',     _ptrUpHandler);
    document.addEventListener('pointercancel', _endPtrDragCancel);
  });
  } // end: sceneTreeEl._rgeListenersBound guard

  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'scene-tree-list';
  sceneTreeEl.appendChild(rowsWrap);

  const renderBranch = (node, depth, lineageFlags = []) => {
    const children  = getChildren(node.id);
    const canExpand = children.length > 0;
    if (state.tree.expanded[node.id] == null && canExpand) state.tree.expanded[node.id] = true;

    const row = document.createElement('div');
    row.className = 'tree-row'
      + (isNodeSelected(node.id) ? ' active' : '')
      + (state.selectedId === node.id ? ' primary' : '')
      + (ancestryIds.has(node.id) ? ' ancestry' : '');
    row.dataset.nodeId = node.id;
    // draggable attr removed — drag handled via pointer events (no HTML5 drag API)

    // Guide lines
    const guides = document.createElement('div');
    guides.className = 'tree-guides';
    lineageFlags.forEach((hasLine) => {
      const g = document.createElement('span');
      g.className = 'tree-guide' + (hasLine ? ' has-line' : '');
      guides.appendChild(g);
    });
    row.appendChild(guides);

    // Expand toggle
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tree-toggle' + (canExpand ? '' : ' empty');
    toggle.textContent = canExpand ? (state.tree.expanded[node.id] ? '▾' : '▸') : '•';
    row.appendChild(toggle);

    // Main row button
    const main = document.createElement('button');
    main.type = 'button'; main.className = 'tree-main';

    const left = document.createElement('div');
    left.className = 'tree-main-left';

    // Visibility / lock — data-action picked up by delegated handler
    const visBtn = document.createElement('button');
    visBtn.type = 'button'; visBtn.className = 'tree-icon-btn';
    visBtn.dataset.action = 'vis';
    visBtn.title = node.visible === false ? 'Show' : 'Hide';
    visBtn.textContent = node.visible === false ? '○' : '◉';

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button'; lockBtn.className = 'tree-icon-btn' + (node.locked ? ' locked' : '');
    lockBtn.dataset.action = 'lock';
    lockBtn.title = node.locked ? 'Unlock' : 'Lock';
    if (node.locked) {
      // Closed padlock — red
      lockBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="14" viewBox="0 0 12 14" fill="none">
        <rect x="1.5" y="6" width="9" height="7.5" rx="1.5" fill="#e06c75" opacity="0.15" stroke="#e06c75" stroke-width="1.25"/>
        <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="#e06c75" stroke-width="1.25" stroke-linecap="round"/>
        <circle cx="6" cy="9.5" r="1.25" fill="#e06c75"/>
        <line x1="6" y1="10.5" x2="6" y2="12" stroke="#e06c75" stroke-width="1.25" stroke-linecap="round"/>
      </svg>`;
    } else {
      // Open padlock — dim, clearly open shackle
      lockBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="14" viewBox="0 0 12 14" fill="none">
        <rect x="1.5" y="6" width="9" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.45"/>
        <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0V2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity="0.45"/>
      </svg>`;
    }

    // Bug 6 fix: show an inline input when this node is being renamed
    const isRenamingThis = state.ui.nodeRenameId === node.id;
    let nameEl;
    if (isRenamingThis) {
      nameEl = document.createElement('input');
      nameEl.type = 'text';
      nameEl.className = 'tree-name tree-rename-input';
      nameEl.value = node.name;
      nameEl.dataset.nodeId = node.id;
      nameEl.addEventListener('click',   (ev) => ev.stopPropagation());
      nameEl.addEventListener('dblclick',(ev) => ev.stopPropagation());
      nameEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); _finishNodeRename(node.id, nameEl.value); }
        if (ev.key === 'Escape') { ev.preventDefault(); _finishNodeRename(node.id, null); }
        ev.stopPropagation();
      });
      nameEl.addEventListener('blur', () => _finishNodeRename(node.id, nameEl.value));
    } else {
      nameEl = document.createElement('span');
      nameEl.className = 'tree-name';
      nameEl.textContent = node.name;
    }

    left.appendChild(visBtn); left.appendChild(lockBtn); left.appendChild(nameEl);

    const right = document.createElement('div');
    right.className = 'tree-actions';
    const typeEl = document.createElement('span');
    typeEl.className = 'tree-type' + (node.type === 'SceneInstance' ? ' tree-type-instance' : '');
    const instanceCache = node.type === 'SceneInstance' ? getSceneInstanceCache(node.id) : null;
    if (node.type === 'SceneInstance') {
      const overrideCount = Object.keys(getSceneInstanceOverrides(node)).length;
      const localChildCount = getChildren(node.id).length;
      typeEl.textContent = instanceCache?.status === 'ready' ? `Instance${overrideCount || localChildCount ? ' *' : ''}` : 'Instance !';
      typeEl.title = instanceCache?.status === 'ready'
        ? `${node.properties?.sourceSceneName || instanceCache?.sourceName || 'Scene'} (${node.properties?.sourceScenePath || ''})`
        : (instanceCache?.warning?.message || 'Missing scene instance source');
    } else {
      typeEl.textContent = node.type;
    }

    // Reorder buttons — data-dir picked up by delegated handler
    const mkOrderBtn = (label, dir, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tree-order-btn tree-reorder-btn'; b.textContent = label; b.title = `Move ${dir}`; b.disabled = disabled;
      b.dataset.dir = dir;
      return b;
    };
    const sibIdx = getSiblingIndex(node.id);
    const sibLen = getSiblingNodes(node.id).length;
    right.appendChild(typeEl);
    right.appendChild(mkOrderBtn('↑', 'up', isRootNodeId(node.id) || sibIdx <= 0));
    right.appendChild(mkOrderBtn('↓', 'down', isRootNodeId(node.id) || sibIdx >= sibLen - 1));

    main.appendChild(left); main.appendChild(right);
    // Main select handled by delegated listener on sceneTreeEl — no per-node listener needed.
    row.appendChild(main);

    // Contextmenu and drag/drop handled by delegated listeners registered above.
    // Per-node listeners are intentionally omitted to keep listener count O(1).

    rowsWrap.appendChild(row);

    if (node.type === 'SceneInstance' && state.tree.expanded[node.id] !== false) {
      const cache = getSceneInstanceCache(node.id);
      const resolvedRuntime = getResolvedSceneInstanceRuntime(node);
      if (cache?.status === 'ready' && resolvedRuntime?.scene?.rootNodeId) {
        const renderInstanceBranch = (instanceNode, instanceDepth, instanceLineage = []) => {
          const childNodes = (resolvedRuntime?.nodes || [])
            .filter((entry) => ((entry.parentId || resolvedRuntime.scene.rootNodeId) === instanceNode.id))
            .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
          const childRow = document.createElement('div');
          childRow.className = 'tree-row tree-row-instance';
          const guides = document.createElement('div');
          guides.className = 'tree-guides';
          [...lineageFlags, ...instanceLineage].forEach((hasLine) => {
            const g = document.createElement('span');
            g.className = 'tree-guide' + (hasLine ? ' has-line' : '');
            guides.appendChild(g);
          });
          childRow.appendChild(guides);
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'tree-toggle empty';
          toggle.textContent = childNodes.length ? '▾' : '•';
          childRow.appendChild(toggle);
          const main = document.createElement('div');
          main.className = 'tree-main';
          main.style.opacity = '0.82';
          const left = document.createElement('div');
          left.className = 'tree-main-left';
          const badge = document.createElement('span');
          badge.className = 'tree-icon-btn';
          badge.textContent = '↳';
          const nameEl = document.createElement('span');
          nameEl.className = 'tree-name';
          nameEl.textContent = instanceNode.name || instanceNode.type;
          left.appendChild(badge);
          left.appendChild(nameEl);
          const right = document.createElement('div');
          right.className = 'tree-actions';
          const typeEl = document.createElement('span');
          typeEl.className = 'tree-type';
          typeEl.textContent = instanceNode.type;
          right.appendChild(typeEl);
          main.appendChild(left);
          main.appendChild(right);
          childRow.appendChild(main);
          rowsWrap.appendChild(childRow);
          childNodes.forEach((child, i) => renderInstanceBranch(child, instanceDepth + 1, [...instanceLineage, i < childNodes.length - 1]));
        };
        (resolvedRuntime?.nodes || [])
          .filter((entry) => ((entry.parentId || resolvedRuntime.scene.rootNodeId) === resolvedRuntime.scene.rootNodeId))
          .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
          .forEach((child, i, arr) => renderInstanceBranch(child, depth + 1, [i < arr.length - 1]));
      } else {
        const warnRow = document.createElement('div');
        warnRow.className = 'tree-row tree-row-instance';
        const guides = document.createElement('div');
        guides.className = 'tree-guides';
        lineageFlags.forEach((hasLine) => {
          const g = document.createElement('span');
          g.className = 'tree-guide' + (hasLine ? ' has-line' : '');
          guides.appendChild(g);
        });
        warnRow.appendChild(guides);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'tree-toggle empty';
        toggle.textContent = '•';
        warnRow.appendChild(toggle);
        const main = document.createElement('div');
        main.className = 'tree-main';
        main.style.opacity = '0.72';
        main.textContent = cache?.warning?.message || 'Missing instance source scene';
        warnRow.appendChild(main);
        rowsWrap.appendChild(warnRow);
      }
    }

    if (canExpand && state.tree.expanded[node.id] !== false) {
      children.forEach((child, i) => renderBranch(child, depth + 1, [...lineageFlags, i < children.length - 1]));
    }
  };

  const root = getNode(getRootNodeId());
  if (root) renderBranch(root, 0, []);
}

// ══════════════════════════════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════
function ensureSceneTreeContextMenu() {
  let menu = document.getElementById('scene-tree-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'scene-tree-context-menu'; menu.className = 'scene-context-menu hidden';
    document.body.appendChild(menu);
  }
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (!ensureSceneTreeContextMenu.bound) {
    document.addEventListener('pointerdown', (e) => {
      const m = document.getElementById('scene-tree-context-menu');
      if (!m || m.classList.contains('hidden') || m.contains(e.target)) return;
      closeSceneTreeContextMenu();
    });
    window.addEventListener('blur', closeSceneTreeContextMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSceneTreeContextMenu(); return; }
      const tag = document.activeElement?.tagName;
      const editingText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
      if (editingText) return;

      let dx = 0;
      let dy = 0;
      const step = e.shiftKey ? GRID_SIZE : 1;
      switch (e.key) {
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
      }
      if ((dx !== 0 || dy !== 0) && !e.repeat) {
        e.preventDefault();
        nudgeSelectedNodes(dx, dy);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
        if (getSelectedNodeIds().length) { e.preventDefault(); deleteSelectedNodes(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'd' && !e.repeat) {
        e.preventDefault(); duplicateSelectedNodes();
      }
    });
    ensureSceneTreeContextMenu.bound = true;
  }
  return menu;
}

function closeSceneTreeContextMenu() {
  const menu = document.getElementById('scene-tree-context-menu');
  if (!menu) return;
  menu.classList.add('hidden'); menu.innerHTML = '';
  state.contextMenu.nodeId = null;
}

function addContextMenuItem(menu, label, handler, options = {}) {
  const item = document.createElement('button');
  item.type = 'button'; item.className = 'scene-context-menu-item' + (options.danger ? ' danger' : '');
  item.textContent = label; item.disabled = !!options.disabled;
  const run = (e) => { e.preventDefault(); e.stopPropagation(); if (item.disabled) return; closeSceneTreeContextMenu(); handler(); };
  item.addEventListener('click', run); item.addEventListener('pointerup', run);
  menu.appendChild(item); return item;
}
function addContextMenuSeparator(menu) {
  const sep = document.createElement('div'); sep.className = 'scene-context-menu-sep'; menu.appendChild(sep);
}
function getNodeDepth(nodeId) {
  let depth = 0, current = getNode(nodeId);
  while (current && current.parentId) { depth++; current = getNode(current.parentId); }
  return depth;
}
function expandAllChildren(nodeId) {
  state.tree.expanded[nodeId] = true;
  getChildren(nodeId).forEach((c) => expandAllChildren(c.id));
  refreshTree();
}
function collapseChildren(nodeId) {
  getChildren(nodeId).forEach((c) => { state.tree.expanded[c.id] = false; collapseChildren(c.id); });
  refreshTree();
}

function openSceneTreeContextMenu(nodeId, x, y) {
  const node = getNode(nodeId); if (!node) return;
  const menu = ensureSceneTreeContextMenu();
  menu.innerHTML = ''; menu.classList.remove('hidden');
  state.contextMenu.nodeId = nodeId;

  if (getNodeDef(node.type)?.canHaveChildren) {
    const creatableTypes = getCreatableNodeTypes();
    creatableTypes.forEach((def) => {
      addContextMenuItem(menu, `Add Child ${def.displayName || def.type}`, () => addNode(def.type, node.id));
    });
    addContextMenuItem(menu, 'Instantiate Scene From File…', () => instantiateSceneFromFile(node.id));
  }
  if (!isRootNodeId(node.id)) {
    addContextMenuItem(menu, 'Duplicate', () => duplicateNode(node.id));
    addContextMenuItem(menu, 'Save Subtree As Scene…', () => saveSelectedSubtreeAsScene(node.id));
    addContextMenuItem(menu, node.visible === false ? 'Show' : 'Hide', () => toggleNodeVisibility(node.id));
    addContextMenuItem(menu, node.locked ? 'Unlock' : 'Lock', () => toggleNodeLocked(node.id));
    if (node.type === 'SceneInstance') {
      addContextMenuItem(menu, 'Open Source Scene', () => openSourceSceneFromInstance(node.id));
      addContextMenuItem(menu, 'Reload Instance Source', () => reloadSceneInstance(node.id));
    }
    if (node.type === 'Camera2D') {
      addContextMenuSeparator(menu);
      addContextMenuItem(menu, '📷 Preview Camera', () => {
        // Switch preview to this camera and reveal panel
        if (window.state?.cameraPreview) {
          window.state.cameraPreview.selectedCameraId = node.id;
        }
        refreshCameraPreviewSelector();
        // Reveal camera preview panel
        const panel = document.getElementById('dock-panel-camera-preview');
        if (panel) {
          const allPanels = panel.parentElement?.querySelectorAll('.dock-panel, .bottom-panel');
          allPanels?.forEach(p => p.classList.remove('active'));
          panel.classList.add('active');
          panel.hidden = false;
        }
        setStatus(`Previewing ${node.name || 'Camera'}.`);
      });
      addContextMenuItem(menu, '✓ Set Active Camera', () => {
        // Mark this camera as current, unmark others
        const before = serializeScene();
        getNodes().filter(n => n.type === 'Camera2D').forEach(c => {
          if (!c.properties) c.properties = {};
          c.properties.current = (c.id === node.id);
        });
        pushHistory('Set Active Camera', before);
        scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT);
        setStatus(`${node.name || 'Camera'} set as active camera.`);
      });
      addContextMenuItem(menu, '⊡ Focus Camera', () => {
        // Jump editor viewport to this camera
        const camW = Number(node.properties?.width) || 1920;
        const camH = Number(node.properties?.height) || 1080;
        const tx = Number(node.transform?.x) || 0;
        const ty = Number(node.transform?.y) || 0;
        const stageEl = document.getElementById('stage-container');
        const svw = stageEl ? stageEl.offsetWidth : 800;
        const svh = stageEl ? stageEl.offsetHeight : 600;
        const fitScale = Math.min(svw / (camW * 1.1), svh / (camH * 1.1));
        state.viewport.scale = Math.max(0.1, Math.min(4, fitScale));
        state.viewport.x = svw / 2 - tx * state.viewport.scale;
        state.viewport.y = svh / 2 - ty * state.viewport.scale;
        scheduleRender(RenderFlags.VIEWPORT);
        setStatus(`Focused on ${node.name || 'Camera'}.`);
      });
      addContextMenuItem(menu, '＋ Create Preview Window', () => {
        // Switch to this camera in preview, focus the panel tab
        if (window.state?.cameraPreview) {
          window.state.cameraPreview.selectedCameraId = node.id;
        }
        refreshCameraPreviewSelector();
        const tab = document.querySelector('[data-dock-key="camera-preview"]');
        if (tab) tab.click();
        setStatus(`Preview window opened for ${node.name || 'Camera'}.`);
      });
    }
  }
  addContextMenuSeparator(menu);
  const sibIdx = getSiblingIndex(node.id), sibLen = getSiblingNodes(node.id).length;
  addContextMenuItem(menu, 'Move Up',     () => reorderNodeAmongSiblings(node.id, 'up'),     { disabled: isRootNodeId(node.id) || sibIdx <= 0 });
  addContextMenuItem(menu, 'Move Down',   () => reorderNodeAmongSiblings(node.id, 'down'),   { disabled: isRootNodeId(node.id) || sibIdx >= sibLen - 1 });
  addContextMenuItem(menu, 'Move To Top', () => reorderNodeAmongSiblings(node.id, 'top'),    { disabled: isRootNodeId(node.id) || sibIdx <= 0 });
  addContextMenuItem(menu, 'Move To Bottom', () => reorderNodeAmongSiblings(node.id, 'bottom'), { disabled: isRootNodeId(node.id) || sibIdx >= sibLen - 1 });
  if (!isRootNodeId(node.id)) {
    addContextMenuItem(menu, 'Rename…', () => {
      state.ui.nodeRenameId = nodeId;
      refreshTree();
      requestAnimationFrame(() => {
        const inp = sceneTreeEl?.querySelector('.tree-rename-input');
        if (inp) { inp.focus(); inp.select(); }
      });
    });
  }
  addContextMenuSeparator(menu);

  // Reparent submenu
  const reparentWrap = document.createElement('div'); reparentWrap.className = 'scene-context-submenu-wrap';
  const reparentBtn  = document.createElement('button');
  reparentBtn.type = 'button'; reparentBtn.className = 'scene-context-menu-item submenu-trigger'; reparentBtn.textContent = 'Reparent To ▸';
  reparentWrap.appendChild(reparentBtn);
  const submenu = document.createElement('div'); submenu.className = 'scene-context-submenu';
  const rootNode = getNode(getRootNodeId());
  const candidates = [rootNode, ...getNodes().filter((c) => c.id !== getRootNodeId())].filter((c) => c && canReparentNode(node.id, c.id));
  if (!candidates.length) addContextMenuItem(submenu, 'No valid parents', () => {}, { disabled: true });
  else candidates.forEach((c) => {
    const indent = Math.max(0, getNodeDepth(c.id) - 1);
    addContextMenuItem(submenu, `${'  '.repeat(indent)}${c.name}`, () => reparentNode(node.id, c.id), { disabled: (node.parentId || getRootNodeId()) === c.id });
  });
  reparentWrap.appendChild(submenu); menu.appendChild(reparentWrap);

  addContextMenuSeparator(menu);
  addContextMenuItem(menu, 'Expand All Children', () => expandAllChildren(node.id));
  addContextMenuItem(menu, 'Collapse Children',   () => collapseChildren(node.id));
  if (node.parentId) addContextMenuItem(menu, `Select Parent (${getNode(node.parentId)?.name || node.parentId})`, () => selectNode(node.parentId));
  if (!isRootNodeId(node.id)) { addContextMenuSeparator(menu); addContextMenuItem(menu, 'Delete', () => deleteNode(node.id), { danger: true }); }

  menu.style.left = '0px'; menu.style.top = '0px';
  const mRect = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth  - mRect.width  - 8)) + 'px';
  menu.style.top  = Math.max(8, Math.min(y, window.innerHeight - mRect.height - 8)) + 'px';
}

// ══════════════════════════════════════════════════════════════════════
// INSPECTOR
// ══════════════════════════════════════════════════════════════════════
function getSelectedNodes() {
  return getSelectedNodeIds().map((id) => getNode(id)).filter(Boolean);
}

function getFieldValueState(nodes, fieldKey) {
  const values = nodes.map((node) => getValueByPath(node, fieldKey));
  const serialized = values.map((v) => JSON.stringify(v));
  const mixed = serialized.some((v) => v !== serialized[0]);
  return { mixed, value: values[0] };
}

function getCommonEditableFields(nodes) {
  if (!nodes.length) return [];
  const excludedKeys = new Set([
    'name',
    'properties.imagePath',
    'properties.imageDataUrl',
    'properties.tiles',
    'properties.animation',
    'properties.spriteFramesId',
    'properties.frame'
  ]);
  const allowedTypes = new Set(['boolean', 'number', 'color', 'select', 'string']);
  const counts = new Map();
  const meta = new Map();
  nodes.forEach((node) => {
    const seen = new Set();
    (getNodeDef(node.type)?.fields || []).forEach((field) => {
      if (!field || excludedKeys.has(field.key) || !allowedTypes.has(field.type) || seen.has(field.key)) return;
      seen.add(field.key);
      counts.set(field.key, (counts.get(field.key) || 0) + 1);
      if (!meta.has(field.key)) meta.set(field.key, field);
    });
  });
  const order = [
    'visible',
    'transform.x', 'transform.y', 'transform.rotation', 'transform.scaleX', 'transform.scaleY',
    'properties.width', 'properties.height', 'properties.opacity', 'properties.tint',
    'properties.fitMode', 'properties.playing', 'properties.autoplay', 'properties.speedScale',
    'properties.showGrid', 'properties.mapWidth', 'properties.mapHeight', 'properties.tileWidth', 'properties.tileHeight'
  ];
  const common = Array.from(counts.entries())
    .filter(([_, count]) => count === nodes.length)
    .map(([key]) => meta.get(key));
  common.sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return String(a.label || a.key).localeCompare(String(b.label || b.key));
  });
  return common;
}

function updateMultipleFields(nodeIds, field, rawValue, options = {}) {
  const nodes = (Array.isArray(nodeIds) ? nodeIds : []).map((id) => getNode(id)).filter(Boolean);
  if (!nodes.length) return;
  let value = rawValue;
  if (field.type === 'number') {
    value = Number(value);
    if (Number.isNaN(value)) return;
    if (state.snapEnabled && ['transform.x', 'transform.y', 'properties.width', 'properties.height'].includes(field.key)) {
      value = snapValue(value);
    }
  }
  const baseline = options.baseline || serializeScene(); const _vBaseline = _getSceneVersion();
  nodes.forEach((node) => {
    if (field.type === 'pivot_preset') {
    const coords = value && typeof value === 'object' ? value : getPivotPresetCoords(node, value);
    applyPivotChange(node, coords.pivotX, coords.pivotY);
  } else if (field.key === 'transform.pivotX') {
    applyPivotChange(node, value, Number(node.transform?.pivotY) || 0);
  } else if (field.key === 'transform.pivotY') {
    applyPivotChange(node, Number(node.transform?.pivotX) || 0, value);
  } else {
    setValueByPath(node, field.key, value);
  }
      if (node.type === 'AnimatedSprite2D' && field.key === 'properties.playing') {
      normalizeAnimatedSpriteFlags(node);
    }
    if (node.type === 'AnimatedSprite2D' && field.key === 'properties.autoplay') {
      normalizeAnimatedSpriteFlags(node);
    }
    if (node.type === 'AnimatedSprite2D' && field.key === 'properties.spriteSheetId') {
      node.metadata = node.metadata || {};
      node.metadata.spriteSheetId = value || '';
      if (value) state.selectedSheetId = value;
    }
  });
  const animatedSelected = nodes.some((node) => node.type === 'AnimatedSprite2D');
  if (animatedSelected) {
    syncAnimationEditorFromSelection({ silent: true });
    renderSpriteFramesPanel();
  }
  _bumpSceneVersion();
  let flags = RenderFlags.TREE | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY;
  if (options.refreshInspector !== false) flags |= RenderFlags.INSPECTOR;
  scheduleRender(flags);
  if (_sceneChanged(_vBaseline)) pushHistory(`Change ${field.label} (${nodes.length} nodes)`, baseline);
  setStatus(`Updated ${field.label} on ${nodes.length} nodes.`);
}

function buildMultiEditField(nodeIds, nodes, field) {
  const stateForField = getFieldValueState(nodes, field.key);
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
  const labelText = document.createElement('span');
  labelText.textContent = field.label;
  titleRow.appendChild(labelText);
  if (stateForField.mixed) {
    const badge = document.createElement('span');
    badge.textContent = 'Mixed';
    badge.style.cssText = 'font-size:10px;color:var(--yellow);';
    titleRow.appendChild(badge);
  }
  wrap.appendChild(titleRow);

  let input;
  const baselineOnFocus = () => {
    const fb = state.history.fieldBaseline || (state.history.fieldBaseline = {});
    fb[`multi:${field.key}`] = serializeScene();
  };
  const consumeBaseline = () => {
    const fb = state.history.fieldBaseline || {};
    const key = `multi:${field.key}`;
    const snapshot = fb[key] || serializeScene(); const _vCommitMulti = _getSceneVersion();
    delete fb[key];
    return snapshot;
  };

  switch (field.type) {
    case 'boolean': {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!stateForField.value;
      input.indeterminate = stateForField.mixed;
      input.addEventListener('focus', baselineOnFocus);
      input.addEventListener('change', () => updateMultipleFields(nodeIds, field, input.checked, { baseline: consumeBaseline() }));
      break;
    }
    case 'number': {
      input = document.createElement('input');
      input.type = 'number';
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      if (field.step != null) input.step = field.step;
      if (!stateForField.mixed) input.value = stateForField.value ?? 0;
      else input.placeholder = 'Mixed';
      input.addEventListener('focus', baselineOnFocus);
      input.addEventListener('change', () => {
        if (input.value === '') return refreshInspector();
        updateMultipleFields(nodeIds, field, Number(input.value), { baseline: consumeBaseline() });
      });
      break;
    }
    case 'color': {
      input = document.createElement('input');
      input.type = 'color';
      input.value = /^#([0-9a-f]{6})$/i.test(stateForField.value) ? stateForField.value : '#478cbf';
      input.title = stateForField.mixed ? 'Mixed values; choosing a color will apply it to all selected nodes.' : '';
      input.addEventListener('focus', baselineOnFocus);
      input.addEventListener('input', () => updateMultipleFields(nodeIds, field, input.value, { baseline: consumeBaseline(), refreshInspector: false }));
      break;
    }
    case 'select': {
      input = document.createElement('select');
      const options = Array.isArray(field.options) ? field.options.slice() : [];
      if (stateForField.mixed) {
        const mixedOpt = document.createElement('option');
        mixedOpt.value = '__mixed__';
        mixedOpt.textContent = 'Mixed';
        mixedOpt.selected = true;
        input.appendChild(mixedOpt);
      }
      options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (!stateForField.mixed && stateForField.value === opt) o.selected = true;
        input.appendChild(o);
      });
      input.addEventListener('focus', baselineOnFocus);
      input.addEventListener('change', () => {
        if (input.value === '__mixed__') return;
        updateMultipleFields(nodeIds, field, input.value, { baseline: consumeBaseline() });
      });
      break;
    }
    default: {
      input = document.createElement('input');
      input.type = 'text';
      if (!stateForField.mixed) input.value = stateForField.value ?? '';
      else input.placeholder = 'Mixed';
      input.addEventListener('focus', baselineOnFocus);
      input.addEventListener('change', () => updateMultipleFields(nodeIds, field, input.value, { baseline: consumeBaseline() }));
      break;
    }
  }

  if (input) {
    input.style.width = '100%';
    wrap.appendChild(input);
  }
  return wrap;
}

function refreshMultiInspector(selectedNodes) {
  const nodeIds = selectedNodes.map((node) => node.id);
  const typeNames = Array.from(new Set(selectedNodes.map((node) => node.type))).sort();
  inspectorEl.classList.remove('hidden');
  inspectorEmpty.style.display = 'none';

  const summary = document.createElement('div');
  summary.className = 'notice';
  summary.style.padding = '6px 8px';
  summary.innerHTML = `<strong>${selectedNodes.length} nodes selected</strong><br><span style="font-size:11px;color:var(--text-faint)">${escapeHtml(typeNames.join(', '))}</span>`;
  inspectorEl.appendChild(summary);

  const fields = getCommonEditableFields(selectedNodes);
  if (!fields.length) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.style.display = 'block';
    empty.textContent = 'No shared editable fields across this selection.';
    inspectorEl.appendChild(empty);
    return;
  }

  const groups = new Map();
  fields.forEach((field) => {
    const section = field.section || 'Shared';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(field);
  });

  groups.forEach((groupFields, sectionName) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'inspector-section';
    const toggle = document.createElement('button');
    toggle.className = 'section-toggle';
    toggle.type = 'button';
    toggle.textContent = sectionName + ' (Multi-Edit)';
    toggle.dataset.sectionName = sectionName + ' (Multi-Edit)';
    if (state.ui.inspectorCollapsed.has(sectionName + ' (Multi-Edit)')) wrapper.classList.add('collapsed');
    wrapper.appendChild(toggle);
    const body = document.createElement('div');
    body.className = 'section-body';
    groupFields.filter((field) => field.type !== 'pivot_preset').forEach((field) => body.appendChild(buildMultiEditField(nodeIds, selectedNodes, field)));
    wrapper.appendChild(body);
    inspectorEl.appendChild(wrapper);
  });
}
// SLUGGISH-FIX: Inspector rebuild guard.
// refreshInspector does a full innerHTML destroy+rebuild. If called during an
// active text-input edit we skip the rebuild to prevent focus loss and jank.
// The caller can pass { force: true } to bypass the guard.
let _inspectorRebuildScheduled = false;
function refreshInspector(opts) {
  if (!inspectorEl || !inspectorEmpty) return;
  // Skip rebuild if a text/number input inside the inspector currently has focus
  // and this is not a forced refresh. The value will be read on blur anyway.
  const focused = document.activeElement;
  if (!opts?.force && focused && inspectorEl.contains(focused) &&
      (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') &&
      focused.type !== 'checkbox' && focused.type !== 'radio') {
    // Re-schedule once the input blurs to catch the final value
    if (!_inspectorRebuildScheduled) {
      _inspectorRebuildScheduled = true;
      const handler = () => {
        _inspectorRebuildScheduled = false;
        focused.removeEventListener('blur', handler);
        refreshInspector();
      };
      focused.addEventListener('blur', handler, { once: true });
    }
    return;
  }
  inspectorEl.innerHTML = '';
  const node = getNode(state.selectedId);
  const selectedNodes = getSelectedNodes();

  if (selectedNodes.length > 1) {
    refreshMultiInspector(selectedNodes);
    return;
  }
  if (!node) {
    inspectorEl.classList.add('hidden'); inspectorEmpty.style.display = '';
    inspectorEmpty.textContent = 'Select a node to edit its properties.';
    return;
  }

  inspectorEl.classList.remove('hidden'); inspectorEmpty.style.display = 'none';

  // Show a notice if this node's position/size is managed by a layout container
  const _LAYOUT_CONTAINER_TYPES = new Set(['HBoxContainer', 'VBoxContainer', 'MarginContainer', 'ScrollContainer']);
  const _parentNode = node.parentId ? getNode(node.parentId) : null;
  if (_parentNode && _LAYOUT_CONTAINER_TYPES.has(_parentNode.type)) {
    const notice = document.createElement('div');
    notice.style.cssText = 'padding:6px 8px;background:rgba(100,180,255,0.12);border:1px solid rgba(100,180,255,0.3);border-radius:4px;font-size:11px;color:#a0c8ff;margin-bottom:4px;';
    notice.textContent = `⊞ Position and size are managed by ${_parentNode.type}. Edit the container to change layout.`;
    inspectorEl.appendChild(notice);
  }

  const sections = getNodeFieldsBySection(node.type);
  Object.entries(sections).forEach(([sectionName, fields]) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'inspector-section';
    const toggle = document.createElement('button');
    toggle.className = 'section-toggle'; toggle.type = 'button'; toggle.textContent = sectionName;
    toggle.dataset.sectionName = sectionName;
    if (state.ui.inspectorCollapsed.has(sectionName)) wrapper.classList.add('collapsed');
    wrapper.appendChild(toggle);
    const body = document.createElement('div');
    body.className = 'section-body';
    fields.forEach((field) => body.appendChild(buildField(node, field)));
    if ((sectionName === 'Node' || sectionName === 'Identity') && !isRootNodeId(node.id)) body.appendChild(buildSiblingOrderField(node));
    if (node.type === 'Sprite2D'         && sectionName === 'Sprite') body.appendChild(buildImagePreview(node, false));
    if (node.type === 'AnimatedSprite2D' && sectionName === 'Sprite') body.appendChild(buildImagePreview(node, true));
    if (node.type === 'TextureRect'      && sectionName === 'Sprite') body.appendChild(buildImagePreview(node, false));
    if (node.type === 'NineSlicePanel'   && sectionName === 'NineSlice') body.appendChild(buildImagePreview(node, false));
    if (node.type === 'MenuList'         && sectionName === 'MenuList') body.appendChild(buildMenuListItemsEditor(node));
    if (node.type === 'SceneInstance' && sectionName === 'Instance') {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding-top:4px;';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'mini-btn';
      openBtn.textContent = 'Open Source';
      openBtn.addEventListener('click', () => void openSourceSceneFromInstance(node.id));
      const reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.className = 'mini-btn';
      reloadBtn.textContent = 'Reload Source';
      reloadBtn.addEventListener('click', () => void reloadSceneInstance(node.id));
      const revertAllBtn = document.createElement('button');
      revertAllBtn.type = 'button';
      revertAllBtn.className = 'mini-btn';
      revertAllBtn.textContent = 'Revert All';
      revertAllBtn.addEventListener('click', () => revertAllSceneInstanceOverrides(node.id));
      actions.appendChild(openBtn);
      actions.appendChild(reloadBtn);
      actions.appendChild(revertAllBtn);
      body.appendChild(actions);
      body.appendChild(buildSceneInstanceOverrideEditor(node));
    }
    wrapper.appendChild(body);
    inspectorEl.appendChild(wrapper);
  });

  
  // ── CameraTargetGroup inspector: Targets section ────────────────────────────
  if (node.type === 'CameraTargetGroup') {
    buildCameraTargetGroupInspector(node, inspectorEl);
  }

  // ── CameraZone2D inspector: Zone Settings section ────────────────────────────
  if (node.type === 'CameraZone2D') {
    buildCameraZoneInspector(node, inspectorEl);
  }

  if (node.type === 'CameraPath2D') {
    const sec=document.createElement('section');sec.className='inspector-section';
    const body=document.createElement('div');body.className='section-body';
    const btnRow=document.createElement('div');btnRow.style.cssText='display:flex;gap:6px;margin-bottom:4px;';
    const btn=document.createElement('button');btn.textContent='+ Add Point';btn.className='mini-btn';
    btn.onclick=()=>addCameraPathPoint(node.id);
    const delSelBtn=document.createElement('button');delSelBtn.textContent='Delete Selected';delSelBtn.className='mini-btn';
    delSelBtn.title='Delete all selected points (Delete key)';
    delSelBtn.onclick=()=>deleteSelectedCameraPathPoints(node.id);
    btnRow.appendChild(btn);btnRow.appendChild(delSelBtn);
    body.appendChild(btnRow);
    // ── Preview transport controls ──────────────────────────────────────────
    const previewRow=document.createElement('div');previewRow.style.cssText='display:flex;gap:5px;margin-bottom:8px;align-items:center;flex-wrap:wrap;';
    const mkBtn=(id,label,title,onclick)=>{
      const b=document.createElement('button');b.id=id;b.textContent=label;b.className='mini-btn';b.title=title;b.onclick=onclick;return b;
    };
    const cpe=state.cameraPathEditor;
    const tPlayBtn = mkBtn('cp-transport-play',  '▶ Play',   'Start preview playback from beginning', () => cameraPathPreviewPlay(node.id));
    const tPauseBtn= mkBtn('cp-transport-pause', '⏸ Pause',  'Pause / resume preview playback',       () => cameraPathPreviewPause());
    const tStopBtn = mkBtn('cp-transport-stop',  '■ Stop',   'Stop and reset preview',                () => cameraPathPreviewStop());
    const tLoopBtn = mkBtn('cp-transport-loop',  '↺ Loop',   'Toggle loop for preview (independent of runtime Loop property)', () => cameraPathPreviewToggleLoop());
    tPauseBtn.disabled = !cpe.previewPlaying;
    tStopBtn.disabled  = !cpe.previewPlaying && cpe.previewTime === 0;
    tLoopBtn.classList.toggle('active', !!cpe.previewLoop);
    tLoopBtn.style.cssText='font-weight:bold;';
    if (cpe.previewPlaying && !cpe.previewPaused) tPlayBtn.disabled=true;
    if (cpe.previewPaused) tPauseBtn.textContent='▶ Resume';
    previewRow.appendChild(tPlayBtn);previewRow.appendChild(tPauseBtn);previewRow.appendChild(tStopBtn);previewRow.appendChild(tLoopBtn);
    body.appendChild(previewRow);
    ensureCameraPathPoints(node).forEach((pt,i)=>{
      const d=document.createElement('div');
      d.dataset.cameraPathPoint=String(i);
      // Layout: [pick] [x-label+input] [x-steppers] [y-label+input] [y-steppers] [del]
      d.style.cssText='display:grid;grid-template-columns:auto 1fr auto 1fr auto auto;gap:4px;align-items:center;margin-top:6px;';
      if (state.cameraPathEditor.selectedNodeId === node.id && state.cameraPathEditor.selectedPointIndices.has(i)) d.classList.add('active');
      const pick=document.createElement('button');
      pick.type='button';pick.className='mini-btn';pick.textContent=String(i+1);
      if (state.cameraPathEditor.selectedNodeId === node.id && state.cameraPathEditor.selectedPointIndices.has(i)) pick.style.background='#fff3c4';
      pick.onclick=(e)=>selectCameraPathPoint(node.id,i,{ctrl:e.ctrlKey||e.metaKey,shift:e.shiftKey});

      const makeInput=(axis)=>{
        const wrap=document.createElement('div');
        wrap.style.cssText='display:flex;align-items:center;gap:2px;min-width:0;';
        const lbl=document.createElement('span');
        lbl.textContent=axis.toUpperCase()+':';
        lbl.style.cssText='font-size:10px;color:#aaa;flex-shrink:0;';
        const input=document.createElement('input');
        input.type='number';input.step='1';input.value=String(Math.round((Number(pt[axis])||0)*100)/100);
        input.dataset.axis=axis;
        input.style.cssText='min-width:0;width:100%;';
        input.addEventListener('focus',()=>rememberFieldStart(node.id,`properties.points.${i}.${axis}`));
        input.addEventListener('input',()=>{
          const current=ensureCameraPathPoints(node)[i]||{x:0,y:0};
          setCameraPathPoint(node.id,i,axis==='x'?Number(input.value):current.x,axis==='y'?Number(input.value):current.y,{schedule:false});
          scheduleRender(RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
        });
        input.addEventListener('change',()=>commitDeferredHistory(node.id,`properties.points.${i}.${axis}`,'Edit Camera Path Point'));
        wrap.appendChild(lbl);
        wrap.appendChild(input);
        return {wrap, input};
      };

      // Stepper buttons (▲ / ▼) with hold-to-repeat
      const makeSteppers=(axis, getInput)=>{
        const col=document.createElement('div');
        col.style.cssText='display:flex;flex-direction:column;gap:1px;';
        const makeArrow=(dir)=>{
          const btn=document.createElement('button');
          btn.type='button';
          btn.textContent=dir>0?'▲':'▼';
          btn.title=(dir>0?'Increase ':'Decrease ')+axis.toUpperCase()+' (hold to repeat)';
          btn.style.cssText='font-size:8px;line-height:1;padding:1px 3px;border:1px solid #444;background:#2a2a3a;color:#ccc;cursor:pointer;border-radius:2px;min-width:16px;';
          let _rafId=null;
          let _timeoutId=null;
          const step=()=>{
            const before=serializeScene();
            const current=ensureCameraPathPoints(node)[i]||{x:0,y:0};
            const newVal=(Number(current[axis])||0)+dir;
            setCameraPathPoint(node.id,i,
              axis==='x'?newVal:current.x,
              axis==='y'?newVal:current.y,
              {schedule:false}
            );
            patchCameraPathPointInputs(node.id,i);
            scheduleRender(RenderFlags.VIEWPORT|RenderFlags.SCENE_SUMMARY);
          };
          const repeat=()=>{ step(); _rafId=requestAnimationFrame(repeat); };
          const stop=()=>{
            if(_rafId!==null){cancelAnimationFrame(_rafId);_rafId=null;}
            if(_timeoutId!==null){clearTimeout(_timeoutId);_timeoutId=null;}
            // commit history on release
            commitDeferredHistory(node.id,`properties.points.${i}.${axis}`,'Edit Camera Path Point');
          };
          btn.addEventListener('mousedown',(e)=>{
            e.preventDefault();
            rememberFieldStart(node.id,`properties.points.${i}.${axis}`);
            step();
            _timeoutId=setTimeout(()=>{ _rafId=requestAnimationFrame(repeat); },400);
          });
          btn.addEventListener('mouseup',stop);
          btn.addEventListener('mouseleave',stop);
          btn.addEventListener('touchstart',(e)=>{
            e.preventDefault();
            rememberFieldStart(node.id,`properties.points.${i}.${axis}`);
            step();
            _timeoutId=setTimeout(()=>{ _rafId=requestAnimationFrame(repeat); },400);
          },{passive:false});
          btn.addEventListener('touchend',stop);
          return btn;
        };
        col.appendChild(makeArrow(1));
        col.appendChild(makeArrow(-1));
        return col;
      };

      const {wrap:xWrap}=makeInput('x');
      const {wrap:yWrap}=makeInput('y');
      const xSteppers=makeSteppers('x');
      const ySteppers=makeSteppers('y');

      const del=document.createElement('button');
      del.type='button';del.className='mini-btn camera-path-delete-btn';del.innerHTML='🗑';del.title='Delete Point';del.disabled=ensureCameraPathPoints(node).length<=1;
      del.onclick=()=>deleteCameraPathPoint(node.id,i);

      d.appendChild(pick);
      d.appendChild(xWrap);
      d.appendChild(xSteppers);
      d.appendChild(yWrap);
      d.appendChild(ySteppers);
      d.appendChild(del);
      body.appendChild(d);
    });
    sec.appendChild(body);inspectorEl.appendChild(sec);
  }

if (!isRootNodeId(node.id)) {
    inspectorEl.appendChild(buildNodeComponentsSection(node));
  }
}



const cpStyle=document.createElement('style');cpStyle.textContent='.camera-path-delete-btn:hover:not(:disabled){color:#ff4040;}';document.head.appendChild(cpStyle);
function renderInspector() {
  return refreshInspector();
}

function buildNodeComponentsSection(node) {
  const wrapper = document.createElement('section');
  wrapper.className = 'inspector-section inspector-section--components';
  const toggle = document.createElement('button');
  toggle.className = 'section-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Components';
  toggle.dataset.sectionName = 'Components';
  if (state.ui.inspectorCollapsed.has('Components')) wrapper.classList.add('collapsed');
  wrapper.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'section-body';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '8px';

  const addRow = document.createElement('div');
  addRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const picker = document.createElement('select');
  picker.style.flex = '1';
  getCreatableComponentTypes().forEach((def, index) => {
    const option = document.createElement('option');
    option.value = def.type;
    option.textContent = def.displayName;
    if (index === 0) option.selected = true;
    picker.appendChild(option);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini-btn';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => addComponentToNode(node.id, picker.value));
  addRow.appendChild(picker);
  addRow.appendChild(addBtn);
  body.appendChild(addRow);

  const components = Array.isArray(node.components) ? node.components : [];
  if (!components.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = 'No components attached to this node yet.';
    body.appendChild(empty);
  } else {
    components.forEach((component) => body.appendChild(buildComponentCard(node, component)));
  }

  wrapper.appendChild(body);
  return wrapper;
}

function buildComponentCard(node, component) {
  const card = document.createElement('div');
  card.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--panel-2);';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';
  const title = document.createElement('strong');
  const def = getComponentDef(component.type) || { displayName: component.type, description: '' };
  title.textContent = component.name || def.displayName || component.type;
  title.style.fontSize = '12px';
  const sub = document.createElement('span');
  sub.style.cssText = 'font-size:10px;color:var(--text-dim);';
  sub.textContent = def.description || component.type;
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = component.enabled !== false;
  enabled.title = 'Enabled';
  enabled.addEventListener('change', () => updateComponentField(node.id, component.id, 'enabled', enabled.checked));
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'mini-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => removeComponentFromNode(node.id, component.id));
  actions.appendChild(enabled);
  actions.appendChild(removeBtn);
  header.appendChild(titleWrap);
  header.appendChild(actions);
  card.appendChild(header);

  const fieldKeys = Object.keys(component).filter((key) => !['id', 'type'].includes(key));
  fieldKeys.forEach((key) => {
    const value = component[key];
    if (key === 'name') {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
      wrap.appendChild(document.createTextNode('Name'));
      const input = document.createElement('input');
      input.type = 'text';
      input.value = String(value || '');
      input.addEventListener('change', () => updateComponentField(node.id, component.id, 'name', input.value));
      wrap.appendChild(input);
      card.appendChild(wrap);
      return;
    }
    if (key === 'enabled') return;
    // ── ObjectPoolComponent: UI-driven pool editor ───────────────────
    if (key === 'pools' && component.type === 'ObjectPoolComponent') {
      const nodeTypes = ['Node2D','Sprite2D','AnimatedSprite2D','TileMap'];

      // Parse current value
      let pools = [];
      try { const p = JSON.parse(value || '[]'); if (Array.isArray(p)) pools = p; } catch(_) {}

      const commit = () => {
        updateComponentField(node.id, component.id, key, JSON.stringify(pools), { silent: true, deferHistory: true });
      };

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      const title = document.createElement('span');
      title.textContent = 'Pool Definitions';
      title.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-dim);letter-spacing:.04em;text-transform:uppercase;';
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add Pool';
      addBtn.style.cssText = 'font-size:9px;padding:2px 7px;background:var(--panel-3);border:1px solid var(--border);color:var(--accent);border-radius:3px;cursor:pointer;';
      addBtn.addEventListener('mouseenter', () => addBtn.style.borderColor = 'var(--accent)');
      addBtn.addEventListener('mouseleave', () => addBtn.style.borderColor = 'var(--border)');
      header.append(title, addBtn);
      wrap.appendChild(header);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
      wrap.appendChild(list);

      const renderPools = () => {
        list.innerHTML = '';
        if (!pools.length) {
          const empty = document.createElement('div');
          empty.textContent = 'No pools defined. Click "+ Add Pool" to create one.';
          empty.style.cssText = 'font-size:10px;color:var(--text-faint);padding:6px 4px;text-align:center;';
          list.appendChild(empty);
          return;
        }
        pools.forEach((pool, idx) => {
          const card = document.createElement('div');
          card.style.cssText = 'background:var(--panel-3);border:1px solid var(--border);border-radius:4px;padding:6px 8px;display:flex;flex-direction:column;gap:5px;';

          // Card header: pool name + remove
          const cardHdr = document.createElement('div');
          cardHdr.style.cssText = 'display:flex;align-items:center;gap:6px;';

          const nameIn = document.createElement('input');
          nameIn.type = 'text';
          nameIn.placeholder = 'Pool name (e.g. Bullet)';
          nameIn.value = pool.name || '';
          nameIn.style.cssText = 'flex:1;font-size:11px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 5px;';
          nameIn.addEventListener('change', () => { pools[idx].name = nameIn.value.trim(); commit(); });

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '✕';
          removeBtn.title = 'Remove this pool';
          removeBtn.style.cssText = 'background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:11px;padding:0 2px;flex-shrink:0;';
          removeBtn.addEventListener('click', () => { pools.splice(idx, 1); commit(); scheduleRender(RenderFlags.INSPECTOR); });
          cardHdr.append(nameIn, removeBtn);
          card.appendChild(cardHdr);

          // Row helper
          const makeRow = (labelText, el) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;';
            const lbl = document.createElement('label');
            lbl.textContent = labelText;
            lbl.style.cssText = 'font-size:10px;color:var(--text-faint);flex:0 0 70px;text-align:right;';
            row.append(lbl, el);
            return row;
          };

          // Node Type dropdown
          const typeSel = document.createElement('select');
          typeSel.style.cssText = 'flex:1;font-size:11px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 4px;';
          nodeTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            if ((pool.nodeType || 'Sprite2D') === t) opt.selected = true;
            typeSel.appendChild(opt);
          });
          typeSel.addEventListener('change', () => { pools[idx].nodeType = typeSel.value; commit(); });
          card.appendChild(makeRow('Node Type', typeSel));

          // Size
          const sizeIn = document.createElement('input');
          sizeIn.type = 'number'; sizeIn.min = '1'; sizeIn.max = '500'; sizeIn.step = '1';
          sizeIn.value = String(pool.size || 10);
          sizeIn.style.cssText = 'flex:1;font-size:11px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 5px;';
          sizeIn.addEventListener('change', () => { pools[idx].size = Math.max(1, parseInt(sizeIn.value) || 10); commit(); });
          card.appendChild(makeRow('Size', sizeIn));

          // Z-Index
          const zIn = document.createElement('input');
          zIn.type = 'number'; zIn.step = '1';
          zIn.value = String(pool.zIndex || 0);
          zIn.style.cssText = 'flex:1;font-size:11px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 5px;';
          zIn.addEventListener('change', () => { pools[idx].zIndex = parseInt(zIn.value) || 0; commit(); });
          card.appendChild(makeRow('Z-Index', zIn));

          // Parent Node name
          const parentIn = document.createElement('input');
          parentIn.type = 'text'; parentIn.placeholder = 'optional parent node name';
          parentIn.value = pool.parentName || '';
          parentIn.style.cssText = 'flex:1;font-size:11px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 5px;';
          parentIn.addEventListener('change', () => {
            const v = parentIn.value.trim();
            if (v) pools[idx].parentName = v; else delete pools[idx].parentName;
            commit();
          });
          card.appendChild(makeRow('Parent', parentIn));

          list.appendChild(card);
        });
      };

      addBtn.addEventListener('click', () => {
        pools.push({ name: 'Pool' + (pools.length + 1), nodeType: 'Sprite2D', size: 10, zIndex: 0 });
        commit();
        renderPools();
        scheduleRender(RenderFlags.INSPECTOR);
      });

      renderPools();
      card.appendChild(wrap);
      return;
    }
    if (key === 'aiType' && component.type === 'EnemyAIComponent') {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
      wrap.appendChild(document.createTextNode('AI Type'));
      const sel = document.createElement('select'); sel.style.cssText = 'width:100%;font-size:12px;';
      const aiTypes = [
        { value: 'patrol',      label: 'Patrol — walks back and forth' },
        { value: 'wander',      label: 'Wander — random direction with pauses' },
        { value: 'chase',       label: 'Chase — follows target node' },
        { value: 'flee',        label: 'Flee — runs away from target' },
        { value: 'guard',       label: 'Guard — idles, chases if player enters range' },
        { value: 'bounce',      label: 'Bounce — constant velocity, bounces off bounds' },
        { value: 'circle',      label: 'Circle — orbits spawn point' },
        { value: 'stationary',  label: 'Stationary — no movement' },
        { value: 'sine_wave',   label: 'Sine Wave — shmup wavy movement' },
        { value: 'homing',      label: 'Homing — slow-turning missile' },
        { value: 'strafe',      label: 'Strafe — circles perpendicular to target' },
        { value: 'flank',       label: 'Flank — moves to player\'s side' },
      ];
      aiTypes.forEach(at => {
        const opt = document.createElement('option'); opt.value = at.value; opt.textContent = at.label;
        if ((value || 'patrol') === at.value) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => {
        updateComponentField(node.id, component.id, key, sel.value);
        scheduleRender(RenderFlags.INSPECTOR);
      });
      wrap.appendChild(sel); card.appendChild(wrap); return;
    }
    // ── EnemyAIComponent: hide fields irrelevant to current aiType ────
    if (component.type === 'EnemyAIComponent') {
      const at = component.aiType || 'patrol';
      const fieldGroups = {
        patrolWidth:    ['patrol'],
        wanderMoveTime: ['wander'],
        wanderWaitTime: ['wander'],
        alertRadius:    ['guard'],
        leashRadius:    ['guard'],
        returnSpeed:    ['guard'],
        stopDistance:   ['chase', 'guard'],
        turnSpeed:      ['homing'],
        boundsWidth:    ['bounce'],
        boundsHeight:   ['bounce'],
        orbitRadius:    ['circle'],
        sineAmplitude:  ['sine_wave'],
        sineFrequency:  ['sine_wave'],
        moveAxisX:      ['sine_wave'],
        moveAxisY:      ['sine_wave'],
        flankDistance:  ['flank'],
        targetName:     ['chase', 'flee', 'guard', 'homing', 'strafe', 'flank'],
        speed:          ['patrol', 'wander', 'chase', 'flee', 'guard', 'bounce', 'circle', 'sine_wave', 'homing', 'strafe', 'flank'],
      };
      if (fieldGroups[key] && !fieldGroups[key].includes(at)) return;
    }
    // ── AudioSourceComponent: hide all fields now owned by the Audio tab ──
    if (component.type === 'AudioSourceComponent' &&
        ['busId','volume','pitch','loop','autoplay','playOnAwake','oneShot'].includes(key)) {
      return; // edited exclusively in the Audio tab clip list
    }
    // ── resourcePath → clip dropdown (Audio tab is the single source of truth) ─
    if (key === 'resourcePath') {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
      wrap.appendChild(document.createTextNode('Clip'));
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;font-size:12px;';
      const ap = window._audioPanelInstance;
      const allClips = (ap && ap.engine && Array.isArray(ap.engine.clips)) ? ap.engine.clips : [];
      if (!allClips.length) {
        const opt = document.createElement('option');
        opt.value = value || '';
        opt.textContent = value ? (value.split('/').pop() || value) : '— Import clips in the Audio tab first —';
        sel.appendChild(opt);
      } else {
        const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— Select clip —';
        if (!value) blank.selected = true;
        sel.appendChild(blank);
        allClips.forEach(c => {
          const opt = document.createElement('option'); opt.value = c.path;
          opt.textContent = c.path.split('/').pop().replace(/^res:\/\//, '') || c.path;
          if (value === c.path) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      sel.addEventListener('change', () => updateComponentField(node.id, component.id, key, sel.value));
      wrap.appendChild(sel);
      card.appendChild(wrap);
      return;
    }
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
    wrap.appendChild(document.createTextNode(formatComponentFieldLabel(key)));
    let input;
    if (typeof value === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
      input.addEventListener('change', () => updateComponentField(node.id, component.id, key, input.checked));
    } else if (key === 'axis') {
      input = document.createElement('select');
      ['x', 'y'].forEach((axis) => {
        const option = document.createElement('option');
        option.value = axis;
        option.textContent = axis.toUpperCase();
        if (String(value || 'y') === axis) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', () => updateComponentField(node.id, component.id, key, input.value));
    } else if (key === 'bodyType') {
      input = document.createElement('select');
      ['dynamic', 'static', 'kinematic'].forEach((bodyType) => {
        const option = document.createElement('option');
        option.value = bodyType;
        option.textContent = bodyType[0].toUpperCase() + bodyType.slice(1);
        if (String(value || 'dynamic') === bodyType) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', () => updateComponentField(node.id, component.id, key, input.value));
    } else {
      input = document.createElement('input');
      input.type = typeof value === 'number' ? 'number' : 'text';
      if (typeof value === 'number') input.step = '0.1';
      input.value = String(value ?? '');
      input.addEventListener('change', () => updateComponentField(node.id, component.id, key, input.type === 'number' ? Number(input.value) : input.value));
    }
    wrap.appendChild(input);
    card.appendChild(wrap);
  });


  // ── Physics Shapes editor (Collider2DComponent only) ──────────────
  if (component.type === 'Collider2DComponent') {
    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    card.appendChild(divider);

    // Header row
    const psHeader = document.createElement('div');
    psHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
    const psTitle = document.createElement('span');
    psTitle.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;';
    psTitle.textContent = 'Physics Shapes';
    const psHint  = document.createElement('span');
    psHint.style.cssText = 'font-size:10px;color:var(--text-faint);';
    psHint.textContent = '(overrides AABB when set)';
    psHeader.append(psTitle, psHint);
    card.appendChild(psHeader);

    // Tool buttons
    const psToolbar = document.createElement('div');
    psToolbar.className = 'tcs-toolbar';
    psToolbar.style.cssText = 'padding:4px 0;border:none;background:none;';
    const toolBtns = [];
    [['rect','▭ Rect'],['polygon','⬠ Poly'],['select','↖ Select']].forEach(([t,label]) => {
      const b = document.createElement('button'); b.type='button'; b.className='tool-btn tcs-tool-btn'+(t==='rect'?' active':'');
      b.dataset.tool=t; b.textContent=label; toolBtns.push(b);
      psToolbar.appendChild(b);
    });
    const sep = document.createElement('div'); sep.className='tcs-toolbar-sep'; psToolbar.appendChild(sep);
    const fullBtn = document.createElement('button'); fullBtn.type='button'; fullBtn.className='tool-btn'; fullBtn.textContent='Full Bounds'; psToolbar.appendChild(fullBtn);
    const clearBtn= document.createElement('button'); clearBtn.type='button'; clearBtn.className='tool-btn danger'; clearBtn.textContent='Clear All'; psToolbar.appendChild(clearBtn);
    card.appendChild(psToolbar);

    // Canvas
    const psCanvasWrap = document.createElement('div'); psCanvasWrap.className='tcs-canvas-wrap'; psCanvasWrap.style.minHeight='140px';
    const psCanvas = document.createElement('canvas'); psCanvas.className='tcs-canvas'; psCanvas.style.cursor='crosshair';
    psCanvasWrap.appendChild(psCanvas);
    card.appendChild(psCanvasWrap);

    // Shape list
    const psListHeader = document.createElement('div'); psListHeader.className='tcs-shape-list-header';
    const psCount  = document.createElement('span'); psCount.textContent='0 shapes';
    psListHeader.append(psCount);
    const psList = document.createElement('div'); psList.className='tcs-shape-list';
    card.append(psListHeader, psList);

    // Hint
    const psNote = document.createElement('div');
    psNote.style.cssText = 'font-size:10px;color:var(--text-faint);padding:4px 0 2px;';
    psNote.textContent = 'Drag to draw shapes. Right-click poly edges/vertices to insert/delete points.';
    card.appendChild(psNote);

    // Build the editor via factory
    const psEditor = createShapeEditor({
      getNodeSize: () => {
        const w = Math.max(4, Number(component.width) || Number(node.properties?.width) || 64);
        const h = Math.max(4, Number(component.height) || Number(node.properties?.height) || 64);
        return { w, h };
      },
      getImage: () => {
        // Show sprite image if available
        const img = state.imageCache.get(node.id);
        if (img?.complete) return { img, sx:0, sy:0, sw:img.naturalWidth, sh:img.naturalHeight };
        return null;
      },
      extraBg: (ctx, cw, ch) => {
        // Draw the AABB ghost (component.offsetX/Y/width/height relative to node top-left)
        const nw = Math.max(4, Number(node.properties?.width)  || 64);
        const nh = Math.max(4, Number(node.properties?.height) || 64);
        const cw2 = Math.max(4, Number(component.width)  || nw);
        const ch2 = Math.max(4, Number(component.height) || nh);
        const ox  = Number(component.offsetX) || 0;
        const oy  = Number(component.offsetY) || 0;
        const bx  = (ox / nw) * cw, by = (oy / nh) * ch;
        const bw  = (cw2 / nw) * cw, bh = (ch2 / nh) * ch;
        ctx.strokeStyle = 'rgba(100,200,100,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([5,3]);
        ctx.strokeRect(bx+0.5, by+0.5, bw-1, bh-1); ctx.setLineDash([]);
      },
      getShapes: () => Array.isArray(component.physicsShapes) ? component.physicsShapes : [],
      setShapes: (shapes) => {
        component.physicsShapes = shapes;
      },
      onCommit: (label) => {
        const before = serializeScene(); const _vCollider = _getSceneVersion();
        syncEditorStateFromRuntime();
        if (_sceneChanged(_vCollider)) pushHistory(label, before);
        scheduleRender(RenderFlags.VIEWPORT);
      },
      listEl:    psList,
      countEl:   psCount,
      accentColor:       '#e05f5f',
      accentStrokeColor: '#ff7070',
      secondColor:       '#5fa0e0',
      secondStrokeColor: '#80bfff',
    });

    psEditor.mount(psCanvas);
    psEditor.refresh();

    // Wire tool buttons
    toolBtns.forEach((b) => b.addEventListener('click', () => psEditor.setTool(b.dataset.tool, toolBtns)));
    fullBtn.addEventListener('click', () => {
      const shapes = typeof psEditor.getShapes === 'function' ? psEditor.getShapes() : [];
      // Push directly via setShapes+commit path
      component.physicsShapes = [...(component.physicsShapes||[]), {id:`ps_${Date.now().toString(36)}`,type:'rect',x:0,y:0,w:1,h:1}];
      psEditor.refresh();
      syncEditorStateFromRuntime();
      const before2 = serializeScene(); const _vCollider2 = _getSceneVersion();
      if (_sceneChanged(_vCollider2)) pushHistory('Add full-bounds physics shape', before2);
      scheduleRender(RenderFlags.VIEWPORT);
    });
    clearBtn.addEventListener('click', () => {
      if (!(component.physicsShapes?.length)) return;
      component.physicsShapes = [];
      psEditor.refresh();
      syncEditorStateFromRuntime();
      const before3 = serializeScene(); const _vCollider3 = _getSceneVersion();
      if (_sceneChanged(_vCollider3)) pushHistory('Clear physics shapes', before3);
      scheduleRender(RenderFlags.VIEWPORT);
    });
  }

  return card;
}

function formatComponentFieldLabel(key) {
  return String(key || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function addComponentToNode(nodeId, componentType) {
  const node = getNode(nodeId);
  if (!node) return false;
  const component = createDefaultComponent(componentType || 'MoveComponent');
  const before = serializeScene(); const _vAddComp = _getSceneVersion();
  if (!Array.isArray(node.components)) node.components = [];
  node.components.push(component);
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  if (_sceneChanged(_vAddComp)) pushHistory(`Add ${component.name} component`, before);
  setStatus(`Added ${component.name} to ${node.name}.`);
  return true;
}

function updateComponentField(nodeId, componentId, fieldKey, value, options = {}) {
  const node = getNode(nodeId);
  if (!node || !Array.isArray(node.components)) return false;
  const component = node.components.find((entry) => entry && entry.id === componentId);
  if (!component) return false;
  const before = options.deferHistory ? null : serializeScene(); const _vCompField = options.deferHistory ? -1 : _getSceneVersion();
  component[fieldKey] = value;
  _bumpSceneVersion();
  // When deferring history (live slider drag), skip inspector rebuild to avoid
  // rebuilding the inspector DOM on every pointer-move event.
  const renderFlags = options.deferHistory
    ? (RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY)
    : (RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  scheduleRender(renderFlags);
  if (!options.deferHistory && before !== null && _sceneChanged(_vCompField)) {
    pushHistory(`Update ${component.name} component`, before);
  }
  if (!options.silent) setStatus(`Updated ${component.name} on ${node.name}.`);
  return true;
}

function removeComponentFromNode(nodeId, componentId) {
  const node = getNode(nodeId);
  if (!node || !Array.isArray(node.components)) return false;
  const before = serializeScene(); const _vRemComp = _getSceneVersion();
  const next = node.components.filter((entry) => entry && entry.id !== componentId);
  if (next.length === node.components.length) return false;
  node.components = next;
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  if (_sceneChanged(_vRemComp)) pushHistory('Remove component', before);
  setStatus(`Removed component from ${node.name}.`);
  return true;
}

function buildSceneInstanceOverrideEditor(instanceNode) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding-top:8px;border-top:1px solid var(--border);';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;';
  title.textContent = 'Source Overrides';
  wrap.appendChild(title);

  const cache = getSceneInstanceCache(instanceNode.id);
  if (cache?.status !== 'ready' || !cache.runtime) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = cache?.warning?.message || 'Reload the source scene to edit overrides.';
    wrap.appendChild(notice);
    return wrap;
  }

  const resolvedRuntime = getResolvedSceneInstanceRuntime(instanceNode) || cache.runtime;
  const rootNodeId = resolvedRuntime.scene?.rootNodeId;
  const sourceNodes = (resolvedRuntime.nodes || []).filter((entry) => entry.id !== rootNodeId);
  if (!sourceNodes.length) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = 'This source scene has no editable child nodes.';
    wrap.appendChild(notice);
    return wrap;
  }

  const pickerLabel = document.createElement('label');
  pickerLabel.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
  pickerLabel.appendChild(document.createTextNode('Source Node'));
  const picker = document.createElement('select');
  const selectedNodeId = getSelectedInstanceSourceNodeId(instanceNode) || sourceNodes[0].id;
  sourceNodes.forEach((sourceNode) => {
    const option = document.createElement('option');
    option.value = sourceNode.id;
    option.textContent = `${sourceNode.name} (${sourceNode.type})`;
    if (option.value === selectedNodeId) option.selected = true;
    picker.appendChild(option);
  });
  picker.addEventListener('change', () => {
    setSelectedInstanceSourceNodeId(instanceNode, picker.value);
    refreshInspector();
  });
  pickerLabel.appendChild(picker);
  wrap.appendChild(pickerLabel);

  const selectedSourceNode = sourceNodes.find((entry) => entry.id === picker.value) || sourceNodes[0];
  setSelectedInstanceSourceNodeId(instanceNode, selectedSourceNode.id);
  const baseRuntimeNode = (cache.runtime?.nodes || []).find((entry) => entry.id === selectedSourceNode.id) || selectedSourceNode;
  const fields = (getNodeDef(selectedSourceNode.type)?.fields || []).filter((field) => !['readonly','image_picker','json','pivot_preset'].includes(field.type));
  fields.forEach((field) => {
    const fieldWrap = document.createElement('label');
    fieldWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
    fieldWrap.appendChild(document.createTextNode(field.label));
    const currentValue = getValueByPath(selectedSourceNode, field.key);
    const baseValue = getValueByPath(baseRuntimeNode, field.key);
    let input;
    if (field.type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!currentValue;
      input.addEventListener('change', () => updateSceneInstanceSourceOverride(instanceNode.id, selectedSourceNode.id, field.key, input.checked));
    } else if (field.type === 'select') {
      input = document.createElement('select');
      let options = field.options || [];
      if (selectedSourceNode.type === 'AnimatedSprite2D' && field.key === 'properties.animation') {
        const libs = Array.isArray(state.editorState?.spriteFramesLibraries) ? state.editorState.spriteFramesLibraries : [];
        const lib = libs.find((entry) => entry?.id === selectedSourceNode.properties?.spriteFramesId);
        options = Array.isArray(lib?.clips) ? lib.clips.map((clip) => clip.name) : [];
      }
      options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt || '(empty)';
        if (String(currentValue ?? '') === String(opt)) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', () => updateSceneInstanceSourceOverride(instanceNode.id, selectedSourceNode.id, field.key, input.value));
    } else {
      input = document.createElement('input');
      input.type = field.type === 'number' ? 'number' : (field.type === 'color' ? 'color' : 'text');
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      if (field.step != null) input.step = field.step;
      input.value = field.type === 'color' ? (/^#([0-9a-f]{6})$/i.test(currentValue || '') ? currentValue : '#478cbf') : (currentValue ?? '');
      input.addEventListener('change', () => {
        const nextValue = field.type === 'number' ? Number(input.value) : input.value;
        updateSceneInstanceSourceOverride(instanceNode.id, selectedSourceNode.id, field.key, nextValue);
      });
    }
    fieldWrap.appendChild(input);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:var(--text-faint);';
    meta.textContent = `Source: ${typeof baseValue === 'object' ? JSON.stringify(baseValue) : String(baseValue)}`;
    fieldWrap.appendChild(meta);
    wrap.appendChild(fieldWrap);
  });

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'mini-btn';
  revertBtn.textContent = 'Revert Selected Node';
  revertBtn.addEventListener('click', () => revertSceneInstanceOverrideNode(instanceNode.id, selectedSourceNode.id));
  buttonRow.appendChild(revertBtn);
  wrap.appendChild(buttonRow);
  return wrap;
}

function buildSiblingOrderField(node) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
  wrap.appendChild(document.createTextNode('Order'));
  const input = document.createElement('input');
  input.type = 'number'; input.min = '0'; input.step = '1';
  input.value = String(Math.max(0, getSiblingIndex(node.id)));
  input.disabled = isRootNodeId(node.id);
  input.addEventListener('focus', () => rememberFieldStart(node.id, '__sibling_order__'));
  input.addEventListener('change', () => {
    if (!reorderNodeAmongSiblings(node.id, Math.max(0, Number(input.value) || 0)))
      input.value = String(Math.max(0, getSiblingIndex(node.id)));
  });
  wrap.appendChild(input); return wrap;
}


function getPivotableNodeSize(node) {
  if (!node) return { width: 0, height: 0 };
  return {
    width: Math.max(1, Number(node.properties?.width) || 96),
    height: Math.max(1, Number(node.properties?.height) || 96)
  };
}

function getPivotPresetValue(node) {
  const stored = String(node?.transform?.pivotPreset || '').trim();
  const validStored = new Set([
    'center', 'top-left', 'top-center', 'top-right',
    'left-center', 'right-center',
    'bottom-left', 'bottom-center', 'bottom-right',
    'custom'
  ]);
  if (validStored.has(stored) && stored !== 'custom') {
    const expected = getPivotPresetCoords(node, stored);
    const px = Number(node?.transform?.pivotX) || 0;
    const py = Number(node?.transform?.pivotY) || 0;
    if (Math.abs(px - expected.pivotX) < 0.5 && Math.abs(py - expected.pivotY) < 0.5) return stored;
  }

  const { width, height } = getPivotableNodeSize(node);
  const px = Number(node?.transform?.pivotX) || 0;
  const py = Number(node?.transform?.pivotY) || 0;
  const close = (a, b) => Math.abs(a - b) < 0.5;
  if (close(px, 0) && close(py, 0)) return 'top-left';
  if (close(px, width / 2) && close(py, 0)) return 'top-center';
  if (close(px, width) && close(py, 0)) return 'top-right';
  if (close(px, 0) && close(py, height / 2)) return 'left-center';
  if (close(px, width / 2) && close(py, height / 2)) return 'center';
  if (close(px, width) && close(py, height / 2)) return 'right-center';
  if (close(px, 0) && close(py, height)) return 'bottom-left';
  if (close(px, width / 2) && close(py, height)) return 'bottom-center';
  if (close(px, width) && close(py, height)) return 'bottom-right';
  return 'custom';
}

function getPivotPresetCoords(node, preset) {
  const { width, height } = getPivotableNodeSize(node);
  switch (preset) {
    case 'center': return { pivotX: width / 2, pivotY: height / 2 };
    case 'top-left': return { pivotX: 0, pivotY: 0 };
    case 'top-right': return { pivotX: width, pivotY: 0 };
    case 'bottom-left': return { pivotX: 0, pivotY: height };
    case 'bottom-right': return { pivotX: width, pivotY: height };
    case 'top-center': return { pivotX: width / 2, pivotY: 0 };
    case 'left-center': return { pivotX: 0, pivotY: height / 2 };
    case 'right-center': return { pivotX: width, pivotY: height / 2 };
    case 'bottom-center': return { pivotX: width / 2, pivotY: height };
    default: return { pivotX: Number(node?.transform?.pivotX) || 0, pivotY: Number(node?.transform?.pivotY) || 0 };
  }
}

function applyPivotChange(node, nextPivotX, nextPivotY) {
  if (!node?.transform) return;
  const prevPivotX = Number(node.transform.pivotX) || 0;
  const prevPivotY = Number(node.transform.pivotY) || 0;
  const scaleX = Number(node.transform.scaleX) || 1;
  const scaleY = Number(node.transform.scaleY) || 1;
  const rotation = Number(node.transform.rotation) || 0;
  const delta = rotatePoint((Number(nextPivotX) - prevPivotX) * scaleX, (Number(nextPivotY) - prevPivotY) * scaleY, rotation);
  node.transform.x = (Number(node.transform.x) || 0) + delta.x;
  node.transform.y = (Number(node.transform.y) || 0) + delta.y;
  node.transform.pivotX = Number(nextPivotX) || 0;
  node.transform.pivotY = Number(nextPivotY) || 0;
}

function applyPivotPreset(node, preset, options = {}) {
  if (!node?.transform) return;
  const normalizedPreset = String(preset || '').trim() || 'custom';
  const coords = getPivotPresetCoords(node, normalizedPreset);
  if (options.keepPivotWorldPosition) {
    node.transform.pivotX = Number(coords.pivotX) || 0;
    node.transform.pivotY = Number(coords.pivotY) || 0;
  } else {
    applyPivotChange(node, coords.pivotX, coords.pivotY);
  }
  node.transform.pivotPreset = normalizedPreset;
}

// Scale all Collider2DComponent dimensions on a node proportionally when the
// node's own width/height changes. ratioX = newWidth/oldWidth, ratioY = newHeight/oldHeight.
// - comp.width / comp.height are absolute pixel AABB dimensions → scale by ratio.
// - comp.offsetX / comp.offsetY are absolute pixel offsets → scale by ratio.
// - comp.physicsShapes use normalized 0..1 coords relative to comp.width/height → unchanged.
function scaleNodeColliders(node, ratioX, ratioY) {
  if (!Array.isArray(node?.components)) return;
  const rx = Number(ratioX) || 1;
  const ry = Number(ratioY) || 1;
  if (Math.abs(rx - 1) < 0.0001 && Math.abs(ry - 1) < 0.0001) return;
  node.components.forEach((comp) => {
    if (!comp || comp.type !== 'Collider2DComponent') return;
    if (Number.isFinite(comp.width)   && comp.width   > 0) comp.width   = Math.max(1, Math.round(comp.width   * rx));
    if (Number.isFinite(comp.height)  && comp.height  > 0) comp.height  = Math.max(1, Math.round(comp.height  * ry));
    if (Number.isFinite(comp.offsetX) && comp.offsetX !== 0) comp.offsetX = comp.offsetX * rx;
    if (Number.isFinite(comp.offsetY) && comp.offsetY !== 0) comp.offsetY = comp.offsetY * ry;
  });
}

function buildField(node, field) {
  const value = getValueByPath(node, field.key);
  const wrap  = document.createElement('label');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-dim)';
  wrap.appendChild(document.createTextNode(field.label));

  let input;
  switch (field.type) {
    case 'boolean': {
      input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!value;
      input.addEventListener('change', () => updateField(node.id, field, input.checked));
      break;
    }
    case 'number': {
      // Number field: free-type text input + ▲/▼ step buttons side-by-side.
      const step  = field.step != null ? Number(field.step) : 1;
      const minV  = field.min  != null ? Number(field.min)  : -Infinity;
      const maxV  = field.max  != null ? Number(field.max)  :  Infinity;
      const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;

      const numWrap = document.createElement('div');
      numWrap.className = 'num-field-wrap';

      const numInput = document.createElement('input');
      numInput.type = 'text';
      numInput.inputMode = 'decimal';
      numInput.dataset.fieldType = 'number';
      numInput.dataset.fieldKey = field.key;
      numInput.value = value ?? 0;
      numInput.dataset.lastValid = String(value ?? 0);
      numInput.className = 'num-field-input';

      const stepStack = document.createElement('div');
      stepStack.className = 'num-field-btns';
      const upBtn  = document.createElement('button');
      const dnBtn  = document.createElement('button');
      upBtn.type = dnBtn.type = 'button';
      upBtn.className = dnBtn.className = 'num-step-btn';
      upBtn.textContent = '▲'; dnBtn.textContent = '▼';
      upBtn.title = `Increase by ${step}`; dnBtn.title = `Decrease by ${step}`;
      stepStack.append(upBtn, dnBtn);
      numWrap.append(numInput, stepStack);

      // ── shared helpers ──────────────────────────────────────────
      const _isAnchorField = field.key.startsWith('properties.anchor') || field.key.startsWith('properties.margin');
      const _clampRound = (v) => {
        v = Math.max(minV, Math.min(maxV, v));
        return decimals > 0 ? parseFloat(v.toFixed(decimals)) : Math.round(v);
      };
      const _commit = () => {
        let v = parseFloat(numInput.value);
        if (!Number.isFinite(v)) v = parseFloat(numInput.dataset.lastValid) || 0;
        v = _clampRound(v);
        numInput.value = v;
        numInput.dataset.lastValid = String(v);
        updateField(node.id, field, v, { refreshInspector: _isAnchorField });
        commitDeferredHistory(node.id, field.key, `Change `);
      };
      const _nudge = (dir) => {
        const cur = parseFloat(numInput.value);
        const v   = _clampRound((Number.isFinite(cur) ? cur : 0) + dir * step);
        numInput.value = v;
        numInput.dataset.lastValid = String(v);
        // SLUGGISH-FIX: deferViewport suppresses per-nudge viewport rerender;
        // the viewport will catch up when the hold ends and _commit fires.
        updateField(node.id, field, v, { deferHistory: true, refreshInspector: false, deferViewport: true });
      };

      // ── input: free typing, live preview ────────────────────────
      numInput.addEventListener('focus', () => {
        rememberFieldStart(node.id, field.key);
        numInput.select();
      });
      numInput.addEventListener('input', () => {
        const v = parseFloat(numInput.value.trim());
        if (Number.isFinite(v)) {
          numInput.dataset.lastValid = String(v);
          // deferViewport + deferTree: suppress full scene rebuilds while typing.
          // The viewport will refresh on blur/commit via commitDeferredHistory.
          updateField(node.id, field, v, { deferHistory: true, refreshInspector: false, deferViewport: true, deferTree: true });
        }
      });
      numInput.addEventListener('blur', _commit);
      numInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); _commit(); numInput.blur(); }
        if (e.key === 'Escape') {
          numInput.value = numInput.dataset.lastValid;
          numInput.blur();
        }
        if (e.key === 'ArrowUp')   { e.preventDefault(); _nudge(+1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); _nudge(-1); }
      });

      // ── buttons: click to step, hold to repeat ───────────────────
      const _startRepeat = (dir) => {
        rememberFieldStart(node.id, field.key);
        _nudge(dir);
        let timer = setTimeout(function repeat() {
          _nudge(dir);
          timer = setTimeout(repeat, 60);
        }, 400);
        const stop = () => { clearTimeout(timer); document.removeEventListener('pointerup', stop); };
        document.addEventListener('pointerup', stop);
      };
      upBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); _startRepeat(+1); });
      dnBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); _startRepeat(-1); });

      wrap.appendChild(numWrap);
      input = null; // prevent the generic `if (input)` append below
      break;
    }
    case 'color': {
      input = document.createElement('input'); input.type = 'color';
      input.value = /^#([0-9a-f]{6})$/i.test(value) ? value : '#478cbf';
      input.addEventListener('focus',  () => rememberFieldStart(node.id, field.key));
      input.addEventListener('input',  () => updateField(node.id, field, input.value, { deferHistory: true, refreshInspector: false }));
      input.addEventListener('change', () => commitDeferredHistory(node.id, field.key, `Change ${field.label}`));
      break;
    }
    case 'select': {
      input = document.createElement('select');
      let options = field.options || [];
      if (node.type === 'AnimatedSprite2D' && field.key === 'properties.animation') {
        options = ensureAnimationNodeData(node).map((c) => c.name);
      } else if (node.type === 'AnimatedSprite2D' && field.key === 'properties.spriteSheetId') {
        options = state.spritesheets.map((s) => s.id);
        if (!options.length) options = [''];
      } else if (node.type === 'TileMap' && field.key === 'properties.tilesetId') {
        options = state.tilesets.map((t) => t.id);
        if (!options.length) options = [''];
      }
      options.forEach((opt) => {
        const o = document.createElement('option'); o.value = opt;
        o.textContent = (node.type === 'AnimatedSprite2D' && field.key === 'properties.spriteSheetId')
          ? (getSheetById(opt)?.name || opt || 'No spritesheets')
          : (node.type === 'TileMap' && field.key === 'properties.tilesetId')
            ? (getTilesetById(opt)?.name || opt || 'No tilesets')
            : opt;
        if (String(value ?? '') === String(opt ?? '')) o.selected = true;
        input.appendChild(o);
      });
      input.addEventListener('focus',  () => rememberFieldStart(node.id, field.key));
      input.addEventListener('change', () => updateField(node.id, field, input.value));
      break;
    }
    case 'json': {
      input = document.createElement('textarea');
      input.value = JSON.stringify(value ?? null, null, 2);
      input.addEventListener('focus', () => rememberFieldStart(node.id, field.key));
      input.addEventListener('change', () => {
        try { updateField(node.id, field, JSON.parse(input.value)); input.style.borderColor = ''; }
        catch (_) { input.style.borderColor = 'var(--red)'; }
      });
      break;
    }
    case 'readonly': {
      input = document.createElement('input'); input.type = 'text'; input.readOnly = true; input.value = value || '';
      break;
    }
    case 'pivot_preset': {
      input = document.createElement('select');
      [
        ['center', 'Center'],
        ['top-left', 'Top Left'],
        ['top-center', 'Top Center'],
        ['top-right', 'Top Right'],
        ['left-center', 'Left Center'],
        ['right-center', 'Right Center'],
        ['bottom-left', 'Bottom Left'],
        ['bottom-center', 'Bottom Center'],
        ['bottom-right', 'Bottom Right'],
        ['custom', 'Custom']
      ].forEach(([valueOpt, labelOpt]) => {
        const o = document.createElement('option');
        o.value = valueOpt;
        o.textContent = labelOpt;
        input.appendChild(o);
      });
      input.value = getPivotPresetValue(node);
      input.addEventListener('focus', () => rememberFieldStart(node.id, '__pivot__'));
      input.addEventListener('change', () => {
        if (input.value === 'custom') {
          updateField(node.id, field, 'custom', { refreshInspector: true });
          return;
        }
        updateField(node.id, field, input.value, { refreshInspector: true });
      });
      break;
    }
    case 'image_picker': {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:4px;';
      const pickBtn  = document.createElement('button');
      pickBtn.textContent = 'Pick Image';
      pickBtn.style.cssText = 'flex:1;padding:3px 7px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text);font-size:11px;cursor:pointer';
      pickBtn.addEventListener('click', async () => {
        const result = await openImageFileSafe({ assetKind: 'image' });
        if (!result.success) return;
        pushHistory('Pick image');
        const n = getNode(node.id); if (!n) return;
        n.properties.imagePath = result.resPath || result.filePath; n.properties.imageDataUrl = result.dataUrl;
        loadImageIntoCache(n.id, result.dataUrl, () => { scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR); setStatus('Loaded image for ' + n.name + '.'); });
      });
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      clearBtn.style.cssText = 'padding:3px 7px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text-dim);font-size:11px;cursor:pointer';
      clearBtn.addEventListener('click', () => {
        pushHistory('Clear image');
        const n = getNode(node.id); if (!n) return;
        n.properties.imagePath = ''; n.properties.imageDataUrl = '';
        state.imageCache.delete(n.id); scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR); setStatus('Cleared image.');
      });
      row.appendChild(pickBtn); row.appendChild(clearBtn); wrap.appendChild(row); return wrap;
    }
    case 'nineslice_style_picker': {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:4px;align-items:center;';
      const sel = document.createElement('select');
      sel.style.cssText = 'flex:1;font-size:11px;height:24px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:0 4px;';
      const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '— None —'; sel.appendChild(emptyOpt);
      const styles = state.nineSliceStyles || [];
      for (const s of styles) {
        const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name || s.id; sel.appendChild(opt);
      }
      sel.value = value ?? '';
      sel.addEventListener('change', () => { updateField(node.id, field, sel.value || null); });
      const editBtn = document.createElement('button');
      editBtn.textContent = '✎'; editBtn.title = 'Open Nine-Slice Editor';
      editBtn.style.cssText = 'padding:3px 6px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text);font-size:12px;cursor:pointer;flex-shrink:0;';
      editBtn.addEventListener('click', () => {
        const styleId = sel.value || null;
        if (styleId) state.selectedNineSliceStyleId = styleId;
        activateBottomPanel('nineslice');
      });
      row.appendChild(sel); row.appendChild(editBtn); wrap.appendChild(row); return wrap;
    }
    case 'ui_action_picker': {
      // Dropdown of built-in actions + custom text field
      const BUILTIN_ACTIONS = [
        { value: '',               label: '— None —' },
        { value: 'back',           label: 'back — Go back / pop scene' },
        { value: 'quit_to_title',  label: 'quit_to_title — Return to title' },
        { value: 'start_game',     label: 'start_game — Load Game scene' },
        { value: 'resume_game',    label: 'resume_game — Unpause game' },
        { value: 'open_options',   label: 'open_options — Push Options scene' },
        { value: 'close',          label: 'close — Close dialog' },
        { value: 'popscreen',      label: 'popscreen — Pop UI screen' },
        { value: 'options_reset',  label: 'options_reset — Reset all options' },
      ];
      const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
      const selEl = document.createElement('select');
      selEl.style.cssText = 'width:100%;font-size:11px;height:22px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:0 4px;';
      for (const opt of BUILTIN_ACTIONS) {
        const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; selEl.appendChild(o);
      }
      const customOpt = document.createElement('option'); customOpt.value = '__custom__'; customOpt.textContent = 'custom…'; selEl.appendChild(customOpt);
      const customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.placeholder = 'scene:SceneName  push:Scene  custom:Event';
      customInput.style.cssText = 'width:100%;font-size:11px;height:22px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:0 6px;box-sizing:border-box;display:none;';
      // Init state
      const isBuiltin = BUILTIN_ACTIONS.some(a => a.value === (value ?? ''));
      if (isBuiltin) {
        selEl.value = value ?? '';
        customInput.style.display = 'none';
      } else if (value && value !== '') {
        selEl.value = '__custom__';
        customInput.value = value;
        customInput.style.display = '';
      } else {
        selEl.value = '';
      }
      selEl.addEventListener('change', () => {
        if (selEl.value === '__custom__') {
          customInput.style.display = '';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
          updateField(node.id, field, selEl.value || null);
        }
      });
      customInput.addEventListener('change', () => { updateField(node.id, field, customInput.value || null); });
      row.appendChild(selEl); row.appendChild(customInput); wrap.appendChild(row); return wrap;
    }
    case 'anchor_preset': {
      // Anchor preset picker: 3×3 grid (top-left → full-rect) + "keep" centre cell
      // Matches Godot's anchor preset layout exactly.
      // Selecting a preset writes anchorLeft/Top/Right/Bottom on the node and
      // refreshes the inspector so the raw number fields below update instantly.
      const PRESETS = [
        // [label, anchorL, anchorT, anchorR, anchorB, marginL, marginT, marginR, marginB]
        ['Top Left',     0,   0,   0,   0,   0, 0, 0, 0],
        ['Top Centre',   0.5, 0,   0.5, 0,   0, 0, 0, 0],
        ['Top Right',    1,   0,   1,   0,   0, 0, 0, 0],
        ['Left',         0,   0.5, 0,   0.5, 0, 0, 0, 0],
        ['Centre',       0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0],
        ['Right',        1,   0.5, 1,   0.5, 0, 0, 0, 0],
        ['Bottom Left',  0,   1,   0,   1,   0, 0, 0, 0],
        ['Bottom',       0.5, 1,   0.5, 1,   0, 0, 0, 0],
        ['Bottom Right', 1,   1,   1,   1,   0, 0, 0, 0],
        // Wide/tall stretch presets (second row, shown in a 3×4 area)
        ['Left Wide',    0,   0,   0,   1,   0, 0, 0, 0],
        ['H Centre Wide',0.5, 0,   0.5, 1,   0, 0, 0, 0],
        ['Right Wide',   1,   0,   1,   1,   0, 0, 0, 0],
        ['Top Wide',     0,   0,   1,   0,   0, 0, 0, 0],
        ['Full Rect',    0,   0,   1,   1,   0, 0, 0, 0],
        ['V Centre Wide',0,   0.5, 1,   0.5, 0, 0, 0, 0],
        ['Bottom Wide',  0,   1,   1,   1,   0, 0, 0, 0],
      ];

      // Detect which preset is currently active
      const aL = Number(node.properties?.anchorLeft   ?? 0);
      const aT = Number(node.properties?.anchorTop    ?? 0);
      const aR = Number(node.properties?.anchorRight  ?? 0);
      const aB = Number(node.properties?.anchorBottom ?? 0);
      const activePreset = PRESETS.findIndex(([,l,t,r,b]) =>
        Math.abs(l - aL) < 0.001 && Math.abs(t - aT) < 0.001 &&
        Math.abs(r - aR) < 0.001 && Math.abs(b - aB) < 0.001
      );

      const container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      // ── 3×3 point presets grid ──────────────────────────────────────
      const gridWrap = document.createElement('div');
      gridWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const gridLabel = document.createElement('span');
      gridLabel.textContent = 'Point Anchors';
      gridLabel.style.cssText = 'font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.04em;text-transform:uppercase;';
      gridWrap.appendChild(gridLabel);

      const grid = document.createElement('div');
      grid.className = 'anchor-preset-grid';
      PRESETS.slice(0, 9).forEach((preset, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = preset[0];
        btn.className = 'anchor-preset-btn' + (activePreset === idx ? ' active' : '');

        // Mini SVG dot diagram showing anchor position
        const [,l,t] = preset;
        const px = Math.round(4 + l * 10), py = Math.round(4 + t * 10);
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"/><circle cx="${px}" cy="${py}" r="2.5" fill="currentColor"/></svg>`;

        btn.addEventListener('click', () => {
          pushHistory(`Anchor: ${preset[0]}`);
          const n = getNode(node.id); if (!n) return;
          n.properties.anchorLeft   = preset[1];
          n.properties.anchorTop    = preset[2];
          n.properties.anchorRight  = preset[3];
          n.properties.anchorBottom = preset[4];
          n.properties.marginLeft   = preset[5];
          n.properties.marginTop    = preset[6];
          n.properties.marginRight  = preset[7];
          n.properties.marginBottom = preset[8];
          if (RGE_ROOT.RGEUIEditor?.applyAnchorLayout) { RGE_ROOT.RGEUIEditor.applyAnchorLayout(); RGE_ROOT.RGEUIEditor.markDirty?.(); }
          scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
        });
        grid.appendChild(btn);
      });
      gridWrap.appendChild(grid);
      container.appendChild(gridWrap);

      // ── Stretch presets row ─────────────────────────────────────────
      const stretchWrap = document.createElement('div');
      stretchWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const stretchLabel = document.createElement('span');
      stretchLabel.textContent = 'Stretch Presets';
      stretchLabel.style.cssText = 'font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:.04em;text-transform:uppercase;';
      stretchWrap.appendChild(stretchLabel);

      const STRETCH_DEFS = [
        // [label, SVG description, presetIndex]
        ['Left Wide',       'L',  9],
        ['H Centre Wide',   '|',  10],
        ['Right Wide',      'R',  11],
        ['Top Wide',        'T',  12],
        ['Full Rect',       '▣',  13],
        ['V Centre Wide',   '—',  14],
        ['Bottom Wide',     'B',  15],
      ];
      const stretchGrid = document.createElement('div');
      stretchGrid.className = 'anchor-stretch-grid';
      STRETCH_DEFS.forEach(([label, icon, pi]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = label;
        btn.className = 'anchor-stretch-btn' + (activePreset === pi ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          const p = PRESETS[pi];
          pushHistory(`Anchor: ${p[0]}`);
          const n = getNode(node.id); if (!n) return;
          n.properties.anchorLeft   = p[1];
          n.properties.anchorTop    = p[2];
          n.properties.anchorRight  = p[3];
          n.properties.anchorBottom = p[4];
          if (RGE_ROOT.RGEUIEditor?.applyAnchorLayout) { RGE_ROOT.RGEUIEditor.applyAnchorLayout(); RGE_ROOT.RGEUIEditor.markDirty?.(); }
          scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
        });
        stretchGrid.appendChild(btn);
      });
      stretchWrap.appendChild(stretchGrid);
      container.appendChild(stretchWrap);

      wrap.appendChild(container);
      return wrap;
    }
    default: {
      input = document.createElement('input'); input.type = 'text'; input.value = value ?? '';
      input.addEventListener('focus',  () => rememberFieldStart(node.id, field.key));
      input.addEventListener('change', () => updateField(node.id, field, input.value));
    }
  }
  if (input) { input.style.width = '100%'; wrap.appendChild(input); }
  return wrap;
}

function rememberFieldStart(nodeId, fieldKey) {
  const node = getNode(nodeId); if (!node) return;
  (state.history.fieldBaseline || (state.history.fieldBaseline = {}))[`${nodeId}:${fieldKey}`] = serializeScene();
}
function commitDeferredHistory(nodeId, fieldKey, label) {
  const baseline = state.history.fieldBaseline || {};
  const key = `${nodeId}:${fieldKey}`;
  const snapshot = baseline[key]; delete baseline[key];
  if (snapshot && snapshot !== serializeScene()) pushHistory(label, snapshot);
  // Commit: flush viewport + tree that were deferred during live typing.
  scheduleRender(RenderFlags.STRUCTURAL | RenderFlags.INSPECTOR);
}

function buildMenuListItemsEditor(node) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;color:var(--text-dim);font-weight:600;';
  label.textContent = 'Items';
  header.appendChild(label);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini-btn';
  addBtn.textContent = '+ Add Item';
  addBtn.addEventListener('click', () => {
    const items = Array.isArray(node.properties.items) ? [...node.properties.items] : [];
    items.push(`Item ${items.length + 1}`);
    updateNodeField(node.id, 'properties.items', items);
  });
  header.appendChild(addBtn);
  wrap.appendChild(header);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  const items = Array.isArray(node.properties?.items) ? node.properties.items : [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = 'No items. Click "+ Add Item" to start.';
    list.appendChild(empty);
  } else {
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:4px;align-items:center;';

      const input = document.createElement('input');
      input.type = 'text';
      input.style.flex = '1';
      input.value = typeof item === 'string' ? item : (item?.label || '');
      input.addEventListener('change', () => {
        const newItems = [...items];
        newItems[i] = input.value;
        updateNodeField(node.id, 'properties.items', newItems);
      });

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'mini-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Move up';
      upBtn.disabled = i === 0;
      upBtn.addEventListener('click', () => {
        if (i === 0) return;
        const newItems = [...items];
        [newItems[i - 1], newItems[i]] = [newItems[i], newItems[i - 1]];
        updateNodeField(node.id, 'properties.items', newItems);
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'mini-btn';
      downBtn.textContent = '↓';
      downBtn.title = 'Move down';
      downBtn.disabled = i === items.length - 1;
      downBtn.addEventListener('click', () => {
        if (i >= items.length - 1) return;
        const newItems = [...items];
        [newItems[i], newItems[i + 1]] = [newItems[i + 1], newItems[i]];
        updateNodeField(node.id, 'properties.items', newItems);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'mini-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove item';
      removeBtn.addEventListener('click', () => {
        const newItems = items.filter((_, j) => j !== i);
        updateNodeField(node.id, 'properties.items', newItems);
      });

      row.appendChild(input);
      row.appendChild(upBtn);
      row.appendChild(downBtn);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function buildImagePreview(node, animated) {
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const labelEl = document.createElement('span'); labelEl.style.cssText = 'font-size:11px;color:var(--text-dim);';
  labelEl.textContent = animated ? 'Tile Preview' : 'Image Preview';
  wrap.appendChild(labelEl);
  const box = document.createElement('div'); box.className = 'sprite-preview';

  if (animated) {
    // AnimatedSprite2D: pull from the sheet assigned to the current clip,
    // not from imageDataUrl (which AnimatedSprite2D never sets).
    const sheet = getNodeAssignedSheet(node);
    if (!sheet?.image?.complete) {
      box.textContent = sheet ? 'Loading…' : 'No spritesheet assigned';
      wrap.appendChild(box);
      return wrap;
    }
    const tileRect = getTileRect(sheet, Math.max(0, Number(node.properties.previewFrame) || 0));
    if (!tileRect) { box.textContent = 'Invalid preview frame'; wrap.appendChild(box); return wrap; }
    const canvas = document.createElement('canvas'); canvas.width = tileRect.width; canvas.height = tileRect.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, tileRect.x, tileRect.y, tileRect.width, tileRect.height, 0, 0, tileRect.width, tileRect.height);
    const imgEl = document.createElement('img'); imgEl.src = canvas.toDataURL();
    box.appendChild(imgEl);
    wrap.appendChild(box);

    // "Resize to tile" button — matches the tile's natural pixel dimensions.
    const resizeBtn = document.createElement('button');
    resizeBtn.textContent = `Resize to tile (${tileRect.width}×${tileRect.height})`;
    resizeBtn.style.cssText = 'margin-top:2px;padding:3px 7px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text);font-size:11px;cursor:pointer;width:100%;text-align:left;';
    resizeBtn.addEventListener('click', () => {
      const n = getNode(node.id); if (!n) return;
      const before = serializeScene(); const _vResizeTile = _getSceneVersion();
      const preset = String(n.transform?.pivotPreset || '').trim();
      const oldW = Math.max(1, Number(n.properties?.width)  || 1);
      const oldH = Math.max(1, Number(n.properties?.height) || 1);
      n.properties.width  = tileRect.width;
      n.properties.height = tileRect.height;
      scaleNodeColliders(n, tileRect.width / oldW, tileRect.height / oldH);
      if (preset && preset !== 'custom') applyPivotPreset(n, preset, { keepPivotWorldPosition: false });
      _bumpSceneVersion();
      scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
      if (_sceneChanged(_vResizeTile)) pushHistory('Resize to tile', before);
      setStatus(`Resized ${n.name} to ${tileRect.width}×${tileRect.height}.`);
    });
    wrap.appendChild(resizeBtn);
    return wrap;
  }

  // Sprite2D: use imageDataUrl as before, plus a "Resize to image" button.
  const dataUrl = node.properties.imageDataUrl;
  if (!dataUrl) { box.textContent = 'No image loaded'; wrap.appendChild(box); return wrap; }
  const imgEl = document.createElement('img'); imgEl.src = dataUrl; box.appendChild(imgEl);
  wrap.appendChild(box);

  // "Resize to image" button — uses the cached image's natural dimensions.
  const cachedImg = state.imageCache.get(node.id);
  if (cachedImg?.complete && cachedImg.naturalWidth > 0) {
    const nw = cachedImg.naturalWidth, nh = cachedImg.naturalHeight;
    const resizeBtn = document.createElement('button');
    resizeBtn.textContent = `Resize to image (${nw}×${nh})`;
    resizeBtn.style.cssText = 'margin-top:2px;padding:3px 7px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text);font-size:11px;cursor:pointer;width:100%;text-align:left;';
    resizeBtn.addEventListener('click', () => {
      const n = getNode(node.id); if (!n) return;
      const before = serializeScene(); const _vResizeImg = _getSceneVersion();
      const preset = String(n.transform?.pivotPreset || '').trim();
      const oldW = Math.max(1, Number(n.properties?.width)  || 1);
      const oldH = Math.max(1, Number(n.properties?.height) || 1);
      n.properties.width  = nw;
      n.properties.height = nh;
      scaleNodeColliders(n, nw / oldW, nh / oldH);
      if (preset && preset !== 'custom') applyPivotPreset(n, preset, { keepPivotWorldPosition: false });
      _bumpSceneVersion();
      scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
      if (_sceneChanged(_vResizeImg)) pushHistory('Resize to image', before);
      setStatus(`Resized ${n.name} to ${nw}×${nh}.`);
    });
    wrap.appendChild(resizeBtn);
  }
  return wrap;
}

function ensureCameraPathPoints(node) {
  if (!node || node.type !== 'CameraPath2D') return [];
  node.properties = node.properties || {};
  if (!Array.isArray(node.properties.points)) {
    const legacy = Array.isArray(node.properties.waypoints) ? node.properties.waypoints : [];
    node.properties.points = legacy.length ? legacy : [{ x: 0, y: 0 }];
  }
  node.properties.points = node.properties.points.filter((point) => point && typeof point === 'object');
  node.properties.points.forEach((point) => {
    point.x = Number(point.x) || 0;
    point.y = Number(point.y) || 0;
  });
  if (!node.properties.points.length) node.properties.points.push({ x: 0, y: 0 });
  delete node.properties.waypoints;
  return node.properties.points;
}

function isCameraPathEditMode() {
  return state.tool === 'camera-path';
}

function getSelectedCameraPathNode() {
  const node = getNode(state.selectedId);
  return node && node.type === 'CameraPath2D' ? node : null;
}

function selectCameraPathPoint(nodeId, pointIndex, options = {}) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || pointIndex < 0 || pointIndex >= points.length) return false;
  const indices = state.cameraPathEditor.selectedPointIndices;
  if (options.ctrl) {
    // Toggle
    if (indices.has(pointIndex)) indices.delete(pointIndex);
    else indices.add(pointIndex);
  } else if (options.shift && indices.size > 0) {
    // Range select from last selected to clicked
    const last = Math.max(...indices);
    const min = Math.min(last, pointIndex);
    const max = Math.max(last, pointIndex);
    for (let i = min; i <= max; i++) indices.add(i);
  } else {
    // Single select
    indices.clear();
    indices.add(pointIndex);
  }
  state.cameraPathEditor.selectedNodeId = node.id;
  if (state.selectedId !== node.id || getSelectedNodeIds().length !== 1) {
    selectNode(node.id);
  } else {
    scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT);
  }
  setStatus(`Selected ${node.name || 'CameraPath2D'} point ${pointIndex + 1}.`);
  return true;
}

function closeCameraPathPointMenu() {
  const menu = state.cameraPathEditor.contextMenu;
  if (menu?.parentNode) menu.parentNode.removeChild(menu);
  state.cameraPathEditor.contextMenu = null;
}

function moveCameraPathPointToStart(nodeId, pointIndex) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || pointIndex <= 0 || pointIndex >= points.length) return false;
  const before = serializeScene();
  const [point] = points.splice(pointIndex, 1);
  points.unshift(point);
  state.cameraPathEditor.selectedNodeId = node.id;
  state.cameraPathEditor.selectedPointIndices = new Set([0]);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Set Camera Path Start Point', before);
  return true;
}

function moveCameraPathPointToEnd(nodeId, pointIndex) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || pointIndex < 0 || pointIndex >= points.length - 1) return false;
  const before = serializeScene();
  const [point] = points.splice(pointIndex, 1);
  points.push(point);
  state.cameraPathEditor.selectedNodeId = node.id;
  state.cameraPathEditor.selectedPointIndices = new Set([points.length - 1]);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Set Camera Path End Point', before);
  return true;
}

function insertCameraPathPointAfter(nodeId, pointIndex) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || pointIndex < 0 || pointIndex >= points.length) return false;
  const before = serializeScene();
  const current = points[pointIndex] || { x: 0, y: 0 };
  const next = points[pointIndex + 1] || { x: current.x + 64, y: current.y + 64 };
  const inserted = {
    x: ((Number(current.x) || 0) + (Number(next.x) || 0)) / 2,
    y: ((Number(current.y) || 0) + (Number(next.y) || 0)) / 2
  };
  points.splice(pointIndex + 1, 0, inserted);
  state.cameraPathEditor.selectedNodeId = node.id;
  state.cameraPathEditor.selectedPointIndices = new Set([pointIndex + 1]);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Insert Camera Path Point', before);
  return true;
}

function openCameraPathPointMenu(nodeId, pointIndex, clientX, clientY) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || pointIndex < 0 || pointIndex >= points.length) return;
  closeCameraPathPointMenu();
  selectCameraPathPoint(nodeId, pointIndex);
  const menu = document.createElement('div');
  menu.className = 'context-menu camera-path-point-menu';
  menu.style.cssText = `position:fixed;left:${Math.round(clientX)}px;top:${Math.round(clientY)}px;z-index:9999;min-width:150px;background:var(--panel-2,#1b2030);border:1px solid var(--border,#334);box-shadow:0 8px 24px rgba(0,0,0,.35);padding:4px;border-radius:4px;`;
  const addItem = (label, handler, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'toolbar-menu-item';
    item.textContent = label;
    item.disabled = !!disabled;
    item.style.cssText = 'display:block;width:100%;text-align:left;';
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeCameraPathPointMenu();
      if (!disabled) handler();
    });
    menu.appendChild(item);
  };
  const selCount = state.cameraPathEditor.selectedNodeId === node.id ? state.cameraPathEditor.selectedPointIndices.size : 0;
  addItem(selCount > 1 ? `Delete ${selCount} Selected Points` : 'Delete Point', () => {
    if (selCount > 1) deleteSelectedCameraPathPoints(nodeId);
    else deleteCameraPathPoint(nodeId, pointIndex);
  }, points.length <= 1);
  addItem('Insert Point After', () => insertCameraPathPointAfter(nodeId, pointIndex));
  addItem('Set Start Point', () => moveCameraPathPointToStart(nodeId, pointIndex), pointIndex === 0);
  addItem('Set End Point', () => moveCameraPathPointToEnd(nodeId, pointIndex), pointIndex === points.length - 1);
  document.body.appendChild(menu);
  state.cameraPathEditor.contextMenu = menu;
  setTimeout(() => {
    const close = (event) => {
      if (!menu.contains(event.target)) {
        closeCameraPathPointMenu();
        document.removeEventListener('pointerdown', close, true);
      }
    };
    document.addEventListener('pointerdown', close, true);
  }, 0);
}

function patchCameraPathPointInputs(nodeId, pointIndex) {
  if (!inspectorEl) return;
  const node = getNode(nodeId);
  const point = ensureCameraPathPoints(node)[pointIndex];
  if (!point) return;
  inspectorEl.querySelectorAll(`[data-camera-path-point="${pointIndex}"] input[data-axis]`).forEach((input) => {
    const axis = input.dataset.axis;
    if (axis === 'x') input.value = String(Math.round(point.x * 100) / 100);
    if (axis === 'y') input.value = String(Math.round(point.y * 100) / 100);
  });
}

function setCameraPathPoint(nodeId, pointIndex, x, y, options = {}) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  const point = points[pointIndex];
  if (!point) return false;
  point.x = Number(x) || 0;
  point.y = Number(y) || 0;
  delete node.properties.waypoints;
  _bumpSceneVersion();
  if (options.patchInspector !== false) patchCameraPathPointInputs(nodeId, pointIndex);
  if (options.schedule !== false) scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR | RenderFlags.SCENE_SUMMARY);
  return true;
}


// ══════════════════════════════════════════════════════════════════════
// CAMERA TARGET GROUP — Inspector, Runtime, Debug
// ══════════════════════════════════════════════════════════════════════

/**
 * Ensure properties.targets is a valid array of {nodeId, weight} objects.
 */
function ensureCTGTargets(node) {
  if (!node || !node.properties) return [];
  if (!Array.isArray(node.properties.targets)) node.properties.targets = [];
  // Migrate legacy targetNames
  if (Array.isArray(node.properties.targetNames) && node.properties.targetNames.length && !node.properties.targets.length) {
    node.properties.targets = node.properties.targetNames.map(name => {
      const found = getNodes().find(n => n.name === name);
      return found ? { nodeId: found.id } : null;
    }).filter(Boolean);
    delete node.properties.targetNames;
  }
  return node.properties.targets;
}

/**
 * Add a target node to a CameraTargetGroup with undo support.
 */
function ctgAddTarget(groupId, targetNodeId) {
  const group = getNode(groupId);
  const target = getNode(targetNodeId);
  if (!group || group.type !== 'CameraTargetGroup') return false;
  if (!target || target.id === groupId) return false;
  const targets = ensureCTGTargets(group);
  if (targets.some(t => t.nodeId === targetNodeId)) return false; // already assigned
  const before = serializeScene();
  targets.push({ nodeId: targetNodeId });
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('CTG: Add Target', before);
  return true;
}

/**
 * Remove a target from a CameraTargetGroup with undo support.
 */
function ctgRemoveTarget(groupId, targetNodeId) {
  const group = getNode(groupId);
  if (!group || group.type !== 'CameraTargetGroup') return false;
  const targets = ensureCTGTargets(group);
  const idx = targets.findIndex(t => t.nodeId === targetNodeId);
  if (idx === -1) return false;
  const before = serializeScene();
  targets.splice(idx, 1);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('CTG: Remove Target', before);
  return true;
}

/**
 * Move a target up or down in the list.
 */
function ctgMoveTarget(groupId, targetNodeId, direction) {
  const group = getNode(groupId);
  if (!group || group.type !== 'CameraTargetGroup') return false;
  const targets = ensureCTGTargets(group);
  const idx = targets.findIndex(t => t.nodeId === targetNodeId);
  if (idx === -1) return false;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= targets.length) return false;
  const before = serializeScene();
  const tmp = targets[idx];
  targets[idx] = targets[newIdx];
  targets[newIdx] = tmp;
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('CTG: Reorder Target', before);
  return true;
}

/**
 * Add all currently selected nodes (excluding this group) as targets.
 */
function ctgAddSelectedNodes(groupId) {
  const group = getNode(groupId);
  if (!group || group.type !== 'CameraTargetGroup') return;
  const before = serializeScene();
  const targets = ensureCTGTargets(group);
  const SKIP = new Set(['Camera2D','CameraBounds2D','CameraZone2D','CameraPath2D','CameraTargetGroup','SceneRoot','TileMap']);
  let added = 0;
  const selected = getSelectedNodes ? getSelectedNodes() : [];
  for (const n of selected) {
    if (!n || n.id === groupId || SKIP.has(n.type)) continue;
    if (targets.some(t => t.nodeId === n.id)) continue;
    targets.push({ nodeId: n.id });
    added++;
  }
  if (!added) { return; }
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('CTG: Add Selected Nodes', before);
}

/**
 * Build the inspector panel section for CameraTargetGroup targets.
 */
function buildCameraTargetGroupInspector(node, container) {
  const sec = document.createElement('section');
  sec.className = 'inspector-section';

  const toggle = document.createElement('button');
  toggle.className = 'section-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Targets';
  toggle.dataset.sectionName = 'Targets';
  if (state.ui.inspectorCollapsed.has('Targets')) sec.classList.add('collapsed');
  sec.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'section-body';

  // ── Buttons row ────────────────────────────────────────────────────────────
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';

  const addSelBtn = document.createElement('button');
  addSelBtn.type = 'button';
  addSelBtn.className = 'mini-btn';
  addSelBtn.textContent = '+ Add Selected';
  addSelBtn.title = 'Add currently selected nodes as targets';
  addSelBtn.addEventListener('click', () => {
    ctgAddSelectedNodes(node.id);
    refreshInspector({ force: true });
  });

  btnRow.appendChild(addSelBtn);
  body.appendChild(btnRow);

  // ── Targets list ───────────────────────────────────────────────────────────
  const targets = ensureCTGTargets(node);
  const listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  if (!targets.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;color:#888;padding:4px 0;';
    empty.textContent = 'No targets assigned. Select nodes and click "+ Add Selected".';
    listEl.appendChild(empty);
  } else {
    targets.forEach((entry, idx) => {
      const target = getNode(entry.nodeId);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.04);border-radius:3px;padding:3px 5px;';

      // Node name/type badge
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;font-size:11px;overflow:hidden;';
      if (target) {
        info.innerHTML = `<span style="color:#e0e0e0;">${target.name || target.id.slice(0,8)}</span> <span style="color:#777;font-size:10px;">[${target.type}]</span>`;
      } else {
        info.innerHTML = `<span style="color:#e57373;">${entry.nodeId.slice(0,8)} (missing)</span>`;
      }
      row.appendChild(info);

      // Up / Down
      const upBtn = document.createElement('button');
      upBtn.type = 'button'; upBtn.textContent = '↑'; upBtn.className = 'mini-btn';
      upBtn.style.cssText = 'padding:0 4px;min-width:20px;';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => { ctgMoveTarget(node.id, entry.nodeId, -1); refreshInspector({ force: true }); });

      const downBtn = document.createElement('button');
      downBtn.type = 'button'; downBtn.textContent = '↓'; downBtn.className = 'mini-btn';
      downBtn.style.cssText = 'padding:0 4px;min-width:20px;';
      downBtn.disabled = idx === targets.length - 1;
      downBtn.addEventListener('click', () => { ctgMoveTarget(node.id, entry.nodeId, 1); refreshInspector({ force: true }); });

      // Remove
      const delBtn = document.createElement('button');
      delBtn.type = 'button'; delBtn.textContent = '✕'; delBtn.className = 'mini-btn';
      delBtn.style.cssText = 'padding:0 4px;min-width:20px;color:#e57373;';
      delBtn.title = 'Remove target';
      delBtn.addEventListener('click', () => { ctgRemoveTarget(node.id, entry.nodeId); refreshInspector({ force: true }); });

      row.appendChild(upBtn);
      row.appendChild(downBtn);
      row.appendChild(delBtn);
      listEl.appendChild(row);
    });
  }

  body.appendChild(listEl);

  // ── Status line ────────────────────────────────────────────────────────────
  const statusLine = document.createElement('div');
  statusLine.style.cssText = 'font-size:10px;color:#888;margin-top:6px;';
  const validCount = targets.filter(t => !!getNode(t.nodeId)).length;
  statusLine.textContent = `${validCount} of ${targets.length} target(s) valid`;
  body.appendChild(statusLine);

  sec.appendChild(body);
  container.appendChild(sec);
}

// ── CameraTargetGroup Runtime ──────────────────────────────────────────────────

/**
// ── CameraZone2D Inspector ─────────────────────────────────────────────────────

function buildCameraZoneInspector(node, container) {
  const sec = document.createElement('section');
  sec.className = 'inspector-section';

  const toggle = document.createElement('button');
  toggle.className = 'section-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Zone Settings';
  toggle.dataset.sectionName = 'Zone Settings';
  if (state.ui.inspectorCollapsed.has('Zone Settings')) sec.classList.add('collapsed');
  sec.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'section-body';

  const p = node.properties || {};
  const allNodes = getNodes();
  const boundsNodes = allNodes.filter(n => n && n.type === 'CameraBounds2D');
  const ctgNodes    = allNodes.filter(n => n && n.type === 'CameraTargetGroup');
  const pathNodes   = allNodes.filter(n => n && n.type === 'CameraPath2D');

  // ── Helper: make a labeled row ───────────────────────────────────────────
  function makeRow(labelText, inputEl, hint) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:120px 1fr;gap:6px;align-items:center;margin-bottom:5px;';
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:11px;color:var(--text-dim);';
    lbl.textContent = labelText;
    row.appendChild(lbl);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    wrap.appendChild(inputEl);
    if (hint) {
      const h = document.createElement('span');
      h.style.cssText = 'font-size:9px;color:#666;';
      h.textContent = hint;
      wrap.appendChild(h);
    }
    row.appendChild(wrap);
    return row;
  }

  // ── Helper: make a number input ──────────────────────────────────────────
  function makeNumberInput(field, value, min, max, step) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value ?? '');
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
    if (step != null) input.step = String(step);
    input.style.cssText = 'width:100%;box-sizing:border-box;';
    const baseline = { val: null };
    input.addEventListener('focus', () => { baseline.val = serializeScene(); });
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (isNaN(v)) return;
      const before = baseline.val || serializeScene();
      const n = getNode(node.id); if (!n) return;
      if (!n.properties) n.properties = {};
      n.properties[field] = v;
      _bumpSceneVersion();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
      pushHistory(`Edit Zone ${field}`, before);
    });
    return input;
  }

  // ── Helper: make a boolean checkbox ─────────────────────────────────────
  function makeBoolInput(field, value) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => {
      const before = serializeScene();
      const n = getNode(node.id); if (!n) return;
      if (!n.properties) n.properties = {};
      n.properties[field] = input.checked;
      _bumpSceneVersion();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
      pushHistory(`Toggle Zone ${field}`, before);
    });
    return input;
  }

  // ── Helper: make a select input ──────────────────────────────────────────
  function makeSelectInput(field, value, options) {
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;box-sizing:border-box;';
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      const before = serializeScene();
      const n = getNode(node.id); if (!n) return;
      if (!n.properties) n.properties = {};
      n.properties[field] = sel.value;
      _bumpSceneVersion();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
      pushHistory(`Set Zone ${field}`, before);
    });
    return sel;
  }

  // ── Helper: make a node-reference picker ────────────────────────────────
  function makeNodePicker(field, value, nodeList, emptyLabel) {
    const options = [{ value: '', label: emptyLabel }];
    nodeList.forEach(n => options.push({ value: n.id, label: n.name || n.id.slice(0, 8) }));
    // Also support names already saved as strings
    const sel = makeSelectInput(field, value, options);
    // If current value is a name (not an id), try to match
    if (value && !nodeList.find(n => n.id === value)) {
      const byName = nodeList.find(n => n.name === value);
      if (byName) sel.value = byName.id;
    }
    return sel;
  }

  // ── Zone mode & priority ─────────────────────────────────────────────────
  const modeDiv = document.createElement('div');
  modeDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);';

  const modeOpts = ['Normal','Room Lock','Zoom Zone','Cinematic','Boss Arena'].map(m => ({ value: m, label: m }));
  modeDiv.appendChild(makeRow('Mode', makeSelectInput('mode', p.mode || 'Normal', modeOpts)));
  modeDiv.appendChild(makeRow('Priority', makeNumberInput('priority', p.priority ?? 0, 0, 999, 1),
    'Higher = wins when zones overlap'));
  modeDiv.appendChild(makeRow('Blend Time', makeNumberInput('blendTime', p.blendTime ?? 0.5, 0, 10, 0.05), 'Seconds to blend in/out'));
  modeDiv.appendChild(makeRow('Enabled', makeBoolInput('enabled', p.enabled !== false)));
  body.appendChild(modeDiv);

  // ── Camera overrides ─────────────────────────────────────────────────────
  const ovHeader = document.createElement('div');
  ovHeader.style.cssText = 'font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;';
  ovHeader.textContent = 'Camera Overrides';
  body.appendChild(ovHeader);

  const ovDiv = document.createElement('div');
  ovDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);';
  ovDiv.appendChild(makeRow('Zoom', makeNumberInput('zoom', p.zoom ?? 1.0, 0.1, 10, 0.05)));
  ovDiv.appendChild(makeRow('Offset X', makeNumberInput('offsetX', p.offsetX ?? 0, null, null, 1)));
  ovDiv.appendChild(makeRow('Offset Y', makeNumberInput('offsetY', p.offsetY ?? 0, null, null, 1)));

  // followLerp can be null (inherit camera default)
  const lerpWrap = document.createElement('div');
  lerpWrap.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const lerpCheck = document.createElement('input'); lerpCheck.type = 'checkbox';
  lerpCheck.checked = p.followLerp != null;
  lerpCheck.title = 'Override follow lerp speed';
  const lerpInput = document.createElement('input');
  lerpInput.type = 'number'; lerpInput.min = '0'; lerpInput.max = '1'; lerpInput.step = '0.05';
  lerpInput.value = String(p.followLerp ?? 0.1);
  lerpInput.disabled = p.followLerp == null;
  lerpInput.style.cssText = 'flex:1;';
  lerpCheck.addEventListener('change', () => {
    const before = serializeScene();
    const n = getNode(node.id); if (!n) return;
    if (!n.properties) n.properties = {};
    n.properties.followLerp = lerpCheck.checked ? parseFloat(lerpInput.value) || 0.1 : null;
    lerpInput.disabled = !lerpCheck.checked;
    _bumpSceneVersion();
    scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
    pushHistory('Toggle Zone followLerp override', before);
  });
  lerpInput.addEventListener('change', () => {
    if (!lerpCheck.checked) return;
    const before = serializeScene();
    const n = getNode(node.id); if (!n) return;
    if (!n.properties) n.properties = {};
    n.properties.followLerp = parseFloat(lerpInput.value) || 0.1;
    _bumpSceneVersion();
    scheduleRender(RenderFlags.INSPECTOR);
    pushHistory('Edit Zone followLerp', before);
  });
  lerpWrap.appendChild(lerpCheck);
  lerpWrap.appendChild(lerpInput);
  ovDiv.appendChild(makeRow('Follow Lerp', lerpWrap, 'Check to override'));
  body.appendChild(ovDiv);

  // ── Node reference overrides ─────────────────────────────────────────────
  const refHeader = document.createElement('div');
  refHeader.style.cssText = 'font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;';
  refHeader.textContent = 'Node Overrides';
  body.appendChild(refHeader);

  const refDiv = document.createElement('div');
  refDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);';

  if (boundsNodes.length > 0) {
    refDiv.appendChild(makeRow('Bounds', makeNodePicker('boundsOverride', p.boundsOverride || '', boundsNodes, '— inherit —'),
      'CameraBounds2D to use inside this zone'));
  } else {
    const notice = document.createElement('div');
    notice.style.cssText = 'font-size:10px;color:#666;padding:2px 0;';
    notice.textContent = 'No CameraBounds2D nodes in scene.';
    refDiv.appendChild(notice);
  }

  if (ctgNodes.length > 0) {
    refDiv.appendChild(makeRow('Target Group', makeNodePicker('targetGroupOverride', p.targetGroupOverride || '', ctgNodes, '— inherit —'),
      'CameraTargetGroup to use inside this zone'));
  } else {
    const notice = document.createElement('div');
    notice.style.cssText = 'font-size:10px;color:#666;padding:2px 0;';
    notice.textContent = 'No CameraTargetGroup nodes in scene.';
    refDiv.appendChild(notice);
  }

  if (pathNodes.length > 0) {
    refDiv.appendChild(makeRow('Camera Path', makeNodePicker('pathOverride', p.pathOverride || '', pathNodes, '— none —'),
      'CameraPath2D to activate on zone enter'));
  } else {
    const notice = document.createElement('div');
    notice.style.cssText = 'font-size:10px;color:#666;padding:2px 0;';
    notice.textContent = 'No CameraPath2D nodes in scene.';
    refDiv.appendChild(notice);
  }

  body.appendChild(refDiv);

  // ── Deadzone override ─────────────────────────────────────────────────────
  const dzHeader = document.createElement('div');
  dzHeader.style.cssText = 'font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;';
  dzHeader.textContent = 'Deadzone Override';
  body.appendChild(dzHeader);

  const dzDiv = document.createElement('div');
  dzDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);';

  // Enable checkbox
  const dzWrap = document.createElement('div');
  dzWrap.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:2px;';
  const dzCheck = document.createElement('input'); dzCheck.type = 'checkbox';
  dzCheck.checked = p.deadzoneOverride != null;
  const dzCheckLbl = document.createElement('span');
  dzCheckLbl.style.cssText = 'font-size:11px;color:var(--text-dim);';
  dzCheckLbl.textContent = 'Enable Deadzone Override';
  dzWrap.appendChild(dzCheck); dzWrap.appendChild(dzCheckLbl);
  dzDiv.appendChild(dzWrap);

  const dzo  = p.deadzoneOverride || { w: 128, h: 64, ox: 0, oy: 0 };
  const dzFields = document.createElement('div');
  dzFields.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  dzFields.style.display = p.deadzoneOverride != null ? 'flex' : 'none';

  function makeDZInput(subfield, val) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = '1'; inp.value = String(val ?? 0);
    inp.style.cssText = 'width:100%;box-sizing:border-box;';
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value); if (isNaN(v)) return;
      const before = serializeScene();
      const nd = getNode(node.id); if (!nd) return;
      if (!nd.properties) nd.properties = {};
      if (!nd.properties.deadzoneOverride) nd.properties.deadzoneOverride = { w: 128, h: 64, ox: 0, oy: 0 };
      nd.properties.deadzoneOverride[subfield] = v;
      _bumpSceneVersion();
      scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
      pushHistory(`Edit Zone deadzoneOverride.${subfield}`, before);
    });
    return inp;
  }
  dzFields.appendChild(makeRow('DZ Width',   makeDZInput('w',  dzo.w),  'Deadzone box width'));
  dzFields.appendChild(makeRow('DZ Height',  makeDZInput('h',  dzo.h),  'Deadzone box height'));
  dzFields.appendChild(makeRow('DZ Offset X',makeDZInput('ox', dzo.ox)));
  dzFields.appendChild(makeRow('DZ Offset Y',makeDZInput('oy', dzo.oy)));
  dzDiv.appendChild(dzFields);

  dzCheck.addEventListener('change', () => {
    const before = serializeScene();
    const nd = getNode(node.id); if (!nd) return;
    if (!nd.properties) nd.properties = {};
    nd.properties.deadzoneOverride = dzCheck.checked
      ? { w: 128, h: 64, ox: 0, oy: 0 }
      : null;
    dzFields.style.display = dzCheck.checked ? 'flex' : 'none';
    _bumpSceneVersion();
    scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
    pushHistory('Toggle Zone deadzoneOverride', before);
  });
  body.appendChild(dzDiv);

  // ── Events & debug ───────────────────────────────────────────────────────
  const miscDiv = document.createElement('div');
  miscDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  miscDiv.appendChild(makeRow('Events', makeBoolInput('eventsEnabled', p.eventsEnabled !== false), 'Fire onEnter / onExit callbacks'));
  miscDiv.appendChild(makeRow('Show Debug', makeBoolInput('showDebug', p.showDebug !== false), 'Runtime overlay (editor only)'));
  miscDiv.appendChild(makeRow('Show Gizmo', makeBoolInput('showGizmo', p.showGizmo !== false)));
  body.appendChild(miscDiv);

  sec.appendChild(body);
  container.appendChild(sec);
}

/**
 * Compute the multi-target framing result for a CameraTargetGroup node.
 * Returns { centerX, centerY, zoom, targetCount, boundsW, boundsH, minX, maxX, minY, maxY }
 * or null if no valid targets.
 *
 * Uses viewport size from the camera node's properties if available,
 * otherwise falls back to 1280x720.
 */
function computeCTGFrame(groupNode, viewportW, viewportH, currentZoom) {
  if (!groupNode || groupNode.type !== 'CameraTargetGroup') return null;
  const p = groupNode.properties || {};
  const targets = Array.isArray(p.targets) ? p.targets : [];

  // Collect valid positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let validCount = 0;

  for (const entry of targets) {
    const t = getNode(entry.nodeId);
    if (!t || t.visible === false) continue;
    const tx = Number(t.transform?.x) || 0;
    const ty = Number(t.transform?.y) || 0;
    if (tx < minX) minX = tx;
    if (tx > maxX) maxX = tx;
    if (ty < minY) minY = ty;
    if (ty > maxY) maxY = ty;
    validCount++;
  }

  if (validCount === 0) return null;

  const padL = Number(p.paddingLeft)  || 64;
  const padR = Number(p.paddingRight) || 64;
  const padT = Number(p.paddingTop)   || 64;
  const padB = Number(p.paddingBottom)|| 64;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  let zoom = currentZoom;

  if (p.enableAutoZoom !== false) {
    const rawW = (maxX - minX) + padL + padR;
    const rawH = (maxY - minY) + padT + padB;
    const vw = viewportW || 1280;
    const vh = viewportH || 720;
    const zoomX = rawW > 0 ? vw / rawW : Infinity;
    const zoomY = rawH > 0 ? vh / rawH : Infinity;
    let targetZoom = Math.min(zoomX, zoomY);
    targetZoom = Math.max(Number(p.minZoom) || 0.5, Math.min(Number(p.maxZoom) || 3.0, targetZoom));
    zoom = targetZoom;
  }

  return {
    centerX, centerY, zoom, validCount,
    minX, maxX, minY, maxY,
    boundsW: maxX - minX, boundsH: maxY - minY
  };
}

/**
 * Clamp a position against all active CameraBounds2D nodes.
 */
function ctgClampToBounds(cx, cy, viewportW, viewportH, zoom) {
  const boundsArr = getNodes().filter(n => n && n.type === 'CameraBounds2D');
  if (!boundsArr.length) return { cx, cy };
  // Use the first bounds node for clamping
  const bn = boundsArr[0];
  const bx = Number(bn.transform?.x) || 0;
  const by = Number(bn.transform?.y) || 0;
  const bw = Number(bn.properties?.width) || 1024;
  const bh = Number(bn.properties?.height) || 768;
  const halfVW = (viewportW / zoom) / 2;
  const halfVH = (viewportH / zoom) / 2;
  const clampedX = Math.max(bx + halfVW, Math.min(bx + bw - halfVW, cx));
  const clampedY = Math.max(by + halfVH, Math.min(by + bh - halfVH, cy));
  return { cx: clampedX, cy: clampedY };
}

function addCameraPathPoint(nodeId, point = null) {
  const node = getNode(nodeId);

  if (!node || node.type !== 'CameraPath2D') return false;
  const before = serializeScene();
  const points = ensureCameraPathPoints(node);
  const last = points[points.length - 1] || { x: 0, y: 0 };
  const next = point || { x: (Number(last.x) || 0) + 64, y: (Number(last.y) || 0) + 64 };
  points.push({ x: Number(next.x) || 0, y: Number(next.y) || 0 });
  delete node.properties.waypoints;
  state.cameraPathEditor.selectedNodeId = node.id;
  state.cameraPathEditor.selectedPointIndices = new Set([points.length - 1]);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Add Camera Path Point', before);
  return true;
}

function deleteCameraPathPoint(nodeId, pointIndex) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || points.length <= 1 || pointIndex < 0 || pointIndex >= points.length) return false;
  const before = serializeScene();
  points.splice(pointIndex, 1);
  const nextIndex = Math.min(pointIndex, points.length - 1);
  state.cameraPathEditor.selectedNodeId = node.id;
  state.cameraPathEditor.selectedPointIndices = new Set([nextIndex]);
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Delete Camera Path Point', before);
  return true;
}

function deleteSelectedCameraPathPoints(nodeId) {
  const node = getNode(nodeId);
  const points = ensureCameraPathPoints(node);
  if (!node || !state.cameraPathEditor.selectedPointIndices.size) return false;
  const indices = Array.from(state.cameraPathEditor.selectedPointIndices).sort((a, b) => b - a);
  // Safety: never reduce below 1 point
  if (points.length - indices.length < 1) {
    // Keep at least 1 point: delete all but first
    const keepIndex = Math.min(...Array.from(state.cameraPathEditor.selectedPointIndices));
    const toDelete = indices.filter(i => i !== keepIndex);
    if (!toDelete.length) return false;
    const before = serializeScene();
    toDelete.forEach(i => points.splice(i, 1));
    state.cameraPathEditor.selectedPointIndices = new Set([0]);
    _bumpSceneVersion();
    scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
    pushHistory('Delete Camera Path Points', before);
    return true;
  }
  const before = serializeScene();
  indices.forEach(i => points.splice(i, 1));
  state.cameraPathEditor.selectedPointIndices = new Set();
  _bumpSceneVersion();
  scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
  pushHistory('Delete Camera Path Points', before);
  return true;
}


// ── CameraPath2D Preview Transport System ─────────────────────────────────────

/**
 * Internal: cancel any active preview RAF loop.
 */
function _cameraPathPreviewCancel() {
  const cpe = state.cameraPathEditor;
  if (cpe._previewRaf !== null) {
    cancelAnimationFrame(cpe._previewRaf);
    cpe._previewRaf = null;
  }
}

/**
 * Internal: one animation frame for preview playback.
 * Uses CameraPathRuntime if available, otherwise falls back to inline logic.
 */
function _cameraPathPreviewFrame(ts) {
  const cpe = state.cameraPathEditor;
  if (!cpe.previewPlaying || cpe.previewPaused) {
    cpe._previewRaf = null;
    return;
  }

  const node = getNode(cpe._previewNodeId);
  if (!node || node.type !== 'CameraPath2D') {
    cameraPathPreviewStop();
    return;
  }

  const dt = cpe._previewTs > 0 ? Math.max(0, Math.min(0.25, (ts - cpe._previewTs) / 1000)) : 0;
  cpe._previewTs = ts;

  // Build a temporary proxy node that respects the preview loop toggle
  const proxyNode = {
    properties: Object.assign({}, node.properties, {
      loop: cpe.previewLoop || node.properties?.loop === true
    }),
    transform: node.transform
  };

  // Use CameraPathRuntime evaluator (WYSIWYG)
  if (typeof CameraPathRuntime !== 'undefined') {
    if (!cpe._previewRuntime || cpe._previewRuntime._pathNode !== proxyNode) {
      // Create or recreate runtime; seek to current preview time
      cpe._previewRuntime = new CameraPathRuntime(proxyNode);
      cpe._previewRuntime.seek(cpe.previewTime);
    } else {
      // Keep proxy node reference current (loop flag may have changed)
      cpe._previewRuntime._pathNode = proxyNode;
    }
    const result = cpe._previewRuntime.update(dt);
    cpe.previewTime = cpe._previewRuntime._distance;
    cpe._previewMarker = { x: result.x, y: result.y };
    if (result.finished && !cpe.previewLoop && node.properties?.loop !== true) {
      cpe.previewPlaying = false;
      cpe._previewRaf = null;
      _cameraPathPreviewRedrawMarker();
      _cameraPathPreviewUpdateButtons();
      return;
    }
  } else {
    // Fallback: simple linear advance
    const props = node.properties || {};
    const pts = ensureCameraPathPoints(node);
    const tx = Number(node.transform?.x) || 0;
    const ty = Number(node.transform?.y) || 0;
    const worldPts = pts.map(p => ({ x: tx + p.x, y: ty + p.y }));
    let total = 0;
    for (let i = 0; i < worldPts.length - 1; i++) total += Math.hypot(worldPts[i+1].x - worldPts[i].x, worldPts[i+1].y - worldPts[i].y);
    const speed = Math.max(1, Number(props.speed) || 160);
    cpe.previewTime += speed * dt;
    const looping = cpe.previewLoop || props.loop === true;
    if (looping && total > 0) cpe.previewTime = ((cpe.previewTime % total) + total) % total;
    else if (cpe.previewTime >= total) { cpe.previewTime = total; cpe.previewPlaying = false; }
    // Simple lerp along points
    let rem = cpe.previewTime;
    let marker = worldPts[worldPts.length - 1] || { x: 0, y: 0 };
    for (let i = 0; i < worldPts.length - 1; i++) {
      const len = Math.hypot(worldPts[i+1].x - worldPts[i].x, worldPts[i+1].y - worldPts[i].y);
      if (rem <= len || i === worldPts.length - 2) {
        const t = len > 0 ? Math.max(0, Math.min(1, rem / len)) : 0;
        marker = { x: worldPts[i].x + (worldPts[i+1].x - worldPts[i].x) * t, y: worldPts[i].y + (worldPts[i+1].y - worldPts[i].y) * t };
        break;
      }
      rem -= len;
    }
    cpe._previewMarker = marker;
  }

  _cameraPathPreviewRedrawMarker();
  cpe._previewRaf = requestAnimationFrame(_cameraPathPreviewFrame);
}

/**
 * Force a Konva layer redraw so the preview marker overlay is visible.
 * The marker is rendered directly in buildCameraPathGroup via the RAF overlay.
 */
function _cameraPathPreviewRedrawMarker() {
  // Trigger a lightweight viewport redraw (no full scene rebuild)
  const layer = window._sceneLayer || null;
  if (layer && typeof layer.batchDraw === 'function') layer.batchDraw();
}

/**
 * Update toolbar button states after play/pause/stop changes.
 */
function _cameraPathPreviewUpdateButtons() {
  const cpe = state.cameraPathEditor;
  const playBtn  = document.getElementById('cp-transport-play');
  const pauseBtn = document.getElementById('cp-transport-pause');
  const stopBtn  = document.getElementById('cp-transport-stop');
  const loopBtn  = document.getElementById('cp-transport-loop');
  if (playBtn)  playBtn.disabled  = cpe.previewPlaying && !cpe.previewPaused;
  if (pauseBtn) {
    pauseBtn.disabled = !cpe.previewPlaying;
    pauseBtn.textContent = cpe.previewPaused ? '▶ Resume' : '⏸ Pause';
  }
  if (stopBtn)  stopBtn.disabled  = !cpe.previewPlaying && cpe.previewTime === 0;
  if (loopBtn)  loopBtn.classList.toggle('active', !!cpe.previewLoop);
}

/** Start or resume preview playback. */
function cameraPathPreviewPlay(nodeId) {
  const cpe = state.cameraPathEditor;
  const nid = nodeId || cpe._previewNodeId || cpe.selectedNodeId;
  const node = getNode(nid);
  if (!node || node.type !== 'CameraPath2D') return;

  // If paused, just un-pause
  if (cpe.previewPlaying && cpe.previewPaused) {
    cpe.previewPaused = false;
    cpe._previewTs = 0;
    if (cpe._previewRaf === null) cpe._previewRaf = requestAnimationFrame(_cameraPathPreviewFrame);
    _cameraPathPreviewUpdateButtons();
    return;
  }

  // Fresh play
  _cameraPathPreviewCancel();
  cpe._previewNodeId = nid;
  cpe.previewPlaying = true;
  cpe.previewPaused  = false;
  cpe.previewTime    = 0;
  cpe._previewTs     = 0;
  cpe._previewMarker = null;
  cpe._previewRuntime = null;
  cpe._previewRaf = requestAnimationFrame(_cameraPathPreviewFrame);
  _cameraPathPreviewUpdateButtons();
  setStatus('Preview playing…');
}

/** Pause preview playback. */
function cameraPathPreviewPause() {
  const cpe = state.cameraPathEditor;
  if (!cpe.previewPlaying) return;
  cpe.previewPaused = !cpe.previewPaused;
  if (!cpe.previewPaused) {
    cpe._previewTs = 0;
    if (cpe._previewRaf === null) cpe._previewRaf = requestAnimationFrame(_cameraPathPreviewFrame);
  }
  _cameraPathPreviewUpdateButtons();
}

/** Stop preview playback and reset to start. */
function cameraPathPreviewStop() {
  const cpe = state.cameraPathEditor;
  _cameraPathPreviewCancel();
  cpe.previewPlaying  = false;
  cpe.previewPaused   = false;
  cpe.previewTime     = 0;
  cpe._previewTs      = 0;
  cpe._previewMarker  = null;
  cpe._previewRuntime = null;
  _cameraPathPreviewRedrawMarker();
  _cameraPathPreviewUpdateButtons();
  setStatus('Preview stopped.');
}

/** Toggle loop for editor preview (independent of serialized loop property). */
function cameraPathPreviewToggleLoop() {
  const cpe = state.cameraPathEditor;
  cpe.previewLoop = !cpe.previewLoop;
  if (cpe._previewRuntime) cpe._previewRuntime = null; // recreate with new loop flag
  _cameraPathPreviewUpdateButtons();
}

function updateField(nodeId, field, rawValue, options = {}) {
  const node = getNode(nodeId); if (!node) return;
  let value = rawValue;
  const pivotPresetBeforeResize = (field.key === 'properties.width' || field.key === 'properties.height')
    ? getPivotPresetValue(node)
    : null;
  if (field.type === 'number' && Number.isNaN(value)) value = 0;
  if (field.type === 'number' && state.snapEnabled && ['transform.x', 'transform.y', 'properties.width', 'properties.height'].includes(field.key))
    value = snapValue(value);

  let baseline = null; let _vField = 0;
  if (!options.deferHistory) {
    const fb = state.history.fieldBaseline || {};
    baseline = fb[`${nodeId}:${field.key}`] || fb[`${nodeId}:__pivot__`] || serializeScene(); _vField = _getSceneVersion();
    delete fb[`${nodeId}:${field.key}`];
    delete fb[`${nodeId}:__pivot__`];
  }

  if (field.type === 'pivot_preset') {
    if (value === 'custom') {
      node.transform.pivotPreset = 'custom';
    } else {
      applyPivotPreset(node, value);
    }
  } else if (field.key === 'transform.pivotX') {
    applyPivotChange(node, value, Number(node.transform?.pivotY) || 0);
    node.transform.pivotPreset = 'custom';
  } else if (field.key === 'transform.pivotY') {
    applyPivotChange(node, Number(node.transform?.pivotX) || 0, value);
    node.transform.pivotPreset = 'custom';
  } else {
    const oldWidth  = (field.key === 'properties.width')  ? (Number(node.properties?.width)  || 1) : null;
    const oldHeight = (field.key === 'properties.height') ? (Number(node.properties?.height) || 1) : null;
    setValueByPath(node, field.key, value);
    if ((field.key === 'properties.width' || field.key === 'properties.height') && pivotPresetBeforeResize && pivotPresetBeforeResize !== 'custom') {
      applyPivotPreset(node, pivotPresetBeforeResize, { keepPivotWorldPosition: true });
    }
    // Scale colliders proportionally when the node's own dimensions change via the inspector.
    if (field.key === 'properties.width' && oldWidth !== null) {
      const newWidth = Math.max(1, Number(node.properties?.width) || 1);
      scaleNodeColliders(node, newWidth / oldWidth, 1);
    } else if (field.key === 'properties.height' && oldHeight !== null) {
      const newHeight = Math.max(1, Number(node.properties?.height) || 1);
      scaleNodeColliders(node, 1, newHeight / oldHeight);
    }
  }

  if (node.type === 'AnimatedSprite2D' && field.key === 'properties.animation') {
    const clip = getCurrentAnimationClip(node);
    if (clip) {
      state.spriteEditor.animationFrames  = Array.isArray(clip.frames) ? clip.frames.slice() : [];
      state.spriteEditor.previewFps       = Math.max(1, Number(clip.fps) || state.spriteEditor.previewFps || 8);
      state.spriteEditor.selectedFrameIndex = -1;
      node.properties.frame = 0;
      if (clip.frames?.length) node.properties.previewFrame = clip.frames[0];
      if (shouldAutoPlaySelectedAnimation(node) || state.spriteEditor.isPlaying) restartAnimationPreview(); else renderSFPreview();
      renderSpriteFramesPanel();
    }
  }
  if (node.type === 'AnimatedSprite2D' && field.key === 'properties.frame') {
    seekAnimationPreview(Number(value) || 0, { preserveSelection: false });
    renderSpriteFramesPanel();
  }
  if (node.type === 'AnimatedSprite2D' && field.key === 'properties.playing') {
    normalizeAnimatedSpriteFlags(node);
    if (node.properties.playing) restartAnimationPreview();
    else stopAnimationPreview({ resetToStart: false });
    renderSpriteFramesPanel();
  }
  if (node.type === 'AnimatedSprite2D' && field.key === 'properties.autoplay') {
    normalizeAnimatedSpriteFlags(node);
    if (shouldAutoPlaySelectedAnimation(node)) restartAnimationPreview();
    else stopAnimationPreview({ resetToStart: false });
    renderSpriteFramesPanel();
  }
  if (node.type === 'AnimatedSprite2D' && field.key === 'properties.spriteSheetId') {
    node.metadata = node.metadata || {}; node.metadata.spriteSheetId = value || '';
    if (value) state.selectedSheetId = value;
    renderSpriteFramesPanel();
  }
  if (node.type === 'TileMap' && field.key === 'properties.tilesetId') {
    const props = ensureTileMapData(node);
    const activeLayer = getActiveTileMapLayer(node);
    const nextTilesetId = String(value || '');
    props.tilesetId = nextTilesetId;
    if (activeLayer) activeLayer.tilesetId = nextTilesetId;
    state.selectedTilesetId = nextTilesetId || null;
    const assigned = getTileMapAssignedTileset(node, activeLayer);
    state.tilemapEditor.selectedTileIndex = assigned ? Math.max(0, Number(assigned.selectedTileIndex) || 0) : -1;
    syncTilesetsToSceneState();
    refreshSelectedTileMapTilesetUI(node);
    renderTileMapsPanel();
  }

  _bumpSceneVersion();

  // If a layout container property changed, immediately re-layout its children
  // and mark the UI Screens canvas dirty so the change is visible without needing
  // a drag event to trigger applyContainerLayout.
  const _LAYOUT_CONTAINER_TYPES = new Set(['HBoxContainer','VBoxContainer','MarginContainer','ScrollContainer']);
  const _LAYOUT_PROPS = new Set([
    'properties.alignment','properties.separation',
    'properties.paddingLeft','properties.paddingTop','properties.paddingRight','properties.paddingBottom',
    'properties.scrollOffsetX','properties.scrollOffsetY',
    'properties.width','properties.height'
  ]);
  const _ANCHOR_PROPS = new Set([
    'properties.anchorLeft','properties.anchorTop','properties.anchorRight','properties.anchorBottom',
    'properties.marginLeft','properties.marginTop','properties.marginRight','properties.marginBottom'
  ]);
  if (_LAYOUT_CONTAINER_TYPES.has(node.type) && _LAYOUT_PROPS.has(field.key)) {
    if (RGE_ROOT.RGEUIEditor?.applyContainerLayout) {
      RGE_ROOT.RGEUIEditor.applyContainerLayout();
      RGE_ROOT.RGEUIEditor.markDirty?.();
    }
  }
  // Anchor / margin fields: re-run anchor layout immediately so position and
  // size update as the user types, without needing a drag event.
  if (_ANCHOR_PROPS.has(field.key)) {
    if (RGE_ROOT.RGEUIEditor?.applyAnchorLayout) {
      RGE_ROOT.RGEUIEditor.applyAnchorLayout();
      RGE_ROOT.RGEUIEditor.markDirty?.();
    }
  }
  // Also re-layout when a child of a layout container changes width/height,
  // since HBox/VBox child sizes affect cursor advancement.
  if (!_LAYOUT_CONTAINER_TYPES.has(node.type) && node.parentId) {
    const _parent = getNode(node.parentId);
    if (_parent && _LAYOUT_CONTAINER_TYPES.has(_parent.type) &&
        (field.key === 'properties.width' || field.key === 'properties.height')) {
      if (RGE_ROOT.RGEUIEditor?.applyContainerLayout) {
        RGE_ROOT.RGEUIEditor.applyContainerLayout();
        RGE_ROOT.RGEUIEditor.markDirty?.();
      }
    }
  }

  // Use targeted scheduled renders to avoid redundant full rebuilds.
  // deferViewport/deferTree suppress heavy redraws during live typing;
  // they are committed on blur/change via commitDeferredHistory → refreshAll.
  const wantTree      = options.deferTree      !== true;
  const wantViewport  = options.deferViewport  !== true;
  const wantSummary   = options.deferViewport  !== true; // summary is cheap; skip alongside viewport
  const wantInspector = options.refreshInspector !== false;
  let flags = 0;
  if (wantTree)      flags |= RenderFlags.TREE;
  if (wantViewport)  flags |= RenderFlags.VIEWPORT;
  if (wantSummary)   flags |= RenderFlags.SCENE_SUMMARY;
  if (wantInspector) flags |= RenderFlags.INSPECTOR;
  if (flags) scheduleRender(flags);
  if (!options.deferHistory && baseline !== null && _sceneChanged(_vField)) pushHistory(`Change ${field.label}`, baseline);
}

// ══════════════════════════════════════════════════════════════════════
// VIEWPORT RENDERING
// ══════════════════════════════════════════════════════════════════════
// ── Lightweight inspector position patch (used during drag) ─────────────
// Writes updated X/Y values directly into the existing inspector input DOMs
// without rebuilding the panel, so drag feels instant.
function patchInspectorTransformInputs(nodeId) {
  if (!inspectorEl) return;
  const node = getNode(nodeId);
  if (!node) return;
  inspectorEl.querySelectorAll('input[data-field-key]').forEach((el) => {
    const key = el.dataset.fieldKey;
    if (key === 'transform.x') el.value = String(Number(node.transform?.x) || 0);
    else if (key === 'transform.y') el.value = String(Number(node.transform?.y) || 0);
  });
}

// ── Targeted AnimatedSprite2D frame patch ────────────────────────────
// Updates only the crop (and if needed, the display size) of an existing
// Konva.Image for the selected animated sprite node, avoiding a full
// renderViewport() teardown during playback.
// Falls back to renderViewport() when the shape isn't found or isn't an Image.
// Skips entirely while a transformer drag is in progress so the animation
// timer cannot corrupt the transformer's bounding box mid-drag.
function patchAnimatedSpriteFrameInViewport(node) {
  if (!node || !sceneLayer) return false;
  // Don't touch any Konva nodes while the transformer is actively scaling —
  // modifying child dimensions mid-drag corrupts the transformer's bounding box
  // and causes the resize handles to jump to wrong positions.
  if (state.transformerSession) return false;
  const shape = shapeRefs.get(node.id);
  if (!shape) return false;
  const sheet = getNodeAssignedSheet(node);
  const tileRect = getTileRect(sheet, Math.max(0, Number(node.properties.previewFrame) || 0));
  if (!sheet?.image?.complete || !tileRect) return false;
  // The Konva.Image is the first child of the Group built by buildSpriteGroup
  const imgNode = shape.findOne('Image');
  if (!imgNode) return false;
  imgNode.crop({ x: tileRect.x, y: tileRect.y, width: tileRect.width, height: tileRect.height });
  // Also sync display dimensions in case width/height was changed via inspector or resize button
  const w = Math.max(1, Number(node.properties.width) || 96);
  const h = Math.max(1, Number(node.properties.height) || 96);
  if (imgNode.width() !== w || imgNode.height() !== h) {
    imgNode.width(w);
    imgNode.height(h);
    // Also update the sibling stroke rect if it exists
    const strokeRect = shape.findOne('Rect');
    if (strokeRect) { strokeRect.width(w); strokeRect.height(h); }
    // Update the Group transform offset (pivot) in case it was recalculated
    shape.offsetX(Number(node.transform?.pivotX) || 0);
    shape.offsetY(Number(node.transform?.pivotY) || 0);
  }
  sceneLayer.batchDraw();
  return true;
}

// ── Tile-paint hover overlay (fast path) ─────────────────────────────────────
// Redraws only the hover/preview highlight cells on the dedicated tileHoverLayer,
// avoiding a full renderViewport() teardown on every pointermove event.
// Called by updateViewportTilePaint() instead of renderViewport().
// Falls back to renderViewport() when tileHoverLayer is unavailable.
function drawTileHoverOverlay(node) {
  if (!tileHoverLayer || !node) { renderViewport(); return; }
  const props = ensureTileMapData(node);
  const tw = Math.max(1, Number(props.tileWidth) || 32);
  const th = Math.max(1, Number(props.tileHeight) || 32);
  const mw = Math.max(1, Number(props.mapWidth)  || 10);
  const mh = Math.max(1, Number(props.mapHeight) || 8);

  const shape = shapeRefs.get(node.id);
  const cameraTransform = cameraGroup ? cameraGroup.getAbsoluteTransform() : null;

  tileHoverLayer.destroyChildren();

  const hoverCol = state.tilemapEditor.hoverCol;
  const hoverRow = state.tilemapEditor.hoverRow;
  if (hoverCol < 0 && hoverRow < 0) {
    tileHoverLayer.batchDraw();
    return;
  }

  // Get node's absolute position on stage to match sceneLayer camera transform
  let nodeAbsX = 0, nodeAbsY = 0, nodeScaleX = 1, nodeScaleY = 1;
  if (shape && cameraTransform) {
    const absPos = shape.getAbsolutePosition();
    nodeAbsX = absPos.x;
    nodeAbsY = absPos.y;
    const camScale = cameraGroup.scale() || { x: 1, y: 1 };
    nodeScaleX = (Number(node.transform?.scaleX) || 1) * camScale.x;
    nodeScaleY = (Number(node.transform?.scaleY) || 1) * camScale.y;
  }

  const previewBrush = getTileMapBrushInfo(node);
  const previewCellMap = getTileMapPreviewCellMap(node);
  const session = state.tilemapEditor.viewportPaint;
  const gsel = state.tilemapEditor.viewportGroupSelect;
  const activeLayerTileset = getTileMapAssignedTileset(node);
  const activeLayerSheet = activeLayerTileset ? getSheetById(activeLayerTileset.spriteSheetId) : null;
  const brushGroup = state.tilemapEditor.brushGroup;
  const groupHoverMap = (hoverCol >= 0 && hoverRow >= 0 && brushGroup?.length > 1)
    ? new Map(getBrushGroupCells(hoverCol, hoverRow, node).map((e) => [`${e.col},${e.row}`, e.tileIndex]))
    : null;

  // Cells to highlight: hover cell + preview cells + group cells
  const cellsToRender = new Set();
  if (hoverCol >= 0 && hoverRow >= 0) cellsToRender.add(`${hoverCol},${hoverRow}`);
  if (previewCellMap) previewCellMap.forEach((_, k) => cellsToRender.add(k));
  if (groupHoverMap) groupHoverMap.forEach((_, k) => cellsToRender.add(k));

  cellsToRender.forEach((key) => {
    const [c, r] = key.split(',').map(Number);
    if (c < 0 || r < 0 || c >= mw || r >= mh) return;
    const px = nodeAbsX + c * tw * nodeScaleX;
    const py = nodeAbsY + r * th * nodeScaleY;
    const pw = tw * nodeScaleX;
    const ph = th * nodeScaleY;
    const isHover = c === hoverCol && r === hoverRow;
    const isPreview = previewCellMap?.has(key) === true;
    const isGroup = groupHoverMap?.has(key) === true;

    if (previewBrush?.mode === 'tile' && (isHover || isPreview || isGroup)) {
      let previewTileIndex = previewBrush.tileIndex;
      if (groupHoverMap && isGroup) {
        previewTileIndex = groupHoverMap.get(key) ?? previewBrush.tileIndex;
      } else if (brushGroup && brushGroup.length > 1) {
        const entry = brushGroup.find((e) => (hoverCol + e.dcol) === c && (hoverRow + e.drow) === r);
        if (entry) previewTileIndex = entry.tileIndex; else previewTileIndex = -2;
      }
      if (previewTileIndex >= 0 && activeLayerSheet?.image && previewBrush.tileset) {
        const previewRect = getTilesetTileRect(previewBrush.tileset, previewTileIndex);
        if (previewRect) {
          tileHoverLayer.add(new Konva.Image({
            image: activeLayerSheet.image,
            x: px, y: py, width: pw, height: ph,
            crop: { x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height },
            opacity: 0.55, listening: false
          }));
        }
      } else if (previewTileIndex !== -2) {
        tileHoverLayer.add(new Konva.Rect({ x: px + 1, y: py + 1, width: Math.max(1, pw - 2), height: Math.max(1, ph - 2), fill: 'rgba(224,106,106,0.2)', listening: false }));
      }
    } else if (previewBrush?.mode === 'terrain' && (isHover || isPreview || isGroup)) {
      tileHoverLayer.add(new Konva.Rect({ x: px + 2, y: py + 2, width: Math.max(1, pw - 4), height: Math.max(1, ph - 4), fill: 'rgba(122,111,240,0.26)', listening: false }));
    } else if (previewBrush?.mode === 'collision' && (isHover || isPreview || isGroup)) {
      tileHoverLayer.add(new Konva.Rect({ x: px + 2, y: py + 2, width: Math.max(1, pw - 4), height: Math.max(1, ph - 4), stroke: '#e06a6a', strokeWidth: 2, dash: [4, 2], listening: false }));
    }
    // Highlight border (always shown for hover/preview/group cells)
    tileHoverLayer.add(new Konva.Rect({ x: px + 1, y: py + 1, width: Math.max(1, pw - 2), height: Math.max(1, ph - 2), stroke: '#b496ff', strokeWidth: 2, listening: false }));
  });

  tileHoverLayer.batchDraw();
}

// Clear the tile hover overlay (called when exiting tile-paint mode)
function clearTileHoverOverlay() {
  if (!tileHoverLayer) return;
  tileHoverLayer.destroyChildren();
  tileHoverLayer.batchDraw();
}

let _viewportRenderedThisFlush = false;

function invalidateViewportCache() {
  _viewportRenderedThisFlush = false;
}

// ── Camera overlay helpers ─────────────────────────────────────────────────
function _camOverlays() {
  const ov = state.cameraPreview?.overlays;
  return {
    showFrame:    ov?.showFrame    !== false,
    showDeadZone: ov?.showDeadZone !== false,
    showLookAhead:ov?.showLookAhead!== false,
    showBounds:   ov?.showBounds   !== false,
    showLabels:   ov?.showLabels   !== false,
    showZones:    ov?.showZones    !== false,
    showPaths:    ov?.showPaths    !== false,
    showTargetGroups: ov?.showTargetGroups !== false,
  };
}

// Sync camGizmoLayer transform to match cameraGroup so world-space coords align
function _syncGizmoLayerTransform() {
  if (!camGizmoLayer || !cameraGroup) return;
  camGizmoLayer.position(cameraGroup.position());
  camGizmoLayer.scale(cameraGroup.scale());
}

// Rebuild the interactive gizmo handles on camGizmoLayer (called after renderViewport)
function _rebuildCamGizmos() {
  if (!camGizmoLayer) return;
  camGizmoLayer.destroyChildren();
  _syncGizmoLayerTransform();

  const ov = _camOverlays();
  const allNodes = state.sceneState?.nodes || [];
  const cameras  = allNodes.filter(n => n && n.type === 'Camera2D');
  const boundsNodes = allNodes.filter(n => n && n.type === 'CameraBounds2D');
  const s = Math.max(0.2, Number(state.viewport.scale) || 1);

  const selCamId = state.cameraPreview?.selectedCameraId
    || cameras.find(c => c.properties?.current)?.id
    || cameras[0]?.id || null;

  if (ov.showDeadZone && selCamId) {
    const cam = cameras.find(c => c.id === selCamId);
    if (cam) {
      const x   = Number(cam.transform?.x)            || 0;
      const y   = Number(cam.transform?.y)            || 0;
      const w   = Number(cam.properties?.width)       || 320;
      const h   = Number(cam.properties?.height)      || 180;
      const dzw = Number(cam.properties?.deadzoneWidth)  || 0;
      const dzh = Number(cam.properties?.deadzoneHeight) || 0;
      const dox = Number(cam.properties?.deadzoneOffsetX)|| 0;
      const doy = Number(cam.properties?.deadzoneOffsetY)|| 0;
      if (dzw > 0 && dzh > 0) {
        const dzx = x + (w - dzw)/2 + dox;
        const dzy = y + (h - dzh)/2 + doy;
        camGizmoLayer.add(_makeGizmoBodyRect(dzx, dzy, dzw, dzh, 'deadzone', cam.id, 'body', s));
        [
          {tag:'n', cur:'ns-resize',   px:dzx+dzw/2, py:dzy       },
          {tag:'s', cur:'ns-resize',   px:dzx+dzw/2, py:dzy+dzh   },
          {tag:'w', cur:'ew-resize',   px:dzx,        py:dzy+dzh/2 },
          {tag:'e', cur:'ew-resize',   px:dzx+dzw,    py:dzy+dzh/2 },
          {tag:'nw',cur:'nwse-resize', px:dzx,        py:dzy       },
          {tag:'ne',cur:'nesw-resize', px:dzx+dzw,    py:dzy       },
          {tag:'sw',cur:'nesw-resize', px:dzx,        py:dzy+dzh   },
          {tag:'se',cur:'nwse-resize', px:dzx+dzw,    py:dzy+dzh   },
        ].forEach(p => camGizmoLayer.add(_makeGizmoHandle(p.px, p.py, 'deadzone', cam.id, p.tag, p.cur, s)));
      }
    }
  }

  if (ov.showBounds) {
    boundsNodes.forEach(b => {
      const bx = Number(b.transform?.x)       || 0;
      const by = Number(b.transform?.y)       || 0;
      const bw = Number(b.properties?.width)  || 1024;
      const bh = Number(b.properties?.height) || 768;
      camGizmoLayer.add(_makeGizmoBodyRect(bx, by, bw, bh, 'bounds_node', b.id, 'body', s));
      [
        {tag:'n', cur:'ns-resize',   px:bx+bw/2, py:by      },
        {tag:'s', cur:'ns-resize',   px:bx+bw/2, py:by+bh   },
        {tag:'w', cur:'ew-resize',   px:bx,       py:by+bh/2 },
        {tag:'e', cur:'ew-resize',   px:bx+bw,    py:by+bh/2 },
        {tag:'nw',cur:'nwse-resize', px:bx,       py:by      },
        {tag:'ne',cur:'nesw-resize', px:bx+bw,    py:by      },
        {tag:'sw',cur:'nesw-resize', px:bx,       py:by+bh   },
        {tag:'se',cur:'nwse-resize', px:bx+bw,    py:by+bh   },
      ].forEach(p => camGizmoLayer.add(_makeGizmoHandle(p.px, p.py, 'bounds_node', b.id, p.tag, p.cur, s)));
    });
  }

  // Zone gizmo handles
  if (ov.showZones) {
    const zoneNodes = (state.sceneState?.nodes||[]).filter(n => n && n.type === 'CameraZone2D');
    zoneNodes.forEach(z => {
      const zx = Number(z.transform?.x)       || 0;
      const zy = Number(z.transform?.y)       || 0;
      const zw = Number(z.properties?.width)  || 512;
      const zh = Number(z.properties?.height) || 288;
      camGizmoLayer.add(_makeGizmoBodyRect(zx, zy, zw, zh, 'zone_node', z.id, 'body', s));
      [
        {tag:'n', cur:'ns-resize',   px:zx+zw/2, py:zy      },
        {tag:'s', cur:'ns-resize',   px:zx+zw/2, py:zy+zh   },
        {tag:'w', cur:'ew-resize',   px:zx,       py:zy+zh/2 },
        {tag:'e', cur:'ew-resize',   px:zx+zw,    py:zy+zh/2 },
        {tag:'nw',cur:'nwse-resize', px:zx,       py:zy      },
        {tag:'ne',cur:'nesw-resize', px:zx+zw,    py:zy      },
        {tag:'sw',cur:'nesw-resize', px:zx,       py:zy+zh   },
        {tag:'se',cur:'nwse-resize', px:zx+zw,    py:zy+zh   },
      ].forEach(p => camGizmoLayer.add(_makeGizmoHandle(p.px, p.py, 'zone_node', z.id, p.tag, p.cur, s)));
    });
  }

  camGizmoLayer.batchDraw();
}

function _makeGizmoHandle(wx, wy, type, nodeId, handle, cursor, s) {
  const sz = Math.max(6, 8/s);
  const r = new Konva.Rect({
    x: wx - sz/2, y: wy - sz/2, width: sz, height: sz,
    fill: '#ffffff', stroke: '#00d4ff', strokeWidth: 1/s,
    cornerRadius: 1/s, listening: true, hitStrokeWidth: Math.max(8, 14/s),
  });
  r.on('mouseenter touchstart', () => { stage.container().style.cursor = cursor; });
  r.on('mouseleave touchend',   () => { stage.container().style.cursor = ''; });
  r.on('pointerdown', e => { e.cancelBubble = true; _startGizmoDrag(type, nodeId, handle); });
  return r;
}

function _makeGizmoBodyRect(wx, wy, ww, wh, type, nodeId, handle, s) {
  const r = new Konva.Rect({ x:wx, y:wy, width:ww, height:wh,
    fill:'rgba(0,0,0,0)', listening:true, hitStrokeWidth:0 });
  r.on('mouseenter', () => { stage.container().style.cursor = 'move'; });
  r.on('mouseleave', () => { stage.container().style.cursor = ''; });
  r.on('pointerdown', e => { e.cancelBubble = true; _startGizmoDrag(type, nodeId, handle); });
  return r;
}

// Screen (stage-container-relative) → world coordinates
function _screenToWorld(screenX, screenY) {
  return {
    x: (screenX - state.viewport.x) / state.viewport.scale,
    y: (screenY - state.viewport.y) / state.viewport.scale,
  };
}

function _startGizmoDrag(type, nodeId, handle) {
  const pos = stage.getPointerPosition();
  if (!pos) return;
  const node = getNode(nodeId);
  if (!node) return;
  const g = state.cameraPreview.gizmo;
  g.active     = true;
  g.type       = type;
  g.handle     = handle;
  g.nodeId     = nodeId;
  g.startWorld = _screenToWorld(pos.x, pos.y);
  g.startProps = (type === 'deadzone') ? {
    dzw: Number(node.properties?.deadzoneWidth)   || 0,
    dzh: Number(node.properties?.deadzoneHeight)  || 0,
    dox: Number(node.properties?.deadzoneOffsetX) || 0,
    doy: Number(node.properties?.deadzoneOffsetY) || 0,
  } : {
    x: Number(node.transform?.x)       || 0,
    y: Number(node.transform?.y)       || 0,
    w: Number(node.properties?.width)  || 1024,
    h: Number(node.properties?.height) || 768,
  };
  g._historyBaseline = serializeScene();
  g._historyVersion  = _getSceneVersion();
}

function _updateCamGizmoDrag(screenX, screenY) {
  const g = state.cameraPreview.gizmo;
  if (!g.active) return false;
  const node = getNode(g.nodeId);
  if (!node) { g.active = false; return false; }

  const cur = _screenToWorld(screenX, screenY);
  const dx  = cur.x - g.startWorld.x;
  const dy  = cur.y - g.startWorld.y;
  if (!node.properties) node.properties = {};

  if (g.type === 'deadzone') {
    const { dzw: odzw, dzh: odzh, dox: odox, doy: odoy } = g.startProps;
    const camW = Number(node.properties?.width)  || 320;
    const camH = Number(node.properties?.height) || 180;
    const hnd  = g.handle;
    let dzw = odzw, dzh = odzh, dox = odox, doy = odoy;
    if (hnd === 'body') {
      dox = Math.max(-(camW/2-4), Math.min(camW/2-4, dox+dx));
      doy = Math.max(-(camH/2-4), Math.min(camH/2-4, doy+dy));
    }
    if (hnd==='e'||hnd==='ne'||hnd==='se') dzw = Math.max(8, dzw+dx*2);
    if (hnd==='w'||hnd==='nw'||hnd==='sw') dzw = Math.max(8, dzw-dx*2);
    if (hnd==='s'||hnd==='se'||hnd==='sw') dzh = Math.max(8, dzh+dy*2);
    if (hnd==='n'||hnd==='ne'||hnd==='nw') dzh = Math.max(8, dzh-dy*2);
    dzw = Math.min(dzw, camW-4);
    dzh = Math.min(dzh, camH-4);
    node.properties.deadzoneWidth   = Math.round(dzw);
    node.properties.deadzoneHeight  = Math.round(dzh);
    node.properties.deadzoneOffsetX = Math.round(dox);
    node.properties.deadzoneOffsetY = Math.round(doy);
  } else {
    const { x: ox, y: oy, w: ow, h: oh } = g.startProps;
    let x = ox, y = oy, w = ow, h = oh;
    const hnd = g.handle;
    if (hnd==='body') { x+=dx; y+=dy; }
    if (hnd==='e'||hnd==='ne'||hnd==='se') w  = Math.max(32, w+dx);
    if (hnd==='w'||hnd==='nw'||hnd==='sw') { x+=dx; w  = Math.max(32, w-dx); }
    if (hnd==='s'||hnd==='se'||hnd==='sw') h  = Math.max(32, h+dy);
    if (hnd==='n'||hnd==='ne'||hnd==='nw') { y+=dy; h  = Math.max(32, h-dy); }
    node.transform.x       = Math.round(x);
    node.transform.y       = Math.round(y);
    node.properties.width  = Math.round(w);
    node.properties.height = Math.round(h);
  }
  scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
  return true;
}

function _endCamGizmoDrag() {
  const g = state.cameraPreview.gizmo;
  if (!g.active) return;
  if (_getSceneVersion() !== g._historyVersion)
    pushHistory(g.type==='deadzone' ? 'Edit Dead Zone' : g.type==='zone_node' ? 'Edit Camera Zone' : 'Edit Camera Bounds', g._historyBaseline);
  g.active=false; g.type=null; g.handle=null; g.nodeId=null; g.startWorld=null; g.startProps=null;
  scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
}

function drawCameraPreviewOverlays() {
  if (!gridGroup) return;
  const s        = Math.max(0.2, Number(state.viewport.scale) || 1);
  const ov       = _camOverlays();
  const allNodes = state.sceneState?.nodes || [];
  const cameras  = allNodes.filter(n => n && n.type === 'Camera2D');
  const bNodes   = allNodes.filter(n => n && n.type === 'CameraBounds2D');

  const selCamId = state.cameraPreview?.selectedCameraId
    || cameras.find(c => c.properties?.current)?.id
    || cameras[0]?.id || null;

  cameras.forEach(cam => {
    const isSelected = cam.id === selCamId;
    const x = Number(cam.transform?.x) || 0;
    const y = Number(cam.transform?.y) || 0;
    const w = Number(cam.properties?.width)  || 320;
    const h = Number(cam.properties?.height) || 180;

    // ── Camera frame ───────────────────────────────────────────────────
    if (ov.showFrame) {
      const frameColor = isSelected ? '#00d4ff' : '#607d8b';
      gridGroup.add(new Konva.Rect({
        x, y, width: w, height: h,
        stroke: frameColor, strokeWidth: isSelected ? 2/s : 1/s,
        dash: isSelected ? [8/s,4/s] : [5/s,3/s], listening: false,
      }));
      if (ov.showLabels) {
        gridGroup.add(new Konva.Text({
          x: x+4/s, y: y+4/s,
          text: `${cam.name||'Camera'}  ${w} × ${h}${isSelected?'':' (inactive)'}`,
          fontSize: 12/s, fill: frameColor, listening: false,
        }));
      }
    }

    if (!isSelected) return;

    // ── Dead zone (visual only — interactive handles in camGizmoLayer) ──
    if (ov.showDeadZone) {
      const dzw = Number(cam.properties?.deadzoneWidth)   || 0;
      const dzh = Number(cam.properties?.deadzoneHeight)  || 0;
      const dox = Number(cam.properties?.deadzoneOffsetX) || 0;
      const doy = Number(cam.properties?.deadzoneOffsetY) || 0;
      if (dzw > 0 && dzh > 0) {
        const dzx = x + (w-dzw)/2 + dox;
        const dzy = y + (h-dzh)/2 + doy;
        const dragging = state.cameraPreview.gizmo.active &&
          state.cameraPreview.gizmo.type === 'deadzone' &&
          state.cameraPreview.gizmo.nodeId === cam.id;
        gridGroup.add(new Konva.Rect({
          x: dzx, y: dzy, width: dzw, height: dzh,
          fill: 'rgba(255,179,0,0.08)', stroke: dragging ? '#ffd740' : '#ffb300',
          strokeWidth: (dragging ? 2.5 : 2)/s, dash:[4/s,4/s], listening:false,
        }));
        if (ov.showLabels) {
          gridGroup.add(new Konva.Text({
            x: dzx+3/s, y: dzy+3/s,
            text: `Dead Zone  ${Math.round(dzw)} × ${Math.round(dzh)}`,
            fontSize: 10/s, fill: '#ffb300', listening: false,
          }));
        }
      }
    }

    // ── Look ahead ─────────────────────────────────────────────────────
    if (ov.showLookAhead) {
      const lax = Number(cam.properties?.lookAheadX) || 0;
      const lay = Number(cam.properties?.lookAheadY) || 0;
      const cx = x + w/2, cy = y + h/2;
      if (lax !== 0 || lay !== 0) {
        gridGroup.add(new Konva.Arrow({
          points:[cx,cy,cx+lax,cy+lay], stroke:'#ff4081', fill:'#ff4081',
          pointerLength:10/s, pointerWidth:8/s, strokeWidth:2/s, listening:false,
        }));
        if (lax !== 0 && lay !== 0) {
          gridGroup.add(new Konva.Arrow({
            points:[cx,cy,cx+lax,cy], stroke:'rgba(255,64,129,0.4)', fill:'rgba(255,64,129,0.4)',
            pointerLength:6/s, pointerWidth:5/s, strokeWidth:1/s, dash:[4/s,3/s], listening:false,
          }));
          gridGroup.add(new Konva.Arrow({
            points:[cx,cy,cx,cy+lay], stroke:'rgba(255,64,129,0.4)', fill:'rgba(255,64,129,0.4)',
            pointerLength:6/s, pointerWidth:5/s, strokeWidth:1/s, dash:[4/s,3/s], listening:false,
          }));
        }
        if (ov.showLabels) {
          const lines = [];
          if (lax!==0) lines.push(`Look Ahead X: ${Math.round(lax)}`);
          if (lay!==0) lines.push(`Look Ahead Y: ${Math.round(lay)}`);
          gridGroup.add(new Konva.Text({
            x:cx+lax+6/s, y:cy+lay-8/s,
            text:lines.join('\n'), fontSize:10/s, fill:'#ff4081', listening:false,
          }));
        }
      }
    }
  });

  // ── Camera bounds (visual only — interactive handles in camGizmoLayer) ──
  if (ov.showBounds) {
    bNodes.forEach(b => {
      const bx = Number(b.transform?.x)       || 0;
      const by = Number(b.transform?.y)       || 0;
      const bw = Number(b.properties?.width)  || 1024;
      const bh = Number(b.properties?.height) || 768;
      const dragging = state.cameraPreview.gizmo.active &&
        state.cameraPreview.gizmo.type === 'bounds_node' &&
        state.cameraPreview.gizmo.nodeId === b.id;
      gridGroup.add(new Konva.Rect({
        x:bx, y:by, width:bw, height:bh,
        fill:'rgba(76,175,80,0.05)', stroke: dragging ? '#81c784' : '#4caf50',
        strokeWidth:(dragging?3.5:3)/s, dash:[12/s,6/s], listening:false,
      }));
      if (ov.showLabels) {
        gridGroup.add(new Konva.Text({
          x:bx+4/s, y:by+4/s,
          text:`Camera Bounds  ${Math.round(bw)} \xd7 ${Math.round(bh)}`,
          fontSize:12/s, fill:'#4caf50', listening:false,
        }));
      }
    });
  }



  // ── Camera zones ──────────────────────────────────────────────────────────
  if (ov.showZones) {
    const zoneNodes = allNodes.filter(n => n && n.type === 'CameraZone2D');
    const ZONE_COLORS = { Normal:'#4caf50', 'Room Lock':'#2196f3', 'Zoom Zone':'#ffeb3b', Cinematic:'#9c27b0', 'Boss Arena':'#f44336' };

    // Determine active zone by testing camera position against all enabled zones
    let activeZoneId = null;
    const previewCam = allNodes.find(n => n && n.type === 'Camera2D' &&
      (n.id === state.cameraPreview?.selectedCameraId || n.properties?.current));
    if (previewCam) {
      const ptx = Number(previewCam.transform?.x) || 0;
      const pty = Number(previewCam.transform?.y) || 0;
      let highestPri = -Infinity; let highestIdx = -1;
      zoneNodes.forEach((z, idx) => {
        if (z.properties?.enabled === false) return;
        const zx2 = Number(z.transform?.x) || 0, zy2 = Number(z.transform?.y) || 0;
        const zw2 = Number(z.properties?.width)||512, zh2 = Number(z.properties?.height)||288;
        if (ptx >= zx2 && ptx <= zx2+zw2 && pty >= zy2 && pty <= zy2+zh2) {
          const pri = Number(z.properties?.priority)||0;
          if (pri > highestPri || (pri === highestPri && idx < highestIdx)) {
            highestPri = pri; highestIdx = idx; activeZoneId = z.id;
          }
        }
      });
    }

    zoneNodes.forEach(z => {
      const zp = z.properties || {};
      const zx = Number(z.transform?.x) || 0;
      const zy = Number(z.transform?.y) || 0;
      const zw = Number(zp.width)  || 512;
      const zh = Number(zp.height) || 288;
      const mode  = zp.mode || 'Normal';
      const color = ZONE_COLORS[mode] || '#4caf50';
      const enabled = zp.enabled !== false;
      const isActive = z.id === activeZoneId;
      const dragging = state.cameraPreview.gizmo.active &&
        state.cameraPreview.gizmo.type === 'zone_node' &&
        state.cameraPreview.gizmo.nodeId === z.id;
      gridGroup.add(new Konva.Rect({
        x:zx, y:zy, width:zw, height:zh,
        fill: isActive ? hexWithAlpha(color, 0.14) : hexWithAlpha(color, enabled ? 0.07 : 0.03),
        stroke: dragging ? '#fff' : (isActive ? '#ffffff' : (enabled ? color : '#555')),
        strokeWidth: (dragging ? 2.5 : isActive ? 2.5 : 1.5)/s,
        dash: isActive ? [] : [6/s,4/s], listening:false,
      }));
      if (ov.showLabels) {
        const zoom = Number(zp.zoom) || 1;
        const pri  = Number(zp.priority) || 0;
        const labelParts = [`${z.name||mode}  Zoom ${zoom.toFixed(1)}  P${pri}`];
        if (!enabled) labelParts.push('(disabled)');
        if (isActive)  labelParts.push('▶ ACTIVE');
        if (zp.boundsOverride)      labelParts.push(`Bounds→${zp.boundsOverride}`);
        if (zp.targetGroupOverride) labelParts.push(`CTG→${zp.targetGroupOverride}`);
        if (zp.pathOverride)        labelParts.push(`Path→${zp.pathOverride}`);
        gridGroup.add(new Konva.Text({
          x:zx+4/s, y:zy+4/s,
          text: labelParts.join('\n'),
          fontSize:10/s, fill: isActive ? '#ffffff' : (enabled ? color : '#555'),
          lineHeight:1.4, listening:false,
        }));
      }
    });
  }

}


function renderViewport() {
  if (!sceneLayer || !cameraGroup || !gridGroup || !contentGroup || !uiContentGroup) return;
  // Already rendered in this flush pass — skip duplicate work
  if (_viewportRenderedThisFlush) return;
  _viewportRenderedThisFlush = true;
  // Reset for next flush pass via rAF (the scheduler fires a new rAF per flush)
  requestAnimationFrame(() => { _viewportRenderedThisFlush = false; });

  const ancestryIds = getSelectedAncestryIds();
  const selectedIds = getSelectionSet();
  shapeRefs.clear(); gridGroup.destroyChildren(); contentGroup.destroyChildren(); uiContentGroup.destroyChildren();
  // Also clear the tile-paint hover overlay whenever we rebuild the full scene.
  tileHoverLayer?.destroyChildren();
  drawViewportGuides();
  drawCameraPreviewOverlays();

  const renderBranch = (node, parentGroup, inheritedVisible) => {
    if (!node || isRootNodeId(node.id)) { getChildren(node?.id || getRootNodeId()).forEach((c) => renderBranch(c, parentGroup, inheritedVisible)); return; }
    const shape = buildKonvaForNode(node); if (!shape) return;
    const selfVisible = node.visible !== false;
    const tileMapPaintMode = isTileMapScenePaintModeActive();
    shape.id(node.id); shape.visible(inheritedVisible && selfVisible);
    const cameraPathHandleMode = state.tool === 'camera-path' && node.type === 'CameraPath2D';
    shape.draggable(node.type !== 'TileMap' && !tileMapPaintMode && state.tool !== 'pan' && !cameraPathHandleMode && node.locked !== true);
    if (ancestryIds.has(node.id)) addHierarchyOutline(shape, node, 'ancestor');
    if (selectedIds.has(node.id))  addHierarchyOutline(shape, node, 'selected');
    if (selectedIds.has(node.id) && shape instanceof Konva.Group && !node.type.startsWith('Camera')){
      const pivotMarker = new Konva.Group({ x: Number(node.transform?.pivotX) || 0, y: Number(node.transform?.pivotY) || 0, listening: false, name: 'pivot-marker' });
      pivotMarker.getSelfRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
      pivotMarker.add(new Konva.Circle({ radius: 5, fill: '#141620', stroke: '#ff0000', strokeWidth: 1.5 }));
      pivotMarker.add(new Konva.Line({ points: [-8, 0, 8, 0], stroke: '#ff0000', strokeWidth: 1.25 }));
      pivotMarker.add(new Konva.Line({ points: [0, -8, 0, 8], stroke: '#ff0000', strokeWidth: 1.25 }));
      shape.add(pivotMarker);
    }

    shape.on('mousedown touchstart', (e) => {
      if (node.type !== 'TileMap') return;
      const evt = e.evt || {};
      e.cancelBubble = true; // Always block stage-level handlers for TileMap
      beginViewportTilePaint(node, shape, evt);
    });
    shape.on('click', (e) => {
      if (state.viewport.isPanning) { e.cancelBubble = true; return; }
      if (node.type === 'TileMap' && (state.tilemapEditor.viewportPaint?.active || isTileMapScenePaintModeActive())) { e.cancelBubble = true; return; }
      e.cancelBubble = true;
      selectNode(node.id, { toggle: (e.evt && (e.evt.ctrlKey || e.evt.metaKey)) });
    });
    if (node.type === 'SceneInstance') {
      shape.on('dblclick dbltap', (e) => {
        e.cancelBubble = true;
        void openSourceSceneFromInstance(node.id);
      });
    }
    shape.on('dragstart', (e) => {
      if (node.type === 'TileMap' || isTileMapScenePaintModeActive()) { shape.stopDrag(); e.cancelBubble = true; return; }
      if (node.locked) { shape.stopDrag(); return; }
      if (!selectedIds.has(node.id)) selectNode(node.id);
      suppressStageClick = true;
      beginSelectionDrag(node.id);
    });
    shape.on('dragmove', () => {
      const n = getNode(node.id); if (!n) return;
      const dragRoot = isUiNodeType(n.type) ? uiContentGroup : contentGroup;
      const absPos = typeof shape.getAbsolutePosition === 'function' ? shape.getAbsolutePosition(dragRoot) : { x: shape.x(), y: shape.y() };
      setNodeLocalPositionFromGlobal(n, absPos, n.parentId || null);
      if (state.snapEnabled) {
        n.transform.x = snapValue(n.transform.x);
        n.transform.y = snapValue(n.transform.y);
        shape.position({ x: n.transform.x, y: n.transform.y });
      }
      updateSelectionDragFromNode(node.id);
      // During drag: skip the expensive full tree + inspector DOM rebuilds.
      // Just patch the X/Y inputs in the existing inspector DOM so the user
      // can see live coordinates, and update the status bar label.
      patchInspectorTransformInputs(node.id);
      updateSceneSummary();
      if (nodeSummaryEl) nodeSummaryEl.textContent = `${getSelectedNodeIds().length > 1 ? getSelectedNodeIds().length + ' nodes' : n.name + ' (' + n.type + ')'} selected`;
      if (transformer && getSelectedNodeIds().includes(node.id)) transformer.forceUpdate();
    });
    shape.on('dragend', () => {
      endSelectionDrag();
    });

    const targetParentGroup = isUiNodeType(node.type) ? (parentGroup === contentGroup ? uiContentGroup : parentGroup) : parentGroup;
    targetParentGroup.add(shape);
    shapeRefs.set(node.id, shape);
    getChildren(node.id).forEach((child) => renderBranch(child, shape, inheritedVisible && selfVisible));
  };

  renderBranch(getNode(getRootNodeId()), contentGroup, true);
  attachTransformer(); applyViewportTransform(); sceneLayer.draw();
  // Rebuild interactive camera gizmo handles on top layer
  requestAnimationFrame(_rebuildCamGizmos);
}

function drawViewportGuides() {
  const gs = GRID_SIZE;
  const s = Math.max(0.2, Number(state.viewport.scale) || 1);
  const ox = Number(state.viewport.x) || 0;
  const oy = Number(state.viewport.y) || 0;
  const wl = Math.floor((-ox / s) / gs) * gs - gs * 2;
  const wt = Math.floor((-oy / s) / gs) * gs - gs * 2;
  const wr = Math.ceil(((-ox + stage.width()) / s) / gs) * gs + gs * 2;
  const wb = Math.ceil(((-oy + stage.height()) / s) / gs) * gs + gs * 2;
  const sw = 1 / s;

  if (state.showGrid) {
    for (let x = wl; x <= wr; x += gs) {
      gridGroup.add(new Konva.Line({ points: [x, wt, x, wb], stroke: '#1e2433', strokeWidth: sw, listening: false }));
    }
    for (let y = wt; y <= wb; y += gs) {
      gridGroup.add(new Konva.Line({ points: [wl, y, wr, y], stroke: '#1e2433', strokeWidth: sw, listening: false }));
    }
  }

  const screenWidth = Math.max(1, Number(state.projectSettings?.screen?.width) || 1280);
  const screenHeight = Math.max(1, Number(state.projectSettings?.screen?.height) || 720);

  gridGroup.add(new Konva.Rect({
    x: 0,
    y: 0,
    width: screenWidth,
    height: screenHeight,
    stroke: '#9b59ff',
    strokeWidth: 2 / s,
    dash: [10 / s, 6 / s],
    listening: false
  }));

  gridGroup.add(new Konva.Line({
    points: [0, wt, 0, wb],
    stroke: '#ff4d4f',
    strokeWidth: 2 / s,
    listening: false
  }));

  gridGroup.add(new Konva.Line({
    points: [wl, 0, wr, 0],
    stroke: '#22c55e',
    strokeWidth: 2 / s,
    listening: false
  }));
}

function getKonvaNodeBaseAttrs(node) {
  return {
    x: Number(node.transform?.x) || 0,
    y: Number(node.transform?.y) || 0,
    rotation: Number(node.transform?.rotation) || 0,
    scaleX: Number(node.transform?.scaleX) || 1,
    scaleY: Number(node.transform?.scaleY) || 1,
    offsetX: Number(node.transform?.pivotX) || 0,
    offsetY: Number(node.transform?.pivotY) || 0,
    opacity: clampOpacity(node.properties?.opacity)
  };
}
function buildUiTextNode(text, width, height, color, fontSize, align = 'left', verticalAlign = 'middle') {
  return new Konva.Text({
    x: 8,
    y: 0,
    width: Math.max(1, width - 16),
    height: Math.max(1, height),
    text: text || '',
    fill: color || '#e7eef7',
    fontSize: Math.max(10, Number(fontSize) || 18),
    align,
    verticalAlign: verticalAlign === 'center' ? 'middle' : verticalAlign
  });
}

function buildUiNodeGroup(node) {
  const w = Math.max(1, Number(node.properties?.width) || 96);
  const h = Math.max(1, Number(node.properties?.height) || 48);
  const g = new Konva.Group({ ...getKonvaNodeBaseAttrs(node), draggable:false });
  const isFocused = getSelectionSet().has(node.id);
  if (node.type === 'CanvasLayer') {
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(139,92,246,0.04)', stroke: '#9b59ff', strokeWidth: 1.5, dash: [10, 6] }));
    g.add(new Konva.Text({ x: 8, y: 8, text: `${node.name} (CanvasLayer)`, fill: '#efe7ff', fontSize: 13 }));
    return g;
  }
  if (node.type === 'Control') {
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(89,105,129,0.12)', stroke: isFocused ? '#e5c97a' : '#7b8ca8', strokeWidth: 1.5, dash: [6, 4] }));
    g.add(new Konva.Text({ x: 8, y: 8, text: node.name || 'Control', fill: '#d5deea', fontSize: 12 }));
    return g;
  }
  if (node.type === 'HBoxContainer') {
    const sep = Math.max(0, Number(node.properties?.separation) || 4);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(64,160,110,0.07)', stroke: isFocused ? '#e5c97a' : '#40a06e', strokeWidth: 1.5, dash: [8, 4] }));
    g.add(new Konva.Text({ x: 6, y: 4, text: `${node.name} (HBox)`, fill: '#a0e0b8', fontSize: 11 }));
    // Draw child slot guides
    const children = getChildren(node.id);
    if (children.length > 1) {
      let cx = 0;
      children.forEach((child, i) => {
        const cw = Math.max(1, Number(child.properties?.width) || Math.floor((w - sep * (children.length - 1)) / children.length));
        if (i > 0) {
          g.add(new Konva.Line({ points: [cx, 0, cx, h], stroke: '#40a06e', strokeWidth: 1, dash: [3, 3], opacity: 0.5 }));
        }
        cx += cw + sep;
      });
    }
    return g;
  }
  if (node.type === 'VBoxContainer') {
    const sep = Math.max(0, Number(node.properties?.separation) || 4);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(90,140,220,0.07)', stroke: isFocused ? '#e5c97a' : '#5a8cdc', strokeWidth: 1.5, dash: [8, 4] }));
    g.add(new Konva.Text({ x: 6, y: 4, text: `${node.name} (VBox)`, fill: '#a8c8f8', fontSize: 11 }));
    const children = getChildren(node.id);
    if (children.length > 1) {
      let cy = 0;
      children.forEach((child, i) => {
        const ch = Math.max(1, Number(child.properties?.height) || Math.floor((h - sep * (children.length - 1)) / children.length));
        if (i > 0) {
          g.add(new Konva.Line({ points: [0, cy, w, cy], stroke: '#5a8cdc', strokeWidth: 1, dash: [3, 3], opacity: 0.5 }));
        }
        cy += ch + sep;
      });
    }
    return g;
  }
  if (node.type === 'MarginContainer') {
    const pL = Number(node.properties?.paddingLeft   ?? 8);
    const pT = Number(node.properties?.paddingTop    ?? 8);
    const pR = Number(node.properties?.paddingRight  ?? 8);
    const pB = Number(node.properties?.paddingBottom ?? 8);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(200,140,60,0.07)', stroke: isFocused ? '#e5c97a' : '#c8863c', strokeWidth: 1.5, dash: [8, 4] }));
    // Inner content area
    const iw = Math.max(2, w - pL - pR), ih = Math.max(2, h - pT - pB);
    if (iw > 2 && ih > 2) {
      g.add(new Konva.Rect({ x: pL, y: pT, width: iw, height: ih, fill: 'rgba(200,140,60,0.06)', stroke: '#c8863c', strokeWidth: 1, dash: [3, 3], opacity: 0.6 }));
    }
    g.add(new Konva.Text({ x: 6, y: 4, text: `${node.name} (Margin)`, fill: '#e8c080', fontSize: 11 }));
    return g;
  }
  if (node.type === 'ScrollContainer') {
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(180,80,180,0.07)', stroke: isFocused ? '#e5c97a' : '#b450b4', strokeWidth: 1.5, dash: [8, 4] }));
    // Scrollbar hint right
    g.add(new Konva.Rect({ x: w - 8, y: 0, width: 8, height: h, fill: 'rgba(180,80,180,0.15)', stroke: 'none' }));
    // Scrollbar hint bottom
    g.add(new Konva.Rect({ x: 0, y: h - 8, width: w - 8, height: 8, fill: 'rgba(180,80,180,0.15)', stroke: 'none' }));
    g.add(new Konva.Text({ x: 6, y: 4, text: `${node.name} (Scroll)`, fill: '#e0a0e0', fontSize: 11 }));
    return g;
  }
  if (node.type === 'Panel') {
    g.add(new Konva.Rect({ width: w, height: h, fill: node.properties?.color || '#263247', stroke: node.properties?.borderColor || '#5e7594', strokeWidth: Math.max(0, Number(node.properties?.borderWidth) || 2) }));
    return g;
  }
  if (node.type === 'Label') {
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(0,0,0,0.08)', stroke: '#7b8ca8', strokeWidth: 1 }));
    g.add(buildUiTextNode(node.properties?.text || node.name || 'Label', w, h, node.properties?.textColor || '#e7eef7', node.properties?.fontSize || 24, node.properties?.align || 'left', node.properties?.valign || 'center'));
    return g;
  }
  if (node.type === 'Button') {
    const fill = isFocused ? (node.properties?.focusedColor || '#5b8def') : (node.properties?.normalColor || '#375a7f');
    g.add(new Konva.Rect({ width: w, height: h, fill, stroke: isFocused ? '#f8de7e' : '#9fb7d7', strokeWidth: isFocused ? 2.5 : 1.5, cornerRadius: 8 }));
    g.add(new Konva.Text({ width: w, height: h, text: node.properties?.text || node.name || 'Button', fill: node.properties?.textColor || '#ffffff', fontSize: 20, align: 'center', verticalAlign: 'middle' }));
    return g;
  }
  if (node.type === 'CircleButton') {
    const fill = isFocused ? (node.properties?.focusedColor || '#5b8def') : (node.properties?.normalColor || '#375a7f');
    const rx = w / 2, ry = h / 2;
    g.add(new Konva.Ellipse({ x: rx, y: ry, radiusX: rx, radiusY: ry, fill, stroke: isFocused ? '#f8de7e' : '#9fb7d7', strokeWidth: isFocused ? 2.5 : 1.5 }));
    if (node.properties?.text) {
      g.add(new Konva.Text({ width: w, height: h, text: node.properties.text, fill: node.properties?.textColor || '#ffffff', fontSize: 18, align: 'center', verticalAlign: 'middle' }));
    }
    return g;
  }
  if (node.type === 'TriangleButton') {
    const fill = isFocused ? (node.properties?.focusedColor || '#5b8def') : (node.properties?.normalColor || '#375a7f');
    const stroke = isFocused ? '#f8de7e' : '#9fb7d7';
    g.add(new Konva.Line({ points: [w / 2, 0, w, h, 0, h], closed: true, fill, stroke, strokeWidth: isFocused ? 2.5 : 1.5 }));
    if (node.properties?.text) {
      g.add(new Konva.Text({ width: w, y: h * 0.45, height: h * 0.55, text: node.properties.text, fill: node.properties?.textColor || '#ffffff', fontSize: 16, align: 'center', verticalAlign: 'middle' }));
    }
    return g;
  }
  if (node.type === 'OvalButton') {
    const fill = isFocused ? (node.properties?.focusedColor || '#5b8def') : (node.properties?.normalColor || '#375a7f');
    const rx = w / 2, ry = h / 2;
    g.add(new Konva.Ellipse({ x: rx, y: ry, radiusX: rx, radiusY: ry, fill, stroke: isFocused ? '#f8de7e' : '#9fb7d7', strokeWidth: isFocused ? 2.5 : 1.5 }));
    g.add(new Konva.Text({ width: w, height: h, text: node.properties?.text || node.name || 'Button', fill: node.properties?.textColor || '#ffffff', fontSize: 18, align: 'center', verticalAlign: 'middle' }));
    return g;
  }
  if (node.type === 'TextureRect') {
    const img = state.imageCache.get(node.id);
    if (img && img.complete) {
      g.add(new Konva.Image({ image: img, width: w, height: h }));
      g.add(new Konva.Rect({ width: w, height: h, stroke: '#7dc4ff', strokeWidth: 1.25 }));
    } else if (node.properties?.imageDataUrl) {
      loadImageIntoCache(node.id, node.properties.imageDataUrl, renderViewport);
      g.add(fallbackBox(w, h, 'Loading…', '#7dc4ff'));
    } else {
      g.add(fallbackBox(w, h, 'TextureRect', '#7dc4ff'));
    }
    return g;
  }
  if (node.type === 'NineSlicePanel') {
    const img = state.imageCache.get(node.id);
    if (img && img.complete) {
      const sl = Number(node.properties?.sliceLeft ?? 16);
      const st = Number(node.properties?.sliceTop ?? 16);
      // Draw a simple visual hint — 9-slice borders
      g.add(new Konva.Image({ image: img, width: w, height: h }));
      g.add(new Konva.Line({ points: [sl, 0, sl, h], stroke: 'rgba(180,100,255,0.4)', strokeWidth: 1 }));
      g.add(new Konva.Line({ points: [w - Number(node.properties?.sliceRight ?? 16), 0, w - Number(node.properties?.sliceRight ?? 16), h], stroke: 'rgba(180,100,255,0.4)', strokeWidth: 1 }));
      g.add(new Konva.Line({ points: [0, st, w, st], stroke: 'rgba(180,100,255,0.4)', strokeWidth: 1 }));
      g.add(new Konva.Line({ points: [0, h - Number(node.properties?.sliceBottom ?? 16), w, h - Number(node.properties?.sliceBottom ?? 16)], stroke: 'rgba(180,100,255,0.4)', strokeWidth: 1 }));
      g.add(new Konva.Rect({ width: w, height: h, stroke: '#b464ff', strokeWidth: 1.5 }));
    } else if (node.properties?.imageDataUrl) {
      loadImageIntoCache(node.id, node.properties.imageDataUrl, renderViewport);
      g.add(fallbackBox(w, h, 'NineSlice…', '#b464ff'));
    } else {
      g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(100,50,150,0.12)', stroke: '#b464ff', strokeWidth: 1.5, dash: [8, 4] }));
      g.add(new Konva.Text({ x: 8, y: 8, text: node.name || 'NineSlicePanel', fill: '#d5b8ff', fontSize: 12 }));
    }
    return g;
  }
  if (node.type === 'MenuList') {
    const items = Array.isArray(node.properties?.items) ? node.properties.items : [];
    const itemH = Math.max(16, Number(node.properties?.itemHeight) || 48);
    const selIdx = Number(node.properties?.selectedIndex ?? 0);
    g.add(new Konva.Rect({ width: w, height: h, fill: node.properties?.normalColor || '#263247', stroke: '#5e7594', strokeWidth: 1.5 }));
    let maxVisible = Math.floor(h / itemH);
    for (let i = 0; i < Math.min(items.length, maxVisible); i++) {
      const iy = i * itemH;
      const isSelected = i === selIdx;
      if (isSelected) {
        g.add(new Konva.Rect({ x: 0, y: iy, width: w, height: itemH, fill: node.properties?.selectedColor || '#375a7f' }));
      }
      const label = typeof items[i] === 'string' ? items[i] : (items[i]?.label || `Item ${i + 1}`);
      g.add(new Konva.Text({ x: 10, y: iy + Math.max(4, (itemH - 20) / 2), text: label, fill: isSelected ? (node.properties?.selectedTextColor || '#ffffff') : (node.properties?.textColor || '#e7eef7'), fontSize: Math.min(20, Number(node.properties?.fontSize) || 20) }));
      if (i < Math.min(items.length, maxVisible) - 1) {
        g.add(new Konva.Line({ points: [0, iy + itemH, w, iy + itemH], stroke: 'rgba(94,117,148,0.5)', strokeWidth: 1 }));
      }
    }
    if (!items.length) {
      g.add(new Konva.Text({ x: 10, y: 10, text: node.name || 'MenuList (empty)', fill: '#7b8ca8', fontSize: 13 }));
    }
    return g;
  }
  if (node.type === 'ProgressBar') {
    const minV = Number(node.properties?.minValue ?? 0);
    const maxV = Number(node.properties?.maxValue ?? 1);
    const value = Number(node.properties?.value ?? 0.5);
    const fraction = maxV > minV ? Math.max(0, Math.min(1, (value - minV) / (maxV - minV))) : 0;
    g.add(new Konva.Rect({ width: w, height: h, fill: node.properties?.trackColor || '#1a2638', stroke: node.properties?.borderColor || '#5e7594', strokeWidth: Math.max(0, Number(node.properties?.borderWidth) ?? 1) }));
    if (fraction > 0) {
      g.add(new Konva.Rect({ width: Math.round(w * fraction), height: h, fill: node.properties?.fillColor || '#4a90d9' }));
    }
    if (node.properties?.showLabel) {
      g.add(new Konva.Text({ x: 0, y: 0, width: w, height: h, text: `${Math.round(fraction * 100)}%`, fill: node.properties?.labelColor || '#e7eef7', fontSize: Math.min(18, Number(node.properties?.fontSize) || 18), align: 'center', verticalAlign: 'middle' }));
    }
    return g;
  }
  return null;
}

// Render physicsShapes from Collider2DComponent onto a Konva group
function _addPhysicsShapesOverlay(g, node) {
  if (!Array.isArray(node.components)) return;
  const nw = Math.max(1, Number(node.properties?.width)  || 96);
  const nh = Math.max(1, Number(node.properties?.height) || 96);
  // Wrap all overlay shapes in a group whose getSelfRect returns zero so Konva.Transformer
  // ignores these decorative shapes when computing the resize-handle bounding box.
  const overlayGroup = new Konva.Group({ listening: false });
  overlayGroup.getSelfRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
  let hasOverlay = false;
  node.components.forEach((comp) => {
    if (!comp || comp.type !== 'Collider2DComponent' || comp.enabled === false) return;
    const physicsShapes = Array.isArray(comp.physicsShapes) ? comp.physicsShapes : [];
    const ox = Number(comp.offsetX) || 0;
    const oy = Number(comp.offsetY) || 0;
    const cw = Math.max(1, Number(comp.width)  || nw);
    const ch = Math.max(1, Number(comp.height) || nh);
    hasOverlay = true;
    if (!physicsShapes.length) {
      overlayGroup.add(new Konva.Rect({ x: ox, y: oy, width: cw, height: ch, stroke: '#6dbd79', strokeWidth: 1.5, dash: [5,3], listening: false }));
      return;
    }
    physicsShapes.forEach((s) => {
      if (s.type === 'rect') {
        overlayGroup.add(new Konva.Rect({
          x: ox + s.x * cw, y: oy + s.y * ch,
          width: Math.max(1, s.w * cw), height: Math.max(1, s.h * ch),
          fill: 'rgba(109,189,121,0.18)', stroke: '#6dbd79', strokeWidth: 1.5, listening: false
        }));
      } else if (s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 6) {
        const pts = [];
        for (let j = 0; j < s.points.length; j += 2) pts.push(ox + s.points[j] * cw, oy + s.points[j+1] * ch);
        overlayGroup.add(new Konva.Line({ points: pts, closed: true, fill: 'rgba(109,189,121,0.18)', stroke: '#6dbd79', strokeWidth: 1.5, listening: false }));
      }
    });
  });
  if (hasOverlay) g.add(overlayGroup);
}

function buildKonvaForNode(node) {
  const base = getKonvaNodeBaseAttrs(node);
  if (isUiNodeType(node.type)) return buildUiNodeGroup(node);
  if (node.type === 'Node2D' || node.type === 'SceneRoot') {
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: node.properties.width || 160, height: node.properties.height || 120, fill: hexWithAlpha(node.properties.tint || '#5e7594', 0.15), stroke: node.properties.tint || '#5e7594', strokeWidth: 1.5, dash: [8, 5] }));
    g.add(new Konva.Text({ x: 8, y: 8, text: node.name, fill: '#c8d6ea', fontSize: 14 }));
    _addPhysicsShapesOverlay(g, node);
    return g;
  }
  if (node.type === 'Sprite2D')            return buildSpriteGroup(node, false);
  if (node.type === 'AnimatedSprite2D')    return buildSpriteGroup(node, true);
  if (node.type === 'TileMap')             return buildTileMapGroup(node);
  if (node.type === 'SceneInstance')       return buildSceneInstanceGroup(node);
  if (node.type === 'Camera2D')            return buildCamera2DGroup(node);
  if (node.type === 'CameraZone2D')        return buildCameraZoneGroup(node);
  if (node.type === 'CameraBounds2D')      return buildCameraBoundsGroup(node);
  if (node.type === 'CameraTargetGroup')   return buildCameraTargetGroup(node);
  if (node.type === 'CameraPath2D')        return buildCameraPathGroup(node);
  return fallbackUnknownNode(node);
}


function buildCamera2DGroup(node){const g=new Konva.Group(getKonvaNodeBaseAttrs(node));const w=Math.max(1,Number(node.properties?.width)||320),h=Math.max(1,Number(node.properties?.height)||180);const hit=new Konva.Rect({x:0,y:0,width:w,height:h,fill:'rgba(0,0,0,0.001)',listening:true});hit.getSelfRect=()=>({x:0,y:0,width:w,height:h});g.add(hit);return g;}

// Zone mode → color mapping
const _ZONE_COLORS = {
  'Normal':     '#4caf50',
  'Room Lock':  '#2196f3',
  'Zoom Zone':  '#ffeb3b',
  'Cinematic':  '#9c27b0',
  'Boss Arena': '#f44336',
};

function buildCameraZoneGroup(node) {
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  const p = node.properties || {};
  const w = Math.max(1, Number(p.width) || 512);
  const h = Math.max(1, Number(p.height) || 288);
  const mode = p.mode || 'Normal';
  const color = _ZONE_COLORS[mode] || '#4caf50';
  const enabled = p.enabled !== false;
  const alpha = enabled ? 0.08 : 0.03;

  // Main zone rectangle
  g.add(new Konva.Rect({
    x: 0, y: 0, width: w, height: h,
    fill: hexWithAlpha(color, alpha),
    stroke: enabled ? color : '#666',
    strokeWidth: 1.5,
    dash: [8, 4],
    listening: false,
  }));

  // Build label lines
  const zoom = Number(p.zoom) || 1;
  const pri  = Number(p.priority) || 0;

  // Helper: resolve node id/name to display name
  function _resolveZoneRef(idOrName, type) {
    if (!idOrName) return null;
    const allNd = (state.sceneState?.nodes || []);
    const found = allNd.find(n => n && (!type || n.type === type) && (n.id === idOrName || n.name === idOrName));
    return found ? (found.name || idOrName) : idOrName;
  }

  const lines = [`${node.name || 'Zone'}  [${mode}]`];
  const infoLine = [];
  if (zoom !== 1)                                     infoLine.push(`Zoom ${zoom.toFixed(2)}`);
  if (pri !== 0)                                      infoLine.push(`P${pri}`);
  if (p.blendTime != null && Number(p.blendTime) > 0) infoLine.push(`Blend ${Number(p.blendTime).toFixed(2)}s`);
  if (infoLine.length) lines.push(infoLine.join('  '));
  if (!enabled) lines.push('(disabled)');

  // Override summary — show human-readable names
  const overrides = [];
  if (p.boundsOverride)      overrides.push(`Bounds: ${_resolveZoneRef(p.boundsOverride,      'CameraBounds2D')    || p.boundsOverride}`);
  if (p.targetGroupOverride) overrides.push(`CTG: ${  _resolveZoneRef(p.targetGroupOverride, 'CameraTargetGroup') || p.targetGroupOverride}`);
  if (p.pathOverride)        overrides.push(`Path: ${  _resolveZoneRef(p.pathOverride,        'CameraPath2D')      || p.pathOverride}`);
  if (p.followLerp != null)  overrides.push(`Lerp: ${Number(p.followLerp).toFixed(2)}`);
  if (p.deadzoneOverride)    overrides.push(`DZ: ${p.deadzoneOverride.w}×${p.deadzoneOverride.h}`);
  if (overrides.length) lines.push(overrides.join('  '));

  g.add(new Konva.Text({
    x: 6, y: 6,
    text: lines.join('\n'),
    fontSize: 11,
    fill: enabled ? color : '#666',
    lineHeight: 1.4,
    listening: false,
  }));

  // Priority badge (top-right corner)
  if (pri > 0) {
    const badge = `P${pri}`;
    const bw = badge.length * 7 + 6;
    g.add(new Konva.Rect({ x: w - bw - 4, y: 4, width: bw, height: 16, fill: hexWithAlpha(color, 0.25), cornerRadius: 3, listening: false }));
    g.add(new Konva.Text({ x: w - bw - 4, y: 5, width: bw, height: 16, text: badge, fontSize: 10, fill: color, align: 'center', listening: false }));
  }

  // Blend time indicator (bottom-left)
  if (p.blendTime != null && Number(p.blendTime) > 0) {
    g.add(new Konva.Text({ x: 6, y: h - 18, text: `Blend ${Number(p.blendTime).toFixed(2)}s`, fontSize: 10, fill: hexWithAlpha(color, 0.7), listening: false }));
  }

  return g;
}

function buildCameraBoundsGroup(node) {
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  const w = Math.max(1, Number(node.properties?.width) || 1024);
  const h = Math.max(1, Number(node.properties?.height) || 768);
  g.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: 'rgba(33,150,243,0.05)', stroke: '#2196f3', strokeWidth: 2, dash: [12, 6], listening: false }));
  g.add(new Konva.Text({ x: 6, y: 6, text: `${node.name || 'Camera Bounds'}  ${w} × ${h}`, fontSize: 12, fill: '#2196f3', listening: false }));
  return g;
}

function buildCameraTargetGroup(node) {
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));

  const p = node.properties || {};
  const targets = Array.isArray(p.targets) ? p.targets : [];
  const validTargets = targets.map(t => getNode(t.nodeId)).filter(Boolean);

  // Compute actual screen bounds of the group (fallback to 200x150)
  const gx = Number(node.transform?.x) || 0;
  const gy = Number(node.transform?.y) || 0;

  // Hit area (centered icon — 64×64)
  const ICON_SIZE = 64;
  const hitRect = new Konva.Rect({ x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE, fill: 'rgba(255,152,0,0.06)', listening: true });
  hitRect.getSelfRect = () => ({ x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE });
  g.add(hitRect);

  // Icon outline
  g.add(new Konva.Rect({ x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE, fill: 'rgba(255,152,0,0.08)', stroke: '#ff9800', strokeWidth: 2, dash: [6, 4], listening: false }));

  // Node label
  g.add(new Konva.Text({ x: 4, y: 4, text: node.name || 'TargetGroup', fontSize: 11, fill: '#ff9800', listening: false }));
  g.add(new Konva.Text({ x: 4, y: 46, text: `targets: ${validTargets.length}`, fontSize: 10, fill: '#ffb74d', listening: false }));

  const ov = (state.cameraPreview?.overlays || {});
  // Extended gizmos: show when overlay enabled AND (showDebug is true OR node is selected)
  const isSelected = state.selectedId === node.id;
  const showExtended = ov.showTargetGroups !== false && (p.showDebug !== false || isSelected);
  if (showExtended && validTargets.length > 0) {
    // ── Compute bounding box of targets ─────────────────────────────────────
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of validTargets) {
      const tx = Number(t.transform?.x) || 0;
      const ty = Number(t.transform?.y) || 0;
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
    }

    const padL = Number(p.paddingLeft) || 64;
    const padR = Number(p.paddingRight) || 64;
    const padT = Number(p.paddingTop) || 64;
    const padB = Number(p.paddingBottom) || 64;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Group bounding rect (world-space offset from node origin at gx,gy)
    const rectX = (minX - padL) - gx;
    const rectY = (minY - padT) - gy;
    const rectW = (maxX - minX) + padL + padR;
    const rectH = (maxY - minY) + padT + padB;

    // Inner (target area without padding)
    const innerX = minX - gx, innerY = minY - gy;
    const innerW = maxX - minX, innerH = maxY - minY;

    // Padding outline
    g.add(new Konva.Rect({ x: rectX, y: rectY, width: Math.max(1, rectW), height: Math.max(1, rectH), fill: 'rgba(255,152,0,0.04)', stroke: '#ff9800', strokeWidth: 1.5, dash: [10, 5], listening: false }));
    // Inner target bounds
    if (innerW > 0 || innerH > 0) {
      g.add(new Konva.Rect({ x: innerX, y: innerY, width: Math.max(1, innerW), height: Math.max(1, innerH), fill: 'transparent', stroke: '#ffcc02', strokeWidth: 1, dash: [4, 4], listening: false }));
    }

    // Center crosshair
    const cx = centerX - gx, cy = centerY - gy;
    const CH = 10;
    g.add(new Konva.Line({ points: [cx - CH, cy, cx + CH, cy], stroke: '#ff9800', strokeWidth: 1.5, listening: false }));
    g.add(new Konva.Line({ points: [cx, cy - CH, cx, cy + CH], stroke: '#ff9800', strokeWidth: 1.5, listening: false }));

    // Target markers
    for (const t of validTargets) {
      const tx = (Number(t.transform?.x) || 0) - gx;
      const ty = (Number(t.transform?.y) || 0) - gy;
      g.add(new Konva.Circle({ x: tx, y: ty, radius: 6, fill: '#ff9800', opacity: 0.8, listening: false }));
      g.add(new Konva.Text({ x: tx + 8, y: ty - 6, text: t.name || t.type, fontSize: 9, fill: '#ffb74d', listening: false }));
    }

    // Zoom info label
    const frame = computeCTGFrame(node, 1280, 720, Number(p.maxZoom) || 3.0);
    const zoomLabel = frame ? `Zoom: ${frame.zoom.toFixed(2)}x  Targets: ${frame.validCount}` : `Targets: ${validTargets.length}`;
    g.add(new Konva.Text({ x: cx - 50, y: cy + 16, text: zoomLabel, fontSize: 10, fill: '#ff9800', listening: false }));
  }

  return g;
}


function buildCameraPathGroup(node) {
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  const points = ensureCameraPathPoints(node);
  const screen = getTileMapScreenBounds();
  const xs = points.map(p => Number(p.x) || 0);
  const ys = points.map(p => Number(p.y) || 0);
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...xs) : screen.width;
  const maxY = ys.length ? Math.max(...ys) : screen.height;
  const w = Math.max(screen.width, (maxX - minX) + 64);
  const h = Math.max(screen.height, (maxY - minY) + 64);
  const editMode = isCameraPathEditMode() && state.selectedId === node.id;
  g.setAttr('cameraPathEditor', true);

  const refreshSegmentLines = () => {
  segmentLines.forEach((seg, i) => {
    const pts = ensureCameraPathPoints(node);

    if (i >= pts.length - 1 && !node.properties?.closedPath) return;

    const a = pts[i];
    const b = pts[(i + 1) % pts.length];

    seg.points([
      Number(a.x) || 0,
      Number(a.y) || 0,
      Number(b.x) || 0,
      Number(b.y) || 0
    ]);
  });
};

  const hitRect = new Konva.Rect({
    x:0,
    y:0,
    width:screen.width,
    height:screen.height,
    fill:'rgba(255, 123, 0, 0.02)',
    listening:false
  });

  hitRect.getSelfRect=()=>({x:0,y:0,width:screen.width,height:screen.height});
  g.add(hitRect);

  // Path line uses different colors for closed vs open; segment lines for hover
  const pathLine = new Konva.Line({ points: [], stroke:'#ff9800', strokeWidth: editMode ? 2.5 : 2, dash:[6,3], listening:false });
  const closeLine = new Konva.Line({ points: [], stroke:'#ff9800', strokeWidth:1.5, dash:[4,4], listening:false });
  // Invisible segment lines for hit detection (one per segment)
  const segmentLines = [];
  g.add(pathLine);
  g.add(closeLine);

  const label = new Konva.Text({ x: 6, y: 6, text: node.name || 'CameraPath2D', fontSize: 12, fill: '#ff9800', listening: false });
  g.add(label);

  const refreshPathVisuals = () => {
    const pts = ensureCameraPathPoints(node);
    pathLine.points(pts.length >= 2 ? pts.flatMap((point) => [Number(point.x) || 0, Number(point.y) || 0]) : []);
    if (node.properties?.closedPath && pts.length > 2) {
      const first = pts[0], last = pts[pts.length - 1];
      closeLine.points([Number(last.x) || 0, Number(last.y) || 0, Number(first.x) || 0, Number(first.y) || 0]);
    } else {
      closeLine.points([]);
    }
  };

  refreshPathVisuals();
  refreshSegmentLines();

  // Build invisible segment lines for segment double-click / right-click insertion
  if (editMode && points.length >= 2) {
    const segCount = node.properties?.closedPath ? points.length : points.length - 1;
    for (let si = 0; si < segCount; si++) {
      const a = points[si];
      const b = points[(si + 1) % points.length];
      const segLine = new Konva.Line({
        points: [Number(a.x)||0, Number(a.y)||0, Number(b.x)||0, Number(b.y)||0],
        stroke: 'transparent',
        strokeWidth: 16,
        listening: true,
        hitStrokeWidth: 16
      });
      segLine.setAttr('cameraPathSegment', si);
      segLine.on('dblclick dbltap', (e) => {
        if (!editMode || node.locked) return;
        e.cancelBubble = true;
        insertCameraPathPointAfter(node.id, si);
      });
      segLine.on('contextmenu', (e) => {
        if (!editMode) return;
        e.evt?.preventDefault?.();
        e.cancelBubble = true;
        insertCameraPathPointAfter(node.id, si);
      });
      segLine.on('mouseenter', () => {
        if (editMode) { segLine.stroke('rgba(255,152,0,0.35)'); g.getLayer()?.batchDraw(); }
      });
      segLine.on('mouseleave', () => {
        if (editMode) { segLine.stroke('transparent'); g.getLayer()?.batchDraw(); }
      });
      g.add(segLine);
      segmentLines.push(segLine);
    }
  }

  points.forEach((point, index) => {
    const isSelected = state.cameraPathEditor.selectedNodeId === node.id && state.cameraPathEditor.selectedPointIndices.has(index);
    const isStart = index === 0;
    const isEnd = index === points.length - 1;
    const handle = new Konva.Circle({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      radius: editMode ? (isSelected ? 8 : 5.5) : (isStart || isEnd ? 4.5 : 3.5),
      fill: isSelected ? '#fff3c4' : isStart ? '#4caf50' : isEnd ? '#f44336' : '#ff9800',
      stroke: isSelected ? '#ff9800' : '#ffffff',
      strokeWidth: isSelected ? 2.5 : 1,
      draggable: editMode && !node.locked,
      listening: editMode,
      opacity: editMode ? 1 : 0.75,
      name: 'camera-path-point',
      hitStrokeWidth: 24
    });
    handle.setAttr('cameraPathPointIndex', index);
    const pointLabel = new Konva.Text({
      x: (Number(point.x) || 0) + 7,
      y: (Number(point.y) || 0) - 9,
      text: isStart ? 'S' : isEnd ? 'E' : String(index + 1),
      fontSize: 10,
      fill: isStart ? '#4caf50' : isEnd ? '#f44336' : '#ff9800',
      listening: false
    });

    handle.on('mouseenter', () => { if (editMode) stage.container().style.cursor = 'move'; });
    handle.on('mouseleave', () => { if (editMode) stage.container().style.cursor = 'crosshair'; });
    handle.on('click tap', (e) => {
      if (!editMode) return;
      e.cancelBubble = true;
      selectCameraPathPoint(node.id, index, { ctrl: e.evt?.ctrlKey || e.evt?.metaKey, shift: e.evt?.shiftKey });
    });
    handle.on('contextmenu', (e) => {
      if (!editMode) return;
      e.evt?.preventDefault?.();
      e.cancelBubble = true;
      openCameraPathPointMenu(node.id, index, e.evt?.clientX || 0, e.evt?.clientY || 0);
    });
    handle.on('dragstart', (e) => {
      if (!editMode) return;
      e.cancelBubble = true;
      // Select the point in state WITHOUT triggering a full viewport rebuild
      // (a full rebuild via selectCameraPathPoint → scheduleRender(VIEWPORT) would
      // call contentGroup.destroyChildren() and destroy the handle mid-drag,
      // causing the "drags a little then stops" bug).
      state.cameraPathEditor.selectedNodeId = node.id;
      state.cameraPathEditor.selectedPointIndices = new Set([index]);
      scheduleRender(RenderFlags.INSPECTOR); // inspector only, no viewport
      state.cameraPathEditor.drag = {
        nodeId: node.id,
        pointIndex: index,
        snapshot: serializeScene(),
        version: _getSceneVersion()
      };
      suppressStageClick = true;
    });
    handle.on('dragmove', (e) => {
      if (!editMode) return;
      e.cancelBubble = true;
      const lx = handle.x();
      const ly = handle.y();
      setCameraPathPoint(node.id, index, lx, ly, { schedule: false });

      pointLabel.position({
        x: lx + 7,
        y: ly - 9
      });

      refreshPathVisuals();
      patchCameraPathPointInputs(node.id, index);

      g.getLayer()?.batchDraw();
    });
    handle.on('dragend', (e) => {
      if (!editMode) return;
      e.cancelBubble = true;
      const drag = state.cameraPathEditor.drag;
      state.cameraPathEditor.drag = null;
      scheduleRender(RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
      if (drag?.snapshot && _sceneChanged(drag.version || 0)) pushHistory('Move Camera Path Point', drag.snapshot);
    });

    g.add(handle);
    g.add(pointLabel);
  });

  g.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill:'rgba(255,152,0,0.05)', stroke: '#ffae00', strokeWidth: 1.5, dash: [8, 4], listening: false }));


  // ── Preview transport marker ─────────────────────────────────────────────
  // An animated camera icon that follows the runtime evaluator during playback.
  // It lives inside the group (group-local coords = world coords since g is
  // positioned at node transform origin, and points are already relative to it).
  const markerIcon = new Konva.Group({ x: 0, y: 0, listening: false, visible: false });
  // Camera body
  markerIcon.add(new Konva.Rect({ x: -10, y: -7, width: 20, height: 14, fill: '#00d4ff', cornerRadius: 2, opacity: 0.9, listening: false }));
  // Lens
  markerIcon.add(new Konva.Circle({ x: 0, y: 0, radius: 5, fill: '#003060', opacity: 0.9, listening: false }));
  markerIcon.add(new Konva.Circle({ x: 0, y: 0, radius: 3, fill: '#00d4ff', opacity: 0.7, listening: false }));
  // Viewfinder bump
  markerIcon.add(new Konva.Rect({ x: -3, y: -12, width: 6, height: 5, fill: '#00d4ff', cornerRadius: 1, opacity: 0.9, listening: false }));
  g.add(markerIcon);

  // Pulse ring
  const markerRing = new Konva.Circle({ x: 0, y: 0, radius: 14, stroke: '#00d4ff', strokeWidth: 1.5, fill: 'transparent', listening: false, visible: false, opacity: 0.5 });
  g.add(markerRing);

  // Progress label
  const markerLabel = new Konva.Text({ x: 14, y: -8, fontSize: 9, fill: '#00d4ff', listening: false, visible: false });
  g.add(markerLabel);

  // Each frame Konva redraws the layer; we update marker position from state
  g.on('draw', () => {
    const cpe = state.cameraPathEditor;
    const isPreviewTarget = cpe._previewNodeId === node.id || cpe.selectedNodeId === node.id;
    const hasMarker = cpe.previewPlaying && isPreviewTarget && cpe._previewMarker;
    if (hasMarker) {
      const tx = Number(node.transform?.x) || 0;
      const ty = Number(node.transform?.y) || 0;
      // _previewMarker is in world space; convert to group-local (subtract node origin)
      const lx = cpe._previewMarker.x - tx;
      const ly = cpe._previewMarker.y - ty;
      markerIcon.position({ x: lx, y: ly });
      markerRing.position({ x: lx, y: ly });
      markerLabel.position({ x: lx + 14, y: ly - 8 });
      // Progress %
      const props = node.properties || {};
      const pts = ensureCameraPathPoints(node);
      let total = 0;
      for (let _i = 0; _i < pts.length - 1; _i++) total += Math.hypot(pts[_i+1].x-pts[_i].x, pts[_i+1].y-pts[_i].y);
      if (props.closedPath && pts.length > 2) total += Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].y-pts[pts.length-1].y);
      const pct = total > 0 ? Math.round((cpe.previewTime / total) * 100) : 0;
      markerLabel.text(`${pct}%${cpe.previewPaused ? ' ⏸' : ''}`);
      markerIcon.visible(true);
      markerRing.visible(true);
      markerLabel.visible(true);
    } else {
      markerIcon.visible(false);
      markerRing.visible(false);
      markerLabel.visible(false);
    }
  });

  return g;
}


function getNodeVisualSize(node) {
  if (!node) return { width: 96, height: 96 };
  if (node.type === 'TileMap') {
    const props = ensureTileMapData(node);
    return {
      width: Math.max(1, (Number(props?.tileWidth) || 32) * (Number(props?.mapWidth) || 1)),
      height: Math.max(1, (Number(props?.tileHeight) || 32) * (Number(props?.mapHeight) || 1))
    };
  }

  return { width: Math.max(1, Number(node.properties?.width) || 96), height: Math.max(1, Number(node.properties?.height) || 96) };
}
function addHierarchyOutline(shape, node, style = 'ancestor') {
  if (!shape || !node || isRootNodeId(node.id) || !(shape instanceof Konva.Group) || node.type === 'CameraPath2D' || node.type === 'CameraBounds2D' || node.type === 'CameraZone2D') return;
  const { width, height } = getNodeVisualSize(node);
  shape.add(new Konva.Rect({ x: 0, y: 0, width, height, stroke: style === 'ancestor' ? '#6ec6e8' : '#e5c97a', dash: style === 'ancestor' ? [6, 4] : [3, 3], strokeWidth: style === 'ancestor' ? 1.5 : 1, listening: false, opacity: style === 'ancestor' ? 0.55 : 0.45, name: 'hierarchy-outline' }));
}
function fallbackUnknownNode(node) {
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  const w = Math.max(40, Number(node.properties?.width) || 120), h = Math.max(28, Number(node.properties?.height) || 48);
  g.add(new Konva.Rect({ width: w, height: h, fill: '#202634', stroke: '#5e7594', strokeWidth: 1.5, dash: [5, 4] }));
  g.add(new Konva.Text({ width: w, height: h, text: node.name || node.type, align: 'center', verticalAlign: 'middle', fill: '#c8d6ea', fontSize: 13 }));
  return g;
}
function buildSpriteGroup(node, animated) {
  const w = Math.max(1, Number(node.properties.width) || 96), h = Math.max(1, Number(node.properties.height) || 96);
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  if (animated) {
    const sheet = getNodeAssignedSheet(node);
    const tileRect = getTileRect(sheet, Math.max(0, Number(node.properties.previewFrame) || 0));
    if (sheet?.image?.complete && tileRect) {
      g.add(new Konva.Image({ image: sheet.image, crop: { x: tileRect.x, y: tileRect.y, width: tileRect.width, height: tileRect.height }, width: w, height: h }));
      g.add(new Konva.Rect({ width: w, height: h, stroke: '#5fb2d3', strokeWidth: 1 }));
    } else { g.add(fallbackBox(w, h, 'AnimatedSprite2D', '#5fb2d3')); }
  } else {
    const img = state.imageCache.get(node.id);
    if (img && img.complete) {
      g.add(new Konva.Image({ image: img, width: w, height: h }));
      g.add(new Konva.Rect({ width: w, height: h, stroke: '#5fb2d3', strokeWidth: 1 }));
    } else if (node.properties.imageDataUrl) {
      loadImageIntoCache(node.id, node.properties.imageDataUrl, renderViewport);
      g.add(fallbackBox(w, h, 'Loading…', '#5fb2d3'));
    } else { g.add(fallbackBox(w, h, 'Sprite2D', '#5fb2d3')); }
  }
  // ── Physics shapes overlay ──────────────────────────────────────
  _addPhysicsShapesOverlay(g, node);
  return g;
}

function buildSceneInstanceGroup(node) {
  const w = Math.max(1, Number(node.properties?.width) || 160);
  const h = Math.max(1, Number(node.properties?.height) || 120);
  const cache = getSceneInstanceCache(node.id);
  const resolvedRuntime = getResolvedSceneInstanceRuntime(node);
  const overrideCount = Object.keys(getSceneInstanceOverrides(node)).length;
  const localChildCount = getChildren(node.id).length;
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  const ready = cache?.status === 'ready';
  g.add(new Konva.Rect({ width: w, height: h, fill: ready ? 'rgba(111,193,106,0.08)' : 'rgba(224,108,117,0.08)', stroke: ready ? '#6dbd79' : '#e06c75', strokeWidth: 1.5, dash: [8, 5] }));
  g.add(new Konva.Text({ x: 8, y: 8, text: `SceneInstance: ${node.properties?.sourceSceneName || cache?.sourceName || node.name}`, fill: ready ? '#d7f0dd' : '#ffd2d5', fontSize: 13 }));
  g.add(new Konva.Text({ x: 8, y: 28, text: node.properties?.sourceScenePath || '(missing source)', fill: '#9fb1c7', fontSize: 11 }));
  g.add(new Konva.Text({ x: 8, y: 42, text: `Overrides: ${overrideCount} · Local children: ${localChildCount}`, fill: '#9fb1c7', fontSize: 10 }));
  if (ready && resolvedRuntime?.scene?.rootNodeId) {
    const previewRoot = new Konva.Group({ x: 12, y: 58, listening: false, opacity: 0.88 });
    const renderPreviewBranch = (previewNode, parentGroup) => {
      const shape = buildKonvaForPreviewNode(previewNode);
      if (!shape) return;
      parentGroup.add(shape);
      getResolvedInstanceChildren(node, previewNode.id).forEach((child) => renderPreviewBranch(child, shape));
    };
    getResolvedInstanceChildren(node, resolvedRuntime.scene.rootNodeId).forEach((child) => renderPreviewBranch(child, previewRoot));
    g.add(previewRoot);
  }
  return g;
}

function buildKonvaForPreviewNode(node) {
  if (!node || node.type === 'SceneRoot') {
    const g = new Konva.Group();
    return g;
  }
  const base = getKonvaNodeBaseAttrs(node);
  base.listening = false;
  if (node.type === 'Node2D') {
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: node.properties?.width || 160, height: node.properties?.height || 120, fill: hexWithAlpha(node.properties?.tint || '#5e7594', 0.09), stroke: '#7f90ac', strokeWidth: 1, dash: [6,4], listening: false }));
    return g;
  }
  if (node.type === 'Sprite2D') {
    const w = Math.max(1, Number(node.properties?.width) || 96), h = Math.max(1, Number(node.properties?.height) || 96);
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(95,178,211,0.08)', stroke: '#5fb2d3', strokeWidth: 1, listening: false }));
    return g;
  }
  if (node.type === 'AnimatedSprite2D') {
    const w = Math.max(1, Number(node.properties?.width) || 96), h = Math.max(1, Number(node.properties?.height) || 96);
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(95,178,211,0.08)', stroke: '#e5c97a', strokeWidth: 1, listening: false }));
    return g;
  }
  if (node.type === 'TileMap') {
    const w = Math.max(1, (Number(node.properties?.tileWidth) || 32) * (Number(node.properties?.mapWidth) || 1));
    const h = Math.max(1, (Number(node.properties?.tileHeight) || 32) * (Number(node.properties?.mapHeight) || 1));
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(71,140,191,0.07)', stroke: '#478cbf', strokeWidth: 1, listening: false }));
    return g;
  }
  if (isUiNodeType(node.type)) {
    const w = Math.max(1, Number(node.properties?.width) || 96);
    const h = Math.max(1, Number(node.properties?.height) || 48);
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(155,89,255,0.05)', stroke: '#b496ff', strokeWidth: 1, dash: [4,3], listening: false }));
    return g;
  }
  if (node.type === 'SceneInstance') {
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: node.properties?.width || 120, height: node.properties?.height || 90, fill: 'rgba(109,189,121,0.06)', stroke: '#6dbd79', strokeWidth: 1, dash: [5,4], listening: false }));
    return g;
  }
  return fallbackUnknownNode(node);
}

function getTerrainDebugColorForCell(node, layer, cell) {
  const terrainTypeId = cell && cell.terrainTypeId != null && cell.terrainTypeId !== '' ? String(cell.terrainTypeId) : null;
  if (!terrainTypeId) return null;
  const tileset = getTileMapAssignedTileset(node, layer) || getTileMapTerrainHostTileset(node);
  const terrainSetId = cell && cell.terrainSetId != null && cell.terrainSetId !== '' ? String(cell.terrainSetId) : (state.tilemapEditor.selectedTerrainSetId || null);
  const sets = tileset && Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];
  const terrainSet = sets.find((set) => String(set.id) === String(terrainSetId)) || sets[0] || null;
  const terrain = terrainSet && Array.isArray(terrainSet.terrainTypes)
    ? terrainSet.terrainTypes.find((entry) => String(entry.id) === terrainTypeId)
    : null;
  return terrain?.color || '#7a6ff0';
}

function getTerrainDebugRuleLabel(cell) {
  const diagnostics = cell?.terrainDiagnostics || null;
  if (!diagnostics) return '';
  if (diagnostics.fallbackUsed === true) return diagnostics.fallbackReason ? '!' : '?';
  const ruleId = String(diagnostics.matchedRuleId || diagnostics.ruleId || '');
  if (!ruleId) return '';
  return ruleId.length > 6 ? ruleId.slice(-6) : ruleId;
}

function buildTileMapGroup(node) {
  const props = ensureTileMapData(node);
  const tw = Math.max(1, Number(props.tileWidth) || 32), th = Math.max(1, Number(props.tileHeight) || 32);
  const mw = Math.max(1, Number(props.mapWidth)  || 10), mh = Math.max(1, Number(props.mapHeight) || 8);
  const activeLayerTileset = getTileMapAssignedTileset(node);
  const activeLayerSheet = activeLayerTileset ? getSheetById(activeLayerTileset.spriteSheetId) : null;
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  g.add(new Konva.Rect({ x: 0, y: 0, width: mw * tw, height: mh * th, fill: 'rgba(0,0,0,0.001)', strokeEnabled: false, listening: true, name: 'tilemap-hit-target' }));
  const shouldShowBrushPreview = state.selectedId === node.id && state.tool === 'select';
  const previewBrush = shouldShowBrushPreview ? getTileMapBrushInfo(node) : null;
  const hoverCol = shouldShowBrushPreview ? state.tilemapEditor.hoverCol : -1;
  const hoverRow = shouldShowBrushPreview ? state.tilemapEditor.hoverRow : -1;
  const previewCellMap = shouldShowBrushPreview ? getTileMapPreviewCellMap(node) : null;
  // Build a map of all group cells to show for the hover preview (keyed "col,row" → tileIndex)
  const groupHoverMap = (shouldShowBrushPreview && hoverCol >= 0 && hoverRow >= 0 && state.tilemapEditor.brushGroup?.length > 1)
    ? new Map(getBrushGroupCells(hoverCol, hoverRow, node).map((e) => [`${e.col},${e.row}`, e.tileIndex]))
    : null;
  for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
    g.add(new Konva.Rect({ x: c * tw, y: r * th, width: tw, height: th, fill: ((r + c) % 2) ? '#2d4a72' : '#1e3050', listening: false }));
    let hasCollisionCell = false;
    for (const layer of (props.layers || [])) {
      if (!layer || layer.visible === false) continue;
      const tv = Number(layer.tiles?.[r]?.[c]);
      const hasTile = Number.isFinite(tv) && tv >= 0;
      if (hasTile) {
        let drew = false;
        const layerTileset = getTileMapAssignedTileset(node, layer);
        const layerSheet = layerTileset ? getSheetById(layerTileset.spriteSheetId) : null;
        if (layerSheet?.image && layerTileset) {
          const tileRect = getTilesetTileRect(layerTileset, tv);
          if (tileRect) {
            const cellTransform = normalizeTileMapCellTransform(layer.cellData?.[r]?.[c]?.transform);
            g.add(new Konva.Image({ image: layerSheet.image, x: c * tw + (tw / 2), y: r * th + (th / 2), width: tw, height: th, offsetX: tw / 2, offsetY: th / 2, crop: { x: tileRect.x, y: tileRect.y, width: tileRect.width, height: tileRect.height }, scaleX: cellTransform.flipX ? -1 : 1, scaleY: cellTransform.flipY ? -1 : 1, rotation: cellTransform.rotation, opacity: Math.max(0, Math.min(1, Number(layer.opacity) || 1)), listening: false }));
            drew = true;
          }
        }
        if (!drew) {
          g.add(new Konva.Rect({ x: c * tw + 2, y: r * th + 2, width: Math.max(4, tw - 4), height: Math.max(4, th - 4), fill: '#4d79c7', stroke: '#d7e4ff', strokeWidth: 1, opacity: Math.max(0.25, Math.min(1, Number(layer.opacity) || 1)), listening: false }));
          g.add(new Konva.Text({ x: c * tw + 4, y: r * th + 4, text: `#${tv}`, fill: '#eef4ff', fontSize: Math.max(9, Math.min(14, Math.floor(th * 0.35))), listening: false }));
        }
      }
      if (!hasCollisionCell && Number(layer.collision?.[r]?.[c]) > 0) hasCollisionCell = true;
    }
    if (hasCollisionCell) {
      // Draw custom collision shapes if any layer's tileset defines them for this tile index
      let drewCustom = false;
      for (const layer of (props.layers || [])) {
        if (!layer || layer.visible === false) continue;
        if (!Number(layer.collision?.[r]?.[c])) continue;
        const tv = Number(layer.tiles?.[r]?.[c]);
        const layerTileset = getTileMapAssignedTileset(node, layer);
        if (!layerTileset) continue;
        const tileMeta = ensureTilesetTileMetadata(layerTileset, tv);
        const shapes = Array.isArray(tileMeta?.collisionShapes) && tileMeta.collisionShapes.length ? tileMeta.collisionShapes : null;
        if (shapes) {
          shapes.forEach((s) => {
            if (s.type === 'rect') {
              g.add(new Konva.Rect({ x: c * tw + s.x * tw, y: r * th + s.y * th, width: Math.max(1, s.w * tw), height: Math.max(1, s.h * th), fill: 'rgba(255,77,79,0.18)', stroke: '#ff4d4f', strokeWidth: 1.5, listening: false }));
            } else if (s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 6) {
              const pts = [];
              for (let pi = 0; pi < s.points.length; pi += 2) pts.push({ x: c * tw + s.points[pi] * tw, y: r * th + s.points[pi+1] * th });
              g.add(new Konva.Line({ points: pts.flatMap((p) => [p.x, p.y]), closed: true, fill: 'rgba(255,77,79,0.18)', stroke: '#ff4d4f', strokeWidth: 1.5, listening: false }));
            }
          });
          drewCustom = true;
        }
      }
      if (!drewCustom) {
        // Fallback: plain full-tile border for tiles with boolean collision only
        g.add(new Konva.Rect({ x: c * tw + 1.5, y: r * th + 1.5, width: Math.max(1, tw - 3), height: Math.max(1, th - 3), stroke: '#ff4d4f', strokeWidth: 2, listening: false }));
      }
    }
    // Draw physics shapes for this cell (teal, distinct from collision red)
    for (const layer of (props.layers || [])) {
      if (!layer || layer.visible === false) continue;
      const tv = Number(layer.tiles?.[r]?.[c]);
      const layerTileset = getTileMapAssignedTileset(node, layer);
      if (!layerTileset) continue;
      const tileMeta = ensureTilesetTileMetadata(layerTileset, tv);
      const pShapes = Array.isArray(tileMeta?.physicsShapes) && tileMeta.physicsShapes.length ? tileMeta.physicsShapes : null;
      if (pShapes) {
        pShapes.forEach((s) => {
          if (s.type === 'rect') {
            g.add(new Konva.Rect({ x: c * tw + s.x * tw, y: r * th + s.y * th, width: Math.max(1, s.w * tw), height: Math.max(1, s.h * th), fill: 'rgba(72,180,210,0.18)', stroke: '#48b4d2', strokeWidth: 1.5, listening: false }));
          } else if (s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 6) {
            const pts = [];
            for (let pi = 0; pi < s.points.length; pi += 2) pts.push({ x: c * tw + s.points[pi] * tw, y: r * th + s.points[pi+1] * th });
            g.add(new Konva.Line({ points: pts.flatMap((p) => [p.x, p.y]), closed: true, fill: 'rgba(72,180,210,0.18)', stroke: '#48b4d2', strokeWidth: 1.5, listening: false }));
          }
        });
        break; // first matching layer wins
      }
    }
    if (state.tilemapEditor?.terrainDebug === true) {
      const debugLayer = (props.layers || []).find((layer) => layer && layer.id === (state.tilemapEditor.activeLayerId || props.activeLayerId)) || (props.layers || [])[0] || null;
      const debugCell = debugLayer?.cellData?.[r]?.[c] || null;
      const debugColor = getTerrainDebugColorForCell(node, debugLayer, debugCell);
      const diagnostics = debugCell?.terrainDiagnostics;
      if (debugColor) {
        g.add(new Konva.Rect({ x: c * tw + 2, y: r * th + 2, width: Math.max(1, tw - 4), height: Math.max(1, th - 4), fill: debugColor, opacity: 0.18, listening: false }));
        g.add(new Konva.Rect({ x: c * tw + 1.5, y: r * th + 1.5, width: Math.max(1, tw - 3), height: Math.max(1, th - 3), stroke: debugColor, strokeWidth: 1.5, listening: false }));
        const ruleLabel = getTerrainDebugRuleLabel(debugCell);
        if (ruleLabel) g.add(new Konva.Text({ x: c * tw + 4, y: r * th + 4, text: ruleLabel, fill: '#ffffff', fontSize: Math.max(8, Math.min(11, Math.floor(th * 0.28))), shadowColor: '#000', shadowBlur: 3, shadowOpacity: 0.85, listening: false }));
      }
      if (diagnostics?.fallbackUsed === true) {
        g.add(new Konva.Rect({ x: c * tw + 4, y: r * th + 4, width: Math.max(1, tw - 8), height: Math.max(1, th - 8), stroke: '#ffb347', strokeWidth: 2, dash: [4, 3], listening: false }));
      }
    }
    const isPreviewCell = previewCellMap?.has(`${c},${r}`) === true;
    const groupHoverKey = `${c},${r}`;
    const isGroupHoverCell = groupHoverMap?.has(groupHoverKey) === true;
    if (hoverCol === c && hoverRow === r || isPreviewCell || isGroupHoverCell) {
      if (previewBrush?.mode === 'tile') {
        // For group brush: show the tile at this cell's position within the group
        const brushGroup = state.tilemapEditor.brushGroup;
        let previewTileIndex = previewBrush.tileIndex;
        if (groupHoverMap && isGroupHoverCell) {
          previewTileIndex = groupHoverMap.get(groupHoverKey) ?? previewBrush.tileIndex;
        } else if (brushGroup && brushGroup.length > 1) {
          const entry = brushGroup.find((e) => (hoverCol + e.dcol) === c && (hoverRow + e.drow) === r);
          if (entry) previewTileIndex = entry.tileIndex;
          else previewTileIndex = -2;
        }
        if (previewTileIndex >= 0 && activeLayerSheet?.image && previewBrush.tileset) {
          const previewRect = getTilesetTileRect(previewBrush.tileset, previewTileIndex);
          if (previewRect) g.add(new Konva.Image({ image: activeLayerSheet.image, x: c * tw, y: r * th, width: tw, height: th, crop: { x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height }, opacity: 0.55, listening: false }));
        } else if (previewTileIndex !== -2) {
          g.add(new Konva.Rect({ x: c * tw + 1, y: r * th + 1, width: Math.max(1, tw - 2), height: Math.max(1, th - 2), fill: 'rgba(224,106,106,0.2)', listening: false }));
        }
      } else if (previewBrush?.mode === 'terrain') {
        g.add(new Konva.Rect({ x: c * tw + 2, y: r * th + 2, width: Math.max(1, tw - 4), height: Math.max(1, th - 4), fill: 'rgba(122,111,240,0.26)', listening: false }));
      } else if (previewBrush?.mode === 'collision') {
        g.add(new Konva.Rect({ x: c * tw + 2, y: r * th + 2, width: Math.max(1, tw - 4), height: Math.max(1, th - 4), stroke: '#e06a6a', strokeWidth: 2, dash: [4,2], listening: false }));
      }
      g.add(new Konva.Rect({ x: c * tw + 1, y: r * th + 1, width: Math.max(1, tw - 2), height: Math.max(1, th - 2), stroke: '#b496ff', strokeWidth: 2, listening: false }));
    }
    const lastPick = state.tilemapEditor.lastPick;
    if (lastPick && lastPick.nodeId === node.id && lastPick.col === c && lastPick.row === r) {
      g.add(new Konva.Rect({ x: c * tw + 3, y: r * th + 3, width: Math.max(1, tw - 6), height: Math.max(1, th - 6), stroke: '#68d6ff', strokeWidth: 2, listening: false }));
    }
    if (props.showGrid) g.add(new Konva.Rect({ x: c * tw, y: r * th, width: tw, height: th, stroke: '#152540', strokeWidth: 1, listening: false }));
  }
  const last = state.tilemapEditor.lastPaint;
  if (last && last.col >= 0 && last.row >= 0) {
    g.add(new Konva.Rect({ x: last.col * tw + 1, y: last.row * th + 1, width: Math.max(2, tw - 2), height: Math.max(2, th - 2), stroke: '#ffe17a', strokeWidth: 2, listening: false }));
  }
  // ── Shift-drag group-select marquee overlay ──────────────────────
  const gsel = state.tilemapEditor.viewportGroupSelect;
  if (gsel?.active && gsel.nodeId === node.id) {
    const selMinCol = Math.max(0, Math.min(gsel.startCol, gsel.currentCol));
    const selMaxCol = Math.min(mw - 1, Math.max(gsel.startCol, gsel.currentCol));
    const selMinRow = Math.max(0, Math.min(gsel.startRow, gsel.currentRow));
    const selMaxRow = Math.min(mh - 1, Math.max(gsel.startRow, gsel.currentRow));
    const selW = (selMaxCol - selMinCol + 1) * tw;
    const selH = (selMaxRow - selMinRow + 1) * th;
    // Fill
    g.add(new Konva.Rect({ x: selMinCol * tw, y: selMinRow * th, width: selW, height: selH, fill: 'rgba(75,141,255,0.18)', listening: false }));
    // Border
    g.add(new Konva.Rect({ x: selMinCol * tw, y: selMinRow * th, width: selW, height: selH, stroke: '#4b8dff', strokeWidth: 2, dash: [5, 3], listening: false }));
    // Corner handles
    const hs = 6;
    [[selMinCol * tw, selMinRow * th],[selMinCol * tw + selW - hs, selMinRow * th],[selMinCol * tw, selMinRow * th + selH - hs],[selMinCol * tw + selW - hs, selMinRow * th + selH - hs]].forEach(([hx, hy]) => {
      g.add(new Konva.Rect({ x: hx, y: hy, width: hs, height: hs, fill: '#4b8dff', stroke: '#fff', strokeWidth: 1, listening: false }));
    });
    // Label
    const cellCount = (selMaxCol - selMinCol + 1) * (selMaxRow - selMinRow + 1);
    g.add(new Konva.Text({ x: selMinCol * tw + 3, y: selMinRow * th + 3, text: `${selMaxCol - selMinCol + 1}×${selMaxRow - selMinRow + 1} (${cellCount})`, fill: '#fff', fontSize: 10, shadowColor: '#000', shadowBlur: 3, shadowOpacity: 0.8, listening: false }));
  }
  g.add(new Konva.Text({ x: 6, y: 5, text: `${node.name} (${mw}×${mh})`, fill: '#dbe9fa', fontSize: 13, listening: false }));
  return g;
}
function fallbackBox(w, h, label, stroke) {
  const g = new Konva.Group();
  g.add(new Konva.Rect({ width: w, height: h, stroke, strokeWidth: 1.5, dash: [6, 4], fill: 'rgba(95,178,211,0.07)' }));
  g.add(new Konva.Text({ width: w, height: h, text: label, align: 'center', verticalAlign: 'middle', fill: '#7bbfd4', fontSize: 14 }));
  return g;
}

function attachTransformer() {
  if (!transformer) return;

  const entries = getMovableSelectedNodeIds()
    .map((id) => ({ id, shape: shapeRefs.get(id), node: getNode(id) }))
    .filter(({ shape, node }) => !!shape && !!node && node.locked !== true);

  const shapes = entries.map(({ shape }) => shape);

  const allCameraTools =
    entries.length > 0 &&
    entries.every(({ node }) =>
      node?.type === 'TileMap' ||
      node?.type === 'CameraPath2D' ||
      node?.type === 'CameraBounds2D' ||
      node?.type === 'CameraZone2D'
    );

  if (allCameraTools) {
    transformer.nodes([]);
    transformer.getLayer()?.batchDraw();
    return;
  }

  transformer.nodes(shapes);
  transformer.rotateEnabled(true);
  transformer.resizeEnabled(true);
  transformer.getLayer()?.batchDraw();
}

function loadImageIntoCache(key, dataUrl, onDone) {
  if (!dataUrl) return;
  const img = new Image();
  img.onload  = () => { state.imageCache.set(key, img); if (typeof onDone === 'function') onDone(); };
  img.onerror = () => setStatus('Could not load image.', true);
  img.src = dataUrl;
}
function updateSceneSummary() {
  if (!workspaceMetaEl) return;
  const sceneName = state.sceneState?.scene?.name || 'Untitled';
  const count = getNodes().length, sel = getSelectedNodeIds().length;
  workspaceMetaEl.textContent = sel ? `${sceneName} · ${count} nodes · ${sel} selected` : `${sceneName} · ${count} nodes`;
}

function sanitizeSceneName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function renameCurrentScene(nextName) {
  if (state.activeSceneIndex < 0) return false;

  const currentName = state.sceneState?.scene?.name || 'MainScene';
  const requestedName = nextName;

  if (requestedName == null) return false;

  const safeName = sanitizeSceneName(requestedName);
  if (!safeName) {
    setStatus('Scene name cannot be empty.', true);
    return false;
  }
  if (safeName === currentName) return false;

  const before = serializeScene(); const _vRename = _getSceneVersion();
  state.sceneState.scene = state.sceneState.scene || {};
  state.sceneState.scene.name = safeName;

  const rootNode = getNode(getRootNodeId());
  if (rootNode && (!rootNode.name || rootNode.name === currentName)) {
    rootNode.name = safeName;
  }

  syncEditorStateFromRuntime();
  persistActiveSceneEntry();
  scheduleRender(RenderFlags.SCENE_TABS | RenderFlags.TREE | RenderFlags.INSPECTOR);
  if (_sceneChanged(_vRename)) pushHistory('Rename scene', before);
  setStatus(`Renamed scene to "${safeName}".`);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
// SPRITESHEET MANAGEMENT
// ══════════════════════════════════════════════════════════════════════
function getSerializableSpritesheets() {
  return (state.spritesheets || []).map((s) => ({
    id: s.id,
    name: s.name,
    filePath: s.filePath,
    resourcePath: s.resourcePath || '',
    relativePath: s.relativePath || '',
    projectAsset: s.projectAsset === true,
    dataUrl: s.dataUrl,
    category: s.category || '',
    tileWidth: Math.max(1, Number(s.tileWidth) || 32),
    tileHeight: Math.max(1, Number(s.tileHeight) || 32),
    padding: Math.max(0, Number(s.padding) || 0),
    offsetX: Number(s.offsetX) || 0,
    offsetY: Number(s.offsetY) || 0,
    imageWidth: Math.max(0, Number(s.imageWidth) || 0),
    imageHeight: Math.max(0, Number(s.imageHeight) || 0),
    columns: Math.max(1, Number(s.columns) || 1),
    rows: Math.max(1, Number(s.rows) || 1)
  }));
}
function syncSpritesheetsToSceneState() {
  state.editorState.spritesheets = getSerializableSpritesheets();
  state.editorState.selectedSheetId = state.selectedSheetId || null;
}
function rebuildSpritesheetsFromSceneState() {
  const saved = Array.isArray(state.editorState?.spritesheets) ? state.editorState.spritesheets : [];
  state.spritesheets  = [];
  state.selectedSheetId = state.editorState?.selectedSheetId || null;
  saved.forEach((sv) => {
    if (!sv) return;
    // Keep sheets even without dataUrl — syncProjectImagesFromTree will restore
    // project-asset sheets by resourcePath. Non-project sheets preserve their dataUrl.
    const sheet = createProjectAssetSheet({
      id: sv.id || `sheet_${Math.random().toString(36).slice(2, 9)}`,
      name: sv.name || 'Spritesheet',
      filePath: sv.filePath || '',
      resourcePath: sv.resourcePath || '',
      relativePath: sv.relativePath || '',
      dataUrl: sv.dataUrl || '',
      category: sv.category || '',
      tileWidth: Math.max(1, Number(sv.tileWidth) || 32),
      tileHeight: Math.max(1, Number(sv.tileHeight) || 32),
      padding: Math.max(0, Number(sv.padding) || 0),
      offsetX: Number(sv.offsetX) || 0,
      offsetY: Number(sv.offsetY) || 0,
      imageWidth: Math.max(0, Number(sv.imageWidth) || 0),
      imageHeight: Math.max(0, Number(sv.imageHeight) || 0),
      columns: Math.max(1, Number(sv.columns) || 1),
      rows: Math.max(1, Number(sv.rows) || 1),
      projectAsset: sv.projectAsset === true
    });
    state.spritesheets.push(sheet);
  });
  if (!state.spritesheets.some((s) => s.id === state.selectedSheetId)) state.selectedSheetId = state.spritesheets[0]?.id || null;
  syncSpritesheetsToSceneState();
}

function serializeScene() {
  syncEditorStateFromRuntime();
  return JSON.stringify({ sceneState: state.sceneState, editorState: state.editorState });
}

function serializeSceneEntrySnapshot(sceneEntry) {
  if (!sceneEntry) return '';
  const runtimeScene = normalizeScene(sceneEntry.sceneState);
  const editorState = normalizeEditorState(sceneEntry.editorState, runtimeScene, runtimeScene);
  return JSON.stringify({ sceneState: runtimeScene, editorState });
}

function restoreActiveSceneFromSavedEntry(index) {
  const sceneEntry = state.scenes[index];
  if (!sceneEntry) return false;
  const existingAutosaveTimer = state.document.autosaveTimer;
  state.activeSceneIndex = index;
  applyLoadedSceneData(sceneEntry.sceneState, sceneEntry.editorState);
  const nextDocumentState = cloneDocumentState(sceneEntry.documentState || {});
  nextDocumentState.autosaveTimer = existingAutosaveTimer;
  state.document = nextDocumentState;
  rebuildImageCache();
  syncSheetInputs(getSelectedSheet());
  return true;
}

function pushHistory(label, snapshotBefore) {
  if (state.history.applying) return;
  const snapshot = snapshotBefore || serializeScene();
  const undo = state.history.undo;
  if (!undo.length || undo[undo.length - 1] !== snapshot) { undo.push(snapshot); if (undo.length > HISTORY_LIMIT) undo.shift(); }
  state.history.redo.length = 0;
  updateHistoryButtons();
  if (label) log(`[history] ${label}`);
}

function beginTerrainAction(label = 'Terrain action') {
  if (state.history.applying) return '';
  if (!state.tilemapEditor.terrainActionDepth) {
    state.tilemapEditor.terrainActionBefore = serializeScene();
    state.tilemapEditor.terrainActionLabel = label;
  } else if (label) {
    state.tilemapEditor.terrainActionLabel = label;
  }
  state.tilemapEditor.terrainActionDepth = Math.max(0, Number(state.tilemapEditor.terrainActionDepth) || 0) + 1;
  return state.tilemapEditor.terrainActionBefore || '';
}

function commitTerrainAction(label = '') {
  const depth = Math.max(0, Number(state.tilemapEditor.terrainActionDepth) || 0);
  if (!depth) return false;
  state.tilemapEditor.terrainActionDepth = Math.max(0, depth - 1);
  if (state.tilemapEditor.terrainActionDepth > 0) return false;
  const before = state.tilemapEditor.terrainActionBefore || ''; const _vTerrain = _getSceneVersion();
  const finalLabel = label || state.tilemapEditor.terrainActionLabel || 'Terrain action';
  state.tilemapEditor.terrainActionBefore = '';
  state.tilemapEditor.terrainActionLabel = '';
  if (before && _sceneChanged(_vTerrain)) {
    pushHistory(finalLabel, before);
    return true;
  }
  return false;
}

function markHistoryBaseline() { state.history.undo = []; state.history.redo = []; state.document.lastSavedSnapshot = serializeScene(); state.document.dirty = false; updateHistoryButtons(); }
function applySceneSnapshot(snapshot, directionLabel) {
  try {
    state.history.applying = true;
    const parsed = JSON.parse(snapshot);
    if (parsed && parsed.sceneState) applyLoadedSceneData(parsed.sceneState, parsed.editorState || {});
    else applyLoadedSceneData(parsed, parsed?.editor || {});
    state.instanceCache.clear();
    rebuildImageCache(); rebuildSpritesheetsFromSceneState(); rebuildSpriteFramesLibrariesFromSceneState(); rebuildTilesetsFromSceneState(); scheduleRender(RenderFlags.FULL); setStatus(directionLabel);
  } finally { state.history.applying = false; }
}
function performUndo() {
  if (!state.history.undo.length) return;
  const current = serializeScene(), snapshot = state.history.undo.pop();
  state.history.redo.push(current); applySceneSnapshot(snapshot, 'Undo applied.'); updateHistoryButtons();
}
function performRedo() {
  if (!state.history.redo.length) return;
  const current = serializeScene(), snapshot = state.history.redo.pop();
  state.history.undo.push(current); applySceneSnapshot(snapshot, 'Redo applied.'); updateHistoryButtons();
}
function updateHistoryButtons() {
  const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
  if (u) u.disabled = state.history.undo.length === 0;
  if (r) r.disabled = state.history.redo.length === 0;
}
function rebuildImageCache() {
  state.imageCache.clear();

  getNodes().forEach((n) => {
    if (n.properties?.imageDataUrl) {
      loadImageIntoCache(n.id, n.properties.imageDataUrl, renderViewport);
    }
  });

  (state.spritesheets || []).forEach((sheet) => {
    const dataUrl = sheet.dataUrl || sheet.imageDataUrl || sheet.src;
    if (!dataUrl) return;

    loadImageIntoCache(sheet.id, dataUrl, () => {
      const img = state.imageCache.get(sheet.id);
      if (img) {
        sheet.image = img;
        sheet.imageWidth = img.naturalWidth || img.width || sheet.imageWidth || 0;
        sheet.imageHeight = img.naturalHeight || img.height || sheet.imageHeight || 0;
        try { drawSheetCanvas(getSelectedSheet()); } catch(e) {}
      }
    });
  });
}
function snapValue(v) { return Math.round(Number(v || 0) / GRID_SIZE) * GRID_SIZE; }

function frameNodes(nodeIds, statusMessage = 'Framed selection.') {
  const ids = Array.isArray(nodeIds) ? nodeIds.filter((id) => id && getNode(id) && !isRootNodeId(id)) : [];
  if (!ids.length) return frameAllNodes();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach((id) => {
    const node = getNode(id); if (!node) return;
    const g = getGlobalTransform(node.id);
    const w = Math.max(32, Number(node.properties?.width) || (Number(node.properties?.tileWidth) || 32) * (Number(node.properties?.mapWidth) || 1));
    const h = Math.max(32, Number(node.properties?.height) || (Number(node.properties?.tileHeight) || 32) * (Number(node.properties?.mapHeight) || 1));
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + w * Math.abs(g.scaleX || 1)); maxY = Math.max(maxY, g.y + h * Math.abs(g.scaleY || 1));
  });
  const pad = 80, bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const scale = Math.max(0.2, Math.min(4, Math.min((stage.width() - pad * 2) / bw, (stage.height() - pad * 2) / bh)));
  state.viewport.scale = scale; state.viewport.x = stage.width() / 2 - (minX + bw / 2) * scale; state.viewport.y = stage.height() / 2 - (minY + bh / 2) * scale;
  applyViewportTransform(); updateZoomReadout(); setStatus(statusMessage);
}
function frameAllNodes() {
  const vis = getNodes().filter((n) => !isRootNodeId(n.id) && n.visible !== false);
  if (!vis.length) { state.viewport.x = stage.width() * 0.5; state.viewport.y = stage.height() * 0.5; state.viewport.scale = 1; applyViewportTransform(); updateZoomReadout(); setStatus('Nothing to frame.'); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  vis.forEach((node) => {
    const g = getGlobalTransform(node.id);
    const w = Math.max(32, Number(node.properties?.width) || (Number(node.properties?.tileWidth) || 32) * (Number(node.properties?.mapWidth) || 1));
    const h = Math.max(32, Number(node.properties?.height) || (Number(node.properties?.tileHeight) || 32) * (Number(node.properties?.mapHeight) || 1));
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + w * Math.abs(g.scaleX || 1)); maxY = Math.max(maxY, g.y + h * Math.abs(g.scaleY || 1));
  });
  const pad = 80, bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const scale = Math.max(0.2, Math.min(4, Math.min((stage.width() - pad * 2) / bw, (stage.height() - pad * 2) / bh)));
  state.viewport.scale = scale; state.viewport.x = stage.width() / 2 - (minX + bw / 2) * scale; state.viewport.y = stage.height() / 2 - (minY + bh / 2) * scale;
  applyViewportTransform(); updateZoomReadout(); setStatus('Framed scene.');
}

function closeSceneAt(index = state.activeSceneIndex) {
  if (!Number.isInteger(index) || index < 0 || index >= state.scenes.length) return;

  if (index === state.activeSceneIndex) {
    persistActiveSceneEntry();
  }

  state.scenes.splice(index, 1);

  if (!state.scenes.length) {
    state.activeSceneIndex = -1;
    state.sceneState = normalizeScene();
    state.editorState = normalizeEditorState(null, state.sceneState);
    state.document = Object.assign({}, state.document, cloneDocumentState({}), { autosaveTimer: state.document.autosaveTimer });
    createNewScene();
    return;
  }

  if (index === state.activeSceneIndex) {
    state.activeSceneIndex = -1;
    setActiveScene(Math.max(0, index - 1));
  } else {
    if (index < state.activeSceneIndex) state.activeSceneIndex -= 1;
    renderSceneTabs();
  }
  setStatus('Closed scene.');
}

function closeCurrentScene() {
  closeSceneAt(state.activeSceneIndex);
}

function closeAllScenes() {
  state.scenes = [];
  state.activeSceneIndex = -1;
  state.sceneState = normalizeScene();
  state.editorState = normalizeEditorState(null, state.sceneState);
  state.document = Object.assign({}, state.document, cloneDocumentState({}), { autosaveTimer: state.document.autosaveTimer });
  createNewScene();
  setStatus('Closed all scenes.');
}

async function saveSceneAs() {
  return saveScene();
}

async function reloadSavedScene() {
  if (!state.document.currentScenePath) {
    setStatus('No saved scene to reload.', true);
    return;
  }
  const result = await window.electronAPI.openSceneFile(state.document.currentScenePath);
  if (!result?.success) {
    setStatus(`Could not reload scene: ${result?.reason || 'Unknown error'}`, true);
    return;
  }
  await openSceneResult(result, { reloaded: true });
}

async function openSceneResult(result, options = {}) {
  const parsedScene = parseSceneJson(result.json);
  if (!parsedScene.ok) {
    reportSceneFatalErrors(parsedScene.fatalErrors, options.reloaded ? 'Scene reload failed' : 'Scene load failed');
    setStatus(options.reloaded ? 'Scene reload failed: invalid JSON.' : 'Scene load failed: invalid JSON.', { tone: 'error', flashMs: 2800 });
    return;
  }

  if (isLikelyEditorStateDocument(parsedScene.data)) {
    const fatalErrors = [{
      code: 'OPENED_EDITOR_STATE_INSTEAD_OF_SCENE',
      message: 'This file looks like an editor-state sidecar, not a runtime scene. Open the matching .rkscene file instead.'
    }];
    reportSceneFatalErrors(fatalErrors, options.reloaded ? 'Scene reload failed' : 'Scene load failed');
    setStatus(options.reloaded ? 'Scene reload failed: selected file is an editor-state sidecar.' : 'Scene load failed: selected file is an editor-state sidecar.', { tone: 'error', flashMs: 2800 });
    return;
  }

  const migration = migrateSceneDocument(parsedScene.data);
  if (!migration.ok) {
    const fatalErrors = Array.isArray(migration.fatalErrors) ? migration.fatalErrors.slice() : [];
    const hasUnknownVersion = fatalErrors.some((issue) => issue?.code === 'UNKNOWN_SCENE_FORMAT_VERSION');
    if (hasUnknownVersion) {
      fatalErrors.push({
        code: 'UNKNOWN_SCENE_FORMAT_VERSION_HELP',
        message: 'The file is missing scene-format markers. It may be an editor-state file or a non-scene JSON file.'
      });
    }
    reportSceneFatalErrors(fatalErrors, options.reloaded ? 'Scene reload failed' : 'Scene migration failed');
    setStatus(options.reloaded ? 'Scene reload failed: migration errors found.' : 'Scene load failed: migration errors found.', { tone: 'error', flashMs: 2800 });
    return;
  }

  const migratedScene = migration.data;
  let editorState = parsedScene.data?.editor || {};
  if (result.editorStateJson) {
    try {
      editorState = JSON.parse(result.editorStateJson);
    } catch (error) {
      const editWarnings = [{
        code: 'INVALID_EDITSTATE_JSON',
        message: `Edit state sidecar could not be parsed: ${error.message}`
      }];
      reportSceneWarnings(editWarnings, 'Edit state warnings');
      setStatus(options.reloaded ? 'Scene reloaded, but edit state sidecar could not be parsed.' : 'Scene opened, but edit state sidecar could not be parsed.', { tone: 'warning', flashMs: 2600 });
      editorState = parsedScene.data?.editor || {};
    }
  }

  state.editorState = normalizeEditorState(editorState, normalizeScene(migratedScene), migratedScene);

  const validation = await validateSceneForOpen(migratedScene, result.filePath);
  if (!validation.ok) {
    reportSceneFatalErrors(validation.fatalErrors, options.reloaded ? 'Scene reload failed' : 'Scene load failed');
    setStatus(options.reloaded ? 'Scene reload failed: validation errors found.' : 'Scene load failed: validation errors found.', { tone: 'error', flashMs: 2800 });
    return;
  }

  applyLoadedSceneData(migratedScene, editorState);
  state.document.currentScenePath = result.filePath || '';
  state.document.currentEditStatePath = result.editStatePath || '';
  state.document.pendingRecoveryId = '';
  state.document.lastAutosaveSnapshot = '';

  if (options.reloaded && state.activeSceneIndex >= 0 && state.scenes[state.activeSceneIndex]) {
    persistActiveSceneEntry();
  } else {
    const openedEntry = buildSceneEntryFromCurrentState();
    state.scenes.push(openedEntry);
    state.activeSceneIndex = state.scenes.length - 1;
  }

  rebuildImageCache();
  syncSheetInputs(getSelectedSheet());
  const instanceWarnings = await resolveAllSceneInstances({ force: true });
  markHistoryBaseline();
  scheduleRender(RenderFlags.FULL);
  if (!options.suppressFilesystemRefresh) refreshFilesystem();

  const inheritedSourceLoad = isInheritedScene(state.sceneState)
    ? await loadInheritanceSourceRuntime(getSceneInheritanceInfo(state.sceneState))
    : null;
  if (inheritedSourceLoad?.ok) {
    state.sceneState = updateSceneInheritanceMetadata(state.sceneState, {
      sourceSceneName: inheritedSourceLoad.sourceName || getSceneInheritanceInfo(state.sceneState)?.sourceSceneName || ''
    });
    persistActiveSceneEntry();
  }

  const warnings = [
    ...instanceWarnings,
    ...(inheritedSourceLoad && !inheritedSourceLoad.ok ? [inheritedSourceLoad.warning].filter(Boolean) : []),
    ...(Array.isArray(inheritedSourceLoad?.warnings) ? inheritedSourceLoad.warnings.filter((warning) => isRecoverableSceneWarning(warning.code)) : []),
    ...(Array.isArray(migration.warnings) ? migration.warnings : []),
    ...(Array.isArray(validation.warnings) ? validation.warnings.filter((warning) => isRecoverableSceneWarning(warning.code)) : [])
  ];
  if (warnings.length) {
    const labelBase = options.reloaded ? 'Scene reloaded with warnings' : (migration.migrations?.length ? 'Scene migrated and opened with warnings' : 'Scene opened with warnings');
    reportSceneWarnings(warnings, labelBase);
    const migrationSummary = migration.migrations?.length
      ? ` after migrating v${migration.originalVersion} → v${migration.finalVersion}`
      : '';
    setStatus(`${options.reloaded ? 'Reloaded' : 'Opened'} ${result.filePath}${migrationSummary} (${warnings.length} warning${warnings.length === 1 ? '' : 's'}).`, { tone: 'warning', flashMs: 2600 });
  } else {
    state.statusLogTarget = null;
    if (statusbarEl) statusbarEl.classList.remove('has-log-target');
    if (migration.migrations?.length) {
      setStatus(`${options.reloaded ? 'Reloaded' : 'Opened'} ${result.filePath} after migrating v${migration.originalVersion} → v${migration.finalVersion}${result.hasEditState ? ' with edit state.' : ' (no edit state sidecar found).'}`);
    } else {
      setStatus(`${options.reloaded ? 'Reloaded' : 'Opened'} ${result.filePath}${result.hasEditState ? ' with edit state.' : ' (no edit state sidecar found).'}`);
    }
  }
}

async function saveScene() {
  syncEditorStateFromRuntime();
  const result = await window.electronAPI.saveScene({
    runtimeJson: window.Exporter.exportSceneAsJson(state.sceneState, state.editorState),
    editorStateJson: window.Exporter.exportEditorStateAsJson(state.sceneState, state.editorState),
    currentScenePath: state.document.currentScenePath || '',
    recoveryId: state.document.pendingRecoveryId || '',
    sceneName: state.sceneState.scene?.name || 'RokuScene',
    suggestedPath: state.document.currentScenePath || `${state.sceneState.scene?.name || 'RokuScene'}.rkscene`
  });
  if (result.success) {
    state.document.currentScenePath = result.filePath || '';
    state.document.currentEditStatePath = result.editStatePath || '';
    state.document.pendingRecoveryId = '';
    state.document.lastAutosaveSnapshot = '';
    markHistoryBaseline();
    persistActiveSceneEntry();
    scheduleRender(RenderFlags.SCENE_TABS | RenderFlags.SCENE_SUMMARY | RenderFlags.HISTORY_BTNS);
    setStatus(`Saved ${result.filePath}${result.editStatePath ? ` and ${result.editStatePath}` : ''}`);
    refreshFilesystem();
  }
}
async function openScene() {
  const result = await window.electronAPI.openScene();
  if (!result.success) return;
  await openSceneResult(result);
}

async function refreshFilesystem(rootPath) {
  if (!filesystemEl || !window.electronAPI?.listProjectFiles) return;
  const result = await window.electronAPI.listProjectFiles(rootPath || state.projectRoot || undefined);
  if (!result.success) {
    filesystemEl.innerHTML = `<div class="notice error-text">Could not load files: ${escapeHtml(result.reason || 'Unknown error')}</div>`;
    return;
  }
  state.projectRoot = result.rootPath;
  await syncProjectAssetsFromTree(result.tree);
  renderFilesystemTree(result.tree);
  renderAudioPanel(result.tree);
}


function getFilesystemFileType(node) {
  if (!node) return 'file';
  if (node.type === 'directory') return 'directory';
  const name = String(node.name || '').toLowerCase();
  if (name.endsWith('.rkscene') || name.endsWith('.json')) return name.endsWith('.json') ? 'json' : 'scene';
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(name)) return 'audio';
  if (/\.xml$/i.test(name)) return 'component';
  if (/\.brs$/i.test(name)) return 'brightscript';
  if (/\.(js|ts)$/i.test(name)) return 'script';
  if (/\.json$/i.test(name)) return 'json';
  return 'file';
}

function getFilesystemIcon(node) {
  const kind = getFilesystemFileType(node);
  const icons = {
    directory: '📁',
    scene: '🎬',
    image: '🖼️',
    audio: '🎵',
    component: '🧱',
    brightscript: '📜',
    script: '📜',
    json: '🧩',
    file: '📄'
  };
  return icons[kind] || icons.file;
}

function doesFilesystemNodeMatch(node, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${node?.name || ''} ${node?.relativePath || ''}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  return Array.isArray(node?.children) && node.children.some((child) => doesFilesystemNodeMatch(child, needle));
}

function getFilesystemSelectedNode(tree, targetPath) {
  if (!tree || !targetPath) return null;
  if (String(tree.path || '') === String(targetPath)) return tree;
  if (Array.isArray(tree.children)) {
    for (const child of tree.children) {
      const found = getFilesystemSelectedNode(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function getFilesystemSelectedParentPath(tree) {
  const selected = getFilesystemSelectedNode(tree, state.filesystem.selectedPath);
  if (!selected) return state.projectRoot || '';
  return selected.type === 'directory' ? selected.path : (selected.parentPath || state.projectRoot || '');
}

function toggleFilesystemExpanded(nodePath) {
  if (!nodePath) return;
  state.filesystem.expanded[nodePath] = !state.filesystem.expanded[nodePath];
  refreshFilesystem();
}

async function openFilesystemEntry(node) {
  if (!node || node.type !== 'file') return;
  const kind = getFilesystemFileType(node);
  if (kind === 'scene') {
    const result = await window.electronAPI.openSceneFile(node.path);
    if (result?.success) {
      await openSceneResult(result);
      setStatus(`Opened ${node.name}.`);
    } else {
      setStatus(`Could not open ${node.name}.`, true);
    }
    return;
  }
  if (kind === 'image' || kind === 'audio') {
    const result = await window.electronAPI.readProjectAsset({ resourcePath: makeTreeResPath(node) });
    if (!result?.success) {
      setStatus(`Could not open ${node.name}.`, true);
      return;
    }
    activateBottomPanel('output');
    if (kind === 'image') appendLog(`Opened image asset: ${result.resPath || node.name}`);
    else appendLog(`Opened audio asset: ${result.resPath || node.name}`);
    setStatus(`Opened ${node.name}.`);
    return;
  }
  const textResult = await window.electronAPI.readTextFile({ path: node.path });
  if (textResult?.success) {
    activateBottomPanel('output');
    appendLog(`Opened file: ${textResult.resPath || node.name}`);
    appendLog(textResult.text);
    setStatus(`Opened ${node.name}.`);
  } else {
    setStatus(`Could not open ${node.name}.`, true);
  }
}

async function importAssetIntoFilesystem(assetType) {
  if (!window.electronAPI?.importProjectAsset) {
    setStatus('Import is not available.', true);
    return;
  }
  if (!state.projectRoot) {
    setStatus('Choose or open a project folder first.', true);
    return;
  }
  const result = await window.electronAPI.importProjectAsset({ assetType });
  if (!result?.success) return;
  await refreshFilesystem();
  setStatus(`Imported ${result.resPath || result.filePath || assetType}.`);
}

function cancelFilesystemInlineCreate(options = {}) {
  state.filesystem.creating = null;
  if (!options.silent) refreshFilesystem();
}

async function finishFilesystemInlineCreate(nextName, options = {}) {
  const pending = state.filesystem.creating;
  state.filesystem.creating = null;
  if (!pending) {
    if (!options.silent) refreshFilesystem();
    return false;
  }

  const cancel = !!options.cancel;
  const normalizedNextName = String(nextName || '').trim();
  if (cancel || !normalizedNextName) {
    refreshFilesystem();
    return false;
  }

  if (!window.electronAPI?.createProjectItem) {
    setStatus('Create item is not available.', true);
    refreshFilesystem();
    return false;
  }

  const result = await window.electronAPI.createProjectItem({
    kind: pending.kind,
    parentPath: pending.parentPath,
    name: normalizedNextName
  });
  if (!result?.success) {
    setStatus(`Could not create ${pending.kind}: ${result?.reason || 'Unknown error'}`, true);
    refreshFilesystem();
    return false;
  }
  state.filesystem.selectedPath = result.path || '';
  await refreshFilesystem();
  setStatus(`Created ${pending.kind} ${result.name || normalizedNextName}.`);
  return true;
}

async function createFilesystemItem(kind, tree, explicitNode = null) {
  if (!window.electronAPI?.createProjectItem) {
    setStatus('Create item is not available.', true);
    return;
  }
  if (!state.projectRoot) {
    setStatus('Choose or open a project folder first.', true);
    return;
  }
  const selectedNode = explicitNode || getFilesystemSelectedNode(tree, state.filesystem.selectedPath);
  const parentPath = selectedNode ? (selectedNode.type === 'directory' ? selectedNode.path : (selectedNode.parentPath || state.projectRoot || '')) : getFilesystemSelectedParentPath(tree);
  const defaults = {
    folder: 'NewFolder',
    scene: 'NewScene',
    roku_component: 'NewComponent',
    scene_hud_component: 'NewScreen',
    task_component: 'NewTask',
    main_script: 'main.brs',
    brightscript: 'new_script.brs'
  };
  state.filesystem.selectedPath = parentPath || state.projectRoot || '';
  state.filesystem.renamingPath = '';
  state.filesystem.creating = {
    kind,
    parentPath,
    name: defaults[kind] || 'NewItem'
  };
  if (parentPath) state.filesystem.expanded[parentPath] = true;
  refreshFilesystem();
}

async function renameFilesystemItem(tree, explicitNode = null) {
  if (!state.projectRoot) {
    setStatus('Choose or open a project folder first.', true);
    return;
  }
  const selected = explicitNode || getFilesystemSelectedNode(tree, state.filesystem.selectedPath);
  if (!selected || !window.electronAPI?.renameProjectItem) {
    setStatus('Select a file or folder to rename.', true);
    return;
  }
  const nextName = window.prompt('Rename item:', selected.name || '');
  if (!nextName || nextName === selected.name) return;
  const result = await window.electronAPI.renameProjectItem({ path: selected.path, newName: nextName });
  if (!result?.success) {
    setStatus(`Could not rename item: ${result?.reason || 'Unknown error'}`, true);
    return;
  }
  state.filesystem.selectedPath = result.path || '';
  await refreshFilesystem();
  setStatus(`Renamed to ${result.name || nextName}.`);
}

async function deleteFilesystemItem(tree, explicitNode = null) {
  if (!state.projectRoot) {
    setStatus('Choose or open a project folder first.', true);
    return;
  }
  const selected = explicitNode || getFilesystemSelectedNode(tree, state.filesystem.selectedPath);
  if (!selected || !window.electronAPI?.deleteProjectItem) {
    setStatus('Select a file or folder to delete.', true);
    return;
  }
  const ok = window.confirm(`Delete ${selected.name}?`);
  if (!ok) return;
  const result = await window.electronAPI.deleteProjectItem({ path: selected.path });
  if (!result?.success) {
    setStatus(`Could not delete item: ${result?.reason || 'Unknown error'}`, true);
    return;
  }
  state.filesystem.selectedPath = '';
  await refreshFilesystem();
  setStatus(`Deleted ${selected.name}.`);
}



function closeFilesystemContextMenu() {
  const menu = document.getElementById('filesystem-context-menu');
  if (!menu) return;
  menu.classList.add('hidden');
  menu.innerHTML = '';
}

function ensureFilesystemContextMenu() {
  let menu = document.getElementById('filesystem-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'filesystem-context-menu';
    menu.className = 'scene-context-menu filesystem-context-menu hidden';
    document.body.appendChild(menu);
  }
  menu.addEventListener('pointerdown', (event) => event.stopPropagation());
  if (!ensureFilesystemContextMenu.bound) {
    document.addEventListener('pointerdown', (event) => {
      const current = document.getElementById('filesystem-context-menu');
      if (!current || current.classList.contains('hidden') || current.contains(event.target)) return;
      closeFilesystemContextMenu();
    });
    window.addEventListener('blur', closeFilesystemContextMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFilesystemContextMenu();
    });
    ensureFilesystemContextMenu.bound = true;
  }
  return menu;
}

function positionFilesystemContextMenu(menu, x, y) {
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

function beginFilesystemInlineRename(node) {
  if (!node?.path) {
    setStatus('Select a file or folder to rename.', true);
    return;
  }
  state.filesystem.selectedPath = node.path;
  state.filesystem.renamingPath = node.path;
  refreshFilesystem();
}

async function finishFilesystemInlineRename(node, nextName, options = {}) {
  const cancel = !!options.cancel;
  const originalPath = String(node?.path || state.filesystem.renamingPath || '').trim();
  state.filesystem.renamingPath = '';
  if (cancel || !originalPath) {
    refreshFilesystem();
    return false;
  }
  const originalName = String(node?.name || '').trim();
  const normalizedNextName = String(nextName || '').trim();
  if (!normalizedNextName || normalizedNextName === originalName) {
    refreshFilesystem();
    return false;
  }
  if (!window.electronAPI?.renameProjectItem) {
    setStatus('Rename is not available.', true);
    refreshFilesystem();
    return false;
  }
  const result = await window.electronAPI.renameProjectItem({ path: originalPath, newName: normalizedNextName });
  if (!result?.success) {
    setStatus(`Could not rename item: ${result?.reason || 'Unknown error'}`, true);
    refreshFilesystem();
    return false;
  }
  state.filesystem.selectedPath = result.path || '';
  await refreshFilesystem();
  setStatus(`Renamed to ${result.name || normalizedNextName}.`);
  return true;
}

function openFilesystemContextMenu(targetNode, x, y, tree) {
  const menu = ensureFilesystemContextMenu();
  menu.innerHTML = '';
  menu.classList.remove('hidden');

  const selectedNode = targetNode || null;
  if (selectedNode?.path) state.filesystem.selectedPath = selectedNode.path;

  const selectedKind = selectedNode ? getFilesystemFileType(selectedNode) : '';
  const canOpen = !!selectedNode && selectedNode.type === 'file';
  if (selectedNode) {
    addContextMenuItem(menu, 'Open', () => void openFilesystemEntry(selectedNode), { disabled: !canOpen });
    if (selectedKind === 'image') {
      addContextMenuItem(menu, 'Create Sprite2D From Image', async () => {
        const worldPos = {
          x: Math.round((stage.width() / 2 - state.viewport.x) / state.viewport.scale),
          y: Math.round((stage.height() / 2 - state.viewport.y) / state.viewport.scale)
        };
        pushHistory('Add sprite from FileSystem');
        await createSpriteNodeFromFilesystemDrop({
          kind: 'image',
          path: selectedNode.path,
          relativePath: selectedNode.relativePath,
          resPath: makeTreeResPath(selectedNode),
          name: selectedNode.name
        }, worldPos);
      });
    }
    addContextMenuSeparator(menu);
    addContextMenuItem(menu, 'Rename', () => beginFilesystemInlineRename(selectedNode));
    addContextMenuItem(menu, 'Delete', () => void deleteFilesystemItem(tree, selectedNode), { danger: true });
    addContextMenuSeparator(menu);
  }

  if (selectedNode?.type === 'directory') {
    addContextMenuItem(menu, 'Open Folder', async () => {
      if (!window.electronAPI?.openInExplorer) {
        setStatus('Open Folder is not available.', true);
        return;
      }
      const result = await window.electronAPI.openInExplorer(selectedNode.path);
      if (!result?.success) {
        setStatus(`Could not open folder: ${result?.reason || 'Unknown error'}`, true);
      }
    });
  } else {
    addContextMenuItem(menu, 'Choose Folder', async () => {
      const p = await window.electronAPI.chooseProjectFolder();
      if (p?.success) await openProjectFromRoot(p.rootPath);
    });
  }
  addContextMenuItem(menu, 'Import Image', () => void importAssetIntoFilesystem('image'));
  addContextMenuItem(menu, 'Import Audio', () => void importAssetIntoFilesystem('audio'));
  addContextMenuItem(menu, 'Import JSON', () => void importAssetIntoFilesystem('json'));
  addContextMenuSeparator(menu);
  addContextMenuItem(menu, 'New Scene', () => void createFilesystemItem('scene', tree, selectedNode));
  addContextMenuItem(menu, 'New Folder', () => void createFilesystemItem('folder', tree, selectedNode));
  addContextMenuItem(menu, 'New Roku Component', () => void createFilesystemItem('roku_component', tree, selectedNode));
  addContextMenuItem(menu, 'New Scene/HUD Component', () => void createFilesystemItem('scene_hud_component', tree, selectedNode));
  addContextMenuItem(menu, 'New Task Component', () => void createFilesystemItem('task_component', tree, selectedNode));
  addContextMenuItem(menu, 'New Main Script', () => void createFilesystemItem('main_script', tree, selectedNode));
  addContextMenuItem(menu, 'New BrightScript File', () => void createFilesystemItem('brightscript', tree, selectedNode));

  positionFilesystemContextMenu(menu, x, y);
}

function appendFilesystemCreateRow(parent, depth, parentNode) {
  const pending = state.filesystem.creating;
  if (!pending || !parent || !parentNode) return;

  const row = document.createElement('div');
  row.className = 'filesystem-row is-creating active';
  row.style.paddingLeft = `${depth * 14 + 20}px`;
  const kind = pending.kind === 'folder' ? 'directory' : pending.kind;
  row.innerHTML = `
    <span class="filesystem-caret"></span>
    <span class="filesystem-icon filesystem-icon-${kind}">${pending.kind === 'folder' ? '📁' : pending.kind === 'scene' ? '🎬' : (pending.kind === 'roku_component' || pending.kind === 'scene_hud_component') ? '🧱' : pending.kind === 'task_component' ? '⚙️' : '📜'}</span>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'filesystem-inline-rename';
  input.value = pending.name || '';
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('dblclick', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      void finishFilesystemInlineCreate(input.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelFilesystemInlineCreate();
    }
  });
  input.addEventListener('blur', () => { void finishFilesystemInlineCreate(input.value); });
  row.appendChild(input);
  parent.appendChild(row);
  setTimeout(() => {
    if (document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }, 0);
}

function renderFilesystemTree(tree) {
  if (!filesystemEl) return;
  filesystemEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'notice';
  header.style.paddingBottom = '6px';
  header.innerHTML = `<div><strong>${escapeHtml(tree.name || 'Project')}</strong></div><div style="font-size:11px;color:var(--text-faint)">${escapeHtml(state.projectRoot)}</div>`;
  filesystemEl.appendChild(header);

  const searchRow = document.createElement('div');
  searchRow.className = 'filesystem-search-row';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search files';
  searchInput.value = state.filesystem.searchQuery || '';
  searchInput.addEventListener('input', () => {
    state.filesystem.searchQuery = searchInput.value || '';
    renderFilesystemTree(tree);
  });
  searchRow.appendChild(searchInput);
  filesystemEl.appendChild(searchRow);

  const rootList = document.createElement('div');
  rootList.className = 'filesystem-tree-list';
  rootList.addEventListener('contextmenu', (event) => {
    if (event.target !== rootList) return;
    event.preventDefault();
    event.stopPropagation();
    openFilesystemContextMenu(null, event.clientX, event.clientY, tree);
  });
  filesystemEl.appendChild(rootList);
  appendFileTreeNode(rootList, tree, 0, state.filesystem.searchQuery || '', tree);
  const pendingRoot = state.filesystem.creating;
  if (pendingRoot && (!pendingRoot.parentPath || pendingRoot.parentPath === tree.path)) {
    appendFilesystemCreateRow(rootList, 0, tree);
  }
}

function appendFileTreeNode(parent, node, depth, query = '', tree = null) {
  if (!doesFilesystemNodeMatch(node, query)) return;
  const rootTree = tree || node;
  const isDirectory = node.type === 'directory';
  const isExpanded = state.filesystem.expanded[node.path] !== false;
  const isRenaming = state.filesystem.renamingPath === node.path;
  const kind = getFilesystemFileType(node);

  const row = document.createElement('div');
  row.className = `filesystem-row${state.filesystem.selectedPath === node.path ? ' active' : ''}${isDirectory ? ' is-directory' : ' is-file'}`;
  row.style.paddingLeft = `${depth * 14 + 6}px`;
  row.draggable = !isDirectory;
  row.dataset.path = node.path;
  row.innerHTML = `
    <span class="filesystem-caret">${isDirectory ? (isExpanded ? '▾' : '▸') : ''}</span>
    <span class="filesystem-icon filesystem-icon-${kind}">${getFilesystemIcon(node)}</span>
    <span class="filesystem-name">${escapeHtml(node.name)}</span>
  `;

  const caretEl = row.querySelector('.filesystem-caret');
  const nameEl = row.querySelector('.filesystem-name');

  if (isRenaming) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'filesystem-inline-rename';
    input.value = node.name || '';
    nameEl.replaceWith(input);
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        void finishFilesystemInlineRename(node, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        void finishFilesystemInlineRename(node, node.name, { cancel: true });
      }
    });
    input.addEventListener('blur', () => { void finishFilesystemInlineRename(node, input.value); });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  if (isDirectory) {
    caretEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.filesystem.expanded[node.path] = !isExpanded;
      refreshFilesystem();
    });
  }

  row.addEventListener('click', (event) => {
    event.stopPropagation();
    state.filesystem.selectedPath = node.path;
    refreshFilesystem();
  });

  row.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.filesystem.selectedPath = node.path;
    if (isDirectory) {
      state.filesystem.expanded[node.path] = !isExpanded;
      refreshFilesystem();
    } else {
      void openFilesystemEntry(node);
    }
  });

  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFilesystemContextMenu(node, event.clientX, event.clientY, rootTree);
  });

  row.addEventListener('dragstart', (event) => {
    if (isDirectory) return;
    const payload = {
      kind: getFilesystemFileType(node),
      path: node.path,
      relativePath: node.relativePath,
      resPath: makeTreeResPath(node),
      name: node.name
    };
    const raw = JSON.stringify(payload);
    event.dataTransfer.setData('application/x-rokufile', raw);
    event.dataTransfer.setData('text/plain', `rokufile:${raw}`);
    event.dataTransfer.effectAllowed = 'copy';
  });

  parent.appendChild(row);
  if (isDirectory && isExpanded && Array.isArray(node.children)) {
    node.children.forEach((child) => {
      child.parentPath = node.path;
      appendFileTreeNode(parent, child, depth + 1, query, rootTree);
    });
    const pending = state.filesystem.creating;
    if (pending && pending.parentPath === node.path) {
      appendFilesystemCreateRow(parent, depth + 1, node);
    }
  }
}

function flattenProjectFiles(tree, bucket = []) {

  if (!tree || typeof tree !== 'object') return bucket;
  if (tree.type === 'file') bucket.push(tree);
  if (Array.isArray(tree.children)) tree.children.forEach((child) => flattenProjectFiles(child, bucket));
  return bucket;
}

function normalizeAssetRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function makeTreeResPath(file) {
  const relativePath = normalizeAssetRelativePath(file?.relativePath || file?.path || '');
  return relativePath ? `res://${relativePath}` : '';
}

function getProjectAssetFiles(tree, kinds = ['image', 'audio']) {
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
  const audioExts = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
  const requestedKinds = new Set((Array.isArray(kinds) ? kinds : [kinds]).map((kind) => String(kind || '').toLowerCase()));
  return flattenProjectFiles(tree, [])
    .map((file) => {
      const relativePath = normalizeAssetRelativePath(file?.relativePath || file?.path || '');
      const lowerPath = relativePath.toLowerCase();
      const name = String(file?.name || '').toLowerCase();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
      const isImage = imageExts.has(ext);
      const isAudio = audioExts.has(ext);
      let assetType = '';
      if (isAudio && lowerPath.startsWith('assets/audio/')) assetType = 'audio';
      else if (isImage && (lowerPath.startsWith('assets/images/') || lowerPath.startsWith('assets/spritesheets/') || lowerPath.startsWith('assets/sprites/'))) assetType = 'image';
      else if (isAudio && lowerPath.startsWith('assets/')) assetType = 'audio';
      else if (isImage && lowerPath.startsWith('assets/')) assetType = 'image';
      if (!assetType || !requestedKinds.has(assetType)) return null;
      return Object.assign({}, file, {
        assetType,
        relativePath,
        resPath: makeTreeResPath(file)
      });
    })
    .filter(Boolean)
    .sort((a, b) => String(a.relativePath || a.name || '').localeCompare(String(b.relativePath || b.name || ''), undefined, { sensitivity: 'base' }));
}

function getAudioAssetFiles(tree) {
  return getProjectAssetFiles(tree, ['audio']);
}

function getImageAssetFiles(tree) {
  return getProjectAssetFiles(tree, ['image']);
}

function createProjectAssetSheet(payload) {
  const sheet = {
    id: payload.id || `sheet_${Math.random().toString(36).slice(2, 9)}`,
    name: payload.name || payload.fileName || 'Spritesheet',
    filePath: payload.filePath || '',
    resourcePath: payload.resourcePath || payload.resPath || '',
    relativePath: payload.relativePath || '',
    dataUrl: payload.dataUrl || '',
    image: null,
    tileWidth: Math.max(1, Number(payload.tileWidth) || 32),
    tileHeight: Math.max(1, Number(payload.tileHeight) || 32),
    padding: Math.max(0, Number(payload.padding) || 0),
    offsetX: Number(payload.offsetX) || 0,
    offsetY: Number(payload.offsetY) || 0,
    imageWidth: Math.max(0, Number(payload.imageWidth) || 0),
    imageHeight: Math.max(0, Number(payload.imageHeight) || 0),
    columns: Math.max(1, Number(payload.columns) || 1),
    rows: Math.max(1, Number(payload.rows) || 1),
    projectAsset: payload.projectAsset !== false
  };
  if (sheet.dataUrl) {
    const img = new Image();
    img.onload = () => {
      sheet.image = img;
      recalcSheetMetrics(sheet);
      syncSpritesheetsToSceneState();
      renderSpritesheetsPanel();
      renderSpriteFramesPanel();
    };
    img.onerror = () => setStatus(`Could not load project image "${sheet.name}".`, true);
    img.src = sheet.dataUrl;
    sheet.image = img;
  }
  return sheet;
}

async function syncProjectAssetsFromTree(tree) {
  await syncProjectImagesFromTree(tree);
}

async function syncProjectImagesFromTree(tree) {
  const imageFiles = getImageAssetFiles(tree);
  const existingSheets = Array.isArray(state.spritesheets) ? state.spritesheets.slice() : [];
  const existingByKey = new Map();
  existingSheets.forEach((sheet) => {
    const resourceKey = String(sheet?.resourcePath || '').trim().toLowerCase();
    const fileKey = String(sheet?.filePath || '').trim().toLowerCase();
    const relativeKey = normalizeAssetRelativePath(sheet?.relativePath || '').toLowerCase();
    if (resourceKey) existingByKey.set(resourceKey, sheet);
    if (fileKey) existingByKey.set(fileKey, sheet);
    if (relativeKey) existingByKey.set(relativeKey, sheet);
  });

  // Preserve the current list first so a newly imported spritesheet does not disappear
  // while the filesystem tree is still catching up to the imported file.
  const nextSheets = existingSheets.slice();
  const seen = new Set(nextSheets.map((sheet) => String(sheet?.id || '')));

  for (const file of imageFiles) {
    const resourceKey = String(file.resPath || '').trim().toLowerCase();
    const fileKey = String(file.path || '').trim().toLowerCase();
    const relativeKey = String(file.relativePath || '').trim().toLowerCase();
    let sheet = existingByKey.get(resourceKey) || existingByKey.get(fileKey) || existingByKey.get(relativeKey) || null;
    if (!sheet) {
      const assetApi = window.electronAPI;
      if (!assetApi || typeof assetApi.readProjectAsset !== 'function') continue;
      const asset = await assetApi.readProjectAsset({ resourcePath: file.resPath });
      if (!asset?.success || !asset?.dataUrl) continue;
      sheet = createProjectAssetSheet({
        name: file.name,
        filePath: asset.filePath || file.path || '',
        resourcePath: asset.resPath || file.resPath || '',
        relativePath: file.relativePath || '',
        dataUrl: asset.dataUrl,
        projectAsset: true
      });
    } else {
      sheet.projectAsset = true;
      sheet.name = sheet.name || file.name || 'Spritesheet';
      sheet.filePath = file.path || sheet.filePath || '';
      sheet.resourcePath = file.resPath || sheet.resourcePath || '';
      sheet.relativePath = file.relativePath || sheet.relativePath || '';
      // If the sheet lost its image (dataUrl was stripped on save), reload from disk
      if (!sheet.image || !sheet.dataUrl) {
        const assetApi = window.electronAPI;
        if (assetApi && typeof assetApi.readProjectAsset === 'function') {
          const asset = await assetApi.readProjectAsset({ resourcePath: file.resPath });
          if (asset?.success && asset?.dataUrl) {
            sheet.dataUrl = asset.dataUrl;
            const img = new Image();
            img.onload = () => {
              sheet.image = img;
              recalcSheetMetrics(sheet);
              syncSpritesheetsToSceneState();
              renderSpritesheetsPanel();
              renderSpriteFramesPanel();
              renderTilesetsPanel();
              renderTileMapsPanel();
            };
            img.src = asset.dataUrl;
            sheet.image = img;
          }
        }
      }
    }
    if (!seen.has(sheet.id)) {
      nextSheets.push(sheet);
      seen.add(sheet.id);
    }
  }

  state.spritesheets = nextSheets;
  if (!state.spritesheets.some((sheet) => sheet.id === state.selectedSheetId)) {
    state.selectedSheetId = state.spritesheets[0]?.id || null;
  }
  syncSpritesheetsToSceneState();
  renderSpritesheetsPanel();
  renderSpriteFramesPanel();
  renderTilesetsPanel();
  renderTileMapsPanel();
}

// ── Audio panel (singleton) ────────────────────────────────────────────────
let _audioPanel = null;

function getOrCreateAudioPanel() {
  if (_audioPanel) return _audioPanel;
  if (!audioListEl || !window.AudioPanel) return null;
  // Use the real Web Audio engine if available, fall back to plain object
  const engine = RGE_ROOT.RGEAudioEngine || { mixers: new Map() };
  _audioPanel = new window.AudioPanel(engine, audioListEl);
  _audioPanel.mount();
  window._audioPanelInstance = _audioPanel;
  // Resume AudioContext on first user interaction (browser autoplay policy)
  const resumeCtx = () => {
    if (RGE_ROOT.RGEAudioEngine && RGE_ROOT.RGEAudioEngine._ctx &&
        RGE_ROOT.RGEAudioEngine._ctx.state === 'suspended') {
      RGE_ROOT.RGEAudioEngine._ctx.resume();
    }
  };
  document.addEventListener('click', resumeCtx, { once: true });
  document.addEventListener('keydown', resumeCtx, { once: true });
  return _audioPanel;
}

function renderAudioPanel(tree) {
  const panel = getOrCreateAudioPanel();
  if (!panel) return;
  const files = tree ? getAudioAssetFiles(tree) : [];
  panel.refresh(files);
}

// ══════════════════════════════════════════════════════════════════════
// CAMERA PREVIEW PANEL — Phase 3
// ══════════════════════════════════════════════════════════════════════
function initCameraPreviewPanel() {
  if (!window.CameraPreviewPanel) return;
  window.CameraPreviewPanel.mount();
  _wireCameraPreviewControls();
  _wireCameraOverlayMenu();
  _restoreCameraPreviewState();
  setInterval(_updateCameraDiagnostics, 250);
}

function _resolvePreviewCamera() {
  const cameras = getNodes().filter(n => n && n.type === 'Camera2D');
  if (!cameras.length) return null;
  const id = state.cameraPreview?.selectedCameraId;
  if (id) { const f = cameras.find(c => c.id === id); if (f) return f; }
  return cameras.find(c => c.properties?.current) || cameras[0];
}

function _camToolFocus(cam) {
  if (!cam) cam = _resolvePreviewCamera();
  if (!cam) return;
  const tx = Number(cam.transform?.x) || 0;
  const ty = Number(cam.transform?.y) || 0;
  const stageEl = document.getElementById('stage-container');
  const svw = stageEl ? stageEl.offsetWidth : 800;
  const svh = stageEl ? stageEl.offsetHeight : 600;
  state.viewport.x = svw / 2 - tx * state.viewport.scale;
  state.viewport.y = svh / 2 - ty * state.viewport.scale;
  applyViewportTransform();
  scheduleRender(RenderFlags.VIEWPORT);
  setStatus(`Focused on ${cam.name || 'Camera'}.`);
}

function _camToolFrame(cam) {
  if (!cam) cam = _resolvePreviewCamera();
  if (!cam) return;
  const tx  = Number(cam.transform?.x)        || 0;
  const ty  = Number(cam.transform?.y)        || 0;
  const camW = Number(cam.properties?.width)  || 1920;
  const camH = Number(cam.properties?.height) || 1080;
  const stageEl = document.getElementById('stage-container');
  const svw = stageEl ? stageEl.offsetWidth : 800;
  const svh = stageEl ? stageEl.offsetHeight : 600;
  const fitScale = Math.min(svw / (camW * 1.15), svh / (camH * 1.15));
  state.viewport.scale = Math.max(0.1, Math.min(4, fitScale));
  state.viewport.x = svw / 2 - tx * state.viewport.scale;
  state.viewport.y = svh / 2 - ty * state.viewport.scale;
  applyViewportTransform(); updateZoomReadout();
  scheduleRender(RenderFlags.VIEWPORT);
  setStatus(`Framed ${cam.name || 'Camera'}.`);
}

function _camToolJump(cam) { _camToolFrame(cam); }

function _wireCameraPreviewControls() {
  const selector = document.getElementById('camera-preview-selector');
  if (selector && !selector._rgeCameraWired) {
    selector._rgeCameraWired = true;
    selector.addEventListener('change', () => {
      if (state.cameraPreview) state.cameraPreview.selectedCameraId = selector.value || null;
      _persistCameraPreviewState();
      scheduleRender(RenderFlags.VIEWPORT);
    });
  }
  const focusBtn = document.getElementById('camera-preview-focus');
  if (focusBtn && !focusBtn._rgeCameraWired) {
    focusBtn._rgeCameraWired = true;
    focusBtn.addEventListener('click', () => _camToolFocus(null));
  }
  const frameBtn = document.getElementById('camera-preview-frame');
  if (frameBtn && !frameBtn._rgeCameraWired) {
    frameBtn._rgeCameraWired = true;
    frameBtn.addEventListener('click', () => _camToolFrame(null));
  }
  const resetBtn = document.getElementById('camera-preview-reset');
  if (resetBtn && !resetBtn._rgeCameraWired) {
    resetBtn._rgeCameraWired = true;
    resetBtn.addEventListener('click', () => {
      if (state.cameraPreview) state.cameraPreview.selectedCameraId = null;
      refreshCameraPreviewSelector();
      _persistCameraPreviewState();
    });
  }

  // Preview zoom buttons
  const zoomBtns = [
    ['cpv-zoom-fit', 'fit'], ['cpv-zoom-100', 1], ['cpv-zoom-200', 2], ['cpv-zoom-400', 4]
  ];
  zoomBtns.forEach(([id, z]) => {
    const btn = document.getElementById(id);
    if (btn && !btn._rgeCameraWired) {
      btn._rgeCameraWired = true;
      btn.addEventListener('click', () => {
        if (window.CameraPreviewPanel?.setZoom) window.CameraPreviewPanel.setZoom(z);
      });
    }
  });

  // Pause / resume
  const pauseBtn = document.getElementById('cpv-pause');
  if (pauseBtn && !pauseBtn._rgeCameraWired) {
    pauseBtn._rgeCameraWired = true;
    pauseBtn.addEventListener('click', () => {
      const paused = window.CameraPreviewPanel?.togglePause?.();
      if (pauseBtn) pauseBtn.textContent = paused ? '▶' : '⏸';
    });
  }

  // Refresh
  const refreshBtn = document.getElementById('cpv-refresh');
  if (refreshBtn && !refreshBtn._rgeCameraWired) {
    refreshBtn._rgeCameraWired = true;
    refreshBtn.addEventListener('click', () => {
      if (window.CameraPreviewPanel?.forceRefresh) window.CameraPreviewPanel.forceRefresh();
    });
  }
}

function _wireCameraOverlayMenu() {
  const menuBtn  = document.getElementById('btn-camera-overlays');
  const dropdown = document.getElementById('camera-overlays-dropdown');
  if (menuBtn && dropdown) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !dropdown.classList.contains('hidden');
      document.querySelectorAll('.toolbar-menu-dropdown').forEach(d => d.classList.add('hidden'));
      document.querySelectorAll('.toolbar-menu-trigger').forEach(b => b.setAttribute('aria-expanded','false'));
      if (!open) { dropdown.classList.remove('hidden'); menuBtn.setAttribute('aria-expanded','true'); }
    });
    document.addEventListener('click', () => {
      dropdown.classList.add('hidden'); menuBtn.setAttribute('aria-expanded','false');
    });
  }

  const toggleMap = [
    ['cam-toggle-frame',     'showFrame'],
    ['cam-toggle-deadzone',  'showDeadZone'],
    ['cam-toggle-lookahead', 'showLookAhead'],
    ['cam-toggle-bounds',    'showBounds'],
    ['cam-toggle-labels',    'showLabels'],
    ['cam-toggle-zones',     'showZones'],
    ['cam-toggle-paths',     'showPaths'],
    ['cam-toggle-targetgroups',     'showTargetGroups'],
  ];
  toggleMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (state.cameraPreview?.overlays) el.checked = state.cameraPreview.overlays[key] !== false;
    el.addEventListener('change', () => {
      if (state.cameraPreview?.overlays) state.cameraPreview.overlays[key] = el.checked;
      _persistCameraPreviewState();
      scheduleRender(RenderFlags.VIEWPORT);
    });
  });

  const focusItem = document.getElementById('cam-tool-focus');
  if (focusItem) focusItem.addEventListener('click', () => { dropdown?.classList.add('hidden'); _camToolFocus(null); });
  const frameItem = document.getElementById('cam-tool-frame');
  if (frameItem) frameItem.addEventListener('click', () => { dropdown?.classList.add('hidden'); _camToolFrame(null); });
  const jumpItem  = document.getElementById('cam-tool-jump');
  if (jumpItem)  jumpItem.addEventListener('click',  () => { dropdown?.classList.add('hidden'); _camToolJump(null);  });

  const panelToggle = document.getElementById('btn-camera-preview');
  if (panelToggle && !panelToggle._rgeCameraWired) {
    panelToggle._rgeCameraWired = true;
    panelToggle.addEventListener('click', () => {
      dropdown?.classList.add('hidden');
      // Delegate entirely to the dock system. The tab button's click handler in
      // dock_drag.js calls activateTab() which shows the panel and manages layout.
      // If the tab has been hidden (moved to dock-hidden-host), the Tabs menu or
      // drag-to-dock brings it back — no custom fallback needed.
      const tab = document.querySelector('button.rge-dock-tab[data-dock-key="camera-preview"]');
      if (tab) tab.click();
    });
  }
}

function _persistCameraPreviewState() {
  try {
    localStorage.setItem('rge.cameraPreview.v1', JSON.stringify({
      selectedCameraId: state.cameraPreview?.selectedCameraId || null,
      overlays: state.cameraPreview?.overlays || {},
    }));
  } catch(_) {}
}

function _restoreCameraPreviewState() {
  try {
    const raw = localStorage.getItem('rge.cameraPreview.v1');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!state.cameraPreview) return;
    if (data.selectedCameraId) state.cameraPreview.selectedCameraId = data.selectedCameraId;
    if (data.overlays && state.cameraPreview.overlays) Object.assign(state.cameraPreview.overlays, data.overlays);
    requestAnimationFrame(() => {
      const toggleMap = [
        ['cam-toggle-frame','showFrame'],['cam-toggle-deadzone','showDeadZone'],
        ['cam-toggle-lookahead','showLookAhead'],['cam-toggle-bounds','showBounds'],
        ['cam-toggle-labels','showLabels'],['cam-toggle-zones','showZones'],['cam-toggle-paths','showPaths'],['cam-toggle-targetgroups','showTargetGroups'],
      ];
      toggleMap.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el && state.cameraPreview?.overlays) el.checked = state.cameraPreview.overlays[key] !== false;
      });
    });
  } catch(_) {}
}

function _updateCameraDiagnostics() {
  const cam = _resolvePreviewCamera();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (!cam) {
    ['diag-position','diag-zoom','diag-visible-area','diag-deadzone','diag-lookahead','diag-bounds','diag-preset'].forEach(id => set(id,'—'));
    return;
  }
  const tx   = Number(cam.transform?.x)           || 0;
  const ty   = Number(cam.transform?.y)           || 0;
  const camW = Number(cam.properties?.width)      || 1920;
  const camH = Number(cam.properties?.height)     || 1080;
  const zoom = Number(cam.properties?.zoom)       || 1;
  const dzw  = Number(cam.properties?.deadzoneWidth)  || 0;
  const dzh  = Number(cam.properties?.deadzoneHeight) || 0;
  const lax  = Number(cam.properties?.lookAheadX)     || 0;
  const lay  = Number(cam.properties?.lookAheadY)     || 0;
  const hasBounds = (state.sceneState?.nodes||[]).some(n => n && n.type === 'CameraBounds2D');
  set('diag-position',    `${Math.round(tx)}, ${Math.round(ty)}`);
  set('diag-zoom',        zoom.toFixed(2));
  set('diag-visible-area',`${camW} × ${camH}`);
  set('diag-deadzone',    dzw > 0 && dzh > 0 ? `${Math.round(dzw)} × ${Math.round(dzh)}` : 'None');
  set('diag-lookahead',   lax !== 0 || lay !== 0 ? `X ${Math.round(lax)},  Y ${Math.round(lay)}` : 'None');
  set('diag-bounds',      hasBounds ? 'Active' : 'None');
  set('diag-preset',      cam.properties?.cameraPreset || 'None');
  // Active zones (zones whose rect contains the camera center)
  const allSceneNodes = state.sceneState?.nodes || [];
  const activeZones = allSceneNodes.filter(n => {
    if (!n || n.type !== 'CameraZone2D') return false;
    const zx = Number(n.transform?.x) || 0, zy = Number(n.transform?.y) || 0;
    const zw = Number(n.properties?.width) || 512, zh = Number(n.properties?.height) || 288;
    return tx >= zx && tx <= zx+zw && ty >= zy && ty <= zy+zh;
  });
  set('diag-zones', activeZones.length > 0 ? activeZones.map(z => z.name || z.properties?.mode || 'Zone').join(', ') : 'None');
}

function refreshCameraPreviewSelector() {
  const selector = document.getElementById('camera-preview-selector');
  if (!selector) return;
  const cameras  = getNodes().filter(n => n && n.type === 'Camera2D');
  const currentId = state.cameraPreview?.selectedCameraId;
  const existingIds = Array.from(selector.options).map(o => o.value);
  const newIds = cameras.map(c => c.id);
  const needsRebuild = existingIds.length !== newIds.length || existingIds.some((id,i) => id !== newIds[i]);
  if (needsRebuild) {
    selector.innerHTML = '';
    if (!cameras.length) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = '— No cameras —'; selector.appendChild(opt);
    } else {
      cameras.forEach(cam => {
        const opt = document.createElement('option'); opt.value = cam.id;
        opt.textContent = cam.name || `Camera (${cam.id.slice(0,6)})`; selector.appendChild(opt);
      });
    }
  } else {
    cameras.forEach((cam,i) => { if (selector.options[i]) selector.options[i].textContent = cam.name || `Camera (${cam.id.slice(0,6)})`; });
  }
  let resolvedId = currentId;
  if (currentId && !cameras.find(c => c.id === currentId)) resolvedId = null;
  if (!resolvedId && cameras.length) resolvedId = cameras.find(c => c.properties?.current)?.id || cameras[0].id;
  if (state.cameraPreview) state.cameraPreview.selectedCameraId = resolvedId || null;
  selector.value = resolvedId || '';
}

function notifyCameraPreviewSceneChanged() {
  refreshCameraPreviewSelector();
  if (window.CameraPreviewPanel?.refreshCameraList) window.CameraPreviewPanel.refreshCameraList();
  scheduleRender(RenderFlags.VIEWPORT);
}

// ══════════════════════════════════════════════════════════════════════
// ANIMATION DATA HELPERS
// ══════════════════════════════════════════════════════════════════════
function getSelectedAnimationNode() {
  const node = getNode(state.selectedId);
  return node?.type === 'AnimatedSprite2D' ? node : null;
}
function isAnimatedSpriteAutoplayEnabled(node) {
  const raw = node?.properties?.autoplay;
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (!value) return false;
    if (['false', '0', 'off', 'no'].includes(value)) return false;
    if (['true', '1', 'on', 'yes'].includes(value)) return true;
    return true;
  }
  return !!raw;
}

function normalizeAnimatedSpriteFlags(node) {
  if (!node || node.type !== 'AnimatedSprite2D') return null;
  node.properties = node.properties || {};
  node.properties.playing = node.properties.playing !== false;
  node.properties.autoplay = isAnimatedSpriteAutoplayEnabled(node);
  return node.properties;
}

function shouldAutoPlaySelectedAnimation(node = getSelectedAnimationNode()) {
  if (!node || node.type !== 'AnimatedSprite2D') return false;
  normalizeAnimatedSpriteFlags(node);
  return node.properties.playing !== false && node.properties.autoplay === true;
}
function getSheetById(sheetId)       { return state.spritesheets.find((s) => s.id === sheetId) || null; }
function getSelectedSheet() {
  const activeId = state.spriteEditor?.activeSheetId || state.selectedSheetId;
  const sheet = state.spritesheets.find((s) => s.id === activeId) || null;
  if (sheet && state.selectedSheetId !== sheet.id) {
    state.selectedSheetId = sheet.id;
  }
  return sheet;
}
function getNodeAssignedSheet(node) {
  if (!node) return null;

  const clip = getCurrentAnimationClip(node);
  const id = clip?.spriteSheetId || null;

  return id ? getSheetById(id) : null;
}

function ensureAnimationNodeData(node) {
  if (!node || node.type !== 'AnimatedSprite2D') return null;

  normalizeAnimatedSpriteFlags(node);

  let lib = getNodeSpriteFramesLibrary(node);

  if (!lib) {
    if (state.selectedSpriteFramesId) {
      lib = getSpriteFramesLibraryById(state.selectedSpriteFramesId);
    }
    if (!lib && state.spriteFramesLibraries.length) {
      lib = state.spriteFramesLibraries[0];
    }
    if (!lib) {
      lib = createSpriteFramesLibrary('SpriteFrames');
    }

    node.properties.spriteFramesId = lib.id;
  }

  ensureSpriteFramesLibraryShape(lib);

  if (!node.properties.animation || !lib.clips.some((c) => c.name === node.properties.animation)) {
    node.properties.animation = lib.clips[0]?.name || '';
  }

  return lib.clips;
}

function syncAnimationEditorFromSelection(options = {}) {
  const node = getSelectedAnimationNode();
  if (node) {
    normalizeAnimatedSpriteFlags(node);
    const clip = getCurrentAnimationClip(node);
    state.spriteEditor.animationFrames    = Array.isArray(clip?.frames) ? clip.frames.slice() : [];
    state.spriteEditor.previewFps         = Math.max(1, Number(clip?.fps) || state.spriteEditor.previewFps || 8);
    state.spriteEditor.selectedFrameIndex = -1;
    const linkedId = node.properties?.spriteSheetId || node.metadata?.spriteSheetId;
    if (linkedId && state.spritesheets.some((s) => s.id === linkedId)) state.selectedSheetId = linkedId;
    if (clip?.frames?.length) {
      node.properties.previewFrame = clip.frames[0];
      node.properties.frame = 0;
    } else {
      node.properties.frame = 0;
    }
  }
  if (!options.silent) {
    const shouldAutoplay = shouldAutoPlaySelectedAnimation(node) && state.spriteEditor.animationFrames.length > 0;
    if (shouldAutoplay) restartAnimationPreview();
    else if (state.spriteEditor.isPlaying || !node) stopAnimationPreview({ resetToStart: false });
    else renderSFPreview();
  }
}

function syncAnimationClipToSelectedNode(options = {}) {
  const node = getSelectedAnimationNode();
  if (!node) return false;

  const clip = getCurrentAnimationClip(node);
  if (!clip) return false;

  clip.frames = state.spriteEditor.animationFrames.slice();

  if (options.updateFps !== false) {
    clip.fps = Math.max(1, Number(state.spriteEditor.previewFps) || 8);
  }

  if (options.updatePlaybackMode !== false) {
    const nextMode = (sfPlaybackModeEl?.value || clip.playbackMode || (clip.loop === false ? 'once' : 'loop') || 'loop');
    clip.playbackMode = nextMode;
    clip.loop = nextMode !== 'once';
  }

  const selectedSheet = getSelectedSheet();
  if (selectedSheet?.id) {
    clip.spriteSheetId = selectedSheet.id;
  }

  if (clip.frames.length) {
    const tick = state.spriteEditor.previewTick % Math.max(1, clip.frames.length);
    node.properties.previewFrame = clip.frames[tick] ?? clip.frames[0];
  }

  syncSpriteFramesLibrariesToSceneState();
  return true;
}


function beginInlineClipRename(name, options = {}) {
  const node = getSelectedAnimationNode();
  if (!node) return false;
  ensureAnimationNodeData(node);

  state.spriteEditor.editingClipName = name || null;
  state.spriteEditor.pendingNewClipName = options.isNew ? (name || null) : null;
  renderSpriteFramesPanel();

  requestAnimationFrame(() => {
    const input = document.querySelector('.sf-anim-item-input');
    if (input) {
      input.focus();
      input.select();
    }
  });

  return true;
}

function cancelInlineClipRename() {
  const pending = state.spriteEditor.pendingNewClipName;
  const node = getSelectedAnimationNode();

  if (pending && node) {
    const clips = ensureAnimationNodeData(node);
    const idx = clips.findIndex((c) => c.name === pending && (!c.frames || c.frames.length === 0));
    if (idx >= 0) {
      clips.splice(idx, 1);
      node.properties.animation = clips[0]?.name || '';
      state.spriteEditor.animationFrames = Array.isArray(clips[0]?.frames) ? clips[0].frames.slice() : [];
    }
  }

  state.spriteEditor.editingClipName = null;
  state.spriteEditor.pendingNewClipName = null;
  renderSpriteFramesPanel();
}

function commitInlineClipRename(oldName, nextNameRaw) {
  const node = getSelectedAnimationNode();
  if (!node) return false;

  const clips = ensureAnimationNodeData(node);
  const clip = clips.find((c) => c.name === oldName);
  if (!clip) {
    state.spriteEditor.editingClipName = null;
    state.spriteEditor.pendingNewClipName = null;
    renderSpriteFramesPanel();
    return false;
  }

  const nextName = String(nextNameRaw || '').trim();

  if (!nextName) {
    if (state.spriteEditor.pendingNewClipName === oldName) {
      const idx = clips.indexOf(clip);
      if (idx >= 0) clips.splice(idx, 1);
      node.properties.animation = clips[0]?.name || '';
      syncAnimationEditorFromSelection({ silent: true });
      state.spriteEditor.editingClipName = null;
      state.spriteEditor.pendingNewClipName = null;
      renderSpriteFramesPanel();
      refreshInspector();
      setStatus('Clip creation cancelled.');
      return false;
    }

    state.spriteEditor.editingClipName = null;
    state.spriteEditor.pendingNewClipName = null;
    renderSpriteFramesPanel();
    setStatus('Clip name cannot be empty.', true);
    return false;
  }

  if (clips.some((c) => c !== clip && c.name === nextName)) {
    renderSpriteFramesPanel();
    requestAnimationFrame(() => {
      const input = document.querySelector('.sf-anim-item-input');
      if (input) {
        input.focus();
        input.select();
      }
    });
    setStatus(`Clip "${nextName}" already exists.`, true);
    return false;
  }

  if (state.spriteEditor.pendingNewClipName === oldName) {
    pushHistory('Create animation clip');
  } else if (oldName != nextName) {
    pushHistory('Rename animation clip');
  }

  clip.name = nextName;
  node.properties.animation = nextName;

  state.spriteEditor.editingClipName = null;
  state.spriteEditor.pendingNewClipName = null;

  renderSpriteFramesPanel();
  refreshInspector();
  scheduleRender(RenderFlags.VIEWPORT);

  if (oldName === nextName) setStatus(`Editing clip "${nextName}".`);
  else setStatus(`Renamed clip to "${nextName}".`);

  return true;
}

async function createAnimationClip() {
  const node = getSelectedAnimationNode();
  if (!node) {
    setStatus('Select an AnimatedSprite2D node first.', true);
    return;
  }

  const lib = getNodeSpriteFramesLibrary(node);
  if (!lib) {
    setStatus('No SpriteFrames library assigned.', true);
    return;
  }

  ensureSpriteFramesLibraryShape(lib);

  let suggested = 'new_anim';
  let suffix = 2;
  while (lib.clips.some((c) => c.name === suggested)) suggested = `new_anim_${suffix++}`;

  lib.clips.push({
    name: suggested,
    frames: [],
    fps: Math.max(1, Number(state.spriteEditor.previewFps) || 8),
    loop: true,
    playbackMode: 'loop',
    spriteSheetId: state.selectedSheetId || lib.defaultSheetId || ''
  });

  node.properties.animation = suggested;
  node.properties.previewFrame = 0;
  state.spriteEditor.animationFrames = [];
  state.spriteEditor.selectedFrameIndex = -1;

  beginInlineClipRename(suggested, { isNew: true });
  refreshInspector();
  scheduleRender(RenderFlags.VIEWPORT);
  setStatus(`New global clip created. Enter a name for "${suggested}".`);
}

async function renameCurrentAnimationClip() {
  const node = getSelectedAnimationNode();
  const clip = getCurrentAnimationClip(node);
  if (!node || !clip) { setStatus('Select an AnimatedSprite2D clip first.', true); return; }

  beginInlineClipRename(clip.name, { isNew: false });
  setStatus(`Renaming clip "${clip.name}".`);
}

function deleteCurrentAnimationClip() {
  const node = getSelectedAnimationNode();
  const clip = getCurrentAnimationClip(node);
  if (!node || !clip) { setStatus('Select an AnimatedSprite2D clip first.', true); return; }

  const clips = ensureAnimationNodeData(node);
  pushHistory('Delete animation clip');

  if (clips.length <= 1) {
    clip.frames = [];
    clip.fps = 6;
    clip.loop = true;
    clip.playbackMode = 'loop';
    state.spriteEditor.animationFrames = [];
    state.spriteEditor.selectedFrameIndex = -1;
    state.spriteEditor.editingClipName = null;
    state.spriteEditor.pendingNewClipName = null;
    stopAnimationPreview();
    renderSpriteFramesPanel();
    refreshInspector();
    scheduleRender(RenderFlags.VIEWPORT);
    setStatus(`Cleared clip "${clip.name}".`);
    return;
  }

  const idx = clips.indexOf(clip);
  const deletedName = clip.name;
  clips.splice(idx, 1);

  const nextClip = clips[Math.max(0, idx - 1)] || clips[0] || null;
  node.properties.animation = nextClip?.name || '';
  state.spriteEditor.editingClipName = null;
  state.spriteEditor.pendingNewClipName = null;

  syncAnimationEditorFromSelection();
  stopAnimationPreview();
  scheduleRender(RenderFlags.VIEWPORT);
  renderSpriteFramesPanel();
  refreshInspector();
  setStatus(`Deleted clip "${deletedName}".`);
}

function selectAnimationClip(name) {
  const node = getSelectedAnimationNode();
  if (!node) return;

  normalizeAnimatedSpriteFlags(node);

  const lib = getNodeSpriteFramesLibrary(node);
  if (!lib) return;

  const clip = lib.clips.find((c) => c.name === name);
  if (!clip) return;

  node.properties.animation = clip.name;

  if (clip.spriteSheetId && state.spritesheets.some((s) => s.id === clip.spriteSheetId)) {
    state.selectedSheetId = clip.spriteSheetId;
  }

  node.properties.previewFrame = clip.frames?.[0] ?? 0;
  node.properties.frame = 0;
  state.spriteEditor.animationFrames = clip.frames.slice();
  state.spriteEditor.previewFps = Math.max(1, Number(clip.fps) || 8);
  state.spriteEditor.previewTick = 0;
  state.spriteEditor.playbackDirection = 1;
  state.spriteEditor.selectedFrameIndex = clip.frames.length ? 0 : -1;
  state.selectedSpriteFramesId = lib.id;

  if (shouldAutoPlaySelectedAnimation(node) || state.spriteEditor.isPlaying) restartAnimationPreview();
  else {
    state.spriteEditor.previewTick = 0;
    renderSFPreview();
  }

  renderSpriteFramesPanel();
  refreshInspector();
  scheduleRender(RenderFlags.VIEWPORT);
  setStatus(`Selected clip "${clip.name}".`);
}

function getSpriteFramesLibraryById(id) {
  return state.spriteFramesLibraries.find((lib) => lib.id === id) || null;
}

function ensureSpriteFramesLibraryShape(lib) {
  if (!lib) return null;

  lib.id = lib.id || `sflib_${Math.random().toString(36).slice(2, 9)}`;
  lib.name = String(lib.name || 'SpriteFrames');
  lib.defaultSheetId = String(lib.defaultSheetId || '');

  if (!Array.isArray(lib.clips) || !lib.clips.length) {
    lib.clips = [{
      name: 'idle',
      frames: [],
      fps: 6,
      loop: true,
      playbackMode: 'loop',
      spriteSheetId: lib.defaultSheetId || ''
    }];
  }

  lib.clips = lib.clips.map((c, i) => ({
    name: String(c?.name || `clip_${i + 1}`),
    frames: Array.isArray(c?.frames)
      ? c.frames.filter((v) => Number.isInteger(v) && v >= 0)
      : [],
    fps: Math.max(1, Number(c?.fps) || 6),
    loop: c?.loop !== false,
    playbackMode: String(c?.playbackMode || (c?.loop === false ? 'once' : 'loop')),
    spriteSheetId: String(c?.spriteSheetId || lib.defaultSheetId || '')
  }));

  const names = new Set();
  lib.clips.forEach((c, i) => {
    let name = c.name || `clip_${i + 1}`;
    let suffix = 2;
    while (names.has(name)) name = `${c.name}_${suffix++}`;
    c.name = name;
    names.add(name);
  });

  return lib;
}

function createSpriteFramesLibrary(name = 'SpriteFrames') {
  const lib = ensureSpriteFramesLibraryShape({
    id: `sflib_${Math.random().toString(36).slice(2, 9)}`,
    name,
    defaultSheetId: state.selectedSheetId || '',
    clips: [{
      name: 'idle',
      frames: [],
      fps: 6,
      loop: true,
      playbackMode: 'loop',
      spriteSheetId: state.selectedSheetId || ''
    }]
  });

  state.spriteFramesLibraries.push(lib);
  state.selectedSpriteFramesId = lib.id;
  syncSpriteFramesLibrariesToSceneState();
  return lib;
}

function getNodeSpriteFramesLibrary(node = getSelectedAnimationNode()) {
  if (!node || node.type !== 'AnimatedSprite2D') return null;
  const libId = node.properties?.spriteFramesId || '';
  return libId ? getSpriteFramesLibraryById(libId) : null;
}

function getCurrentAnimationClip(node = getSelectedAnimationNode()) {
  const lib = getNodeSpriteFramesLibrary(node);
  if (!node || !lib) return null;

  ensureSpriteFramesLibraryShape(lib);

  const animName = node.properties?.animation || '';
  return lib.clips.find((c) => c.name === animName) || lib.clips[0] || null;
}

// ══════════════════════════════════════════════════════════════════════
// SPRITEFRAMES PANEL — Godot-style
// ══════════════════════════════════════════════════════════════════════
function renderSpriteFramesPanel() {
  const node = getSelectedAnimationNode();
  const clip = getCurrentAnimationClip(node);

  // ── Sidebar: clip list ──────────────────────────────────────────────
  if (sfAnimItemsEl) {
    sfAnimItemsEl.innerHTML = '';
    if (!node) {
      const msg = document.createElement('div'); msg.className = 'sf-empty-notice';
      msg.textContent = 'Select an AnimatedSprite2D node.';
      sfAnimItemsEl.appendChild(msg);
    } else {
      const clips = ensureAnimationNodeData(node);
      clips.forEach((c) => {
        const isActive = c.name === node.properties.animation;
        const isEditing = state.spriteEditor.editingClipName === c.name;

        const row = document.createElement('div');
        row.className = 'sf-anim-item' + (isActive ? ' active' : '');

        const icon = document.createElement('span');
        icon.className = 'sf-anim-item-icon';
        icon.textContent = '▶';

        row.appendChild(icon);

        if (isEditing) {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'sf-anim-item-input';
          input.value = c.name;
          input.spellcheck = false;

          input.addEventListener('click', (e) => e.stopPropagation());
          input.addEventListener('dblclick', (e) => e.stopPropagation());

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitInlineClipRename(c.name, input.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelInlineClipRename();
            }
          });

          input.addEventListener('blur', () => {
            if (state.spriteEditor.editingClipName === c.name) {
              commitInlineClipRename(c.name, input.value);
            }
          });

          row.appendChild(input);
        } else {
          const nameEl = document.createElement('span');
          nameEl.className = 'sf-anim-item-name';
          nameEl.textContent = c.name;
          row.appendChild(nameEl);
        }

        const meta = document.createElement('span');
        meta.className = 'sf-anim-item-meta';
        meta.textContent = `${(c.frames || []).length}f · ${c.fps || 6}fps${c.loop !== false ? ' ↻' : ''}`;
        row.appendChild(meta);

        row.addEventListener('click', () => {
          if (isEditing) return;
          if (clipClickTimer) clearTimeout(clipClickTimer);
          clipClickTimer = setTimeout(() => {
            clipClickTimer = null;
            selectAnimationClip(c.name);
          }, 200);
        });

        row.addEventListener('dblclick', () => {
          if (clipClickTimer) {
            clearTimeout(clipClickTimer);
            clipClickTimer = null;
          }
          beginInlineClipRename(c.name, { isNew: false });
        });

        row.title = isEditing
          ? 'Enter to save · Esc to cancel'
          : 'Click to select · Double-click to rename';

        sfAnimItemsEl.appendChild(row);
      });
    }
  }

  // ── Sync toolbar inputs from current clip ───────────────────────────
  if (sfFpsEl) sfFpsEl.value = clip ? (clip.fps || 8) : 8;
  if (sfPlaybackModeEl) {
    const playbackMode = clip?.playbackMode || (clip?.loop === false ? 'once' : 'loop');
    sfPlaybackModeEl.value = playbackMode;
  }

  // ── Play button state ────────────────────────────────────────────────
  if (sfPlayBtnEl) {
    sfPlayBtnEl.classList.toggle('is-playing', state.spriteEditor.isPlaying);
    sfPlayBtnEl.textContent = state.spriteEditor.isPlaying ? '⏸' : '▶';
    sfPlayBtnEl.title = state.spriteEditor.isPlaying ? 'Pause preview' : 'Play preview';
  }

  // ── Frame strip ──────────────────────────────────────────────────────
  if (sfFrameStripEl) {
    sfFrameStripEl.innerHTML = '';
    if (!node) {
      const msg = document.createElement('div'); msg.className = 'sf-empty-notice';
      msg.textContent = 'Select an AnimatedSprite2D node to edit its SpriteFrames.';
      sfFrameStripEl.appendChild(msg);
    } else if (!clip || !state.spriteEditor.animationFrames.length) {
      const msg = document.createElement('div'); msg.className = 'sf-empty-notice';
      msg.textContent = clip
        ? 'No frames yet. Go to the Sprites tab, select a tile, then click "+ Frame".'
        : 'No clip selected.';
      sfFrameStripEl.appendChild(msg);
    } else {
      const sheet   = getNodeAssignedSheet(node) || getSelectedSheet();
      const frames  = state.spriteEditor.animationFrames;
      const playTick = state.spriteEditor.isPlaying
        ? (state.spriteEditor.previewTick % Math.max(1, frames.length))
        : -1;

      frames.forEach((frameIndex, i) => {
        const isSelected = state.spriteEditor.selectedFrameIndex === i;
        const isPlaying  = i === playTick;

        const thumb = document.createElement('div');
        thumb.className = 'sf-frame-thumb'
          + (isSelected ? ' selected' : '')
          + (isPlaying  ? ' playing'  : '');
        thumb.title = `Frame ${i} → tile #${frameIndex}\nClick to select · Right-click to remove`;

        const idxLabel = document.createElement('span');
        idxLabel.className = 'sf-frame-thumb-idx';
        idxLabel.textContent = String(i);

        const img = document.createElement('img');
        img.src = sheet ? (extractTileDataUrl(sheet, frameIndex) || '') : '';
        img.alt = `tile ${frameIndex}`;

        const label = document.createElement('span');
        label.className = 'sf-frame-thumb-label';
        label.textContent = `#${frameIndex}`;

        thumb.appendChild(idxLabel); thumb.appendChild(img); thumb.appendChild(label);

        thumb.addEventListener('click', () => {
          state.spriteEditor.selectedTileIndex = frameIndex;
          seekAnimationPreview(i, { preserveSelection: false });
        });

        thumb.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const n = getSelectedAnimationNode();
          if (n) pushHistory('Remove animation frame');
          state.spriteEditor.animationFrames.splice(i, 1);
          state.spriteEditor.selectedFrameIndex = Math.min(
            Math.max(0, state.spriteEditor.selectedFrameIndex),
            state.spriteEditor.animationFrames.length - 1
          );
          if (state.spriteEditor.animationFrames.length === 0) state.spriteEditor.selectedFrameIndex = -1;
          syncAnimationClipToSelectedNode();
          if (state.spriteEditor.isPlaying) restartAnimationPreview();
          renderSpriteFramesPanel(); scheduleRender(RenderFlags.VIEWPORT);
        });

        sfFrameStripEl.appendChild(thumb);
      });
    }
  }

  renderSFPreview();
}

function getClipPlaybackMode(clip) {
  return clip?.playbackMode || (clip?.loop === false ? 'once' : 'loop') || 'loop';
}

function updateTimelineUI(frameCount = state.spriteEditor.animationFrames.length) {
  if (!sfTimelineEl) return;
  const count = Math.max(0, Number(frameCount) || 0);
  const max = Math.max(0, count - 1);
  const current = Math.min(Math.max(0, Number(state.spriteEditor.previewTick) || 0), max);
  sfTimelineEl.disabled = count <= 1;
  sfTimelineEl.min = '0';
  sfTimelineEl.max = String(max);
  sfTimelineEl.value = String(current);
  if (sfTimelineCurrentEl) sfTimelineCurrentEl.textContent = count ? `${current + 1} / ${count}` : '0 / 0';
}

function updateFrameStripPlaybackState() {
  if (!sfFrameStripEl) return;
  const current = Math.max(0, Number(state.spriteEditor.previewTick) || 0);
  const thumbs = sfFrameStripEl.querySelectorAll('.sf-frame-thumb');
  thumbs.forEach((el, i) => {
    el.classList.toggle('playing', i === current && state.spriteEditor.animationFrames.length > 0);
    el.classList.toggle('selected', i === state.spriteEditor.selectedFrameIndex);
  });
}

function seekAnimationPreview(frameIndex, options = {}) {
  const frames = state.spriteEditor.animationFrames;
  if (!frames.length) {
    state.spriteEditor.previewTick = 0;
    state.spriteEditor.selectedFrameIndex = -1;
    updateTimelineUI(0);
    updateFrameStripPlaybackState();
    renderSFPreview();
    return false;
  }

  const bounded = Math.max(0, Math.min(frames.length - 1, Number(frameIndex) || 0));
  state.spriteEditor.previewTick = bounded;
  if (!options.preserveSelection) state.spriteEditor.selectedFrameIndex = bounded;
  state.spriteEditor.selectedTileIndex = frames[bounded] ?? state.spriteEditor.selectedTileIndex;

  const node = getSelectedAnimationNode();
  if (node) {
    node.properties.previewFrame = frames[bounded] ?? 0;
    node.properties.frame = bounded;
    // Patch only the sprite crop on the existing Konva node — avoid full teardown.
    // If a transformer drag is active, patchAnimatedSpriteFrameInViewport returns false
    // and we must NOT fall back to renderViewport() — that would rebuild the scene
    // mid-drag, resetting the Group scale and breaking the transformer handles.
    if (!patchAnimatedSpriteFrameInViewport(node) && !state.transformerSession) {
      scheduleRender(RenderFlags.VIEWPORT);
    }
  }

  updateTimelineUI(frames.length);
  updateFrameStripPlaybackState();
  renderSFPreview();
  return true;
}

// ── Preview canvas in SpriteFrames toolbar ─────────────────────────────
function renderSFPreview() {
  if (!sfPreviewCanvasEl || !sfPreviewMetaEl) return;
  const ctx = sfPreviewCanvasEl.getContext('2d');
  ctx.clearRect(0, 0, sfPreviewCanvasEl.width, sfPreviewCanvasEl.height);
  ctx.imageSmoothingEnabled = false;

  const node   = getSelectedAnimationNode();
  const sheet  = node ? (getNodeAssignedSheet(node) || getSelectedSheet()) : getSelectedSheet();
  const frames = state.spriteEditor.animationFrames;

  if (!sheet?.image || !frames.length) {
    sfPreviewMetaEl.textContent = node ? (frames.length ? 'Assign a sheet to preview.' : 'No frames yet.') : 'No animation.';
    return;
  }

  const tick  = state.spriteEditor.previewTick % Math.max(1, frames.length);
  const tileRect = getTileRect(sheet, frames[tick] ?? 0);
  if (!tileRect) { sfPreviewMetaEl.textContent = 'Invalid frame.'; return; }

  const scale = Math.max(1, Math.floor(Math.min(sfPreviewCanvasEl.width / tileRect.width, sfPreviewCanvasEl.height / tileRect.height)));
  const dw = tileRect.width * scale, dh = tileRect.height * scale;
  ctx.drawImage(sheet.image, tileRect.x, tileRect.y, tileRect.width, tileRect.height,
    Math.floor((sfPreviewCanvasEl.width  - dw) / 2),
    Math.floor((sfPreviewCanvasEl.height - dh) / 2), dw, dh);

  const clip = getCurrentAnimationClip(node);
  const playbackMode = getClipPlaybackMode(clip);
  sfPreviewMetaEl.textContent = `${clip?.name || ''} · ${tick + 1}/${frames.length} · ${state.spriteEditor.previewFps}fps · ${playbackMode}${state.spriteEditor.isPlaying ? ' ▶' : ' ■'}`;
  updateTimelineUI(frames.length);
}

// ── Playback timer ─────────────────────────────────────────────────────
function stopAnimationPreview(options = {}) {
  if (state.spriteEditor.previewTimer) {
    clearInterval(state.spriteEditor.previewTimer);
    state.spriteEditor.previewTimer = null;
  }

  state.spriteEditor.isPlaying = false;
  state.spriteEditor.playbackDirection = 1;

  const frames = state.spriteEditor.animationFrames;
  const hasFrames = frames.length > 0;
  const resetToStart = options.resetToStart !== false;
  const targetTick = resetToStart ? 0 : Math.min(Math.max(0, state.spriteEditor.previewTick), Math.max(0, frames.length - 1));

  if (sfPlayBtnEl) {
    sfPlayBtnEl.textContent = '▶';
    sfPlayBtnEl.classList.remove('is-playing');
    sfPlayBtnEl.title = 'Play preview';
  }

  if (hasFrames) {
    seekAnimationPreview(targetTick, { preserveSelection: false });
  } else {
    state.spriteEditor.previewTick = 0;
    state.spriteEditor.selectedFrameIndex = -1;
    updateTimelineUI(0);
    updateFrameStripPlaybackState();
    renderSFPreview();
  }
}

function restartAnimationPreview() {
  if (state.spriteEditor.previewTimer) {
    clearInterval(state.spriteEditor.previewTimer);
    state.spriteEditor.previewTimer = null;
  }

  const node = getSelectedAnimationNode();
  const clip = getCurrentAnimationClip(node);
  const frames = state.spriteEditor.animationFrames;
  const fps = Math.max(1, Number(state.spriteEditor.previewFps) || 8);

  if (!frames.length || !clip) {
    state.spriteEditor.isPlaying = false;
    state.spriteEditor.playbackDirection = 1;
    if (sfPlayBtnEl) {
      sfPlayBtnEl.textContent = '▶';
      sfPlayBtnEl.classList.remove('is-playing');
      sfPlayBtnEl.title = 'Play preview';
    }
    updateTimelineUI(frames.length);
    updateFrameStripPlaybackState();
    renderSFPreview();
    return;
  }

  const playbackMode = getClipPlaybackMode(clip);
  state.spriteEditor.isPlaying = true;
  state.spriteEditor.playbackDirection = 1;

  if (sfPlayBtnEl) {
    sfPlayBtnEl.textContent = '⏸';
    sfPlayBtnEl.classList.add('is-playing');
    sfPlayBtnEl.title = 'Pause preview';
  }

  seekAnimationPreview(Math.min(Math.max(0, state.spriteEditor.previewTick || 0), frames.length - 1), { preserveSelection: false });

  const tick = () => {
    let nextTick = state.spriteEditor.previewTick;

    if (playbackMode === 'pingpong') {
      if (frames.length <= 1) {
        nextTick = 0;
      } else {
        nextTick += state.spriteEditor.playbackDirection;
        if (nextTick >= frames.length) {
          state.spriteEditor.playbackDirection = -1;
          nextTick = frames.length - 2;
        } else if (nextTick < 0) {
          state.spriteEditor.playbackDirection = 1;
          nextTick = 1;
        }
      }
    } else if (playbackMode === 'once') {
      nextTick += 1;
      if (nextTick >= frames.length) {
        seekAnimationPreview(frames.length - 1, { preserveSelection: false });
        stopAnimationPreview({ resetToStart: false });
        return;
      }
    } else {
      nextTick = (nextTick + 1) % frames.length;
    }

    seekAnimationPreview(nextTick, { preserveSelection: false });
  };

  state.spriteEditor.previewTimer = setInterval(tick, Math.round(1000 / fps));
}

// ══════════════════════════════════════════════════════════════════════
// SPRITES PANEL (sheet viewer)
// ══════════════════════════════════════════════════════════════════════
const SPRITE_CATEGORIES = [
  { id: 'player',       label: 'Player',       icon: '🧑' },
  { id: 'enemies',      label: 'Enemies',      icon: '👾' },
  { id: 'level',        label: 'Level',        icon: '🗺' },
  { id: 'ui',           label: 'UI',           icon: '🖼' },
  { id: 'uncategorized',label: 'Uncategorized',icon: '📁' }
];

function normalizeSpriteCategory(cat) {
  const known = SPRITE_CATEGORIES.map((c) => c.id);
  const v = String(cat || '').trim().toLowerCase();
  return known.includes(v) ? v : 'uncategorized';
}

function getFilteredAndSortedSpritesheets() {
  const searchQuery = String(state.spritePanel?.searchQuery || '').trim().toLowerCase();
  const categoryFilter = String(state.spritePanel?.categoryFilter || '').trim().toLowerCase();
  const sortMode = state.spritePanel?.sortMode || 'name-asc';
  const items = (state.spritesheets || []).filter((item) => {
    if (searchQuery) {
      const haystack = [
        item.name,
        `${item.columns || 0}x${item.rows || 0}`,
        item.filePath || '',
        item.relativePath || '',
        item.resourcePath || ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    if (categoryFilter) {
      const itemCat = normalizeSpriteCategory(item.category);
      if (itemCat !== categoryFilter) return false;
    }
    return true;
  });

  const compareName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
  const compareTiles = (a, b) => ((Number(a.columns) || 0) * (Number(a.rows) || 0)) - ((Number(b.columns) || 0) * (Number(b.rows) || 0));

  items.sort((a, b) => {
    if (sortMode === 'name-desc') return compareName(b, a);
    if (sortMode === 'tiles-desc') {
      const byTiles = compareTiles(b, a);
      return byTiles || compareName(a, b);
    }
    if (sortMode === 'tiles-asc') {
      const byTiles = compareTiles(a, b);
      return byTiles || compareName(a, b);
    }
    return compareName(a, b);
  });

  return items;
}

function buildSheetCategoryRow(item) {
  const row = document.createElement('div');
  row.className = 'sheet-list-row';

  const btn = document.createElement('button');
  btn.className = 'tool-btn sprite-row-main' + (item.id === state.selectedSheetId ? ' active' : '');
  btn.type = 'button';
  btn.textContent = `${item.name} (${item.columns}×${item.rows})`;
  btn.title = `${item.name} (${item.columns}×${item.rows})`;
  btn.addEventListener('click', () => {
    state.selectedSheetId = item.id; state.spriteEditor.activeSheetId = item.id;
    syncSpritesheetsToSceneState();
    syncSheetInputs(item);
    renderSpritesheetsPanel();
    renderSpriteFramesPanel();
  });

  const catSelect = document.createElement('select');
  catSelect.className = 'sheet-category-select';
  catSelect.title = 'Category';
  SPRITE_CATEGORIES.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.icon + ' ' + cat.label;
    if (normalizeSpriteCategory(item.category) === cat.id) opt.selected = true;
    catSelect.appendChild(opt);
  });
  catSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    const sheet = state.spritesheets.find((s) => s.id === item.id);
    if (sheet) {
      sheet.category = catSelect.value === 'uncategorized' ? '' : catSelect.value;
      syncSpritesheetsToSceneState();
      renderSpritesheetsPanel();
    }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'tool-btn sheet-delete-btn';
  delBtn.type = 'button';
  delBtn.textContent = '🗑';
  delBtn.title = `Delete ${item.name}`;
  delBtn.setAttribute('aria-label', `Delete ${item.name}`);
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSpritesheet(item.id); });

  row.appendChild(btn);
  row.appendChild(catSelect);
  row.appendChild(delBtn);
  return row;
}

// SLUGGISH-FIX: version guard for spritesheets panel
let _lastSpriteSheetVersion = -1;
let _lastSpriteSheetSelId   = '';
function renderSpritesheetsPanel() {
  // V163 fix: always rebuild the spritesheet panel.
  // The V162 cache guard could prevent refreshes after spritesheet imports,
  // restoration, or image reloads because those operations do not always
  // increment the scene version. This left the panel blank while sprite data
  // remained selectable.
  const sheet  = getSelectedSheet();
  const visibleSheets = getFilteredAndSortedSpritesheets();
  document.getElementById('btn-sheet-grid')?.classList.toggle('active', state.spriteEditor.showGrid);
  if (sheetSearchEl && sheetSearchEl.value !== (state.spritePanel.searchQuery || '')) sheetSearchEl.value = state.spritePanel.searchQuery || '';
  if (sheetSortEl && sheetSortEl.value !== (state.spritePanel.sortMode || 'name-asc')) sheetSortEl.value = state.spritePanel.sortMode || 'name-asc';
  const catFilterEl = document.getElementById('sheet-category-filter');
  if (catFilterEl && catFilterEl.value !== (state.spritePanel.categoryFilter || '')) catFilterEl.value = state.spritePanel.categoryFilter || '';

  if (sheetListEl) {
    sheetListEl.innerHTML = '';
    if (!state.spritesheets.length) {
      const empty = document.createElement('div'); empty.className = 'notice'; empty.textContent = 'No spritesheets imported.';
      sheetListEl.appendChild(empty);
    } else if (!visibleSheets.length) {
      const empty = document.createElement('div');
      empty.className = 'sheet-list-empty';
      empty.textContent = 'No spritesheets match your search.';
      sheetListEl.appendChild(empty);
    } else {
      // Group by category
      const groups = new Map();
      SPRITE_CATEGORIES.forEach((cat) => groups.set(cat.id, []));
      visibleSheets.forEach((item) => {
        const cat = normalizeSpriteCategory(item.category);
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(item);
      });

      SPRITE_CATEGORIES.forEach((catDef) => {
        const items = groups.get(catDef.id) || [];
        if (!items.length) return;

        const header = document.createElement('div');
        header.className = 'sheet-category-header';
        header.innerHTML = `<span class="sheet-category-icon">${catDef.icon}</span><span>${catDef.label}</span><span class="sheet-category-count">${items.length}</span>`;
        sheetListEl.appendChild(header);

        items.forEach((item) => {
          sheetListEl.appendChild(buildSheetCategoryRow(item));
        });
      });
    }
  }

  syncSheetInputs(sheet); drawSheetCanvas(sheet); renderSpriteTileGrid();
}

function deleteSpritesheet(sheetId) {
  const idx = state.spritesheets.findIndex((s) => s.id === sheetId); if (idx < 0) return false;
  const sheet = state.spritesheets[idx];
  if (!window.confirm(`Delete spritesheet "${sheet.name}"?`)) return false;
  state.spritesheets.splice(idx, 1);
  if (state.selectedSheetId === sheetId) state.selectedSheetId = state.spritesheets[0]?.id || null;
  syncSpritesheetsToSceneState(); renderSpritesheetsPanel(); renderSpriteFramesPanel();
  setStatus(`Deleted spritesheet "${sheet.name}".`); return true;
}

function syncSheetInputs(sheet) {
  const tw = document.getElementById('sheet-tile-w'), th = document.getElementById('sheet-tile-h'), pad = document.getElementById('sheet-padding');
  if (tw) tw.value  = sheet ? sheet.tileWidth  : 32;
  if (th) th.value  = sheet ? sheet.tileHeight : 32;
  if (pad) pad.value = sheet ? sheet.padding    : 0;
}

function recalcSheetMetrics(sheet) {
  if (!sheet?.image) return;
  sheet.tileWidth  = Math.max(1, Number(sheet.tileWidth)  || 32);
  sheet.tileHeight = Math.max(1, Number(sheet.tileHeight) || 32);
  sheet.padding    = Math.max(0, Number(sheet.padding)    || 0);
  sheet.imageWidth  = sheet.image.naturalWidth;
  sheet.imageHeight = sheet.image.naturalHeight;
  sheet.columns = Math.max(1, Math.floor((sheet.imageWidth  + sheet.padding) / (sheet.tileWidth  + sheet.padding)));
  sheet.rows    = Math.max(1, Math.floor((sheet.imageHeight + sheet.padding) / (sheet.tileHeight + sheet.padding)));
  const max = Math.max(0, sheet.columns * sheet.rows - 1);
  state.spriteEditor.selectedTileIndex   = Math.min(state.spriteEditor.selectedTileIndex, max);
  state.spriteEditor.animationFrames     = state.spriteEditor.animationFrames.filter((i) => i >= 0 && i <= max);
}

function updateSelectedSheetMetricsFromInputs() {
  const node  = getSelectedAnimationNode();
  const sheet = node ? (getNodeAssignedSheet(node) || getSelectedSheet()) : getSelectedSheet();
  if (!sheet) return;
  pushHistory('Update spritesheet tile settings');
  sheet.tileWidth  = Math.max(1, Number(document.getElementById('sheet-tile-w')?.value)  || 32);
  sheet.tileHeight = Math.max(1, Number(document.getElementById('sheet-tile-h')?.value) || 32);
  sheet.padding    = Math.max(0, Number(document.getElementById('sheet-padding')?.value) || 0);
  recalcSheetMetrics(sheet); syncSpritesheetsToSceneState(); renderSpritesheetsPanel(); renderSpriteFramesPanel();
  setStatus(`Updated "${sheet.name}" tile settings.`);
}

function drawSheetCanvas(sheet) {
  if (!sheetCanvasEl) return;
  const ctx = sheetCanvasEl.getContext('2d');
  if (!sheet?.image) {
    sheetCanvasEl.width = 512; sheetCanvasEl.height = 256;
    ctx.clearRect(0, 0, 512, 256); ctx.fillStyle = '#8a93b0'; ctx.font = '13px sans-serif';
    ctx.fillText('Upload a spritesheet to begin.', 16, 24); return;
  }
  recalcSheetMetrics(sheet);
  sheetCanvasEl.width = sheet.imageWidth; sheetCanvasEl.height = sheet.imageHeight;
  ctx.clearRect(0, 0, sheet.imageWidth, sheet.imageHeight);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(sheet.image, 0, 0);

  const selRect = getTileRect(sheet, state.spriteEditor.selectedTileIndex);
  if (state.spriteEditor.showGrid) {
    ctx.save(); ctx.strokeStyle = 'rgba(95,178,211,0.55)'; ctx.lineWidth = 1;
    for (let col = 0; col < sheet.columns; col++) for (let row = 0; row < sheet.rows; row++) {
      const sx = col * (sheet.tileWidth + sheet.padding), sy = row * (sheet.tileHeight + sheet.padding);
      if (sx + sheet.tileWidth > sheet.imageWidth || sy + sheet.tileHeight > sheet.imageHeight) continue;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sheet.tileWidth, sheet.tileHeight);
    }
    ctx.restore();
  }
  if (selRect) {
    ctx.save(); ctx.strokeStyle = '#e5c97a'; ctx.lineWidth = 2;
    ctx.strokeRect(selRect.x + 1, selRect.y + 1, selRect.width - 2, selRect.height - 2);
    ctx.fillStyle = 'rgba(229,201,122,0.15)';
    ctx.fillRect(selRect.x + 1, selRect.y + 1, selRect.width - 2, selRect.height - 2);
    ctx.restore();
  }
}

function getTileRect(sheet, index) {
  if (!sheet || index == null) return null;
  const col = index % sheet.columns, row = Math.floor(index / sheet.columns);
  const x = col * (sheet.tileWidth + sheet.padding), y = row * (sheet.tileHeight + sheet.padding);
  if (x + sheet.tileWidth > sheet.imageWidth || y + sheet.tileHeight > sheet.imageHeight) return null;
  return { x, y, width: sheet.tileWidth, height: sheet.tileHeight, col, row };
}

function onSheetCanvasClick(event) {
  const sheet = getSelectedSheet(); if (!sheet || !sheetCanvasEl) return;
  const rect  = sheetCanvasEl.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const x = (event.clientX - rect.left) * (sheetCanvasEl.width / rect.width);
  const y = (event.clientY - rect.top)  * (sheetCanvasEl.height / rect.height);
  const stride = { x: sheet.tileWidth + sheet.padding, y: sheet.tileHeight + sheet.padding };
  const col = Math.floor(x / stride.x), row = Math.floor(y / stride.y);
  if (col < 0 || row < 0 || col >= sheet.columns || row >= sheet.rows) return;
  if ((x - col * stride.x) > sheet.tileWidth || (y - row * stride.y) > sheet.tileHeight) return;
  const index = row * sheet.columns + col;
  state.spriteEditor.selectedTileIndex = index;
  renderSpritesheetsPanel();
  applyTileToSelectedSprite(sheet, index, { silentWhenNoSelection: true });
  if (sheetSelectionMetaEl) {
    const tileRect = getTileRect(sheet, index);
    const sel = getNode(state.selectedId);
    sheetSelectionMetaEl.textContent = tileRect
      ? `Tile #${index} · col ${tileRect.col} row ${tileRect.row} · ${tileRect.width}×${tileRect.height}` + (sel && (sel.type === 'Sprite2D' || sel.type === 'AnimatedSprite2D') ? ` · target: ${sel.name}` : ' · select a Sprite2D or AnimatedSprite2D')
      : 'Invalid tile';
  }
}

function renderSpriteTileGrid() {
  if (!spriteTileGridEl) return;
  spriteTileGridEl.innerHTML = '';
  const sheet = getSelectedSheet();
  if (!sheet) {
    const empty = document.createElement('div'); empty.className = 'notice'; empty.textContent = 'Upload a spritesheet to inspect its tiles.'; spriteTileGridEl.appendChild(empty); return;
  }
  const total = sheet.columns * sheet.rows;
  for (let index = 0; index < total; index++) {
    const tileRect = getTileRect(sheet, index); if (!tileRect) continue;
    const btn = document.createElement('button');
    btn.className = 'create-card' + (index === state.spriteEditor.selectedTileIndex ? ' selected' : '');
    btn.style.cssText = 'width:72px;padding:4px;display:flex;flex-direction:column;align-items:center;gap:4px';
    const img = document.createElement('img'); img.style.cssText = 'width:48px;height:48px;object-fit:contain;image-rendering:pixelated'; img.src = extractTileDataUrl(sheet, index);
    const cap = document.createElement('div'); cap.style.fontSize = '10px'; cap.textContent = `#${index}`;
    btn.appendChild(img); btn.appendChild(cap);
    btn.addEventListener('click', () => { state.spriteEditor.selectedTileIndex = index; renderSpritesheetsPanel(); applyTileToSelectedSprite(sheet, index, { silentWhenNoSelection: true }); });
    spriteTileGridEl.appendChild(btn);
  }
}


function makeTilesetSheet(sheet, tileset) {
  if (!sheet || !tileset) return null;
  const pseudoSheet = {
    ...sheet,
    tileWidth: Math.max(1, Number(tileset.tileWidth) || Number(sheet.tileWidth) || 32),
    tileHeight: Math.max(1, Number(tileset.tileHeight) || Number(sheet.tileHeight) || 32),
    padding: Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0)
  };
  pseudoSheet.columns = Math.max(1, Math.floor((pseudoSheet.imageWidth + pseudoSheet.padding) / (pseudoSheet.tileWidth + pseudoSheet.padding)));
  pseudoSheet.rows = Math.max(1, Math.floor((pseudoSheet.imageHeight + pseudoSheet.padding) / (pseudoSheet.tileHeight + pseudoSheet.padding)));
  return pseudoSheet;
}
function extractTileDataUrl(sheet, index) {
  const rect = getTileRect(sheet, index); if (!sheet?.image || !rect) return '';
  const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL('image/png');
}

function applyTileToSelectedSprite(sheet, tileIndex, options = {}) {
  const node = getNode(state.selectedId);
  if (!node || (node.type !== 'Sprite2D' && node.type !== 'AnimatedSprite2D')) {
    if (!options.silentWhenNoSelection) setStatus('Select a Sprite2D or AnimatedSprite2D node first.', true);
    return false;
  }
  pushHistory('Apply sprite tile');
  node.properties.width  = node.properties.width  || sheet.tileWidth;
  node.properties.height = node.properties.height || sheet.tileHeight;
  node.metadata = node.metadata || {};
  node.metadata.spriteSheetId = sheet.id; node.metadata.spriteTile = tileIndex;

  if (node.type === 'AnimatedSprite2D') {
    node.properties.spriteSheetId = sheet.id;
    node.properties.previewFrame  = tileIndex;
    const clip = getCurrentAnimationClip(node);
    if (clip) {
      clip.spriteSheetId = sheet.id;
      if (!Array.isArray(clip.frames) || !clip.frames.length) {
        clip.frames = [tileIndex];
        state.spriteEditor.animationFrames = clip.frames.slice();
      }
    }
    node.metadata = node.metadata || {};
    node.metadata.spriteSheetId = sheet.id;
    state.selectedSheetId = sheet.id;
    scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR); setStatus(`Assigned tile #${tileIndex} from "${sheet.name}" to ${node.name}`);
    return true;
  }

  const tileDataUrl = extractTileDataUrl(sheet, tileIndex);
  node.properties.imagePath    = `${sheet.filePath}#tile:${tileIndex}`;
  node.properties.imageDataUrl = tileDataUrl;
  loadImageIntoCache(node.id, tileDataUrl, () => { scheduleRender(RenderFlags.VIEWPORT | RenderFlags.INSPECTOR); setStatus(`Applied tile #${tileIndex} to ${node.name}.`); });
  return true;
}

function createTilesetFromSelectedSheet() {
  const sheet = getSelectedSheet();
  if (!sheet) { setStatus('Select a spritesheet first.', true); return false; }
  const tileset = ensureTilesetShape({
    id: `tileset_${Math.random().toString(36).slice(2, 9)}`,
    name: `${sheet.name} TileSet`,
    spriteSheetId: sheet.id,
    tileWidth: sheet.tileWidth,
    tileHeight: sheet.tileHeight,
    padding: sheet.padding,
    selectedTileIndex: 0
  });
  state.tilesets.push(tileset);
  state.selectedTilesetId = tileset.id;
  syncTilesetsToSceneState();
  renderTilesetsPanel();
  renderTileMapsPanel();
  scheduleRender(RenderFlags.VIEWPORT);
  setStatus(`Created tileset "${tileset.name}".`);
  return true;
}

function renderTilesetsPanel() {
  if (!tsItemsEl) return;
  tsItemsEl.innerHTML = '';
  const items = state.tilesets || [];
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'sf-empty-notice'; empty.textContent = 'Create a tileset from a spritesheet.'; tsItemsEl.appendChild(empty);
  } else {
    items.forEach((tileset) => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn sprite-row-main' + (tileset.id === state.selectedTilesetId ? ' active' : '');
      btn.textContent = tileset.name;
      btn.addEventListener('click', () => { state.selectedTilesetId = tileset.id; syncTilesetsToSceneState(); renderTilesetsPanel(); renderTilesetTerrainPanel(); renderTileMapsPanel(); });
      tsItemsEl.appendChild(btn);
    });
  }
  if (tsSheetSelectEl) {
    tsSheetSelectEl.innerHTML = '<option value="">No spritesheet</option>' + (state.spritesheets || []).map((sheet) => `<option value="${sheet.id}">${sheet.name}</option>`).join('');
  }
  const selected = getSelectedTileset();
  if (tsSheetSelectEl) tsSheetSelectEl.value = selected?.spriteSheetId || '';
  if (tsTileWEl) tsTileWEl.value = selected?.tileWidth || 32;
  if (tsTileHEl) tsTileHEl.value = selected?.tileHeight || 32;
  if (tsPaddingEl) tsPaddingEl.value = selected?.padding || 0;
  if (tsMetaEl) {
    const sheet = selected ? getSheetById(selected.spriteSheetId) : null;
    tsMetaEl.textContent = selected ? `${selected.name} · ${sheet?.name || 'No sheet'} · ${selected.tileWidth}×${selected.tileHeight} · padding ${selected.padding}` : 'Select a tileset.';
  }
  renderTilePaletteGrid(tsPaletteGridEl, selected, selected?.selectedTileIndex ?? 0, (index) => {
    if (!selected) return;
    selected.selectedTileIndex = Math.max(0, index);
    syncTilesetsToSceneState();
    renderTilesetTerrainPanel();
    });
  renderTilesetTerrainPanel();
}

function getTileMapScreenBounds() {
  return {
    width: Math.max(1, Number(state.projectSettings?.screen?.width) || 1280),
    height: Math.max(1, Number(state.projectSettings?.screen?.height) || 720)
  };
}

function getTileMapDerivedSize(tileWidth, tileHeight) {
  const screen = getTileMapScreenBounds();
  const tw = Math.max(1, Number(tileWidth) || 32);
  const th = Math.max(1, Number(tileHeight) || 32);
  return {
    mapWidth: Math.max(1, Math.ceil(screen.width / tw)),
    mapHeight: Math.max(1, Math.ceil(screen.height / th)),
    screenWidth: screen.width,
    screenHeight: screen.height
  };
}

function syncTileMapDerivedDimensions(node) {
  if (!node || node.type !== 'TileMap') return null;
  node.properties = node.properties || {};
  const props = node.properties;
  const derived = getTileMapDerivedSize(props.tileWidth, props.tileHeight);
  const nextMapWidth = derived.mapWidth;
  const nextMapHeight = derived.mapHeight;
  const widthChanged = Number(props.mapWidth) !== nextMapWidth || Number(props.mapHeight) !== nextMapHeight;
  props.mapWidth = nextMapWidth;
  props.mapHeight = nextMapHeight;
  if (Array.isArray(props.layers)) {
    props.layers = props.layers.map((layer) => ensureTileLayerShape(layer, props.mapWidth, props.mapHeight));
  }
  syncPrimaryTileLayerAliases(props);
  syncTileMapNodeViewportSize(node);
  return { ...derived, changed: widthChanged };
}

function syncAllTileMapsToProjectScreen(options = {}) {
  let changed = false;
  getNodes().forEach((node) => {
    if (!node || node.type !== 'TileMap') return;
    const result = syncTileMapDerivedDimensions(node);
    if (result?.changed) changed = true;
  });
  if (options.render !== false) {
    scheduleRender(RenderFlags.VIEWPORT);
    renderInspector();
    renderTileMapsPanel();
    updateSceneSummary();
  }
  return changed;
}

function getTileMapCanvasMetrics(node) {
  const props = ensureTileMapData(node);
  return {
    width: Math.max(1, props.mapWidth) * Math.max(1, props.tileWidth),
    height: Math.max(1, props.mapHeight) * Math.max(1, props.tileHeight)
  };
}

function drawTileCellFallback(ctx, x, y, width, height, tileIndex, alpha = 1) {
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha));
  ctx.fillStyle = '#4d79c7';
  ctx.fillRect(x + 2, y + 2, Math.max(4, width - 4), Math.max(4, height - 4));
  ctx.strokeStyle = '#d7e4ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, Math.max(3, width - 5), Math.max(3, height - 5));
  ctx.fillStyle = '#eef4ff';
  ctx.font = `${Math.max(9, Math.min(14, Math.floor(height * 0.35)))}px sans-serif`;
  ctx.fillText(`#${Number(tileIndex)}`, x + 5, y + Math.min(height - 6, 14));
  ctx.restore();
}

function syncTileMapEditorCanvasSize(_node) {
  return null;
}

function updateTileMapPanelSummary(node) {
  const activeNode = node || getSelectedTileMapNode();
  if (!activeNode) return;
  const props = ensureTileMapData(activeNode);
  const activeLayer = getActiveTileMapLayer(activeNode);
  const layerListEl = document.getElementById('tm-layer-list');
  if (layerListEl) {
    layerListEl.querySelectorAll('.tile-layer-chip').forEach((chip) => {
      const rowLayerId = chip.closest('.tile-layer-row')?.dataset?.layerId || '';
      const rowLayer = (props.layers || []).find((layer) => layer && layer.id === rowLayerId) || activeLayer;
      const rowTilesetName = getTilesetById(rowLayer?.tilesetId)?.name || (rowLayer?.tilesetId ? rowLayer.tilesetId : 'No tileset');
      chip.textContent = `${props.mapWidth}×${props.mapHeight} · ${rowTilesetName}`;
    });
  }
  if (tmMetaEl) {
    const filled = activeLayer ? activeLayer.tiles.flat().filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0).length : 0;
    const terrainCount = activeLayer ? (activeLayer.cellData || []).flat().filter((cell) => hasTerrainRef(cell?.terrainTypeId)).length : 0;
    const collisionCount = activeLayer ? activeLayer.collision.flat().filter((value) => Number(value) > 0).length : 0;
    const brush = getTileMapBrushInfo(activeNode);
    tmMetaEl.innerHTML = `${activeNode.name} · ${props.mapWidth}×${props.mapHeight} cells · layer: <strong>${escapeHtml(activeLayer?.name || 'None')}</strong> · ${filled} visual tiles · ${terrainCount} terrain cells · ${collisionCount} collision · tool: ${escapeHtml(state.tilemapEditor.tool)} · mode: ${escapeHtml(state.tilemapEditor.paintMode)} · brush: <strong>${escapeHtml(brush.label || 'None')}</strong> · right-click: pick · P: paint · O: pick · E: erase · drag rectangle/line for shapes`;
  }
}

function drawTileMapEditorCanvas(node) {
  updateTileMapPanelSummary(node);
  return null;
}

async function importSpritesheet() {

  const result = await openImageFileSafe({ assetKind: 'spritesheet' }); if (!result.success) return;
  const tileWidth  = Math.max(1, Number(document.getElementById('sheet-tile-w')?.value)  || 32);
  const tileHeight = Math.max(1, Number(document.getElementById('sheet-tile-h')?.value) || 32);
  const padding    = Math.max(0, Number(document.getElementById('sheet-padding')?.value) || 0);
  const img = new Image();
  img.onload = () => {
    const sheet = { id: `sheet_${Math.random().toString(36).slice(2, 9)}`, name: result.filePath.split(/[\/\\]/).pop(), filePath: result.filePath, resourcePath: result.resPath || '', relativePath: String(result.resPath || '').replace(/^res:\/\//, ''), dataUrl: result.dataUrl, image: img, tileWidth, tileHeight, padding, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, columns: 1, rows: 1, projectAsset: !!result.resPath };
    recalcSheetMetrics(sheet);
    state.spritesheets.push(sheet);
    state.selectedSheetId = sheet.id;
    state.spriteEditor.activeSheetId = sheet.id;

    _lastSpriteSheetVersion = -1;
    _lastSpriteSheetSelId = null;

    syncSpritesheetsToSceneState();

    state.spriteEditor.selectedTileIndex = 0;
    state.spriteEditor.animationFrames = [];
    state.spriteEditor.selectedFrameIndex = -1;

    syncSheetInputs(sheet);
    renderSpritesheetsPanel();
    renderSpriteFramesPanel();
    renderTilesetsPanel();
    renderTileMapsPanel();
    setStatus(`Imported spritesheet "${sheet.name}".`);
  };
  img.onerror = () => setStatus('Could not import spritesheet.', true);
  img.src = result.dataUrl;
}


function getCurrentSceneSnapshot() {
  return serializeScene();
}

function updateDocumentDirtyState(snapshot = null) {
  const currentSnapshot = snapshot || getCurrentSceneSnapshot();
  state.document.dirty = !!state.document.lastSavedSnapshot && currentSnapshot !== state.document.lastSavedSnapshot;
  if (!state.document.lastSavedSnapshot) {
    state.document.dirty = currentSnapshot !== serializeEmptyDocumentBaseline();
  }
  return state.document.dirty;
}

function serializeEmptyDocumentBaseline() {
  if (!state._emptyDocumentBaseline) {
    const runtimeScene = normalizeScene();
    const editorState = normalizeEditorState(null, runtimeScene);
    state._emptyDocumentBaseline = JSON.stringify({ sceneState: runtimeScene, editorState });
  }
  return state._emptyDocumentBaseline;
}

function initAutosaveLoop() {
  if (state.document.autosaveTimer) clearInterval(state.document.autosaveTimer);
  state.document.autosaveTimer = window.setInterval(() => {
    void performAutosaveTick();
  }, 30000);
}

async function performAutosaveTick() {
  if (!window.electronAPI?.writeAutosave) return;
  // Fast bail: if scene version hasn't changed since last autosave, nothing is dirty
  if (state.document._lastAutosaveVersion === _getSceneVersion() && state.document.lastAutosaveSnapshot) return;
  const snapshot = getCurrentSceneSnapshot();
  state.document._lastAutosaveVersion = _getSceneVersion();
  const dirty = updateDocumentDirtyState(snapshot);
  if (!dirty) return;
  if (snapshot === state.document.lastAutosaveSnapshot) return;
  const result = await window.electronAPI.writeAutosave({
    runtimeJson: window.Exporter.exportSceneAsJson(state.sceneState, state.editorState),
    editorStateJson: window.Exporter.exportEditorStateAsJson(state.sceneState, state.editorState),
    scenePath: state.document.currentScenePath || '',
    recoveryId: state.document.pendingRecoveryId || '',
    sceneName: state.sceneState.scene?.name || 'Untitled'
  });
  if (result?.success && result.recovery) {
    state.document.pendingRecoveryId = result.recovery.id || state.document.pendingRecoveryId;
    state.document.lastAutosaveSnapshot = snapshot;
    const label = state.document.currentScenePath ? 'Autosaved scene recovery.' : 'Autosaved untitled recovery.';
    setStatus(label, { appendToLog: true, tone: 'normal' });
  }
}

async function checkStartupRecovery() {
  if (!window.electronAPI?.getStartupState) return;
  const startup = await window.electronAPI.getStartupState();
  if (!startup?.success) return;
  state.startupState.recentScenes = Array.isArray(startup.recentScenes) ? startup.recentScenes : [];
  state.startupState.recoveries = Array.isArray(startup.recoveries) ? startup.recoveries : [];
  if (!state.startupState.recoveries.length) return;

  for (const recovery of state.startupState.recoveries) {
    const sceneLabel = recovery.scenePath ? recovery.scenePath : `${recovery.sceneName || 'Untitled'} (unsaved)`;
    const message = `Recovery found for ${sceneLabel}

Updated: ${recovery.updatedAt || 'unknown'}

Press OK to restore it, or Cancel to discard this recovery.`;
    if (window.confirm(message)) {
      await restoreRecovery(recovery.id);
      break;
    }
    await discardRecovery(recovery.id, { silent: true });
  }
}

async function restoreRecovery(recoveryId, options = {}) {
  if (!recoveryId || !window.electronAPI?.loadRecovery) return false;
  const result = await window.electronAPI.loadRecovery(recoveryId);
  if (!result?.success) {
    setStatus(`Could not restore recovery: ${result?.reason || 'Unknown error'}.`, { tone: 'error', flashMs: 2800 });
    return false;
  }

  const parsedScene = parseSceneJson(result.json);
  if (!parsedScene.ok) {
    reportSceneFatalErrors(parsedScene.fatalErrors, 'Recovery load failed');
    setStatus('Recovery load failed: invalid JSON.', { tone: 'error', flashMs: 2800 });
    return false;
  }

  let editorState = parsedScene.data?.editor || {};
  if (result.editorStateJson) {
    try {
      editorState = JSON.parse(result.editorStateJson);
    } catch (error) {
      reportSceneWarnings([{ code: 'INVALID_RECOVERY_EDITSTATE', message: `Recovery edit state sidecar could not be parsed: ${error.message}` }], 'Recovery warnings');
    }
  }

  const validation = await validateSceneForOpen(parsedScene.data, result.filePath || '');
  if (!validation.ok) {
    reportSceneFatalErrors(validation.fatalErrors, 'Recovery load failed');
    setStatus('Recovery load failed: validation errors found.', { tone: 'error', flashMs: 2800 });
    return false;
  }

  applyLoadedSceneData(parsedScene.data, editorState);
  state.document.currentScenePath = result.filePath || '';
  state.document.currentEditStatePath = '';
  state.document.pendingRecoveryId = recoveryId;
  state.document.lastAutosaveSnapshot = getCurrentSceneSnapshot();
  rebuildImageCache();
  rebuildSpritesheetsFromSceneState();
  rebuildSpriteFramesLibrariesFromSceneState();
  state.document.lastSavedSnapshot = '';
  state.document.dirty = true;
  state.history.undo = [];
  state.history.redo = [];
  scheduleRender(RenderFlags.FULL);
  if (!options.suppressFilesystemRefresh) refreshFilesystem();
  setStatus(`Recovered autosave for ${result.filePath || (parsedScene.data?.scene?.name || 'Untitled scene')}. Save manually to clear recovery.`, { tone: 'warning', flashMs: 3200 });
  return true;
}

async function discardRecovery(recoveryId, options = {}) {
  if (!recoveryId || !window.electronAPI?.discardRecovery) return false;
  const result = await window.electronAPI.discardRecovery(recoveryId);
  if (!result?.success) {
    setStatus(`Could not discard recovery: ${result?.reason || 'Unknown error'}.`, { tone: 'error', flashMs: 2800 });
    return false;
  }
  if (state.document.pendingRecoveryId === recoveryId) {
    state.document.pendingRecoveryId = '';
    state.document.lastAutosaveSnapshot = '';
  }
  if (!options.silent) setStatus('Discarded recovery.', { tone: 'warning', flashMs: 2200 });
  return true;
}

// ══════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════
function appendLog(text) {
  const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.logs.push(`[${stamp}] ${String(text)}`);
  if (state.logs.length > 500) state.logs = state.logs.slice(-500);
  if (logViewEl) { logViewEl.textContent = state.logs.join('\n'); logViewEl.scrollTop = logViewEl.scrollHeight; }
}
function log(text) { appendLog(text); }

function clampOpacity(v) { const n = Number(v); return Number.isNaN(n) ? 1 : Math.max(0, Math.min(1, n)); }
function hexWithAlpha(hex, alpha) {
  const f = (String(hex || '').replace('#', '') || '5e7594').slice(0, 6);
  return `#${f}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`;
}
function clearStatusFlash() {
  if (state.statusFlashTimer) {
    clearTimeout(state.statusFlashTimer);
    state.statusFlashTimer = null;
  }
  if (statusbarEl) statusbarEl.classList.remove('flash-warning', 'flash-error');
}

function setStatus(msg, options = false) {
  const normalized = typeof options === 'boolean'
    ? { tone: options ? 'error' : 'normal' }
    : (options || {});
  const tone = normalized.tone || 'normal';
  const appendToLog = normalized.appendToLog !== false;
  const logPrefix = normalized.logPrefix != null
    ? normalized.logPrefix
    : (tone === 'error' ? 'ERROR: ' : tone === 'warning' ? 'WARNING: ' : '');

  state.status = msg;
  if (appendToLog) appendLog(logPrefix + msg);

  if (!statusbarEl) return;

  clearStatusFlash();
  statusbarEl.textContent = msg;
  statusbarEl.className = 'statusbar';
  if (tone === 'warning') statusbarEl.classList.add('warning');
  if (tone === 'error') statusbarEl.classList.add('error');
  if (state.statusLogTarget) statusbarEl.classList.add('has-log-target');

  const flashClass = tone === 'warning' ? 'flash-warning' : (tone === 'error' ? 'flash-error' : '');
  const flashMs = Number.isFinite(Number(normalized.flashMs)) ? Number(normalized.flashMs) : (tone === 'warning' ? 2600 : tone === 'error' ? 2800 : 0);
  if (flashClass && flashMs > 0) {
    statusbarEl.classList.add(flashClass);
    state.statusFlashTimer = window.setTimeout(() => {
      if (!statusbarEl) return;
      statusbarEl.classList.remove('flash-warning', 'flash-error');
      state.statusFlashTimer = null;
    }, flashMs);
  }
}
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}



// ===== TileSet / TileMap advanced patch =====
state.tilemapEditor = state.tilemapEditor || {};
Object.assign(state.tilemapEditor, {
  paintMode: state.tilemapEditor?.paintMode || 'tile',
  terrainUiMode: state.tilemapEditor?.terrainUiMode || 'brush',
  selectedTerrainSetId: state.tilemapEditor?.selectedTerrainSetId || null,
  selectedTerrainId: state.tilemapEditor?.selectedTerrainId || null,
  selectedTerrain: state.tilemapEditor?.selectedTerrainId || state.tilemapEditor?.selectedTerrain || '1',
  collisionValue: 1,
  showTerrainOverlay: state.tilemapEditor?.showTerrainOverlay !== false,
  showCollisionOverlay: state.tilemapEditor?.showCollisionOverlay !== false,
  activeLayerId: state.tilemapEditor?.activeLayerId || null,
  viewportPaint: { active: false, nodeId: null, beforeSnapshot: '', pointerId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1, previewCells: [], ...(state.tilemapEditor?.viewportPaint || {}) },
  viewportGroupSelect: { active: false, nodeId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1 },
  lastPick: state.tilemapEditor?.lastPick || null
});

function bindOnceById(id, eventName, key, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  const attr = `data-bound-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  if (el.getAttribute(attr) === '1') return;
  el.setAttribute(attr, '1');
  el.addEventListener(eventName, handler);
}

async function openImageFileSafe(payload) {
  const api = window.electronAPI;
  if (!api || typeof api.openImageFile !== 'function') {
    setStatus('Image import only works when the editor is launched through Electron, not by opening index.html directly.', true);
    return { success: false, reason: 'electron_api_missing' };
  }
  try {
    return await api.openImageFile(payload);
  } catch (error) {
    setStatus(`Image import failed: ${error?.message || error}`, true);
    return { success: false, reason: 'open_image_failed', error: String(error?.message || error || '') };
  }
}



if (!window.__rgeTileMapLayerButtonPatch) {
  window.__rgeTileMapLayerButtonPatch = true;
  document.addEventListener('click', (event) => {
    const button = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('#tm-btn-layer-add')
      : null;
    if (!button) return;
    if (event.defaultPrevented || button.getAttribute('data-bound-tmLayerAdd') === '1') return;
  });
}
const __origBindSceneActions = bindSceneActions;
bindSceneActions = function() {
  __origBindSceneActions();

  bindOnceById('ts-btn-create', 'click', 'tilesetCreate', () => createTilesetFromSelectedSheet());
  bindOnceById('ts-sheet-select', 'change', 'tilesetSheet', (event) => {
    const ts = getSelectedTileset();
    if (!ts) return;
    ts.spriteSheetId = String(event.target.value || '');
    const sh = getSheetById(ts.spriteSheetId);
    if (sh) {
      ts.tileWidth = Math.max(1, Number(sh.tileWidth) || ts.tileWidth || 32);
      ts.tileHeight = Math.max(1, Number(sh.tileHeight) || ts.tileHeight || 32);
      ts.padding = Math.max(0, Number(sh.padding) || ts.padding || 0);
    }
    syncTilesetsToSceneState(); scheduleRender(RenderFlags.TILESETS | RenderFlags.TILEMAPS | RenderFlags.VIEWPORT);
  });
  ['ts-tile-w','ts-tile-h','ts-padding'].forEach((id) => bindOnceById(id, 'change', id, () => {
    const ts = getSelectedTileset();
    if (!ts) return;
    ts.tileWidth = Math.max(1, Number(document.getElementById('ts-tile-w')?.value) || ts.tileWidth || 32);
    ts.tileHeight = Math.max(1, Number(document.getElementById('ts-tile-h')?.value) || ts.tileHeight || 32);
    ts.padding = Math.max(0, Number(document.getElementById('ts-padding')?.value) || ts.padding || 0);
    syncTilesetsToSceneState(); scheduleRender(RenderFlags.TILESETS | RenderFlags.TILEMAPS | RenderFlags.VIEWPORT);
  }));
  bindOnceById('ts-btn-sync-sheet', 'click', 'tilesetSyncSheet', () => {
    const ts = getSelectedTileset();
    if (!ts) return;
    const sh = getSheetById(ts.spriteSheetId);
    if (!sh) return setStatus('Assign a spritesheet first.', true);
    ts.tileWidth = Math.max(1, Number(sh.tileWidth) || 32);
    ts.tileHeight = Math.max(1, Number(sh.tileHeight) || 32);
    ts.padding = Math.max(0, Number(sh.padding) || 0);
    syncTilesetsToSceneState(); renderTilesetsPanel(); renderTileMapsPanel();
  });

  ['ts-meta-atlas-x','ts-meta-atlas-y','ts-meta-atlas-w','ts-meta-atlas-h'].forEach((id) => bindOnceById(id, 'change', id, updateSelectedTilesetTileMetadataFromInputs));
  bindOnceById('ts-meta-collision', 'change', 'tsMetaCollision', updateSelectedTilesetTileMetadataFromInputs);

  const handleTileMapTilesetSelection = (event) => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    const props = ensureTileMapData(node);
    const activeLayer = getActiveTileMapLayer(node);
    const nextTilesetId = String(event?.target?.value || tmTilesetSelectEl?.value || '');
    props.tilesetId = nextTilesetId;
    if (activeLayer) activeLayer.tilesetId = nextTilesetId;
    state.selectedTilesetId = nextTilesetId || null;
    const assigned = getTileMapAssignedTileset(node, activeLayer);
    state.tilemapEditor.selectedTileIndex = assigned ? Math.max(0, Number(assigned.selectedTileIndex) || 0) : -1;
    syncTilesetsToSceneState();
    syncPrimaryTileLayerAliases(props);
    refreshSelectedTileMapTilesetUI(node);
    renderTileMapsPanel({ viewport: true });
  };
  bindOnceById('tm-tileset-select', 'change', 'tmTilesetChange', handleTileMapTilesetSelection);
  bindOnceById('tm-tileset-select', 'input', 'tmTilesetInput', handleTileMapTilesetSelection);
  const handleTileMapSizePreview = () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    syncTileMapDerivedDimensions(node);
    updateTileMapPanelSummary(node);
    drawTileMapEditorCanvas(node);
    scheduleRender(RenderFlags.VIEWPORT);
    renderInspector();
    updateSceneSummary();
  };
  const handleTileMapSizeCommit = () => {
    handleTileMapSizePreview();
    renderTileMapsPanel();
  };
  ['tm-tile-w','tm-tile-h'].forEach((id) => bindOnceById(id, 'wheel', `${id}WheelLock`, (event) => {
    if (document.activeElement === event.currentTarget) event.currentTarget.blur();
    event.preventDefault();
  }));
  ['tm-tile-w','tm-tile-h'].forEach((id) => bindOnceById(id, 'change', id, () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    const props = ensureTileMapData(node);
    props.tileWidth = Math.max(1, Number(document.getElementById('tm-tile-w')?.value) || props.tileWidth || 32);
    props.tileHeight = Math.max(1, Number(document.getElementById('tm-tile-h')?.value) || props.tileHeight || 32);
    syncTileMapNodeViewportSize(node);
    scheduleRender(RenderFlags.TILEMAPS | RenderFlags.VIEWPORT | RenderFlags.INSPECTOR);
  }));
  const handleTileMapShowGrid = () => {
    const n = getSelectedTileMapNode();
    if (!n) return;
    ensureTileMapData(n).showGrid = document.getElementById('tm-show-grid')?.checked !== false;
    drawTileMapEditorCanvas(n);
    renderTileMapsPanel();
    scheduleRender(RenderFlags.VIEWPORT);
  };
  bindOnceById('tm-show-grid', 'change', 'tmShowGridChange', handleTileMapShowGrid);
  bindOnceById('tm-show-grid', 'click', 'tmShowGridClick', handleTileMapShowGrid);
  bindOnceById('tm-btn-resize', 'click', 'tmResize', () => { const n = getSelectedTileMapNode(); if (!n) return; syncTileMapDerivedDimensions(n); scheduleRender(RenderFlags.TILEMAPS | RenderFlags.VIEWPORT | RenderFlags.INSPECTOR); });
  bindOnceById('tm-btn-clear', 'click', 'tmClear', () => { const n = getSelectedTileMapNode(); if (!n) return; const props = ensureTileMapData(n); (props.layers || []).forEach((layer) => { fillLayerData(layer.tiles, -1); fillLayerData(layer.terrain, 0); fillLayerData(layer.collision, 0); ensureTileLayerShape(layer, props.mapWidth, props.mapHeight); (layer.cellData || []).forEach((row) => row.forEach((cell) => { if (cell && typeof cell === 'object') cell.terrainTypeId = null; })); }); syncPrimaryTileLayerAliases(props); scheduleRender(RenderFlags.TILEMAPS | RenderFlags.VIEWPORT); });
  ['tm-tool-paint','tm-tool-rectangle','tm-tool-line','tm-tool-erase','tm-tool-fill','tm-tool-pick'].forEach((id) => bindOnceById(id, 'click', id, () => { state.tilemapEditor.tool = id.replace('tm-tool-',''); resetTileMapStrokeTracking(); updateTileMapToolButtons(); scheduleRender(RenderFlags.TILEMAPS); }));
  ['tm-mode-tile','tm-mode-terrain','tm-mode-collision'].forEach((id) => bindOnceById(id, 'click', id, () => { state.tilemapEditor.paintMode = id.replace('tm-mode-',''); resetTileMapStrokeTracking(); updateTileMapToolButtons(); renderTileMapsPanel(); }));
  bindOnceById('tm-overlay-collision', 'change', 'tmOverlayCollision', () => { state.tilemapEditor.showCollisionOverlay = document.getElementById('tm-overlay-collision')?.checked !== false; scheduleRender(RenderFlags.TILEMAPS | RenderFlags.VIEWPORT); });
  bindOnceById('tm-btn-layer-add', 'click', 'tmLayerAdd', (event) => { if (event) { event.preventDefault(); event.stopPropagation(); } const n = getSelectedTileMapNode(); if (!n) return; const p = ensureTileMapData(n); const layer = createTileMapLayer(`Layer ${(p.layers || []).length + 1}`, p.mapWidth, p.mapHeight); layer.tilesetId = String(state.selectedTilesetId || p.tilesetId || ''); p.layers.push(layer); p.activeLayerId = layer.id; state.tilemapEditor.activeLayerId = layer.id; syncPrimaryTileLayerAliases(p); refreshTileMapLayerList(n); updateTileMapPanelSummary(n); drawTileMapEditorCanvas(n); scheduleRender(RenderFlags.VIEWPORT); renderInspector(); setStatus(`Added ${layer.name}.`); });
  if (window.__rgeTileMapViewportPointerUpBound !== true) {
    window.__rgeTileMapViewportPointerUpBound = true;
    window.addEventListener('pointerup', () => {
      state.tilemapEditor.isPointerDown = false;
      resetTileMapStrokeTracking();
      endViewportTilePaint();
    });
  }
};

function fillLayerData(grid, value) {
  if (!Array.isArray(grid)) return false;
  for (let y = 0; y < grid.length; y++) {
    if (!Array.isArray(grid[y])) continue;
    for (let x = 0; x < grid[y].length; x++) grid[y][x] = value;
  }
  return true;
}

// normalizeTerrainRef → RGE_ROOT.RGEUtils.normalizeTerrainRef (shared, see core/utils.js)
const normalizeTerrainRef = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
  ? RGE_ROOT.RGEUtils.normalizeTerrainRef
  : (v, fb = null) => {
      if (v == null || v === '' || v === false) return fb;
      const n = Number(v); if (Number.isFinite(n)) return n <= 0 ? fb : String(n);
      const t = String(v).trim(); return t ? t : fb;
    };

function terrainRefEquals(a, b) {
  return normalizeTerrainRef(a, null) === normalizeTerrainRef(b, null);
}

function hasTerrainRef(value) {
  return normalizeTerrainRef(value, null) != null;
}

function getTerrainFillSettings() {
  const settings = state.tilemapEditor?.terrainFillSettings || {};
  return {
    randomizeInterior: settings.randomizeInterior !== false,
    respectProbability: settings.respectProbability !== false
  };
}


// ══════════════════════════════════════════════════════════════════
// DIRTY-CELL TERRAIN REBUILD SYSTEM  (v36.1)
// ══════════════════════════════════════════════════════════════════
// markTerrainCellDirty / markTerrainNeighborhoodDirty accumulate cells.
// scheduleTerrainDirtyFlush batches them into a single rAF so drag-paint
// never triggers synchronous full-layer rebuilds.
// ══════════════════════════════════════════════════════════════════

const _terrainDirtyCells = new Map();  // key "layerId:col:row" -> { node, layer, col, row }
let   _terrainDirtyRafId = null;

function markTerrainCellDirty(node, layer, col, row) {
  if (!node || !layer) return;
  const key = `${layer.id || ''}:${col}:${row}`;
  _terrainDirtyCells.set(key, { node, layer, col, row });
}

function markTerrainNeighborhoodDirty(node, layer, col, row, radius = 1) {
  if (!node || !layer) return;
  const h = Array.isArray(layer.tiles) ? layer.tiles.length : 0;
  const w = h > 0 && Array.isArray(layer.tiles[0]) ? layer.tiles[0].length : 0;
  for (let cy = row - radius; cy <= row + radius; cy++) {
    for (let cx = col - radius; cx <= col + radius; cx++) {
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) markTerrainCellDirty(node, layer, cx, cy);
    }
  }
}

function flushTerrainDirtyCells() {
  if (!_terrainDirtyCells.size) return;
  const entries = Array.from(_terrainDirtyCells.values());
  _terrainDirtyCells.clear();
  _terrainDirtyRafId = null;
  let anyChanged = false;
  entries.forEach(({ node, layer, col, row }) => {
    if (applyTerrainSolverAt(node, layer, col, row)) anyChanged = true;
  });
  if (anyChanged) scheduleRender(RenderFlags.VIEWPORT);
}

function scheduleTerrainDirtyFlush() {
  if (_terrainDirtyRafId) return;  // already queued
  if (typeof requestAnimationFrame === 'function') {
    _terrainDirtyRafId = requestAnimationFrame(flushTerrainDirtyCells);
  } else {
    // Node.js / test environment fallback
    _terrainDirtyRafId = setTimeout(flushTerrainDirtyCells, 16);
  }
}

function updateTerrainDebugInfo(node, layer, col, row, diagnostics = null) {
  if (!node || !layer || !state.tilemapEditor) return;
  state.tilemapEditor.terrainDebugInfo = {
    nodeId: node.id,
    layerId: layer.id,
    col,
    row,
    diagnostics: diagnostics || null
  };
}

function normalizeTileMapCellTransform(transform) {
  const solver = window.RokuTerrainSolver;
  if (solver?.normalizeTransformSpec) return solver.normalizeTransformSpec(transform);
  const src = transform && typeof transform === 'object' ? transform : {};
  let rotation = Number(src.rotation);
  if (!Number.isFinite(rotation)) rotation = 0;
  rotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return { flipX: src.flipX === true, flipY: src.flipY === true, rotation };
}

function tileMapCellTransformKey(transform) {
  const t = normalizeTileMapCellTransform(transform);
  return `${t.flipX ? 1 : 0}|${t.flipY ? 1 : 0}|${t.rotation}`;
}

function drawTransformedTileToCanvas(ctx, image, rect, dx, dy, dw, dh, transform, alpha = 1) {
  if (!ctx || !image || !rect) return;
  const t = normalizeTileMapCellTransform(transform);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(dx + (dw / 2), dy + (dh / 2));
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function getSelectedTileMapTerrainRef(node = null) {
  const tileset = node ? getTileMapAssignedTileset(node) : getTileMapTerrainHostTileset();
  const selectedSet = getSelectedTerrainSet(tileset);
  const selectedTerrain = getSelectedTerrainEntry(tileset, selectedSet);
  return normalizeTerrainRef(selectedTerrain?.id ?? state.tilemapEditor.selectedTerrainId ?? state.tilemapEditor.selectedTerrain, null);
}

function createTileMapLayer(name, width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const makeGrid = (fill) => Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  const makeCellGrid = () => Array.from({ length: h }, () => Array.from({ length: w }, () => ({ terrainSetId: null, terrainTypeId: null, tileIndex: -1, transform: { flipX: false, flipY: false, rotation: 0 } }))); 
  return {
    id: `layer_${Math.random().toString(36).slice(2, 9)}`,
    name: String(name || 'Layer'),
    visible: true,
    opacity: 1,
    tilesetId: '',
    tiles: makeGrid(-1),
    terrain: makeGrid(null),
    collision: makeGrid(0),
    cellData: makeCellGrid()
  };
}

function ensureTileLayerShape(layer, width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  if (!layer || typeof layer !== 'object') layer = {};
  layer.id = String(layer.id || `layer_${Math.random().toString(36).slice(2, 9)}`);
  layer.name = String(layer.name || 'Layer');
  layer.visible = layer.visible !== false;
  layer.opacity = Math.max(0, Math.min(1, Number(layer.opacity) || 1));
  layer.tilesetId = String(layer.tilesetId || '');
  const normalizeGrid = (grid, fillValue) => {
    const next = Array.isArray(grid) ? grid : [];
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(next[y])) next[y] = [];
      for (let x = 0; x < w; x++) {
        const raw = next[y][x];
        next[y][x] = Number.isFinite(Number(raw)) ? Number(raw) : fillValue;
      }
      next[y].length = w;
    }
    next.length = h;
    return next;
  };
  const normalizeCellDataGrid = (grid, terrainGrid) => {
    const next = Array.isArray(grid) ? grid : [];
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(next[y])) next[y] = [];
      for (let x = 0; x < w; x++) {
        const raw = next[y][x];
        const cell = raw && typeof raw === 'object' ? { ...raw } : {};
        cell.terrainSetId = normalizeTerrainRef(cell.terrainSetId, null);
        cell.terrainTypeId = normalizeTerrainRef(cell.terrainTypeId, normalizeTerrainRef(terrainGrid?.[y]?.[x], null));
        cell.tileIndex = Number.isFinite(Number(cell.tileIndex)) ? Number(cell.tileIndex) : -1;
        cell.transform = normalizeTileMapCellTransform(cell.transform);
        next[y][x] = cell;
      }
      next[y].length = w;
    }
    next.length = h;
    return next;
  };
  layer.tiles = normalizeGrid(layer.tiles, -1);
  layer.terrain = Array.isArray(layer.terrain) ? layer.terrain : [];
  for (let y = 0; y < h; y++) {
    if (!Array.isArray(layer.terrain[y])) layer.terrain[y] = [];
    for (let x = 0; x < w; x++) layer.terrain[y][x] = normalizeTerrainRef(layer.terrain[y][x], null);
    layer.terrain[y].length = w;
  }
  layer.terrain.length = h;
  layer.collision = normalizeGrid(layer.collision, 0);
  layer.cellData = normalizeCellDataGrid(layer.cellData, layer.terrain);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      layer.cellData[y][x].terrainTypeId = normalizeTerrainRef(layer.cellData[y][x]?.terrainTypeId, normalizeTerrainRef(layer.terrain[y]?.[x], null));
      layer.cellData[y][x].terrainSetId = normalizeTerrainRef(layer.cellData[y][x]?.terrainSetId, null);
      layer.cellData[y][x].tileIndex = Number.isFinite(Number(layer.cellData[y][x]?.tileIndex)) ? Number(layer.cellData[y][x].tileIndex) : -1;
      layer.terrain[y][x] = normalizeTerrainRef(layer.cellData[y][x]?.terrainTypeId, null);
    }
  }
  return layer;
}

function syncPrimaryTileLayerAliases(props) {
  if (!props) return;
  props.layers = Array.isArray(props.layers) ? props.layers : [];
  if (!props.layers.length) props.layers.push(createTileMapLayer('Ground', props.mapWidth || 10, props.mapHeight || 8));
  props.activeLayerId = String(props.activeLayerId || state.tilemapEditor.activeLayerId || props.layers[0].id);
  if (!props.layers.some((layer) => layer.id === props.activeLayerId)) props.activeLayerId = props.layers[0].id;
  const primary = props.layers[0];
  props.tiles = primary.tiles;
  props.terrain = primary.terrain;
  props.collision = primary.collision;
  const activeLayer = props.layers.find((layer) => layer.id === props.activeLayerId) || primary;
  props.tilesetId = String(activeLayer?.tilesetId || props.tilesetId || primary.tilesetId || '');
  state.tilemapEditor.activeLayerId = props.activeLayerId;
}


function syncTileMapNodeViewportSize(node) {
  if (!node || node.type !== 'TileMap') return;
  node.properties = node.properties || {};
  const props = node.properties;
  const screen = getTileMapScreenBounds();
  props.width = screen.width;
  props.height = screen.height;
}

function ensureTileMapData(node) {
  if (!node || node.type !== 'TileMap') return null;
  node.properties = node.properties || {};
  const props = node.properties;
  props.tileWidth = Math.max(1, Number(props.tileWidth) || 32);
  props.tileHeight = Math.max(1, Number(props.tileHeight) || 32);
  const derived = getTileMapDerivedSize(props.tileWidth, props.tileHeight);
  props.mapWidth = derived.mapWidth;
  props.mapHeight = derived.mapHeight;
  props.tilesetId = String(props.tilesetId || '');
  props.showGrid = props.showGrid !== false;
  props.showTerrainOverlay = props.showTerrainOverlay !== false;
  props.showCollisionOverlay = props.showCollisionOverlay !== false;
  if (!Array.isArray(props.layers) || !props.layers.length) {
    const first = createTileMapLayer('Ground', props.mapWidth, props.mapHeight);
    if (Array.isArray(props.tiles) && props.tiles.length) first.tiles = ensureTileLayerShape({ tiles: props.tiles, terrain: [], collision: [] }, props.mapWidth, props.mapHeight).tiles;
    props.layers = [first];
  }
  props.layers = props.layers.map((layer) => ensureTileLayerShape(layer, props.mapWidth, props.mapHeight));
  syncPrimaryTileLayerAliases(props);
  syncTileMapNodeViewportSize(node);
  return props;
};

function resizeTileMapData(node, nextWidth, nextHeight) {
  const props = ensureTileMapData(node);
  if (!props) return false;
  const derived = getTileMapDerivedSize(props.tileWidth, props.tileHeight);
  props.mapWidth = derived.mapWidth;
  props.mapHeight = derived.mapHeight;
  props.layers = (props.layers || []).map((layer) => ensureTileLayerShape(layer, props.mapWidth, props.mapHeight));
  syncPrimaryTileLayerAliases(props);
  syncTileMapNodeViewportSize(node);
  return true;
};

function getActiveTileMapLayer(node) {
  const props = ensureTileMapData(node);
  if (!props) return null;
  const activeId = String(state.tilemapEditor.activeLayerId || props.activeLayerId || props.layers[0]?.id || '');
  let layer = (props.layers || []).find((item) => item.id === activeId) || props.layers[0] || null;
  if (layer) {
    state.tilemapEditor.activeLayerId = layer.id;
    props.activeLayerId = layer.id;
  }
  return layer;
}

function ensureTilesetTileMetadata(tileset, tileIndex) {
  if (!tileset) return null;
  tileset.tileMetadata = tileset.tileMetadata && typeof tileset.tileMetadata === 'object' ? tileset.tileMetadata : {};
  const key = String(tileIndex);
  const meta = tileset.tileMetadata[key] && typeof tileset.tileMetadata[key] === 'object' ? tileset.tileMetadata[key] : {};
  // Preserve and normalize collisionShapes array
  meta.collisionShapes = Array.isArray(meta.collisionShapes) ? meta.collisionShapes.filter((s) => s && (s.type === 'rect' || s.type === 'polygon')) : [];
  // collision boolean: true if explicit OR if shapes are defined
  meta.collision = meta.collision === true || meta.collisionShapes.length > 0;
  // Preserve and normalize physicsShapes array
  meta.physicsShapes = Array.isArray(meta.physicsShapes) ? meta.physicsShapes.filter((s) => s && (s.type === 'rect' || s.type === 'polygon')) : [];
  meta.atlasX = meta.atlasX === '' || meta.atlasX == null ? '' : Number(meta.atlasX);
  meta.atlasY = meta.atlasY === '' || meta.atlasY == null ? '' : Number(meta.atlasY);
  meta.atlasW = meta.atlasW === '' || meta.atlasW == null ? '' : Math.max(1, Number(meta.atlasW));
  meta.atlasH = meta.atlasH === '' || meta.atlasH == null ? '' : Math.max(1, Number(meta.atlasH));
  delete meta.terrainTypeId;
  delete meta.terrainId;
  delete meta.autotileMask;
  delete meta.edgeLabels;
  delete meta.cornerLabels;
  delete meta.probability;
  delete meta.allowFlipX;
  delete meta.allowFlipY;
  delete meta.allowRotate90;
  delete meta.allowRotate180;
  delete meta.allowRotate270;
  tileset.tileMetadata[key] = meta;
  return meta;
}

ensureTilesetShape = function(tileset) {
  if (!tileset || typeof tileset !== 'object') return null;
  const resourceApi = window.RokuSchemaResources;
  if (resourceApi?.normalizeTilesetResource) {
    const normalized = resourceApi.normalizeTilesetResource(tileset);
    if (normalized && normalized !== tileset) {
      Object.keys(tileset).forEach((key) => delete tileset[key]);
      Object.assign(tileset, normalized);
    }
  }
  tileset.id = String(tileset.id || `tileset_${Math.random().toString(36).slice(2, 9)}`);
  tileset.name = String(tileset.name || 'TileSet');
  tileset.spriteSheetId = String(tileset.spriteSheetId || '');
  const sheet = getSheetById(tileset.spriteSheetId);
  tileset.tileWidth = Math.max(1, Number(tileset.tileWidth) || Number(sheet?.tileWidth) || 32);
  tileset.tileHeight = Math.max(1, Number(tileset.tileHeight) || Number(sheet?.tileHeight) || 32);
  tileset.padding = Math.max(0, Number(tileset.padding) || Number(sheet?.padding) || 0);
  tileset.selectedTileIndex = Math.max(0, Number(tileset.selectedTileIndex) || 0);
  tileset.tileMetadata = tileset.tileMetadata && typeof tileset.tileMetadata === 'object' ? tileset.tileMetadata : {};
  tileset.terrainSets = Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];
  Object.keys(tileset.tileMetadata).forEach((key) => ensureTilesetTileMetadata(tileset, key));
  return tileset;
};

getSerializableTilesets = function() {
  return (state.tilesets || []).map((tileset) => {
    const normalized = ensureTilesetShape(JSON.parse(JSON.stringify(tileset))) || tileset;
    return {
      id: normalized.id,
      name: normalized.name,
      spriteSheetId: normalized.spriteSheetId || '',
      tileWidth: Math.max(1, Number(normalized.tileWidth) || 32),
      tileHeight: Math.max(1, Number(normalized.tileHeight) || 32),
      padding: Math.max(0, Number(normalized.padding) || 0),
      selectedTileIndex: Math.max(0, Number(normalized.selectedTileIndex) || 0),
      terrainSets: JSON.parse(JSON.stringify(normalized.terrainSets || [])),
      tileMetadata: JSON.parse(JSON.stringify(normalized.tileMetadata || {}))
    };
  });
};

getSerializableSpritesheets = function() {
  return (state.spritesheets || []).map((s) => ({
    id: s.id, name: s.name, filePath: s.filePath, resourcePath: s.resourcePath || '', relativePath: s.relativePath || '', projectAsset: s.projectAsset === true,
    dataUrl: s.dataUrl, tileWidth: Math.max(1, Number(s.tileWidth) || 32), tileHeight: Math.max(1, Number(s.tileHeight) || 32), padding: Math.max(0, Number(s.padding) || 0),
    offsetX: Number(s.offsetX) || 0, offsetY: Number(s.offsetY) || 0,
    imageWidth: Math.max(0, Number(s.imageWidth) || 0), imageHeight: Math.max(0, Number(s.imageHeight) || 0), columns: Math.max(1, Number(s.columns) || 1), rows: Math.max(1, Number(s.rows) || 1)
  }));
};

createProjectAssetSheet = function(payload) {
  const sheet = {
    id: payload.id || `sheet_${Math.random().toString(36).slice(2, 9)}`,
    name: payload.name || payload.fileName || 'Spritesheet',
    filePath: payload.filePath || '',
    resourcePath: payload.resourcePath || payload.resPath || '',
    relativePath: payload.relativePath || '',
    dataUrl: payload.dataUrl || '',
    image: null,
    tileWidth: Math.max(1, Number(payload.tileWidth) || 32),
    tileHeight: Math.max(1, Number(payload.tileHeight) || 32),
    padding: Math.max(0, Number(payload.padding) || 0),
    offsetX: Number(payload.offsetX) || 0,
    offsetY: Number(payload.offsetY) || 0,
    imageWidth: Math.max(0, Number(payload.imageWidth) || 0),
    imageHeight: Math.max(0, Number(payload.imageHeight) || 0),
    columns: Math.max(1, Number(payload.columns) || 1),
    rows: Math.max(1, Number(payload.rows) || 1),
    projectAsset: payload.projectAsset !== false
  };
  if (sheet.dataUrl) {
    const img = new Image();
    img.onload = () => { sheet.image = img; recalcSheetMetrics(sheet); syncSpritesheetsToSceneState(); renderSpritesheetsPanel(); renderSpriteFramesPanel(); renderTilesetsPanel(); renderTileMapsPanel(); };
    img.onerror = () => setStatus(`Could not load project image "${sheet.name}".`, true);
    img.src = sheet.dataUrl;
    sheet.image = img;
  }
  return sheet;
};

rebuildSpritesheetsFromSceneState = function() {
  const saved = Array.isArray(state.editorState?.spritesheets) ? state.editorState.spritesheets : [];
  const existingSheets = Array.isArray(state.spritesheets) ? state.spritesheets.slice() : [];
  const existingByKey = new Map();
  existingSheets.forEach((sheet) => {
    const resourceKey = String(sheet?.resourcePath || '').trim().toLowerCase();
    const fileKey = String(sheet?.filePath || '').trim().toLowerCase();
    const relativeKey = normalizeAssetRelativePath(sheet?.relativePath || '').toLowerCase();
    if (resourceKey) existingByKey.set(resourceKey, sheet);
    if (fileKey) existingByKey.set(fileKey, sheet);
    if (relativeKey) existingByKey.set(relativeKey, sheet);
  });

  state.spritesheets = [];
  state.selectedSheetId = state.editorState?.selectedSheetId || null;
  saved.forEach((sv) => {
    if (!sv) return;
    const resourceKey = String(sv.resourcePath || '').trim().toLowerCase();
    const fileKey = String(sv.filePath || '').trim().toLowerCase();
    const relativeKey = normalizeAssetRelativePath(sv.relativePath || '').toLowerCase();
    const existing = existingByKey.get(resourceKey) || existingByKey.get(fileKey) || existingByKey.get(relativeKey) || null;
    state.spritesheets.push(createProjectAssetSheet({
      id: sv.id,
      name: sv.name,
      filePath: sv.filePath || existing?.filePath || '',
      resourcePath: sv.resourcePath || existing?.resourcePath || '',
      relativePath: sv.relativePath || existing?.relativePath || '',
      dataUrl: sv.dataUrl || existing?.dataUrl || '',
      category: sv.category || existing?.category || '',
      tileWidth: sv.tileWidth,
      tileHeight: sv.tileHeight,
      padding: sv.padding,
      offsetX: sv.offsetX,
      offsetY: sv.offsetY,
      imageWidth: sv.imageWidth || existing?.imageWidth,
      imageHeight: sv.imageHeight || existing?.imageHeight,
      columns: sv.columns || existing?.columns,
      rows: sv.rows || existing?.rows,
      projectAsset: sv.projectAsset === true || existing?.projectAsset === true
    }));
  });
  if (!state.spritesheets.some((s) => s.id === state.selectedSheetId)) state.selectedSheetId = state.spritesheets[0]?.id || null;
  syncSpritesheetsToSceneState();
};

syncSheetInputs = function(sheet) {
  const tw = document.getElementById('sheet-tile-w'), th = document.getElementById('sheet-tile-h'), pad = document.getElementById('sheet-padding');
  const ox = document.getElementById('sheet-offset-x'), oy = document.getElementById('sheet-offset-y');
  if (tw) tw.value = sheet ? sheet.tileWidth : 32;
  if (th) th.value = sheet ? sheet.tileHeight : 32;
  if (pad) pad.value = sheet ? sheet.padding : 0;
  if (ox) ox.value = sheet ? (sheet.offsetX || 0) : 0;
  if (oy) oy.value = sheet ? (sheet.offsetY || 0) : 0;
};

recalcSheetMetrics = function(sheet) {
  if (!sheet?.image) return;
  sheet.tileWidth = Math.max(1, Number(sheet.tileWidth) || 32);
  sheet.tileHeight = Math.max(1, Number(sheet.tileHeight) || 32);
  sheet.padding = Math.max(0, Number(sheet.padding) || 0);
  sheet.offsetX = Number(sheet.offsetX) || 0;
  sheet.offsetY = Number(sheet.offsetY) || 0;
  sheet.imageWidth = sheet.image.naturalWidth;
  sheet.imageHeight = sheet.image.naturalHeight;
  const usableW = Math.max(0, sheet.imageWidth - sheet.offsetX);
  const usableH = Math.max(0, sheet.imageHeight - sheet.offsetY);
  sheet.columns = Math.max(1, Math.floor((usableW + sheet.padding) / (sheet.tileWidth + sheet.padding)));
  sheet.rows = Math.max(1, Math.floor((usableH + sheet.padding) / (sheet.tileHeight + sheet.padding)));
  const max = Math.max(0, sheet.columns * sheet.rows - 1);
  state.spriteEditor.selectedTileIndex = Math.min(state.spriteEditor.selectedTileIndex, max);
  state.spriteEditor.animationFrames = state.spriteEditor.animationFrames.filter((i) => i >= 0 && i <= max);
};

updateSelectedSheetMetricsFromInputs = function() {
  const node = getSelectedAnimationNode();
  const sheet = node ? (getNodeAssignedSheet(node) || getSelectedSheet()) : getSelectedSheet();
  if (!sheet) return;
  sheet.tileWidth = Math.max(1, Number(document.getElementById('sheet-tile-w')?.value) || 32);
  sheet.tileHeight = Math.max(1, Number(document.getElementById('sheet-tile-h')?.value) || 32);
  sheet.padding = Math.max(0, Number(document.getElementById('sheet-padding')?.value) || 0);
  sheet.offsetX = Number(document.getElementById('sheet-offset-x')?.value) || 0;
  sheet.offsetY = Number(document.getElementById('sheet-offset-y')?.value) || 0;
  recalcSheetMetrics(sheet); syncSpritesheetsToSceneState(); renderSpritesheetsPanel(); renderSpriteFramesPanel(); renderTilesetsPanel(); renderTileMapsPanel();
};

drawSheetCanvas = function(sheet) {
  if (!sheetCanvasEl) return;
  const ctx = sheetCanvasEl.getContext('2d');
  if (!sheet?.image) {
    sheetCanvasEl.width = 512; sheetCanvasEl.height = 256;
    ctx.clearRect(0, 0, 512, 256); ctx.fillStyle = '#8a93b0'; ctx.font = '13px sans-serif'; ctx.fillText('Upload a spritesheet to begin.', 16, 24); return;
  }
  recalcSheetMetrics(sheet);
  sheetCanvasEl.width = sheet.imageWidth; sheetCanvasEl.height = sheet.imageHeight;
  ctx.clearRect(0, 0, sheet.imageWidth, sheet.imageHeight); ctx.imageSmoothingEnabled = false; ctx.drawImage(sheet.image, 0, 0);
  if (state.spriteEditor.showGrid) {
    ctx.save(); ctx.strokeStyle = 'rgba(95,178,211,0.55)'; ctx.lineWidth = 1;
    for (let col = 0; col < sheet.columns; col++) for (let row = 0; row < sheet.rows; row++) {
      const sx = sheet.offsetX + col * (sheet.tileWidth + sheet.padding), sy = sheet.offsetY + row * (sheet.tileHeight + sheet.padding);
      if (sx + sheet.tileWidth > sheet.imageWidth || sy + sheet.tileHeight > sheet.imageHeight) continue;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sheet.tileWidth, sheet.tileHeight);
    }
    ctx.strokeStyle = 'rgba(229,100,122,0.8)';
    ctx.strokeRect(sheet.offsetX + 0.5, sheet.offsetY + 0.5, Math.max(1, sheet.imageWidth - sheet.offsetX - 1), Math.max(1, sheet.imageHeight - sheet.offsetY - 1));
    ctx.restore();
  }
  const selRect = getTileRect(sheet, state.spriteEditor.selectedTileIndex);
  if (selRect) {
    ctx.save(); ctx.strokeStyle = '#e5c97a'; ctx.lineWidth = 2; ctx.strokeRect(selRect.x + 1, selRect.y + 1, selRect.width - 2, selRect.height - 2); ctx.fillStyle = 'rgba(229,201,122,0.15)'; ctx.fillRect(selRect.x + 1, selRect.y + 1, selRect.width - 2, selRect.height - 2); ctx.restore();
  }
};

getTileRect = function(sheet, index) {
  if (!sheet || index == null) return null;
  const col = index % sheet.columns, row = Math.floor(index / sheet.columns);
  const x = (Number(sheet.offsetX) || 0) + col * (sheet.tileWidth + sheet.padding);
  const y = (Number(sheet.offsetY) || 0) + row * (sheet.tileHeight + sheet.padding);
  if (x + sheet.tileWidth > sheet.imageWidth || y + sheet.tileHeight > sheet.imageHeight) return null;
  return { x, y, width: sheet.tileWidth, height: sheet.tileHeight, col, row };
};

function getTilesetTileRect(tileset, tileIndex) {
  if (!tileset) return null;
  const sheet = getSheetById(tileset.spriteSheetId);
  const base = getTileRect(makeTilesetSheet(sheet, tileset), tileIndex);
  if (!base) return null;
  const meta = ensureTilesetTileMetadata(tileset, tileIndex);
  const x = meta.atlasX === '' || meta.atlasX == null ? base.x : Number(meta.atlasX);
  const y = meta.atlasY === '' || meta.atlasY == null ? base.y : Number(meta.atlasY);
  const width = meta.atlasW === '' || meta.atlasW == null ? base.width : Math.max(1, Number(meta.atlasW));
  const height = meta.atlasH === '' || meta.atlasH == null ? base.height : Math.max(1, Number(meta.atlasH));
  return { x, y, width, height, col: base.col, row: base.row };
}

makeTilesetSheet = function(sheet, tileset) {
  if (!sheet || !tileset) return null;
  return {
    image: sheet.image,
    imageWidth: sheet.imageWidth,
    imageHeight: sheet.imageHeight,
    offsetX: Number(sheet.offsetX) || 0,
    offsetY: Number(sheet.offsetY) || 0,
    tileWidth: Math.max(1, Number(tileset.tileWidth) || Number(sheet.tileWidth) || 32),
    tileHeight: Math.max(1, Number(tileset.tileHeight) || Number(sheet.tileHeight) || 32),
    padding: Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0),
    columns: Math.max(1, Math.floor((Math.max(0, sheet.imageWidth - (Number(sheet.offsetX) || 0)) + Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0)) / (Math.max(1, Number(tileset.tileWidth) || Number(sheet.tileWidth) || 32) + Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0)))),
    rows: Math.max(1, Math.floor((Math.max(0, sheet.imageHeight - (Number(sheet.offsetY) || 0)) + Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0)) / (Math.max(1, Number(tileset.tileHeight) || Number(sheet.tileHeight) || 32) + Math.max(0, Number(tileset.padding) || Number(sheet.padding) || 0))))
  };
};

extractTileDataUrl = function(sheetOrTileset, index) {
  let sheet = sheetOrTileset;
  let rect = null;
  if (sheetOrTileset && sheetOrTileset.spriteSheetId) {
    const tileset = sheetOrTileset;
    sheet = getSheetById(tileset.spriteSheetId);
    rect = getTilesetTileRect(tileset, index);
  } else {
    rect = getTileRect(sheetOrTileset, index);
  }
  if (!sheet?.image || !rect) return '';
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, rect.width); canvas.height = Math.max(1, rect.height);
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

onSheetCanvasClick = function(event) {
  const sheet = getSelectedSheet(); if (!sheet || !sheetCanvasEl) return;
  const rect = sheetCanvasEl.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const x = (event.clientX - rect.left) * (sheetCanvasEl.width / rect.width);
  const y = (event.clientY - rect.top) * (sheetCanvasEl.height / rect.height);
  const strideX = sheet.tileWidth + sheet.padding, strideY = sheet.tileHeight + sheet.padding;
  const localX = x - (Number(sheet.offsetX) || 0), localY = y - (Number(sheet.offsetY) || 0);
  const col = Math.floor(localX / strideX), row = Math.floor(localY / strideY);
  if (col < 0 || row < 0 || col >= sheet.columns || row >= sheet.rows) return;
  if ((localX - col * strideX) > sheet.tileWidth || (localY - row * strideY) > sheet.tileHeight) return;
  const index = row * sheet.columns + col;
  state.spriteEditor.selectedTileIndex = index; renderSpritesheetsPanel(); applyTileToSelectedSprite(sheet, index, { silentWhenNoSelection: true });
  if (sheetSelectionMetaEl) {
    const tileRect = getTileRect(sheet, index);
    sheetSelectionMetaEl.textContent = tileRect ? `Tile #${index} · col ${tileRect.col} row ${tileRect.row} · ${tileRect.width}×${tileRect.height}` : 'Invalid tile';
  }
};

importSpritesheet = async function() {
  const result = await openImageFileSafe({ assetKind: 'spritesheet' }); if (!result.success) return;
  const tileWidth = Math.max(1, Number(document.getElementById('sheet-tile-w')?.value) || 32);
  const tileHeight = Math.max(1, Number(document.getElementById('sheet-tile-h')?.value) || 32);
  const padding = Math.max(0, Number(document.getElementById('sheet-padding')?.value) || 0);
  const offsetX = Number(document.getElementById('sheet-offset-x')?.value) || 0;
  const offsetY = Number(document.getElementById('sheet-offset-y')?.value) || 0;
  const img = new Image();
  img.onload = () => {
    const sheet = { id: `sheet_${Math.random().toString(36).slice(2, 9)}`, name: result.filePath.split(/[\/\\]/).pop(), filePath: result.filePath, resourcePath: result.resPath || '', relativePath: String(result.resPath || '').replace(/^res:\/\//, ''), dataUrl: result.dataUrl, image: img, tileWidth, tileHeight, padding, offsetX, offsetY, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, columns: 1, rows: 1, projectAsset: !!result.resPath };
    recalcSheetMetrics(sheet); state.spritesheets.push(sheet); state.selectedSheetId = sheet.id; syncSpritesheetsToSceneState(); state.spriteEditor.selectedTileIndex = 0; state.spriteEditor.animationFrames = []; state.spriteEditor.selectedFrameIndex = -1; syncSheetInputs(sheet); renderSpritesheetsPanel(); renderSpriteFramesPanel(); renderTilesetsPanel(); renderTileMapsPanel(); setStatus(`Imported spritesheet "${sheet.name}".`);
  };
  img.onerror = () => setStatus('Could not import spritesheet.', true); img.src = result.dataUrl;
};

function getTileMapTerrainHostTileset(node) {
  const activeNode = node || getSelectedTileMapNode();
  if (!activeNode) return getSelectedTileset() || null;
  const activeLayer = getActiveTileMapLayer(activeNode);
  return getTileMapAssignedTileset(activeNode, activeLayer) || getSelectedTileset() || null;
}

function getTerrainSetsForTileset(tileset) {
  if (!tileset) return [];
  tileset.terrainSets = Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];
  return tileset.terrainSets;
}

function getSelectedTerrainSet(tileset = null) {
  const host = tileset || getTileMapTerrainHostTileset();
  const sets = getTerrainSetsForTileset(host);
  if (!sets.length) {
    state.tilemapEditor.selectedTerrainSetId = null;
    return null;
  }
  let selected = sets.find((set) => set && set.id === state.tilemapEditor.selectedTerrainSetId) || sets[0];
  state.tilemapEditor.selectedTerrainSetId = selected?.id || null;
  return selected || null;
}

function getSelectedTerrainEntry(tileset = null, terrainSet = null) {
  const host = tileset || getTileMapTerrainHostTileset();
  const selectedSet = terrainSet || getSelectedTerrainSet(host);
  const terrains = Array.isArray(selectedSet?.terrainTypes) ? selectedSet.terrainTypes : [];
  if (!terrains.length) {
    state.tilemapEditor.selectedTerrainId = null;
    return null;
  }
  let selected = terrains.find((terrain) => terrain && terrain.id === state.tilemapEditor.selectedTerrainId) || terrains[0];
  state.tilemapEditor.selectedTerrainId = selected?.id || null;
  if (selected) {
    state.tilemapEditor.selectedTerrainId = selected.id;
    state.tilemapEditor.selectedTerrain = selected.id;
  }
  return selected || null;
}

function syncSelectedTerrainIndices(tileset = null) {
  const host = tileset || getTileMapTerrainHostTileset();
  const set = getSelectedTerrainSet(host);
  const terrain = getSelectedTerrainEntry(host, set);
  if (!terrain) return;
  const terrains = Array.isArray(set?.terrainTypes) ? set.terrainTypes : [];
  const index = terrains.findIndex((entry) => entry && entry.id === terrain.id);
  state.tilemapEditor.selectedTerrainId = terrain.id;
  state.tilemapEditor.selectedTerrain = terrain.id;
}

function createTerrainSetForUi(tileset = null) {
  const api = window.RokuSchemaResources;
  const host = tileset || getSelectedTileset() || (typeof getTileMapTerrainHostTileset === 'function' ? getTileMapTerrainHostTileset() : null);
  const existingSets = host ? getTerrainSetsForTileset(host) : [];
  const terrainSet = api?.createDefaultTerrainSet ? api.createDefaultTerrainSet() : { id: `terrainset_${Math.random().toString(36).slice(2, 9)}`, name: 'Terrain Set', terrainTypes: [], rules: [] };
  terrainSet.name = `Terrain Set ${Math.max(0, existingSets.length) + 1}`;
  terrainSet.terrainTypes = Array.isArray(terrainSet.terrainTypes) ? terrainSet.terrainTypes : [];
  terrainSet.rules = Array.isArray(terrainSet.rules) ? terrainSet.rules : [];
  return api?.normalizeTerrainSet ? api.normalizeTerrainSet(terrainSet) : terrainSet;
}

function ensureEditableTerrainSetForUi(tileset = null) {
  const host = tileset || getSelectedTileset() || (typeof getTileMapTerrainHostTileset === 'function' ? getTileMapTerrainHostTileset() : null);
  if (!host) return null;
  host.terrainSets = Array.isArray(host.terrainSets) ? host.terrainSets : [];
  let set = getSelectedTilesetTerrainSet(host);
  if (!set) {
    set = createTerrainSetForUi(host);
    host.terrainSets.push(set);
    state.tilesetTerrainEditor.selectedTerrainSetId = set.id;
    state.tilesetTerrainEditor.selectedTerrainId = null;
    state.tilesetTerrainEditor.selectedRuleId = null;
  }
  set.terrainTypes = Array.isArray(set.terrainTypes) ? set.terrainTypes : [];
  set.rules = Array.isArray(set.rules) ? set.rules : [];
  return set;
}

function createTerrainEntryForUi(terrainSet) {
  const api = window.RokuSchemaResources;
  const terrain = api?.createDefaultTerrain ? api.createDefaultTerrain() : { id: `terrain_${Math.random().toString(36).slice(2, 9)}`, name: 'Terrain', color: '#7a6ff0', iconTileIndex: null };
  const count = Math.max(0, Array.isArray(terrainSet?.terrainTypes) ? terrainSet.terrainTypes.length : 0);
  terrain.name = `Terrain ${count + 1}`;
  if (!/^#([0-9a-f]{6})$/i.test(String(terrain.color || ''))) terrain.color = '#7a6ff0';
  return api?.normalizeTerrain ? api.normalizeTerrain(terrain) : terrain;
}

function getEditableTilesetForTerrainUi() {
  const selected = getSelectedTileset();
  if (selected) return selected;

  const assigned = typeof getTileMapTerrainHostTileset === 'function'
    ? getTileMapTerrainHostTileset()
    : null;
  if (assigned) {
    state.selectedTilesetId = assigned.id;
    return assigned;
  }

  const first = Array.isArray(state.tilesets) ? state.tilesets[0] : null;
  if (first) {
    state.selectedTilesetId = first.id;
    return first;
  }
  return null;
}

function refreshTerrainAuthoringUi() {
  syncTilesetsToSceneState();
  renderTilesetsPanel();
  renderTilesetTerrainPanel();
  renderTileMapsPanel();
  if (typeof renderViewport === 'function') scheduleRender(RenderFlags.VIEWPORT);
}

function createTerrainSetFromUiAction() {
  const host = getEditableTilesetForTerrainUi();
  if (!host) { setStatus('Select or create a tileset first.', true); return null; }
  host.terrainSets = Array.isArray(host.terrainSets) ? host.terrainSets : [];
  const before = serializeScene(); const _vTerrainAdd = _getSceneVersion();
  const newSet = createTerrainSetForUi(host);
  newSet.id = String(newSet.id || `terrainset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
  newSet.name = `Terrain Set ${host.terrainSets.length + 1}`;
  newSet.terrainTypes = Array.isArray(newSet.terrainTypes) ? newSet.terrainTypes : [];
  newSet.rules = Array.isArray(newSet.rules) ? newSet.rules : [];
  host.terrainSets.push(newSet);
  state.selectedTilesetId = host.id;
  state.tilesetTerrainEditor = state.tilesetTerrainEditor || {};
  state.tilesetTerrainEditor.selectedTerrainSetId = newSet.id;
  state.tilesetTerrainEditor.selectedTerrainId = null;
  state.tilesetTerrainEditor.selectedRuleId = null;
  state.tilemapEditor = state.tilemapEditor || {};
  state.tilemapEditor.selectedTerrainSetId = newSet.id;
  state.tilemapEditor.selectedTerrainId = null;
  state.tilemapEditor.selectedTerrain = null;
  pushHistory('Add terrain set', before);
  refreshTerrainAuthoringUi();
  setStatus(`Created terrain set "${newSet.name}".`);
  return newSet;
}

function createTerrainTypeFromUiAction() {
  const host = getEditableTilesetForTerrainUi();
  if (!host) { setStatus('Select or create a tileset first.', true); return null; }
  const set = ensureEditableTerrainSetForUi(host);
  if (!set) { setStatus('Create or select a terrain set first.', true); return null; }
  set.terrainTypes = Array.isArray(set.terrainTypes) ? set.terrainTypes : [];
  const before = serializeScene(); const _vTerrainAdd2 = _getSceneVersion();
  const terrain = createTerrainEntryForUi(set);
  terrain.id = String(terrain.id || `terrain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
  set.terrainTypes.push(terrain);
  state.selectedTilesetId = host.id;
  state.tilesetTerrainEditor = state.tilesetTerrainEditor || {};
  state.tilesetTerrainEditor.selectedTerrainSetId = set.id;
  state.tilesetTerrainEditor.selectedTerrainId = terrain.id;
  state.tilesetTerrainEditor.selectedRuleId = null;
  state.tilemapEditor = state.tilemapEditor || {};
  state.tilemapEditor.selectedTerrainSetId = set.id;
  state.tilemapEditor.selectedTerrainId = terrain.id;
  state.tilemapEditor.selectedTerrain = terrain.id;
  pushHistory('Add terrain type', before);
  refreshTerrainAuthoringUi();
  setStatus(`Created terrain type "${terrain.name}".`);
  return terrain;
}


function commitTerrainPanelChange(options = {}) {
  const before = options.beforeSnapshot || beginTerrainAction(options.label || 'Edit terrain data');
  syncSelectedTerrainIndices();
  syncTilesetsToSceneState();
  if (options.renderViewport) scheduleRender(RenderFlags.VIEWPORT);
  renderTileMapsPanel();
  if (!options.deferCommit) commitTerrainAction(options.label || 'Edit terrain data');
  return before;
}

// Legacy edge/corner/mixed pattern coverage UI removed in v35.6.

function formatTerrainDebugLabels(labels) {
  if (!labels || typeof labels !== 'object') return '—';
  const keys = ['topLeft','top','topRight','left','right','bottomLeft','bottom','bottomRight'];
  return keys.map((key) => `${key}:${labels[key] ?? 'null'}`).join(' · ');
}

function buildTerrainDebugMarkup() {
  const debug = state.tilemapEditor?.terrainDebugInfo;
  const info = debug?.diagnostics || null;
  const overlayChecked = state.tilemapEditor?.terrainDebug === true ? 'checked' : '';
  const overlayControl = `<label class="gd-inspector-check terrain-debug-overlay-toggle"><input id="tm-terrain-debug-overlay" type="checkbox" ${overlayChecked}> Debug Overlay</label>`;
  if (!debug) return `${overlayControl}<div class="terrain-panel-note">Click <strong>Debug Selected Cell</strong>, pick a terrain cell, or enable debug overlay to inspect solved terrain cells.</div>`;
  const signature = info?.neighborSignature || {};
  const socketCell = (key, label) => `<div class="terrain-debug-socket terrain-debug-socket-${escapeHtml(key)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(signature[key] ?? 'null')}</strong></div>`;
  const socketGrid = `<div class="terrain-debug-neighbor-grid">
    ${socketCell('topLeft', 'TL')}${socketCell('top', 'T')}${socketCell('topRight', 'TR')}
    ${socketCell('left', 'L')}<div class="terrain-debug-center"><span>Cell</span><strong>${escapeHtml(info?.terrainTypeId ?? debug.terrainTypeId ?? 'null')}</strong></div>${socketCell('right', 'R')}
    ${socketCell('bottomLeft', 'BL')}${socketCell('bottom', 'B')}${socketCell('bottomRight', 'BR')}
  </div>`;
  // v35.2: include score breakdown and candidate count in debug panel
  const scoreText = info?.score
    ? `quality=${info.score.quality} exact=${info.score.exact} wildcard=${info.score.wildcard} constrained=${info.score.constrained}`
    : '—';
  const candidateCount = Number(info?.candidateCount) || 0;
  return `
    ${overlayControl}
    <div class="terrain-debug-card terrain-debug-card-rich">
      <div class="terrain-debug-title"><strong>Selected Cell</strong> ${debug.col}, ${debug.row}</div>
      <div class="terrain-debug-grid">
        <span><strong>Terrain</strong> ${escapeHtml(info?.terrainTypeId ?? debug.terrainTypeId ?? 'null')}</span>
        <span><strong>Rule</strong> ${escapeHtml(info?.matchedRuleId ?? info?.ruleId ?? 'none')}</span>
        <span><strong>Tile</strong> ${escapeHtml(String(info?.tileIndex ?? '—'))}</span>
        <span><strong>Transform</strong> ${escapeHtml(JSON.stringify(info?.transform || { flipX:false, flipY:false, rotation:0 }))}</span>
        <span><strong>Score</strong> ${escapeHtml(scoreText)}</span>
        <span><strong>Candidates</strong> ${escapeHtml(String(candidateCount))}</span>
        <span><strong>Fallback</strong> ${info?.fallbackUsed ? 'yes' : 'no'}</span>
      </div>
      ${socketGrid}
      <div class="terrain-panel-note">${escapeHtml(info?.fallbackReason || 'Matched terrain rule successfully.')}</div>
      ${(info?.top5Candidates||[]).length ? `<details class="tr-debug-candidates"><summary>Top candidates (${info.top5Candidates.length})</summary><div class="tr-debug-candidate-list">${(info.top5Candidates||[]).map((c,i) => {
        const mark = c.matched ? '✓' : '✗';
        const fails = (c.failedChecks||[]).slice(0,3).map(f=>`<span class="tr-debug-fail">${escapeHtml(f.key)}: ${escapeHtml(String(f.reason||''))}</span>`).join('');
        return `<div class="tr-debug-candidate ${c.matched?'matched':'missed'}"><span class="tr-debug-mark">${escapeHtml(mark)}</span><span class="tr-debug-cand-id">${escapeHtml(String(c.ruleId||'?'))}</span><span class="tr-debug-cand-tile">#${escapeHtml(String(c.tileIndex??'?'))}</span><span class="tr-debug-cand-q">q=${escapeHtml(String(c.score?.quality??'?'))}</span>${fails}</div>`;
      }).join('')}</div></details>` : ''}
    </div>`;
}

function rebuildSelectedTerrainLayer() {
  // Cancel pending RAF flush — we're doing a full rebuild now
  if (_terrainDirtyRafId) { cancelAnimationFrame(_terrainDirtyRafId); _terrainDirtyRafId = null; }
  _terrainDirtyCells.clear();
  const node = getSelectedTileMapNode();
  const layer = node ? getActiveTileMapLayer(node) : null;
  const rebuildApi = window.RokuTerrainRebuild;
  if (!node || !layer || !rebuildApi?.rebuildTerrainLayer) return false;
  beginTerrainAction('Rebuild terrain layer');
  const result = rebuildApi.rebuildTerrainLayer(node, layer, {
    getTerrainId: getTileMapCellTerrainId,
    applySolverAt: applyTerrainSolverAt
  });
  scheduleRender(RenderFlags.VIEWPORT);
  renderTileMapsPanel();
  updateSceneSummary();
  commitTerrainAction('Rebuild terrain layer');
  setStatus(`Rebuilt terrain layer "${layer.name || 'Layer'}" (${result.solvedCells} cells).`);
  return result.changed;
}

function rebuildAllTerrainLayersForProject() {
  const rebuildApi = window.RokuTerrainRebuild;
  if (!rebuildApi?.rebuildAllTerrainLayers) return false;
  const tilemaps = getNodes().filter((node) => node && node.type === 'TileMap');
  beginTerrainAction('Rebuild all terrain layers');
  const result = rebuildApi.rebuildAllTerrainLayers(tilemaps, {
    getTerrainId: getTileMapCellTerrainId,
    applySolverAt: applyTerrainSolverAt
  });
  scheduleRender(RenderFlags.VIEWPORT);
  renderTileMapsPanel();
  updateSceneSummary();
  commitTerrainAction('Rebuild all terrain layers');
  setStatus(`Rebuilt terrain across ${result.results.length} layer${result.results.length === 1 ? '' : 's'}.`);
  return result.changed;
}

function renderTileMapTerrainPanel(node) {
  if (!tmTerrainPanelEl) return;
  const activeNode = node || getSelectedTileMapNode();
  const mode = state.tilemapEditor.paintMode || 'tile';
  const isTerrainMode = mode === 'terrain';
  tmTerrainPanelEl.classList.toggle('is-active', isTerrainMode);
  tmTerrainPanelEl.style.display = isTerrainMode ? '' : 'none';
  if (!isTerrainMode) return;

  const hostTileset = getTileMapTerrainHostTileset(activeNode);
  if (!activeNode) {
    tmTerrainPanelEl.innerHTML = '<div class="tile-meta">Select a TileMap node to paint terrain.</div>';
    return;
  }
  if (!hostTileset) {
    tmTerrainPanelEl.innerHTML = '<div class="tile-meta tile-meta-warn">Assign a tileset to this TileMap&#39;s active layer before painting terrain. Use the Layers list on the left.</div>';
    return;
  }

  const terrainSets    = getTerrainSetsForTileset(hostTileset);
  const selectedSet    = getSelectedTerrainSet(hostTileset);
  const selectedTerrain = getSelectedTerrainEntry(hostTileset, selectedSet);
  const tool           = state.tilemapEditor.tool || 'paint';
  const debugActive    = state.tilemapEditor.terrainDebug === true;

  // Terrain set dropdown
  const setOptions = terrainSets.length
    ? terrainSets.map((s) =>
        `<option value="${escapeHtml(s.id)}"${s.id === selectedSet?.id ? ' selected' : ''}>${escapeHtml(s.name || 'Terrain Set')}</option>`
      ).join('')
    : '<option value="">No terrain sets</option>';

  // Terrain type buttons
  const terrainRows = selectedSet?.terrainTypes?.length
    ? selectedSet.terrainTypes.map((terrain) => {
        const active    = terrain.id === selectedTerrain?.id;
        const ruleCount = (selectedSet.rules || []).filter((r) => String(r?.terrainTypeId) === String(terrain.id) && r?.enabled !== false).length;
        return `<button class="tm-terrain-type-btn${active ? ' active' : ''}" type="button"
            data-terrain-id="${escapeHtml(terrain.id)}"
            title="${escapeHtml(terrain.name || terrain.id)} · ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}">
          <span class="tm-terrain-swatch" style="background:${escapeHtml(terrain.color || '#7a6ff0')}"></span>
          <span class="tm-terrain-label">${escapeHtml(terrain.name || terrain.id)}</span>
          <span class="tm-terrain-rule-count">${ruleCount}r</span>
        </button>`;
      }).join('')
    : `<div class="terrain-empty">No terrain types. <button class="tool-btn inline-btn" type="button" id="tm-terrain-open-tilesets-inline">Open Tile Sets →</button></div>`;

  // Active terrain indicator
  const activeTerrainColor = selectedTerrain?.color || '#7a6ff0';
  const activeTerrainName  = selectedTerrain ? selectedTerrain.name || selectedTerrain.id : 'None selected';
  const activeTool = tool === 'erase' ? 'Erasing' : (selectedTerrain ? `Painting: ${activeTerrainName}` : 'Select a terrain type');

  tmTerrainPanelEl.innerHTML = `<div class="tm-terrain-paint-panel">

    <!-- Set selector -->
    <div class="tm-terrain-set-row">
      <select class="gd-paint-prop-select tm-terrain-set-select" id="tm-terrain-set-select" ${terrainSets.length ? '' : 'disabled'}>${setOptions}</select>
      <button class="tool-btn tm-terrain-goto-sets" type="button" id="tm-terrain-open-tilesets" title="Edit terrain sets in Tile Sets panel">Edit Sets</button>
    </div>

    <!-- Active brush indicator -->
    <div class="tm-terrain-active-brush${!selectedTerrain && tool !== 'erase' ? ' tm-terrain-active-brush--none' : ''}">
      ${tool === 'erase'
        ? '<span class="tm-terrain-erase-indicator">✕ Erase mode</span>'
        : `<span class="tm-terrain-swatch-lg" style="background:${escapeHtml(activeTerrainColor)}"></span><span class="tm-terrain-active-name">${escapeHtml(activeTool)}</span>`
      }
    </div>

    <!-- Terrain type list -->
    <div class="tm-terrain-type-list">${terrainRows}</div>

    <!-- Action buttons -->
    <div class="tm-terrain-actions">
      <button class="tool-btn" type="button" id="tm-terrain-rebuild-layer">Rebuild Layer</button>
      <button class="tool-btn" type="button" id="tm-terrain-debug-cell">Debug Cell</button>
      <button class="tool-btn${debugActive ? ' active' : ''}" type="button" id="tm-terrain-toggle-debug">${debugActive ? 'Hide Overlay' : 'Show Overlay'}</button>
    </div>

    <!-- Debug panel -->
    ${buildTerrainDebugMarkup()}

    <div class="terrain-panel-note">Paint logical terrain types. The rule solver automatically picks the correct tile. Use the main toolbar for Paint · Rect · Line · Fill · Erase.</div>
  </div>`;

  // ── event bindings ────────────────────────────────────────────────────
  tmTerrainPanelEl.querySelector('#tm-terrain-set-select')?.addEventListener('change', (e) => {
    state.tilemapEditor.selectedTerrainSetId = String(e.target.value || '') || null;
    state.tilemapEditor.selectedTerrainId    = null;
    renderTileMapTerrainPanel(activeNode);
    scheduleRender(RenderFlags.VIEWPORT);
  });

  tmTerrainPanelEl.querySelectorAll('.tm-terrain-type-btn[data-terrain-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tilemapEditor.selectedTerrainId = String(btn.dataset.terrainId || '') || null;
      state.tilemapEditor.selectedTerrain   = state.tilemapEditor.selectedTerrainId;
      // Clicking a terrain type while in erase mode switches back to paint
      if (state.tilemapEditor.tool === 'erase') {
        state.tilemapEditor.tool = 'paint';
        resetTileMapStrokeTracking();
        updateTileMapToolButtons();
      }
      renderTileMapTerrainPanel(activeNode);
      scheduleRender(RenderFlags.VIEWPORT);
    });
  });

  tmTerrainPanelEl.querySelector('#tm-terrain-open-tilesets')?.addEventListener('click', () => {
    activateRightDockTab('node-info');
    document.getElementById('nc-terrain-sets')?.setAttribute('open', 'open');
    document.getElementById('ts-terrain-panel')?.scrollIntoView?.({ block: 'nearest' });
  });
  tmTerrainPanelEl.querySelector('#tm-terrain-open-tilesets-inline')?.addEventListener('click', () => {
    activateRightDockTab('node-info');
    document.getElementById('nc-terrain-sets')?.setAttribute('open', 'open');
    document.getElementById('ts-terrain-panel')?.scrollIntoView?.({ block: 'nearest' });
  });
  tmTerrainPanelEl.querySelector('#tm-terrain-rebuild-layer')?.addEventListener('click', () => rebuildSelectedTerrainLayer());
  tmTerrainPanelEl.querySelector('#tm-terrain-debug-cell')?.addEventListener('click', () => debugSelectedTerrainCell(activeNode));

  const toggleDebugOverlay = () => {
    state.tilemapEditor.terrainDebug = state.tilemapEditor.terrainDebug !== true;
    if (state.tilemapEditor.terrainDebug === true) debugSelectedTerrainCell(activeNode);
    else { renderTileMapTerrainPanel(activeNode); scheduleRender(RenderFlags.VIEWPORT); }
  };
  tmTerrainPanelEl.querySelector('#tm-terrain-toggle-debug')?.addEventListener('click', toggleDebugOverlay);
  tmTerrainPanelEl.querySelector('#tm-terrain-debug-overlay')?.addEventListener('change', toggleDebugOverlay);
}

function refreshSelectedTileMapTilesetUI(node) {
  const activeNode = node || getSelectedTileMapNode();
  if (!activeNode) {
    renderTileMapPaletteGrid(tmPaletteGridEl, null);
    renderSavedBrushesSidebar(null, null);
    return;
  }
  const props = ensureTileMapData(activeNode);
  const activeLayer = getActiveTileMapLayer(activeNode);
  const assigned = getTileMapAssignedTileset(activeNode, activeLayer);
  if (tmTilesetSelectEl) tmTilesetSelectEl.value = activeLayer?.tilesetId || props?.tilesetId || '';
  if (assigned && !Number.isFinite(Number(state.tilemapEditor.selectedTileIndex))) {
    state.tilemapEditor.selectedTileIndex = Math.max(0, Number(assigned.selectedTileIndex) || 0);
  }
  if (assigned && state.tilemapEditor.selectedTileIndex < -1) {
    state.tilemapEditor.selectedTileIndex = Math.max(0, Number(assigned.selectedTileIndex) || 0);
  }
  renderTileMapPaletteGrid(tmPaletteGridEl, assigned, activeNode);
  renderSavedBrushesSidebar(assigned, activeNode);
  drawTileMapEditorCanvas(activeNode);
}

// ══════════════════════════════════════════════════════════════════════
// TILEMAP BRUSH PALETTE — compact grid, drag-to-group-select
// ══════════════════════════════════════════════════════════════════════

function buildBrushGroupFromRect(tileset, anchorIndex, indices) {
  if (!tileset || !indices || indices.length <= 1) return null;
  const sheet = getSheetById(tileset.spriteSheetId);
  if (!sheet?.image) return null;
  const ps = makeTilesetSheet(sheet, tileset);
  if (!ps) return null;
  const cols = ps.columns;
  const anchorCol = anchorIndex % cols;
  const anchorRow = Math.floor(anchorIndex / cols);
  return indices.map((idx) => ({
    tileIndex: idx,
    dcol: (idx % cols) - anchorCol,
    drow: Math.floor(idx / cols) - anchorRow
  }));
}

function getBrushGroupCells(anchorCol, anchorRow, node) {
  const group = state.tilemapEditor.brushGroup;
  const props = node ? ensureTileMapData(node) : null;
  if (!group || !group.length) {
    return [{ col: anchorCol, row: anchorRow, tileIndex: state.tilemapEditor.selectedTileIndex }];
  }
  return group
    .map((entry) => ({
      col: anchorCol + entry.dcol,
      row: anchorRow + entry.drow,
      tileIndex: entry.tileIndex
    }))
    .filter((c) => {
      if (!props) return true;
      return c.col >= 0 && c.row >= 0 && c.col < props.mapWidth && c.row < props.mapHeight;
    });
}

const _tmPaletteDrag = { active: false, anchorIndex: null, hoveredIndex: null, currentIndices: [] };
const _tmInlineEdit = { mode: null, idx: null, value: null }; // mode: 'save' | 'rename' | 'delete'

function getTmPaletteRectIndices(tileset, a, b) {
  const sheet = getSheetById(tileset.spriteSheetId);
  if (!sheet?.image) return [a];
  const ps = makeTilesetSheet(sheet, tileset);
  if (!ps) return [a];
  const cols = ps.columns;
  const minCol = Math.min(a % cols, b % cols);
  const maxCol = Math.max(a % cols, b % cols);
  const minRow = Math.min(Math.floor(a / cols), Math.floor(b / cols));
  const maxRow = Math.max(Math.floor(a / cols), Math.floor(b / cols));
  const result = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      result.push(r * cols + c);
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════
// SAVED BRUSHES RIGHT SIDEBAR — scrollable list to the right of tile map
// ══════════════════════════════════════════════════════════════════════

function renderSavedBrushesSidebar(tileset, activeNode) {
  const sidebar = document.getElementById('tm-saved-brushes-sidebar-list');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const savedGroups = Array.isArray(state.tilemapEditor.savedBrushGroups) ? state.tilemapEditor.savedBrushGroups : [];

  if (savedGroups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tm-sidebar-brush-empty';
    empty.textContent = 'No saved brushes.\nDrag-select tiles then Save.';
    sidebar.appendChild(empty);
    return;
  }

  savedGroups.forEach((sg, idx) => {
    ensureSavedBrushIdentity(sg, idx);
    const isActive = isSavedBrushActive(sg);

    const entry = document.createElement('div');
    entry.className = 'tm-sidebar-brush-entry' + (isActive ? ' tm-sidebar-brush-active' : '');
    entry.title = sg.name + ` (${sg.tiles.length} tiles) — click to activate`;

    // Preview canvas
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'tm-sidebar-brush-canvas-wrap';

    if (tileset) {
      const sheet = getSheetById(tileset.spriteSheetId);
      if (sheet?.image) {
        const ps = makeTilesetSheet(sheet, tileset);
        if (ps) {
          const tiles = sg.tiles || [];
          const minDcol = Math.min(...tiles.map((t) => t.dcol));
          const maxDcol = Math.max(...tiles.map((t) => t.dcol));
          const minDrow = Math.min(...tiles.map((t) => t.drow));
          const maxDrow = Math.max(...tiles.map((t) => t.drow));
          const gw = maxDcol - minDcol + 1;
          const gh = maxDrow - minDrow + 1;
          const cellSize = Math.min(18, Math.floor(54 / Math.max(gw, gh, 1)));
          const canvas = document.createElement('canvas');
          canvas.width = gw * cellSize;
          canvas.height = gh * cellSize;
          canvas.style.cssText = `image-rendering:pixelated;display:block`;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          tiles.forEach((t) => {
            const rect = getTileRect(ps, t.tileIndex);
            if (!rect) return;
            ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height,
              (t.dcol - minDcol) * cellSize, (t.drow - minDrow) * cellSize, cellSize, cellSize);
          });
          canvasWrap.appendChild(canvas);
        }
      }
    }

    if (!canvasWrap.firstChild) {
      const fallback = document.createElement('span');
      fallback.style.cssText = 'font-size:14px;color:var(--text-dim)';
      fallback.textContent = sg.name.slice(0, 2).toUpperCase();
      canvasWrap.appendChild(fallback);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'tm-sidebar-brush-name';
    nameEl.textContent = sg.name;

    entry.appendChild(canvasWrap);
    entry.appendChild(nameEl);

    entry.addEventListener('click', () => {
      if (isActive) {
        state.tilemapEditor.brushGroup = null;
        state.tilemapEditor.activeBrushGroupId = null;
      } else {
        const anchor = sg.tiles.find((t) => t.dcol === 0 && t.drow === 0) || sg.tiles[0];
        state.tilemapEditor.brushGroup = sg.tiles;
        state.tilemapEditor.activeBrushGroupId = sg.id;
        state.tilemapEditor.selectedTileIndex = anchor ? anchor.tileIndex : (sg.tiles[0]?.tileIndex ?? 0);
        state.tilemapEditor.tool = 'paint';
        resetTileMapStrokeTracking();
        updateTileMapToolButtons();
      }
      syncEditorStateFromRuntime();
      renderSavedBrushesSidebar(tileset, activeNode);
      const cont = document.getElementById('tm-palette-grid');
      if (cont) renderTileMapPaletteGrid(cont, tileset, activeNode);
      if (activeNode) drawTileMapEditorCanvas(activeNode);
    });

    sidebar.appendChild(entry);
  });
}

function renderTileMapPaletteGrid(container, tileset, activeNode) {
  if (!container) return;
  container.innerHTML = '';

  // ── Saved brush groups panel ─────────────────────────────────────
  const savedGroups = Array.isArray(state.tilemapEditor.savedBrushGroups) ? state.tilemapEditor.savedBrushGroups : [];
  const savedSection = document.createElement('div');
  savedSection.className = 'tm-saved-groups';

  const savedHeader = document.createElement('div');
  savedHeader.className = 'tm-saved-groups-header';
  savedHeader.textContent = 'Saved Brushes';
  savedSection.appendChild(savedHeader);

  if (savedGroups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tm-saved-groups-empty';
    empty.textContent = 'No saved brushes yet. Drag-select tiles below then save.';
    savedSection.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'tm-saved-groups-list';
    savedGroups.forEach((sg, idx) => {
      ensureSavedBrushIdentity(sg, idx);
      const isActive = isSavedBrushActive(sg);
      const isRenaming = _tmInlineEdit.mode === 'rename' && _tmInlineEdit.idx === idx;
      const isDeleting = _tmInlineEdit.mode === 'delete' && _tmInlineEdit.idx === idx;

      const row = document.createElement('div');
      row.className = 'tm-saved-group-row' + (isActive ? ' tm-saved-active' : '');

      // ── Inline delete confirm row ──────────────────────────────
      if (isDeleting) {
        const confirmWrap = document.createElement('div');
        confirmWrap.className = 'tm-inline-confirm';
        const msg = document.createElement('span');
        msg.className = 'tm-inline-confirm-msg';
        msg.textContent = `Delete "${sg.name}"?`;
        const yesBtn = document.createElement('button');
        yesBtn.className = 'tool-btn tm-inline-yes';
        yesBtn.textContent = 'Delete';
        yesBtn.addEventListener('click', () => {
          state.tilemapEditor.savedBrushGroups.splice(idx, 1);
          if (isActive) { state.tilemapEditor.brushGroup = null; state.tilemapEditor.activeBrushGroupId = null; }
          _tmInlineEdit.mode = null; _tmInlineEdit.idx = null;
          syncEditorStateFromRuntime();
          renderTileMapPaletteGrid(container, tileset, activeNode);
          renderSavedBrushesSidebar(tileset, activeNode);
          if (activeNode) scheduleRender(RenderFlags.VIEWPORT);
        });
        const noBtn = document.createElement('button');
        noBtn.className = 'tool-btn tm-inline-no';
        noBtn.textContent = 'Cancel';
        noBtn.addEventListener('click', () => {
          _tmInlineEdit.mode = null; _tmInlineEdit.idx = null;
          renderTileMapPaletteGrid(container, tileset, activeNode);
        });
        confirmWrap.appendChild(msg);
        confirmWrap.appendChild(yesBtn);
        confirmWrap.appendChild(noBtn);
        row.appendChild(confirmWrap);
        list.appendChild(row);
        return;
      }

      // ── Mini preview canvas ────────────────────────────────────
      const activateBtn = document.createElement('button');
      activateBtn.className = 'tm-saved-activate';
      activateBtn.title = `Activate: ${sg.name}`;
      if (tileset) {
        const sheet = getSheetById(tileset.spriteSheetId);
        if (sheet?.image) {
          const ps = makeTilesetSheet(sheet, tileset);
          if (ps) {
            const tiles = sg.tiles || [];
            const minDcol = Math.min(...tiles.map((t) => t.dcol));
            const maxDcol = Math.max(...tiles.map((t) => t.dcol));
            const minDrow = Math.min(...tiles.map((t) => t.drow));
            const maxDrow = Math.max(...tiles.map((t) => t.drow));
            const gw = maxDcol - minDcol + 1;
            const gh = maxDrow - minDrow + 1;
            const cellSize = Math.min(20, Math.floor(56 / Math.max(gw, gh, 1)));
            const canvas = document.createElement('canvas');
            canvas.width = gw * cellSize;
            canvas.height = gh * cellSize;
            canvas.style.cssText = `image-rendering:pixelated;display:block;width:${gw * cellSize}px;height:${gh * cellSize}px`;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            tiles.forEach((t) => {
              const rect = getTileRect(ps, t.tileIndex);
              if (!rect) return;
              ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, (t.dcol - minDcol) * cellSize, (t.drow - minDrow) * cellSize, cellSize, cellSize);
            });
            activateBtn.appendChild(canvas);
          }
        }
      }
      if (!activateBtn.firstChild) activateBtn.textContent = sg.name.slice(0, 2).toUpperCase();
      activateBtn.addEventListener('click', () => {
        if (_tmInlineEdit.mode === 'rename' && _tmInlineEdit.idx === idx) return;
        if (isActive) {
          state.tilemapEditor.brushGroup = null;
          state.tilemapEditor.activeBrushGroupId = null;
        } else {
          const anchor = sg.tiles.find((t) => t.dcol === 0 && t.drow === 0) || sg.tiles[0];
          state.tilemapEditor.brushGroup = sg.tiles;
          state.tilemapEditor.activeBrushGroupId = sg.id;
          state.tilemapEditor.selectedTileIndex = anchor ? anchor.tileIndex : (sg.tiles[0]?.tileIndex ?? 0);
          state.tilemapEditor.tool = 'paint';
          resetTileMapStrokeTracking();
          updateTileMapToolButtons();
        }
        syncEditorStateFromRuntime();
        renderTileMapPaletteGrid(container, tileset, activeNode);
        if (activeNode) drawTileMapEditorCanvas(activeNode);
      });

      // ── Name / inline rename ───────────────────────────────────
      const nameWrap = document.createElement('div');
      nameWrap.className = 'tm-saved-name-wrap';

      if (isRenaming) {
        const input = document.createElement('input');
        input.className = 'tm-saved-rename-input';
        input.type = 'text';
        input.value = _tmInlineEdit.value !== null ? _tmInlineEdit.value : sg.name;
        input.maxLength = 40;
        input.addEventListener('input', () => { _tmInlineEdit.value = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { commitRename(); }
          if (e.key === 'Escape') { _tmInlineEdit.mode = null; _tmInlineEdit.idx = null; renderTileMapPaletteGrid(container, tileset, activeNode); }
        });
        const commitRename = () => {
          const trimmed = String(input.value).trim();
          if (trimmed) state.tilemapEditor.savedBrushGroups[idx].name = trimmed;
          _tmInlineEdit.mode = null; _tmInlineEdit.idx = null; _tmInlineEdit.value = null;
          syncEditorStateFromRuntime();
          renderTileMapPaletteGrid(container, tileset, activeNode);
        };
        const okBtn = document.createElement('button');
        okBtn.className = 'tool-btn tm-inline-ok';
        okBtn.textContent = '✓';
        okBtn.title = 'Confirm rename';
        okBtn.addEventListener('click', commitRename);
        nameWrap.appendChild(input);
        nameWrap.appendChild(okBtn);
        // auto-focus after render
        requestAnimationFrame(() => { input.focus(); input.select(); });
      } else {
        const nameEl = document.createElement('span');
        nameEl.className = 'tm-saved-name';
        nameEl.textContent = sg.name;
        nameEl.title = sg.name;
        const badge = document.createElement('span');
        badge.className = 'tm-saved-badge';
        badge.textContent = `${sg.tiles.length}t`;
        nameWrap.appendChild(nameEl);
        nameWrap.appendChild(badge);
      }

      const renameBtn = document.createElement('button');
      renameBtn.className = 'tool-btn tm-saved-action';
      renameBtn.title = isRenaming ? 'Cancel rename' : 'Rename';
      renameBtn.textContent = isRenaming ? '✕' : '✎';
      renameBtn.addEventListener('click', () => {
        if (isRenaming) {
          _tmInlineEdit.mode = null; _tmInlineEdit.idx = null; _tmInlineEdit.value = null;
        } else {
          _tmInlineEdit.mode = 'rename'; _tmInlineEdit.idx = idx; _tmInlineEdit.value = sg.name;
        }
        renderTileMapPaletteGrid(container, tileset, activeNode);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tool-btn tm-saved-action tm-saved-delete';
      deleteBtn.title = 'Delete brush group';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', () => {
        _tmInlineEdit.mode = 'delete'; _tmInlineEdit.idx = idx;
        renderTileMapPaletteGrid(container, tileset, activeNode);
      });

      row.appendChild(activateBtn);
      row.appendChild(nameWrap);
      row.appendChild(renameBtn);
      row.appendChild(deleteBtn);
      list.appendChild(row);
    });
    savedSection.appendChild(list);
  }

  container.appendChild(savedSection);

  // ── Active group bar: inline save name input ─────────────────────
  const group = state.tilemapEditor.brushGroup;
  const groupBar = document.createElement('div');
  groupBar.className = 'tm-palette-group-bar';
  if (group && group.length > 1) {
    const isSaving = _tmInlineEdit.mode === 'save';

    if (isSaving) {
      // Expanded save row with text input
      const defaultName = `Brush ${(state.tilemapEditor.savedBrushGroups.length + 1)}`;
      const input = document.createElement('input');
      input.className = 'tm-saved-rename-input';
      input.type = 'text';
      input.placeholder = defaultName;
      input.value = _tmInlineEdit.value !== null ? _tmInlineEdit.value : defaultName;
      input.maxLength = 40;
      input.addEventListener('input', () => { _tmInlineEdit.value = input.value; });
      const commitSave = () => {
        const trimmed = String(input.value).trim() || defaultName;
        if (!Array.isArray(state.tilemapEditor.savedBrushGroups)) state.tilemapEditor.savedBrushGroups = [];
        state.tilemapEditor.savedBrushGroups.push({ id: `bg_${Date.now()}`, name: trimmed, tiles: group.slice() });
        _tmInlineEdit.mode = null; _tmInlineEdit.idx = null; _tmInlineEdit.value = null;
        syncEditorStateFromRuntime();
        renderTileMapPaletteGrid(container, tileset, activeNode);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commitSave();
        if (e.key === 'Escape') { _tmInlineEdit.mode = null; _tmInlineEdit.value = null; renderTileMapPaletteGrid(container, tileset, activeNode); }
      });
      const okBtn = document.createElement('button');
      okBtn.className = 'tool-btn tm-inline-ok';
      okBtn.textContent = '✓ Save';
      okBtn.addEventListener('click', commitSave);
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'tool-btn tm-palette-group-clear';
      cancelBtn.textContent = '✕';
      cancelBtn.addEventListener('click', () => { _tmInlineEdit.mode = null; _tmInlineEdit.value = null; renderTileMapPaletteGrid(container, tileset, activeNode); });
      groupBar.appendChild(input);
      groupBar.appendChild(okBtn);
      groupBar.appendChild(cancelBtn);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    } else {
      const span = document.createElement('span');
      span.className = 'tm-palette-group-label';
      span.textContent = `Active: ${group.length} tiles`;
      const saveBtn = document.createElement('button');
      saveBtn.className = 'tool-btn tm-palette-group-save';
      saveBtn.textContent = '💾 Save';
      saveBtn.title = 'Save this brush group';
      saveBtn.addEventListener('click', () => {
        _tmInlineEdit.mode = 'save'; _tmInlineEdit.value = `Brush ${(state.tilemapEditor.savedBrushGroups.length + 1)}`;
        renderTileMapPaletteGrid(container, tileset, activeNode);
      });
      const clearBtn = document.createElement('button');
      clearBtn.className = 'tool-btn tm-palette-group-clear';
      clearBtn.textContent = '✕';
      clearBtn.title = 'Clear active brush';
      clearBtn.addEventListener('click', () => {
        state.tilemapEditor.brushGroup = null;
        _tmPaletteDrag.currentIndices = [];
        _tmInlineEdit.mode = null;
        syncEditorStateFromRuntime();
        renderTileMapPaletteGrid(container, tileset, activeNode);
        if (activeNode) scheduleRender(RenderFlags.VIEWPORT);
      });
      groupBar.appendChild(span);
      groupBar.appendChild(saveBtn);
      groupBar.appendChild(clearBtn);
    }
  } else {
    groupBar.style.display = 'none';
  }
  container.appendChild(groupBar);

  // ── Sheet map hint ───────────────────────────────────────────────
  const hint = document.createElement('div');
  hint.className = 'tm-palette-hint';
  hint.textContent = 'Click = pick · Drag = group brush · Shift+drag on map = select · Erase:';
  // inline erase button in hint line
  const eraseBtn = document.createElement('button');
  eraseBtn.className = 'tm-palette-erase-inline' + (state.tilemapEditor.selectedTileIndex === -1 ? ' tm-selected' : '');
  eraseBtn.title = 'Erase tile';
  eraseBtn.textContent = '✕ Erase';
  eraseBtn.addEventListener('click', () => {
    state.tilemapEditor.selectedTileIndex = -1;
    state.tilemapEditor.brushGroup = null;
    state.tilemapEditor.activeBrushGroupId = null;
    state.tilemapEditor.tool = 'erase';
    _tmPaletteDrag.currentIndices = [];
    resetTileMapStrokeTracking();
    updateTileMapToolButtons();
    syncEditorStateFromRuntime();
    if (activeNode) drawTileMapEditorCanvas(activeNode);
  });
  hint.appendChild(eraseBtn);
  container.appendChild(hint);

  // ── Sheet-map tile grid ──────────────────────────────────────────
  if (!tileset) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty-notice';
    empty.textContent = 'Assign a tileset to this TileMap.';
    container.appendChild(empty);
    return;
  }

  const sheet = getSheetById(tileset.spriteSheetId);
  if (!sheet?.image) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty-notice';
    empty.textContent = 'Tileset sprite sheet is missing.';
    container.appendChild(empty);
    return;
  }

  const ps = makeTilesetSheet(sheet, tileset);
  if (!ps) return;
  const total = Math.max(1, ps.columns * ps.rows);

  const selectedIndex = state.tilemapEditor.selectedTileIndex;
  const groupIndices = new Set((group || []).map((e) => e.tileIndex));
  const dragIndices = new Set(_tmPaletteDrag.active ? _tmPaletteDrag.currentIndices : []);

  // Build sheet-map overlay (same approach as renderTilesetSheetPalette)
  const wrap = document.createElement('div');
  wrap.className = 'tm-sheet-map-wrap';
  const map = document.createElement('div');
  map.className = 'tm-sheet-map';
  map.style.width = `${ps.imageWidth}px`;
  map.style.height = `${ps.imageHeight}px`;

  const sheetImg = document.createElement('img');
  sheetImg.className = 'tm-sheet-map-image';
  sheetImg.src = sheet.image.src || '';
  sheetImg.alt = tileset.name || 'Tileset';
  sheetImg.draggable = false;
  map.appendChild(sheetImg);

  for (let index = 0; index < total; index++) {
    const rect = getTileRect(ps, index);
    if (!rect) continue;

    const isPrimary = index === selectedIndex;
    const inGroup = groupIndices.has(index);
    const inDrag = dragIndices.has(index);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-sheet-hotspot' +
      (isPrimary ? ' tm-selected' : '') +
      (inGroup && !isPrimary ? ' tm-in-group' : '') +
      (inDrag ? ' tm-dragging' : '');
    btn.title = `Tile #${index}`;
    btn.dataset.tileIndex = String(index);
    btn.style.left = `${rect.x}px`;
    btn.style.top = `${rect.y}px`;
    btn.style.width = `${rect.width}px`;
    btn.style.height = `${rect.height}px`;

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      _tmPaletteDrag.active = true;
      _tmPaletteDrag.anchorIndex = index;
      _tmPaletteDrag.hoveredIndex = index;
      _tmPaletteDrag.currentIndices = [index];
      // Do NOT use setPointerCapture — it prevents pointerenter on sibling tiles
      e.preventDefault();
    });

    btn.addEventListener('pointerup', (e) => {
      if (!_tmPaletteDrag.active) return;
      _tmPaletteDrag.active = false;
      const finalIndices = getTmPaletteRectIndices(tileset, _tmPaletteDrag.anchorIndex, _tmPaletteDrag.hoveredIndex ?? _tmPaletteDrag.anchorIndex);
      const anchorIdx = _tmPaletteDrag.anchorIndex;
      _tmPaletteDrag.currentIndices = finalIndices;
      state.tilemapEditor.selectedTileIndex = anchorIdx;
      if (tileset) tileset.selectedTileIndex = Math.max(0, anchorIdx);
      state.tilemapEditor.tool = 'paint';
      state.tilemapEditor.brushGroup = finalIndices.length > 1 ? buildBrushGroupFromRect(tileset, anchorIdx, finalIndices) : null;
      state.tilemapEditor.activeBrushGroupId = null;
      resetTileMapStrokeTracking();
      updateTileMapToolButtons();
      syncEditorStateFromRuntime();
      renderSavedBrushesSidebar(tileset, activeNode);
      renderTileMapPaletteGrid(container, tileset, activeNode);
      if (activeNode) drawTileMapEditorCanvas(activeNode);
    });

    btn.addEventListener('click', () => {
      if (_tmPaletteDrag.currentIndices.length > 1) return;
      state.tilemapEditor.selectedTileIndex = index;
      if (tileset) tileset.selectedTileIndex = Math.max(0, index);
      state.tilemapEditor.brushGroup = null;
      state.tilemapEditor.activeBrushGroupId = null;
      state.tilemapEditor.tool = 'paint';
      _tmPaletteDrag.currentIndices = [];
      resetTileMapStrokeTracking();
      updateTileMapToolButtons();
      syncEditorStateFromRuntime();
      renderSavedBrushesSidebar(tileset, activeNode);
      renderTileMapPaletteGrid(container, tileset, activeNode);
      if (activeNode) drawTileMapEditorCanvas(activeNode);
    });

    map.appendChild(btn);
  }

  wrap.appendChild(map);
  container.appendChild(wrap);

  // ── Map-level pointermove: tracks hovered tile by coordinate math ──
  // This replaces per-button pointerenter (which breaks when pointer capture
  // is active) with a single handler on the containing map div.
  map.addEventListener('pointermove', (e) => {
    if (!_tmPaletteDrag.active) return;
    const mapRect = map.getBoundingClientRect();
    const localX = e.clientX - mapRect.left;
    const localY = e.clientY - mapRect.top;
    // Find which tile index the pointer is over via coordinate math
    const col = Math.floor(localX / (ps.tileWidth  + (ps.padding || 0)));
    const row = Math.floor(localY / (ps.tileHeight + (ps.padding || 0)));
    const hoveredIdx = row * ps.columns + col;
    if (
      hoveredIdx >= 0 && hoveredIdx < total &&
      col >= 0 && col < ps.columns &&
      row >= 0 && row < ps.rows &&
      hoveredIdx !== _tmPaletteDrag.hoveredIndex
    ) {
      _tmPaletteDrag.hoveredIndex = hoveredIdx;
      _tmPaletteDrag.currentIndices = getTmPaletteRectIndices(tileset, _tmPaletteDrag.anchorIndex, hoveredIdx);
      renderTileMapPaletteGrid(container, tileset, activeNode);
    }
  });

  // Global pointerup guard — cancels drag if mouse released outside any tile button
  if (!window.__tmPaletteGlobalBound) {
    window.__tmPaletteGlobalBound = true;
    document.addEventListener('pointerup', () => {
      if (!_tmPaletteDrag.active) return;
      _tmPaletteDrag.active = false;
    });
  }
}

function updateSelectedTilesetTileMetadataFromInputs() {
  const ts = getSelectedTileset();
  if (!ts) return;
  const selectedTileIndices = getSelectedTilesetTerrainTileIndices(ts);
  const applyIndices = selectedTileIndices.length ? selectedTileIndices : [Math.max(0, Number(ts.selectedTileIndex) || 0)];
  applyTilesetMetadataToSelection(applyIndices, (meta) => {
    meta.collision = document.getElementById('ts-meta-collision')?.checked === true;
    const readMaybe = (id) => {
      const raw = document.getElementById(id)?.value;
      return raw === '' ? '' : Number(raw);
    };
    meta.atlasX = readMaybe('ts-meta-atlas-x');
    meta.atlasY = readMaybe('ts-meta-atlas-y');
    meta.atlasW = readMaybe('ts-meta-atlas-w');
    meta.atlasH = readMaybe('ts-meta-atlas-h');
    delete meta.terrainId;
    delete meta.terrainTypeId;
    delete meta.autotileMask;
    delete meta.edgeLabels;
    delete meta.cornerLabels;
    delete meta.probability;
    delete meta.allowFlipX;
    delete meta.allowFlipY;
    delete meta.allowRotate90;
    delete meta.allowRotate180;
    delete meta.allowRotate270;
  });
}

function updateTileMapToolButtons() {
  const tool = state.tilemapEditor.tool || 'paint';
  const mode = state.tilemapEditor.paintMode || 'tile';
  const terrainMode = mode === 'terrain';
  // Sync main toolbar tool buttons (shared across all modes)
  ['paint','rectangle','line','erase','fill','pick'].forEach((name) => {
    document.getElementById(`tm-tool-${name}`)?.classList.toggle('active', tool === name);
  });
  // Sync mode buttons
  ['tile','terrain','collision'].forEach((name) => {
    document.getElementById(`tm-mode-${name}`)?.classList.toggle('active', mode === name);
  });
  // In terrain mode: hide brush palette & saved brushes; show terrain panel
  document.getElementById('tm-palette-panel')?.classList.toggle('hidden-in-terrain-mode', terrainMode);
  document.getElementById('tm-saved-brushes-sidebar')?.classList.toggle('hidden-in-terrain-mode', terrainMode);
  // Pick tool label hint in terrain mode
  const pickBtn = document.getElementById('tm-tool-pick');
  if (pickBtn) pickBtn.title = terrainMode ? 'Pick terrain type from cell' : 'Pick tile';
  tmTerrainPanelEl?.classList.toggle('is-active', terrainMode);
}

function getTileMapBrushInfo(node, options = {}) {
  const mode = options.mode || state.tilemapEditor.paintMode || 'tile';
  const tool = options.tool || state.tilemapEditor.tool || 'paint';
  const tileset = node ? getTileMapAssignedTileset(node) : null;
  if (mode === 'tile') {
    let tileIndex = Number(state.tilemapEditor.selectedTileIndex);
    if (!Number.isFinite(tileIndex) || tileIndex < -1) tileIndex = Math.max(0, Number(tileset?.selectedTileIndex) || 0);
    if (tool === 'erase') tileIndex = -1;
    return { mode, tool, tileset, tileIndex, label: tileIndex >= 0 ? `Tile #${tileIndex}` : 'Erase' };
  }
  if (mode === 'terrain') {
    const terrainRef = tool === 'erase' ? null : getSelectedTileMapTerrainRef(node);
    const selectedSet = getSelectedTerrainSet(tileset);
    const selectedTerrain = getSelectedTerrainEntry(tileset, selectedSet);
    return { mode, tool, tileset, terrainTypeId: terrainRef, label: terrainRef ? `Terrain ${selectedTerrain?.name || terrainRef}` : 'Terrain erase' };
  }
  const collisionValue = tool === 'erase' ? 0 : 1;
  return { mode, tool, tileset, collisionValue, label: collisionValue ? 'Collision on' : 'Collision off' };
}

function resetTileMapStrokeTracking() {
  state.tilemapEditor.lastAppliedCellKey = '';
}

function clampTileMapCell(node, col, row) {
  const props = ensureTileMapData(node);
  return {
    col: Math.max(0, Math.min(props.mapWidth - 1, Number(col) || 0)),
    row: Math.max(0, Math.min(props.mapHeight - 1, Number(row) || 0))
  };
}

function getTileMapLineCells(startCol, startRow, endCol, endRow) {
  const cells = [];
  let x0 = Number(startCol) || 0;
  let y0 = Number(startRow) || 0;
  const x1 = Number(endCol) || 0;
  const y1 = Number(endRow) || 0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    cells.push({ col: x0, row: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return cells;
}

function getTileMapRectangleCells(startCol, startRow, endCol, endRow) {
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const cells = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) cells.push({ col, row });
  }
  return cells;
}

function getTileMapShapePreviewCells(node, tool, startCol, startRow, endCol, endRow) {
  if (!node || (tool !== 'rectangle' && tool !== 'line')) return [];
  const start = clampTileMapCell(node, startCol, startRow);
  const end = clampTileMapCell(node, endCol, endRow);
  const cells = tool === 'line'
    ? getTileMapLineCells(start.col, start.row, end.col, end.row)
    : getTileMapRectangleCells(start.col, start.row, end.col, end.row);
  const seen = new Set();
  return cells.filter((cell) => {
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTileMapPreviewCellMap(node) {
  const session = state.tilemapEditor.viewportPaint;
  if (!session?.active || session.nodeId !== node?.id || !Array.isArray(session.previewCells) || !session.previewCells.length) return null;
  const preview = new Map();
  session.previewCells.forEach((cell) => {
    preview.set(`${cell.col},${cell.row}`, cell);
  });
  return preview;
}

function drawTileBrushPreview(ctx, node, brush, col, row, options = {}) {
  if (!ctx || !node || !brush) return;
  const props = ensureTileMapData(node);
  if (col < 0 || row < 0 || col >= props.mapWidth || row >= props.mapHeight) return;
  const x = col * props.tileWidth;
  const y = row * props.tileHeight;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (brush.mode === 'tile') {
    if (brush.tileIndex >= 0 && brush.tileset) {
      const sheet = getSheetById(brush.tileset.spriteSheetId);
      const rect = getTilesetTileRect(brush.tileset, brush.tileIndex);
      if (sheet?.image && rect) {
        ctx.globalAlpha = options.alpha ?? 0.72;
        drawTransformedTileToCanvas(ctx, sheet.image, rect, x, y, props.tileWidth, props.tileHeight, options.transform || null, options.alpha ?? 0.72);
      }
    } else {
      ctx.fillStyle = 'rgba(224,106,106,0.22)';
      ctx.fillRect(x + 1, y + 1, Math.max(1, props.tileWidth - 2), Math.max(1, props.tileHeight - 2));
      ctx.strokeStyle = 'rgba(255,196,196,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + props.tileWidth - 4, y + props.tileHeight - 4);
      ctx.moveTo(x + props.tileWidth - 4, y + 4);
      ctx.lineTo(x + 4, y + props.tileHeight - 4);
      ctx.stroke();
    }
  } else if (brush.mode === 'terrain') {
    if (tool === 'erase') {
      // Erase: red X pattern
      ctx.fillStyle = 'rgba(224,106,106,0.22)';
      ctx.fillRect(x + 2, y + 2, Math.max(1, props.tileWidth - 4), Math.max(1, props.tileHeight - 4));
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + props.tileWidth - 5, y + props.tileHeight - 5);
      ctx.moveTo(x + props.tileWidth - 5, y + 5); ctx.lineTo(x + 5, y + props.tileHeight - 5);
      ctx.stroke();
    } else if (hasTerrainRef(brush.terrainTypeId)) {
      // Paint: use terrain type color with swatch fill
      const terrainColor = (typeof getTerrainColorForLabel === 'function')
        ? getTerrainColorForLabel(brush.tileset, brush.terrainTypeId)
        : '#7a6ff0';
      // Fill with terrain color at low opacity
      ctx.fillStyle = terrainColor + '44'; // ~27% opacity hex
      ctx.fillRect(x + 2, y + 2, Math.max(1, props.tileWidth - 4), Math.max(1, props.tileHeight - 4));
      // Draw small color dot in center
      const cx2 = x + props.tileWidth / 2;
      const cy2 = y + props.tileHeight / 2;
      const r2  = Math.min(props.tileWidth, props.tileHeight) / 5;
      ctx.fillStyle = terrainColor;
      ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(122,111,240,0.15)';
      ctx.fillRect(x + 2, y + 2, Math.max(1, props.tileWidth - 4), Math.max(1, props.tileHeight - 4));
    }
  } else if (brush.mode === 'collision') {
    ctx.strokeStyle = brush.collisionValue ? 'rgba(227,95,95,0.98)' : 'rgba(181,196,221,0.92)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(x + 2, y + 2, Math.max(1, props.tileWidth - 4), Math.max(1, props.tileHeight - 4));
    ctx.setLineDash([]);
    ctx.fillStyle = brush.collisionValue ? 'rgba(227,95,95,0.18)' : 'rgba(181,196,221,0.12)';
    ctx.fillRect(x + 2, y + 2, Math.max(1, props.tileWidth - 4), Math.max(1, props.tileHeight - 4));
  }
  ctx.strokeStyle = options.stroke || 'rgba(122,111,240,0.96)';
  ctx.lineWidth = options.lineWidth || 2;
  ctx.strokeRect(x + 1, y + 1, Math.max(1, props.tileWidth - 2), Math.max(1, props.tileHeight - 2));
  ctx.restore();
}


function shouldUseLegacyTerrainFillShim(node, options = {}) {
  return false;
}

function collectFloodCells(grid, startX, startY) {
  if (!Array.isArray(grid) || !Array.isArray(grid[startY])) return [];
  const width = grid[0]?.length || 0;
  const height = grid.length || 0;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return [];
  const target = grid[startY][startX];
  const q = [[startX, startY]];
  const seen = new Set();
  const cells = [];
  while (q.length) {
    const [x, y] = q.pop();
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= width || y >= height) continue;
    seen.add(key);
    if (grid[y][x] !== target) continue;
    cells.push({ col: x, row: y });
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return cells;
}

function getUniqueTileMapCells(cells) {
  const seen = new Set();
  const result = [];
  (Array.isArray(cells) ? cells : []).forEach((cell) => {
    const col = Number(cell?.col);
    const row = Number(cell?.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    const key = `${col},${row}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ col, row });
  });
  return result;
}

function buildTerrainSolveCells(node, cells) {
  const props = ensureTileMapData(node);
  const seen = new Set();
  const result = [];
  getUniqueTileMapCells(cells).forEach(({ col, row }) => {
    for (let y = row - 1; y <= row + 1; y += 1) {
      for (let x = col - 1; x <= col + 1; x += 1) {
        if (x < 0 || y < 0 || x >= props.mapWidth || y >= props.mapHeight) continue;
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ col: x, row: y });
      }
    }
  });
  return result;
}

function applyTerrainFillToCells(node, layer, cells, brush) {
  return terrainFill(node, layer, cells, brush, getTerrainFillSettings());
}

function paintFlood(grid, startX, startY, nextValue) {
  if (!Array.isArray(grid) || !Array.isArray(grid[startY])) return false;
  const target = Number.isFinite(Number(grid[startY][startX])) ? Number(grid[startY][startX]) : 0;
  if (target === nextValue) return false;
  const width = grid[0]?.length || 0, height = grid.length || 0;
  const q = [[startX, startY]];
  const seen = new Set();
  while (q.length) {
    const [x, y] = q.pop();
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= width || y >= height) continue;
    seen.add(key);
    const cur = Number.isFinite(Number(grid[y][x])) ? Number(grid[y][x]) : 0;
    if (cur !== target) continue;
    grid[y][x] = nextValue;
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return true;
}

function ensureTileMapCellData(layer, col, row) {
  if (!layer || !Array.isArray(layer.cellData)) layer.cellData = [];
  if (!Array.isArray(layer.cellData[row])) layer.cellData[row] = [];
  let cell = layer.cellData[row][col];
  if (!cell || typeof cell !== 'object') {
    cell = {
      terrainSetId: null,
      terrainTypeId: normalizeTerrainRef(layer.terrain?.[row]?.[col], null),
      tileIndex: Number.isFinite(Number(layer.tiles?.[row]?.[col])) ? Number(layer.tiles[row][col]) : -1,
      transform: normalizeTileMapCellTransform(null)
    };
    layer.cellData[row][col] = cell;
  }
  cell.terrainSetId = normalizeTerrainRef(cell.terrainSetId, null);
  cell.terrainTypeId = normalizeTerrainRef(cell.terrainTypeId, normalizeTerrainRef(layer.terrain?.[row]?.[col], null));
  cell.tileIndex = Number.isFinite(Number(cell.tileIndex)) ? Number(cell.tileIndex) : (Number.isFinite(Number(layer.tiles?.[row]?.[col])) ? Number(layer.tiles[row][col]) : -1);
  cell.transform = normalizeTileMapCellTransform(cell.transform);
  return cell;
}

function setTileMapCellTransform(layer, col, row, transform) {
  const cell = ensureTileMapCellData(layer, col, row);
  const next = normalizeTileMapCellTransform(transform);
  const prevKey = tileMapCellTransformKey(cell.transform);
  const nextKey = tileMapCellTransformKey(next);
  if (prevKey === nextKey) return false;
  cell.transform = next;
  return true;
}

function clearTileMapCellTransform(layer, col, row) {
  return setTileMapCellTransform(layer, col, row, null);
}

function getTileMapCellTerrainId(layer, col, row) {
  const cell = ensureTileMapCellData(layer, col, row);
  return normalizeTerrainRef(cell?.terrainTypeId, null);
}

function setTileMapCellTerrainId(layer, col, row, terrainTypeId, terrainSetId = null) {
  const cell = ensureTileMapCellData(layer, col, row);
  const nextValue = normalizeTerrainRef(terrainTypeId, null);
  const prevValue = normalizeTerrainRef(cell.terrainTypeId, null);
  const prevGrid = normalizeTerrainRef(layer.terrain?.[row]?.[col], null);
  const selectedNode = typeof getSelectedTileMapNode === 'function' ? getSelectedTileMapNode() : null;
  const tileset = selectedNode ? getTileMapAssignedTileset(selectedNode) : getSelectedTileset();
  const selectedSet = terrainSetId ? (getTerrainSetsForTileset(tileset).find((set) => set && String(set.id) === String(terrainSetId)) || null) : null;
  const terrainSet = selectedSet || getTerrainSetForTerrainRef(tileset, nextValue) || getSelectedTerrainSet(tileset);
  const nextSetId = nextValue ? (terrainSet?.id || null) : null;
  const same = terrainRefEquals(prevValue, nextValue) && terrainRefEquals(prevGrid, nextValue) && terrainRefEquals(cell.terrainSetId, nextSetId);
  cell.terrainTypeId = nextValue;
  cell.terrainSetId = nextSetId;
  if (Array.isArray(layer.terrain?.[row])) layer.terrain[row][col] = nextValue;
  return !same;
}

function clearTileMapTerrainCell(layer, col, row) {
  const cell = ensureTileMapCellData(layer, col, row);
  const before = JSON.stringify({ terrainSetId: cell.terrainSetId, terrainTypeId: cell.terrainTypeId, tileIndex: cell.tileIndex, transform: cell.transform, diagnostics: cell.terrainDiagnostics, tile: layer.tiles?.[row]?.[col], terrain: layer.terrain?.[row]?.[col] });
  cell.terrainSetId = null;
  cell.terrainTypeId = null;
  cell.tileIndex = -1;
  cell.transform = normalizeTileMapCellTransform(null);
  cell.terrainDiagnostics = null;
  if (Array.isArray(layer.terrain?.[row])) layer.terrain[row][col] = null;
  if (Array.isArray(layer.tiles?.[row])) layer.tiles[row][col] = -1;
  const after = JSON.stringify({ terrainSetId: cell.terrainSetId, terrainTypeId: cell.terrainTypeId, tileIndex: cell.tileIndex, transform: cell.transform, diagnostics: cell.terrainDiagnostics, tile: layer.tiles?.[row]?.[col], terrain: layer.terrain?.[row]?.[col] });
  return before !== after;
}

function getTerrainSetForTerrainRef(tileset, terrainRef) {
  const host = ensureTilesetShape(tileset || getSelectedTileset());
  const ref = normalizeTerrainRef(terrainRef, null);
  if (!host || !hasTerrainRef(ref)) return null;
  const sets = Array.isArray(host.terrainSets) ? host.terrainSets : [];
  for (let i = 0; i < sets.length; i += 1) {
    const set = sets[i];
    const terrains = Array.isArray(set?.terrainTypes) ? set.terrainTypes : [];
    if (terrains.some((entry) => entry && String(entry.id) === String(ref))) return set;
  }
  return null;
}

function getTerrainByRef(tileset, terrainSet, terrainRef) {
  const ref = normalizeTerrainRef(terrainRef, null);
  const owningSet = getTerrainSetForTerrainRef(tileset, ref);
  if (owningSet) {
    return (owningSet.terrainTypes || []).find((entry) => entry && String(entry.id) === String(ref)) || null;
  }
  return (terrainSet?.terrainTypes || []).find((entry) => entry && String(entry.id) === String(ref)) || null;
}


function getTerrainSolverProbabilityBreakdown(node, terrainTypeId, tileIndex) {
  const tileset = getTileMapAssignedTileset(node);
  const terrainSet = getTerrainSetForTerrainRef(tileset, terrainTypeId) || getSelectedTerrainSet(tileset);
  const tileMeta = tileset && Number.isFinite(Number(tileIndex)) && Number(tileIndex) >= 0 ? ensureTilesetTileMetadata(tileset, Number(tileIndex)) : null;
  const tileProbability = Math.max(0, Number(tileMeta?.probability == null ? 1 : tileMeta.probability) || 0);
  const terrainEntry = getTerrainByRef(tileset, terrainSet, terrainTypeId);
  const terrainProbability = Math.max(0, Number(terrainEntry?.probability == null ? 1 : terrainEntry?.probability) || 0);
  return {
    tileProbability,
    terrainProbability,
    combinedWeight: tileProbability * terrainProbability,
  };
}

function getTileMapTerrainPlaceholderTileIndex(node, layer, col, row, terrainTypeId) {
  const terrainRef = normalizeTerrainRef(terrainTypeId, null);
  if (!terrainRef) return -1;
  const assigned = getTileMapAssignedTileset(node);
  const selectedTerrainSet = getTerrainSetForTerrainRef(assigned, terrainRef) || getSelectedTerrainSet(assigned);
  const selectedTerrain = getTerrainByRef(assigned, selectedTerrainSet, terrainRef) || getSelectedTerrainEntry(assigned, selectedTerrainSet);
  const selectedTileIndex = Number(state.tilemapEditor.selectedTileIndex);
  if (Number.isFinite(selectedTileIndex) && selectedTileIndex >= 0) return selectedTileIndex;
  const terrainIcon = Number(selectedTerrain?.iconTile);
  if (Number.isFinite(terrainIcon) && terrainIcon >= 0) return terrainIcon;
  const setIcon = Number(selectedTerrainSet?.iconTile);
  if (Number.isFinite(setIcon) && setIcon >= 0) return setIcon;
  const existingTile = Number(layer?.tiles?.[row]?.[col]);
  if (Number.isFinite(existingTile) && existingTile >= 0) return existingTile;
  return 0;
}


function tileFill(layer, startX, startY, nextValue) {
  return paintFlood(layer?.tiles, startX, startY, nextValue);
}

function collectTerrainNeighborCells(cells, radius = 1) {
  const next = [];
  const seen = new Set();
  (Array.isArray(cells) ? cells : []).forEach(({ col, row }) => {
    for (let y = Number(row) - radius; y <= Number(row) + radius; y += 1) {
      for (let x = Number(col) - radius; x <= Number(col) + radius; x += 1) {
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ col: x, row: y });
      }
    }
  });
  return next;
}

function collectTerrainFloodCells(layer, startX, startY) {
  if (!layer || !Array.isArray(layer.cellData) || !Array.isArray(layer.cellData[startY])) return [];
  const width = layer.cellData[0]?.length || 0;
  const height = layer.cellData.length || 0;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return [];
  const target = getTileMapCellTerrainId(layer, startX, startY);
  const q = [[startX, startY]];
  const seen = new Set();
  const cells = [];
  while (q.length) {
    const [x, y] = q.pop();
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= width || y >= height) continue;
    seen.add(key);
    if (!terrainRefEquals(getTileMapCellTerrainId(layer, x, y), target)) continue;
    cells.push({ col: x, row: y });
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return cells;
}

function terrainFill(node, layer, cells, brush, options = {}) {
  if (!node || !layer || !brush) return false;
  const settings = Object.assign({}, getTerrainFillSettings(), options || {});
  const regionCells = getUniqueTileMapCells(cells);
  if (!regionCells.length) return false;
  let changed = false;
  regionCells.forEach(({ col, row }) => {
    if (brush.erase) {
      if (clearTileMapTerrainCell(layer, col, row)) changed = true;
    } else if (setTileMapCellTerrainId(layer, col, row, brush.terrainTypeId, brush.terrainSetId)) changed = true;
  });
  const dirtyCells = buildTerrainSolveCells(node, regionCells);
  dirtyCells.forEach(({ col, row }) => {
    if (applyTerrainSolverAt(node, layer, col, row, { randomize: settings.randomizeInterior, respectProbability: settings.respectProbability, cause: brush.erase ? 'terrain-erase' : 'terrain-paint' })) changed = true;
  });
  return changed;
}

function applyTerrainIdFlood(layer, startX, startY, nextValue) {
  if (!layer || !Array.isArray(layer.cellData) || !Array.isArray(layer.cellData[startY])) return false;
  const target = getTileMapCellTerrainId(layer, startX, startY);
  const nextRef = normalizeTerrainRef(nextValue, null);
  if (terrainRefEquals(target, nextRef)) return false;
  const width = layer.cellData[0]?.length || 0, height = layer.cellData.length || 0;
  const q = [[startX, startY]];
  const seen = new Set();
  let changed = false;
  while (q.length) {
    const [x, y] = q.pop();
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= width || y >= height) continue;
    seen.add(key);
    const cur = getTileMapCellTerrainId(layer, x, y);
    if (!terrainRefEquals(cur, target)) continue;
    if (setTileMapCellTerrainId(layer, x, y, nextRef)) changed = true;
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return changed;
}

function buildTileMapTerrainNeighborhood(layer, x, y) {
  const solver = window.RokuTerrainSolver;
  if (solver?.buildTerrainNeighborSignature) return solver.buildTerrainNeighborSignature(layer, x, y);
  return {
    terrainTypeId: getTileMapCellTerrainId(layer, x, y),
    center: getTileMapCellTerrainId(layer, x, y),
    top: getTileMapCellTerrainId(layer, x, y - 1),
    right: getTileMapCellTerrainId(layer, x + 1, y),
    bottom: getTileMapCellTerrainId(layer, x, y + 1),
    left: getTileMapCellTerrainId(layer, x - 1, y),
    topLeft: getTileMapCellTerrainId(layer, x - 1, y - 1),
    topRight: getTileMapCellTerrainId(layer, x + 1, y - 1),
    bottomRight: getTileMapCellTerrainId(layer, x + 1, y + 1),
    bottomLeft: getTileMapCellTerrainId(layer, x - 1, y + 1),
  };
}

function resolveTileMapTerrainTileIndex(node, layer, x, y, options = {}) {
  const terrainRef = getTileMapCellTerrainId(layer, x, y);
  if (!hasTerrainRef(terrainRef)) return { tileIndex: -1, transform: normalizeTileMapCellTransform(null), score: null, matchedEdges: null, matchedCorners: null, fallbackUsed: false, candidateCount: 0, diagnostics: null };
  const tileset = getTileMapAssignedTileset(node);
  const terrainSet = getTerrainSetForTerrainRef(tileset, terrainRef) || getSelectedTerrainSet(tileset);
  const solver = window.RokuTerrainSolver;
  const signature = buildTileMapTerrainNeighborhood(layer, x, y);
  if (!tileset || !terrainSet || !solver?.resolveTerrainRuleTile) {
    const fallbackTileIndex = getTileMapTerrainPlaceholderTileIndex(node, layer, x, y, terrainRef);
    return {
      tileIndex: fallbackTileIndex,
      transform: normalizeTileMapCellTransform(null),
      score: null,
      matchedEdges: null,
      matchedCorners: null,
      fallbackUsed: true,
      candidateCount: 0,
      diagnostics: {
        terrainTypeId: terrainRef,
        neighborSignature: signature,
        matchedRuleId: null,
        tileIndex: fallbackTileIndex,
        fallbackReason: 'Terrain rule solver unavailable; placeholder tile used',
        candidateCount: 0,
        fallbackUsed: true,
        score: null,
        transform: normalizeTileMapCellTransform(null)
      }
    };
  }
  // v35.2: resolveTerrainRuleTile is the canonical solver entry point.
  // resolveTerrainTile is a backwards-compat shim; new code never calls it directly.
  const result = solver.resolveTerrainRuleTile(terrainSet, signature, { randomize: options.randomize === true });
  const picked = Number(result?.tileIndex);
  const tileIndex = Number.isFinite(picked) && picked >= 0 ? picked : getTileMapTerrainPlaceholderTileIndex(node, layer, x, y, terrainRef);
  return {
    tileIndex,
    transform: normalizeTileMapCellTransform(result?.transform),
    score: result?.score || null,
    matchedEdges: result?.matchedEdges || null,
    matchedCorners: result?.matchedCorners || null,
    fallbackUsed: result?.fallbackUsed === true || !(Number.isFinite(picked) && picked >= 0),
    candidateCount: Number(result?.candidateCount) || 0,
    diagnostics: {
      terrainTypeId: terrainRef,
      neighborSignature: result?.neighborSignature || result?.desired?.neighbors || signature,
      matchedRuleId: result?.matchedRuleId || result?.ruleId || null,
      tileIndex,
      fallbackReason: result?.fallbackReason || '',
      candidateCount: Number(result?.candidateCount) || 0,
      fallbackUsed: result?.fallbackUsed === true || !(Number.isFinite(picked) && picked >= 0),
      score: result?.score || null,
      matchedEdges: result?.matchedEdges || null,
      matchedCorners: result?.matchedCorners || null,
      transform: normalizeTileMapCellTransform(result?.transform)
    }
  };
}

function applyTerrainSolverAt(node, layer, x, y, options = {}) {
  if (!node || !layer) return false;
  if (y < 0 || x < 0 || y >= (layer.tiles?.length || 0) || x >= (layer.tiles?.[0]?.length || 0)) return false;
  const terrainRef = getTileMapCellTerrainId(layer, x, y);
  const resolved = hasTerrainRef(terrainRef) ? resolveTileMapTerrainTileIndex(node, layer, x, y, options) : { tileIndex: -1, transform: normalizeTileMapCellTransform(null), diagnostics: null };
  const nextTile = Number.isFinite(Number(resolved?.tileIndex)) ? Number(resolved.tileIndex) : -1;
  const prevTile = Number.isFinite(Number(layer.tiles?.[y]?.[x])) ? Number(layer.tiles[y][x]) : -1;
  const tileChanged = prevTile !== nextTile;
  if (tileChanged) layer.tiles[y][x] = nextTile;
  const transformChanged = hasTerrainRef(terrainRef) ? setTileMapCellTransform(layer, x, y, resolved.transform) : clearTileMapCellTransform(layer, x, y);
  const cell = layer.cellData?.[y]?.[x];
  if (cell && typeof cell === 'object') {
    cell.tileIndex = nextTile;
    const activeSet = hasTerrainRef(terrainRef) ? (getTerrainSetForTerrainRef(getTileMapAssignedTileset(node), terrainRef) || getSelectedTerrainSet(getTileMapAssignedTileset(node))) : null;
    cell.terrainSetId = activeSet?.id || null;
  }
  let diagnosticsChanged = false;
  if (cell && typeof cell === 'object') {
    const nextDiagnostics = hasTerrainRef(terrainRef) ? Object.assign({}, resolved?.diagnostics || {}, { terrainTypeId: terrainRef, tileIndex: nextTile }) : null;
    const prevJson = JSON.stringify(cell.terrainDiagnostics || null);
    const nextJson = JSON.stringify(nextDiagnostics || null);
    if (prevJson !== nextJson) {
      cell.terrainDiagnostics = nextDiagnostics;
      diagnosticsChanged = true;
    }
  }
  if (state.tilemapEditor?.terrainDebug === true && hasTerrainRef(terrainRef)) updateTerrainDebugInfo(node, layer, x, y, resolved?.diagnostics || null);
  return tileChanged || transformChanged || diagnosticsChanged;
}

function applyTerrainSolverNeighborhood(node, layer, x, y, radius = 1) {
  if (!node || !layer) return false;
  let changed = false;
  for (let cy = y - radius; cy <= y + radius; cy++) {
    for (let cx = x - radius; cx <= x + radius; cx++) {
      if (applyTerrainSolverAt(node, layer, cx, cy)) changed = true;
    }
  }
  return changed;
}

function paintTileMapAt(node, col, row) {
  const props = ensureTileMapData(node); if (!props) return false;
  const layer = getActiveTileMapLayer(node); if (!layer) return false;
  if (col < 0 || row < 0 || col >= props.mapWidth || row >= props.mapHeight) return false;
  const tool = state.tilemapEditor.tool;
  const mode = state.tilemapEditor.paintMode;
  const tileset = getTileMapAssignedTileset(node);
  if (tool === 'pick') {
    if (mode === 'tile') {
      state.tilemapEditor.selectedTileIndex = Number.isFinite(Number(layer.tiles[row]?.[col])) ? Number(layer.tiles[row][col]) : -1;
      if (tileset) tileset.selectedTileIndex = state.tilemapEditor.selectedTileIndex;
      // Clear group on pick so user gets a fresh single-tile selection
      state.tilemapEditor.brushGroup = null;
      if (hasTerrainRef(getTileMapCellTerrainId(layer, col, row))) updateTerrainDebugInfo(node, layer, col, row, layer.cellData?.[row]?.[col]?.terrainDiagnostics || null);
    }
    if (mode === 'terrain') {
      const pickedTerrain = getTileMapCellTerrainId(layer, col, row);
      state.tilemapEditor.selectedTerrainId = pickedTerrain;
      state.tilemapEditor.selectedTerrain = pickedTerrain || state.tilemapEditor.selectedTerrain;
      updateTerrainDebugInfo(node, layer, col, row, layer.cellData?.[row]?.[col]?.terrainDiagnostics || null);
    }
    if (mode === 'collision') state.tilemapEditor.collisionValue = Number(layer.collision[row]?.[col]) ? 1 : 0;
    state.tilemapEditor.lastPick = { nodeId: node.id, col, row, mode };
    updateTileMapPanelSummary(node);
    refreshSelectedTileMapTilesetUI(node);
    drawTileMapEditorCanvas(node);
    return false;
  }
  let changed = false;
  if (mode === 'tile') {
    const terrainFillBrush = null;
    // ── Group brush: paint all tiles in the group offset from anchor ──
    const brushGroup = state.tilemapEditor.brushGroup;
    if (brushGroup && brushGroup.length > 1 && tool !== 'fill' && tool !== 'erase') {
      const cells = getBrushGroupCells(col, row, node);
      cells.forEach((cell) => {
        const c = cell.col; const r = cell.row;
        if (c < 0 || r < 0 || c >= props.mapWidth || r >= props.mapHeight) return;
        const nextValue = Number(cell.tileIndex);
        if (!Number.isFinite(nextValue) || nextValue < 0) return;
        if (Number(layer.tiles[r][c]) !== nextValue) { layer.tiles[r][c] = nextValue; changed = true; clearTileMapCellTransform(layer, c, r); }
        if (changed && tileset) {
          const meta = ensureTilesetTileMetadata(tileset, nextValue);
          if (Number(meta.terrainTypeId) > 0) setTileMapCellTerrainId(layer, c, r, Number(meta.terrainTypeId));
          if (meta.collision) layer.collision[r][c] = 1;
        }
      });
    } else {
      let nextValue = Number(state.tilemapEditor.selectedTileIndex);
      if (!Number.isFinite(nextValue) || nextValue < -1) nextValue = Math.max(0, Number(tileset?.selectedTileIndex) || 0);
      if (tool === 'erase') nextValue = -1;
      if (terrainFillBrush && tool === 'fill') {
        const cells = collectFloodCells(layer.tiles, col, row);
        changed = applyTerrainFillToCells(node, layer, cells, terrainFillBrush);
      } else if (tool === 'fill') changed = paintFlood(layer.tiles, col, row, Number(nextValue));
      else if (Number(layer.tiles[row][col]) !== Number(nextValue)) { layer.tiles[row][col] = Number(nextValue); changed = true; clearTileMapCellTransform(layer, col, row); }
      if (changed) {
        if (nextValue < 0) clearTileMapCellTransform(layer, col, row);
        if (tileset && nextValue >= 0) {
          state.tilemapEditor.selectedTileIndex = nextValue;
          tileset.selectedTileIndex = nextValue;
          const meta = ensureTilesetTileMetadata(tileset, nextValue);
          if (Number(meta.terrainTypeId) > 0) setTileMapCellTerrainId(layer, col, row, Number(meta.terrainTypeId));
          if (meta.collision) layer.collision[row][col] = 1;
        }
      }
    }
  } else if (mode === 'terrain') {
    const selectedSet = getSelectedTerrainSet(tileset);
    const nextValue   = tool === 'erase' ? null : getSelectedTileMapTerrainRef(node);
    if (tool === 'fill') {
      // Flood-fill matching terrain type region, then solve the full dirty set
      const floodCells = collectTerrainFloodCells(layer, col, row);
      changed = terrainFill(node, layer, floodCells, {
        terrainTypeId: nextValue, terrainSetId: selectedSet?.id || null,
        tileIndex: -1, erase: false,
      }, Object.assign({}, getTerrainFillSettings(), { randomizeInterior: true }));
    } else if (tool === 'erase') {
      // Erase: clear this cell fully, then re-solve the 8 neighbors
      const cleared = clearTileMapTerrainCell(layer, col, row);
      const solvedChanged = applyTerrainSolverNeighborhood(node, layer, col, row, 1);
      changed = cleared || solvedChanged;
    } else {
      // Paint: store terrain type, then queue a RAF-batched neighborhood solve
      // so border tiles update without blocking during drag.
      const terrainChanged = setTileMapCellTerrainId(layer, col, row, nextValue, selectedSet?.id || null);
      // Immediately solve the center cell so the tile resolves on first stroke
      const solvedChanged  = applyTerrainSolverAt(node, layer, col, row);
      // Queue neighbors for RAF-batched solve (deduped across rapid moves)
      markTerrainNeighborhoodDirty(node, layer, col, row, 1);
      scheduleTerrainDirtyFlush();
      changed = terrainChanged || solvedChanged;
    }
    if (state.tilemapEditor?.terrainDebug === true) {
      updateTerrainDebugInfo(node, layer, col, row, layer.cellData?.[row]?.[col]?.terrainDiagnostics || null);
    }
  } else if (mode === 'collision') {
    let nextValue = tool === 'erase' ? 0 : 1;
    if (tool === 'fill') changed = paintFlood(layer.collision, col, row, Number(nextValue));
    else if (Number(layer.collision[row][col]) !== Number(nextValue)) { layer.collision[row][col] = Number(nextValue); changed = true; }
  }
  if (changed) {
    syncPrimaryTileLayerAliases(props);
    state.tilemapEditor.lastPick = null;
    state.tilemapEditor.lastPaint = { col, row, tool, mode, layerId: layer.id, value: mode === 'tile' ? Number(layer.tiles[row][col]) : mode === 'terrain' ? getTileMapCellTerrainId(layer, col, row) : Number(layer.collision[row][col]) };
    state.tilemapEditor.lastAppliedCellKey = `${node.id}:${layer.id}:${mode}:${tool}:${col},${row}`;
  }
  return changed;
};


function getSelectedTilesetTerrainTileIndices(tileset = null) {
  const host = ensureTilesetShape(tileset || getSelectedTileset());
  if (!host) return [];
  const total = (() => {
    const sheet = getSheetById(host.spriteSheetId);
    if (!sheet?.image) return 0;
    const pseudoSheet = makeTilesetSheet(sheet, host);
    return Math.max(1, pseudoSheet.columns * pseudoSheet.rows);
  })();
  const raw = Array.isArray(state.tilesetTerrainEditor?.selectedTileIndices) ? state.tilesetTerrainEditor.selectedTileIndices : [];
  const normalized = Array.from(new Set(raw.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0 && (!total || value < total)))).sort((a, b) => a - b);
  if (!normalized.length) {
    const fallback = Math.max(0, Number(host.selectedTileIndex) || 0);
    normalized.push(fallback);
  }
  state.tilesetTerrainEditor.selectedTileIndices = normalized;
  return normalized;
}

function setSelectedTilesetTerrainTileIndices(indices, primaryIndex = null) {
  const tileset = getSelectedTileset();
  if (!tileset) return [];
  const next = Array.from(new Set((Array.isArray(indices) ? indices : [indices]).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0))).sort((a, b) => a - b);
  if (!next.length) next.push(Math.max(0, Number(primaryIndex) || Number(tileset.selectedTileIndex) || 0));
  const primary = Number.isFinite(Number(primaryIndex)) ? Number(primaryIndex) : next[next.length - 1];
  tileset.selectedTileIndex = Math.max(0, primary);
  state.tilesetTerrainEditor.selectedTileIndices = next;
  state.tilesetTerrainEditor.lastAnchorIndex = Math.max(0, primary);
  return next;
}


function getTilesetPaletteSelectionRect(anchorIndex, targetIndex, tileset) {
  const host = ensureTilesetShape(tileset || getSelectedTileset());
  if (!host) return [];
  const sheet = getSheetById(host.spriteSheetId);
  const pseudoSheet = sheet ? makeTilesetSheet(sheet, host) : null;
  const columns = Math.max(1, Number(pseudoSheet?.columns) || 1);
  const a = Math.max(0, Number(anchorIndex) || 0);
  const b = Math.max(0, Number(targetIndex) || 0);
  const aCol = a % columns;
  const aRow = Math.floor(a / columns);
  const bCol = b % columns;
  const bRow = Math.floor(b / columns);
  const minCol = Math.min(aCol, bCol);
  const maxCol = Math.max(aCol, bCol);
  const minRow = Math.min(aRow, bRow);
  const maxRow = Math.max(aRow, bRow);
  const next = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      next.push((row * columns) + col);
    }
  }
  return next;
}

function updateTilesetPaletteDragSelection(targetIndex) {
  const tileset = getSelectedTileset();
  const drag = state.tilesetTerrainEditor?.dragSelect;
  if (!tileset || !drag?.active) return [];
  const rectSelection = getTilesetPaletteSelectionRect(drag.anchorIndex, targetIndex, tileset);
  const next = drag.append
    ? Array.from(new Set([...(Array.isArray(drag.baseSelection) ? drag.baseSelection : []), ...rectSelection])).sort((a, b) => a - b)
    : rectSelection;
  drag.moved = drag.moved || Number(targetIndex) !== Number(drag.anchorIndex);
  drag.suppressClick = drag.moved;
  return setSelectedTilesetTerrainTileIndices(next, targetIndex);
}

function endTilesetPaletteDragSelection() {
  const drag = state.tilesetTerrainEditor?.dragSelect;
  if (!drag) return;
  const wasMoved = drag.moved === true;
  drag.active = false;
  drag.anchorIndex = null;
  drag.append = false;
  drag.baseSelection = [];
  // If the pointer never moved (simple click), clear suppressClick immediately
  // so the subsequent click event is not swallowed.
  if (!wasMoved) {
    drag.suppressClick = false;
    drag.moved = false;
  } else {
    // Moved = real drag; defer so the click that follows pointerup is blocked
    drag.moved = false;
    window.setTimeout(() => {
      if (state.tilesetTerrainEditor?.dragSelect) {
        state.tilesetTerrainEditor.dragSelect.suppressClick = false;
      }
    }, 0);
  }
}

function updateSelectedTilesetTerrainTiles(index, event = null) {
  const tileset = getSelectedTileset();
  if (!tileset) return [];
  const targetIndex = Math.max(0, Number(index) || 0);
  const current = getSelectedTilesetTerrainTileIndices(tileset);
  const anchor = Number.isFinite(Number(state.tilesetTerrainEditor?.lastAnchorIndex)) ? Number(state.tilesetTerrainEditor.lastAnchorIndex) : Math.max(0, Number(tileset.selectedTileIndex) || targetIndex);
  let next = [];
  if (event?.shiftKey) {
    const min = Math.min(anchor, targetIndex);
    const max = Math.max(anchor, targetIndex);
    next = [];
    for (let i = min; i <= max; i++) next.push(i);
  } else if (event?.ctrlKey || event?.metaKey) {
    const set = new Set(current);
    if (set.has(targetIndex)) set.delete(targetIndex);
    else set.add(targetIndex);
    next = Array.from(set).sort((a, b) => a - b);
    if (!next.length) next = [targetIndex];
  } else {
    next = [targetIndex];
  }
  return setSelectedTilesetTerrainTileIndices(next, targetIndex);
}

// Legacy per-tile edge/corner label editing removed in v35.6.

function getTilesetTerrainSets(tileset = null) {
  const host = tileset || getSelectedTileset();
  if (!host) return [];
  if (!Array.isArray(host.terrainSets)) host.terrainSets = [];
  return host.terrainSets;
}

function getSelectedTilesetTerrainSet(tileset = null) {
  const host = tileset || getSelectedTileset();
  const sets = getTilesetTerrainSets(host);
  if (!sets.length) {
    state.tilesetTerrainEditor.selectedTerrainSetId = null;
    return null;
  }
  const selected = sets.find((entry) => entry && entry.id === state.tilesetTerrainEditor.selectedTerrainSetId) || sets[0];
  state.tilesetTerrainEditor.selectedTerrainSetId = selected?.id || null;
  return selected || null;
}

function getSelectedTilesetTerrainEntry(tileset = null, terrainSet = null) {
  const host = tileset || getSelectedTileset();
  const selectedSet = terrainSet || getSelectedTilesetTerrainSet(host);
  const terrains = Array.isArray(selectedSet?.terrainTypes) ? selectedSet.terrainTypes : [];
  if (!terrains.length) {
    state.tilesetTerrainEditor.selectedTerrainId = null;
    return null;
  }
  const selected = terrains.find((entry) => entry && entry.id === state.tilesetTerrainEditor.selectedTerrainId) || terrains[0];
  state.tilesetTerrainEditor.selectedTerrainId = selected?.id || null;
  return selected || null;
}

function findTerrainById(tileset, terrainTypeId) {
  const sets = getTilesetTerrainSets(tileset);
  for (const set of sets) {
    const match = (set?.terrainTypes || []).find((terrain) => terrain && String(terrain.id) === String(terrainTypeId));
    if (match) return match;
  }
  return null;
}

function getTerrainColorForLabel(tileset, terrainTypeId) {
  if (terrainTypeId == null || terrainTypeId === '') return 'transparent';
  return String(findTerrainById(tileset, terrainTypeId)?.color || '#7a6ff0');
}

function applyTilesetMetadataToSelection(tileIndices, mutate, options = {}) {
  const tileset = getSelectedTileset();
  const indices = Array.from(new Set((Array.isArray(tileIndices) ? tileIndices : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0)));
  if (!tileset || !indices.length || typeof mutate !== 'function') return false;
  let changed = false;
  indices.forEach((tileIndex) => {
    const meta = ensureTilesetTileMetadata(tileset, tileIndex);
    const before = JSON.stringify(meta);
    mutate(meta, tileIndex);
    const afterMeta = ensureTilesetTileMetadata(tileset, tileIndex);
    if (JSON.stringify(afterMeta) !== before) changed = true;
  });
  if (!changed) return false;
  syncTilesetsToSceneState();
  if (options.render !== false) {
    renderTilesetsPanel();
    renderTileMapsPanel();
    scheduleRender(RenderFlags.VIEWPORT);
  }
  return true;
}

// Old edge/corner socket helpers removed in v35.6.

function renderTileTerrainMarkers(tileset, meta, terrainSet, hoverTarget = null) {
  return '';
}

function renderTilesetBitmaskOverlay(meta) {
  return '';
}

// Old mask overlay editor removed in v35.6.

function buildTileRuleOverlayBadge(tileset, index) {
  // Count terrain rules across all terrain sets that reference this tile
  const sets = Array.isArray(tileset?.terrainSets) ? tileset.terrainSets : [];
  let ruleCount = 0;
  let terrainNames = [];
  sets.forEach((set) => {
    (set.rules || []).forEach((rule) => {
      if (Number(rule?.tileIndex) === index && rule?.enabled !== false) {
        ruleCount++;
        const terrain = (set.terrainTypes || []).find((t) => String(t.id) === String(rule.terrainTypeId));
        if (terrain?.name && !terrainNames.includes(terrain.name)) terrainNames.push(terrain.name);
      }
    });
  });
  if (!ruleCount) return '';
  const label = ruleCount === 1 ? `1 rule` : `${ruleCount} rules`;
  const color = terrainNames.length === 1 ? (() => {
    const t = sets.flatMap((s) => s.terrainTypes || []).find((t) => t.name === terrainNames[0]);
    return t?.color || '#7a6ff0';
  })() : '#7a6ff0';
  const title = terrainNames.length ? `${label}: ${terrainNames.join(', ')}` : label;
  return `<span class="tileset-rule-badge" style="background:${color};" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function updateTilesetSheetPaletteHighlights(container, tileset, selectedIndex) {
  // Lightweight in-place DOM update — no full rebuild.
  // Updates selected/multi-selected classes and overlay badges on existing hotspot buttons.
  if (!container) return;
  const allowMultiSelect = true;
  const selectedTileIndices = allowMultiSelect ? getSelectedTilesetTerrainTileIndices(tileset) : [];
  const selectedTileSet = new Set(selectedTileIndices);
  const overlayRules = state.tilesetTerrainEditor?.overlayRules;
  const overlayCollision = state.tilesetTerrainEditor?.overlayCollision;

  container.querySelectorAll('.tileset-sheet-hotspot[data-tile-index]').forEach((btn) => {
    const index = Number(btn.dataset.tileIndex);
    const isPrimary = index === selectedIndex;
    const isMulti = selectedTileSet.has(index);
    btn.className = 'tileset-sheet-hotspot'
      + (isPrimary ? ' selected' : '')
      + (isMulti   ? ' multi-selected' : '');

    // Update overlay badges
    btn.querySelectorAll('.tileset-rule-badge, .tileset-collision-badge').forEach((b) => b.remove());
    if (overlayRules && tileset) {
      const badge = buildTileRuleOverlayBadge(tileset, index);
      if (badge) btn.insertAdjacentHTML('beforeend', badge);
    }
    if (overlayCollision && tileset) {
      const meta = ensureTilesetTileMetadata(tileset, index);
      if (meta?.collision) btn.insertAdjacentHTML('beforeend', '<span class="tileset-collision-badge" title="Collision">C</span>');
    }
  });
}

function renderTilesetSheetPalette(container, tileset, selectedIndex, onSelect, options = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!tileset) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty-notice';
    empty.textContent = options.emptyText || 'No tileset selected.';
    container.appendChild(empty);
    return;
  }
  const sheet = getSheetById(tileset.spriteSheetId);
  if (!sheet?.image) {
    const empty = document.createElement('div');
    empty.className = 'sf-empty-notice';
    empty.textContent = 'Tileset sprite sheet is missing.';
    container.appendChild(empty);
    return;
  }
  const pseudoSheet = makeTilesetSheet(sheet, tileset);
  if (!pseudoSheet) return;
  const total = Math.max(1, pseudoSheet.columns * pseudoSheet.rows);
  const allowMultiSelect = options.allowMultiSelect !== false;
  const selectedTileIndices = allowMultiSelect ? getSelectedTilesetTerrainTileIndices(tileset) : [];
  const selectedTileSet = new Set(selectedTileIndices);
  const overlayRules = state.tilesetTerrainEditor?.overlayRules;
  const overlayCollision = state.tilesetTerrainEditor?.overlayCollision;

  const wrap = document.createElement('div');
  wrap.className = 'tileset-sheet-map-wrap';
  const map = document.createElement('div');
  map.className = 'tileset-sheet-map';
  map.style.width = `${pseudoSheet.imageWidth}px`;
  map.style.height = `${pseudoSheet.imageHeight}px`;

  const img = document.createElement('img');
  img.className = 'tileset-sheet-map-image';
  img.src = sheet.image.src || '';
  img.alt = `${tileset.name || 'Tileset'} sheet`;
  img.draggable = false;
  map.appendChild(img);

  for (let index = 0; index < total; index++) {
    const rect = getTileRect(pseudoSheet, index);
    if (!rect) continue;
    const meta = ensureTilesetTileMetadata(tileset, index);
    const isPrimarySelected = index === selectedIndex;
    const isMultiSelected = allowMultiSelect && selectedTileSet.has(index);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tileset-sheet-hotspot' + (isPrimarySelected ? ' selected' : '') + (isMultiSelected ? ' multi-selected' : '');
    btn.title = `Tile #${index}${isMultiSelected && !isPrimarySelected ? ' (selected for terrain)' : ''}`;
    btn.dataset.tileIndex = String(index);
    btn.style.left = `${rect.x}px`;
    btn.style.top = `${rect.y}px`;
    btn.style.width = `${rect.width}px`;
    btn.style.height = `${rect.height}px`;

    let overlayHtml = '';
    if (overlayRules) overlayHtml += buildTileRuleOverlayBadge(tileset, index);
    if (overlayCollision && meta?.collision) overlayHtml += '<span class="tileset-collision-badge" title="Collision">C</span>';

    btn.insertAdjacentHTML('beforeend', `<span class="tileset-sheet-index">#${index}</span>${renderTilesetBitmaskOverlay(meta)}${overlayHtml}`);

    btn.addEventListener('pointerdown', (event) => {
      if (!allowMultiSelect || event.button !== 0) return;
      // pointerdown ONLY sets up drag state — selection happens in click.
      // Reading lastAnchorIndex from state so it reflects the most recent click.
      const drag = state.tilesetTerrainEditor.dragSelect || (state.tilesetTerrainEditor.dragSelect = {});
      const curIndices = getSelectedTilesetTerrainTileIndices(tileset);
      drag.active = true;
      drag.anchorIndex = Number.isFinite(Number(state.tilesetTerrainEditor.lastAnchorIndex))
        ? Number(state.tilesetTerrainEditor.lastAnchorIndex)
        : Math.max(0, index);
      drag.append = event.ctrlKey || event.metaKey;
      drag.baseSelection = drag.append ? [...curIndices] : [];
      drag.moved = false;
      drag.suppressClick = false;
      if (typeof btn.setPointerCapture === 'function' && event.pointerId != null) {
        try { btn.setPointerCapture(event.pointerId); } catch (_) {}
      }
      event.preventDefault();
    });

    btn.addEventListener('pointerenter', () => {
      const drag = state.tilesetTerrainEditor?.dragSelect;
      if (!allowMultiSelect || !drag?.active) return;
      updateTilesetPaletteDragSelection(index);
      updateTilesetSheetPaletteHighlights(container, tileset, Math.max(0, index));
      if (tileset) {
        tileset.selectedTileIndex = Math.max(0, index);
        syncTilesetsToSceneState();
        if (typeof syncTileSettingsInputs === 'function') syncTileSettingsInputs(tileset);
      }
    });

    btn.addEventListener('pointerup', () => {
      const drag = state.tilesetTerrainEditor?.dragSelect;
      const wasDrag = drag?.moved === true;
      endTilesetPaletteDragSelection();
      if (wasDrag) {
        // After a real drag-box selection, update highlights and terrain panel
        updateTilesetSheetPaletteHighlights(container, tileset, tileset?.selectedTileIndex ?? 0);
        onSelect(tileset?.selectedTileIndex ?? 0);
      }
    });

    btn.addEventListener('click', (event) => {
      if (state.tilesetTerrainEditor?.dragSelect?.suppressClick) {
        // This click follows a drag — selection already applied, just suppress.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Normal click: apply selection once here (NOT in pointerdown to avoid double-fire)
      if (allowMultiSelect) updateSelectedTilesetTerrainTiles(index, event);
      onSelect(index);
      updateTilesetSheetPaletteHighlights(container, tileset, Math.max(0, index));
    });

    map.appendChild(btn);
  }

  wrap.appendChild(map);
  container.appendChild(wrap);
  if (!window.__rgeTilesetPaletteDragSelectBound) {
    window.__rgeTilesetPaletteDragSelectBound = true;
    document.addEventListener('pointerup', () => endTilesetPaletteDragSelection());
    document.addEventListener('pointercancel', () => endTilesetPaletteDragSelection());
  }
}

// Legacy terrain label hover/edit helpers removed in v35.6.

// Legacy terrain tile canvas editor removed in v35.6.// Legacy terrain tile canvas editor removed in v35.6.

const TERRAIN_RULE_SOCKET_KEYS = ['topLeft','top','topRight','left','right','bottomLeft','bottom','bottomRight'];

// ══════════════════════════════════════════════════════════════════════
// TILE SETS MODAL — TERRAIN AUTHORING UI  (Patch v35.3)
// ══════════════════════════════════════════════════════════════════════
//
// Three-section panel:
//   1. Terrains  — create/rename/color/icon/delete terrain types
//   2. Rules     — map atlas tiles to terrain types with a 3×3 socket
//                  editor; suggestions accelerate authoring
//   3. Debug     — tile rule summary + live map-cell diagnostics
//
// No autotileMask, edgeLabels, cornerLabels, or corner/edge/mixed
// buttons appear anywhere in this UI.

// ── socket helpers ────────────────────────────────────────────────────

function getTerrainRuleSocketOptions(terrainSet, value, centerTerrainId = '') {
  const terrainTypes = Array.isArray(terrainSet?.terrainTypes) ? terrainSet.terrainTypes : [];
  const normalized   = value == null ? '' : String(value);
  const base = [
    { value: '',          label: 'Empty (null)' },
    { value: '*',         label: '✱  Wildcard' },
    { value: 'same',      label: '=  Same' },
    { value: 'different', label: '≠  Different' },
  ];
  const typeOpts = terrainTypes.map((t) => ({
    value: String(t.id),
    label: `⬛  ${t.name || t.id}`,
  }));
  return [...base, ...typeOpts]
    .map((o) => `<option value="${escapeHtml(o.value)}"${String(o.value) === normalized ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
}

/** Short display label for a socket value shown in the mini 3×3 grid */
function socketShortLabel(value) {
  if (value == null || value === '') return '·';
  if (value === '*')         return '✱';
  if (value === 'same')      return 'S';
  if (value === 'different') return 'D';
  return String(value).slice(0, 3);
}

/** CSS class suffix for a socket value (for colour coding) */
function socketValueClass(value) {
  if (value == null || value === '') return 'empty';
  if (value === '*')         return 'wild';
  if (value === 'same')      return 'same';
  if (value === 'different') return 'diff';
  return 'id';
}

// ── rule selection ────────────────────────────────────────────────────

function getSelectedTilesetTerrainRule(terrainSet = null) {
  const set   = terrainSet || getSelectedTilesetTerrainSet(getSelectedTileset());
  const rules = Array.isArray(set?.rules) ? set.rules : [];
  if (!rules.length) { state.tilesetTerrainEditor.selectedRuleId = null; return null; }
  const selected = rules.find((r) => r && String(r.id) === String(state.tilesetTerrainEditor.selectedRuleId)) || rules[0];
  state.tilesetTerrainEditor.selectedRuleId = selected?.id || null;
  return selected || null;
}

// ── rule factory ──────────────────────────────────────────────────────

function createTerrainRuleForUi(terrainSet, terrainType, tileIndex) {
  const api      = window.RokuSchemaResources;
  const terrainId = terrainType?.id ? String(terrainType.id) : String(terrainSet?.terrainTypes?.[0]?.id || '');
  const seed      = `${terrainId}_${tileIndex}_${Date.now().toString(36)}`;
  const rule      = api?.createDefaultTerrainRule
    ? api.createDefaultTerrainRule(seed)
    : {
        id: `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        terrainTypeId: terrainId,
        tileIndex: Math.max(0, Number(tileIndex) || 0),
        neighbors: { top:'*', right:'*', bottom:'*', left:'*', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' },
        weight: 1, allowRotate: false, allowFlipX: false, allowFlipY: false, enabled: true,
      };
  rule.terrainTypeId = terrainId;
  rule.tileIndex     = Math.max(0, Number(tileIndex) || 0);
  rule.neighbors     = Object.assign({ top:'*', right:'*', bottom:'*', left:'*', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, rule.neighbors || {});
  return api?.normalizeTerrainRule ? api.normalizeTerrainRule(rule) : rule;
}

function normalizeTerrainRuleForEditor(rule) {
  const api = window.RokuSchemaResources;
  return api?.normalizeTerrainRule ? api.normalizeTerrainRule(rule) : rule;
}

// ── suggestion presets ────────────────────────────────────────────────

function getTerrainRuleSuggestionPresets() {
  return [
    { id:'interior',         name:'Interior',          neighbors:{ top:'same',      right:'same',      bottom:'same',      left:'same',      topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:10 },
    { id:'isolated',         name:'Isolated',          neighbors:{ top:'different', right:'different', bottom:'different', left:'different', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:9  },
    { id:'edge_top',         name:'Edge Top',          neighbors:{ top:'different', right:'same',      bottom:'same',      left:'same',      topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:8  },
    { id:'edge_right',       name:'Edge Right',        neighbors:{ top:'same',      right:'different', bottom:'same',      left:'same',      topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:8  },
    { id:'edge_bottom',      name:'Edge Bottom',       neighbors:{ top:'same',      right:'same',      bottom:'different', left:'same',      topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:8  },
    { id:'edge_left',        name:'Edge Left',         neighbors:{ top:'same',      right:'same',      bottom:'same',      left:'different', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:8  },
    { id:'corner_tl',        name:'Corner TL',         neighbors:{ top:'different', right:'same',      bottom:'same',      left:'different', topLeft:'different', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:9 },
    { id:'corner_tr',        name:'Corner TR',         neighbors:{ top:'different', right:'different', bottom:'same',      left:'same',      topLeft:'*', topRight:'different', bottomRight:'*', bottomLeft:'*' }, weight:9 },
    { id:'corner_br',        name:'Corner BR',         neighbors:{ top:'same',      right:'different', bottom:'different', left:'same',      topLeft:'*', topRight:'*', bottomRight:'different', bottomLeft:'*' }, weight:9 },
    { id:'corner_bl',        name:'Corner BL',         neighbors:{ top:'same',      right:'same',      bottom:'different', left:'different', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'different' }, weight:9 },
    { id:'vertical_cap',     name:'Vertical Cap',      neighbors:{ top:'same',      right:'different', bottom:'same',      left:'different', topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:7  },
    { id:'horizontal_cap',   name:'Horizontal Cap',    neighbors:{ top:'different', right:'same',      bottom:'different', left:'same',      topLeft:'*', topRight:'*', bottomRight:'*', bottomLeft:'*' }, weight:7  },
  ];
}

/** Render a tiny 3×3 grid showing S/D/✱/· for each socket. */
function buildMiniSocketGrid(neighbors, centerColor = '#7a6ff0', centerLabel = 'C') {
  const KEYS = ['topLeft','top','topRight','left',null,'right','bottomLeft','bottom','bottomRight'];
  return `<span class="tr-mini-grid">${KEYS.map((key) => {
    if (!key) return `<span class="tr-mini-cell tr-mini-center" style="background:${escapeHtml(centerColor)}">${escapeHtml(centerLabel)}</span>`;
    const v  = neighbors?.[key];
    const cl = socketValueClass(v);
    const lb = socketShortLabel(v);
    return `<span class="tr-mini-cell tr-mini-${escapeHtml(cl)}" title="${escapeHtml(key)}: ${escapeHtml(String(v ?? 'null'))}">${escapeHtml(lb)}</span>`;
  }).join('')}</span>`;
}

function buildTerrainRuleSuggestionMarkup(terrainSet, terrainType, selectedTileIndices, selectedTileIndex) {
  if (!terrainSet)  return '<div class="terrain-empty">Create or select a terrain set to see suggestions.</div>';
  if (!terrainType) return '<div class="terrain-empty">Select a terrain type to generate suggestions.</div>';
  const tiles   = (Array.isArray(selectedTileIndices) && selectedTileIndices.length ? selectedTileIndices : [selectedTileIndex])
                    .map((v) => Math.max(0, Math.floor(Number(v) || 0)));
  const isMulti = tiles.length > 1;
  const presets = getTerrainRuleSuggestionPresets();
  const rows = presets.map((preset, i) => {
    const tileIndex = tiles[i % tiles.length];
    // When multi-tile selected, show that clicking will apply to ALL selected tiles
    const metaLabel = isMulti
      ? `${tiles.length} tiles selected`
      : `Tile #${escapeHtml(String(tileIndex))}`;
    const titleAttr = isMulti
      ? `Creates rule for all ${tiles.length} selected tiles`
      : `Creates rule for tile #${tileIndex}`;
    return `<button class="terrain-suggestion-card${isMulti ? ' multi-tile' : ''}" type="button"
        data-suggestion-id="${escapeHtml(preset.id)}"
        data-suggestion-tile="${escapeHtml(String(tileIndex))}"
        title="${escapeHtml(titleAttr)}">
      ${buildMiniSocketGrid(preset.neighbors, terrainType.color || '#7a6ff0')}
      <span class="terrain-suggestion-title">${escapeHtml(preset.name)}</span>
      <span class="terrain-suggestion-meta">${metaLabel}</span>
    </button>`;
  }).join('');
  const multiNote = isMulti
    ? `<div class="terrain-panel-note terrain-panel-note--multi">⚡ ${tiles.length} tiles selected — clicking a rule creates it for each selected tile.</div>`
    : `<div class="terrain-panel-note">Select multiple tiles to batch-create rules across them.</div>`;
  return `
    <div class="terrain-suggestion-toolbar">
      <button class="tool-btn" type="button" id="ts-terrain-suggest-apply-all">Create All</button>
      <button class="tool-btn" type="button" id="ts-terrain-suggest-clear-existing">Replace For Terrain</button>
    </div>
    ${multiNote}
    <div class="terrain-suggestion-grid">${rows}</div>`;
}

function createSuggestedTerrainRuleForUi(terrainSet, terrainType, presetId, tileIndex) {
  const presets = getTerrainRuleSuggestionPresets();
  const preset  = presets.find((p) => p.id === presetId) || presets[0];
  const rule    = createTerrainRuleForUi(terrainSet, terrainType, tileIndex);
  rule.id         = `rule_${String(terrainType?.id || 'terrain')}_${preset.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  rule.terrainTypeId = String(terrainType?.id || rule.terrainTypeId || '');
  rule.tileIndex     = Math.max(0, Math.floor(Number(tileIndex) || 0));
  rule.neighbors     = Object.assign({}, preset.neighbors);
  rule.weight        = Number(preset.weight) || 1;
  rule.enabled = true; rule.allowRotate = false; rule.allowFlipX = false; rule.allowFlipY = false;
  return normalizeTerrainRuleForEditor(rule);
}

// ── 3×3 socket editor ─────────────────────────────────────────────────

function renderTerrainRule3x3Editor(terrainSet, rule) {
  if (!terrainSet || !rule) return '<div class="terrain-empty">Select or add a rule to edit its neighbor sockets.</div>';
  const terrain     = (terrainSet.terrainTypes || []).find((t) => t && String(t.id) === String(rule.terrainTypeId));
  const neighbors   = rule.neighbors || {};
  const centerColor = terrain?.color || '#7a6ff0';
  const centerName  = terrain?.name || rule.terrainTypeId || 'Terrain';
  const terrainTypes = Array.isArray(terrainSet.terrainTypes) ? terrainSet.terrainTypes : [];

  function socketBtn(key, label) {
    const val = neighbors[key];
    const cls = socketValueClass(val);
    const short = socketShortLabel(val);
    // For terrain-type ids, find the color
    const matchedType = terrainTypes.find((t) => String(t.id) === String(val));
    const dotColor = matchedType ? matchedType.color : null;
    const dotHtml = dotColor
      ? `<span class="tr-socket-dot" style="background:${escapeHtml(dotColor)}"></span>`
      : '';
    const valStr = val == null ? '' : String(val);
    return `<button class="terrain-rule-socket tr-socket-btn tr-socket-${escapeHtml(cls)}"
        type="button" data-rule-socket="${escapeHtml(key)}" data-socket-value="${escapeHtml(valStr)}"
        title="${escapeHtml(label)}: ${escapeHtml(val == null ? 'Empty' : String(val))}">
      <span class="tr-socket-label">${escapeHtml(label)}</span>
      ${dotHtml}<strong class="tr-socket-val">${escapeHtml(short)}</strong>
    </button>`;
  }

  return `<div class="terrain-rule-grid">
    ${socketBtn('topLeft','TL')}
    ${socketBtn('top','Top')}
    ${socketBtn('topRight','TR')}
    ${socketBtn('left','Left')}
    <div class="terrain-rule-center" style="border-color:${escapeHtml(centerColor)}44;background:${escapeHtml(centerColor)}22">
      <span class="tr-socket-label">Center</span>
      <span class="terrain-rule-center-dot" style="background:${escapeHtml(centerColor)}"></span>
      <strong>${escapeHtml(centerName)}</strong>
    </div>
    ${socketBtn('right','Right')}
    ${socketBtn('bottomLeft','BL')}
    ${socketBtn('bottom','Bottom')}
    ${socketBtn('bottomRight','BR')}
  </div>`;
}

// ── debug section ─────────────────────────────────────────────────────

function buildTerrainConflictValidationMarkup(terrainSet) {
  if (!terrainSet) return '';
  const solver = window.RokuTerrainSolver;
  if (!solver?.validateTerrainSetConflicts) return '';
  const issues = solver.validateTerrainSetConflicts(terrainSet);
  if (!issues || !issues.length) return '<div class="tr-debug-ok">✓ No rule conflicts detected.</div>';
  const icon = { ERROR:'⛔', WARNING:'⚠️', INFO:'ℹ️' };
  return '<div class="tr-conflict-list">' + issues.map((issue) =>
    `<div class="tr-conflict-item tr-conflict-${escapeHtml((issue.level||'INFO').toLowerCase())}">
      <span class="tr-conflict-icon">${icon[issue.level]||'ℹ️'}</span>
      <span class="tr-conflict-msg">${escapeHtml(issue.message)}</span>
      ${issue.ruleId ? `<span class="tr-conflict-id">rule: ${escapeHtml(issue.ruleId)}</span>` : ''}
    </div>`
  ).join('') + '</div>';
}

function buildTilesetTerrainDebugMarkup(terrainSet, selectedTileIndex) {
  const rules        = Array.isArray(terrainSet?.rules) ? terrainSet.rules : [];
  const terrainTypes = Array.isArray(terrainSet?.terrainTypes) ? terrainSet.terrainTypes : [];
  const tileRules    = rules.filter((r) => Number(r?.tileIndex) === Number(selectedTileIndex) && r?.enabled !== false);
  const allTileRules = rules.filter((r) => Number(r?.tileIndex) === Number(selectedTileIndex));
  const debug        = state.tilemapEditor?.terrainDebugInfo;
  const missingTypes = terrainTypes.filter((t) => !rules.some((r) => String(r?.terrainTypeId) === String(t.id) && r?.enabled !== false));

  // Selected atlas tile summary
  const tileCard = `
    <div class="terrain-debug-card">
      <strong>Selected Atlas Tile #${escapeHtml(String(selectedTileIndex))}</strong>
      ${allTileRules.length
        ? allTileRules.map((r) => {
            const t = terrainTypes.find((tt) => String(tt.id) === String(r.terrainTypeId));
            const color = t?.color || '#7a6ff0';
            return `<div class="tr-debug-rule-row">
              <span class="gd-terrain-swatch" style="background:${escapeHtml(color)}"></span>
              <span class="tr-debug-rule-id">${escapeHtml(r.id)}</span>
              <span class="tr-debug-rule-meta">${escapeHtml(t?.name || r.terrainTypeId)} · w${escapeHtml(String(r.weight ?? 1))}${r.enabled === false ? ' · disabled' : ''}</span>
            </div>`;
          }).join('')
        : '<div class="terrain-panel-note">No rules use this tile yet.</div>'}
    </div>`;

  // Coverage check
  const coverageCard = `
    <div class="terrain-debug-card">
      <strong>Coverage Check</strong>
      ${missingTypes.length
        ? `<div class="tr-debug-warn">No enabled rules for: ${missingTypes.map((t) =>
            `<span class="tr-debug-missing-chip" style="border-color:${escapeHtml(t.color||'#7a6ff0')}44">${escapeHtml(t.name || t.id)}</span>`).join('')}</div>`
        : '<div class="tr-debug-ok">✓ Every terrain type has at least one enabled rule.</div>'}
      <div class="terrain-panel-note">Each terrain type needs at least one wildcard rule to avoid fallback tiles on unpainted borders.</div>
    </div>`;

  // Live map cell debug (from terrain debug overlay)
  let cellCard = '<div class="terrain-panel-note">No live cell data. Enable the terrain debug overlay in the Tile Maps panel, then click a terrain cell.</div>';
  if (debug) {
    const info = debug.diagnostics || null;
    const sig  = info?.neighborSignature || {};
    const KEYS = ['topLeft','top','topRight','left',null,'right','bottomLeft','bottom','bottomRight'];
    const miniGrid = `<span class="tr-mini-grid">${KEYS.map((key) => {
      if (!key) {
        const color = getTerrainColorForLabel(getSelectedTileset(), info?.terrainTypeId);
        return `<span class="tr-mini-cell tr-mini-center" style="background:${escapeHtml(color)}" title="center">${escapeHtml(String(info?.terrainTypeId || '?').slice(0,3))}</span>`;
      }
      const v  = sig[key];
      const cl = v ? (v === 'same' ? 'same' : 'id') : 'empty';
      return `<span class="tr-mini-cell tr-mini-${escapeHtml(cl)}" title="${escapeHtml(key)}">${escapeHtml(String(v ?? '·').slice(0,4))}</span>`;
    }).join('')}</span>`;
    const scoreText = info?.score
      ? `q=${info.score.quality} exact=${info.score.exact} wc=${info.score.wildcard} con=${info.score.constrained}`
      : '—';
    cellCard = `
      <div class="terrain-debug-card terrain-debug-card-rich">
        <strong>Live Cell (${escapeHtml(String(debug.col))}, ${escapeHtml(String(debug.row))})</strong>
        <div class="tr-debug-cell-body">
          ${miniGrid}
          <div class="tr-debug-cell-fields">
            <div><span class="tr-debug-label">Terrain</span> <code>${escapeHtml(String(info?.terrainTypeId ?? '—'))}</code></div>
            <div><span class="tr-debug-label">Rule</span> <code>${escapeHtml(String(info?.matchedRuleId ?? 'none'))}</code></div>
            <div><span class="tr-debug-label">Tile</span> <code>#${escapeHtml(String(info?.tileIndex ?? '—'))}</code></div>
            <div><span class="tr-debug-label">Score</span> <code>${escapeHtml(scoreText)}</code></div>
            <div><span class="tr-debug-label">Fallback</span> <code>${info?.fallbackUsed ? 'yes' : 'no'}</code></div>
            ${info?.fallbackReason ? `<div class="tr-debug-reason">${escapeHtml(info.fallbackReason)}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  const conflictCard = `<div class="terrain-debug-card"><strong>Rule Conflicts</strong>${buildTerrainConflictValidationMarkup(terrainSet)}</div>`;
  return `<div class="terrain-rule-debug">${tileCard}${coverageCard}${conflictCard}${cellCard}</div>`;
}

// ══════════════════════════════════════════════════════════════════════
// renderTilesetTerrainPanel  (main render function)
// ══════════════════════════════════════════════════════════════════════

function renderTilesetTerrainPanel() {
  if (!tsTerrainPanelEl) return;
  const tileset = getSelectedTileset();
  if (!tileset) {
    tsTerrainPanelEl.innerHTML = '<div class="tile-meta">Select a tileset to author terrain rules.</div>';
    return;
  }
  tileset.terrainSets = Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];

  const terrainSets      = getTilesetTerrainSets(tileset);
  const selectedSet      = getSelectedTilesetTerrainSet(tileset);
  const selectedTerrain  = getSelectedTilesetTerrainEntry(tileset, selectedSet);
  const selectedRule     = getSelectedTilesetTerrainRule(selectedSet);
  const selectedTileIndices = getSelectedTilesetTerrainTileIndices(tileset);
  const selectedTileIndex   = Math.max(0, Number(tileset.selectedTileIndex || selectedTileIndices[0] || 0));

  // ── terrain set selector row ─────────────────────────────────────────
  const setOptions = terrainSets.length
    ? terrainSets.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === selectedSet?.id ? ' selected' : ''}>${escapeHtml(s.name || 'Terrain Set')}</option>`).join('')
    : '<option value="">No terrain sets</option>';

  // ── Section 1: Terrains ─────────────────────────────────────────────
  const terrainsMarkup = selectedSet?.terrainTypes?.length
    ? selectedSet.terrainTypes.map((terrain) => {
        const active     = terrain.id === selectedTerrain?.id;
        const iconText   = terrain.iconTileIndex == null ? '' : `#${terrain.iconTileIndex}`;
        const ruleCount  = (selectedSet.rules || []).filter((r) => String(r?.terrainTypeId) === String(terrain.id)).length;
        return `<div class="terrain-type-row-wrap${active ? ' active' : ''}">
          <button class="terrain-type-row-btn" type="button" data-terrain-type-id="${escapeHtml(terrain.id)}">
            <span class="gd-terrain-swatch" style="background:${escapeHtml(terrain.color || '#7a6ff0')}"></span>
            <span class="terrain-type-name">${escapeHtml(terrain.name || 'Terrain')}</span>
            <span class="terrain-type-meta">${ruleCount} rule${ruleCount !== 1 ? 's' : ''}${iconText ? ` · icon ${iconText}` : ''}</span>
          </button>
          <button class="tool-btn danger tr-type-row-delete" type="button"
            data-terrain-type-id="${escapeHtml(terrain.id)}" title="Delete ${escapeHtml(terrain.name || 'terrain type')}">🗑</button>
        </div>`;
      }).join('')
    : '<div class="terrain-empty">No terrain types yet. Click <strong>Add</strong> to create one.</div>';

  const terrainPropsMarkup = selectedTerrain ? `
    <div class="tr-props-grid">
      <span class="gd-inspector-label">Name</span>
      <input class="gd-inspector-input" id="ts-terrain-type-name" type="text" value="${escapeHtml(selectedTerrain.name || '')}">
      <span class="gd-inspector-label">Color</span>
      <div class="tr-color-row">
        <input class="gd-inspector-input terrain-color-input" id="ts-terrain-type-color" type="color" value="${escapeHtml(selectedTerrain.color || '#7a6ff0')}">
        <span class="terrain-type-meta" style="color:${escapeHtml(selectedTerrain.color || '#7a6ff0')}">${escapeHtml(selectedTerrain.color || '#7a6ff0')}</span>
      </div>
      <span class="gd-inspector-label">Icon tile</span>
      <div class="tr-icon-row">
        <button class="tool-btn" type="button" id="ts-terrain-type-icon">Use Tile #${escapeHtml(String(selectedTileIndex))}</button>
        <button class="tool-btn" type="button" id="ts-terrain-type-clear-icon" ${selectedTerrain.iconTileIndex != null ? '' : 'disabled'}>Clear ${selectedTerrain.iconTileIndex != null ? `(#${selectedTerrain.iconTileIndex})` : ''}</button>
      </div>
    </div>` : '<div class="terrain-panel-note">Select a terrain type to edit its properties.</div>';

  // ── Section 2: Rules ────────────────────────────────────────────────
  // Rule list with inline mini-grid preview
  const rulesMarkup = selectedSet?.rules?.length
    ? selectedSet.rules.map((rule) => {
        const terrain = (selectedSet.terrainTypes || []).find((t) => String(t.id) === String(rule.terrainTypeId));
        const color   = terrain?.color || '#7a6ff0';
        const active  = rule.id === selectedRule?.id;
        return `<div class="tr-rule-row-wrap${active ? ' active' : ''}${rule.enabled === false ? ' tr-rule-disabled' : ''}" data-rule-id="${escapeHtml(rule.id)}">
          <button class="tr-rule-row-select" type="button" data-rule-id="${escapeHtml(rule.id)}">
            ${buildMiniSocketGrid(rule.neighbors, color)}
            <span class="tr-rule-info">
              <span class="terrain-rule-row-main">
                <span class="gd-terrain-swatch" style="background:${escapeHtml(color)}"></span>
                ${escapeHtml(terrain?.name || rule.terrainTypeId || '?')}
              </span>
              <span class="terrain-rule-row-sub">tile #${escapeHtml(String(rule.tileIndex))} · weight ${escapeHtml(String(rule.weight ?? 1))}${rule.enabled === false ? ' · disabled' : ''}</span>
            </span>
          </button>
          <button class="tool-btn danger tr-rule-row-delete" type="button"
            data-rule-id="${escapeHtml(rule.id)}" title="Delete rule">🗑</button>
        </div>`;
      }).join('')
    : '<div class="terrain-empty">No rules yet. Select an atlas tile and terrain type then click <strong>Add Rule</strong>.</div>';

  const ruleTerrainOptions = (selectedSet?.terrainTypes || [])
    .map((t) => `<option value="${escapeHtml(t.id)}"${String(t.id) === String(selectedRule?.terrainTypeId) ? ' selected' : ''}>${escapeHtml(t.name || t.id)}</option>`)
    .join('');

  const ruleEditorMarkup = selectedRule ? `
    <div class="tr-rule-props">
      <div class="tr-props-grid">
        <span class="gd-inspector-label">Terrain</span>
        <select class="gd-inspector-select" id="ts-terrain-rule-terrain" ${selectedSet?.terrainTypes?.length ? '' : 'disabled'}>${ruleTerrainOptions}</select>
        <span class="gd-inspector-label">Tile</span>
        <div class="tr-icon-row">
          <input class="gd-inspector-input tr-tile-input" id="ts-terrain-rule-tile" type="number" min="0" step="1" value="${escapeHtml(String(selectedRule.tileIndex))}">
          <button class="tool-btn" type="button" id="ts-terrain-rule-use-selected">Use #${escapeHtml(String(selectedTileIndex))}</button>
        </div>
        <span class="gd-inspector-label">Weight</span>
        <input class="gd-inspector-input tr-tile-input" id="ts-terrain-rule-weight" type="number" min="0" step="0.01" value="${escapeHtml(String(selectedRule.weight ?? 1))}">
      </div>
      <div class="terrain-rule-flags">
        <label class="gd-inspector-check"><input id="ts-terrain-rule-enabled" type="checkbox" ${selectedRule.enabled !== false ? 'checked' : ''}> Enabled</label>
        <label class="gd-inspector-check"><input id="ts-terrain-rule-rotate" type="checkbox" ${selectedRule.allowRotate === true ? 'checked' : ''}> Allow rotate</label>
        <label class="gd-inspector-check"><input id="ts-terrain-rule-flip-x" type="checkbox" ${selectedRule.allowFlipX === true ? 'checked' : ''}> Flip X</label>
        <label class="gd-inspector-check"><input id="ts-terrain-rule-flip-y" type="checkbox" ${selectedRule.allowFlipY === true ? 'checked' : ''}> Flip Y</label>
      </div>
      ${renderTerrainRule3x3Editor(selectedSet, selectedRule)}
      <div class="terrain-panel-note">Each socket: Empty = don't care (like wildcard) · ✱ Wildcard · S Same · D Different · or a specific terrain type.</div>
    </div>` : '';

  // ── assemble ─────────────────────────────────────────────────────────
  tsTerrainPanelEl.innerHTML = `
    <div class="tiles-terrain-stack terrain-rule-authoring">

      <!-- Terrain Set list + Create button -->
      <div class="tr-set-header">
        <span class="tr-set-header-title">Terrain Sets</span>
        <button class="tool-btn tr-set-create-btn" type="button" id="ts-terrain-set-add">+ Create</button>
      </div>
      <div class="tr-set-list">
        ${terrainSets.length ? terrainSets.map((s) => {
          const isActive = s.id === selectedSet?.id;
          return `<div class="tr-set-row${isActive ? ' active' : ''}" data-set-id="${escapeHtml(s.id)}">
            <button class="tr-set-row-select" type="button" data-set-id="${escapeHtml(s.id)}">
              ${isActive ? '<span class="tr-set-active-dot"></span>' : ''}
              <span class="tr-set-row-name">${escapeHtml(s.name || 'Terrain Set')}</span>
            </button>
            ${isActive ? `<input class="gd-inspector-input tr-set-name" id="ts-terrain-set-name" type="text"
              value="${escapeHtml(s.name || '')}" placeholder="Set name">` : ''}
            <button class="tool-btn danger tr-set-row-delete" type="button"
              data-set-id="${escapeHtml(s.id)}" title="Delete ${escapeHtml(s.name || 'this set')}">🗑</button>
          </div>`;
        }).join('') : '<div class="terrain-empty">No terrain sets yet — click <strong>+ Create</strong> to add one.</div>'}
      </div>

      ${!selectedSet ? `` : `

      <!-- 1. Terrains -->
      <details class="tr-section" open>
        <summary class="tr-section-title"><span class="tr-section-num">1</span> Terrain Types</summary>
        <div class="tr-section-body">
          <div class="terrain-type-list">${terrainsMarkup}</div>
          <div class="tiles-toolbar compact wrap">
            <button class="tool-btn" type="button" id="ts-terrain-type-add">+ Add Type</button>
          </div>
          ${terrainPropsMarkup}
        </div>
      </details>

      <!-- 2. Rules -->
      <details class="tr-section" ${selectedSet.rules?.length || selectedTerrain ? 'open' : ''}>
        <summary class="tr-section-title"><span class="tr-section-num">2</span> Rules
          <span class="tr-section-meta">${(selectedSet.rules || []).length} rule${(selectedSet.rules || []).length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="tr-section-body">
          <div class="tr-atlas-note">
            Atlas tile selected: <strong>#${escapeHtml(String(selectedTileIndex))}</strong>${selectedTileIndices.length > 1 ? ` (${selectedTileIndices.length} tiles)` : ''}
            ${!selectedTerrain ? ' · <em>Select a terrain type above to add rules</em>' : ''}
          </div>

          <!-- Suggestions -->
          <div class="tr-subsection tr-suggestion-grid-section">
            <div class="tr-subsection-title">⚡ Quick-create from suggestions</div>
            <div class="tr-subsection-body">
              ${buildTerrainRuleSuggestionMarkup(selectedSet, selectedTerrain, selectedTileIndices, selectedTileIndex)}
            </div>
          </div>

          <!-- Rule list -->
          <div class="terrain-rule-list">${rulesMarkup}</div>
          <div class="tiles-toolbar compact wrap">
            <button class="tool-btn" type="button" id="ts-terrain-rule-add" ${selectedSet && selectedTerrain ? '' : 'disabled'}>Add Rule</button>
            <button class="tool-btn" type="button" id="ts-terrain-rule-duplicate" ${selectedRule ? '' : 'disabled'}>Duplicate</button>
            <button class="tool-btn danger" type="button" id="ts-terrain-rule-delete" ${selectedRule ? '' : 'disabled'} title='Delete Point' class='camera-path-delete-btn'>🗑</button>
          </div>

          <!-- Rule editor -->
          ${ruleEditorMarkup}
        </div>
      </details>

      <!-- 3. Debug -->
      <details class="tr-section">
        <summary class="tr-section-title"><span class="tr-section-num">3</span> Debug</summary>
        <div class="tr-section-body">
          ${buildTilesetTerrainDebugMarkup(selectedSet, selectedTileIndex)}
        </div>
      </details>

      `}
    </div>`;

  // ── event bindings ───────────────────────────────────────────────────
  const commit = (label, doViewport = true) => commitTerrainPanelChange({ label, renderViewport: doViewport });
  const q      = (sel) => tsTerrainPanelEl.querySelector(sel);
  const qAll   = (sel) => tsTerrainPanelEl.querySelectorAll(sel);

  const currentSet     = () => getSelectedTilesetTerrainSet(tileset);
  const currentTerrain = () => getSelectedTilesetTerrainEntry(tileset, currentSet());
  const currentRule    = () => getSelectedTilesetTerrainRule(currentSet());

  // Terrain set selector + name
  // Row-based set selection (replaces select dropdown)
  qAll('.tr-set-row-select[data-set-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tilesetTerrainEditor.selectedTerrainSetId = String(btn.dataset.setId || '') || null;
      state.tilesetTerrainEditor.selectedTerrainId    = null;
      state.tilesetTerrainEditor.selectedRuleId       = null;
      renderTilesetTerrainPanel(); renderTileMapsPanel();
    });
  });
  // Per-row delete buttons on terrain sets
  qAll('.tr-set-row-delete[data-set-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const host = ensureTilesetShape(getSelectedTileset());
      const setId = String(btn.dataset.setId || '');
      const set = (host?.terrainSets || []).find((s) => s && s.id === setId);
      if (!host || !set || !confirm(`Delete terrain set "${set.name || set.id}" and all its types/rules?`)) return;
      const before = serializeScene(); const _vTerrainDel1 = _getSceneVersion();
      host.terrainSets = host.terrainSets.filter((s) => s && s.id !== setId);
      const next = host.terrainSets[0] || null;
      state.tilesetTerrainEditor.selectedTerrainSetId = next?.id || null;
      state.tilesetTerrainEditor.selectedTerrainId    = next?.terrainTypes?.[0]?.id || null;
      state.tilesetTerrainEditor.selectedRuleId       = next?.rules?.[0]?.id || null;
      syncTilesetsToSceneState();
      pushHistory('Delete terrain set', before);
      renderTilesetsPanel();
      renderTilesetTerrainPanel();
    });
  });
  // Bug 1 fix: use 'input' to update state silently (no re-render mid-type),
  // and only commit+re-render on blur or Enter so focus is never stolen.
  q('#ts-terrain-set-name')?.addEventListener('input', (e) => {
    const set = currentSet(); if (!set) return;
    const v = String(e.target.value || '').trim();
    if (v) set.name = v; // keep empty-string draft until blur
  });
  q('#ts-terrain-set-name')?.addEventListener('blur', (e) => {
    const set = currentSet(); if (!set) return;
    set.name = String(e.target.value || '').trim() || 'Terrain Set';
    commit('Rename terrain set', false);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-set-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.target.blur(); } // triggers blur → commit
    if (e.key === 'Escape') {
      const set = currentSet();
      if (set) e.target.value = set.name || '';
      e.target.blur();
    }
  });
  q('#ts-terrain-set-add')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    createTerrainSetFromUiAction();
  });
  // Terrain set delete is handled per-row (see .tr-set-row-delete bindings above)

  // Terrain types
  qAll('.terrain-type-row-btn[data-terrain-type-id]').forEach((btn) => btn.addEventListener('click', () => {
    state.tilesetTerrainEditor.selectedTerrainId = String(btn.dataset.terrainTypeId || '') || null;
    // Switching back from erase if needed
    if (state.tilemapEditor?.tool === 'erase') {
      state.tilemapEditor.tool = 'paint';
      if (typeof resetTileMapStrokeTracking === 'function') resetTileMapStrokeTracking();
      if (typeof updateTileMapToolButtons === 'function') updateTileMapToolButtons();
    }
    renderTilesetTerrainPanel(); renderTileMapsPanel();
  }));
  // Per-row delete buttons on terrain types
  qAll('.tr-type-row-delete[data-terrain-type-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const set = currentSet();
      const typeId = String(btn.dataset.terrainTypeId || '');
      const terrain = (set?.terrainTypes || []).find((t) => t && t.id === typeId);
      if (!set || !terrain || !confirm(`Delete terrain type "${terrain.name || terrain.id}" and its rules?`)) return;
      const before = serializeScene(); const _vTerrainDel2 = _getSceneVersion();
      set.terrainTypes = set.terrainTypes.filter((t) => t && t.id !== typeId);
      set.rules = (set.rules || []).filter((r) => r && String(r.terrainTypeId) !== typeId);
      state.tilesetTerrainEditor.selectedTerrainId = set.terrainTypes[0]?.id || null;
      state.tilesetTerrainEditor.selectedRuleId    = set.rules[0]?.id || null;
      syncTilesetsToSceneState();
      pushHistory('Delete terrain type', before);
      renderTilesetTerrainPanel();
    });
  });
  q('#ts-terrain-type-add')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    createTerrainTypeFromUiAction();
  });
  // Terrain type delete is handled per-row (see .tr-type-row-delete bindings above)
  q('#ts-terrain-type-name')?.addEventListener('input', (e) => {
    const t = currentTerrain(); if (!t) return;
    const v = String(e.target.value || '').trim();
    if (v) t.name = v;
  });
  q('#ts-terrain-type-name')?.addEventListener('blur', (e) => {
    const t = currentTerrain(); if (!t) return;
    t.name = String(e.target.value || '').trim() || 'Terrain';
    commit('Rename terrain type', false);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-type-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { const t = currentTerrain(); if (t) e.target.value = t.name || ''; e.target.blur(); }
  });
  q('#ts-terrain-type-color')?.addEventListener('input', (e) => {
    const t = currentTerrain(); if (!t) return;
    const v = String(e.target.value || '#7a6ff0');
    t.color = /^#([0-9a-f]{6})$/i.test(v) ? v : '#7a6ff0';
    syncTilesetsToSceneState(); renderTileMapsPanel();
  });
  q('#ts-terrain-type-color')?.addEventListener('change', (e) => {
    const t = currentTerrain(); if (!t) return;
    const v = String(e.target.value || '#7a6ff0');
    t.color = /^#([0-9a-f]{6})$/i.test(v) ? v : '#7a6ff0';
    commit('Change terrain color', false); renderTilesetTerrainPanel();
  });
  q('#ts-terrain-type-icon')?.addEventListener('click', () => {
    const t = currentTerrain(); if (!t) return;
    t.iconTileIndex = selectedTileIndex; commit('Set terrain icon');
  });
  q('#ts-terrain-type-clear-icon')?.addEventListener('click', () => {
    const t = currentTerrain(); if (!t) return;
    t.iconTileIndex = null; commit('Clear terrain icon');
  });

  // Rules
  qAll('.tr-rule-row-select[data-rule-id]').forEach((btn) => btn.addEventListener('click', () => {
    state.tilesetTerrainEditor.selectedRuleId = String(btn.dataset.ruleId || '') || null;
    renderTilesetTerrainPanel();
  }));
  qAll('.tr-rule-row-delete[data-rule-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const set = currentSet(); if (!set) return;
      const ruleId = String(btn.dataset.ruleId || '');
      const before = serializeScene(); const _vTerrainDel3 = _getSceneVersion();
      set.rules = (set.rules || []).filter((r) => r && r.id !== ruleId);
      if (state.tilesetTerrainEditor.selectedRuleId === ruleId)
        state.tilesetTerrainEditor.selectedRuleId = set.rules[0]?.id || null;
      syncTilesetsToSceneState();
      pushHistory('Delete terrain rule', before);
      renderTilesetTerrainPanel();
    });
  });
  q('#ts-terrain-rule-add')?.addEventListener('click', () => {
    const set = currentSet(); const terrain = currentTerrain(); if (!set || !terrain) return;
    set.rules = Array.isArray(set.rules) ? set.rules : [];
    const before = serializeScene(); const _vTerrainAdd3 = _getSceneVersion();
    const rule = createTerrainRuleForUi(set, terrain, selectedTileIndex);
    set.rules.push(rule);
    state.tilesetTerrainEditor.selectedRuleId = rule.id;
    syncTilesetsToSceneState();
    pushHistory('Add terrain rule', before);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-rule-duplicate')?.addEventListener('click', () => {
    const set = currentSet(); const rule = currentRule(); if (!set || !rule) return;
    const before = serializeScene();
    const dup = JSON.parse(JSON.stringify(rule));
    dup.id = `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const norm = normalizeTerrainRuleForEditor(dup);
    set.rules.push(norm);
    state.tilesetTerrainEditor.selectedRuleId = norm.id;
    syncTilesetsToSceneState();
    pushHistory('Duplicate terrain rule', before);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-rule-delete')?.addEventListener('click', () => {
    const set = currentSet(); const rule = currentRule(); if (!set || !rule) return;
    const before = serializeScene();
    set.rules = (set.rules || []).filter((e) => e && e.id !== rule.id);
    state.tilesetTerrainEditor.selectedRuleId = set.rules[0]?.id || null;
    syncTilesetsToSceneState();
    pushHistory('Delete terrain rule', before);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-rule-terrain')?.addEventListener('change', (e) => {
    const rule = currentRule(); if (!rule) return;
    rule.terrainTypeId = String(e.target.value || ''); commit('Change rule terrain');
  });
  q('#ts-terrain-rule-tile')?.addEventListener('change', (e) => {
    const rule = currentRule(); if (!rule) return;
    rule.tileIndex = Math.max(0, Math.floor(Number(e.target.value) || 0)); commit('Change rule tile');
  });
  q('#ts-terrain-rule-use-selected')?.addEventListener('click', () => {
    const rule = currentRule(); if (!rule) return;
    rule.tileIndex = selectedTileIndex; commit('Assign selected tile to rule');
  });
  // Socket buttons — click cycles through null → * → same → different → [terrain type ids] → null
  qAll('.tr-socket-btn[data-rule-socket]').forEach((btn) => btn.addEventListener('click', () => {
    const rule = currentRule(); if (!rule) return;
    const set  = currentSet();  if (!set)  return;
    rule.neighbors = rule.neighbors && typeof rule.neighbors === 'object' ? rule.neighbors : {};
    const key      = btn.dataset.ruleSocket;
    const current  = rule.neighbors[key];
    const typeIds  = (set.terrainTypes || []).map((t) => String(t.id));
    const cycle    = [null, '*', 'same', 'different', ...typeIds];
    const idx      = cycle.findIndex((v) => v === current || (v != null && current != null && String(v) === String(current)));
    rule.neighbors[key] = cycle[(idx + 1) % cycle.length];
    commit('Edit rule socket');
  }));
  // Boolean flags
  [
    ['#ts-terrain-rule-enabled', 'enabled',     'Toggle rule enabled'],
    ['#ts-terrain-rule-rotate',  'allowRotate',  'Toggle rule rotate'],
    ['#ts-terrain-rule-flip-x',  'allowFlipX',   'Toggle rule flip X'],
    ['#ts-terrain-rule-flip-y',  'allowFlipY',   'Toggle rule flip Y'],
  ].forEach(([sel, field, label]) => q(sel)?.addEventListener('change', (e) => {
    const rule = currentRule(); if (!rule) return;
    rule[field] = e.target.checked === true; commit(label);
  }));
  q('#ts-terrain-rule-weight')?.addEventListener('change', (e) => {
    const rule = currentRule(); if (!rule) return;
    rule.weight = Math.max(0, Number(e.target.value) || 0); commit('Change rule weight');
  });

  // Suggestion cards
  q('#ts-terrain-suggest-apply-all')?.addEventListener('click', () => {
    const set = currentSet(); const terrain = currentTerrain(); if (!set || !terrain) return;
    const before = serializeScene();
    const presets = getTerrainRuleSuggestionPresets();
    const tiles   = (selectedTileIndices.length ? selectedTileIndices : [selectedTileIndex]);
    presets.forEach((preset, i) => {
      const rule = createSuggestedTerrainRuleForUi(set, terrain, preset.id, tiles[i % tiles.length]);
      set.rules.push(rule);
      state.tilesetTerrainEditor.selectedRuleId = rule.id;
    });
    syncTilesetsToSceneState();
    pushHistory('Create all suggestions', before);
    renderTilesetTerrainPanel();
  });
  q('#ts-terrain-suggest-clear-existing')?.addEventListener('click', () => {
    const set = currentSet(); const terrain = currentTerrain(); if (!set || !terrain) return;
    if (!confirm(`Replace all rules for "${terrain.name || terrain.id}" with suggestions?`)) return;
    const before = serializeScene();
    set.rules = (set.rules || []).filter((r) => r && String(r.terrainTypeId) !== String(terrain.id));
    const presets = getTerrainRuleSuggestionPresets();
    const tiles   = (selectedTileIndices.length ? selectedTileIndices : [selectedTileIndex]);
    presets.forEach((preset, i) => {
      const rule = createSuggestedTerrainRuleForUi(set, terrain, preset.id, tiles[i % tiles.length]);
      set.rules.push(rule);
      state.tilesetTerrainEditor.selectedRuleId = rule.id;
    });
    syncTilesetsToSceneState();
    pushHistory('Replace rules with suggestions', before);
    renderTilesetTerrainPanel();
  });
  qAll('.terrain-suggestion-card[data-suggestion-id]').forEach((card) => card.addEventListener('click', () => {
    const set = currentSet(); const terrain = currentTerrain(); if (!set || !terrain) return;
    const before = serializeScene();
    set.rules = Array.isArray(set.rules) ? set.rules : [];
    // Apply this suggestion to every selected tile (or just the primary if only one selected)
    const tilesToApply = selectedTileIndices.length > 1
      ? selectedTileIndices
      : [Number(card.dataset.suggestionTile) || selectedTileIndex];
    let lastRule = null;
    tilesToApply.forEach((tileIdx) => {
      const rule = createSuggestedTerrainRuleForUi(set, terrain, card.dataset.suggestionId, tileIdx);
      set.rules.push(rule);
      lastRule = rule;
    });
    if (lastRule) state.tilesetTerrainEditor.selectedRuleId = lastRule.id;
    syncTilesetsToSceneState();
    const label = tilesToApply.length > 1
      ? `Add suggestion rule to ${tilesToApply.length} tiles`
      : 'Add suggestion rule';
    pushHistory(label, before);
    renderTilesetTerrainPanel();
  }));
}



function renderTilePaletteGrid(container, tileset, selectedIndex, onSelect, options = {}) {
  if (!container) return; container.innerHTML = '';
  if (options.includeErase) {
    const eraseBtn = document.createElement('button'); eraseBtn.className = 'tile-palette-btn erase' + (selectedIndex === -1 ? ' selected' : ''); eraseBtn.textContent = 'Erase'; eraseBtn.addEventListener('click', () => onSelect(-1)); container.appendChild(eraseBtn);
  }
  if (!tileset) { const empty = document.createElement('div'); empty.className = 'sf-empty-notice'; empty.textContent = options.emptyText || 'No tileset selected.'; container.appendChild(empty); return; }
  const sheet = getSheetById(tileset.spriteSheetId); if (!sheet?.image) { const empty = document.createElement('div'); empty.className = 'sf-empty-notice'; empty.textContent = 'Tileset sprite sheet is missing.'; container.appendChild(empty); return; }
  const pseudoSheet = makeTilesetSheet(sheet, tileset); const total = Math.max(1, pseudoSheet.columns * pseudoSheet.rows);
  const terrainSet = options.terrainOverlay ? getSelectedTilesetTerrainSet(tileset) : null;
  const allowMultiSelect = options.allowMultiSelect !== false;
  const isTerrainEditing = options.terrainOverlay === true && !!terrainSet;
  const selectedTileIndices = allowMultiSelect ? getSelectedTilesetTerrainTileIndices(tileset) : [];
  const selectedTileSet = new Set(selectedTileIndices);
  const hoverState = state.tilesetTerrainEditor.hoverTarget;
  for (let index = 0; index < total; index++) {
    const dataUrl = extractTileDataUrl(tileset, index); if (!dataUrl) continue;
    const meta = ensureTilesetTileMetadata(tileset, index);
    const isPrimarySelected = index === selectedIndex;
    const isMultiSelected = allowMultiSelect && selectedTileSet.has(index);
    const btn = document.createElement('button');
    btn.className = 'tile-palette-btn tileset-palette-btn' + (isPrimarySelected ? ' selected' : '') + (isMultiSelected ? ' multi-selected' : '');
    btn.title = `Tile #${index}${isMultiSelected && !isPrimarySelected ? ' (selected)' : ''}`;
    btn.dataset.tileIndex = String(index);
    const img = document.createElement('img'); img.src = dataUrl; img.alt = `Tile ${index}`; const cap = document.createElement('div'); cap.textContent = `#${index}`;
    if (meta.terrainTypeId > 0 || meta.collision) {
      const badge = document.createElement('div'); badge.className = 'tile-palette-badge'; badge.textContent = `${meta.terrainTypeId > 0 ? 'T' + meta.terrainTypeId : ''}${meta.collision ? ' C' : ''}`.trim(); btn.appendChild(badge);
    }
    btn.appendChild(img); btn.appendChild(cap);
    const overlayTarget = isTerrainEditing && isPrimarySelected ? hoverState : null;
    const overlayMarkup = isTerrainEditing ? renderTileTerrainMarkers(tileset, meta, terrainSet, overlayTarget) : '';
    if (overlayMarkup) btn.insertAdjacentHTML('beforeend', overlayMarkup);

    btn.addEventListener('pointerdown', (event) => {
      if (!allowMultiSelect || event.button !== 0) return;
      // pointerdown only sets up drag; selection fires in click to prevent double-toggle
      const drag = state.tilesetTerrainEditor.dragSelect || (state.tilesetTerrainEditor.dragSelect = {});
      const curIndices = getSelectedTilesetTerrainTileIndices(tileset);
      drag.active = true;
      drag.anchorIndex = Number.isFinite(Number(state.tilesetTerrainEditor.lastAnchorIndex))
        ? Number(state.tilesetTerrainEditor.lastAnchorIndex)
        : Math.max(0, index);
      drag.append = event.ctrlKey || event.metaKey;
      drag.baseSelection = drag.append ? [...curIndices] : [];
      drag.moved = false;
      drag.suppressClick = false;
      if (typeof btn.setPointerCapture === 'function' && event.pointerId != null) {
        try { btn.setPointerCapture(event.pointerId); } catch (_) {}
      }
      event.preventDefault();
    });

    btn.addEventListener('pointerenter', () => {
      const _drag = state.tilesetTerrainEditor?.dragSelect;
      if (!allowMultiSelect || !_drag?.active) return;
      updateTilesetPaletteDragSelection(index);
      if (typeof onSelect === 'function') onSelect(index);
    });
    btn.addEventListener('pointerup', () => {
      const drag = state.tilesetTerrainEditor?.dragSelect;
      const wasDrag = drag?.moved === true;
      endTilesetPaletteDragSelection();
      if (wasDrag && typeof onSelect === 'function') onSelect(tileset?.selectedTileIndex ?? 0);
    });

    btn.addEventListener('click', (event) => {
      if (state.tilesetTerrainEditor?.dragSelect?.suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (allowMultiSelect) updateSelectedTilesetTerrainTiles(index, event);
      onSelect(index);
    });
    if (isTerrainEditing && isPrimarySelected) {
      btn.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    container.appendChild(btn);
  }
  if (!window.__rgeTilesetPaletteDragSelectBound) {
    window.__rgeTilesetPaletteDragSelectBound = true;
    document.addEventListener('pointerup', () => endTilesetPaletteDragSelection());
    document.addEventListener('pointercancel', () => endTilesetPaletteDragSelection());
  }
};

// Bug 2 fix: lightweight tile-settings sync — no HTML rebuild, no focus loss.
function syncTileSettingsInputs(tileset) {
  if (!tileset) return;
  const idx = tileset.selectedTileIndex || 0;
  const meta = ensureTilesetTileMetadata(tileset, idx);
  // Refresh collision shape editor for the newly selected tile
  TileCollisionEditor.refresh(tileset, idx);
  TilePhysicsEditor.refresh(tileset, idx);
  const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setValue('ts-meta-atlas-x', meta?.atlasX === '' ? '' : (meta?.atlasX ?? ''));
  setValue('ts-meta-atlas-y', meta?.atlasY === '' ? '' : (meta?.atlasY ?? ''));
  setValue('ts-meta-atlas-w', meta?.atlasW === '' ? '' : (meta?.atlasW ?? ''));
  setValue('ts-meta-atlas-h', meta?.atlasH === '' ? '' : (meta?.atlasH ?? ''));
  const col = document.getElementById('ts-meta-collision');
  if (col) col.checked = meta?.collision === true;
  const detail = document.getElementById('ts-meta-detail');
  if (detail) detail.innerHTML = `<span class="tile-overlay-pill collision">`
    + `${meta?.collision ? 'Collision on' : 'Collision off'}</span>`
    + `Tile #${idx}<br>Terrain rules are in the Terrain Sets section.`;
  renderTilesetTerrainPanel();
}

renderTilesetsPanel = function() {
  if (!tsItemsEl) return;
  tsItemsEl.innerHTML = '';
  const items = state.tilesets || [];
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'sf-empty-notice'; empty.textContent = 'Create a tileset from a spritesheet.'; tsItemsEl.appendChild(empty);
  } else {
    items.forEach((tileset) => {
      const row = document.createElement('div');
      row.className = 'sheet-list-row';

      const btn = document.createElement('button');
      btn.className = 'tool-btn sprite-row-main' + (tileset.id === state.selectedTilesetId ? ' active' : '');
      btn.textContent = tileset.name;
      btn.title = tileset.name || 'Tileset';
      btn.addEventListener('click', () => {
        state.selectedTilesetId = tileset.id;
        syncTilesetsToSceneState();
        renderTilesetsPanel();
        renderTileMapsPanel();
        activateRightDockTab('node-info');
      });
      row.appendChild(btn);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tool-btn sheet-delete-btn';
      del.title = `Delete tileset ${tileset.name || ''}`.trim();
      del.textContent = '🗑';
      del.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`Delete tileset "${tileset.name}"?`)) return;
        state.tilesets = (state.tilesets || []).filter((item) => item.id !== tileset.id);
        if (state.selectedTilesetId === tileset.id) state.selectedTilesetId = state.tilesets[0]?.id || null;
        syncTilesetsToSceneState();
        renderTilesetsPanel();
        renderTileMapsPanel();
        scheduleRender(RenderFlags.VIEWPORT);
        setStatus(`Deleted ${tileset.name}.`);
      });
      row.appendChild(del);

      tsItemsEl.appendChild(row);
    });
  }
  if (tsSheetSelectEl) tsSheetSelectEl.innerHTML = '<option value="">No spritesheet</option>' + (state.spritesheets || []).map((sheet) => `<option value="${sheet.id}">${sheet.name}</option>`).join('');
  const selected = getSelectedTileset();
  if (tsSheetSelectEl) tsSheetSelectEl.value = selected?.spriteSheetId || '';
  if (tsTileWEl) tsTileWEl.value = selected?.tileWidth || 32;
  if (tsTileHEl) tsTileHEl.value = selected?.tileHeight || 32;
  if (tsPaddingEl) tsPaddingEl.value = selected?.padding || 0;
  const sheet = selected ? getSheetById(selected.spriteSheetId) : null;
  if (tsMetaEl) tsMetaEl.textContent = selected ? `${selected.name} · ${sheet?.name || 'No sheet'} · ${selected.tileWidth}×${selected.tileHeight} · padding ${selected.padding}` : 'Select a tileset.';
  renderTilesetSheetPalette(tsPaletteGridEl, selected, selected?.selectedTileIndex ?? 0, (index) => {
    if (!selected) return;
    selected.selectedTileIndex = Math.max(0, index);
    if (!Array.isArray(state.tilesetTerrainEditor.selectedTileIndices) ||
        !state.tilesetTerrainEditor.selectedTileIndices.length) {
      state.tilesetTerrainEditor.selectedTileIndices = [Math.max(0, index)];
    }
    state.tilesetTerrainEditor.hoverTarget = null;
    syncTilesetsToSceneState();
    syncTileSettingsInputs(selected);
  }, { terrainOverlay: false, allowMultiSelect: true, emptyText: 'No tileset selected.' });

  // ── Palette toolbar bindings ─────────────────────────────────────────
  const bindOverlayBtn = (id, stateKey) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', !!state.tilesetTerrainEditor[stateKey]);
    btn.addEventListener('click', () => {
      state.tilesetTerrainEditor[stateKey] = !state.tilesetTerrainEditor[stateKey];
      btn.classList.toggle('active', !!state.tilesetTerrainEditor[stateKey]);
      updateTilesetSheetPaletteHighlights(tsPaletteGridEl, selected, selected?.selectedTileIndex ?? 0);
    });
  };
  bindOverlayBtn('ts-overlay-rules', 'overlayRules');
  bindOverlayBtn('ts-overlay-collision', 'overlayCollision');

  const selectWithRulesBtn = document.getElementById('ts-select-rules-all');
  if (selectWithRulesBtn && selected) {
    selectWithRulesBtn.addEventListener('click', () => {
      const sets = Array.isArray(selected.terrainSets) ? selected.terrainSets : [];
      const tileIndices = new Set();
      sets.forEach((set) => (set.rules || []).forEach((rule) => {
        if (rule?.enabled !== false && Number.isFinite(Number(rule?.tileIndex))) tileIndices.add(Number(rule.tileIndex));
      }));
      if (!tileIndices.size) { setStatus('No terrain rules found on this tileset.'); return; }
      setSelectedTilesetTerrainTileIndices(Array.from(tileIndices));
      updateTilesetSheetPaletteHighlights(tsPaletteGridEl, selected, selected?.selectedTileIndex ?? 0);
      renderTilesetTerrainPanel();
      setStatus(`Selected ${tileIndices.size} tile${tileIndices.size !== 1 ? 's' : ''} with terrain rules.`);
    });
  }
  const clearSelBtn = document.getElementById('ts-select-clear');
  if (clearSelBtn && selected) {
    clearSelBtn.addEventListener('click', () => {
      const primary = selected?.selectedTileIndex ?? 0;
      setSelectedTilesetTerrainTileIndices([primary], primary);
      updateTilesetSheetPaletteHighlights(tsPaletteGridEl, selected, primary);
      renderTilesetTerrainPanel();
    });
  }
  // Refresh collision shape editor whenever tileset panel re-renders
  TileCollisionEditor.refresh(selected || null, selected ? (selected.selectedTileIndex ?? 0) : -1);
  TilePhysicsEditor.refresh(selected || null, selected ? (selected.selectedTileIndex ?? 0) : -1);
  renderTilesetTerrainPanel();
  const meta = selected ? ensureTilesetTileMetadata(selected, selected.selectedTileIndex || 0) : null;
  const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
  setValue('ts-meta-atlas-x', meta?.atlasX === '' ? '' : (meta?.atlasX ?? ''));
  setValue('ts-meta-atlas-y', meta?.atlasY === '' ? '' : (meta?.atlasY ?? ''));
  setValue('ts-meta-atlas-w', meta?.atlasW === '' ? '' : (meta?.atlasW ?? ''));
  setValue('ts-meta-atlas-h', meta?.atlasH === '' ? '' : (meta?.atlasH ?? ''));
  const detail = document.getElementById('ts-meta-detail');
  if (detail) detail.innerHTML = selected ? `<span class="tile-overlay-pill collision">${meta?.collision ? 'Collision on' : 'Collision off'}</span>Tile #${selected.selectedTileIndex || 0}<br>Terrain is authored through terrainTypes[] and rules[] in the Terrain Sets section.` : 'Select a tile in the palette to edit metadata.';
};

function refreshTileMapLayerList(node) {
  const layerListEl = document.getElementById('tm-layer-list');
  if (!layerListEl) return;
  const activeNode = node || getSelectedTileMapNode();
  if (!activeNode) {
    layerListEl.innerHTML = '<div class="sf-empty-notice">Select a TileMap node.</div>';
    return;
  }
  const props = ensureTileMapData(activeNode);
  const activeLayer = getActiveTileMapLayer(activeNode);

  const selectLayer = (layerId) => {
    const wasActive = String(state.tilemapEditor.activeLayerId || props.activeLayerId || '') === String(layerId || '');
    state.tilemapEditor.activeLayerId = layerId;
    props.activeLayerId = layerId;
    const selectedLayer = (props.layers || []).find((item) => item && item.id === layerId) || null;
    props.tilesetId = String(selectedLayer?.tilesetId || props.tilesetId || '');
    state.selectedTilesetId = props.tilesetId || state.selectedTilesetId || null;
    const assigned = getTileMapAssignedTileset(activeNode, selectedLayer);
    state.tilemapEditor.selectedTileIndex = assigned ? Math.max(0, Number(assigned.selectedTileIndex) || 0) : -1;
    if (!wasActive) refreshTileMapLayerList(activeNode);
    refreshSelectedTileMapTilesetUI(activeNode);
    drawTileMapEditorCanvas(activeNode);
    updateTileMapPanelSummary(activeNode);
    scheduleRender(RenderFlags.VIEWPORT);
  };

  let layerClickTimer = null;

  const renameLayer = (layer, nextName) => {
    const trimmed = String(nextName || '').trim();
    if (!trimmed) {
      refreshTileMapLayerList(activeNode);
      return false;
    }
    layer.name = trimmed;
    refreshTileMapLayerList(activeNode);
    drawTileMapEditorCanvas(activeNode);
    updateTileMapPanelSummary(activeNode);
    scheduleRender(RenderFlags.VIEWPORT);
    renderInspector();
    setStatus(`Renamed layer to ${trimmed}.`);
    return true;
  };

  const deleteLayer = (layer) => {
    if ((props.layers || []).length <= 1) {
      setStatus('A TileMap needs at least one layer.', true);
      return;
    }
    props.layers = (props.layers || []).filter((item) => item && item.id !== layer.id);
    const nextActive = props.layers[0] || null;
    props.activeLayerId = nextActive ? nextActive.id : null;
    state.tilemapEditor.activeLayerId = props.activeLayerId;
    syncPrimaryTileLayerAliases(props);
    refreshTileMapLayerList(activeNode);
    drawTileMapEditorCanvas(activeNode);
    updateTileMapPanelSummary(activeNode);
    scheduleRender(RenderFlags.VIEWPORT);
    renderInspector();
    setStatus(`Deleted ${layer.name}.`);
  };

  const fragment = document.createDocumentFragment();
  (props.layers || []).forEach((layer) => {
    const row = document.createElement('div');
    row.className = 'tile-layer-row' + (layer.id === activeLayer?.id ? ' active' : '');
    row.dataset.layerId = layer.id;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'tool-btn tile-layer-main' + (layer.id === activeLayer?.id ? ' active' : '');
    const label = document.createElement('span');
    label.className = 'tile-layer-name';
    label.textContent = layer.name;
    main.appendChild(label);


    const beginInlineRename = () => {
      selectLayer(layer.id);
      main.innerHTML = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tile-layer-name-input';
      input.value = layer.name || 'Layer';
      main.appendChild(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        renameLayer(layer, input.value);
      };
      const cancel = () => {
        if (committed) return;
        committed = true;
        refreshTileMapLayerList(activeNode);
      };
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('dblclick', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      });
      input.addEventListener('blur', commit);
    };

    main.addEventListener('click', () => {
      if (layerClickTimer) clearTimeout(layerClickTimer);
      layerClickTimer = setTimeout(() => {
        layerClickTimer = null;
        selectLayer(layer.id);
      }, 200);
    });
    main.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (layerClickTimer) {
        clearTimeout(layerClickTimer);
        layerClickTimer = null;
      }
      beginInlineRename();
    });

    const vis = document.createElement('button');
    vis.type = 'button';
    vis.className = 'tool-btn tile-layer-visibility';
    vis.textContent = layer.visible !== false ? '◉' : '○';
    vis.title = layer.visible !== false ? 'Hide layer' : 'Show layer';
    vis.addEventListener('click', (event) => {
      event.stopPropagation();
      layer.visible = layer.visible === false;
      refreshTileMapLayerList(activeNode);
      drawTileMapEditorCanvas(activeNode);
      updateTileMapPanelSummary(activeNode);
      scheduleRender(RenderFlags.VIEWPORT);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'tool-btn tile-layer-delete';
    del.title = `Delete ${layer.name}`;
    del.setAttribute('aria-label', `Delete ${layer.name}`);
    del.textContent = '🗑';
    del.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteLayer(layer);
    });

    row.appendChild(main);
    row.appendChild(vis);
    row.appendChild(del);
    fragment.appendChild(row);
  });
  layerListEl.replaceChildren(fragment);
}


// (Intermediate renderTileMapsPanel override removed — final override below is authoritative.)

function updateTileMapPointerFromEvent(event) {
  const node = getSelectedTileMapNode(); if (!node || !tmCanvasEl) return;
  const props = ensureTileMapData(node); const rect = tmCanvasEl.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  const x = (clientX - rect.left) * (tmCanvasEl.width / rect.width), y = (clientY - rect.top) * (tmCanvasEl.height / rect.height);
  const col = Math.floor(x / props.tileWidth), row = Math.floor(y / props.tileHeight);
  const nextHoverCol = (col >= 0 && col < props.mapWidth) ? col : -1;
  const nextHoverRow = (row >= 0 && row < props.mapHeight) ? row : -1;
  const hoverChanged = nextHoverCol !== state.tilemapEditor.hoverCol || nextHoverRow !== state.tilemapEditor.hoverRow;
  state.tilemapEditor.hoverCol = nextHoverCol; state.tilemapEditor.hoverRow = nextHoverRow;
  if (state.tilemapEditor.isPointerDown && state.tilemapEditor.hoverCol >= 0 && state.tilemapEditor.hoverRow >= 0) {
    const layer = getActiveTileMapLayer(node);
    const nextKey = layer ? `${node.id}:${layer.id}:${state.tilemapEditor.paintMode}:${state.tilemapEditor.tool}:${state.tilemapEditor.hoverCol},${state.tilemapEditor.hoverRow}` : '';
    if (nextKey && nextKey !== state.tilemapEditor.lastAppliedCellKey && paintTileMapAt(node, state.tilemapEditor.hoverCol, state.tilemapEditor.hoverRow)) {
      drawTileMapEditorCanvas(node);
      scheduleTileMapCanvasRedraw(node);
      updateSceneSummary();
      return;
    }
  }
  if (hoverChanged) drawTileMapEditorCanvas(node);
};

function getViewportTilePaintCell(node, shape) {
  if (!stage || !shape) return null;
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  let local = null;
  try {
    local = shape.getAbsoluteTransform().copy().invert().point(pointer);
  } catch (_) {
    return null;
  }
  const props = ensureTileMapData(node);
  const col = Math.floor(local.x / props.tileWidth);
  const row = Math.floor(local.y / props.tileHeight);
  return {
    col,
    row,
    inside: col >= 0 && col < props.mapWidth && row >= 0 && row < props.mapHeight
  };
}

// ── Shift-drag group select: commit selected rect as brush group ────
function endViewportGroupSelect() {
  const gsel = state.tilemapEditor.viewportGroupSelect;
  if (!gsel?.active) return;
  state.tilemapEditor.viewportGroupSelect = { active: false, nodeId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1 };

  const node = getNode(gsel.nodeId);
  if (!node) return;

  const props = ensureTileMapData(node);
  const layer = getActiveTileMapLayer(node);
  const tileset = getTileMapAssignedTileset(node, layer);
  if (!tileset) { scheduleRender(RenderFlags.VIEWPORT); return; }

  const sheet = getSheetById(tileset.spriteSheetId);
  if (!sheet?.image) { scheduleRender(RenderFlags.VIEWPORT); return; }
  const ps = makeTilesetSheet(sheet, tileset);
  if (!ps) { scheduleRender(RenderFlags.VIEWPORT); return; }

  const minCol = Math.max(0, Math.min(gsel.startCol, gsel.currentCol));
  const maxCol = Math.min(props.mapWidth - 1, Math.max(gsel.startCol, gsel.currentCol));
  const minRow = Math.max(0, Math.min(gsel.startRow, gsel.currentRow));
  const maxRow = Math.min(props.mapHeight - 1, Math.max(gsel.startRow, gsel.currentRow));

  // Build brush group from the tile indices in the selected cells
  const tiles = layer?.tiles;
  if (!tiles) { scheduleRender(RenderFlags.VIEWPORT); return; }
  const entries = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const tileIdx = Array.isArray(tiles[r]) ? tiles[r][c] : -1;
      if (tileIdx >= 0) {
        entries.push({ tileIndex: tileIdx, dcol: c - minCol, drow: r - minRow });
      }
    }
  }

  if (entries.length > 0) {
    const anchor = entries[0];
    state.tilemapEditor.brushGroup = entries;
    state.tilemapEditor.activeBrushGroupId = null;
    state.tilemapEditor.selectedTileIndex = anchor.tileIndex;
    state.tilemapEditor.tool = 'paint';
    resetTileMapStrokeTracking();
    updateTileMapToolButtons();
    syncEditorStateFromRuntime();
    const assigned = getTileMapAssignedTileset(node, layer);
    renderSavedBrushesSidebar(assigned, node);
    const cont = document.getElementById('tm-palette-grid');
    if (cont) renderTileMapPaletteGrid(cont, assigned, node);
    renderTileMapsPanel();
  }
  clearTileHoverOverlay();
}


function beginViewportTilePaint(node, shape, evt) {
  if (!node || node.type !== 'TileMap' || state.tool !== 'select') return false;
  if (state.selectedId !== node.id || getSelectedNodeIds().length !== 1) {
    selectNode(node.id);
    return false;
  }
  if (state.viewport.isPanning || state.viewport.isMarqueeSelecting) return false;
  const cell = getViewportTilePaintCell(node, shape);
  if (!cell || !cell.inside) return false;

  // ── Shift+left-drag: start tile group-select marquee ───────────────
  if (evt.shiftKey && (evt.button == null || evt.button === 0)) {
    suppressStageClick = true;
    state.tilemapEditor.viewportGroupSelect = {
      active: true,
      nodeId: node.id,
      startCol: cell.col,
      startRow: cell.row,
      currentCol: cell.col,
      currentRow: cell.row,
    };
    state.tilemapEditor.hoverCol = cell.col;
    state.tilemapEditor.hoverRow = cell.row;
    scheduleRender(RenderFlags.VIEWPORT);
    return true;
  }
  // Right-click: pick tile under cursor (must be checked before left-click guard)
  if (evt.button === 2) {
    suppressStageClick = true;
    resetTileMapStrokeTracking();
    state.tilemapEditor.hoverCol = cell.col;
    state.tilemapEditor.hoverRow = cell.row;
    state.tilemapEditor.lastPick = { nodeId: node.id, col: cell.col, row: cell.row };
    const previousTool = state.tilemapEditor.tool;
    state.tilemapEditor.tool = 'pick';
    paintTileMapAt(node, cell.col, cell.row);
    state.tilemapEditor.tool = previousTool === 'pick' ? 'paint' : previousTool;
    updateTileMapToolButtons();
    renderTileMapsPanel();
    return true;
  }
  if ((evt.button != null && evt.button !== 0)) return false;
  suppressStageClick = true;
  resetTileMapStrokeTracking();
  // Fill tool is one-shot: apply once on click, no continuous drag session needed
  if (state.tilemapEditor.tool === 'fill') {
    const before = serializeScene();
    const changed = paintTileMapAt(node, cell.col, cell.row);
    if (changed) {
      pushHistory('Paint TileMap', before);
      scheduleRender(RenderFlags.VIEWPORT);
    }
    return true;
  }
  const isShapeTool = state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line';
  state.tilemapEditor.viewportPaint = {
    active: true,
    nodeId: node.id,
    beforeSnapshot: serializeScene(),
    pointerId: evt.pointerId ?? null,
    startCol: cell.col,
    startRow: cell.row,
    currentCol: cell.col,
    currentRow: cell.row,
    previewCells: isShapeTool ? [{ col: cell.col, row: cell.row }] : []
  };
  state.tilemapEditor.isPointerDown = true;
  state.tilemapEditor.hoverCol = cell.col;
  state.tilemapEditor.hoverRow = cell.row;
  if (isShapeTool) {
    scheduleRender(RenderFlags.VIEWPORT);
    return true;
  }
  const changed = paintTileMapAt(node, cell.col, cell.row);
  if (changed) scheduleRender(RenderFlags.VIEWPORT);
  return true;
}

function updateViewportTilePaint() {
  // ── Shift group-select drag update ────────────────────────────────
  const gsel = state.tilemapEditor.viewportGroupSelect;
  if (gsel?.active) {
    const node = getNode(gsel.nodeId);
    const shape = node ? shapeRefs.get(node.id) : null;
    if (!node || !shape) return;
    const cell = getViewportTilePaintCell(node, shape);
    if (cell) {
      state.tilemapEditor.hoverCol = cell.col;
      state.tilemapEditor.hoverRow = cell.row;
      const changed = cell.col !== gsel.currentCol || cell.row !== gsel.currentRow;
      gsel.currentCol = cell.col;
      gsel.currentRow = cell.row;
      if (changed) drawTileHoverOverlay(node);
    }
    return;
  }

  const session = state.tilemapEditor.viewportPaint;
  if (!session?.active) return;
  const node = getNode(session.nodeId);
  const shape = node ? shapeRefs.get(node.id) : null;
  if (!node || !shape) return;
  const cell = getViewportTilePaintCell(node, shape);
  if (!cell || !cell.inside) {
    const hadHover = state.tilemapEditor.hoverCol >= 0 || state.tilemapEditor.hoverRow >= 0;
    state.tilemapEditor.hoverCol = -1;
    state.tilemapEditor.hoverRow = -1;
    if (hadHover) clearTileHoverOverlay();
    return;
  }
  const hoverChanged = cell.col !== state.tilemapEditor.hoverCol || cell.row !== state.tilemapEditor.hoverRow;
  state.tilemapEditor.hoverCol = cell.col;
  state.tilemapEditor.hoverRow = cell.row;
  if (state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line') {
    const previewChanged = cell.col !== session.currentCol || cell.row !== session.currentRow;
    session.currentCol = cell.col;
    session.currentRow = cell.row;
    session.previewCells = getTileMapShapePreviewCells(node, state.tilemapEditor.tool, session.startCol, session.startRow, cell.col, cell.row);
    if (hoverChanged || previewChanged) drawTileHoverOverlay(node);
    return;
  }
  const changed = paintTileMapAt(node, cell.col, cell.row);
  // Paint strokes modify tile data → need a real renderViewport for tile imagery,
  // but only when the cell actually changed.  Hover-only movement stays on the overlay.
  if (changed) {
    scheduleTileMapCanvasRedraw(node);
    drawTileHoverOverlay(node);
  } else if (hoverChanged) {
    drawTileHoverOverlay(node);
  }
}

function endViewportTilePaint() {
  const session = state.tilemapEditor.viewportPaint;
  if (!session?.active) return;
  const node = getNode(session.nodeId);
  let changed = false;
  if (node && (state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line')) {
    const previewCells = getUniqueTileMapCells(Array.isArray(session.previewCells) ? session.previewCells : []);
    const layer = getActiveTileMapLayer(node);
    if (false) {
      // Legacy tile-mode terrain fill is disabled in v35.6.
    } else {
      previewCells.forEach((cell) => {
        if (paintTileMapAt(node, cell.col, cell.row)) changed = true;
      });
    }
  }
  state.tilemapEditor.viewportPaint = { active: false, nodeId: null, beforeSnapshot: '', pointerId: null, startCol: -1, startRow: -1, currentCol: -1, currentRow: -1, previewCells: [] };
  state.tilemapEditor.isPointerDown = false;
  resetTileMapStrokeTracking();
  const before = session.beforeSnapshot || '';
  const after = serializeScene();
  if (before && before !== after) pushHistory('Paint TileMap', before);
  // Clear hover overlay immediately, then do a full viewport rebuild to commit painted tiles.
  clearTileHoverOverlay();
  scheduleRender(RenderFlags.VIEWPORT | (changed ? RenderFlags.TILEMAPS | RenderFlags.SCENE_SUMMARY : 0));
}

function paintSelectedTileMapWithKeyboard() {
  const node = getSelectedTileMapNode();
  if (!node || !isTileMapScenePaintModeActive()) return false;
  const shape = shapeRefs.get(node.id);
  const cell = (shape && getViewportTilePaintCell(node, shape)) || null;
  const col = (cell && cell.inside) ? cell.col : Number(state.tilemapEditor.hoverCol);
  const row = (cell && cell.inside) ? cell.row : Number(state.tilemapEditor.hoverRow);
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || row < 0) return false;
  const before = serializeScene();
  const changed = paintTileMapAt(node, col, row);
  state.tilemapEditor.hoverCol = col;
  state.tilemapEditor.hoverRow = row;
  if (changed) {
    pushHistory('Paint TileMap', before);
    scheduleRender(RenderFlags.VIEWPORT);
    renderTileMapsPanel();
    updateSceneSummary();
    setStatus(`Painted TileMap at ${col}, ${row} with P.`);
  }
  return changed;
}

// buildTileMapGroup override removed — canonical implementation at line 4523 is authoritative.

refreshAll = (function(orig){ return function(){ const out = orig.apply(this, arguments); updateTileMapToolButtons(); return out; }; })(refreshAll);


// ===== Final TileMap cleanup pass =====
function applyTileMapEditorChanges(node, changes = {}, options = {}) {
  if (!node || node.type !== 'TileMap') return null;
  const props = ensureTileMapData(node);
  if (changes.tileWidth != null) props.tileWidth = Math.max(1, Number(changes.tileWidth) || props.tileWidth || 32);
  if (changes.tileHeight != null) props.tileHeight = Math.max(1, Number(changes.tileHeight) || props.tileHeight || 32);
  syncTileMapDerivedDimensions(node);
  if (changes.showGrid != null) props.showGrid = !!changes.showGrid;
  updateTileMapPanelSummary(node);
  drawTileMapEditorCanvas(node);
  scheduleRender(RenderFlags.VIEWPORT);
  renderInspector();
  updateSceneSummary();
  if (options.refreshPanel) renderTileMapsPanel();
  return props;
}

function syncTileMapFormInputs(node) {
  if (!node || node.type !== 'TileMap') return;
  const props = ensureTileMapData(node);
  const assignValue = (el, value) => {
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = value;
  };
  if (tmMapWEl) { tmMapWEl.value = props.mapWidth; tmMapWEl.readOnly = true; tmMapWEl.disabled = true; }
  if (tmMapHEl) { tmMapHEl.value = props.mapHeight; tmMapHEl.readOnly = true; tmMapHEl.disabled = true; }
  assignValue(tmTileWEl, props.tileWidth);
  assignValue(tmTileHEl, props.tileHeight);
  if (tmShowGridEl) tmShowGridEl.checked = props.showGrid !== false;
  const activeLayer = getActiveTileMapLayer(node);
  if (tmTilesetSelectEl) tmTilesetSelectEl.value = activeLayer?.tilesetId || props.tilesetId || '';
}

function renderTileMapsPanel(options = {}) {
  updateTileMapToolButtons();
  const node = getSelectedTileMapNode();
  const terrainMode = state.tilemapEditor.paintMode === 'terrain';
  document.getElementById('tm-palette-panel')?.classList.toggle('hidden-in-terrain-mode', terrainMode);
  document.getElementById('tm-saved-brushes-sidebar')?.classList.toggle('hidden-in-terrain-mode', terrainMode);
  if (tmTilesetSelectEl) {
    tmTilesetSelectEl.innerHTML = '<option value="">No tileset</option>' + (state.tilesets || []).map((tileset) => `<option value="${tileset.id}">${tileset.name}</option>`).join('');
  }
  if (!node) {
    if (tmMetaEl) tmMetaEl.textContent = 'Select a TileMap node to edit its tiles in the active scene.';
    if (!terrainMode) renderTilePaletteGrid(tmPaletteGridEl, null, -2, () => {}, { emptyText: 'Select a TileMap node.' });
    renderTileMapTerrainPanel(null);
    return;
  }
  const props = ensureTileMapData(node);
  const activeLayer = getActiveTileMapLayer(node);
  if (activeLayer && !activeLayer.tilesetId && state.selectedTilesetId) activeLayer.tilesetId = state.selectedTilesetId;
  if (!props.tilesetId && state.selectedTilesetId) props.tilesetId = state.selectedTilesetId;
  const assigned = getTileMapAssignedTileset(node, activeLayer);
  if (assigned && !Number.isFinite(Number(state.tilemapEditor.selectedTileIndex))) state.tilemapEditor.selectedTileIndex = Math.max(0, Number(assigned.selectedTileIndex) || 0);
  if (assigned && state.tilemapEditor.selectedTileIndex < -1) state.tilemapEditor.selectedTileIndex = Math.max(0, Number(assigned.selectedTileIndex) || 0);
  syncTileMapFormInputs(node);
  refreshTileMapLayerList(node);
  if (!terrainMode) refreshSelectedTileMapTilesetUI(node);
  renderTileMapTerrainPanel(node);
  updateTileMapPanelSummary(node);
  drawTileMapEditorCanvas(node);
  if (options.viewport === true) scheduleRender(RenderFlags.VIEWPORT);
};

function debugSelectedTerrainCell(node = null) {
  const activeNode = node || getSelectedTileMapNode();
  const layer = activeNode ? getActiveTileMapLayer(activeNode) : null;
  if (!activeNode || !layer) return false;
  const col = Number.isFinite(Number(state.tilemapEditor.hoverCol)) && state.tilemapEditor.hoverCol >= 0 ? state.tilemapEditor.hoverCol : 0;
  const row = Number.isFinite(Number(state.tilemapEditor.hoverRow)) && state.tilemapEditor.hoverRow >= 0 ? state.tilemapEditor.hoverRow : 0;
  // v35.2: use solver.debugCell for a read-only structured report (no layer mutation)
  const tileset    = getTileMapAssignedTileset(activeNode);
  const terrainRef = getTileMapCellTerrainId(layer, col, row);
  const terrainSet = getTerrainSetForTerrainRef(tileset, terrainRef) || getSelectedTerrainSet(tileset);
  const solver     = window.RokuTerrainSolver;
  if (solver?.debugCell && terrainSet) {
    const report = solver.debugCell(terrainSet, layer, col, row);
    console.group(`[RGE Terrain Debug] Cell (${col}, ${row})`);
    console.log('terrainSetId:     ', report.existingDiagnostics?.terrainSetId ?? '—');
    console.log('terrainTypeId:    ', report.terrainTypeId);
    console.log('neighborSignature:', report.neighborSignature);
    console.log('matchedRuleId:    ', report.matchedRuleId ?? 'none');
    console.log('tileIndex:        ', report.tileIndex);
    console.log('transform:        ', report.transform);
    console.log('fallbackUsed:     ', report.fallbackUsed);
    if (report.fallbackReason) console.warn('fallbackReason:   ', report.fallbackReason);
    console.log('score:            ', report.score);
    console.log('candidateCount:   ', report.candidateCount);
    if ((report.top5Candidates||[]).length) {
      console.group('Top candidates (up to 5):');
      (report.top5Candidates||[]).forEach((c, i) => {
        const mark = c.matched ? '✓' : '✗';
        const fails = (c.failedChecks||[]).map((f)=>`${f.key}: ${f.reason}`).join(', ');
        console.log(`${mark} [${i+1}] rule=${c.ruleId} tile=#${c.tileIndex} q=${c.score?.quality}${fails?' fails='+fails:''}`);
      });
      console.groupEnd();
    }
    console.groupEnd();
  }
  // Apply solver so cell.terrainDiagnostics is written for the panel overlay
  applyTerrainSolverAt(activeNode, layer, col, row, { randomize: false, debug: true });
  updateTerrainDebugInfo(activeNode, layer, col, row, layer.cellData?.[row]?.[col]?.terrainDiagnostics || null);
  renderTileMapTerrainPanel(activeNode);
  scheduleRender(RenderFlags.VIEWPORT);
  return true;
}

const __finalCleanupBindSceneActions = bindSceneActions;
bindSceneActions = function() {
  __finalCleanupBindSceneActions();

  const liveResize = () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    applyTileMapEditorChanges(node, {
      tileWidth: tmTileWEl?.value,
      tileHeight: tmTileHEl?.value
    });
  };

  const commitResize = () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    applyTileMapEditorChanges(node, {
      tileWidth: tmTileWEl?.value,
      tileHeight: tmTileHEl?.value
    }, { refreshPanel: true });
  };

  ['tm-tile-w','tm-tile-h'].forEach((id) => bindOnceById(id, 'input', `${id}FinalLive`, liveResize));
  ['tm-tile-w','tm-tile-h'].forEach((id) => bindOnceById(id, 'change', `${id}FinalCommit`, commitResize));

  const gridHandler = () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    applyTileMapEditorChanges(node, { showGrid: tmShowGridEl?.checked !== false });
  };
  bindOnceById('tm-show-grid', 'input', 'tmShowGridFinalInput', gridHandler);

  bindOnceById('tm-btn-resize', 'click', 'tmResizeFinal', () => {
    const node = getSelectedTileMapNode();
    if (!node) return;
    applyTileMapEditorChanges(node, {
      tileWidth: tmTileWEl?.value,
      tileHeight: tmTileHEl?.value
    }, { refreshPanel: true });
  });
};


// ══════════════════════════════════════════════════════════════════════
// SHARED SHAPE EDITOR FACTORY  (used by both Tile Collision & Physics)
// ══════════════════════════════════════════════════════════════════════
//
// createShapeEditor(opts) returns { canvas, mount, refresh, destroy }
//
// opts = {
//   canvasId      : string | null  — if set, use existing <canvas id>
//   getShapes     : () => shape[]  — read current shapes
//   setShapes     : (shapes) => void  — write shapes + commit
//   getNodeSize   : () => {w, h}   — canvas reference dimensions in px
//   getImage      : () => {img, sx, sy, sw, sh} | null  — tile/sprite image
//   onCommit      : (label) => void  — called after every edit
//   listEl        : HTMLElement | null  — shape list container
//   countEl       : HTMLElement | null  — "N shapes" label element
//   accentColor   : string (default '#e35f5f')  — shape fill color
//   secondColor   : string (default '#7a6ff0')  — polygon color
//   extraBg       : (ctx, cw, ch) => void | null  — draw extra bg (e.g. AABB ghost)
// }


// ── Shared shape-editor micro-helpers factory ────────────────────────────────
function makeShapeEditorHelpers(getW, getH, uidPrefix) {
  function _uid() {
    return `${uidPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
  function _toNorm(px, py) {
    return { x: Math.max(0, Math.min(1, px / getW())), y: Math.max(0, Math.min(1, py / getH())) };
  }
  function _toPx(nx, ny) {
    return { x: nx * getW(), y: ny * getH() };
  }
  function _canvasXY(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  return { _uid, _toNorm, _toPx, _canvasXY };
}
// ─────────────────────────────────────────────────────────────────────────────

function createShapeEditor(opts) {
  const CANVAS_MAX  = 240;
  const HANDLE_R    = 5;
  const EDGE_HANDLE = 4;

  let _shapes    = [];
  let _selId     = null;
  let _selPtIdx  = -1;
  let _tool      = 'rect';
  let _drag      = null;
  let _poly      = null;
  let _canvas    = null;
  let _ctx       = null;
  let _cw        = 128;
  let _ch        = 128;
  let _scale     = 1;   // px per "node px" — set in refresh()
  let _nodeW     = 64;
  let _nodeH     = 64;

  const accentFill   = opts.accentColor  || '#e35f5f';
  const accentStroke = opts.accentStrokeColor || '#ff6b6b';
  const polyFill     = opts.secondColor  || '#7a6ff0';
  const polyStroke   = opts.secondStrokeColor || '#a89cff';



  // Shape-editor helpers via shared factory (see makeShapeEditorHelpers)
  const { _uid, _toNorm, _toPx, _canvasXY: _canvasXYHelper } = makeShapeEditorHelpers(() => _cw, () => _ch, 'ps');
  function _canvasXY(e) { return _canvasXYHelper(_canvas, e); }
  function _selShape()     { return _shapes.find((s) => s.id === _selId) || null; }

  function _rectHandles(s) {
    const { x:rx, y:ry } = _toPx(s.x, s.y), { x:rx2, y:ry2 } = _toPx(s.x+s.w, s.y+s.h);
    const mx = (rx+rx2)/2, my = (ry+ry2)/2;
    return [
      {kind:'corner',idx:0,px:rx, py:ry }, {kind:'corner',idx:1,px:rx2,py:ry },
      {kind:'corner',idx:2,px:rx2,py:ry2},{kind:'corner',idx:3,px:rx, py:ry2},
      {kind:'edge',  idx:4,px:mx, py:ry }, {kind:'edge',  idx:5,px:rx2,py:my },
      {kind:'edge',  idx:6,px:mx, py:ry2},{kind:'edge',  idx:7,px:rx, py:my },
    ];
  }

  function _applyRectHandle(s, idx, nx, ny, orig) {
    const ox=orig.x, oy=orig.y, ox2=ox+orig.w, oy2=oy+orig.h;
    nx=Math.max(0,Math.min(1,nx)); ny=Math.max(0,Math.min(1,ny));
    switch(idx) {
      case 0: s.x=Math.min(nx,ox2-0.01); s.y=Math.min(ny,oy2-0.01); s.w=ox2-s.x; s.h=oy2-s.y; break;
      case 1: s.y=Math.min(ny,oy2-0.01); s.w=Math.max(0.01,nx-ox);  s.h=oy2-s.y; break;
      case 2: s.w=Math.max(0.01,nx-ox);  s.h=Math.max(0.01,ny-oy);  break;
      case 3: s.x=Math.min(nx,ox2-0.01); s.w=ox2-s.x; s.h=Math.max(0.01,ny-oy); break;
      case 4: s.y=Math.min(ny,oy2-0.01); s.h=oy2-s.y; break;
      case 5: s.w=Math.max(0.01,nx-ox);  break;
      case 6: s.h=Math.max(0.01,ny-oy);  break;
      case 7: s.x=Math.min(nx,ox2-0.01); s.w=ox2-s.x; break;
    }
    s.x=Math.max(0,s.x); s.y=Math.max(0,s.y);
    s.w=Math.min(1-s.x,s.w); s.h=Math.min(1-s.y,s.h);
  }

  function _hitHandles(px, py) {
    const s = _selShape(); if (!s) return null;
    if (s.type === 'rect') {
      for (const h of _rectHandles(s)) {
        if (Math.hypot(px-h.px, py-h.py) <= HANDLE_R+2) return { type:'rect-handle', handleIdx:h.idx, kind:h.kind };
      }
    } else if (s.type === 'polygon') {
      for (let j=0; j<s.points.length; j+=2) {
        const pp = _toPx(s.points[j], s.points[j+1]);
        if (Math.hypot(px-pp.x, py-pp.y) <= HANDLE_R+2) return { type:'poly-vertex', ptIdx:j };
      }
    }
    return null;
  }

  function _hitShapeBody(nx, ny) {
    for (let i=_shapes.length-1; i>=0; i--) {
      const s=_shapes[i];
      if (s.type==='rect' && nx>=s.x && nx<=s.x+s.w && ny>=s.y && ny<=s.y+s.h) return s.id;
      if (s.type==='polygon' && s.points.length>=4) {
        let inside=false;
        for (let j=0,k=s.points.length-2; j<s.points.length; k=j,j+=2) {
          const xi=s.points[j],yi=s.points[j+1],xk=s.points[k],yk=s.points[k+1];
          if (((yi>ny)!==(yk>ny))&&(nx<(xk-xi)*(ny-yi)/(yk-yi)+xi)) inside=!inside;
        }
        if (inside) return s.id;
      }
    }
    return null;
  }

  function _draw() {
    if (!_ctx) return;
    _ctx.clearRect(0, 0, _cw, _ch);
    // Checkerboard
    const gs = Math.max(4, Math.floor(Math.min(_cw, _ch) / 16));
    for (let iy=0; iy<Math.ceil(_ch/gs); iy++) for (let ix=0; ix<Math.ceil(_cw/gs); ix++) {
      _ctx.fillStyle = (ix+iy)%2===0 ? '#1a1f2e' : '#212640';
      _ctx.fillRect(ix*gs, iy*gs, gs, gs);
    }
    // Optional extra background (e.g. AABB ghost)
    if (typeof opts.extraBg === 'function') opts.extraBg(_ctx, _cw, _ch);
    // Node image
    const imgData = typeof opts.getImage === 'function' ? opts.getImage() : null;
    if (imgData?.img) {
      _ctx.imageSmoothingEnabled = false;
      _ctx.globalAlpha = 0.8;
      _ctx.drawImage(imgData.img, imgData.sx, imgData.sy, imgData.sw, imgData.sh, 0, 0, _cw, _ch);
      _ctx.globalAlpha = 1;
    }
    // Node boundary
    _ctx.strokeStyle = 'rgba(255,255,255,0.12)'; _ctx.lineWidth=1; _ctx.setLineDash([4,3]);
    _ctx.strokeRect(0.5, 0.5, _cw-1, _ch-1); _ctx.setLineDash([]);

    // Shapes
    _shapes.forEach((s) => {
      const isSel = s.id===_selId;
      _ctx.lineWidth = isSel ? 2 : 1.5;
      if (s.type==='rect') {
        const p=_toPx(s.x,s.y), p2=_toPx(s.x+s.w,s.y+s.h);
        const sw=p2.x-p.x, sh=p2.y-p.y;
        _ctx.fillStyle   = isSel ? hexAlpha(accentFill,0.28) : hexAlpha(accentFill,0.13);
        _ctx.strokeStyle = isSel ? accentStroke : accentFill;
        _ctx.fillRect(p.x,p.y,sw,sh); _ctx.strokeRect(p.x+.5,p.y+.5,sw-1,sh-1);
        if (isSel) {
          _rectHandles(s).forEach((h) => {
            const r = h.kind==='corner' ? HANDLE_R : EDGE_HANDLE;
            _ctx.fillStyle='#fff'; _ctx.beginPath(); _ctx.arc(h.px,h.py,r,0,Math.PI*2); _ctx.fill();
            _ctx.strokeStyle=accentFill; _ctx.lineWidth=1.5; _ctx.beginPath(); _ctx.arc(h.px,h.py,r,0,Math.PI*2); _ctx.stroke();
          });
        }
      } else if (s.type==='polygon' && s.points.length>=4) {
        _ctx.fillStyle   = isSel ? hexAlpha(polyFill,0.28) : hexAlpha(polyFill,0.13);
        _ctx.strokeStyle = isSel ? polyStroke : polyFill;
        _ctx.beginPath();
        for (let j=0; j<s.points.length; j+=2) { const pp=_toPx(s.points[j],s.points[j+1]); j===0?_ctx.moveTo(pp.x,pp.y):_ctx.lineTo(pp.x,pp.y); }
        _ctx.closePath(); _ctx.fill(); _ctx.stroke();
        if (isSel) {
          for (let j=0; j<s.points.length; j+=2) {
            const pp=_toPx(s.points[j],s.points[j+1]);
            const isSP=_selPtIdx===j;
            _ctx.fillStyle=isSP?'#ffe033':'#fff'; _ctx.strokeStyle=isSP?'#ffb300':polyFill; _ctx.lineWidth=isSP?2:1.5;
            _ctx.beginPath(); _ctx.arc(pp.x,pp.y,HANDLE_R,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
            _ctx.fillStyle='#000'; _ctx.font=`bold ${Math.max(7,Math.floor(Math.min(_cw,_ch)/32))}px sans-serif`;
            _ctx.textAlign='center'; _ctx.textBaseline='middle'; _ctx.fillText(String(j/2),pp.x,pp.y);
          }
        }
      }
    });
    // In-progress polygon
    if (_poly && _poly.length>=2) {
      _ctx.strokeStyle='#ffe033'; _ctx.lineWidth=1.5; _ctx.setLineDash([4,3]);
      _ctx.beginPath();
      for (let j=0; j<_poly.length; j+=2) { const pp=_toPx(_poly[j],_poly[j+1]); j===0?_ctx.moveTo(pp.x,pp.y):_ctx.lineTo(pp.x,pp.y); }
      _ctx.stroke(); _ctx.setLineDash([]);
      for (let j=0; j<_poly.length; j+=2) { const pp=_toPx(_poly[j],_poly[j+1]); _ctx.fillStyle='#ffe033'; _ctx.beginPath(); _ctx.arc(pp.x,pp.y,3,0,Math.PI*2); _ctx.fill(); }
    }
    // Drag-rect preview
    if (_drag?.type==='new-rect' && _drag.x2!==undefined) {
      const x1=Math.min(_drag.x1,_drag.x2),y1=Math.min(_drag.y1,_drag.y2);
      const x2=Math.max(_drag.x1,_drag.x2),y2=Math.max(_drag.y1,_drag.y2);
      const p1=_toPx(x1,y1),p2=_toPx(x2,y2);
      _ctx.strokeStyle=accentStroke; _ctx.lineWidth=1.5; _ctx.setLineDash([4,3]);
      _ctx.strokeRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);
      _ctx.fillStyle=hexAlpha(accentFill,0.12); _ctx.fillRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);
      _ctx.setLineDash([]);
    }
  }

  function hexAlpha(hex, alpha) {
    // Convert '#rrggbb' to 'rgba(r,g,b,alpha)'
    const r=parseInt(hex.slice(1,3),16)||0, g=parseInt(hex.slice(3,5),16)||0, b=parseInt(hex.slice(5,7),16)||0;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function _commit(label) {
    opts.setShapes(_shapes.map((s) => s.type==='polygon' ? {...s,points:[...s.points]} : {...s}));
    opts.onCommit(label || 'Edit physics shape');
    _renderShapeList();
  }

  // ── shape list (same expandable-row design as TileCollisionEditor) ─
  function _renderShapeList() {
    const listEl  = opts.listEl;
    const countEl = opts.countEl;
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${_shapes.length} shape${_shapes.length===1?'':'s'}`;

    _shapes.forEach((s, i) => {
      const isActive = s.id===_selId;
      const wrap = document.createElement('div');
      wrap.className = 'tcs-shape-wrap' + (isActive?' active':'');

      const icon = s.type==='rect' ? '▭' : '⬠';
      const hdr  = document.createElement('div'); hdr.className='tcs-shape-row';
      const ico  = document.createElement('span'); ico.className='tcs-shape-icon'; ico.textContent=icon;
      const nm   = document.createElement('span'); nm.className='tcs-shape-name';
      nm.textContent = `${i+1}. ${s.type==='rect'?'Rect':`Polygon (${s.points.length/2} pts)`}`;

      const acts = document.createElement('span'); acts.className='tcs-shape-actions';
      acts.append(
        _mkBtn('↑','Move up',()=>{ if(i===0)return; [_shapes[i-1],_shapes[i]]=[_shapes[i],_shapes[i-1]]; _commit('Reorder shape'); _draw(); }),
        _mkBtn('↓','Move down',()=>{ if(i===_shapes.length-1)return; [_shapes[i],_shapes[i+1]]=[_shapes[i+1],_shapes[i]]; _commit('Reorder shape'); _draw(); }),
        _mkBtn('⧉','Duplicate',()=>{
          const copy=JSON.parse(JSON.stringify(s)); copy.id=_uid();
          if(copy.type==='rect'){copy.x=Math.min(0.95,copy.x+0.03);copy.y=Math.min(0.95,copy.y+0.03);}
          _shapes.splice(i+1,0,copy); _selId=copy.id; _commit('Duplicate shape'); _draw();
        }),
        Object.assign(_mkBtn('✕','Delete shape',()=>{
          _shapes=_shapes.filter((sh)=>sh.id!==s.id);
          if(_selId===s.id){_selId=null;_selPtIdx=-1;}
          _commit('Delete shape'); _draw();
        }),{className:'tcs-action-btn danger'})
      );
      hdr.append(ico,nm,acts);
      hdr.addEventListener('click',(e)=>{ if(e.target.closest('button'))return; _selId=s.id;_selPtIdx=-1; _draw();_renderShapeList(); });
      wrap.appendChild(hdr);

      if (isActive) {
        const ed=document.createElement('div'); ed.className='tcs-shape-editor';
        ed.appendChild(s.type==='rect'?_buildRectEditor(s):_buildPolyEditor(s));
        wrap.appendChild(ed);
      }
      listEl.appendChild(wrap);
    });
  }

  function _mkBtn(text,title,onClick) {
    const b=document.createElement('button');
    b.type='button'; b.className='tcs-action-btn'; b.title=title; b.textContent=text;
    b.addEventListener('click',(e)=>{e.stopPropagation();onClick();}); return b;
  }

  function _buildRectEditor(s) {
    const grid=document.createElement('div'); grid.className='tcs-rect-grid';
    [{label:'X',key:'x'},{label:'Y',key:'y'},{label:'W',key:'w'},{label:'H',key:'h'}].forEach(({label,key})=>{
      const lbl=document.createElement('label'); lbl.className='tcs-field';
      const sp=document.createElement('span'); sp.textContent=label;
      const inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.max='100'; inp.step='1'; inp.value=Math.round(s[key]*100);
      inp.addEventListener('input',()=>{ s[key]=Math.max(0,Math.min(100,Number(inp.value)||0))/100; _draw(); });
      inp.addEventListener('change',()=>_commit('Edit rect'));
      lbl.append(sp,inp); grid.appendChild(lbl);
    });
    const note=document.createElement('div'); note.className='tcs-field-note'; note.textContent='Values 0–100% of node size'; grid.appendChild(note);
    return grid;
  }

  function _buildPolyEditor(s) {
    const wrap=document.createElement('div'); wrap.className='tcs-poly-editor';
    const hdr=document.createElement('div'); hdr.className='tcs-poly-header';
    hdr.appendChild(_mkBtn('+ Point','Add point at center',()=>{
      s.points.push(0.5,0.5); _selPtIdx=s.points.length-2; _commit('Add polygon point'); _draw();
    }));
    wrap.appendChild(hdr);
    const ptList=document.createElement('div'); ptList.className='tcs-pt-list';
    for (let j=0; j<s.points.length; j+=2) {
      const ptIdx=j;
      const row=document.createElement('div'); row.className='tcs-pt-row'+(_selPtIdx===ptIdx?' active':'');
      const idx=document.createElement('span'); idx.className='tcs-pt-idx'; idx.textContent=String(ptIdx/2);
      const xI=_numInput(Math.round(s.points[ptIdx]*100),0,100,(v)=>{s.points[ptIdx]=v/100;_draw();},()=>_commit('Edit vertex'));
      const yI=_numInput(Math.round(s.points[ptIdx+1]*100),0,100,(v)=>{s.points[ptIdx+1]=v/100;_draw();},()=>_commit('Edit vertex'));
      const selB=_mkBtn('●','Select on canvas',()=>{_selPtIdx=ptIdx;_draw();_renderShapeList();});
      const delB=Object.assign(_mkBtn('✕','Delete point',()=>{
        if(s.points.length<=6){if(typeof setStatus==='function')setStatus('Polygon needs at least 3 points.');return;}
        s.points.splice(ptIdx,2); if(_selPtIdx>=s.points.length)_selPtIdx=s.points.length-2;
        _commit('Delete polygon point'); _draw();
      }),{className:'tcs-action-btn danger'});
      row.append(idx,xI,yI,selB,delB);
      row.addEventListener('click',(e)=>{if(e.target.closest('button')||e.target.tagName==='INPUT')return; _selPtIdx=ptIdx;_draw();_renderShapeList();});
      ptList.appendChild(row);
    }
    const note=document.createElement('div'); note.className='tcs-field-note'; note.textContent='X / Y in % of node size. Drag on canvas.';
    wrap.append(ptList,note); return wrap;
  }

  function _numInput(value,min,max,onInput,onChange) {
    const inp=document.createElement('input');
    inp.type='number'; inp.className='tcs-num'; inp.min=String(min); inp.max=String(max); inp.step='1'; inp.value=String(value);
    inp.addEventListener('input',()=>onInput(Math.max(min,Math.min(max,Number(inp.value)||0))));
    inp.addEventListener('change',onChange); return inp;
  }

  // ── tool switching ─────────────────────────────────────────────────
  function setTool(name, toolBtns) {
    _tool=name; _poly=null; _selPtIdx=-1;
    if (toolBtns) toolBtns.forEach((btn)=>btn.classList.toggle('active', btn.dataset.tool===name));
    if (_canvas) _canvas.style.cursor = name==='select'?'default':'crosshair';
    _draw();
  }

  // ── pointer handlers ───────────────────────────────────────────────
  function _onPointerDown(e) {
    if (e.button!==0) return;
    const {x,y}=_canvasXY(e), n=_toNorm(x,y);
    if (_tool==='select') {
      const hh=_hitHandles(x,y);
      if (hh) {
        const s=_selShape(); if(!s) return;
        if (hh.type==='rect-handle') _drag={type:'rect-handle',handleIdx:hh.handleIdx,origShape:JSON.parse(JSON.stringify(s))};
        else if (hh.type==='poly-vertex') { _selPtIdx=hh.ptIdx; _drag={type:'poly-vertex',ptIdx:hh.ptIdx,origShape:JSON.parse(JSON.stringify(s))}; _renderShapeList(); }
        _canvas.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      const hit=_hitShapeBody(n.x,n.y);
      if (hit) { _selId=hit; _selPtIdx=-1; const s=_selShape(); _drag={type:'move',origShape:JSON.parse(JSON.stringify(s)),startX:n.x,startY:n.y}; _canvas.setPointerCapture(e.pointerId); }
      else { _selId=null; _selPtIdx=-1; }
      _draw(); _renderShapeList(); e.preventDefault(); return;
    }
    if (_tool==='rect') { _drag={type:'new-rect',x1:n.x,y1:n.y}; _canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (_tool==='polygon') { if(!_poly)_poly=[]; _poly.push(n.x,n.y); _draw(); }
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const {x,y}=_canvasXY(e), n=_toNorm(x,y);
    const s=_selShape();
    if (_drag.type==='new-rect') { _drag.x2=n.x; _drag.y2=n.y; }
    else if (_drag.type==='move' && s) {
      const dx=n.x-_drag.startX, dy=n.y-_drag.startY, orig=_drag.origShape;
      if (s.type==='rect') { s.x=Math.max(0,Math.min(1-s.w,orig.x+dx)); s.y=Math.max(0,Math.min(1-s.h,orig.y+dy)); }
      else if (s.type==='polygon') { const ops=orig.points; s.points=ops.map((v,i)=>i%2===0?Math.max(0,Math.min(1,v+dx)):Math.max(0,Math.min(1,v+dy))); }
    } else if (_drag.type==='rect-handle' && s) { _applyRectHandle(s,_drag.handleIdx,n.x,n.y,_drag.origShape); }
    else if (_drag.type==='poly-vertex' && s) {
      const pi=_drag.ptIdx;
      s.points[pi]=Math.max(0,Math.min(1,n.x)); s.points[pi+1]=Math.max(0,Math.min(1,n.y));
      // live-update inputs
      const rows=opts.listEl?.querySelectorAll('.tcs-pt-row');
      if (rows?.[pi/2]) { const ins=rows[pi/2].querySelectorAll('input'); if(ins[0])ins[0].value=Math.round(s.points[pi]*100); if(ins[1])ins[1].value=Math.round(s.points[pi+1]*100); }
    }
    _draw();
  }

  function _onPointerUp() {
    if (!_drag) return;
    const d=_drag; _drag=null;
    if (d.type==='new-rect'&&d.x2!==undefined) {
      const x1=Math.min(d.x1,d.x2),y1=Math.min(d.y1,d.y2),w=Math.abs(d.x2-d.x1),h=Math.abs(d.y2-d.y1);
      if (w>0.02&&h>0.02) { const s={id:_uid(),type:'rect',x:x1,y:y1,w,h}; _shapes.push(s);_selId=s.id; _commit('Add rect'); }
    } else if (d.type==='move') { _commit('Move shape'); }
    else if (d.type==='rect-handle') { _commit('Resize rect'); }
    else if (d.type==='poly-vertex') { _commit('Move vertex'); }
    _draw();
  }

  function _onDblClick() {
    if (_tool!=='polygon'||!_poly||_poly.length<6) return;
    _shapes.push({id:_uid(),type:'polygon',points:_poly.slice(0,-2)}); _selId=_shapes[_shapes.length-1].id;
    _poly=null; _commit('Add polygon'); _draw();
  }

  function _onRightClick(e) {
    e.preventDefault(); if (_tool!=='select') return;
    const {x,y}=_canvasXY(e), n=_toNorm(x,y);
    const s=_selShape(); if(!s||s.type!=='polygon') return;
    for (let j=0;j<s.points.length;j+=2) {
      const pp=_toPx(s.points[j],s.points[j+1]);
      if (Math.hypot(x-pp.x,y-pp.y)<=HANDLE_R+3) {
        if (s.points.length<=6){if(typeof setStatus==='function')setStatus('Polygon needs at least 3 points.');return;}
        s.points.splice(j,2); if(_selPtIdx>=s.points.length)_selPtIdx=s.points.length-2;
        _commit('Delete vertex'); _draw(); return;
      }
    }
    for (let j=0;j<s.points.length;j+=2) {
      const nj=(j+2)%s.points.length;
      const ax=s.points[j],ay=s.points[j+1],bx=s.points[nj],by=s.points[nj+1];
      const pa=_toPx(ax,ay),pb=_toPx(bx,by);
      const edx=pb.x-pa.x,edy=pb.y-pa.y;
      const t=Math.max(0,Math.min(1,((x-pa.x)*edx+(y-pa.y)*edy)/((edx*edx+edy*edy)||1)));
      const cx2=pa.x+t*edx,cy2=pa.y+t*edy;
      if (Math.hypot(x-cx2,y-cy2)<=EDGE_HANDLE+2) {
        s.points.splice(nj,0,n.x,n.y); _selPtIdx=nj; _commit('Insert vertex'); _draw(); return;
      }
    }
  }

  // ── public mount on a canvas element ──────────────────────────────
  function mount(canvasEl) {
    _canvas=canvasEl; _ctx=_canvas.getContext('2d');
    _canvas.addEventListener('pointerdown',  _onPointerDown);
    _canvas.addEventListener('pointermove',  _onPointerMove);
    _canvas.addEventListener('pointerup',    _onPointerUp);
    _canvas.addEventListener('dblclick',     _onDblClick);
    _canvas.addEventListener('contextmenu',  _onRightClick);
  }

  // ── refresh from current state ─────────────────────────────────────
  function refresh() {
    const sz = typeof opts.getNodeSize==='function' ? opts.getNodeSize() : {w:64,h:64};
    _nodeW=Math.max(4,sz.w); _nodeH=Math.max(4,sz.h);
    _scale=Math.max(1,Math.floor(Math.min(CANVAS_MAX/_nodeW, CANVAS_MAX/_nodeH)));
    _cw=_nodeW*_scale; _ch=_nodeH*_scale;
    if (_canvas) { _canvas.width=_cw; _canvas.height=_ch; }
    _shapes=(typeof opts.getShapes==='function'?opts.getShapes():[]).map((s)=>s.type==='polygon'?{...s,points:[...s.points]}:{...s});
    _selId=null; _selPtIdx=-1; _poly=null; _drag=null;
    _renderShapeList(); _draw();
  }

  function destroy() {
    if (_canvas) {
      _canvas.removeEventListener('pointerdown',  _onPointerDown);
      _canvas.removeEventListener('pointermove',  _onPointerMove);
      _canvas.removeEventListener('pointerup',    _onPointerUp);
      _canvas.removeEventListener('dblclick',     _onDblClick);
      _canvas.removeEventListener('contextmenu',  _onRightClick);
    }
    _canvas=null; _ctx=null;
  }

  return { mount, refresh, destroy, setTool, draw:_draw, renderShapeList:_renderShapeList };
}


// ══════════════════════════════════════════════════════════════════════
// TILE COLLISION SHAPE EDITOR  (tcs-*)
// ══════════════════════════════════════════════════════════════════════
//
// Shapes stored normalized [0..1] relative to tile dimensions.
//   meta.collisionShapes = [
//     { id, type:'rect',    x, y, w, h },
//     { id, type:'polygon', points:[x0,y0,x1,y1,…] }
//   ]

const TileCollisionEditor = (() => {

  // ── state ─────────────────────────────────────────────────────────
  let _tileset   = null;
  let _tileIndex = -1;
  let _shapes    = [];
  let _selId     = null;   // selected shape id
  let _selPtIdx  = -1;     // selected vertex index (-1 = none)
  let _tool      = 'rect'; // 'rect' | 'polygon' | 'select'
  let _drag      = null;
  let _poly      = null;   // in-progress polygon [x,y,…]
  let _canvas    = null;
  let _ctx       = null;
  let _tileW     = 32;
  let _tileH     = 32;
  let _scale     = 4;
  const CANVAS_MAX  = 240;
  const HANDLE_R    = 5;   // px radius for vertex/corner handles
  const EDGE_HANDLE = 4;   // px radius for edge-midpoint handles

  // ── helpers ───────────────────────────────────────────────────────
  // Shape-editor helpers via shared factory (see makeShapeEditorHelpers)
  const { _uid, _toNorm, _toPx, _canvasXY: _canvasXYHelper } = makeShapeEditorHelpers(() => _tileW * _scale, () => _tileH * _scale, 'cs');
  function _canvasXY(e) { return _canvasXYHelper(_canvas, e); }
  function _snap(v) { return Math.round(v * _tileW) / _tileW; } // snap to pixel grid

  function _selShape() { return _shapes.find((s) => s.id === _selId) || null; }

  // ── rect corner/edge handles in canvas-px ─────────────────────────
  // Returns [{kind, idx, px, py}]
  function _rectHandles(s) {
    const { x: rx, y: ry } = _toPx(s.x, s.y);
    const { x: rx2, y: ry2 } = _toPx(s.x + s.w, s.y + s.h);
    const mx = (rx + rx2) / 2, my = (ry + ry2) / 2;
    return [
      { kind:'corner', idx:0, px:rx,  py:ry  },  // TL
      { kind:'corner', idx:1, px:rx2, py:ry  },  // TR
      { kind:'corner', idx:2, px:rx2, py:ry2 },  // BR
      { kind:'corner', idx:3, px:rx,  py:ry2 },  // BL
      { kind:'edge',   idx:4, px:mx,  py:ry  },  // T
      { kind:'edge',   idx:5, px:rx2, py:my  },  // R
      { kind:'edge',   idx:6, px:mx,  py:ry2 },  // B
      { kind:'edge',   idx:7, px:rx,  py:my  },  // L
    ];
  }

  // ── hit test ──────────────────────────────────────────────────────
  function _hitHandles(px, py) {
    const s = _selShape();
    if (!s) return null;
    if (s.type === 'rect') {
      for (const h of _rectHandles(s)) {
        if (Math.hypot(px - h.px, py - h.py) <= HANDLE_R + 2) return { type:'rect-handle', handleIdx:h.idx, kind:h.kind };
      }
    } else if (s.type === 'polygon') {
      for (let j = 0; j < s.points.length; j += 2) {
        const pp = _toPx(s.points[j], s.points[j+1]);
        if (Math.hypot(px - pp.x, py - pp.y) <= HANDLE_R + 2) return { type:'poly-vertex', ptIdx: j };
      }
    }
    return null;
  }

  function _hitShapeBody(nx, ny) {
    for (let i = _shapes.length - 1; i >= 0; i--) {
      const s = _shapes[i];
      if (s.type === 'rect') {
        if (nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h) return s.id;
      } else if (s.type === 'polygon' && s.points.length >= 4) {
        let inside = false;
        for (let j = 0, k = s.points.length - 2; j < s.points.length; k = j, j += 2) {
          const xi = s.points[j], yi = s.points[j+1], xk = s.points[k], yk = s.points[k+1];
          if (((yi > ny) !== (yk > ny)) && (nx < (xk - xi) * (ny - yi) / (yk - yi) + xi)) inside = !inside;
        }
        if (inside) return s.id;
      }
    }
    return null;
  }

  // ── apply rect handle drag ────────────────────────────────────────
  function _applyRectHandle(s, handleIdx, nx, ny, orig) {
    const ox = orig.x, oy = orig.y, ow = orig.w, oh = orig.h;
    const ox2 = ox + ow, oy2 = oy + oh;
    nx = Math.max(0, Math.min(1, nx)); ny = Math.max(0, Math.min(1, ny));
    switch (handleIdx) {
      case 0: s.x = Math.min(nx, ox2 - 0.01); s.y = Math.min(ny, oy2 - 0.01); s.w = ox2 - s.x; s.h = oy2 - s.y; break; // TL
      case 1: s.y = Math.min(ny, oy2 - 0.01); s.w = Math.max(0.01, nx - ox);  s.h = oy2 - s.y; break; // TR
      case 2: s.w = Math.max(0.01, nx - ox);  s.h = Math.max(0.01, ny - oy);  break; // BR
      case 3: s.x = Math.min(nx, ox2 - 0.01); s.w = ox2 - s.x; s.h = Math.max(0.01, ny - oy); break; // BL
      case 4: s.y = Math.min(ny, oy2 - 0.01); s.h = oy2 - s.y; break; // T edge
      case 5: s.w = Math.max(0.01, nx - ox);  break; // R edge
      case 6: s.h = Math.max(0.01, ny - oy);  break; // B edge
      case 7: s.x = Math.min(nx, ox2 - 0.01); s.w = ox2 - s.x; break; // L edge
    }
    // Clamp to [0..1]
    s.x = Math.max(0, s.x); s.y = Math.max(0, s.y);
    s.w = Math.min(1 - s.x, s.w); s.h = Math.min(1 - s.y, s.h);
  }

  // ── draw ──────────────────────────────────────────────────────────
  function _draw() {
    if (!_ctx) return;
    const cw = _tileW * _scale, ch = _tileH * _scale;
    _ctx.clearRect(0, 0, cw, ch);

    // Checkerboard
    for (let iy = 0; iy < _tileH; iy++) for (let ix = 0; ix < _tileW; ix++) {
      _ctx.fillStyle = (ix + iy) % 2 === 0 ? '#1a1f2e' : '#222840';
      _ctx.fillRect(ix * _scale, iy * _scale, _scale, _scale);
    }

    // Tile image
    if (_tileset) {
      const sheet = window._rgeGetSheetById?.(_tileset.spriteSheetId);
      if (sheet?.image) {
        const ps = window._rgeMakeTilesetSheet?.(sheet, _tileset);
        const rect = ps ? window._rgeGetTileRect?.(ps, _tileIndex) : null;
        if (rect) { _ctx.imageSmoothingEnabled = false; _ctx.globalAlpha = 0.85; _ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, 0, 0, cw, ch); _ctx.globalAlpha = 1; }
      }
    }

    // Pixel grid
    _ctx.strokeStyle = 'rgba(255,255,255,0.06)'; _ctx.lineWidth = 0.5;
    for (let ix = 0; ix <= _tileW; ix++) { _ctx.beginPath(); _ctx.moveTo(ix * _scale, 0); _ctx.lineTo(ix * _scale, ch); _ctx.stroke(); }
    for (let iy = 0; iy <= _tileH; iy++) { _ctx.beginPath(); _ctx.moveTo(0, iy * _scale); _ctx.lineTo(cw, iy * _scale); _ctx.stroke(); }

    // Shapes
    _shapes.forEach((s) => {
      const isSel = s.id === _selId;
      _ctx.lineWidth = isSel ? 2 : 1.5;
      if (s.type === 'rect') {
        const p = _toPx(s.x, s.y), p2 = _toPx(s.x + s.w, s.y + s.h);
        const sw = p2.x - p.x, sh = p2.y - p.y;
        _ctx.fillStyle = isSel ? 'rgba(227,95,95,0.28)' : 'rgba(227,95,95,0.13)';
        _ctx.strokeStyle = isSel ? '#ff6b6b' : '#e35f5f';
        _ctx.fillRect(p.x, p.y, sw, sh); _ctx.strokeRect(p.x + .5, p.y + .5, sw - 1, sh - 1);
        if (isSel) {
          _rectHandles(s).forEach((h) => {
            const r = h.kind === 'corner' ? HANDLE_R : EDGE_HANDLE;
            _ctx.fillStyle = '#fff'; _ctx.beginPath(); _ctx.arc(h.px, h.py, r, 0, Math.PI*2); _ctx.fill();
            _ctx.strokeStyle = '#e35f5f'; _ctx.lineWidth = 1.5; _ctx.beginPath(); _ctx.arc(h.px, h.py, r, 0, Math.PI*2); _ctx.stroke();
          });
        }
      } else if (s.type === 'polygon' && s.points.length >= 4) {
        _ctx.fillStyle = isSel ? 'rgba(122,111,240,0.28)' : 'rgba(122,111,240,0.13)';
        _ctx.strokeStyle = isSel ? '#a89cff' : '#7a6ff0';
        _ctx.beginPath();
        for (let j = 0; j < s.points.length; j += 2) { const pp = _toPx(s.points[j], s.points[j+1]); j === 0 ? _ctx.moveTo(pp.x, pp.y) : _ctx.lineTo(pp.x, pp.y); }
        _ctx.closePath(); _ctx.fill(); _ctx.stroke();
        if (isSel) {
          for (let j = 0; j < s.points.length; j += 2) {
            const pp = _toPx(s.points[j], s.points[j+1]);
            const isSelPt = _selPtIdx === j;
            _ctx.fillStyle = isSelPt ? '#ffe033' : '#fff';
            _ctx.strokeStyle = isSelPt ? '#ffb300' : '#7a6ff0';
            _ctx.lineWidth = isSelPt ? 2 : 1.5;
            _ctx.beginPath(); _ctx.arc(pp.x, pp.y, HANDLE_R, 0, Math.PI*2); _ctx.fill(); _ctx.stroke();
            // Point index label
            _ctx.fillStyle = '#000'; _ctx.font = `bold ${Math.max(7, _scale - 1)}px sans-serif`;
            _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
            _ctx.fillText(String(j/2), pp.x, pp.y);
          }
        }
      }
    });

    // In-progress polygon
    if (_poly && _poly.length >= 2) {
      _ctx.strokeStyle = '#ffe033'; _ctx.lineWidth = 1.5; _ctx.setLineDash([4, 3]);
      _ctx.beginPath();
      for (let j = 0; j < _poly.length; j += 2) { const pp = _toPx(_poly[j], _poly[j+1]); j === 0 ? _ctx.moveTo(pp.x, pp.y) : _ctx.lineTo(pp.x, pp.y); }
      _ctx.stroke(); _ctx.setLineDash([]);
      for (let j = 0; j < _poly.length; j += 2) { const pp = _toPx(_poly[j], _poly[j+1]); _ctx.fillStyle = '#ffe033'; _ctx.beginPath(); _ctx.arc(pp.x, pp.y, 3, 0, Math.PI*2); _ctx.fill(); }
    }

    // Drag-rect preview
    if (_drag?.type === 'new-rect' && _drag.x2 !== undefined) {
      const x1 = Math.min(_drag.x1, _drag.x2), y1 = Math.min(_drag.y1, _drag.y2);
      const x2 = Math.max(_drag.x1, _drag.x2), y2 = Math.max(_drag.y1, _drag.y2);
      const p1 = _toPx(x1, y1), p2 = _toPx(x2, y2);
      _ctx.strokeStyle = '#ff6b6b'; _ctx.lineWidth = 1.5; _ctx.setLineDash([4, 3]);
      _ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      _ctx.fillStyle = 'rgba(227,95,95,0.12)'; _ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      _ctx.setLineDash([]);
    }
  }

  // ── commit to tileset metadata ────────────────────────────────────
  function _commit(label = 'Edit collision shape') {
    if (!_tileset || _tileIndex < 0) return;
    const meta = ensureTilesetTileMetadata(_tileset, _tileIndex);
    if (!meta) return;
    meta.collisionShapes = _shapes.map((s) => s.type === 'polygon'
      ? { id: s.id, type:'polygon', points:[...s.points] }
      : { id: s.id, type:'rect', x: s.x, y: s.y, w: s.w, h: s.h });
    meta.collision = _shapes.length > 0 || document.getElementById('ts-meta-collision')?.checked === true;
    syncTilesetsToSceneState();
    const before = state.history.undo[state.history.undo.length - 1] || serializeScene();
    pushHistory(label, before);
    _renderShapeList();
    updateTilesetSheetPaletteHighlights(document.getElementById('ts-palette-grid'), _tileset, _tileset.selectedTileIndex ?? 0);
    scheduleRender(RenderFlags.VIEWPORT);
  }

  // ── shape list: expandable rows with inline point editors ─────────
  function _renderShapeList() {
    const listEl  = document.getElementById('tcs-shape-list');
    const countEl = document.getElementById('tcs-shape-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${_shapes.length} shape${_shapes.length === 1 ? '' : 's'}`;

    _shapes.forEach((s, i) => {
      const isActive = s.id === _selId;
      const wrap = document.createElement('div');
      wrap.className = 'tcs-shape-wrap' + (isActive ? ' active' : '');
      wrap.dataset.shapeId = s.id;

      // ── row header ────────────────────────────────────────────────
      const icon = s.type === 'rect' ? '▭' : '⬠';
      const hdr = document.createElement('div');
      hdr.className = 'tcs-shape-row';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tcs-shape-icon';
      labelSpan.textContent = icon;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tcs-shape-name';
      nameSpan.textContent = `${i + 1}. ${s.type === 'rect' ? 'Rect' : `Polygon (${s.points.length/2} pts)`}`;

      const actions = document.createElement('span');
      actions.className = 'tcs-shape-actions';

      // Up
      const upBtn = _mkBtn('↑', 'Move up', () => {
        if (i === 0) return;
        [_shapes[i-1], _shapes[i]] = [_shapes[i], _shapes[i-1]];
        _commit('Reorder shape'); _draw();
      });
      // Down
      const dnBtn = _mkBtn('↓', 'Move down', () => {
        if (i === _shapes.length - 1) return;
        [_shapes[i], _shapes[i+1]] = [_shapes[i+1], _shapes[i]];
        _commit('Reorder shape'); _draw();
      });
      // Duplicate
      const dupBtn = _mkBtn('⧉', 'Duplicate', () => {
        const copy = JSON.parse(JSON.stringify(s));
        copy.id = _uid();
        if (copy.type === 'rect') { copy.x = Math.min(0.95, copy.x + 0.03); copy.y = Math.min(0.95, copy.y + 0.03); }
        _shapes.splice(i + 1, 0, copy); _selId = copy.id;
        _commit('Duplicate shape'); _draw();
      });
      // Delete
      const delBtn = _mkBtn('✕', 'Delete shape', () => {
        _shapes = _shapes.filter((sh) => sh.id !== s.id);
        if (_selId === s.id) { _selId = null; _selPtIdx = -1; }
        _commit('Delete shape'); _draw();
      });
      delBtn.className += ' danger';

      actions.append(upBtn, dnBtn, dupBtn, delBtn);
      hdr.append(labelSpan, nameSpan, actions);

      // Clicking the row header selects and expands
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        _selId = s.id; _selPtIdx = -1;
        _draw(); _renderShapeList();
      });
      wrap.appendChild(hdr);

      // ── inline editor (only shown when selected) ──────────────────
      if (isActive) {
        const editor = document.createElement('div');
        editor.className = 'tcs-shape-editor';

        if (s.type === 'rect') {
          editor.appendChild(_buildRectEditor(s));
        } else {
          editor.appendChild(_buildPolyEditor(s));
        }
        wrap.appendChild(editor);
      }

      listEl.appendChild(wrap);
    });
  }

  // ── helper: small action button ───────────────────────────────────
  function _mkBtn(text, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tcs-action-btn'; b.title = title; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  // ── rect inline editor ────────────────────────────────────────────
  function _buildRectEditor(s) {
    const grid = document.createElement('div');
    grid.className = 'tcs-rect-grid';

    const fields = [
      { label: 'X', key: 'x' }, { label: 'Y', key: 'y' },
      { label: 'W', key: 'w' }, { label: 'H', key: 'h' },
    ];
    fields.forEach(({ label, key }) => {
      const lbl = document.createElement('label');
      lbl.className = 'tcs-field';
      const span = document.createElement('span'); span.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1';
      inp.value = Math.round(s[key] * 100);
      inp.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, Number(inp.value) || 0)) / 100;
        s[key] = v;
        _draw();
      });
      inp.addEventListener('change', () => _commit('Edit rect'));
      lbl.append(span, inp); grid.appendChild(lbl);
    });

    const note = document.createElement('div');
    note.className = 'tcs-field-note'; note.textContent = 'Values 0–100% of tile size';
    grid.appendChild(note);
    return grid;
  }

  // ── polygon inline editor ─────────────────────────────────────────
  function _buildPolyEditor(s) {
    const wrap = document.createElement('div');
    wrap.className = 'tcs-poly-editor';

    const header = document.createElement('div');
    header.className = 'tcs-poly-header';
    const addBtn = _mkBtn('+ Point', 'Add point at center', () => {
      s.points.push(0.5, 0.5); _selPtIdx = s.points.length - 2;
      _commit('Add polygon point'); _draw();
    });
    header.appendChild(addBtn);
    wrap.appendChild(header);

    const ptList = document.createElement('div');
    ptList.className = 'tcs-pt-list';

    for (let j = 0; j < s.points.length; j += 2) {
      const ptIdx = j;
      const row = document.createElement('div');
      row.className = 'tcs-pt-row' + (_selPtIdx === ptIdx ? ' active' : '');

      const idxLabel = document.createElement('span');
      idxLabel.className = 'tcs-pt-idx'; idxLabel.textContent = String(ptIdx/2);

      const xInp = _numInput(Math.round(s.points[ptIdx] * 100), 0, 100, (v) => {
        s.points[ptIdx] = v / 100; _draw();
      }, () => _commit('Edit polygon point'));

      const yInp = _numInput(Math.round(s.points[ptIdx+1] * 100), 0, 100, (v) => {
        s.points[ptIdx+1] = v / 100; _draw();
      }, () => _commit('Edit polygon point'));

      const selBtn = _mkBtn('●', 'Select on canvas', () => {
        _selPtIdx = ptIdx; _draw(); _renderShapeList();
      });

      const delPtBtn = _mkBtn('✕', 'Delete point', () => {
        if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
        s.points.splice(ptIdx, 2);
        if (_selPtIdx >= s.points.length) _selPtIdx = s.points.length - 2;
        _commit('Delete polygon point'); _draw();
      });
      delPtBtn.className += ' danger';

      row.append(idxLabel, xInp, yInp, selBtn, delPtBtn);
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
        _selPtIdx = ptIdx; _draw(); _renderShapeList();
      });
      ptList.appendChild(row);
    }

    const note = document.createElement('div');
    note.className = 'tcs-field-note'; note.textContent = 'X / Y in % of tile. Drag vertices on canvas.';
    wrap.append(ptList, note);
    return wrap;
  }

  function _numInput(value, min, max, onInput, onChange) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'tcs-num'; inp.min = String(min); inp.max = String(max); inp.step = '1'; inp.value = String(value);
    inp.addEventListener('input', () => onInput(Math.max(min, Math.min(max, Number(inp.value) || 0))));
    inp.addEventListener('change', onChange);
    return inp;
  }

  // ── tool switching ────────────────────────────────────────────────
  function setTool(name) {
    _tool = name; _poly = null; _selPtIdx = -1;
    ['rect','polygon','select'].forEach((t) => {
      const btn = document.getElementById(`tcs-tool-${t}`);
      if (btn) btn.classList.toggle('active', t === name);
    });
    if (_canvas) _canvas.style.cursor = name === 'select' ? 'default' : 'crosshair';
    _draw();
  }

  // ── pointer events ────────────────────────────────────────────────
  function _onPointerDown(e) {
    if (e.button !== 0 || _tileIndex < 0) return;
    const { x, y } = _canvasXY(e);
    const n = _toNorm(x, y);

    if (_tool === 'select') {
      // First check handles of the selected shape
      const handleHit = _hitHandles(x, y);
      if (handleHit) {
        const s = _selShape();
        if (!s) return;
        if (handleHit.type === 'rect-handle') {
          _drag = { type:'rect-handle', handleIdx: handleHit.handleIdx, origShape: JSON.parse(JSON.stringify(s)) };
        } else if (handleHit.type === 'poly-vertex') {
          _selPtIdx = handleHit.ptIdx;
          _drag = { type:'poly-vertex', ptIdx: handleHit.ptIdx, origShape: JSON.parse(JSON.stringify(s)) };
          _renderShapeList();
        }
        _canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      // Check shape body
      const hit = _hitShapeBody(n.x, n.y);
      if (hit) {
        _selId = hit; _selPtIdx = -1;
        const s = _selShape();
        _drag = { type:'move', origShape: JSON.parse(JSON.stringify(s)), startX: n.x, startY: n.y };
        _canvas.setPointerCapture(e.pointerId);
        _draw(); _renderShapeList();
      } else {
        _selId = null; _selPtIdx = -1;
        _draw(); _renderShapeList();
      }
      e.preventDefault();
      return;
    }

    if (_tool === 'rect') {
      _drag = { type:'new-rect', x1: n.x, y1: n.y };
      _canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (_tool === 'polygon') {
      if (!_poly) _poly = [];
      _poly.push(n.x, n.y);
      _draw();
    }
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const { x, y } = _canvasXY(e);
    const n = _toNorm(x, y);
    const s = _selShape();
    if (!s) return;

    if (_drag.type === 'new-rect') {
      _drag.x2 = n.x; _drag.y2 = n.y;
    } else if (_drag.type === 'move') {
      const dx = n.x - _drag.startX, dy = n.y - _drag.startY;
      const orig = _drag.origShape;
      if (s.type === 'rect') {
        s.x = Math.max(0, Math.min(1 - s.w, orig.x + dx));
        s.y = Math.max(0, Math.min(1 - s.h, orig.y + dy));
      } else if (s.type === 'polygon') {
        const ops = orig.points;
        s.points = ops.map((v, i) => i % 2 === 0 ? Math.max(0, Math.min(1, v + dx)) : Math.max(0, Math.min(1, v + dy)));
      }
    } else if (_drag.type === 'rect-handle') {
      _applyRectHandle(s, _drag.handleIdx, n.x, n.y, _drag.origShape);
    } else if (_drag.type === 'poly-vertex') {
      const pi = _drag.ptIdx;
      s.points[pi]   = Math.max(0, Math.min(1, n.x));
      s.points[pi+1] = Math.max(0, Math.min(1, n.y));
      // Live-update the inputs in the list
      const ptList = document.querySelector('.tcs-poly-editor .tcs-pt-list');
      if (ptList) {
        const rows = ptList.querySelectorAll('.tcs-pt-row');
        const rowIdx = pi / 2;
        if (rows[rowIdx]) {
          const inputs = rows[rowIdx].querySelectorAll('input');
          if (inputs[0]) inputs[0].value = Math.round(s.points[pi]   * 100);
          if (inputs[1]) inputs[1].value = Math.round(s.points[pi+1] * 100);
        }
      }
    }
    _draw();
  }

  function _onPointerUp() {
    if (!_drag) return;
    const d = _drag; _drag = null;
    if (d.type === 'new-rect' && d.x2 !== undefined) {
      const x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2);
      const w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1);
      if (w > 0.02 && h > 0.02) {
        const s = { id:_uid(), type:'rect', x:x1, y:y1, w, h };
        _shapes.push(s); _selId = s.id;
        _commit('Add rect');
      }
    } else if (d.type === 'move') { _commit('Move shape'); }
    else if (d.type === 'rect-handle') { _commit('Resize rect'); }
    else if (d.type === 'poly-vertex') { _commit('Move vertex'); }
    _draw();
  }

  function _onDblClick(e) {
    if (_tool !== 'polygon' || !_poly || _poly.length < 6) return;
    const pts = _poly.slice(0, -2); // strip the extra point from dblclick's mousedown
    _shapes.push({ id:_uid(), type:'polygon', points: pts }); _selId = _shapes[_shapes.length-1].id;
    _poly = null; _commit('Add polygon'); _draw();
  }

  function _onRightClick(e) {
    e.preventDefault();
    if (_tool !== 'select') return;
    const { x, y } = _canvasXY(e);
    const n = _toNorm(x, y);
    const s = _selShape();
    if (!s || s.type !== 'polygon') return;
    // Right-click on an existing vertex → delete it
    for (let j = 0; j < s.points.length; j += 2) {
      const pp = _toPx(s.points[j], s.points[j+1]);
      if (Math.hypot(x - pp.x, y - pp.y) <= HANDLE_R + 3) {
        if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
        s.points.splice(j, 2);
        if (_selPtIdx >= s.points.length) _selPtIdx = s.points.length - 2;
        _commit('Delete vertex'); _draw(); return;
      }
    }
    // Right-click on an edge → insert vertex
    for (let j = 0; j < s.points.length; j += 2) {
      const nextJ = (j + 2) % s.points.length;
      const ax = s.points[j], ay = s.points[j+1], bx = s.points[nextJ], by = s.points[nextJ+1];
      const pa = _toPx(ax, ay), pb = _toPx(bx, by);
      // distance from point to segment
      const edx = pb.x - pa.x, edy = pb.y - pa.y;
      const t = Math.max(0, Math.min(1, ((x - pa.x)*edx + (y - pa.y)*edy) / (edx*edx + edy*edy || 1)));
      const cx2 = pa.x + t*edx, cy2 = pa.y + t*edy;
      if (Math.hypot(x - cx2, y - cy2) <= EDGE_HANDLE + 2) {
        s.points.splice(nextJ, 0, n.x, n.y);
        _selPtIdx = nextJ;
        _commit('Insert vertex'); _draw(); return;
      }
    }
  }

  // ── public API ────────────────────────────────────────────────────
  function mount() {
    _canvas = document.getElementById('tcs-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _canvas.addEventListener('pointerdown',  _onPointerDown);
    _canvas.addEventListener('pointermove',  _onPointerMove);
    _canvas.addEventListener('pointerup',    _onPointerUp);
    _canvas.addEventListener('dblclick',     _onDblClick);
    _canvas.addEventListener('contextmenu',  _onRightClick);

    document.addEventListener('keydown', (e) => {
      // Only act when canvas or shape list has focus
      const inEditor = _canvas?.contains(document.activeElement) || document.getElementById('tcs-shape-list')?.contains(document.activeElement) || document.activeElement === document.body;
      if (e.key === 'Escape') { _poly = null; _drag = null; _draw(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && _selId && inEditor && document.activeElement?.tagName !== 'INPUT') {
        // If a polygon vertex is selected, delete that vertex; otherwise delete whole shape
        const s = _selShape();
        if (s && s.type === 'polygon' && _selPtIdx >= 0) {
          if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
          s.points.splice(_selPtIdx, 2);
          _selPtIdx = Math.min(_selPtIdx, s.points.length - 2);
          _commit('Delete vertex'); _draw();
        } else {
          _shapes = _shapes.filter((sh) => sh.id !== _selId);
          _selId = null; _selPtIdx = -1;
          _commit('Delete shape'); _draw();
        }
      }
    });

    document.getElementById('tcs-tool-rect')?.addEventListener('click',    () => setTool('rect'));
    document.getElementById('tcs-tool-polygon')?.addEventListener('click', () => setTool('polygon'));
    document.getElementById('tcs-tool-select')?.addEventListener('click',  () => setTool('select'));

    document.getElementById('tcs-preset-full')?.addEventListener('click', () => {
      if (_tileIndex < 0) return;
      const s = { id:_uid(), type:'rect', x:0, y:0, w:1, h:1 };
      _shapes.push(s); _selId = s.id; _selPtIdx = -1;
      _commit('Add full-tile collision'); _draw();
    });
    document.getElementById('tcs-clear-all')?.addEventListener('click', () => {
      if (!_shapes.length) return;
      _shapes = []; _selId = null; _selPtIdx = -1;
      _commit('Clear all shapes'); _draw();
    });
  }

  function refresh(tileset, tileIndex) {
    _tileset = tileset; _tileIndex = tileIndex;
    const hintEl = document.getElementById('tcs-canvas-hint');
    if (!tileset || tileIndex < 0) {
      if (hintEl) hintEl.classList.remove('hidden');
      _shapes = []; _selId = null; _selPtIdx = -1; _poly = null; _drag = null;
      if (_canvas) { _canvas.width = 128; _canvas.height = 128; }
      _renderShapeList(); _draw(); return;
    }
    if (hintEl) hintEl.classList.add('hidden');
    const ps = (() => { const sh = window._rgeGetSheetById?.(_tileset.spriteSheetId); return sh ? window._rgeMakeTilesetSheet?.(sh, _tileset) : null; })();
    _tileW = Math.max(8, Number(ps?.tileWidth  || tileset.tileWidth  || 32));
    _tileH = Math.max(8, Number(ps?.tileHeight || tileset.tileHeight || 32));
    _scale = Math.max(1, Math.floor(Math.min(CANVAS_MAX / _tileW, CANVAS_MAX / _tileH)));
    if (!_canvas) return;
    _canvas.width = _tileW * _scale; _canvas.height = _tileH * _scale;
    const meta = ensureTilesetTileMetadata(tileset, tileIndex);
    _shapes = Array.isArray(meta?.collisionShapes)
      ? meta.collisionShapes.map((s) => s.type === 'polygon' ? { ...s, points:[...s.points] } : { ...s })
      : [];
    _selId = null; _selPtIdx = -1; _poly = null; _drag = null;
    _renderShapeList(); _draw();
  }

  return { mount, refresh, setTool };
})();

// Expose sheet/tile helpers so TileCollisionEditor can call them from the IIFE
window._rgeGetSheetById      = function(id) { return getSheetById(id); };
window._rgeMakeTilesetSheet  = function(sheet, tileset) { return makeTilesetSheet(sheet, tileset); };
window._rgeGetTileRect       = function(sheet, index) { return getTileRect(sheet, index); };

// ══════════════════════════════════════════════════════════════════════
// TILE PHYSICS SHAPE EDITOR  (tps-*)
// ══════════════════════════════════════════════════════════════════════
//
// Exact mirror of TileCollisionEditor operating on meta.physicsShapes.
// Shapes stored normalized [0..1] relative to tile size:
//   meta.physicsShapes = [
//     { id, type:'rect',    x, y, w, h },
//     { id, type:'polygon', points:[x0,y0,…] }
//   ]

const TilePhysicsEditor = (() => {

  // ── state ─────────────────────────────────────────────────────────
  let _tileset   = null;
  let _tileIndex = -1;
  let _shapes    = [];
  let _selId     = null;
  let _selPtIdx  = -1;
  let _tool      = 'rect';
  let _drag      = null;
  let _poly      = null;
  let _canvas    = null;
  let _ctx       = null;
  let _tileW     = 32;
  let _tileH     = 32;
  let _scale     = 4;
  const CANVAS_MAX  = 240;
  const HANDLE_R    = 5;
  const EDGE_HANDLE = 4;

  // ── helpers ───────────────────────────────────────────────────────
  // Shape-editor helpers via shared factory (see makeShapeEditorHelpers)
  const { _uid, _toNorm, _toPx, _canvasXY: _canvasXYHelper } = makeShapeEditorHelpers(() => _tileW * _scale, () => _tileH * _scale, 'ps');
  function _canvasXY(e) { return _canvasXYHelper(_canvas, e); }
  function _selShape() { return _shapes.find((s) => s.id === _selId) || null; }

  // ── rect corner/edge handles ──────────────────────────────────────
  function _rectHandles(s) {
    const { x: rx, y: ry } = _toPx(s.x, s.y);
    const { x: rx2, y: ry2 } = _toPx(s.x + s.w, s.y + s.h);
    const mx = (rx + rx2) / 2, my = (ry + ry2) / 2;
    return [
      { kind:'corner', idx:0, px:rx,  py:ry  },
      { kind:'corner', idx:1, px:rx2, py:ry  },
      { kind:'corner', idx:2, px:rx2, py:ry2 },
      { kind:'corner', idx:3, px:rx,  py:ry2 },
      { kind:'edge',   idx:4, px:mx,  py:ry  },
      { kind:'edge',   idx:5, px:rx2, py:my  },
      { kind:'edge',   idx:6, px:mx,  py:ry2 },
      { kind:'edge',   idx:7, px:rx,  py:my  },
    ];
  }

  // ── hit test ──────────────────────────────────────────────────────
  function _hitHandles(px, py) {
    const s = _selShape();
    if (!s) return null;
    if (s.type === 'rect') {
      for (const h of _rectHandles(s)) {
        if (Math.hypot(px - h.px, py - h.py) <= HANDLE_R + 2) return { type:'rect-handle', handleIdx:h.idx, kind:h.kind };
      }
    } else if (s.type === 'polygon') {
      for (let j = 0; j < s.points.length; j += 2) {
        const pp = _toPx(s.points[j], s.points[j+1]);
        if (Math.hypot(px - pp.x, py - pp.y) <= HANDLE_R + 2) return { type:'poly-vertex', ptIdx: j };
      }
    }
    return null;
  }

  function _hitShapeBody(nx, ny) {
    for (let i = _shapes.length - 1; i >= 0; i--) {
      const s = _shapes[i];
      if (s.type === 'rect') {
        if (nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h) return s.id;
      } else if (s.type === 'polygon' && s.points.length >= 4) {
        let inside = false;
        for (let j = 0, k = s.points.length - 2; j < s.points.length; k = j, j += 2) {
          const xi = s.points[j], yi = s.points[j+1], xk = s.points[k], yk = s.points[k+1];
          if (((yi > ny) !== (yk > ny)) && (nx < (xk - xi) * (ny - yi) / (yk - yi) + xi)) inside = !inside;
        }
        if (inside) return s.id;
      }
    }
    return null;
  }

  // ── apply rect handle drag ────────────────────────────────────────
  function _applyRectHandle(s, handleIdx, nx, ny, orig) {
    const ox = orig.x, oy = orig.y, ox2 = ox + orig.w, oy2 = oy + orig.h;
    nx = Math.max(0, Math.min(1, nx)); ny = Math.max(0, Math.min(1, ny));
    switch (handleIdx) {
      case 0: s.x = Math.min(nx, ox2 - 0.01); s.y = Math.min(ny, oy2 - 0.01); s.w = ox2 - s.x; s.h = oy2 - s.y; break;
      case 1: s.y = Math.min(ny, oy2 - 0.01); s.w = Math.max(0.01, nx - ox);  s.h = oy2 - s.y; break;
      case 2: s.w = Math.max(0.01, nx - ox);  s.h = Math.max(0.01, ny - oy);  break;
      case 3: s.x = Math.min(nx, ox2 - 0.01); s.w = ox2 - s.x; s.h = Math.max(0.01, ny - oy); break;
      case 4: s.y = Math.min(ny, oy2 - 0.01); s.h = oy2 - s.y; break;
      case 5: s.w = Math.max(0.01, nx - ox);  break;
      case 6: s.h = Math.max(0.01, ny - oy);  break;
      case 7: s.x = Math.min(nx, ox2 - 0.01); s.w = ox2 - s.x; break;
    }
    s.x = Math.max(0, s.x); s.y = Math.max(0, s.y);
    s.w = Math.min(1 - s.x, s.w); s.h = Math.min(1 - s.y, s.h);
  }

  // ── draw ──────────────────────────────────────────────────────────
  function _draw() {
    if (!_ctx) return;
    const cw = _tileW * _scale, ch = _tileH * _scale;
    _ctx.clearRect(0, 0, cw, ch);

    // Checkerboard
    for (let iy = 0; iy < _tileH; iy++) for (let ix = 0; ix < _tileW; ix++) {
      _ctx.fillStyle = (ix + iy) % 2 === 0 ? '#1a1f2e' : '#222840';
      _ctx.fillRect(ix * _scale, iy * _scale, _scale, _scale);
    }

    // Tile image
    if (_tileset) {
      const sheet = window._rgeGetSheetById?.(_tileset.spriteSheetId);
      if (sheet?.image) {
        const ps = window._rgeMakeTilesetSheet?.(sheet, _tileset);
        const rect = ps ? window._rgeGetTileRect?.(ps, _tileIndex) : null;
        if (rect) { _ctx.imageSmoothingEnabled = false; _ctx.globalAlpha = 0.85; _ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, 0, 0, cw, ch); _ctx.globalAlpha = 1; }
      }
    }

    // Pixel grid
    _ctx.strokeStyle = 'rgba(255,255,255,0.06)'; _ctx.lineWidth = 0.5;
    for (let ix = 0; ix <= _tileW; ix++) { _ctx.beginPath(); _ctx.moveTo(ix * _scale, 0); _ctx.lineTo(ix * _scale, ch); _ctx.stroke(); }
    for (let iy = 0; iy <= _tileH; iy++) { _ctx.beginPath(); _ctx.moveTo(0, iy * _scale); _ctx.lineTo(cw, iy * _scale); _ctx.stroke(); }

    // Shapes — teal for rect, green for polygon (distinct from collision red/purple)
    _shapes.forEach((s) => {
      const isSel = s.id === _selId;
      _ctx.lineWidth = isSel ? 2 : 1.5;
      if (s.type === 'rect') {
        const p = _toPx(s.x, s.y), p2 = _toPx(s.x + s.w, s.y + s.h);
        const sw = p2.x - p.x, sh = p2.y - p.y;
        _ctx.fillStyle   = isSel ? 'rgba(72,180,210,0.28)' : 'rgba(72,180,210,0.13)';
        _ctx.strokeStyle = isSel ? '#72d4f2' : '#48b4d2';
        _ctx.fillRect(p.x, p.y, sw, sh); _ctx.strokeRect(p.x + .5, p.y + .5, sw - 1, sh - 1);
        if (isSel) {
          _rectHandles(s).forEach((h) => {
            const r = h.kind === 'corner' ? HANDLE_R : EDGE_HANDLE;
            _ctx.fillStyle = '#fff'; _ctx.beginPath(); _ctx.arc(h.px, h.py, r, 0, Math.PI*2); _ctx.fill();
            _ctx.strokeStyle = '#48b4d2'; _ctx.lineWidth = 1.5; _ctx.beginPath(); _ctx.arc(h.px, h.py, r, 0, Math.PI*2); _ctx.stroke();
          });
        }
      } else if (s.type === 'polygon' && s.points.length >= 4) {
        _ctx.fillStyle   = isSel ? 'rgba(92,200,130,0.28)' : 'rgba(92,200,130,0.13)';
        _ctx.strokeStyle = isSel ? '#8ee8aa' : '#5cc882';
        _ctx.beginPath();
        for (let j = 0; j < s.points.length; j += 2) { const pp = _toPx(s.points[j], s.points[j+1]); j === 0 ? _ctx.moveTo(pp.x, pp.y) : _ctx.lineTo(pp.x, pp.y); }
        _ctx.closePath(); _ctx.fill(); _ctx.stroke();
        if (isSel) {
          for (let j = 0; j < s.points.length; j += 2) {
            const pp = _toPx(s.points[j], s.points[j+1]);
            const isSelPt = _selPtIdx === j;
            _ctx.fillStyle   = isSelPt ? '#ffe033' : '#fff';
            _ctx.strokeStyle = isSelPt ? '#ffb300' : '#5cc882';
            _ctx.lineWidth = isSelPt ? 2 : 1.5;
            _ctx.beginPath(); _ctx.arc(pp.x, pp.y, HANDLE_R, 0, Math.PI*2); _ctx.fill(); _ctx.stroke();
            _ctx.fillStyle = '#000'; _ctx.font = `bold ${Math.max(7, _scale - 1)}px sans-serif`;
            _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
            _ctx.fillText(String(j/2), pp.x, pp.y);
          }
        }
      }
    });

    // In-progress polygon
    if (_poly && _poly.length >= 2) {
      _ctx.strokeStyle = '#ffe033'; _ctx.lineWidth = 1.5; _ctx.setLineDash([4, 3]);
      _ctx.beginPath();
      for (let j = 0; j < _poly.length; j += 2) { const pp = _toPx(_poly[j], _poly[j+1]); j === 0 ? _ctx.moveTo(pp.x, pp.y) : _ctx.lineTo(pp.x, pp.y); }
      _ctx.stroke(); _ctx.setLineDash([]);
      for (let j = 0; j < _poly.length; j += 2) { const pp = _toPx(_poly[j], _poly[j+1]); _ctx.fillStyle = '#ffe033'; _ctx.beginPath(); _ctx.arc(pp.x, pp.y, 3, 0, Math.PI*2); _ctx.fill(); }
    }

    // Drag-rect preview
    if (_drag?.type === 'new-rect' && _drag.x2 !== undefined) {
      const x1 = Math.min(_drag.x1, _drag.x2), y1 = Math.min(_drag.y1, _drag.y2);
      const x2 = Math.max(_drag.x1, _drag.x2), y2 = Math.max(_drag.y1, _drag.y2);
      const p1 = _toPx(x1, y1), p2 = _toPx(x2, y2);
      _ctx.strokeStyle = '#72d4f2'; _ctx.lineWidth = 1.5; _ctx.setLineDash([4, 3]);
      _ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      _ctx.fillStyle = 'rgba(72,180,210,0.12)'; _ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      _ctx.setLineDash([]);
    }
  }

  // ── commit to tileset metadata ────────────────────────────────────
  function _commit(label = 'Edit physics shape') {
    if (!_tileset || _tileIndex < 0) return;
    const meta = ensureTilesetTileMetadata(_tileset, _tileIndex);
    if (!meta) return;
    meta.physicsShapes = _shapes.map((s) => s.type === 'polygon'
      ? { id: s.id, type:'polygon', points:[...s.points] }
      : { id: s.id, type:'rect', x: s.x, y: s.y, w: s.w, h: s.h });
    syncTilesetsToSceneState();
    const before = state.history.undo[state.history.undo.length - 1] || serializeScene();
    pushHistory(label, before);
    _renderShapeList();
    updateTilesetSheetPaletteHighlights(document.getElementById('ts-palette-grid'), _tileset, _tileset.selectedTileIndex ?? 0);
    scheduleRender(RenderFlags.VIEWPORT);
  }

  // ── shape list: expandable rows with inline point editors ─────────
  function _renderShapeList() {
    const listEl  = document.getElementById('tps-shape-list');
    const countEl = document.getElementById('tps-shape-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${_shapes.length} shape${_shapes.length === 1 ? '' : 's'}`;

    _shapes.forEach((s, i) => {
      const isActive = s.id === _selId;
      const wrap = document.createElement('div');
      wrap.className = 'tcs-shape-wrap' + (isActive ? ' active' : '');
      wrap.dataset.shapeId = s.id;

      const icon = s.type === 'rect' ? '▭' : '⬠';
      const hdr  = document.createElement('div'); hdr.className = 'tcs-shape-row';
      const labelSpan = document.createElement('span'); labelSpan.className = 'tcs-shape-icon'; labelSpan.textContent = icon;
      const nameSpan  = document.createElement('span'); nameSpan.className  = 'tcs-shape-name';
      nameSpan.textContent = `${i + 1}. ${s.type === 'rect' ? 'Rect' : `Polygon (${s.points.length/2} pts)`}`;
      const actions = document.createElement('span'); actions.className = 'tcs-shape-actions';

      const upBtn  = _mkBtn('↑', 'Move up',    () => { if (i === 0) return; [_shapes[i-1], _shapes[i]] = [_shapes[i], _shapes[i-1]]; _commit('Reorder shape'); _draw(); });
      const dnBtn  = _mkBtn('↓', 'Move down',  () => { if (i === _shapes.length - 1) return; [_shapes[i], _shapes[i+1]] = [_shapes[i+1], _shapes[i]]; _commit('Reorder shape'); _draw(); });
      const dupBtn = _mkBtn('⧉', 'Duplicate',  () => {
        const copy = JSON.parse(JSON.stringify(s)); copy.id = _uid();
        if (copy.type === 'rect') { copy.x = Math.min(0.95, copy.x + 0.03); copy.y = Math.min(0.95, copy.y + 0.03); }
        _shapes.splice(i + 1, 0, copy); _selId = copy.id; _commit('Duplicate shape'); _draw();
      });
      const delBtn = _mkBtn('✕', 'Delete shape', () => {
        _shapes = _shapes.filter((sh) => sh.id !== s.id);
        if (_selId === s.id) { _selId = null; _selPtIdx = -1; }
        _commit('Delete shape'); _draw();
      });
      delBtn.className += ' danger';

      actions.append(upBtn, dnBtn, dupBtn, delBtn);
      hdr.append(labelSpan, nameSpan, actions);
      hdr.addEventListener('click', (e) => { if (e.target.closest('button')) return; _selId = s.id; _selPtIdx = -1; _draw(); _renderShapeList(); });
      wrap.appendChild(hdr);

      if (isActive) {
        const editor = document.createElement('div'); editor.className = 'tcs-shape-editor';
        editor.appendChild(s.type === 'rect' ? _buildRectEditor(s) : _buildPolyEditor(s));
        wrap.appendChild(editor);
      }
      listEl.appendChild(wrap);
    });
  }

  function _mkBtn(text, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tcs-action-btn'; b.title = title; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function _buildRectEditor(s) {
    const grid = document.createElement('div'); grid.className = 'tcs-rect-grid';
    [{ label:'X', key:'x' }, { label:'Y', key:'y' }, { label:'W', key:'w' }, { label:'H', key:'h' }].forEach(({ label, key }) => {
      const lbl = document.createElement('label'); lbl.className = 'tcs-field';
      const span = document.createElement('span'); span.textContent = label;
      const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1'; inp.value = Math.round(s[key] * 100);
      inp.addEventListener('input', () => { s[key] = Math.max(0, Math.min(100, Number(inp.value) || 0)) / 100; _draw(); });
      inp.addEventListener('change', () => _commit('Edit rect'));
      lbl.append(span, inp); grid.appendChild(lbl);
    });
    const note = document.createElement('div'); note.className = 'tcs-field-note'; note.textContent = 'Values 0–100% of tile size';
    grid.appendChild(note);
    return grid;
  }

  function _buildPolyEditor(s) {
    const wrap   = document.createElement('div'); wrap.className = 'tcs-poly-editor';
    const header = document.createElement('div'); header.className = 'tcs-poly-header';
    const addBtn = _mkBtn('+ Point', 'Add point at center', () => { s.points.push(0.5, 0.5); _selPtIdx = s.points.length - 2; _commit('Add polygon point'); _draw(); });
    header.appendChild(addBtn); wrap.appendChild(header);
    const ptList = document.createElement('div'); ptList.className = 'tcs-pt-list';
    for (let j = 0; j < s.points.length; j += 2) {
      const ptIdx = j;
      const row = document.createElement('div'); row.className = 'tcs-pt-row' + (_selPtIdx === ptIdx ? ' active' : '');
      const idxLabel = document.createElement('span'); idxLabel.className = 'tcs-pt-idx'; idxLabel.textContent = String(ptIdx/2);
      const xInp = _numInput(Math.round(s.points[ptIdx]   * 100), 0, 100, (v) => { s.points[ptIdx]   = v / 100; _draw(); }, () => _commit('Edit polygon point'));
      const yInp = _numInput(Math.round(s.points[ptIdx+1] * 100), 0, 100, (v) => { s.points[ptIdx+1] = v / 100; _draw(); }, () => _commit('Edit polygon point'));
      const selBtn = _mkBtn('●', 'Select on canvas', () => { _selPtIdx = ptIdx; _draw(); _renderShapeList(); });
      const delPtBtn = _mkBtn('✕', 'Delete point', () => {
        if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
        s.points.splice(ptIdx, 2); if (_selPtIdx >= s.points.length) _selPtIdx = s.points.length - 2;
        _commit('Delete polygon point'); _draw();
      });
      delPtBtn.className += ' danger';
      row.append(idxLabel, xInp, yInp, selBtn, delPtBtn);
      row.addEventListener('click', (e) => { if (e.target.closest('button') || e.target.tagName === 'INPUT') return; _selPtIdx = ptIdx; _draw(); _renderShapeList(); });
      ptList.appendChild(row);
    }
    const note = document.createElement('div'); note.className = 'tcs-field-note'; note.textContent = 'X / Y in % of tile. Drag vertices on canvas.';
    wrap.append(ptList, note);
    return wrap;
  }

  function _numInput(value, min, max, onInput, onChange) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'tcs-num'; inp.min = String(min); inp.max = String(max); inp.step = '1'; inp.value = String(value);
    inp.addEventListener('input', () => onInput(Math.max(min, Math.min(max, Number(inp.value) || 0))));
    inp.addEventListener('change', onChange);
    return inp;
  }

  // ── tool switching ────────────────────────────────────────────────
  function setTool(name) {
    _tool = name; _poly = null; _selPtIdx = -1;
    ['rect','polygon','select'].forEach((t) => {
      const btn = document.getElementById(`tps-tool-${t}`);
      if (btn) btn.classList.toggle('active', t === name);
    });
    if (_canvas) _canvas.style.cursor = name === 'select' ? 'default' : 'crosshair';
    _draw();
  }

  // ── pointer events ────────────────────────────────────────────────
  function _onPointerDown(e) {
    if (e.button !== 0 || _tileIndex < 0) return;
    const { x, y } = _canvasXY(e); const n = _toNorm(x, y);
    if (_tool === 'select') {
      const handleHit = _hitHandles(x, y);
      if (handleHit) {
        const s = _selShape(); if (!s) return;
        if (handleHit.type === 'rect-handle') {
          _drag = { type:'rect-handle', handleIdx: handleHit.handleIdx, origShape: JSON.parse(JSON.stringify(s)) };
        } else if (handleHit.type === 'poly-vertex') {
          _selPtIdx = handleHit.ptIdx;
          _drag = { type:'poly-vertex', ptIdx: handleHit.ptIdx, origShape: JSON.parse(JSON.stringify(s)) };
          _renderShapeList();
        }
        _canvas.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      const hit = _hitShapeBody(n.x, n.y);
      if (hit) {
        _selId = hit; _selPtIdx = -1;
        const s = _selShape();
        _drag = { type:'move', origShape: JSON.parse(JSON.stringify(s)), startX: n.x, startY: n.y };
        _canvas.setPointerCapture(e.pointerId);
        _draw(); _renderShapeList();
      } else { _selId = null; _selPtIdx = -1; _draw(); _renderShapeList(); }
      e.preventDefault(); return;
    }
    if (_tool === 'rect') { _drag = { type:'new-rect', x1: n.x, y1: n.y }; _canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (_tool === 'polygon') { if (!_poly) _poly = []; _poly.push(n.x, n.y); _draw(); }
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const { x, y } = _canvasXY(e); const n = _toNorm(x, y); const s = _selShape();
    if (_drag.type === 'new-rect') { _drag.x2 = n.x; _drag.y2 = n.y; }
    else if (_drag.type === 'move' && s) {
      const dx = n.x - _drag.startX, dy = n.y - _drag.startY, orig = _drag.origShape;
      if (s.type === 'rect') { s.x = Math.max(0, Math.min(1 - s.w, orig.x + dx)); s.y = Math.max(0, Math.min(1 - s.h, orig.y + dy)); }
      else if (s.type === 'polygon') { s.points = orig.points.map((v, i) => i % 2 === 0 ? Math.max(0, Math.min(1, v + dx)) : Math.max(0, Math.min(1, v + dy))); }
    } else if (_drag.type === 'rect-handle' && s) { _applyRectHandle(s, _drag.handleIdx, n.x, n.y, _drag.origShape); }
    else if (_drag.type === 'poly-vertex' && s) {
      const pi = _drag.ptIdx;
      s.points[pi] = Math.max(0, Math.min(1, n.x)); s.points[pi+1] = Math.max(0, Math.min(1, n.y));
      const ptList = document.querySelector('#tps-shape-list .tcs-pt-list');
      if (ptList) {
        const rows = ptList.querySelectorAll('.tcs-pt-row'); const rowIdx = pi / 2;
        if (rows[rowIdx]) { const inputs = rows[rowIdx].querySelectorAll('input'); if (inputs[0]) inputs[0].value = Math.round(s.points[pi] * 100); if (inputs[1]) inputs[1].value = Math.round(s.points[pi+1] * 100); }
      }
    }
    _draw();
  }

  function _onPointerUp() {
    if (!_drag) return;
    const d = _drag; _drag = null;
    if (d.type === 'new-rect' && d.x2 !== undefined) {
      const x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2);
      const w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1);
      if (w > 0.02 && h > 0.02) { const s = { id:_uid(), type:'rect', x:x1, y:y1, w, h }; _shapes.push(s); _selId = s.id; _commit('Add rect'); }
    } else if (d.type === 'move') { _commit('Move shape'); }
    else if (d.type === 'rect-handle') { _commit('Resize rect'); }
    else if (d.type === 'poly-vertex') { _commit('Move vertex'); }
    _draw();
  }

  function _onDblClick(e) {
    if (_tool !== 'polygon' || !_poly || _poly.length < 6) return;
    _shapes.push({ id:_uid(), type:'polygon', points: _poly.slice(0, -2) }); _selId = _shapes[_shapes.length-1].id;
    _poly = null; _commit('Add polygon'); _draw();
  }

  function _onRightClick(e) {
    e.preventDefault(); if (_tool !== 'select') return;
    const { x, y } = _canvasXY(e); const n = _toNorm(x, y); const s = _selShape();
    if (!s || s.type !== 'polygon') return;
    for (let j = 0; j < s.points.length; j += 2) {
      const pp = _toPx(s.points[j], s.points[j+1]);
      if (Math.hypot(x - pp.x, y - pp.y) <= HANDLE_R + 3) {
        if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
        s.points.splice(j, 2); if (_selPtIdx >= s.points.length) _selPtIdx = s.points.length - 2;
        _commit('Delete vertex'); _draw(); return;
      }
    }
    for (let j = 0; j < s.points.length; j += 2) {
      const nextJ = (j + 2) % s.points.length;
      const ax = s.points[j], ay = s.points[j+1], bx = s.points[nextJ], by = s.points[nextJ+1];
      const pa = _toPx(ax, ay), pb = _toPx(bx, by);
      const edx = pb.x - pa.x, edy = pb.y - pa.y;
      const t = Math.max(0, Math.min(1, ((x - pa.x)*edx + (y - pa.y)*edy) / (edx*edx + edy*edy || 1)));
      const cx2 = pa.x + t*edx, cy2 = pa.y + t*edy;
      if (Math.hypot(x - cx2, y - cy2) <= EDGE_HANDLE + 2) { s.points.splice(nextJ, 0, n.x, n.y); _selPtIdx = nextJ; _commit('Insert vertex'); _draw(); return; }
    }
  }

  // ── public API ────────────────────────────────────────────────────
  function mount() {
    _canvas = document.getElementById('tps-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _canvas.addEventListener('pointerdown',  _onPointerDown);
    _canvas.addEventListener('pointermove',  _onPointerMove);
    _canvas.addEventListener('pointerup',    _onPointerUp);
    _canvas.addEventListener('dblclick',     _onDblClick);
    _canvas.addEventListener('contextmenu',  _onRightClick);

    document.addEventListener('keydown', (e) => {
      const inEditor = _canvas?.contains(document.activeElement) || document.getElementById('tps-shape-list')?.contains(document.activeElement) || document.activeElement === document.body;
      if (e.key === 'Escape') { _poly = null; _drag = null; _draw(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && _selId && inEditor && document.activeElement?.tagName !== 'INPUT') {
        const s = _selShape();
        if (s && s.type === 'polygon' && _selPtIdx >= 0) {
          if (s.points.length <= 6) { setStatus('Polygon needs at least 3 points.'); return; }
          s.points.splice(_selPtIdx, 2); _selPtIdx = Math.min(_selPtIdx, s.points.length - 2);
          _commit('Delete vertex'); _draw();
        } else {
          _shapes = _shapes.filter((sh) => sh.id !== _selId); _selId = null; _selPtIdx = -1;
          _commit('Delete shape'); _draw();
        }
      }
    });

    document.getElementById('tps-tool-rect')?.addEventListener('click',    () => setTool('rect'));
    document.getElementById('tps-tool-polygon')?.addEventListener('click', () => setTool('polygon'));
    document.getElementById('tps-tool-select')?.addEventListener('click',  () => setTool('select'));

    document.getElementById('tps-preset-full')?.addEventListener('click', () => {
      if (_tileIndex < 0) return;
      const s = { id:_uid(), type:'rect', x:0, y:0, w:1, h:1 };
      _shapes.push(s); _selId = s.id; _selPtIdx = -1;
      _commit('Add full-tile physics'); _draw();
    });
    document.getElementById('tps-clear-all')?.addEventListener('click', () => {
      if (!_shapes.length) return;
      _shapes = []; _selId = null; _selPtIdx = -1;
      _commit('Clear all physics shapes'); _draw();
    });
  }

  function refresh(tileset, tileIndex) {
    _tileset = tileset; _tileIndex = tileIndex;
    const hintEl = document.getElementById('tps-canvas-hint');
    if (!tileset || tileIndex < 0) {
      if (hintEl) hintEl.classList.remove('hidden');
      _shapes = []; _selId = null; _selPtIdx = -1; _poly = null; _drag = null;
      if (_canvas) { _canvas.width = 128; _canvas.height = 128; }
      _renderShapeList(); _draw(); return;
    }
    if (hintEl) hintEl.classList.add('hidden');
    const ps = (() => { const sh = window._rgeGetSheetById?.(_tileset.spriteSheetId); return sh ? window._rgeMakeTilesetSheet?.(sh, _tileset) : null; })();
    _tileW = Math.max(8, Number(ps?.tileWidth  || tileset.tileWidth  || 32));
    _tileH = Math.max(8, Number(ps?.tileHeight || tileset.tileHeight || 32));
    _scale = Math.max(1, Math.floor(Math.min(CANVAS_MAX / _tileW, CANVAS_MAX / _tileH)));
    if (!_canvas) return;
    _canvas.width = _tileW * _scale; _canvas.height = _tileH * _scale;
    const meta = ensureTilesetTileMetadata(tileset, tileIndex);
    _shapes = Array.isArray(meta?.physicsShapes)
      ? meta.physicsShapes.map((s) => s.type === 'polygon' ? { ...s, points:[...s.points] } : { ...s })
      : [];
    _selId = null; _selPtIdx = -1; _poly = null; _drag = null;
    _renderShapeList(); _draw();
  }

  return { mount, refresh, setTool };
})();




// ══════════════════════════════════════════════════════════════════════
// PROJECT LOADING OVERLAY CONTROLLER
// ══════════════════════════════════════════════════════════════════════
const ProjectLoader = (() => {
  const STEPS = ['settings', 'files', 'scenes', 'assets'];
  const STEP_WEIGHTS = { settings: 10, files: 20, scenes: 50, assets: 20 };
  let _overlay = null, _bar = null, _nameEl = null, _statusEl = null;
  let _activeStep = null, _completedSteps = new Set();

  function _els() {
    if (!_overlay) {
      _overlay   = document.getElementById('proj-loading-overlay');
      _bar       = document.getElementById('proj-loading-bar');
      _nameEl    = document.getElementById('proj-loading-name');
      _statusEl  = document.getElementById('proj-loading-status');
    }
    return { overlay: _overlay, bar: _bar, nameEl: _nameEl, statusEl: _statusEl };
  }

  function _progress() {
    let pct = 0;
    _completedSteps.forEach((s) => { pct += STEP_WEIGHTS[s] || 0; });
    if (_activeStep && !_completedSteps.has(_activeStep)) {
      pct += (STEP_WEIGHTS[_activeStep] || 0) * 0.4; // partial credit for active step
    }
    return Math.min(100, Math.round(pct));
  }

  function _stepEl(name) {
    return document.querySelector(`.proj-loading-step[data-step="${name}"]`);
  }

  function _updateStep(name, state) {
    const el = _stepEl(name);
    if (!el) return;
    const icon = el.querySelector('.proj-step-icon');
    el.classList.remove('is-active', 'is-done');
    if (state === 'active') {
      el.classList.add('is-active');
      if (icon) icon.textContent = '◌';
    } else if (state === 'done') {
      el.classList.add('is-done');
      if (icon) icon.textContent = '●';
    } else {
      if (icon) icon.textContent = '○';
    }
  }

  function show(projectName) {
    _completedSteps.clear();
    _activeStep = null;
    const { overlay, bar, nameEl, statusEl } = _els();
    if (!overlay) return;
    STEPS.forEach((s) => _updateStep(s, 'pending'));
    if (nameEl) nameEl.textContent = projectName ? `Opening "${projectName}"` : 'Opening project…';
    if (statusEl) statusEl.textContent = 'Starting…';
    if (bar) bar.style.width = '2%';
    overlay.classList.remove('is-dismissing');
    overlay.classList.add('is-visible');
  }

  function step(name, statusText) {
    if (_activeStep && _activeStep !== name) {
      _completedSteps.add(_activeStep);
      _updateStep(_activeStep, 'done');
    }
    _activeStep = name;
    _updateStep(name, 'active');
    const { bar, statusEl } = _els();
    if (bar) bar.style.width = `${_progress()}%`;
    if (statusEl && statusText) statusEl.textContent = statusText;
  }

  function done(statusText) {
    if (_activeStep) {
      _completedSteps.add(_activeStep);
      _updateStep(_activeStep, 'done');
      _activeStep = null;
    }
    STEPS.forEach((s) => { if (!_completedSteps.has(s)) { _completedSteps.add(s); _updateStep(s, 'done'); } });
    const { overlay, bar, statusEl } = _els();
    if (bar) bar.style.width = '100%';
    if (statusEl && statusText) statusEl.textContent = statusText;
    // Short pause so the user sees 100% before fade-out
    setTimeout(() => {
      if (!overlay) return;
      overlay.classList.add('is-dismissing');
      overlay.addEventListener('transitionend', () => {
        overlay.classList.remove('is-visible', 'is-dismissing');
      }, { once: true });
    }, 420);
  }

  function fail(reason) {
    const { statusEl } = _els();
    if (statusEl) statusEl.textContent = `Failed: ${reason || 'Unknown error'}`;
    setTimeout(() => done(), 2200);
  }

  return { show, step, done, fail };
})();


init();

// ── Bridge for UI Components ────────────────────────────────────────────────────
// Exposes the minimal scene API the UI editor needs without coupling it to
// scene_editor.js internals.
RGE_ROOT.RGESceneBridge = {
  getNodes,
  getNode,
  getChildren,
  getRootNodeId,
  addNode: (type, parentId) => {
    addNode(type, parentId);
    if (isUiNodeType(type)) persistActiveSceneEntry();
  },
  createUiNodeFromAtlasRegion: (controlType, styleId) => {
    const style = (state.nineSliceStyles || []).find(s => s.id === styleId);
    if (!style) { setStatus('Select a UI atlas region first.'); return null; }
    const type = controlType === 'Panel' ? 'Panel' : controlType === 'Button' ? 'Button' : controlType === 'ProgressBar' ? 'ProgressBar' : 'TextureRect';
    const parentId = state.selectedId && getNode(state.selectedId) && isUiNodeType(getNode(state.selectedId).type) ? state.selectedId : getRootNodeId();
    const before = serializeScene();
    const node = createDefaultNode(type);
    const rr = style.sourceRect || {};
    node.name = String(style.name || style.id || type);
    node.parentId = parentId;
    node.transform.x = snapValue(96 + (getNodes().length * 14));
    node.transform.y = snapValue(96 + (getNodes().length * 14));
    node.zIndex = getChildren(node.parentId).length;
    node.properties = Object.assign({}, node.properties || {}, {
      width: Math.max(24, Number(rr.w) || node.properties?.width || 160),
      height: Math.max(24, Number(rr.h) || node.properties?.height || 64),
      imagePath: style.imagePath || '',
      imageDataUrl: style.imageDataUrl || '',
      atlasRegionId: style.id,
      sourceRect: { x:Number(rr.x)||0, y:Number(rr.y)||0, w:Number(rr.w)||0, h:Number(rr.h)||0 },
      nineSliceStyleId: style.id
    });
    if (type === 'Panel' || type === 'Button') {
      node.properties.sliceLeft = Number(style.sliceLeft) || 0;
      node.properties.sliceTop = Number(style.sliceTop) || 0;
      node.properties.sliceRight = Number(style.sliceRight) || 0;
      node.properties.sliceBottom = Number(style.sliceBottom) || 0;
    }
    if (type === 'Button') node.properties.text = style.name || 'Button';
    getNodes().push(node);
    syncEditorStateFromRuntime();
    scheduleRender(RenderFlags.TREE | RenderFlags.INSPECTOR | RenderFlags.VIEWPORT | RenderFlags.SCENE_SUMMARY);
    selectNode(node.id);
    persistActiveSceneEntry();
    pushHistory('Add UI node from atlas region', before);
    setStatus(`Added ${type} from region ${style.name || style.id}.`);
    return node;
  },
  selectNode,
  deleteNode: (id) => { if (id && !isRootNodeId(id)) { deleteNode(id); } },
  getSelectedId: () => state.selectedId,
  refreshInspector,
  refreshAll,
  serializeScene,
  pushHistory,
  isUiNodeType,
  isRootNodeId,
  setStatus,
  getEditorState: () => state.editorState,
  setEditorStateProp: (key, value) => { state.editorState[key] = value; },
  // Nine-slice style access
  getNineSliceStyles: () => state.nineSliceStyles || [],
  getNineSliceStyleById: (id) => (state.nineSliceStyles || []).find(s => s.id === id) || null,
  getSelectedNineSliceStyleId: () => state.selectedNineSliceStyleId,
  setSelectedNineSliceStyleId: (id) => { state.selectedNineSliceStyleId = id; syncNineSliceStylesToSceneState(); },
  addNineSliceStyle: (style) => {
    const resourcesApi = window.RokuSchemaResources;
    const normalized = resourcesApi?.normalizeNineSliceStyle ? resourcesApi.normalizeNineSliceStyle(style, Date.now()) : style;
    state.nineSliceStyles.push(normalized);
    state.selectedNineSliceStyleId = normalized.id;
    syncNineSliceStylesToSceneState();
    const before = serializeScene();
    pushHistory('Add Nine-Slice Style', before);
    return normalized;
  },
  updateNineSliceStyle: (id, patch) => {
    const idx = state.nineSliceStyles.findIndex(s => s.id === id);
    if (idx < 0) return;
    const before = serializeScene();
    Object.assign(state.nineSliceStyles[idx], patch);
    syncNineSliceStylesToSceneState();
    pushHistory('Update Nine-Slice Style', before);
  },
  deleteNineSliceStyle: (id) => {
    const before = serializeScene();
    state.nineSliceStyles = state.nineSliceStyles.filter(s => s.id !== id);
    if (state.selectedNineSliceStyleId === id) state.selectedNineSliceStyleId = state.nineSliceStyles[0]?.id || null;
    syncNineSliceStylesToSceneState();
    pushHistory('Delete Nine-Slice Style', before);
  },
  // UIScreen API
  getUIScreens: () => state.uiScreens || [],
  getUIScreenById: (id) => (state.uiScreens || []).find(s => s.id === id) || null,
  getUIScreenByName: (name) => (state.uiScreens || []).find(s => s.name === name) || null,
  getSelectedUIScreenId: () => state.selectedUIScreenId,
  setSelectedUIScreenId: (id) => { state.selectedUIScreenId = id; syncUIScreensToSceneState(); },
  addUIScreen: (screen) => {
    const resourcesApi = window.RokuSchemaResources;
    const normalized = resourcesApi?.normalizeUIScreen ? resourcesApi.normalizeUIScreen(screen, Date.now()) : screen;
    // If this is the first screen, make it startup by default
    if (!(state.uiScreens || []).length) normalized.startupScreen = true;
    state.uiScreens = state.uiScreens || [];
    state.uiScreens.push(normalized);
    state.selectedUIScreenId = normalized.id;
    syncUIScreensToSceneState();
    pushHistory('Add UI Screen', serializeScene());
    return normalized;
  },
  updateUIScreen: (id, patch) => {
    const idx = (state.uiScreens || []).findIndex(s => s.id === id);
    if (idx < 0) return;
    // If setting startupScreen=true, clear it on others
    if (patch.startupScreen === true) {
      (state.uiScreens || []).forEach(s => { s.startupScreen = false; });
    }
    Object.assign(state.uiScreens[idx], patch);
    syncUIScreensToSceneState();
    pushHistory('Update UI Screen', serializeScene());
  },
  deleteUIScreen: (id) => {
    const before = serializeScene();
    state.uiScreens = (state.uiScreens || []).filter(s => s.id !== id);
    if (state.selectedUIScreenId === id) state.selectedUIScreenId = state.uiScreens[0]?.id || null;
    syncUIScreensToSceneState();
    pushHistory('Delete UI Screen', before);
  },
  duplicateUIScreen: (id) => {
    const src = (state.uiScreens || []).find(s => s.id === id);
    if (!src) return null;
    const resourcesApi = window.RokuSchemaResources;
    const copy = resourcesApi?.normalizeUIScreen
      ? resourcesApi.normalizeUIScreen(Object.assign({}, src, { id: '', name: src.name + ' Copy', startupScreen: false }), Date.now())
      : Object.assign({}, src, { id: `uiscreen_${Date.now()}`, name: src.name + ' Copy', startupScreen: false });
    state.uiScreens = state.uiScreens || [];
    state.uiScreens.push(copy);
    state.selectedUIScreenId = copy.id;
    syncUIScreensToSceneState();
    pushHistory('Duplicate UI Screen', serializeScene());
    return copy;
  },
  getCanvasLayerNodes: () => (getNodes() || []).filter(n => n.type === 'CanvasLayer'),
  // UITransitionPreset API
  getUITransitionPresets: () => state.uiTransitionPresets || [],
  getUITransitionPresetById: (id) => (state.uiTransitionPresets || []).find(p => p.id === id) || null,
  getSelectedUITransitionPresetId: () => state.selectedUITransitionPresetId,
  setSelectedUITransitionPresetId: (id) => { state.selectedUITransitionPresetId = id; syncUITransitionPresetsToSceneState(); },
  addUITransitionPreset: (preset) => {
    const resourcesApi = window.RokuSchemaResources;
    const normalized = resourcesApi?.normalizeUITransitionPreset ? resourcesApi.normalizeUITransitionPreset(preset, Date.now()) : preset;
    state.uiTransitionPresets = state.uiTransitionPresets || [];
    state.uiTransitionPresets.push(normalized);
    state.selectedUITransitionPresetId = normalized.id;
    syncUITransitionPresetsToSceneState();
    pushHistory('Add Transition Preset', serializeScene());
    return normalized;
  },
  updateUITransitionPreset: (id, patch) => {
    const idx = (state.uiTransitionPresets || []).findIndex(p => p.id === id);
    if (idx < 0) return;
    Object.assign(state.uiTransitionPresets[idx], patch);
    syncUITransitionPresetsToSceneState();
    pushHistory('Update Transition Preset', serializeScene());
  },
  deleteUITransitionPreset: (id) => {
    const before = serializeScene();
    state.uiTransitionPresets = (state.uiTransitionPresets || []).filter(p => p.id !== id);
    if (state.selectedUITransitionPresetId === id) state.selectedUITransitionPresetId = state.uiTransitionPresets[0]?.id || null;
    syncUITransitionPresetsToSceneState();
    pushHistory('Delete Transition Preset', before);
  },
  duplicateUITransitionPreset: (id) => {
    const src = (state.uiTransitionPresets || []).find(p => p.id === id);
    if (!src) return null;
    const resourcesApi = window.RokuSchemaResources;
    const copy = resourcesApi?.normalizeUITransitionPreset
      ? resourcesApi.normalizeUITransitionPreset(Object.assign({}, src, { id: '', name: src.name + ' Copy' }), Date.now())
      : Object.assign({}, src, { id: `transition_${Date.now()}`, name: src.name + ' Copy' });
    state.uiTransitionPresets = state.uiTransitionPresets || [];
    state.uiTransitionPresets.push(copy);
    state.selectedUITransitionPresetId = copy.id;
    syncUITransitionPresetsToSceneState();
    pushHistory('Duplicate Transition Preset', serializeScene());
    return copy;
  },
  setNodeField: (nodeId, key, value) => {
    const node = getNode(nodeId);
    if (!node) return;
    const field = { key, label: key.split('.').pop(), type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string' };
    updateField(nodeId, field, value, { deferHistory: false });
    if (isUiNodeType(node.type)) persistActiveSceneEntry();
  },
  onSelectionChange: null,  // set by UI editor
  // UIOptionDef API
  getUIOptionDefs: () => state.uiOptionDefs || [],
  getUIOptionDefByKey: (key) => (state.uiOptionDefs || []).find(d => d.key === key) || null,
  addUIOptionDef: (def) => {
    const api = window.RokuSchemaResources;
    const n = api?.normalizeUIOptionDef ? api.normalizeUIOptionDef(def, Date.now()) : def;
    state.uiOptionDefs = state.uiOptionDefs || [];
    state.uiOptionDefs.push(n);
    syncUIOptionDefsToSceneState();
    pushHistory('Add Option Def', serializeScene());
    return n;
  },
  updateUIOptionDef: (id, patch) => {
    const idx = (state.uiOptionDefs || []).findIndex(d => d.id === id);
    if (idx < 0) return;
    Object.assign(state.uiOptionDefs[idx], patch);
    syncUIOptionDefsToSceneState();
    pushHistory('Update Option Def', serializeScene());
  },
  deleteUIOptionDef: (id) => {
    const before = serializeScene();
    state.uiOptionDefs = (state.uiOptionDefs || []).filter(d => d.id !== id);
    syncUIOptionDefsToSceneState();
    pushHistory('Delete Option Def', before);
  },
  // UIHighScoreTable API
  getUIHighScoreTables: () => state.uiHighScoreTables || [],
  getUIHighScoreTableById: (id) => (state.uiHighScoreTables || []).find(t => t.id === id) || null,
  addUIHighScoreTable: (table) => {
    const api = window.RokuSchemaResources;
    const n = api?.normalizeUIHighScoreTable ? api.normalizeUIHighScoreTable(table, Date.now()) : table;
    state.uiHighScoreTables = state.uiHighScoreTables || [];
    state.uiHighScoreTables.push(n);
    syncUIHighScoreTablesToSceneState();
    pushHistory('Add High Score Table', serializeScene());
    return n;
  },
  updateUIHighScoreTable: (id, patch) => {
    const idx = (state.uiHighScoreTables || []).findIndex(t => t.id === id);
    if (idx < 0) return;
    Object.assign(state.uiHighScoreTables[idx], patch);
    syncUIHighScoreTablesToSceneState();
    pushHistory('Update High Score Table', serializeScene());
  },
  deleteUIHighScoreTable: (id) => {
    const before = serializeScene();
    state.uiHighScoreTables = (state.uiHighScoreTables || []).filter(t => t.id !== id);
    syncUIHighScoreTablesToSceneState();
    pushHistory('Delete High Score Table', before);
  },
};


// ════════════════════════════════════════════════════════════════════════════
// RGE v49 — Editor Architecture Stabilization
// ════════════════════════════════════════════════════════════════════════════

// ── 1. Expose shared state for modules / tests ────────────────────────────
// Modules (editor_store, regression_tests, perf_monitor) resolve `state` lazily
// through this window reference rather than being inline in this file.
window._rgeState    = state;
window.getNode      = getNode;
window.shapeRefs    = typeof shapeRefs !== 'undefined' ? shapeRefs : null;
window.scheduleRender      = scheduleRender;
window.flushScheduledRender = flushScheduledRender;
window.RenderFlags         = RenderFlags;

// Expose paint helpers for TilemapPaintController
window.getSelectedNodeIds         = typeof getSelectedNodeIds !== 'undefined' ? getSelectedNodeIds : null;
window.selectNode                 = selectNode;
window.getViewportTilePaintCell   = typeof getViewportTilePaintCell !== 'undefined' ? getViewportTilePaintCell : null;
window.drawTileHoverOverlay       = typeof drawTileHoverOverlay !== 'undefined' ? drawTileHoverOverlay : null;
window.clearTileHoverOverlay      = typeof clearTileHoverOverlay !== 'undefined' ? clearTileHoverOverlay : null;
window.paintTileMapAt             = paintTileMapAt;
window.serializeScene             = serializeScene;
window.pushHistory                = pushHistory;
window.updateTileMapToolButtons   = typeof updateTileMapToolButtons !== 'undefined' ? updateTileMapToolButtons : null;
window.renderTileMapsPanel        = renderTileMapsPanel;
window.resetTileMapStrokeTracking = typeof resetTileMapStrokeTracking !== 'undefined' ? resetTileMapStrokeTracking : null;
window.getTileMapShapePreviewCells = typeof getTileMapShapePreviewCells !== 'undefined' ? getTileMapShapePreviewCells : null;
window.getUniqueTileMapCells      = typeof getUniqueTileMapCells !== 'undefined' ? getUniqueTileMapCells : null;
window.scheduleTileMapCanvasRedraw = scheduleTileMapCanvasRedraw;
window.endViewportGroupSelect     = typeof endViewportGroupSelect !== 'undefined' ? endViewportGroupSelect : null;

// ── 2. SceneEditorAPI — stable public surface for tests & external tools ──
window.SceneRenderScheduler.registerHandlers({
  sceneTabs: renderSceneTabs,
  tree: refreshTree,
  inspector: refreshInspector,
  spritesheets: renderSpritesheetsPanel,
  tilesets: renderTilesetsPanel,
  tilemaps: renderTileMapsPanel,
  viewport: renderViewport,
  sceneSummary: updateSceneSummary,
  historyBtns: updateHistoryButtons,
  zoomReadout: updateZoomReadout,
  spriteFrames: renderSpriteFramesPanel
});

window.SceneEditorAPI = {
  serializeScene,
  pushHistory,
  refreshAll,
  refreshTree,
  refreshInspector,
  renderViewport,
  setStatus,
  getNodes,
  getNode,
  selectNode,
  isRootNodeId,
  isUiNodeType,
  createNode: typeof addNode !== 'undefined'
    ? (type, parentId) => { addNode(type, parentId); return state.sceneState.nodes.find(n => n.type === type && n.parentId === (parentId || 'root')); }
    : null,
  deleteNode: (id) => {
    // Delegate to the proper deleteNode which recursively removes children.
    if (id && !isRootNodeId(id)) deleteNode(id);
  },
  getEditorState: () => state.editorState,
  getState: () => state,
};

// Expose state and key functions for camera preview panel and other tools
window.state     = state;
window.getNodes  = getNodes;
window.getNode   = getNode;
window.notifyCameraPreviewSceneChanged = notifyCameraPreviewSceneChanged;
window.refreshCameraPreviewSelector    = refreshCameraPreviewSelector;

// ── 3. Integrate EditorStore with the render scheduler ───────────────────
// When scheduleRender is called with a flag, also touch the matching
// EditorStore slice so panel subscribers are notified.
(function _patchScheduleRenderForStore() {
  const _orig = scheduleRender;
  const _store = () => window.EditorStore;
  const _map = [
    ['TREE',          'tree'],
    ['INSPECTOR',     'inspector'],
    ['VIEWPORT',      'viewport'],
    ['SCENE_SUMMARY', 'sceneSummary'],
    ['TILEMAPS',      'tilemaps'],
    ['SCENE_TABS',    'sceneTabs'],
    ['HISTORY_BTNS',  'historyBtns'],
    ['ZOOM_READOUT',  'zoomReadout'],
    ['SPRITESHEETS',  'spritesheets'],
    ['TILESETS',      'tilesets'],
    ['SPRITE_FRAMES', 'spriteFrames'],
  ];
  // Override the module-level var (works because scheduleRender is a named fn
  // exposed on window; the scheduler closures captured above still fire).
  window.scheduleRender = function scheduleRenderV49(flags) {
    _orig(flags);
    const store = _store();
    if (!store) return;
    for (const [flagName, slice] of _map) {
      if (flags & RenderFlags[flagName]) store.touch(slice);
    }
  };
  // Keep the local reference current for calls already captured in closures.
  // We cannot reassign the `const scheduleRender` above, but calls via
  // window.scheduleRender will use the patched version.  Calls from within
  // scene_editor.js itself use the original — that's acceptable because the
  // original still fires all the actual render work; the store touch is additive.
})();

// ── 4. PerfMonitor hooks into each render function ────────────────────────
(function _patchRenderFnsForPerf() {
  const pm = () => window.PerfMonitor;
  const _patchGlobal = (name, slice) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function(...args) {
      pm()?.recordRedraw(slice);
      return orig.apply(this, args);
    };
  };
  // The render functions are declared in scene_editor.js function scope, not
  // on window.  They are called via window.scheduleRender → _flushRender which
  // uses the local references.  We patch the window-exposed copies where
  // possible and accept that the flush path will always have the originals.
  // A lighter approach: wrap the _flushRender path directly via a
  // SceneEditorAPI.scheduleRender that records before dispatching.
  // Instead, we record inside the EditorStore subscriber path — every time
  // a slice version increments, that IS a redraw event.
  if (window.EditorStore) {
    for (const slice of window.EditorStore.slices) {
      window.EditorStore.subscribe(slice, (s) => pm()?.recordRedraw(s));
    }
  }
})();

// ── 5. Mount UIEditorLayer (centering observer) ───────────────────────────
(function _mountUIEditorLayer() {
  if (window.UIEditorLayer) {
    window.UIEditorLayer.mount();
  }
})();

// ── 6. Expose TilemapPaintController globally for use from initViewport ───
// initViewport already bound its own begin/update/end functions before v49.
// We register the controller so future code can call the canonical module.
if (window.TilemapPaintController) {
  window._rgeTileMapPaint = window.TilemapPaintController;
}

// ── 7. Dispatch dock-changed event from dock_drag.js integration ──────────
// dock_drag.js calls window.dispatchEvent(new CustomEvent('rge:dock-changed'))
// after each panel is re-docked.  UIEditorLayer listens for this to recenter.
// If dock_drag doesn't dispatch yet, we shim it from the MutationObserver
// inside UIEditorLayer which already covers that case.

// ── 8. Wire regression tests shortcut (Alt+Shift+T) ──────────────────────
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
    if (RGE_ROOT.RGETests) {
      console.clear();
      RGE_ROOT.RGETests.runAll();
    }
    e.preventDefault();
  }
});

// ── Camera Path Delete key support ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && isCameraPathEditMode()) {
    const node = getSelectedCameraPathNode();
    if (!node) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    const indices = state.cameraPathEditor.selectedPointIndices;
    if (!indices.size) return;
    e.preventDefault();
    e.stopPropagation();
    deleteSelectedCameraPathPoints(node.id);
  }
}, true);

// ── Done ──────────────────────────────────────────────────────────────────
console.info('[RGE v49] Architecture stabilisation modules loaded. Alt+Shift+P = perf monitor, Alt+Shift+T = run tests.');



/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};

/* Camera Preview close is handled by the dock system's .dock-tab-close button
   via dock_drag.js hideTab() — no custom handler needed here. */
