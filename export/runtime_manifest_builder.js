globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
const terrainSolver = require('../editor/terrain_solver.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeExportSpritesheet(sheet = {}) {
  const clean = cloneJson(sheet || {});
  delete clean.dataUrl;
  delete clean.image;
  return clean;
}

function sanitizeExportSpriteFramesLibrary(library = {}) {
  return cloneJson(library || {});
}

function sanitizeExportTileset(tileset = {}, options = {}) {
  const resourcesApi = (() => {
    try {
      return require('../schema/resources.js');
    } catch (_error) {
      return null;
    }
  })();
  let clean = cloneJson(tileset || {});
  if (resourcesApi && typeof resourcesApi.normalizeTilesetResource === 'function') {
    clean = resourcesApi.normalizeTilesetResource(clean, 0);
  }

  // Runtime receives already-resolved tilemaps. Terrain rule definitions are editor data
  // and are exported only when explicitly requested for tooling/debug builds.
  if (options.includeTerrainRules !== true && Array.isArray(clean.terrainSets)) {
    clean.terrainSets = clean.terrainSets.map((set) => {
      const stripped = cloneJson(set || {});
      delete stripped.rules;
      delete stripped.terrainRules;
      return stripped;
    });
  }
  return clean;
}

function makeScenePath(sceneName) {
  return `pkg:/assets/scenes/${sceneName}.json`;
}

function normalizeTexturePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('res://')) return `pkg:/${raw.slice(6)}`;
  return raw;
}

function ensureTexture(textures, textureId, texturePath, kind = 'image') {
  const id = String(textureId || '').trim();
  const resolvedPath = normalizeTexturePath(texturePath);
  if (!id || !resolvedPath) return;
  if (!textures[id]) textures[id] = { id, path: resolvedPath, kind };
}

// normalizeTerrainRef → RGEUtils when available, else inline fallback (see core/utils.js)
const normalizeTerrainRef = (() => {
  if (typeof window !== 'undefined' && RGE_ROOT.RGEUtils) return RGE_ROOT.RGEUtils.normalizeTerrainRef;
  try { const u = require('../core/utils.js'); return u.normalizeTerrainRef; } catch (_) {}
  return (v, fb = null) => {
    if (v == null || v === '' || v === false) return fb;
    const t = String(v).trim(); return t || fb;
  };
})();

function normalizeCellTransform(transform) {
  return terrainSolver && typeof terrainSolver.normalizeTransformSpec === 'function'
    ? terrainSolver.normalizeTransformSpec(transform)
    : { flipX: false, flipY: false, rotation: 0 };
}

function readCell(layer, col, row) {
  if (!layer || row < 0 || col < 0) return null;
  const cell = layer.cellData && layer.cellData[row] && layer.cellData[row][col];
  return cell && typeof cell === 'object' ? cell : null;
}

function ensureCell(layer, col, row) {
  if (!layer || row < 0 || col < 0) return null;
  if (!Array.isArray(layer.cellData)) layer.cellData = [];
  if (!Array.isArray(layer.cellData[row])) layer.cellData[row] = [];
  if (!layer.cellData[row][col] || typeof layer.cellData[row][col] !== 'object') {
    layer.cellData[row][col] = {};
  }
  return layer.cellData[row][col];
}

function getTerrainTypeIdFromLayerCell(layer, col, row) {
  const cell = readCell(layer, col, row);
  return normalizeTerrainRef(cell && cell.terrainTypeId);
}

function getTerrainSetIdFromLayerCell(layer, col, row) {
  const cell = readCell(layer, col, row);
  return normalizeTerrainRef(cell && cell.terrainSetId);
}

function buildLayerNeighborSignature(layer, col, row) {
  return terrainSolver.buildTerrainNeighborSignature(layer, col, row);
}

