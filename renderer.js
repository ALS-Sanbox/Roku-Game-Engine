'use strict';

const {
  getCreatableNodeTypes,
  createDefaultNode,
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
  ROOT_NODE_ID
} = window.RokuNodes;

const GRID_SIZE = 32;
const HISTORY_LIMIT = 100;

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
  logs: [],
  spritePanel: {
    searchQuery: '',
    sortMode: 'name-asc'
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
  ui: { sceneMenuOpen: false, fileMenuOpen: false, sceneRenameIndex: null },
  instanceEditor: { selectedSourceNodeByInstance: {} },
  startupState: { recentScenes: [], recoveries: [] },
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

let stage, sceneLayer, cameraGroup, gridGroup, contentGroup, transformer;
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

  if (state.activeSceneIndex >= 0 && state.scenes[state.activeSceneIndex]) {
    persistActiveSceneEntry();
  }

  state.activeSceneIndex = index;

  applyLoadedSceneData(sceneEntry.sceneState, sceneEntry.editorState);
  const nextDocumentState = cloneDocumentState(sceneEntry.documentState || {});
  nextDocumentState.autosaveTimer = state.document.autosaveTimer;
  state.document = nextDocumentState;

  rebuildImageCache();
  rebuildSpritesheetsFromSceneState();
  rebuildSpriteFramesLibrariesFromSceneState();
  refreshAll();
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

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
  const before = serializeScene();
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
  refreshAll();
  if (before !== serializeScene()) pushHistory(options.revert ? 'Revert inherited scene to base' : 'Rebase inherited scene', before);
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
  const baseline = options.baseline || serializeScene();
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
  refreshAll();
  if (baseline !== serializeScene()) pushHistory(`Override ${fieldPath}`, baseline);
  setStatus(`Updated override on ${instanceNode.name}.`);
  return true;
}

function revertSceneInstanceOverrideNode(instanceNodeId, sourceNodeId) {
  const instanceNode = getNode(instanceNodeId);
  if (!instanceNode || instanceNode.type !== 'SceneInstance') return false;
  const overrides = ensureSceneInstanceOverrides(instanceNode);
  if (!overrides[sourceNodeId]) return false;
  const baseline = serializeScene();
  delete overrides[sourceNodeId];
  refreshAll();
  if (baseline !== serializeScene()) pushHistory('Revert instance override', baseline);
  setStatus(`Reverted override for source node ${sourceNodeId}.`);
  return true;
}

function revertAllSceneInstanceOverrides(instanceNodeId) {
  const instanceNode = getNode(instanceNodeId);
  if (!instanceNode || instanceNode.type !== 'SceneInstance') return false;
  const overrides = ensureSceneInstanceOverrides(instanceNode);
  if (!Object.keys(overrides).length) return false;
  const baseline = serializeScene();
  instanceNode.properties.sourceOverrides = {};
  refreshAll();
  if (baseline !== serializeScene()) pushHistory('Revert all instance overrides', baseline);
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
    runtime: normalizeScene(migration.data),
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
  refreshAll();
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
  refreshAll();
  setStatus(`Reloaded scene instance source for ${node.name}.`);
}

window.onResize = function () {
  if (!viewportReady || !stage) return;
  const vp = document.getElementById('stage-container');
  if (!vp) return;
  stage.width(vp.clientWidth || 800);
  stage.height(vp.clientHeight || 600);
  renderViewport();
};

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════
function init() {
  bindWindowControls();
  bindStatusbar();
  initViewport();
  renderCreateButtons();
  populateCreateGrid();
  renderAudioPanel(null);
  bindToolbar();
  bindFileMenu();
  bindSceneMenu();
  bindSceneActions();
  bindDockUI();
  initPanelResizers();
  bindInspectorSearch();
  ensureSceneTreeContextMenu();
  ensureFilesystemContextMenu();
  state.scenes = [buildSceneEntryFromCurrentState()];
  state.activeSceneIndex = 0;

  markHistoryBaseline();
  appendLog('Ready.');
  refreshAll();
  refreshFilesystem();
  initAutosaveLoop();
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
      setStatus(`Updated project settings for ${state.projectSettings.projectName}.`);
    });
  }
  void loadProjectSettings(state.projectRoot);
  void checkStartupRecovery();
}

