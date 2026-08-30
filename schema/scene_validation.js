globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  function assertNodesLoaded() {
    if (!window.RokuNodes) throw new Error('schema/nodes.js must be loaded before schema/scene_validation.js');
  }

  function assertResourcesLoaded() {
    if (!window.RokuSchemaResources) throw new Error('schema/resources.js must be loaded before schema/scene_validation.js');
  }

  function parseSceneJson(text) {
    assertNodesLoaded();
    return window.RokuNodes.parseSceneJson(text);
  }

  function validateSceneDocument(doc, options) {
    assertNodesLoaded();
    return window.RokuNodes.validateSceneDocument(doc, options);
  }

  function isSupportedSceneFormatVersion(version) {
    assertNodesLoaded();
    return window.RokuNodes.isSupportedSceneFormatVersion(version);
  }

  function validateEditorResourceState(editorState) {
    assertResourcesLoaded();
    return window.RokuSchemaResources.validateEditorResourceState(editorState || {});
  }

  /**
   * validateNineSliceStyles
   * Validates the nineSliceStyles array in editorState.
   * Returns { valid, issues[] }.
   * - Each style must have a unique non-empty id
   * - sliceLeft/Top/Right/Bottom must be >= 0
   * - centerMode and edgeMode must be 'stretch' or 'tile'
   * - if imagePath is set it must be a non-empty string
   */
  function validateNineSliceStyles(editorState) {
    const issues = [];
    const styles = Array.isArray(editorState?.nineSliceStyles) ? editorState.nineSliceStyles : [];
    const seenIds = new Set();

    styles.forEach((style, i) => {
      const path = `nineSliceStyles[${i}]`;
      if (!style || typeof style !== 'object') {
        issues.push(`${path} must be an object`); return;
      }
      const id = String(style.id || '').trim();
      if (!id) { issues.push(`${path}.id is required`); }
      else if (seenIds.has(id)) { issues.push(`${path}.id "${id}" is duplicated`); }
      seenIds.add(id);

      if (!style.name) issues.push(`${path}.name is required`);

      ['sliceLeft','sliceTop','sliceRight','sliceBottom'].forEach(key => {
        const v = Number(style[key]);
        if (style[key] !== undefined && (!Number.isFinite(v) || v < 0)) {
          issues.push(`${path}.${key} must be a number >= 0, got ${style[key]}`);
        }
      });

      const validModes = new Set(['stretch','tile']);
      if (style.centerMode !== undefined && !validModes.has(style.centerMode)) {
        issues.push(`${path}.centerMode must be 'stretch' or 'tile', got ${JSON.stringify(style.centerMode)}`);
      }
      if (style.edgeMode !== undefined && !validModes.has(style.edgeMode)) {
        issues.push(`${path}.edgeMode must be 'stretch' or 'tile', got ${JSON.stringify(style.edgeMode)}`);
      }
      if (style.imagePath !== undefined && style.imagePath !== '' && typeof style.imagePath !== 'string') {
        issues.push(`${path}.imagePath must be a string`);
      }
    });

    return { valid: issues.length === 0, issues };
  }

  /**
   * validateNineSliceStyleReferences
   * Cross-checks that nodes using nineSliceStyleId actually reference
   * a style that exists in editorState.nineSliceStyles.
   * Returns { valid, issues[] }.
   */
  function validateNineSliceStyleReferences(sceneDoc, editorState) {
    const issues = [];
    if (!sceneDoc || !Array.isArray(sceneDoc.nodes)) return { valid: true, issues };
    const styles = Array.isArray(editorState?.nineSliceStyles) ? editorState.nineSliceStyles : [];
    const styleIds = new Set(styles.map(s => String(s.id || '')).filter(Boolean));

    const SUPPORTED_TYPES = new Set(['Panel', 'Button', 'NineSlicePanel']);
    sceneDoc.nodes.forEach((node) => {
      if (!SUPPORTED_TYPES.has(node?.type)) return;
      const sid = node.properties?.nineSliceStyleId;
      if (!sid || sid === '') return;
      if (!styleIds.has(String(sid))) {
        issues.push(`Node "${node.name || node.id}" (${node.type}) references missing NineSliceStyle "${sid}".`);
      }
    });

    return { valid: issues.length === 0, issues };
  }

  /**
   * validateFocusNavLinks
   * Checks that focusUp/Down/Left/Right on any node resolve to a node
   * that actually exists in the scene (by id or by name).
   * Returns { valid, issues[] }.
   */
  function validateFocusNavLinks(sceneDoc) {
    const issues = [];
    if (!sceneDoc || !Array.isArray(sceneDoc.nodes)) return { valid: true, issues };

    const nodeIds   = new Set(sceneDoc.nodes.map(n => String(n?.id   || '')).filter(Boolean));
    const nodeNames = new Set(sceneDoc.nodes.map(n => String(n?.name || '')).filter(Boolean));
    const NAV_KEYS  = ['focusUp', 'focusDown', 'focusLeft', 'focusRight'];

    sceneDoc.nodes.forEach((node) => {
      if (!node?.properties) return;
      for (const key of NAV_KEYS) {
        const target = node.properties[key];
        if (!target || target === '') continue;
        if (!nodeIds.has(target) && !nodeNames.has(target)) {
          issues.push(`Node "${node.name || node.id}" (${node.type}).${key} = "${target}" does not match any node id or name.`);
        }
      }
      // Warn if defaultFocus is set on a non-focusable type
      if (node.properties.defaultFocus === true) {
        const focusableTypes = new Set(['Button', 'MenuList', 'Control', 'CheckBox', 'Slider']);
        if (!focusableTypes.has(node.type) && node.properties.focusable !== true) {
          issues.push(`Node "${node.name || node.id}" (${node.type}) has defaultFocus=true but is not a focusable type.`);
        }
      }
    });

    return { valid: issues.length === 0, issues };
  }

  /**
   * validateUIScreens
   * Validates the uiScreens array in editorState.
   * Returns { valid, issues[] }.
   */
  function validateUIScreens(editorState, sceneDoc) {
    const issues = [];
    const screens = Array.isArray(editorState?.uiScreens) ? editorState.uiScreens : [];
    const seenIds   = new Set();
    const seenNames = new Set();
    const VALID_TYPES = new Set([
      'TitleScreen','LoadingScreen','OptionsMenu','PauseMenu',
      'HighScoresScreen','GameOverScreen','TransitionScreen','CustomScreen'
    ]);
    let startupCount = 0;

    const nodeIds   = new Set((sceneDoc?.nodes ?? []).map(n => String(n?.id ?? '')).filter(Boolean));
    const nodeNames = new Set((sceneDoc?.nodes ?? []).map(n => String(n?.name ?? '')).filter(Boolean));

    screens.forEach((screen, i) => {
      const path = `uiScreens[${i}]`;
      if (!screen || typeof screen !== 'object') { issues.push(`${path} must be an object`); return; }
      const id   = String(screen.id   || '').trim();
      const name = String(screen.name || '').trim();
      if (!id)   issues.push(`${path}.id is required`);
      else if (seenIds.has(id)) issues.push(`${path}.id "${id}" is duplicated`);
      seenIds.add(id);
      if (!name) issues.push(`${path}.name is required`);
      else if (seenNames.has(name)) issues.push(`${path}.name "${name}" is duplicated (screen names must be unique)`);
      seenNames.add(name);
      if (screen.screenType && !VALID_TYPES.has(screen.screenType)) {
        issues.push(`${path}.screenType "${screen.screenType}" is invalid`);
      }
      if (screen.startupScreen === true) startupCount++;
      // Validate rootNodeIds exist in scene
      (Array.isArray(screen.rootNodeIds) ? screen.rootNodeIds : []).forEach((nid, j) => {
        if (!nodeIds.has(String(nid)) && !nodeNames.has(String(nid))) {
          issues.push(`${path}.rootNodeIds[${j}] = "${nid}" does not match any node in the scene.`);
        }
      });
    });

    if (startupCount > 1) {
      issues.push(`Only one UIScreen may have startupScreen=true; found ${startupCount}.`);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * validateUITransitionPresets
   * Validates the uiTransitionPresets array in editorState.
   */
  function validateUITransitionPresets(editorState) {
    const issues = [];
    const presets = Array.isArray(editorState?.uiTransitionPresets) ? editorState.uiTransitionPresets : [];
    const seenIds = new Set();
    const VALID_TYPES   = new Set(['instant','fade','slide_left','slide_right','slide_up','slide_down','wipe']);
    const VALID_EASINGS = new Set(['linear','ease_in','ease_out','ease_in_out','elastic_out']);

    presets.forEach((preset, i) => {
      const path = `uiTransitionPresets[${i}]`;
      if (!preset || typeof preset !== 'object') { issues.push(`${path} must be an object`); return; }
      const id = String(preset.id || '').trim();
      if (!id) issues.push(`${path}.id is required`);
      else if (seenIds.has(id)) issues.push(`${path}.id "${id}" is duplicated`);
      seenIds.add(id);
      if (!preset.name) issues.push(`${path}.name is required`);
      if (preset.transType && !VALID_TYPES.has(preset.transType)) {
        issues.push(`${path}.transType "${preset.transType}" is not a valid transition type.`);
      }
      if (preset.easing && !VALID_EASINGS.has(preset.easing)) {
        issues.push(`${path}.easing "${preset.easing}" is not valid.`);
      }
      if (preset.duration !== undefined && (Number(preset.duration) < 0 || !Number.isFinite(Number(preset.duration)))) {
        issues.push(`${path}.duration must be >= 0.`);
      }
    });

    return { valid: issues.length === 0, issues };
  }

  /**
   * validateUIOptionDefs
   */
  function validateUIOptionDefs(editorState) {
    const issues = [];
    const defs = Array.isArray(editorState?.uiOptionDefs) ? editorState.uiOptionDefs : [];
    const seenIds = new Set(); const seenKeys = new Set();
    const VALID_TYPES = new Set(['string','float','int','bool']);
    defs.forEach((def, i) => {
      const path = `uiOptionDefs[${i}]`;
      if (!def || typeof def !== 'object') { issues.push(`${path} must be an object`); return; }
      const id = String(def.id || '').trim();
      if (!id) issues.push(`${path}.id is required`);
      else if (seenIds.has(id)) issues.push(`${path}.id "${id}" duplicated`);
      seenIds.add(id);
      const key = String(def.key || '').trim();
      if (!key) issues.push(`${path}.key is required`);
      else if (seenKeys.has(key)) issues.push(`${path}.key "${key}" duplicated`);
      seenKeys.add(key);
      if (def.optionType && !VALID_TYPES.has(def.optionType)) {
        issues.push(`${path}.optionType "${def.optionType}" invalid`);
      }
    });
    return { valid: issues.length === 0, issues };
  }

  /**
   * validateUIHighScoreTables
   */
  function validateUIHighScoreTables(editorState) {
    const issues = [];
    const tables = Array.isArray(editorState?.uiHighScoreTables) ? editorState.uiHighScoreTables : [];
    const seenIds = new Set();
    tables.forEach((table, i) => {
      const path = `uiHighScoreTables[${i}]`;
      if (!table || typeof table !== 'object') { issues.push(`${path} must be an object`); return; }
      const id = String(table.id || '').trim();
      if (!id) issues.push(`${path}.id is required`);
      else if (seenIds.has(id)) issues.push(`${path}.id "${id}" duplicated`);
      seenIds.add(id);
      const me = Number(table.maxEntries);
      if (Number.isFinite(me) && (me < 1 || me > 100)) {
        issues.push(`${path}.maxEntries must be 1–100`);
      }
      if (table.sortOrder && !['desc','asc'].includes(table.sortOrder)) {
        issues.push(`${path}.sortOrder "${table.sortOrder}" must be "desc" or "asc"`);
      }
    });
    return { valid: issues.length === 0, issues };
  }

  /**
   * runFullExportValidation
   * Convenience function that runs all Phase 1-9 validators in one call.
   * Returns { valid, issues[] } consolidated from all validators.
   * Use this during export to surface all UI problems at once.
   */
  function runFullExportValidation(sceneDoc, editorState) {
    const allIssues = [];

    const run = (fn, ...args) => {
      try {
        const result = fn(...args);
        if (result && Array.isArray(result.issues)) allIssues.push(...result.issues);
      } catch (e) {
        allIssues.push(`Validator error in ${fn.name}: ${e.message}`);
      }
    };

    run(validateNineSliceStyles,            editorState);
    run(validateNineSliceStyleReferences,   sceneDoc, editorState);
    run(validateFocusNavLinks,              sceneDoc);
    run(validateUIScreens,                  editorState, sceneDoc);
    run(validateUITransitionPresets,        editorState);
    run(validateUIOptionDefs,               editorState);
    run(validateUIHighScoreTables,          editorState);

    return { valid: allIssues.length === 0, issues: allIssues };
  }

  window.RokuSceneValidation = {
    parseSceneJson,
    validateSceneDocument,
    isSupportedSceneFormatVersion,
    validateEditorResourceState,
    validateNineSliceStyles,
    validateNineSliceStyleReferences,
    validateFocusNavLinks,
    validateUIScreens,
    validateUITransitionPresets,
    validateUIOptionDefs,
    validateUIHighScoreTables,
    runFullExportValidation,
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