function getTilesetTileCount(tileset) {
  const explicit = Number(tileset && (tileset.tileCount || tileset.tilesCount));
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const columns = Number(tileset && (tileset.columns || tileset.atlasColumns));
  const rows = Number(tileset && (tileset.rows || tileset.atlasRows));
  if (Number.isFinite(columns) && columns > 0 && Number.isFinite(rows) && rows > 0) return Math.floor(columns * rows);
  const tileW = Number(tileset && (tileset.tileWidth || tileset.tileSize || tileset.gridWidth));
  const tileH = Number(tileset && (tileset.tileHeight || tileset.tileSize || tileset.gridHeight));
  const imageW = Number(tileset && (tileset.imageWidth || tileset.width));
  const imageH = Number(tileset && (tileset.imageHeight || tileset.height));
  if (tileW > 0 && tileH > 0 && imageW > 0 && imageH > 0) return Math.floor(imageW / tileW) * Math.floor(imageH / tileH);
  const metas = tileset && tileset.tileMetadata;
  if (metas && typeof metas === 'object') {
    const max = Object.keys(metas).reduce((best, key) => Math.max(best, Number(key)), -1);
    if (max >= 0) return max + 1;
  }
  return null;
}

function isValidTileIndex(tileIndex, tileset) {
  const index = Number(tileIndex);
  if (!Number.isFinite(index) || index < 0) return false;
  const count = getTilesetTileCount(tileset);
  return count == null || index < count;
}

function getTerrainSetById(tileset, terrainSetId) {
  const setId = normalizeTerrainRef(terrainSetId);
  const sets = Array.isArray(tileset && tileset.terrainSets) ? tileset.terrainSets : [];
  if (setId) {
    const match = sets.find((set) => set && String(set.id) === setId);
    if (match) return terrainSolver.normalizeTerrainSetV35 ? terrainSolver.normalizeTerrainSetV35(match) : match;
  }
  return sets[0] ? (terrainSolver.normalizeTerrainSetV35 ? terrainSolver.normalizeTerrainSetV35(sets[0]) : sets[0]) : null;
}

function validateTerrainSetRules(tileset, warnings, context) {
  const sets = Array.isArray(tileset && tileset.terrainSets) ? tileset.terrainSets : [];
  sets.forEach((rawSet) => {
    const set = terrainSolver.normalizeTerrainSetV35 ? terrainSolver.normalizeTerrainSetV35(rawSet) : rawSet;
    const terrainTypes = Array.isArray(set.terrainTypes) ? set.terrainTypes : [];
    const rules = Array.isArray(set.rules) ? set.rules : [];
    if (!rules.length) warnings.push(`${context}: terrain set "${set.id || 'unnamed'}" has no rules.`);
    terrainTypes.forEach((type) => {
      if (!rules.some((rule) => rule && rule.enabled !== false && String(rule.terrainTypeId) === String(type.id))) {
        warnings.push(`${context}: terrain type "${type.id}" in set "${set.id}" has no matching enabled rules.`);
      }
    });
  });
}