function bindWindowControls() {
  bindClick('btn-close',    () => window.electronAPI.closeWindow());
  bindClick('btn-minimize', () => window.electronAPI.minimizeWindow());
  bindClick('btn-maximize', () => window.electronAPI.maximizeWindow());
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
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


function renderCreateButtons() {
  const host = document.getElementById('node-create-buttons');
  if (!host || !window.RokuNodes.NodeRegistry) return;
  const preferredOrder = ['Node2D', 'Sprite2D', 'AnimatedSprite2D', 'Camera2D', 'SceneInstance'];
  const reg = window.RokuNodes.NodeRegistry;
  const types = preferredOrder.filter((t) => reg[t]);
  const fallback = Object.keys(reg).filter((t) => !types.includes(t) && t !== 'SceneRoot');
  host.innerHTML = '';
  [...types, ...fallback].forEach((type) => {
    const def = reg[type] || {};
    if (!def.creatable) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'create-node-btn';
    btn.textContent = def.displayName || type;
    btn.addEventListener('click', () => addNode(type));
    host.appendChild(btn);
  });
}

function populateCreateGrid() {
  const grid = document.getElementById('create-grid');
  if (!grid) return;
  grid.innerHTML = '';
  getCreatableNodeTypes().forEach((def) => {
    const btn = document.createElement('button');
    btn.className = 'create-card';
    btn.textContent = def.displayName;
    btn.addEventListener('click', () => addNode(def.type));
    grid.appendChild(btn);
  });
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

  bindClick('btn-sheet-grid', () => {
    state.spriteEditor.showGrid = !state.spriteEditor.showGrid;
    document.getElementById('btn-sheet-grid')?.classList.toggle('active', state.spriteEditor.showGrid);
    renderSpritesheetsPanel();
  });

  ['sheet-tile-w', 'sheet-tile-h', 'sheet-padding'].forEach((id) => {
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
    renderViewport();
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
    renderViewport();
  });

  bindClick('sf-btn-clear-frames', () => {
    const node = getSelectedAnimationNode();
    if (node) pushHistory('Clear animation frames');
    state.spriteEditor.animationFrames = [];
    state.spriteEditor.selectedFrameIndex = -1;
    syncAnimationClipToSelectedNode();
    stopAnimationPreview();
    renderSpriteFramesPanel();
    renderViewport();
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
    renderViewport();
    setStatus(state.showGrid ? 'Grid enabled.' : 'Grid hidden.');
  });
  bindClick('btn-export', () => { void exportRokuProject(); });
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
      if (stage?.container()) stage.container().style.cursor = state.tool === 'pan' ? 'grab' : 'default';
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

  if (typeof onBindItems === 'function') onBindItems(closeMenu);
  return { closeMenu, openMenu, trigger, dropdown };
}

function normalizeProjectSettings(settings = {}, projectRoot = '') {
  const fallbackName = String(projectRoot || state.projectRoot || '').trim().split(/[\/]/).pop() || 'RokuEngine Game';
  const input = settings && typeof settings.input === 'object' && !Array.isArray(settings.input) ? settings.input : {};
  const screen = settings && typeof settings.screen === 'object' && !Array.isArray(settings.screen) ? settings.screen : {};
  return {
    ...settings,
    physics: { ...(settings.physics || {}), contactMethod: settings.physics?.contactMethod === 'circle' ? 'circle' : 'aabb' },
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
    sceneEntry.documentState = Object.assign({}, documentState, {
      currentScenePath: result.filePath || targetScenePath,
      currentEditStatePath: result.editStatePath || '',
      pendingRecoveryId: '',
      lastAutosaveSnapshot: '',
      lastSavedSnapshot: '',
      dirty: false,
      autosaveTimer: null
    });

    savedItems.push(sceneEntry.documentState.currentScenePath || sceneName);
  }

  state.projectRoot = normalizedRoot;
  if (originalActiveIndex >= 0 && originalActiveIndex < state.scenes.length) setActiveScene(originalActiveIndex);
  markHistoryBaseline();
  persistActiveSceneEntry();
  refreshAll();
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
  setStatus(`Exported Roku project to ${result.exportRoot}.`);
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
    const isSceneFile = lowerPath.endsWith('.rkscene') || lowerPath.endsWith('.json');
    const isSidecar = lowerPath.endsWith('.editstate') || lowerPath.includes('.autosave');
    if (isSceneFile && !isSidecar) bucket.push(filePath);
  }
  if (Array.isArray(tree.children)) tree.children.forEach((child) => getSceneFilesFromProjectTree(child, bucket));
  return bucket;
}

