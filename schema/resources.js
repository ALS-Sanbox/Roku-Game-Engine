globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  const NEIGHBOR_KEYS = ['top','right','bottom','left','topLeft','topRight','bottomRight','bottomLeft'];
  const SPECIAL_NEIGHBOR_VALUES = new Set(['*', 'same', 'different']);

  function normalizeRelativePath(filePath) {
    return String(filePath || '').replace(/\\/g, '/');
  }

  function stripResPrefix(resourcePath) {
    const normalized = normalizeRelativePath(resourcePath).trim();
    return normalized.replace(/^res:\/\//i, '');
  }

  function makeResRelativePath(projectRoot, filePath) {
    const root = normalizeRelativePath(projectRoot).replace(/\/$/, '');
    const target = normalizeRelativePath(filePath);
    if (!root || !target) return '';
    if (!(target === root || target.startsWith(root + '/'))) return '';
    const relative = target.slice(root.length).replace(/^\//, '');
    return relative ? `res://${relative}` : '';
  }

  // deepClone → RGE_ROOT.RGEUtils.deepClone (shared, see core/utils.js)
  const deepClone = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
    ? RGE_ROOT.RGEUtils.deepClone
    : (v) => JSON.parse(JSON.stringify(v));

  function makeId(prefix, seed) {
    const clean = String(seed == null ? '' : seed).trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
    return `${prefix}_${clean || Math.random().toString(36).slice(2, 9)}`;
  }

  function clampWeight(value, fallback = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Math.max(0, Number(fallback) || 0);
    return Math.max(0, num);
  }

  function normalizeTileIndex(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Math.max(0, Number(fallback) || 0);
    return Math.max(0, Math.floor(num));
  }

  function normalizeNeighborValue(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    if (!text) return null;
    if (SPECIAL_NEIGHBOR_VALUES.has(text)) return text;
    return text;
  }

  function createDefaultTerrainType(idSeed) {
    const suffix = String(idSeed || Math.random().toString(36).slice(2, 9));
    return {
      id: makeId('terrain', suffix),
      name: 'Terrain',
      color: '#7a6ff0',
      iconTileIndex: null
    };
  }

  function createDefaultTerrainRule(idSeed) {
    const suffix = String(idSeed || Math.random().toString(36).slice(2, 9));
    return {
      id: makeId('rule', suffix),
      terrainTypeId: '',
      tileIndex: 0,
      neighbors: {
        top: '*', right: '*', bottom: '*', left: '*',
        topLeft: '*', topRight: '*', bottomRight: '*', bottomLeft: '*'
      },
      weight: 1,
      allowRotate: false,
      allowFlipX: false,
      allowFlipY: false,
      enabled: true
    };
  }

  function createDefaultTerrainSet(idSeed) {
    const suffix = String(idSeed || Math.random().toString(36).slice(2, 9));
    return {
      id: makeId('terrainset', suffix),
      name: 'Terrain Set',
      terrainTypes: [],
      rules: []
    };
  }

  function normalizeTerrainType(terrainType, index) {
    const source = terrainType && typeof terrainType === 'object' ? deepClone(terrainType) : {};
    const normalized = Object.assign(createDefaultTerrainType(index), source);
    normalized.id = String(normalized.id || makeId('terrain', index));
    normalized.name = String(normalized.name || 'Terrain');
    normalized.color = String(normalized.color || '#7a6ff0');
    if (normalized.iconTileIndex == null || normalized.iconTileIndex === '') normalized.iconTileIndex = null;
    else normalized.iconTileIndex = normalizeTileIndex(normalized.iconTileIndex, 0);
    delete normalized.iconTile;
    delete normalized.probability;
    // Strip _legacy_* scratch fields written by terrain_migration.js
    Object.keys(normalized).forEach((k) => { if (k.startsWith('_legacy_')) delete normalized[k]; });
    return normalized;
  }

  function normalizeRuleNeighbors(neighbors) {
    const source = neighbors && typeof neighbors === 'object' ? neighbors : {};
    return NEIGHBOR_KEYS.reduce((out, key) => {
      out[key] = normalizeNeighborValue(source[key]);
      return out;
    }, {});
  }

  function normalizeTerrainRule(rule, index) {
    const source = rule && typeof rule === 'object' ? deepClone(rule) : {};
    const normalized = Object.assign(createDefaultTerrainRule(index), source);
    normalized.id = String(normalized.id || makeId('rule', index));
    normalized.terrainTypeId = normalized.terrainTypeId == null ? '' : String(normalized.terrainTypeId);
    normalized.tileIndex = normalizeTileIndex(normalized.tileIndex, index);
    normalized.neighbors = normalizeRuleNeighbors(normalized.neighbors);
    normalized.weight = clampWeight(normalized.weight, 1);
    normalized.allowRotate = normalized.allowRotate === true;
    normalized.allowFlipX = normalized.allowFlipX === true;
    normalized.allowFlipY = normalized.allowFlipY === true;
    normalized.enabled = normalized.enabled !== false;
    delete normalized.terrainId;
    delete normalized.autotileMask;
    delete normalized.edgeLabels;
    delete normalized.cornerLabels;
    delete normalized.probability;
    delete normalized.allowRotate90;
    delete normalized.allowRotate180;
    delete normalized.allowRotate270;
    // Strip _legacy_* scratch fields written by terrain_migration.js
    Object.keys(normalized).forEach((k) => { if (k.startsWith('_legacy_')) delete normalized[k]; });
    return normalized;
  }

  function normalizeTerrainSetV35(terrainSet, index) {
    const source = terrainSet && typeof terrainSet === 'object' ? deepClone(terrainSet) : {};
    const normalized = Object.assign(createDefaultTerrainSet(index), source);
    normalized.id = String(normalized.id || makeId('terrainset', index));
    normalized.name = String(normalized.name || 'Terrain Set');
    normalized.terrainTypes = Array.isArray(source.terrainTypes)
      ? source.terrainTypes.map((terrainType, terrainIndex) => normalizeTerrainType(terrainType, `${index}_${terrainIndex}`))
      : [];
    normalized.rules = Array.isArray(source.rules)
      ? source.rules.map((rule, ruleIndex) => normalizeTerrainRule(rule, `${index}_${ruleIndex}`))
      : [];

    // v35.1 is a clean break. Old authoring fields are intentionally discarded.
    delete normalized.type;
    delete normalized.iconTile;
    delete normalized.enableTransforms;
    delete normalized.preferUntransformed;
    delete normalized.terrains;
    // Strip migration scratch fields written by terrain_migration.js
    delete normalized._migratedV35;
    Object.keys(normalized).forEach((k) => { if (k.startsWith('_legacy_')) delete normalized[k]; });
    return normalized;
  }

  function normalizeTileTerrainMetadata(meta) {
    const source = meta && typeof meta === 'object' ? deepClone(meta) : {};
    // Tile terrain authoring moved to terrainSet.rules[]. Keep unrelated metadata only.
    delete source.terrainId;
    delete source.terrainTypeId;
    delete source.autotileMask;
    delete source.edgeLabels;
    delete source.cornerLabels;
    delete source.probability;
    delete source.allowFlipX;
    delete source.allowFlipY;
    delete source.allowRotate90;
    delete source.allowRotate180;
    delete source.allowRotate270;
    delete source.allowRotate;
    delete source.enabled;
    return source;
  }

  function normalizeTilesetResource(tileset, index) {
    const normalized = tileset && typeof tileset === 'object' ? deepClone(tileset) : {};
    normalized.id = String(normalized.id || makeId('tileset', index));
    normalized.name = String(normalized.name || 'TileSet');
    normalized.spriteSheetId = String(normalized.spriteSheetId || '');
    normalized.tileWidth = Math.max(1, Number(normalized.tileWidth) || 32);
    normalized.tileHeight = Math.max(1, Number(normalized.tileHeight) || 32);
    normalized.padding = Math.max(0, Number(normalized.padding) || 0);
    normalized.selectedTileIndex = normalizeTileIndex(normalized.selectedTileIndex, 0);
    normalized.terrainSets = Array.isArray(normalized.terrainSets)
      ? normalized.terrainSets.map((set, setIndex) => normalizeTerrainSetV35(set, `${index}_${setIndex}`))
      : [];
    const tileMetadata = normalized.tileMetadata && typeof normalized.tileMetadata === 'object' ? normalized.tileMetadata : {};
    normalized.tileMetadata = {};
    Object.keys(tileMetadata).forEach((key) => {
      const tileIndex = normalizeTileIndex(key, -1);
      if (tileIndex >= 0) normalized.tileMetadata[String(tileIndex)] = normalizeTileTerrainMetadata(tileMetadata[key]);
    });
    return normalized;
  }

  function normalizeEditorResourceState(editorState) {
    const normalized = editorState && typeof editorState === 'object' ? deepClone(editorState) : {};
    normalized.tilesets = Array.isArray(normalized.tilesets)
      ? normalized.tilesets.map((tileset, index) => normalizeTilesetResource(tileset, index))
      : [];
    return normalized;
  }

  function validateUniqueIds(items, path, issues) {
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const id = item?.id == null ? '' : String(item.id);
      if (!id) issues.push(`${path}[${index}].id is required`);
      else if (seen.has(id)) issues.push(`${path}[${index}].id duplicates ${id}`);
      seen.add(id);
    });
  }

  function validateNeighborValue(value, terrainTypeIds, path, issues) {
    if (value == null) return;
    const text = String(value);
    if (SPECIAL_NEIGHBOR_VALUES.has(text)) return;
    if (!terrainTypeIds.has(text)) issues.push(`${path} has invalid neighbor terrain type ${JSON.stringify(text)}`);
  }

  function validateTerrainSet(terrainSet, path, tileCount) {
    const issues = [];
    if (!terrainSet || typeof terrainSet !== 'object') {
      issues.push(`${path} must be an object`);
      return issues;
    }
    if (!Array.isArray(terrainSet.terrainTypes)) issues.push(`${path}.terrainTypes must be an array`);
    if (!Array.isArray(terrainSet.rules)) issues.push(`${path}.rules must be an array`);
    validateUniqueIds(terrainSet.terrainTypes, `${path}.terrainTypes`, issues);
    validateUniqueIds(terrainSet.rules, `${path}.rules`, issues);
    const terrainTypeIds = new Set((Array.isArray(terrainSet.terrainTypes) ? terrainSet.terrainTypes : []).map((type) => String(type?.id || '')).filter(Boolean));

    (Array.isArray(terrainSet.terrainTypes) ? terrainSet.terrainTypes : []).forEach((terrainType, index) => {
      const typePath = `${path}.terrainTypes[${index}]`;
      if (!terrainType || typeof terrainType !== 'object') issues.push(`${typePath} must be an object`);
      else {
        if (!terrainType.name) issues.push(`${typePath}.name is required`);
        if (!terrainType.color) issues.push(`${typePath}.color is required`);
        if (terrainType.iconTileIndex != null && (!Number.isInteger(Number(terrainType.iconTileIndex)) || Number(terrainType.iconTileIndex) < 0)) issues.push(`${typePath}.iconTileIndex must be a tile index or null`);
        if (tileCount > 0 && terrainType.iconTileIndex != null && Number(terrainType.iconTileIndex) >= tileCount) issues.push(`${typePath}.iconTileIndex points outside the tile range`);
      }
    });

    (Array.isArray(terrainSet.rules) ? terrainSet.rules : []).forEach((rule, index) => {
      const rulePath = `${path}.rules[${index}]`;
      if (!rule || typeof rule !== 'object') {
        issues.push(`${rulePath} must be an object`);
        return;
      }
      if (!rule.terrainTypeId) issues.push(`${rulePath}.terrainTypeId is required`);
      else if (!terrainTypeIds.has(String(rule.terrainTypeId))) issues.push(`${rulePath}.terrainTypeId points to missing terrain type ${JSON.stringify(rule.terrainTypeId)}`);
      if (!Number.isInteger(Number(rule.tileIndex)) || Number(rule.tileIndex) < 0) issues.push(`${rulePath}.tileIndex must be a tile index >= 0`);
      if (tileCount > 0 && Number(rule.tileIndex) >= tileCount) issues.push(`${rulePath}.tileIndex points outside the tile range`);
      const neighbors = rule.neighbors && typeof rule.neighbors === 'object' ? rule.neighbors : {};
      NEIGHBOR_KEYS.forEach((key) => validateNeighborValue(neighbors[key], terrainTypeIds, `${rulePath}.neighbors.${key}`, issues));
      if (rule.weight != null && (!Number.isFinite(Number(rule.weight)) || Number(rule.weight) < 0)) issues.push(`${rulePath}.weight must be a number >= 0`);
      ['allowRotate','allowFlipX','allowFlipY','enabled'].forEach((key) => {
        if (rule[key] != null && typeof rule[key] !== 'boolean') issues.push(`${rulePath}.${key} must be a boolean`);
      });
    });
    return issues;
  }

  function estimateTileCount(tileset) {
    const sheetCols = Number(tileset?.columns || tileset?.sheetColumns || 0);
    const sheetRows = Number(tileset?.rows || tileset?.sheetRows || 0);
    if (sheetCols > 0 && sheetRows > 0) return Math.floor(sheetCols * sheetRows);
    return 0;
  }

  function validateEditorResourceState(editorState) {
    const issues = [];
    const normalized = editorState && typeof editorState === 'object' ? editorState : {};
    const tilesets = Array.isArray(normalized.tilesets) ? normalized.tilesets : [];
    tilesets.forEach((tileset, index) => {
      const path = `tilesets[${index}]`;
      if (!tileset || typeof tileset !== 'object') {
        issues.push(`${path} must be an object`);
        return;
      }
      if (tileset.terrainSets != null && !Array.isArray(tileset.terrainSets)) issues.push(`${path}.terrainSets must be an array`);
      const tileCount = estimateTileCount(tileset);
      (Array.isArray(tileset.terrainSets) ? tileset.terrainSets : []).forEach((terrainSet, setIndex) => {
        issues.push(...validateTerrainSet(terrainSet, `${path}.terrainSets[${setIndex}]`, tileCount));
      });
    });
    return { valid: issues.length === 0, issues };
  }

  // ── NineSliceStyle resource schema ──────────────────────────────────────────
  // A NineSliceStyle is a reusable definition that ties a texture to slice margins
  // and stretch modes. It can be assigned to Panel, Button, and NineSlicePanel nodes.

  const VALID_CENTER_MODES = new Set(['stretch', 'tile']);
  const VALID_EDGE_MODES   = new Set(['stretch', 'tile']);

  function createDefaultNineSliceStyle(idSeed) {
    const suffix = String(idSeed == null ? '' : idSeed).trim() || Math.random().toString(36).slice(2, 9);
    return {
      id:          `nineslice_${suffix}`,
      name:        'New Nine-Slice Style',
      imagePath:   '',
      imageDataUrl:'',
      type:        'NineSlice',
      sourceRect:  { x: 0, y: 0, w: 0, h: 0 },
      buttonStates:{ normal: '', hover: '', pressed: '', disabled: '' },
      progressRegions:{ background: '', fill: '', thumb: '' },
      sliceLeft:   16,
      sliceTop:    16,
      sliceRight:  16,
      sliceBottom: 16,
      centerMode:  'stretch',   // 'stretch' | 'tile'
      edgeMode:    'stretch',   // 'stretch' | 'tile'
    };
  }

  function normalizeNineSliceStyle(style, index) {
    const source = style && typeof style === 'object' ? deepClone(style) : {};
    const defaults = createDefaultNineSliceStyle(index);
    const out = Object.assign(defaults, source);
    out.id          = String(out.id || makeId('nineslice', index));
    out.name        = String(out.name || 'Nine-Slice Style');
    out.imagePath   = String(out.imagePath   || '');
    out.imageDataUrl= String(out.imageDataUrl || '');
    out.type        = ['Image','NineSlice','Button','ProgressBar'].includes(out.type) ? out.type : 'NineSlice';
    const rr = out.sourceRect && typeof out.sourceRect === 'object' ? out.sourceRect : {};
    out.sourceRect = {
      x: Math.max(0, Number(rr.x) || 0),
      y: Math.max(0, Number(rr.y) || 0),
      w: Math.max(0, Number(rr.w) || 0),
      h: Math.max(0, Number(rr.h) || 0),
    };
    out.buttonStates = Object.assign({ normal: '', hover: '', pressed: '', disabled: '' }, out.buttonStates || {});
    out.progressRegions = Object.assign({ background: '', fill: '', thumb: '' }, out.progressRegions || {});
    out.sliceLeft   = Math.max(0, Number(out.sliceLeft)   || 0);
    out.sliceTop    = Math.max(0, Number(out.sliceTop)    || 0);
    out.sliceRight  = Math.max(0, Number(out.sliceRight)  || 0);
    out.sliceBottom = Math.max(0, Number(out.sliceBottom) || 0);
    out.centerMode  = VALID_CENTER_MODES.has(out.centerMode) ? out.centerMode : 'stretch';
    out.edgeMode    = VALID_EDGE_MODES.has(out.edgeMode)     ? out.edgeMode   : 'stretch';
    return out;
  }

  // ── UIScreen resource schema ─────────────────────────────────────────────────
  // A UIScreen ties a logical screen name (e.g. "TitleScreen") to one or more
  // CanvasLayer node ids in the scene, plus metadata used by the screen manager.

  const VALID_SCREEN_TYPES = new Set([
    'TitleScreen', 'LoadingScreen', 'OptionsMenu', 'PauseMenu',
    'HighScoresScreen', 'GameOverScreen', 'TransitionScreen', 'CustomScreen'
  ]);

  function createDefaultUIScreen(idSeed) {
    const suffix = String(idSeed == null ? '' : idSeed).trim() || Math.random().toString(36).slice(2, 9);
    return {
      id:              `uiscreen_${suffix}`,
      name:            'NewScreen',
      screenType:      'CustomScreen',
      startupScreen:   false,
      rootNodeIds:     [],   // CanvasLayer node ids that make up this screen
      onEnter:         '',   // script event fired on enter
      onExit:          '',   // script event fired on exit
      onPause:         '',   // script event fired on pause (push behind)
      onResume:        '',   // script event fired on resume (pop returns)
    };
  }

  function normalizeUIScreen(screen, index) {
    const source = screen && typeof screen === 'object' ? deepClone(screen) : {};
    const defaults = createDefaultUIScreen(index);
    const out = Object.assign(defaults, source);
    out.id            = String(out.id || makeId('uiscreen', index));
    out.name          = String(out.name || 'Screen');
    out.screenType    = VALID_SCREEN_TYPES.has(out.screenType) ? out.screenType : 'CustomScreen';
    out.startupScreen = out.startupScreen === true;
    out.rootNodeIds   = Array.isArray(out.rootNodeIds) ? out.rootNodeIds.map(String) : [];
    out.onEnter       = String(out.onEnter  || '');
    out.onExit        = String(out.onExit   || '');
    out.onPause       = String(out.onPause  || '');
    out.onResume      = String(out.onResume || '');
    return out;
  }

  const SCREEN_TYPE_LIST = Array.from(VALID_SCREEN_TYPES);

  // ── UITransitionPreset resource schema ──────────────────────────────────────
  // Reusable named transition settings that can be assigned to screen/scene changes.

  const VALID_TRANSITION_TYPES = new Set([
    'instant', 'fade', 'slide_left', 'slide_right', 'slide_up', 'slide_down', 'wipe'
  ]);
  const VALID_EASINGS = new Set([
    'linear', 'ease_in', 'ease_out', 'ease_in_out', 'elastic_out'
  ]);
  const TRANSITION_TYPE_LIST = Array.from(VALID_TRANSITION_TYPES);
  const EASING_LIST          = Array.from(VALID_EASINGS);

  function createDefaultUITransitionPreset(idSeed) {
    const suffix = String(idSeed == null ? '' : idSeed).trim() || Math.random().toString(36).slice(2, 9);
    return {
      id:                  `transition_${suffix}`,
      name:                'New Transition',
      transType:           'fade',
      duration:            0.35,
      easing:              'ease_in_out',
      color:               '#000000',
      blockInput:          true,
      waitForLoad:         false,
      loadingLabel:        'Loading...',
      showLoadingProgress: true,
      fakeProgress:        false,
      fakeProgressRate:    0.6,
    };
  }

  function normalizeUITransitionPreset(preset, index) {
    const source   = preset && typeof preset === 'object' ? deepClone(preset) : {};
    const defaults = createDefaultUITransitionPreset(index);
    const out      = Object.assign(defaults, source);
    out.id                  = String(out.id || makeId('transition', index));
    out.name                = String(out.name || 'Transition');
    out.transType           = VALID_TRANSITION_TYPES.has(out.transType) ? out.transType : 'fade';
    out.duration            = Math.max(0, Number(out.duration)       || 0.35);
    out.easing              = VALID_EASINGS.has(out.easing)  ? out.easing : 'ease_in_out';
    out.color               = String(out.color || '#000000');
    out.blockInput          = out.blockInput !== false;
    out.waitForLoad         = out.waitForLoad === true;
    out.loadingLabel        = String(out.loadingLabel || 'Loading...');
    out.showLoadingProgress = out.showLoadingProgress !== false;
    out.fakeProgress        = out.fakeProgress === true;
    out.fakeProgressRate    = Math.max(0.01, Number(out.fakeProgressRate) || 0.6);
    return out;
  }

  // ── UIOptionDef resource schema ──────────────────────────────────────────────
  // Defines a persistent game option with type, default, and allowed values.

  const VALID_OPTION_TYPES = new Set(['string','float','int','bool']);

  function createDefaultUIOptionDef(idSeed) {
    const suffix = String(idSeed == null ? '' : idSeed).trim() || Math.random().toString(36).slice(2, 9);
    return {
      id:            `option_${suffix}`,
      key:           `option_${suffix}`,
      label:         'New Option',
      optionType:    'string',
      defaultValue:  '',
      allowedValues: [],
      description:   '',
    };
  }

  function normalizeUIOptionDef(def, index) {
    const source   = def && typeof def === 'object' ? deepClone(def) : {};
    const defaults = createDefaultUIOptionDef(index);
    const out      = Object.assign(defaults, source);
    out.id           = String(out.id    || makeId('option', index));
    out.key          = String(out.key   || out.id).replace(/\s+/g, '_').toLowerCase();
    out.label        = String(out.label || 'Option');
    out.optionType   = VALID_OPTION_TYPES.has(out.optionType) ? out.optionType : 'string';
    out.defaultValue = String(out.defaultValue ?? '');
    out.allowedValues= Array.isArray(out.allowedValues) ? out.allowedValues.map(String) : [];
    out.description  = String(out.description || '');
    return out;
  }

  // ── UIHighScoreTable resource schema ─────────────────────────────────────────

  const VALID_SORT_ORDERS = new Set(['desc','asc']);

  function createDefaultUIHighScoreTable(idSeed) {
    const suffix = String(idSeed == null ? '' : idSeed).trim() || Math.random().toString(36).slice(2, 9);
    return {
      id:         `scores_${suffix}`,
      tableId:    `scores_${suffix}`,
      label:      'High Scores',
      maxEntries: 10,
      sortOrder:  'desc',
    };
  }

  function normalizeUIHighScoreTable(table, index) {
    const source   = table && typeof table === 'object' ? deepClone(table) : {};
    const defaults = createDefaultUIHighScoreTable(index);
    const out      = Object.assign(defaults, source);
    out.id         = String(out.id      || makeId('scores', index));
    out.tableId    = String(out.tableId || out.id).replace(/\s+/g, '_').toLowerCase();
    out.label      = String(out.label   || 'High Scores');
    out.maxEntries = Math.max(1, Math.min(100, Number(out.maxEntries) || 10));
    out.sortOrder  = VALID_SORT_ORDERS.has(out.sortOrder) ? out.sortOrder : 'desc';
    return out;
  }

  const OPTION_TYPE_LIST   = Array.from(VALID_OPTION_TYPES);
  const SORT_ORDER_LIST    = Array.from(VALID_SORT_ORDERS);

  const api = {
    normalizeRelativePath,
    stripResPrefix,
    makeResRelativePath,
    createDefaultTerrainType,
    createDefaultTerrain: createDefaultTerrainType,
    createDefaultTerrainRule,
    createDefaultTerrainSet,
    normalizeTerrainType,
    normalizeTerrain: normalizeTerrainType,
    normalizeTerrainRule,
    normalizeTerrainSetV35,
    normalizeTerrainSet: normalizeTerrainSetV35,
    normalizeTileTerrainMetadata,
    normalizeTilesetResource,
    normalizeEditorResourceState,
    validateEditorResourceState,
    // Nine-slice style resource management
    createDefaultNineSliceStyle,
    normalizeNineSliceStyle,
    // UIScreen resource management
    createDefaultUIScreen,
    normalizeUIScreen,
    SCREEN_TYPE_LIST,
    // UITransitionPreset resource management
    createDefaultUITransitionPreset,
    normalizeUITransitionPreset,
    TRANSITION_TYPE_LIST,
    EASING_LIST,
    // UIOptionDef resource management
    createDefaultUIOptionDef,
    normalizeUIOptionDef,
    OPTION_TYPE_LIST,
    // UIHighScoreTable resource management
    createDefaultUIHighScoreTable,
    normalizeUIHighScoreTable,
    SORT_ORDER_LIST,
    NEIGHBOR_KEYS
  };

  if (typeof window !== 'undefined') window.RokuSchemaResources = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