function bakeTerrainForRuntimeScene(runtimeScene, editorState, options = {}) {
  const tilesetMap = new Map((Array.isArray(editorState && editorState.tilesets) ? editorState.tilesets : []).map((tileset) => [String(tileset && tileset.id || ''), cloneJson(tileset)]));
  const warnings = [];
  const bakeTerrain = options.bakeTerrain !== false;
  if (!bakeTerrain) return { runtimeScene, warnings, baked: false };

  // ── Step 1: validate terrain set rules ──────────────────────────────
  for (const tileset of tilesetMap.values()) {
    validateTerrainSetRules(tileset, warnings, `export tileset "${tileset.id || 'unnamed'}"`);
  }

  // ── Step 2: pre-export rebuild ──────────────────────────────────────
  // Re-solve every terrain-painted cell before baking so the exported
  // tile indices reflect the current rule set, even if the user changed
  // rules since last manual rebuild.  Uses the same solver the editor
  // uses during painting — no separate runtime solver needed.
  if (terrainSolver && typeof terrainSolver.rebuildTerrainLayer === 'function') {
    (Array.isArray(runtimeScene && runtimeScene.nodes) ? runtimeScene.nodes : []).forEach((node) => {
      if (!node || node.type !== 'TileMap') return;
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
      const layers = Array.isArray(props.layers) ? props.layers : [];
      layers.forEach((layer) => {
        const tilesetId = String((layer && layer.tilesetId) || props.tilesetId || '');
        const tileset   = tilesetMap.get(tilesetId) || null;
        if (!tileset) return;
        const sets = Array.isArray(tileset.terrainSets) ? tileset.terrainSets : [];
        // Find the terrain set that owns cells in this layer
        // (cells store terrainSetId; fall back to first set)
        const activeSets = new Set();
        const h = Array.isArray(layer.cellData) ? layer.cellData.length : 0;
        for (let r = 0; r < h; r++) {
          const row = layer.cellData[r];
          if (!Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const sid = normalizeTerrainRef(row[c] && row[c].terrainSetId);
            if (sid) activeSets.add(sid);
          }
        }
        const setsToRebuild = activeSets.size > 0
          ? sets.filter((s) => s && activeSets.has(String(s.id)))
          : (sets.length > 0 ? [sets[0]] : []);
        setsToRebuild.forEach((rawSet) => {
          const terrainSet = terrainSolver.normalizeTerrainSetV35 ? terrainSolver.normalizeTerrainSetV35(rawSet) : rawSet;
          terrainSolver.rebuildTerrainLayer(terrainSet, layer, { randomize: options.randomizeTerrain === true });
        });
      });
    });
  }

  (Array.isArray(runtimeScene && runtimeScene.nodes) ? runtimeScene.nodes : []).forEach((node) => {
    if (!node || node.type !== 'TileMap') return;
    const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
    const layers = Array.isArray(props.layers) ? props.layers : [];
    layers.forEach((layer) => {
      const width = Array.isArray(layer && layer.tiles && layer.tiles[0]) ? layer.tiles[0].length : 0;
      const height = Array.isArray(layer && layer.tiles) ? layer.tiles.length : 0;
      const tilesetId = String((layer && layer.tilesetId) || props.tilesetId || '');
      const tileset = tilesetMap.get(tilesetId) || null;
      if (!Array.isArray(layer.cellData)) layer.cellData = [];

      for (let row = 0; row < height; row += 1) {
        if (!Array.isArray(layer.cellData[row])) layer.cellData[row] = [];
        for (let col = 0; col < width; col += 1) {
          const terrainTypeId = getTerrainTypeIdFromLayerCell(layer, col, row);
          if (!terrainTypeId) {
            const cell = readCell(layer, col, row);
            if (cell) cell.transform = normalizeCellTransform(cell.transform);
            continue;
          }

          const terrainSet = getTerrainSetById(tileset, getTerrainSetIdFromLayerCell(layer, col, row));
          const cell = ensureCell(layer, col, row);
          let result = null;
          if (tileset && terrainSet && terrainSolver && typeof terrainSolver.resolveTerrainRuleTile === 'function') {
            result = terrainSolver.resolveTerrainRuleTile(terrainSet, buildLayerNeighborSignature(layer, col, row), { randomize: options.randomizeTerrain === true });
          }

          const resolvedTileIndex = Number(result && result.tileIndex);
          const hasResolvedTile = Number.isFinite(resolvedTileIndex) && resolvedTileIndex >= 0;
          if (!hasResolvedTile) {
            warnings.push(`${node.name || node.id || 'TileMap'}:${layer.name || layer.id || 'Layer'}:${col},${row} has terrainTypeId "${terrainTypeId}" but no resolved tileIndex${result && result.fallbackReason ? ` (${result.fallbackReason})` : ''}.`);
          } else if (!isValidTileIndex(resolvedTileIndex, tileset)) {
            warnings.push(`${node.name || node.id || 'TileMap'}:${layer.name || layer.id || 'Layer'}:${col},${row} resolved invalid tileIndex ${resolvedTileIndex}.`);
          }

          const finalTile = hasResolvedTile ? resolvedTileIndex : -1;
          layer.tiles[row][col] = finalTile;
          // Write resolved terrain metadata into cell for runtime use.
          // terrainDiagnostics is editor-only and intentionally excluded from
          // the runtime payload so the Roku runtime stays simple.
          cell.terrainSetId  = terrainSet && terrainSet.id ? String(terrainSet.id) : normalizeTerrainRef(cell.terrainSetId);
          cell.terrainTypeId = terrainTypeId;
          cell.tileIndex     = finalTile;
          cell.transform     = normalizeCellTransform(result && result.transform);
          // Strip editor-only diagnostics — runtime does not need them
          delete cell.terrainDiagnostics;
        }
      }

      // v35 exports terrain as resolved tile data plus per-cell terrain metadata only.
      delete layer.terrain;
    });
    props.layers = layers;
    delete props.terrain;
    delete props.tiles;
    delete props.collision;
  });

  return { runtimeScene, warnings, baked: true };
}