async function openProjectFromRoot(rootPath) {
  const projectRoot = String(rootPath || '').trim();
  if (!projectRoot) return false;

  state.projectRoot = projectRoot;
  await loadProjectSettings(projectRoot);
  await refreshFilesystem(projectRoot);

  const listResult = await window.electronAPI.listProjectFiles(projectRoot);
  if (!listResult?.success || !listResult.tree) {
    setStatus(`Could not open project: ${listResult?.reason || 'Unknown error'}`, true);
    return false;
  }

  const scenePaths = getSceneFilesFromProjectTree(listResult.tree)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  state.scenes = [];
  state.activeSceneIndex = -1;
  state.ui.sceneRenameIndex = null;
  state.instanceCache.clear();

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
    refreshAll();
    await refreshFilesystem(projectRoot);
    setStatus(`Opened project ${projectRoot} (no scenes found).`);
    return true;
  }

  for (const scenePath of scenePaths) {
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
  refreshAll();
  await refreshFilesystem(projectRoot);
  setStatus(`Opened project ${projectRoot} (${state.scenes.length} scene${state.scenes.length === 1 ? '' : 's'}).`);
  return true;
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

function bindFileMenu() {
  bindToolbarMenu({
    triggerId: 'btn-file-menu',
    dropdownId: 'file-menu-dropdown',
    stateKey: 'fileMenuOpen',
    onBindItems: (closeMenu) => {
      bindClick('menu-create-project', () => { closeMenu(); void createProject(); });
      bindClick('menu-open-project', () => { closeMenu(); void openProject(); });
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
    tab.addEventListener('click', () => {
      document.querySelectorAll('.workspace-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.section-toggle');
    if (btn) btn.closest('.inspector-section')?.classList.toggle('collapsed');
  });
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

function activateBottomPanel(key) {
  if (!key) return;
  document.querySelectorAll('.bottom-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.bottom === key));
  document.querySelectorAll('.bottom-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.bottomPanel === key));
  if (key === 'spriteframes') renderSpriteFramesPanel();
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
  loadImageIntoCache(node.id, asset.dataUrl, () => refreshAll());
  refreshAll();
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
  const container = document.getElementById('stage-container');
  stage = new Konva.Stage({ container: 'stage-container', width: container.clientWidth || 800, height: container.clientHeight || 600 });

  const el = stage.container();
  el.tabIndex = 0; el.style.outline = 'none'; el.style.cursor = 'default';
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  bindFilesystemViewportDrop(el);

  sceneLayer   = new Konva.Layer();
  cameraGroup  = new Konva.Group();
  gridGroup    = new Konva.Group({ listening: false });
  contentGroup = new Konva.Group();

  transformer = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    borderStroke: '#478cbf', anchorFill: '#478cbf', anchorStroke: '#141620',
    keepRatio: false, centeredScaling: false, ignoreStroke: true
  });

  transformer.on('transformstart', () => {
    state.history.transformSnapshot = serializeScene();
    captureTransformerSession();
  });
  transformer.on('transformend', () => {
    syncSelectedNodesFromShapes();
    const before = state.history.transformSnapshot;
    state.history.transformSnapshot = null;
    state.transformerSession = null;
    refreshAll();
    if (before && before !== serializeScene()) pushHistory(getSelectedNodeIds().length > 1 ? 'Transform selection' : 'Transform node', before);
  });

  cameraGroup.add(gridGroup, contentGroup, transformer);
  sceneLayer.add(cameraGroup);
  stage.add(sceneLayer);

  marqueeRect = new Konva.Rect({ visible: false, fill: 'rgba(71,140,191,0.18)', stroke: '#6ec6e8', dash: [6, 4], listening: false });
  sceneLayer.add(marqueeRect);

  // Stage click: deselect
  stage.on('click tap', (e) => {
    if (suppressStageClick) { suppressStageClick = false; return; }
    if (e.target === stage) selectNode(null);
  });

  // Marquee selection
  stage.on('mousedown touchstart', (e) => {
    const evt = e.evt || {};
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
    if (!state.viewport.isMarqueeSelecting || !marqueeRect) return;
    const pos = stage.getPointerPosition(); if (!pos) return;
    const start = state.viewport.marqueeStart || marqueeRect.position();
    marqueeRect.setAttrs({ x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) });
    sceneLayer.batchDraw();
  });

  stage.on('mouseup touchend', () => {
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
    if (state.tool === 'pan' || e.button === 1 || e.button === 2 || e.shiftKey || e.altKey) { e.preventDefault(); beginPan(e); }
  });
  el.addEventListener('pointermove', (e) => {
    if (!state.viewport.isPanning || e.pointerId !== activePanId) return;
    state.viewport.x = state.viewport.panStart.originX + (e.clientX - state.viewport.panStart.x);
    state.viewport.y = state.viewport.panStart.originY + (e.clientY - state.viewport.panStart.y);
    applyViewportTransform();
  });
  const endPan = (e) => {
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
  state.editorState.selectedSheetId = state.selectedSheetId || null;
  state.editorState.selectedSpriteFramesId = state.selectedSpriteFramesId || null;
}

function applyLoadedSceneData(runtimeScene, editorState) {
  state.sceneState = normalizeScene(runtimeScene);
  state.editorState = normalizeEditorState(editorState, state.sceneState, runtimeScene);
  state.selectedIds = getNormalizedSelection(state.editorState.selection || [], null);
  state.selectedId = state.selectedIds[0] || null;
  state.viewport.x = Number(state.editorState.viewport?.x) || 0;
  state.viewport.y = Number(state.editorState.viewport?.y) || 0;
  state.viewport.scale = Math.max(0.2, Number(state.editorState.viewport?.scale) || 1);
  state.tree.expanded = Object.fromEntries((state.editorState.expandedTreeNodes || []).map((id) => [id, true]));
  if (!Object.keys(state.tree.expanded).length) state.tree.expanded = { [getRootNodeId()]: true };
}

function updateEditorSelection() {
  syncEditorStateFromRuntime();
}

function setSelection(ids, primaryId = null, options = {}) {
  const normalized = getNormalizedSelection(ids, primaryId);
  state.selectedIds = normalized;
  state.selectedId  = primaryId && normalized.includes(primaryId) ? primaryId : (normalized[normalized.length - 1] || null);
  if (state.selectedId) ensureNodeAncestorsExpanded(state.selectedId);
  normalized.forEach((id) => ensureNodeAncestorsExpanded(id));
  updateEditorSelection();
  refreshTree();
  refreshInspector();
  syncAnimationEditorFromSelection();
  attachTransformer();
  renderViewport();

  // Auto-open SpriteFrames when AnimatedSprite2D selected
  const selNode = getNode(state.selectedId);
  if (selNode?.type === 'AnimatedSprite2D') {
    activateBottomPanel('spriteframes');
  }
  renderSpriteFramesPanel();

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
  const before = serializeScene();
  const toDelete = new Set();
  const walk = (id) => {
    toDelete.add(id);
    getChildren(id).forEach((c) => walk(c.id));
  };
  roots.forEach(walk);
  state.sceneState.nodes = getNodes().filter((n) => !toDelete.has(n.id));
  const fallbackId = getNode(roots[0])?.parentId || getRootNodeId();
  refreshAll();
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
  const before = serializeScene();
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
  refreshAll();
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
    snapshot: serializeScene(),
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
  refreshAll();
  if (drag.snapshot && drag.snapshot !== serializeScene()) pushHistory(getSelectedNodeIds().length > 1 ? 'Move selection' : 'Move node', drag.snapshot);
}
function nudgeSelectedNodes(dx, dy) {
  const ids = getMovableSelectedNodeIds();
  if (!ids.length) return false;
  const before = serializeScene();
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
  refreshAll();
  if (before !== serializeScene()) pushHistory(ids.length > 1 ? 'Nudge selection' : 'Nudge node', before);
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
      node.transform.scaleX = Number(baseline.nodeScaleX) || 1;
      node.transform.scaleY = Number(baseline.nodeScaleY) || 1;
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
  refreshAll();
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
  refreshAll();
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
  const beforeSnapshot = serializeScene();
  const orderedIds = siblings.map((c) => c.id);
  const [moved] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, moved);
  orderedIds.forEach((id, i) => { const c = getNode(id); if (c) c.zIndex = i; });
  refreshAll(); selectNode(nodeId);
  pushHistory(`Reorder ${node.name}`, beforeSnapshot);
  setStatus(`Moved ${node.name} ${direction}.`);
  return true;
}

function toggleNodeVisibility(nodeId) {
  const node = getNode(nodeId); if (!node) return false;
  const before = serializeScene();
  node.visible = node.visible === false;
  refreshAll();
  pushHistory(`${node.visible ? 'Show' : 'Hide'} ${node.name}`, before);
  setStatus(`${node.visible ? 'Shown' : 'Hidden'} ${node.name}.`);
  return true;
}

function toggleNodeLocked(nodeId) {
  const node = getNode(nodeId); if (!node) return false;
  const before = serializeScene();
  node.locked = !node.locked;
  refreshAll();
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
  const before = serializeScene();
  const toDelete = new Set();
  const walk = (id) => { toDelete.add(id); getChildren(id).forEach((c) => walk(c.id)); };
  walk(nodeId);
  state.sceneState.nodes = getNodes().filter((n) => !toDelete.has(n.id));
  if (state.selectedId && toDelete.has(state.selectedId)) {
    state.selectedId = node.parentId || getRootNodeId();
    if (state.selectedId) state.editorState.selection = [state.selectedId];
  }
  refreshAll();
  pushHistory(`Delete ${node.name}`, before);
  setStatus(`Deleted ${node.name}.`);
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
  refreshAll(); selectNode(rootClone.id);
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
  refreshAll(); selectNode(nodeId);
  pushHistory(`Reparent ${node.name}`, before);
  setStatus(`Reparented ${node.name} to ${getNode(nextParentId)?.name || nextParentId}.`);
  return true;
}
function reparentNode(nodeId, nextParentId) { return moveNodeToIndex(nodeId, nextParentId, null); }

function addNode(type, parentId = getRootNodeId()) {
  if (type === 'SceneInstance') {
    void instantiateSceneFromFile(parentId);
    return;
  }
  const def = getNodeDef(type); if (!def) return;
  const parent = getNode(parentId) || getNode(getRootNodeId());
  pushHistory(`Add ${def.displayName || type}`);
  const node = createDefaultNode(type);
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
  node.transform.x = snapValue(80 + (getNodes().length * 18));
  node.transform.y = snapValue(80 + (getNodes().length * 18));
  node.zIndex      = getChildren(node.parentId).length;
  getNodes().push(node);
  refreshAll(); selectNode(node.id);
  setStatus('Added ' + (def.displayName || type) + '.');
  
}


function finishInlineSceneRename(index, value, options = {}) {
  const activeBefore = state.ui.sceneRenameIndex;
  state.ui.sceneRenameIndex = null;
  const canceled = !!options.cancel;
  if (canceled) {
    refreshAll();
    return false;
  }
  const targetIndex = Number.isInteger(index) ? index : state.activeSceneIndex;
  if (targetIndex !== state.activeSceneIndex) setActiveScene(targetIndex);
  const renamed = renameCurrentScene(value);
  refreshAll();
  return renamed || activeBefore !== null;
}

function startInlineSceneRename(index = state.activeSceneIndex) {
  if (!Number.isInteger(index) || index < 0 || !state.scenes[index]) return false;
  state.ui.sceneRenameIndex = index;
  refreshAll();
  const input = sceneTabsEl?.querySelector(`.scene-tab-input[data-scene-index="${index}"]`);
  if (input) {
    input.focus();
    input.select();
  }
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
    btn.addEventListener('click', () => {
      if (state.ui.sceneRenameIndex !== null && state.ui.sceneRenameIndex !== index) {
        finishInlineSceneRename(state.ui.sceneRenameIndex, sceneTabsEl?.querySelector('.scene-tab-input')?.value || '', { cancel: true });
      }
      setActiveScene(index);
    });
    btn.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (index !== state.activeSceneIndex) setActiveScene(index);
      startInlineSceneRename(index);
    });
    sceneTabsEl.appendChild(btn);
  });
}

