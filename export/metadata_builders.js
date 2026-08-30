globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeSavedRuntime(runtime) {
    const clean = clone(runtime || {});
    const nodes = Array.isArray(clean.nodes) ? clean.nodes : [];
    nodes.forEach((node) => {
      if (!node || typeof node !== 'object') return;
      if (!node.properties || typeof node.properties !== 'object') return;
      if ('imageDataUrl' in node.properties) node.properties.imageDataUrl = '';
    });
    return clean;
  }

  function sanitizeSavedEditor(editor) {
    const normalizedResources = RGE_ROOT.RokuSchemaResources?.normalizeEditorResourceState
      ? RGE_ROOT.RokuSchemaResources.normalizeEditorResourceState(clone(editor || {}))
      : clone(editor || {});
    const clean = clone(normalizedResources || {});
    const sheets = Array.isArray(clean.spritesheets) ? clean.spritesheets : [];
    sheets.forEach((sheet) => {
      if (!sheet || typeof sheet !== 'object') return;
      // Only strip dataUrl for project-asset sheets that have a resourcePath —
      // those can be reloaded from disk. Sheets without a path keep their dataUrl
      // because it's the only way to restore them after a project reload.
      const hasPath = !!(sheet.resourcePath || sheet.relativePath || sheet.filePath);
      if (hasPath) delete sheet.dataUrl;
    });
    return clean;
  }


  // normalizeTerrainRef → RGE_ROOT.RGEUtils.normalizeTerrainRef (shared, see core/utils.js)
  const normalizeTerrainRef = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
    ? RGE_ROOT.RGEUtils.normalizeTerrainRef
    : (v, fb = null) => {
        if (v == null || v === '' || v === false) return fb;
        const t = String(v).trim(); return t || fb;
      };

  function normalizeCellTransform(transform) {
    return RGE_ROOT.RokuTerrainSolver?.normalizeTransformSpec
      ? RGE_ROOT.RokuTerrainSolver.normalizeTransformSpec(transform)
      : { flipX: false, flipY: false, rotation: 0 };
  }

  function getTerrainSetById(tileset, terrainSetId) {
    const sets = Array.isArray(tileset?.terrainSets) ? tileset.terrainSets : [];
    const ref = normalizeTerrainRef(terrainSetId);
    const raw = (ref ? sets.find((set) => set && String(set.id) === ref) : null) || sets[0] || null;
    return raw && RGE_ROOT.RokuTerrainSolver?.normalizeTerrainSetV35 ? RGE_ROOT.RokuTerrainSolver.normalizeTerrainSetV35(raw) : raw;
  }

  function validateTerrainSetRulesForExport(tileset, warnings, context) {
    const sets = Array.isArray(tileset?.terrainSets) ? tileset.terrainSets : [];
    sets.forEach((rawSet) => {
      const set = RGE_ROOT.RokuTerrainSolver?.normalizeTerrainSetV35 ? RGE_ROOT.RokuTerrainSolver.normalizeTerrainSetV35(rawSet) : rawSet;
      const rules = Array.isArray(set?.rules) ? set.rules : [];
      const terrainTypes = Array.isArray(set?.terrainTypes) ? set.terrainTypes : [];
      if (!rules.length) warnings.push(context + ': terrain set "' + (set?.id || 'unnamed') + '" has no rules.');
      terrainTypes.forEach((type) => {
        if (!rules.some((rule) => rule && rule.enabled !== false && String(rule.terrainTypeId) === String(type.id))) {
          warnings.push(context + ': terrain type "' + type.id + '" has no matching enabled rules.');
        }
      });
    });
  }

  function preResolveTerrainForExport(runtime, editor, options = {}) {
    const warnings = [];
    if (options.bakeTerrain === false || !RGE_ROOT.RokuTerrainSolver?.resolveTerrainRuleTile) return { runtime, warnings, baked: false };
    const tilesetMap = new Map((Array.isArray(editor?.tilesets) ? editor.tilesets : []).map((tileset) => [String(tileset?.id || ''), clone(tileset)]));
    tilesetMap.forEach((tileset) => validateTerrainSetRulesForExport(tileset, warnings, 'export tileset "' + (tileset?.id || 'unnamed') + '"'));
    (runtime.nodes || []).forEach((node) => {
      if (!node || node.type !== 'TileMap') return;
      const props = node.properties || {};
      (props.layers || []).forEach((layer) => {
        const tileset = tilesetMap.get(String(layer?.tilesetId || props.tilesetId || '')) || null;
        const height = Array.isArray(layer?.tiles) ? layer.tiles.length : 0;
        for (let row = 0; row < height; row += 1) {
          const width = Array.isArray(layer.tiles[row]) ? layer.tiles[row].length : 0;
          if (!Array.isArray(layer.cellData)) layer.cellData = [];
          if (!Array.isArray(layer.cellData[row])) layer.cellData[row] = [];
          for (let col = 0; col < width; col += 1) {
            const cell = layer.cellData[row][col] && typeof layer.cellData[row][col] === 'object' ? layer.cellData[row][col] : null;
            const terrainTypeId = normalizeTerrainRef(cell?.terrainTypeId);
            if (!terrainTypeId) { if (cell) cell.transform = normalizeCellTransform(cell.transform); continue; }
            const terrainSet = getTerrainSetById(tileset, cell?.terrainSetId);
            const signature = RGE_ROOT.RokuTerrainSolver.buildTerrainNeighborSignature(layer, col, row);
            const result = terrainSet ? RGE_ROOT.RokuTerrainSolver.resolveTerrainRuleTile(terrainSet, signature, { randomize: options.randomizeTerrain === true }) : null;
            const tileIndex = Number(result?.tileIndex);
            const hasTile = Number.isFinite(tileIndex) && tileIndex >= 0;
            if (!hasTile) warnings.push(String(node.name || node.id || 'TileMap') + ':' + String(layer.name || layer.id || 'Layer') + ':' + col + ',' + row + ' has terrainTypeId "' + terrainTypeId + '" but no resolved tileIndex.');
            const nextCell = cell || {};
            layer.cellData[row][col] = nextCell;
            layer.tiles[row][col] = hasTile ? tileIndex : -1;
            nextCell.terrainSetId = terrainSet?.id || normalizeTerrainRef(nextCell.terrainSetId);
            nextCell.terrainTypeId = terrainTypeId;
            nextCell.tileIndex = layer.tiles[row][col];
            nextCell.transform = normalizeCellTransform(result?.transform);
          }
        }
        delete layer.terrain;
      });
      delete props.terrain;
      delete props.tiles;
      delete props.collision;
    });
    return { runtime, warnings, baked: true };
  }

  function splitSceneState(sceneState, editorState) {
    const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
    const editor = RGE_ROOT.RokuNodes.normalizeEditorState(clone(editorState || {}), runtime, sceneState || {});
    const cleanEditor = sanitizeSavedEditor(editor);
    const bakeResult = preResolveTerrainForExport(sanitizeSavedRuntime(runtime), cleanEditor, { bakeTerrain: true });
    return {
      runtime: bakeResult.runtime,
      editor: cleanEditor,
      exportWarnings: bakeResult.warnings || []
    };
  }

  function exportSceneAsJson(sceneState, editorState) {
    return JSON.stringify(splitSceneState(sceneState, editorState).runtime, null, 2);
  }

  function exportEditorStateAsJson(sceneState, editorState) {
    return JSON.stringify(splitSceneState(sceneState, editorState).editor, null, 2);
  }


  function buildRuntimeResourceManifest(scenes, editorStates) {
    const sceneMap = {};
    const textures = {};
    const spriteSheets = {};
    const spriteFrames = {};
    const tilesets = {};
    const audio = {};
    const nineSliceStyles = {};
    const uiScreens = {};
    const uiTransitionPresets = {};
    const uiOptionDefs = {};
    const uiHighScoreTable = {};
    const sceneList = Array.isArray(scenes) ? scenes : [scenes];
    const editorList = Array.isArray(editorStates) ? editorStates : [editorStates];

    sceneList.forEach((sceneState, index) => {
      const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
      const editor = RGE_ROOT.RokuNodes.normalizeEditorState(clone(editorList[index] || editorList[0] || {}), runtime, sceneState || {});
      const sceneName = runtime.scene?.name || `Scene${index + 1}`;
      sceneMap[sceneName] = { id: sceneName, name: sceneName, path: `pkg:/assets/scenes/${sceneName}.json` };

      (editor.spritesheets || []).forEach((sheet) => {
        if (!sheet || !sheet.id) return;
        const clean = sanitizeSavedEditor({ spritesheets: [sheet] }).spritesheets[0];
        spriteSheets[clean.id] = clean;
        const texturePath = clean.resourcePath || clean.filePath;
        if (texturePath) textures[clean.id] = { id: clean.id, path: texturePath, kind: 'image' };
      });

      (editor.spriteFramesLibraries || []).forEach((lib) => {
        if (lib && lib.id) spriteFrames[lib.id] = clone(lib);
      });

      // Nine-slice styles
      (editor.nineSliceStyles || []).forEach((style) => {
        if (!style || !style.id) return;
        const clean = clone(style);
        delete clean.imageDataUrl; // strip data URLs from runtime manifest
        nineSliceStyles[clean.id] = clean;
        // Register texture for export
        if (clean.imagePath) {
          const tid = clean.id + '_tex';
          textures[tid] = { id: tid, path: clean.imagePath, kind: 'image' };
        }
      });

      // UIScreens — keyed by screen name for fast runtime lookup
      (editor.uiScreens || []).forEach((screen) => {
        if (!screen || !screen.name) return;
        const clean = clone(screen);
        uiScreens[clean.name] = clean;
      });

      // UITransitionPresets — keyed by id
      (editor.uiTransitionPresets || []).forEach((preset) => {
        if (!preset || !preset.id) return;
        uiTransitionPresets[preset.id] = clone(preset);
      });

      // UIOptionDefs — keyed by option key for runtime lookup
      (editor.uiOptionDefs || []).forEach((def) => {
        if (!def || !def.key) return;
        uiOptionDefs[def.key] = clone(def);
      });

      // UIHighScoreTables — keyed by tableId
      (editor.uiHighScoreTables || []).forEach((table) => {
        if (!table || !table.tableId) return;
        uiHighScoreTable[table.tableId] = clone(table);
      });

      (editor.tilesets || []).forEach((tileset) => {
        if (tileset && tileset.id) {
          const cleanTileset = clone(tileset);
          if (Array.isArray(cleanTileset.terrainSets)) {
            cleanTileset.terrainSets = cleanTileset.terrainSets.map((set) => {
              const stripped = clone(set || {});
              delete stripped.rules;
              delete stripped.terrainRules;
              return stripped;
            });
          }
          tilesets[cleanTileset.id] = cleanTileset;
        }
      });

      (runtime.nodes || []).forEach((node) => {
        const props = node && node.properties ? node.properties : {};
        if (props.imagePath) textures[props.textureId || props.imagePath] = { id: props.textureId || props.imagePath, path: props.imagePath, kind: 'image' };
        // UI nodes: TextureRect and NineSlicePanel
        if ((node.type === 'TextureRect' || node.type === 'NineSlicePanel') && props.imagePath) {
          const tid = props.textureId || props.imagePath;
          textures[tid] = { id: tid, path: props.imagePath, kind: 'image' };
        }
        (node.components || []).forEach((component) => {
          if (component && component.type === 'AudioSource' && component.resourcePath) {
            const id = component.audioId || component.id || component.resourcePath;
            audio[id] = { id, path: component.resourcePath, kind: 'audio' };
          }
        });
      });
    });

    return {
      formatVersion: 1,
      scenes: sceneMap,
      textures,
      spriteSheets,
      spriteFrames,
      tilesets,
      nineSliceStyles,
      uiScreens,
      uiTransitionPresets,
      uiOptionDefs,
      uiHighScoreTable,
      audio,
      preloadGroups: {
        boot: {
          scenes: Object.keys(sceneMap),
          textures: Object.keys(textures),
          audio: Object.keys(audio)
        }
      }
    };
  }

  function exportSceneSummary(sceneState) {
    const runtime = RGE_ROOT.RokuNodes.normalizeScene(clone(sceneState || {}));
    return {
      sceneName: runtime.scene?.name || 'Untitled',
      nodeCount: Array.isArray(runtime.nodes) ? runtime.nodes.length : 0,
      nodeTypes: Array.from(new Set((runtime.nodes || []).map((node) => node.type))).sort(),
      formatVersion: runtime.formatVersion || RGE_ROOT.RokuNodes.SCENE_FORMAT_VERSION || 2
    };
  }

  RGE_ROOT.Exporter = {
    splitSceneState,
    exportSceneAsJson,
    exportEditorStateAsJson,
    buildRuntimeResourceManifest,
    exportSceneSummary
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