// ── UI Export Validation ──────────────────────────────────────────────────────
// Runs after collecting all resources. Emits specific warnings for broken
// UI references that would cause runtime failures on Roku.

function validateExportBundle(runtimeScene, editorState, textures, uiScreens, uiOptionDefs, uiHighScoreTable) {
  const warnings = [];
  const nodeMap = new Map((runtimeScene.nodes || []).map(n => [n?.id, n]));
  const nodeNames = new Map((runtimeScene.nodes || []).map(n => [n?.name, n?.id]));
  const textureKeys = new Set(Object.keys(textures));
  const screenNames = new Set(Object.keys(uiScreens));
  const optionKeys  = new Set(Object.keys(uiOptionDefs));
  const tableIds    = new Set(Object.keys(uiHighScoreTable));

  const VALID_BUILTIN_ACTIONS = new Set([
    'back','quit_to_title','start_game','resume_game','open_options','close',
    'popscreen','options_reset'
  ]);
  const ACTION_PREFIXES = [
    'screen:','pushscreen:','scene:','push:','custom:',
    'transition_screen:','transition_scene:',
    'option_cycle:','option_set:','popscreen'
  ];

  for (const node of (runtimeScene.nodes || [])) {
    if (!node || typeof node !== 'object') continue;
    const props = node.properties || {};
    const loc   = `Node "${node.name || node.id}" (${node.type})`;

    // ── Texture references ─────────────────────────────────────────────
    if ((node.type === 'TextureRect' || node.type === 'NineSlicePanel') && props.imagePath) {
      const tid = props.textureId || props.imagePath;
      if (!textureKeys.has(tid)) {
        warnings.push(`WARN_MISSING_TEXTURE: ${loc} imagePath "${props.imagePath}" not in texture manifest. A colored placeholder will be shown.`);
      }
    }

    // ── NineSlice margins ──────────────────────────────────────────────
    if (node.type === 'NineSlicePanel') {
      const sl = Number(props.sliceLeft ?? 0), st = Number(props.sliceTop ?? 0);
      const sr = Number(props.sliceRight ?? 0), sb = Number(props.sliceBottom ?? 0);
      if (sl < 0 || st < 0 || sr < 0 || sb < 0) {
        warnings.push(`WARN_INVALID_NINESLICE: ${loc} has negative slice margins (l=${sl} t=${st} r=${sr} b=${sb}).`);
      }
      if (props.nineSliceStyleId) {
        // Style presence validated separately; runtime falls back to inline props
      }
    }

    // ── Button actions ─────────────────────────────────────────────────
    for (const actionProp of ['action', 'actionBack']) {
      const actionStr = String(props[actionProp] || '').trim().toLowerCase();
      if (!actionStr) continue;
      const isBuiltin = VALID_BUILTIN_ACTIONS.has(actionStr);
      const hasPrefix = ACTION_PREFIXES.some(p => actionStr.startsWith(p));
      if (!isBuiltin && !hasPrefix) {
        warnings.push(`WARN_UNKNOWN_ACTION: ${loc} ${actionProp}="${actionStr}" is not a known built-in or prefixed action. It will be forwarded as a UIAction script event.`);
      }
      // Validate screen: target exists
      if (actionStr.startsWith('screen:') || actionStr.startsWith('pushscreen:') ||
          actionStr.startsWith('transition_screen:')) {
        const prefix = actionStr.startsWith('transition_screen:') ? 'transition_screen:' :
                       actionStr.startsWith('pushscreen:') ? 'pushscreen:' : 'screen:';
        const target = String(props[actionProp]).trim().slice(prefix.length).trim();
        if (target && !screenNames.has(target)) {
          warnings.push(`WARN_MISSING_SCREEN: ${loc} ${actionProp}="${actionStr}" targets screen "${target}" which has no CanvasLayer assignment.`);
        }
      }
    }

    // ── Focus nav links ────────────────────────────────────────────────
    for (const navProp of ['focusUp','focusDown','focusLeft','focusRight']) {
      const target = String(props[navProp] || '').trim();
      if (!target) continue;
      if (!nodeMap.has(target) && !nodeNames.has(target)) {
        warnings.push(`WARN_INVALID_FOCUS_LINK: ${loc} ${navProp}="${target}" does not match any node id or name. Focus link will be ignored.`);
      }
    }

    // ── Option binding ─────────────────────────────────────────────────
    if (props.boundOptionKey) {
      const key = String(props.boundOptionKey).trim();
      if (key && !optionKeys.has(key)) {
        const builtinOptKeys = new Set(['music_volume','sound_volume','difficulty','display_mode']);
        if (!builtinOptKeys.has(key)) {
          warnings.push(`WARN_INVALID_OPTION_BINDING: ${loc} boundOptionKey="${key}" is not defined in uiOptionDefs. Label will show empty or stale text.`);
        }
      }
    }

    // ── High score binding ─────────────────────────────────────────────
    if (props.boundHighScoreTable) {
      const tid2 = String(props.boundHighScoreTable).trim();
      if (tid2 && !tableIds.has(tid2) && tid2 !== 'default') {
        warnings.push(`WARN_INVALID_HIGHSCORE_BINDING: ${loc} boundHighScoreTable="${tid2}" is not defined in uiHighScoreTable. Label will show empty text.`);
      }
      const rank = Number(props.boundHighScoreRank ?? 1);
      if (rank < 1 || !Number.isFinite(rank)) {
        warnings.push(`WARN_INVALID_HIGHSCORE_RANK: ${loc} boundHighScoreRank=${props.boundHighScoreRank} must be >= 1.`);
      }
    }
  }

  // ── Screen rootNodeIds references ──────────────────────────────────────
  for (const [screenName, screen] of Object.entries(uiScreens)) {
    for (const nid of (Array.isArray(screen.rootNodeIds) ? screen.rootNodeIds : [])) {
      if (!nodeMap.has(nid)) {
        warnings.push(`WARN_MISSING_SCREEN_NODE: Screen "${screenName}" rootNodeIds references node "${nid}" which is not in the scene.`);
      }
    }
    if (!(Array.isArray(screen.rootNodeIds) && screen.rootNodeIds.length)) {
      warnings.push(`WARN_EMPTY_SCREEN: Screen "${screenName}" has no rootNodeIds assigned. It will be invisible at runtime.`);
    }
  }

  return warnings;
}