function refreshAll() {
  renderSceneTabs();
  refreshTree();
  refreshInspector();
  syncAnimationEditorFromSelection({ silent: true });
  renderSpritesheetsPanel();
  renderViewport();
  updateSceneSummary();
  updateHistoryButtons();
  updateZoomReadout();
  renderSpriteFramesPanel();
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
// ══════════════════════════════════════════════════════════════════════
// SCENE TREE
// ══════════════════════════════════════════════════════════════════════
function refreshTree() {
  if (!sceneTreeEl) return;
  sceneTreeEl.innerHTML = '';
  const ancestryIds = getSelectedAncestryIds();
  const selectedIds = getSelectionSet();
  const drag = { sourceId: null, overId: null, overMode: null, targetParentId: null, beforeNodeId: null };

  const clearDropTargets = () => sceneTreeEl.querySelectorAll('.tree-row.drag-over, .tree-row.drop-before, .tree-row.drop-after')
    .forEach((r) => r.classList.remove('drag-over', 'drop-before', 'drop-after'));

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
    row.draggable = !isRootNodeId(node.id);

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
    toggle.addEventListener('click', (e) => { e.stopPropagation(); if (canExpand) toggleTreeExpanded(node.id); });
    row.appendChild(toggle);

    // Main row button
    const main = document.createElement('button');
    main.type = 'button'; main.className = 'tree-main';

    const left = document.createElement('div');
    left.className = 'tree-main-left';

    const visBtn = document.createElement('button');
    visBtn.type = 'button'; visBtn.className = 'tree-icon-btn';
    visBtn.title = node.visible === false ? 'Show' : 'Hide';
    visBtn.textContent = node.visible === false ? '○' : '◉';
    visBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNodeVisibility(node.id); });

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button'; lockBtn.className = 'tree-icon-btn' + (node.locked ? ' locked' : '');
    lockBtn.title = node.locked ? 'Unlock' : 'Lock';
    lockBtn.textContent = node.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNodeLocked(node.id); });

    const nameEl = document.createElement('span'); nameEl.className = 'tree-name'; nameEl.textContent = node.name;

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

    const mkOrderBtn = (label, dir, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tree-order-btn'; b.textContent = label; b.title = `Move ${dir}`; b.disabled = disabled;
      b.addEventListener('click', (e) => { e.stopPropagation(); reorderNodeAmongSiblings(node.id, dir); });
      return b;
    };
    const sibIdx = getSiblingIndex(node.id);
    const sibLen = getSiblingNodes(node.id).length;
    right.appendChild(typeEl);
    right.appendChild(mkOrderBtn('↑', 'up', isRootNodeId(node.id) || sibIdx <= 0));
    right.appendChild(mkOrderBtn('↓', 'down', isRootNodeId(node.id) || sibIdx >= sibLen - 1));

    main.appendChild(left); main.appendChild(right);
    main.addEventListener('click', (e) => selectNode(node.id, { toggle: e.ctrlKey || e.metaKey }));
    row.appendChild(main);

    const openMenu = (e) => { e.preventDefault(); selectNode(node.id, { toggle: e.ctrlKey || e.metaKey }); openSceneTreeContextMenu(node.id, e.clientX, e.clientY); };
    row.addEventListener('contextmenu', openMenu);
    main.addEventListener('contextmenu', openMenu);

    // Drag & drop
    row.addEventListener('dragstart', (e) => {
      if (isRootNodeId(node.id)) { e.preventDefault(); return; }
      drag.sourceId = node.id;
      try { e.dataTransfer.setData('text/plain', node.id); } catch (_) {}
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      closeSceneTreeContextMenu();
    });
    row.addEventListener('dragend', () => {
      Object.assign(drag, { sourceId: null, overId: null, overMode: null, targetParentId: null, beforeNodeId: null });
      clearDropTargets();
    });
    row.addEventListener('dragover', (e) => {
      const sourceId = drag.sourceId; if (!sourceId || sourceId === node.id) return;
      const rect = row.getBoundingClientRect(), offsetY = e.clientY - rect.top;
      const band = Math.min(8, rect.height * 0.25);
      let mode = 'inside', targetParentId = node.id, beforeNodeId = null;
      if (offsetY < band) { mode = 'before'; targetParentId = node.parentId || getRootNodeId(); beforeNodeId = node.id; }
      else if (offsetY > rect.height - band) {
        mode = 'after'; targetParentId = node.parentId || getRootNodeId();
        const siblings = getChildren(targetParentId);
        beforeNodeId = siblings[siblings.findIndex((c) => c.id === node.id) + 1]?.id || null;
      }
      if (!canReparentNode(sourceId, targetParentId)) return;
      e.preventDefault();
      Object.assign(drag, { overId: node.id, overMode: mode, targetParentId, beforeNodeId });
      clearDropTargets();
      row.classList.add(mode === 'inside' ? 'drag-over' : mode === 'before' ? 'drop-before' : 'drop-after');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (mode === 'inside' && canExpand) state.tree.expanded[node.id] = true;
    });
    row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over', 'drop-before', 'drop-after'); });
    row.addEventListener('drop', (e) => {
      const sourceId = drag.sourceId || (() => { try { return e.dataTransfer.getData('text/plain'); } catch (_) { return null; } })();
      clearDropTargets(); if (!sourceId) return; e.preventDefault();
      moveNodeToIndex(sourceId, drag.targetParentId || node.id, drag.overMode === 'inside' ? null : drag.beforeNodeId);
      Object.assign(drag, { overId: null, overMode: null, targetParentId: null, beforeNodeId: null });
    });

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
    addContextMenuItem(menu, 'Add Child Node2D', () => addNode('Node2D', node.id));
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
  }
  addContextMenuSeparator(menu);
  const sibIdx = getSiblingIndex(node.id), sibLen = getSiblingNodes(node.id).length;
  addContextMenuItem(menu, 'Move Up',     () => reorderNodeAmongSiblings(node.id, 'up'),     { disabled: isRootNodeId(node.id) || sibIdx <= 0 });
  addContextMenuItem(menu, 'Move Down',   () => reorderNodeAmongSiblings(node.id, 'down'),   { disabled: isRootNodeId(node.id) || sibIdx >= sibLen - 1 });
  addContextMenuItem(menu, 'Move To Top', () => reorderNodeAmongSiblings(node.id, 'top'),    { disabled: isRootNodeId(node.id) || sibIdx <= 0 });
  addContextMenuItem(menu, 'Move To Bottom', () => reorderNodeAmongSiblings(node.id, 'bottom'), { disabled: isRootNodeId(node.id) || sibIdx >= sibLen - 1 });
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
  const baseline = options.baseline || serializeScene();
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
    if (field.key === 'properties.tiles' && !Array.isArray(node.properties.tiles)) node.properties.tiles = [];
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
  refreshTree();
  renderViewport();
  updateSceneSummary();
  if (options.refreshInspector !== false) refreshInspector();
  if (baseline !== serializeScene()) pushHistory(`Change ${field.label} (${nodes.length} nodes)`, baseline);
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
    const snapshot = fb[key] || serializeScene();
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
    wrapper.appendChild(toggle);
    const body = document.createElement('div');
    body.className = 'section-body';
    groupFields.filter((field) => field.type !== 'pivot_preset').forEach((field) => body.appendChild(buildMultiEditField(nodeIds, selectedNodes, field)));
    wrapper.appendChild(body);
    inspectorEl.appendChild(wrapper);
  });
}
function refreshInspector() {
  if (!inspectorEl || !inspectorEmpty) return;
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

  const sections = getNodeFieldsBySection(node.type);
  Object.entries(sections).forEach(([sectionName, fields]) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'inspector-section';
    const toggle = document.createElement('button');
    toggle.className = 'section-toggle'; toggle.type = 'button'; toggle.textContent = sectionName;
    wrapper.appendChild(toggle);
    const body = document.createElement('div');
    body.className = 'section-body';
    fields.forEach((field) => body.appendChild(buildField(node, field)));
    if ((sectionName === 'Node' || sectionName === 'Identity') && !isRootNodeId(node.id)) body.appendChild(buildSiblingOrderField(node));
    if (node.type === 'Sprite2D'         && sectionName === 'Sprite') body.appendChild(buildImagePreview(node, false));
    if (node.type === 'AnimatedSprite2D' && sectionName === 'Sprite') body.appendChild(buildImagePreview(node, true));
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
  if (false) {
    return {
      width: Math.max(1, (Number(node.properties?.tileWidth) || 32) * (Number(node.properties?.mapWidth) || 1)),
      height: Math.max(1, (Number(node.properties?.tileHeight) || 32) * (Number(node.properties?.mapHeight) || 1))
    };
  }
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
      input = document.createElement('input'); input.type = 'number';
      if (field.min  != null) input.min  = field.min;
      if (field.max  != null) input.max  = field.max;
      if (field.step != null) input.step = field.step;
      input.value = value ?? 0;
      input.addEventListener('focus',  () => rememberFieldStart(node.id, field.key));
      input.addEventListener('change', () => updateField(node.id, field, Number(input.value)));
      break;
    }
    case 'color': {
      input = document.createElement('input'); input.type = 'color';
      input.value = /^#([0-9a-f]{6})$/i.test(value) ? value : '#478cbf';
      input.addEventListener('focus',  () => rememberFieldStart(node.id, field.key));
      input.addEventListener('input',  () => updateField(node.id, field, input.value, { deferHistory: true }));
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
      }
      options.forEach((opt) => {
        const o = document.createElement('option'); o.value = opt;
        o.textContent = (node.type === 'AnimatedSprite2D' && field.key === 'properties.spriteSheetId')
          ? (getSheetById(opt)?.name || opt || 'No spritesheets') : opt;
        if (value === opt) o.selected = true;
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
        const result = await (window.electronAPI && typeof window.electronAPI.openImageFile === 'function' ? window.electronAPI.openImageFile({ assetKind: 'image' }) : Promise.resolve({ success: false, reason: 'electron_api_missing' }));
        if (!result.success) return;
        pushHistory('Pick image');
        const n = getNode(node.id); if (!n) return;
        n.properties.imagePath = result.resPath || result.filePath; n.properties.imageDataUrl = result.dataUrl;
        loadImageIntoCache(n.id, result.dataUrl, () => { refreshAll(); setStatus('Loaded image for ' + n.name + '.'); });
      });
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      clearBtn.style.cssText = 'padding:3px 7px;border-radius:3px;background:var(--panel-3);border:1px solid var(--border);color:var(--text-dim);font-size:11px;cursor:pointer';
      clearBtn.addEventListener('click', () => {
        pushHistory('Clear image');
        const n = getNode(node.id); if (!n) return;
        n.properties.imagePath = ''; n.properties.imageDataUrl = '';
        state.imageCache.delete(n.id); refreshAll(); setStatus('Cleared image.');
      });
      row.appendChild(pickBtn); row.appendChild(clearBtn); wrap.appendChild(row); return wrap;
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
  refreshAll();
}

function buildImagePreview(node, animated) {
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const labelEl = document.createElement('span'); labelEl.style.cssText = 'font-size:11px;color:var(--text-dim);';
  labelEl.textContent = animated ? 'Sheet Preview' : 'Image Preview';
  wrap.appendChild(labelEl);
  const box = document.createElement('div'); box.className = 'sprite-preview';
  const dataUrl = node.properties.imageDataUrl;
  if (!dataUrl) { box.textContent = animated ? 'No sheet loaded' : 'No image loaded'; wrap.appendChild(box); return wrap; }
  if (animated) {
    const sheet = getNodeAssignedSheet(node);
    if (!sheet?.image?.complete) { box.textContent = sheet ? 'Loading…' : 'No spritesheet assigned'; wrap.appendChild(box); return wrap; }
    const tileRect = getTileRect(sheet, Math.max(0, Number(node.properties.previewFrame) || 0));
    if (!tileRect) { box.textContent = 'Invalid preview frame'; wrap.appendChild(box); return wrap; }
    const canvas = document.createElement('canvas'); canvas.width = tileRect.width; canvas.height = tileRect.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, tileRect.x, tileRect.y, tileRect.width, tileRect.height, 0, 0, tileRect.width, tileRect.height);
    const imgEl = document.createElement('img'); imgEl.src = canvas.toDataURL();
    box.appendChild(imgEl);
  } else {
    const imgEl = document.createElement('img'); imgEl.src = dataUrl; box.appendChild(imgEl);
  }
  wrap.appendChild(box); return wrap;
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

  let baseline = null;
  if (!options.deferHistory) {
    const fb = state.history.fieldBaseline || {};
    baseline = fb[`${nodeId}:${field.key}`] || fb[`${nodeId}:__pivot__`] || serializeScene();
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
    setValueByPath(node, field.key, value);
    if ((field.key === 'properties.width' || field.key === 'properties.height') && pivotPresetBeforeResize && pivotPresetBeforeResize !== 'custom') {
      applyPivotPreset(node, pivotPresetBeforeResize, { keepPivotWorldPosition: true });
    }
  }
  if (field.key === 'properties.tiles' && !Array.isArray(node.properties.tiles)) node.properties.tiles = [];

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

  refreshTree(); renderViewport(); updateSceneSummary();
  if (options.refreshInspector !== false) refreshInspector();
  if (!options.deferHistory && baseline !== serializeScene()) pushHistory(`Change ${field.label}`, baseline);
}