function buildClassicExportMetadataFiles(scenes = [], options = {}) {
  const scenePayloads = [];
  const spriteSheets = {};
  const spriteFrames = {};
  const tilesets = {};
  const textures = {};
  const audio = {};
  const nineSliceStyles = {};
  const uiScreens = {};
  const uiTransitionPresets = {};
  const uiOptionDefs = {};
  const uiHighScoreTable = {};
  const sceneManifest = {};
  const bootScenes = [];
  const exportOptions = options.exportOptions || {};

  for (const sceneEntry of (Array.isArray(scenes) ? scenes : [])) {
    const runtimeScene = cloneJson(sceneEntry && sceneEntry.runtimeScene || {});
    const editorState = cloneJson(sceneEntry && sceneEntry.editorState || {});
    const bakeResult = bakeTerrainForRuntimeScene(runtimeScene, editorState, exportOptions);
    const sceneName = String((runtimeScene.scene && runtimeScene.scene.name) || (sceneEntry && sceneEntry.sceneName) || 'Scene').trim() || 'Scene';

    if (!runtimeScene.formatVersion) runtimeScene.formatVersion = 2;
    if (!runtimeScene.scene || typeof runtimeScene.scene !== 'object') runtimeScene.scene = { name: sceneName, rootNodeId: '' };
    if (!Array.isArray(runtimeScene.nodes)) runtimeScene.nodes = [];

    scenePayloads.push({ sceneName, json: JSON.stringify(runtimeScene, null, 2), warnings: bakeResult.warnings || [] });
    sceneManifest[sceneName] = { id: sceneName, name: sceneName, path: makeScenePath(sceneName) };
    if (!bootScenes.includes(sceneName)) bootScenes.push(sceneName);

    for (const sheet of (Array.isArray(editorState && editorState.spritesheets) ? editorState.spritesheets : [])) {
      if (!sheet || typeof sheet !== 'object' || !sheet.id) continue;
      const clean = sanitizeExportSpritesheet(sheet);
      spriteSheets[String(clean.id)] = clean;
      ensureTexture(textures, String(clean.id), clean.resourcePath || clean.filePath, 'image');
    }

    for (const lib of (Array.isArray(editorState && editorState.spriteFramesLibraries) ? editorState.spriteFramesLibraries : [])) {
      if (!lib || typeof lib !== 'object' || !lib.id) continue;
      spriteFrames[String(lib.id)] = sanitizeExportSpriteFramesLibrary(lib);
    }

    for (const tileset of (Array.isArray(editorState && editorState.tilesets) ? editorState.tilesets : [])) {
      if (!tileset || typeof tileset !== 'object' || !tileset.id) continue;
      const cleanTileset = sanitizeExportTileset(tileset, exportOptions);
      tilesets[String(cleanTileset.id)] = cleanTileset;
    }

    // Nine-slice styles — strip imageDataUrl, register texture references
    for (const style of (Array.isArray(editorState && editorState.nineSliceStyles) ? editorState.nineSliceStyles : [])) {
      if (!style || typeof style !== 'object' || !style.id) continue;
      const clean = cloneJson(style);
      delete clean.imageDataUrl;
      nineSliceStyles[String(clean.id)] = clean;
      if (clean.imagePath) ensureTexture(textures, `${clean.id}_tex`, clean.imagePath, 'image');
    }

    // UIScreens — keyed by screen name for runtime lookup
    for (const screen of (Array.isArray(editorState && editorState.uiScreens) ? editorState.uiScreens : [])) {
      if (!screen || typeof screen !== 'object' || !screen.name) continue;
      const clean = cloneJson(screen);
      uiScreens[String(clean.name)] = clean;
    }

    // UITransitionPresets — keyed by id
    for (const preset of (Array.isArray(editorState && editorState.uiTransitionPresets) ? editorState.uiTransitionPresets : [])) {
      if (!preset || typeof preset !== 'object' || !preset.id) continue;
      uiTransitionPresets[String(preset.id)] = cloneJson(preset);
    }

    // UIOptionDefs — keyed by option key for runtime lookup
    for (const def of (Array.isArray(editorState && editorState.uiOptionDefs) ? editorState.uiOptionDefs : [])) {
      if (!def || typeof def !== 'object' || !def.key) continue;
      uiOptionDefs[String(def.key)] = cloneJson(def);
    }

    // UIHighScoreTables — keyed by tableId
    for (const table of (Array.isArray(editorState && editorState.uiHighScoreTables) ? editorState.uiHighScoreTables : [])) {
      if (!table || typeof table !== 'object' || !table.tableId) continue;
      uiHighScoreTable[String(table.tableId)] = cloneJson(table);
    }

    for (const node of runtimeScene.nodes) {
      if (!node || typeof node !== 'object') continue;
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};

      // World-space image nodes
      if (props.imagePath) {
        const textureId = props.textureId || props.imagePath;
        ensureTexture(textures, textureId, props.imagePath, 'image');
      }

      // UI nodes: TextureRect and NineSlicePanel also carry imagePath
      if ((node.type === 'TextureRect' || node.type === 'NineSlicePanel') && props.imagePath) {
        const textureId = props.textureId || props.imagePath;
        ensureTexture(textures, textureId, props.imagePath, 'image');
      }

      const components = Array.isArray(node.components) ? node.components : [];
      for (const component of components) {
        if (!component || typeof component !== 'object') continue;
        if (component.type === 'AudioSource' && component.resourcePath) {
          const audioId = String(component.audioId || component.id || component.resourcePath).trim();
          if (audioId) audio[audioId] = { id: audioId, path: normalizeTexturePath(component.resourcePath), kind: 'audio' };
        }
      }
    }
  }

  // ── UI export validation — emit warnings for all scenes ────────────────────
  for (const sceneEntry of (Array.isArray(scenes) ? scenes : [])) {
    const runtimeScene2 = sceneEntry && sceneEntry.runtimeScene ? sceneEntry.runtimeScene : {};
    const uiWarnings = validateExportBundle(runtimeScene2, sceneEntry && sceneEntry.editorState || {}, textures, uiScreens, uiOptionDefs, uiHighScoreTable);
    if (uiWarnings.length) {
      const sceneName2 = String((runtimeScene2.scene && runtimeScene2.scene.name) || 'Scene');
      const matchingPayload = scenePayloads.find(p => p.sceneName === sceneName2);
      if (matchingPayload) matchingPayload.warnings = [...(matchingPayload.warnings || []), ...uiWarnings];
    }
  }

  const orderedScenes = Object.fromEntries(Object.entries(sceneManifest).sort(([a], [b]) => a.localeCompare(b)));
  const orderedTextures = Object.fromEntries(Object.entries(textures).sort(([a], [b]) => a.localeCompare(b)));
  const orderedSpriteSheets = Object.fromEntries(Object.entries(spriteSheets).sort(([a], [b]) => a.localeCompare(b)));
  const orderedSpriteFrames = Object.fromEntries(Object.entries(spriteFrames).sort(([a], [b]) => a.localeCompare(b)));
  const orderedTilesets = Object.fromEntries(Object.entries(tilesets).sort(([a], [b]) => a.localeCompare(b)));
  const orderedNineSliceStyles = Object.fromEntries(Object.entries(nineSliceStyles).sort(([a], [b]) => a.localeCompare(b)));
  const orderedUIScreens = Object.fromEntries(Object.entries(uiScreens).sort(([a], [b]) => a.localeCompare(b)));
  const orderedUITransitionPresets = Object.fromEntries(Object.entries(uiTransitionPresets).sort(([a], [b]) => a.localeCompare(b)));
  const orderedUIOptionDefs = Object.fromEntries(Object.entries(uiOptionDefs).sort(([a], [b]) => a.localeCompare(b)));
  const orderedUIHighScoreTable = Object.fromEntries(Object.entries(uiHighScoreTable).sort(([a], [b]) => a.localeCompare(b)));
  const orderedAudio = Object.fromEntries(Object.entries(audio).sort(([a], [b]) => a.localeCompare(b)));

  const resourcesManifest = {
    formatVersion: 1,
    scenes: orderedScenes,
    textures: orderedTextures,
    spriteSheets: orderedSpriteSheets,
    spriteFrames: orderedSpriteFrames,
    tilesets: orderedTilesets,
    nineSliceStyles: orderedNineSliceStyles,
    uiScreens: orderedUIScreens,
    uiTransitionPresets: orderedUITransitionPresets,
    uiOptionDefs: orderedUIOptionDefs,
    uiHighScoreTable: orderedUIHighScoreTable,
    audio: orderedAudio,
    preloadGroups: {
      boot: {
        scenes: bootScenes,
        textures: Object.keys(orderedTextures),
        audio: Object.keys(orderedAudio)
      }
    }
  };

  return {
    scenePayloads,
    warnings: scenePayloads.flatMap((entry) => entry.warnings || []),
    spriteframesJson: JSON.stringify({ libraries: Object.values(orderedSpriteFrames) }, null, 2),
    spritesheetsJson: JSON.stringify({ sheets: Object.values(orderedSpriteSheets) }, null, 2),
    tilesetsJson: JSON.stringify({ tilesets: Object.values(orderedTilesets) }, null, 2),
    uiScreensJson: JSON.stringify({ uiScreens: Object.values(orderedUIScreens) }, null, 2),
    uiTransitionPresetsJson: JSON.stringify({ uiTransitionPresets: Object.values(orderedUITransitionPresets) }, null, 2),
    uiOptionDefsJson: JSON.stringify({ uiOptionDefs: Object.values(orderedUIOptionDefs) }, null, 2),
    uiHighScoreTableJson: JSON.stringify({ uiHighScoreTable: Object.values(orderedUIHighScoreTable) }, null, 2),
    nineSliceStylesJson: JSON.stringify({ nineSliceStyles: Object.values(orderedNineSliceStyles) }, null, 2),
    audioJson: JSON.stringify({ audio: Object.values(orderedAudio) }, null, 2),
    resourcesJson: JSON.stringify(resourcesManifest, null, 2)
  };
}

module.exports = {
  buildClassicExportMetadataFiles,
  bakeTerrainForRuntimeScene,
  sanitizeExportTileset,
  validateExportBundle
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