// ══════════════════════════════════════════════════════════════════════
// VIEWPORT RENDERING
// ══════════════════════════════════════════════════════════════════════
function renderViewport() {
  if (!sceneLayer || !cameraGroup || !gridGroup || !contentGroup) return;
  const ancestryIds = getSelectedAncestryIds();
  const selectedIds = getSelectionSet();
  shapeRefs.clear(); gridGroup.destroyChildren(); contentGroup.destroyChildren();
  drawViewportGuides();

  const renderBranch = (node, parentGroup, inheritedVisible) => {
    if (!node || isRootNodeId(node.id)) { getChildren(node?.id || getRootNodeId()).forEach((c) => renderBranch(c, parentGroup, inheritedVisible)); return; }
    const shape = buildKonvaForNode(node); if (!shape) return;
    const selfVisible = node.visible !== false;
    shape.id(node.id); shape.visible(inheritedVisible && selfVisible);
    shape.draggable(state.tool !== 'pan' && node.locked !== true);
    if (ancestryIds.has(node.id)) addHierarchyOutline(shape, node, 'ancestor');
    if (selectedIds.has(node.id))  addHierarchyOutline(shape, node, 'selected');
    if (selectedIds.has(node.id) && shape instanceof Konva.Group) {
      const pivotMarker = new Konva.Group({ x: Number(node.transform?.pivotX) || 0, y: Number(node.transform?.pivotY) || 0, listening: false, name: 'pivot-marker' });
      pivotMarker.add(new Konva.Circle({ radius: 5, fill: '#141620', stroke: '#ffce6a', strokeWidth: 1.5 }));
      pivotMarker.add(new Konva.Line({ points: [-8, 0, 8, 0], stroke: '#ffce6a', strokeWidth: 1.25 }));
      pivotMarker.add(new Konva.Line({ points: [0, -8, 0, 8], stroke: '#ffce6a', strokeWidth: 1.25 }));
      shape.add(pivotMarker);
    }

    shape.on('click', (e) => {
      if (state.viewport.isPanning) { e.cancelBubble = true; return; }
      e.cancelBubble = true;
      selectNode(node.id, { toggle: (e.evt && (e.evt.ctrlKey || e.evt.metaKey)) });
    });
    if (node.type === 'SceneInstance') {
      shape.on('dblclick dbltap', (e) => {
        e.cancelBubble = true;
        void openSourceSceneFromInstance(node.id);
      });
    }
    shape.on('dragstart', () => {
      if (node.locked) { shape.stopDrag(); return; }
      if (state.selectedIds.length > 1 && !selectedIds.has(node.id)) selectNode(node.id);
      suppressStageClick = true;
      beginSelectionDrag(node.id);
    });
    shape.on('dragmove', () => {
      const n = getNode(node.id); if (!n) return;
      const absPos = typeof shape.getAbsolutePosition === 'function' ? shape.getAbsolutePosition(contentGroup) : { x: shape.x(), y: shape.y() };
      setNodeLocalPositionFromGlobal(n, absPos, n.parentId || null);
      if (state.snapEnabled) {
        n.transform.x = snapValue(n.transform.x);
        n.transform.y = snapValue(n.transform.y);
        shape.position({ x: n.transform.x, y: n.transform.y });
      }
      updateSelectionDragFromNode(node.id);
      refreshTree(); refreshInspector(); updateSceneSummary();
      if (nodeSummaryEl) nodeSummaryEl.textContent = `${getSelectedNodeIds().length > 1 ? getSelectedNodeIds().length + ' nodes' : n.name + ' (' + n.type + ')'} selected`;
      if (transformer && getSelectedNodeIds().includes(node.id)) transformer.forceUpdate();
    });
    shape.on('dragend', () => {
      endSelectionDrag();
    });

    parentGroup.add(shape);
    shapeRefs.set(node.id, shape);
    getChildren(node.id).forEach((child) => renderBranch(child, shape, inheritedVisible && selfVisible));
  };

  renderBranch(getNode(getRootNodeId()), contentGroup, true);
  attachTransformer(); applyViewportTransform(); sceneLayer.draw();
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
function buildKonvaForNode(node) {
  const base = getKonvaNodeBaseAttrs(node);
  if (node.type === 'Node2D' || node.type === 'SceneRoot') {
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: node.properties.width || 160, height: node.properties.height || 120, fill: hexWithAlpha(node.properties.tint || '#5e7594', 0.15), stroke: node.properties.tint || '#5e7594', strokeWidth: 1.5, dash: [8, 5] }));
    g.add(new Konva.Text({ x: 8, y: 8, text: node.name, fill: '#c8d6ea', fontSize: 14 }));
    return g;
  }
  if (node.type === 'Sprite2D')         return buildSpriteGroup(node, false);
  if (node.type === 'AnimatedSprite2D') return buildSpriteGroup(node, true);
  if (node.type === 'SceneInstance')    return buildSceneInstanceGroup(node);
  return fallbackUnknownNode(node);
}
function getNodeVisualSize(node) {
  if (!node) return { width: 96, height: 96 };
  return { width: Math.max(1, Number(node.properties?.width) || 96), height: Math.max(1, Number(node.properties?.height) || 96) };
}
function addHierarchyOutline(shape, node, style = 'ancestor') {
  if (!shape || !node || isRootNodeId(node.id) || !(shape instanceof Konva.Group)) return;
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
  if (node.type === 'SceneInstance') {
    const g = new Konva.Group(base);
    g.add(new Konva.Rect({ width: node.properties?.width || 120, height: node.properties?.height || 90, fill: 'rgba(109,189,121,0.06)', stroke: '#6dbd79', strokeWidth: 1, dash: [5,4], listening: false }));
    return g;
  }
  return fallbackUnknownNode(node);
}

function buildTileMapGroup(node) {
  const tw = Math.max(1, Number(node.properties.tileWidth) || 32), th = Math.max(1, Number(node.properties.tileHeight) || 32);
  const mw = Math.max(1, Number(node.properties.mapWidth)  || 10), mh = Math.max(1, Number(node.properties.mapHeight) || 8);
  const tiles = Array.isArray(node.properties.tiles) ? node.properties.tiles : [];
  const g = new Konva.Group(getKonvaNodeBaseAttrs(node));
  for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
    const tv = tiles[r]?.[c] ?? ((r + c) % 2);
    g.add(new Konva.Rect({ x: c * tw, y: r * th, width: tw, height: th, fill: tv ? '#2d4a72' : '#1e3050', stroke: node.properties.showGrid ? '#152540' : undefined, strokeWidth: node.properties.showGrid ? 1 : 0 }));
  }
  g.add(new Konva.Text({ x: 6, y: 5, text: `${node.name} (${mw}×${mh})`, fill: '#dbe9fa', fontSize: 13 }));
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
  const shapes = getMovableSelectedNodeIds()
    .map((id) => ({ id, shape: shapeRefs.get(id), node: getNode(id) }))
    .filter(({ shape, node }) => !!shape && !!node && node.locked !== true)
    .map(({ shape }) => shape);
  transformer.nodes(shapes);
  transformer.rotateEnabled(shapes.length > 0);
  transformer.resizeEnabled(shapes.length > 0);
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

  const before = serializeScene();
  state.sceneState.scene = state.sceneState.scene || {};
  state.sceneState.scene.name = safeName;

  const rootNode = getNode(getRootNodeId());
  if (rootNode && (!rootNode.name || rootNode.name === currentName)) {
    rootNode.name = safeName;
  }

  syncEditorStateFromRuntime();
  persistActiveSceneEntry();
  refreshAll();
  if (before !== serializeScene()) pushHistory('Rename scene', before);
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
    tileWidth: Math.max(1, Number(s.tileWidth) || 32),
    tileHeight: Math.max(1, Number(s.tileHeight) || 32),
    padding: Math.max(0, Number(s.padding) || 0),
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
    if (!sv?.dataUrl) return;
    const sheet = createProjectAssetSheet({
      id: sv.id || `sheet_${Math.random().toString(36).slice(2, 9)}`,
      name: sv.name || 'Spritesheet',
      filePath: sv.filePath || '',
      resourcePath: sv.resourcePath || '',
      relativePath: sv.relativePath || '',
      dataUrl: sv.dataUrl,
      tileWidth: Math.max(1, Number(sv.tileWidth) || 32),
      tileHeight: Math.max(1, Number(sv.tileHeight) || 32),
      padding: Math.max(0, Number(sv.padding) || 0),
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

function pushHistory(label, snapshotBefore) {
  if (state.history.applying) return;
  const snapshot = snapshotBefore || serializeScene();
  const undo = state.history.undo;
  if (!undo.length || undo[undo.length - 1] !== snapshot) { undo.push(snapshot); if (undo.length > HISTORY_LIMIT) undo.shift(); }
  state.history.redo.length = 0;
  updateHistoryButtons();
  if (label) log(`[history] ${label}`);
}
function markHistoryBaseline() { state.history.undo = []; state.history.redo = []; state.document.lastSavedSnapshot = serializeScene(); state.document.dirty = false; updateHistoryButtons(); }
function applySceneSnapshot(snapshot, directionLabel) {
  try {
    state.history.applying = true;
    const parsed = JSON.parse(snapshot);
    if (parsed && parsed.sceneState) applyLoadedSceneData(parsed.sceneState, parsed.editorState || {});
    else applyLoadedSceneData(parsed, parsed?.editor || {});
    state.instanceCache.clear();
    rebuildImageCache(); rebuildSpritesheetsFromSceneState(); rebuildSpriteFramesLibrariesFromSceneState(); refreshAll(); setStatus(directionLabel);
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
  getNodes().forEach((n) => { if (n.properties?.imageDataUrl) loadImageIntoCache(n.id, n.properties.imageDataUrl, renderViewport); });
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

function closeCurrentScene() {
  if (state.activeSceneIndex < 0) return;

  const closingIndex = state.activeSceneIndex;
  state.scenes.splice(closingIndex, 1);

  if (!state.scenes.length) {
    state.activeSceneIndex = -1;
    state.sceneState = normalizeScene();
    state.editorState = normalizeEditorState(null, state.sceneState);
    state.document = Object.assign({}, state.document, cloneDocumentState({}), { autosaveTimer: state.document.autosaveTimer });
    createNewScene();
    return;
  }

  state.activeSceneIndex = -1;
  setActiveScene(Math.max(0, closingIndex - 1));
  setStatus('Closed scene.');
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
  rebuildSpritesheetsFromSceneState();
  rebuildSpriteFramesLibrariesFromSceneState();
  const instanceWarnings = await resolveAllSceneInstances({ force: true });
  markHistoryBaseline();
  refreshAll();
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
    refreshAll();
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
  refreshFilesystem();
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

  const nextSheets = existingSheets.filter((sheet) => !sheet?.projectAsset);
  const seen = new Set(nextSheets.map((sheet) => String(sheet?.id || '')));

  for (const file of imageFiles) {
    const resourceKey = String(file.resPath || '').trim().toLowerCase();
    const fileKey = String(file.path || '').trim().toLowerCase();
    const relativeKey = String(file.relativePath || '').trim().toLowerCase();
    let sheet = existingByKey.get(resourceKey) || existingByKey.get(fileKey) || existingByKey.get(relativeKey) || null;
    if (!sheet) {
      const asset = await window.electronAPI.readProjectAsset({ resourcePath: file.resPath });
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
}

function renderAudioPanel(tree) {
  if (!audioListEl) return;
  const files = tree ? getAudioAssetFiles(tree) : [];
  audioListEl.innerHTML = '';
  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = 'No audio files found in assets/audio.';
    audioListEl.appendChild(empty);
    return;
  }
  files.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'sheet-list-row';
    const btn = document.createElement('button');
    btn.className = 'tool-btn sprite-row-main';
    btn.type = 'button';
    btn.textContent = String(file.relativePath || file.name || 'Audio');
    btn.title = btn.textContent;
    btn.addEventListener('click', () => setStatus(`Audio asset: ${btn.textContent}`));
    row.appendChild(btn);
    audioListEl.appendChild(row);
  });
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
function getSelectedSheet()          { return state.spritesheets.find((s) => s.id === state.selectedSheetId) || null; }
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
  renderViewport();

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
  renderViewport();
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
    renderViewport();
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
  renderViewport();
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
  renderViewport();
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
          renderSpriteFramesPanel(); renderViewport();
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
    renderViewport();
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
function getFilteredAndSortedSpritesheets() {
  const searchQuery = String(state.spritePanel?.searchQuery || '').trim().toLowerCase();
  const sortMode = state.spritePanel?.sortMode || 'name-asc';
  const items = (state.spritesheets || []).filter((item) => {
    if (!searchQuery) return true;
    const haystack = [
      item.name,
      `${item.columns || 0}x${item.rows || 0}`,
      item.filePath || '',
      item.relativePath || '',
      item.resourcePath || ''
    ].join(' ').toLowerCase();
    return haystack.includes(searchQuery);
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

function renderSpritesheetsPanel() {
  const sheet  = getSelectedSheet();
  const visibleSheets = getFilteredAndSortedSpritesheets();
  document.getElementById('btn-sheet-grid')?.classList.toggle('active', state.spriteEditor.showGrid);
  if (sheetSearchEl && sheetSearchEl.value !== (state.spritePanel.searchQuery || '')) sheetSearchEl.value = state.spritePanel.searchQuery || '';
  if (sheetSortEl && sheetSortEl.value !== (state.spritePanel.sortMode || 'name-asc')) sheetSortEl.value = state.spritePanel.sortMode || 'name-asc';

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
      visibleSheets.forEach((item) => {
        const row = document.createElement('div'); row.className = 'sheet-list-row';
        const btn = document.createElement('button');
        btn.className = 'tool-btn sprite-row-main' + (item.id === state.selectedSheetId ? ' active' : '');
        btn.type = 'button';
        btn.textContent = `${item.name} (${item.columns}×${item.rows})`;
        btn.title = `${item.name} (${item.columns}×${item.rows})`;
        btn.addEventListener('click', () => { state.selectedSheetId = item.id; syncSpritesheetsToSceneState(); syncSheetInputs(item); renderSpritesheetsPanel(); renderSpriteFramesPanel(); });
        const delBtn = document.createElement('button');
        delBtn.className = 'tool-btn sheet-delete-btn'; delBtn.type = 'button'; delBtn.textContent = '🗑'; delBtn.title = `Delete ${item.name}`;
        delBtn.setAttribute('aria-label', `Delete ${item.name}`);
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSpritesheet(item.id); });
        row.appendChild(btn); row.appendChild(delBtn); sheetListEl.appendChild(row);
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
    refreshAll(); setStatus(`Assigned tile #${tileIndex} from "${sheet.name}" to ${node.name}.`);
    return true;
  }

  const tileDataUrl = extractTileDataUrl(sheet, tileIndex);
  node.properties.imagePath    = `${sheet.filePath}#tile:${tileIndex}`;
  node.properties.imageDataUrl = tileDataUrl;
  loadImageIntoCache(node.id, tileDataUrl, () => { refreshAll(); setStatus(`Applied tile #${tileIndex} to ${node.name}.`); });
  return true;
}

async function importSpritesheet() {
  const result = await (window.electronAPI && typeof window.electronAPI.openImageFile === 'function' ? window.electronAPI.openImageFile({ assetKind: 'spritesheet' }) : Promise.resolve({ success: false, reason: 'electron_api_missing' })); if (!result.success) return;
  const tileWidth  = Math.max(1, Number(document.getElementById('sheet-tile-w')?.value)  || 32);
  const tileHeight = Math.max(1, Number(document.getElementById('sheet-tile-h')?.value) || 32);
  const padding    = Math.max(0, Number(document.getElementById('sheet-padding')?.value) || 0);
  const img = new Image();
  img.onload = () => {
    const sheet = { id: `sheet_${Math.random().toString(36).slice(2, 9)}`, name: result.filePath.split(/[\/\\]/).pop(), filePath: result.filePath, resourcePath: result.resPath || '', relativePath: String(result.resPath || '').replace(/^res:\/\//, ''), dataUrl: result.dataUrl, image: img, tileWidth, tileHeight, padding, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, columns: 1, rows: 1, projectAsset: !!result.resPath };
    recalcSheetMetrics(sheet);
    state.spritesheets.push(sheet); state.selectedSheetId = sheet.id;
    syncSpritesheetsToSceneState();
    state.spriteEditor.selectedTileIndex = 0; state.spriteEditor.animationFrames = []; state.spriteEditor.selectedFrameIndex = -1;
    syncSheetInputs(sheet); renderSpritesheetsPanel(); renderSpriteFramesPanel();
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
  syncEditorStateFromRuntime();
  const snapshot = getCurrentSceneSnapshot();
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

async function restoreRecovery(recoveryId) {
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
  refreshAll();
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

init();


// Renderer tilemap compatibility stripped.
function buildTileMapGroup() { return new Konva.Group(); }
