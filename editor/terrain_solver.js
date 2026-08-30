globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * terrain_solver.js  —  Patch v36.1
 *
 * Rule-based terrain tile solver — fully deterministic.
 *
 * ── Solver flow ───────────────────────────────────────────────────────────
 *  1. Build an 8-directional neighbor signature from the layer.
 *  2. Test every enabled rule whose terrainTypeId matches the center cell.
 *  3. Score each rule: quality = (constrained×100) + (exact×10) − wildcard.
 *  4. Sort and pick deterministically — no Math.random() inside solving.
 *  5. Weight-based variation uses a seeded hash, not Math.random().
 *  6. Return full diagnostics including top-5 candidates.
 *
 * ── Determinism guarantee ────────────────────────────────────────────────
 *  pickBestTerrainRuleDeterministic() is the only selection path.
 *  Tie-break order: quality → exact → weight → tileIndex → rule id (alpha).
 *  Weighted variation seeds from layerId + col + row + terrainTypeId.
 *
 * ── No legacy fields ─────────────────────────────────────────────────────
 *  autotileMask / edgeLabels / cornerLabels are NOT used here.
 *  They were converted to rule.neighbors{} by terrain_migration.js at load.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.RokuTerrainSolver = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(_global) {
  'use strict';

  // ── constants ─────────────────────────────────────────────────────────────
  const NEIGHBOR_KEYS = ['top','right','bottom','left','topLeft','topRight','bottomRight','bottomLeft'];
  const CARDINAL_KEYS = ['top','right','bottom','left'];
  const DIAGONAL_KEYS = ['topLeft','topRight','bottomRight','bottomLeft'];
  const SPECIAL_VALUES = new Set(['*','same','different']);

  // ── primitive helpers ─────────────────────────────────────────────────────
  // normalizeTerrainRef → RGE_ROOT.RGEUtils.normalizeTerrainRef (shared, see core/utils.js)
  const normalizeTerrainRef = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
    ? RGE_ROOT.RGEUtils.normalizeTerrainRef
    : (v, fb = null) => { if (v == null || v === '') return fb; return String(v); };
  function normalizeNeighborValue(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    return text || null;
  }
  function normalizeNeighbors(neighbors) {
    const source = neighbors && typeof neighbors === 'object' ? neighbors : {};
    return NEIGHBOR_KEYS.reduce((out, key) => { out[key] = normalizeNeighborValue(source[key]); return out; }, {});
  }
  function normalizeTerrainType(type, index = 0) {
    const source = type && typeof type === 'object' ? type : {};
    return {
      id: String(source.id || `terrain_${index}`),
      name: String(source.name || 'Terrain'),
      color: String(source.color || '#7a6ff0'),
      iconTileIndex: source.iconTileIndex == null || source.iconTileIndex === ''
        ? null : Math.max(0, Math.floor(Number(source.iconTileIndex) || 0)),
    };
  }
  function normalizeTerrainRule(rule, index = 0) {
    const source = rule && typeof rule === 'object' ? rule : {};
    return {
      id: String(source.id || `rule_${index}`),
      terrainTypeId: normalizeTerrainRef(source.terrainTypeId, ''),
      tileIndex: Math.max(0, Math.floor(Number(source.tileIndex) || 0)),
      neighbors: normalizeNeighbors(source.neighbors),
      weight: Math.max(0, Number(source.weight == null ? 1 : source.weight) || 0),
      allowRotate: source.allowRotate === true,
      allowFlipX: source.allowFlipX === true,
      allowFlipY: source.allowFlipY === true,
      enabled: source.enabled !== false,
    };
  }
  function normalizeTerrainSetV35(set) {
    const source = set && typeof set === 'object' ? set : {};
    return {
      id: String(source.id || 'terrainset_default'),
      name: String(source.name || 'Terrain Set'),
      terrainTypes: Array.isArray(source.terrainTypes) ? source.terrainTypes.map(normalizeTerrainType) : [],
      rules: Array.isArray(source.rules) ? source.rules.map(normalizeTerrainRule) : [],
    };
  }
  function normalizeTransformSpec(spec) {
    const src = spec && typeof spec === 'object' ? spec : {};
    let rotation = Number(src.rotation);
    if (!Number.isFinite(rotation)) rotation = 0;
    rotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
    return { flipX: src.flipX === true, flipY: src.flipY === true, rotation };
  }

  // ── deterministic hash (seeded variation, no Math.random) ─────────────────
  /**
   * A fast 32-bit hash of an integer seed — used for weighted variation.
   * Returns a float in [0, 1). Completely deterministic.
   */
  function seededHash(seed) {
    let h = (seed ^ 0xdeadbeef) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0x100000000;
  }
  function makeSeed(layerId, col, row, terrainTypeId) {
    let h = 0;
    const str = `${layerId || ''}:${col}:${row}:${terrainTypeId || ''}`;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return h >>> 0;
  }

  // ── transform helpers ─────────────────────────────────────────────────────
  function rotateNeighbors90(n) {
    return { top:n.left, right:n.top, bottom:n.right, left:n.bottom,
             topLeft:n.bottomLeft, topRight:n.topLeft, bottomRight:n.topRight, bottomLeft:n.bottomRight };
  }
  function flipNeighborsX(n) {
    return { top:n.top, right:n.left, bottom:n.bottom, left:n.right,
             topLeft:n.topRight, topRight:n.topLeft, bottomRight:n.bottomLeft, bottomLeft:n.bottomRight };
  }
  function flipNeighborsY(n) {
    return { top:n.bottom, right:n.right, bottom:n.top, left:n.left,
             topLeft:n.bottomLeft, topRight:n.bottomRight, bottomRight:n.topRight, bottomLeft:n.topLeft };
  }
  function applyTransformToRule(rule, transform) {
    const t = normalizeTransformSpec(transform);
    let neighbors = normalizeNeighbors(rule && rule.neighbors);
    if (t.flipX)            neighbors = flipNeighborsX(neighbors);
    if (t.flipY)            neighbors = flipNeighborsY(neighbors);
    if (t.rotation === 90)  neighbors = rotateNeighbors90(neighbors);
    else if (t.rotation === 180) neighbors = rotateNeighbors90(rotateNeighbors90(neighbors));
    else if (t.rotation === 270) neighbors = rotateNeighbors90(rotateNeighbors90(rotateNeighbors90(neighbors)));
    return Object.assign({}, normalizeTerrainRule(rule), { neighbors, transform: t });
  }
  function getRuleTransforms(rule) {
    const transforms = [{ flipX:false, flipY:false, rotation:0 }];
    const seen = new Set([JSON.stringify(transforms[0])]);
    function push(spec) {
      const t = normalizeTransformSpec(spec);
      const key = JSON.stringify(t);
      if (!seen.has(key)) { seen.add(key); transforms.push(t); }
    }
    if (rule && rule.allowRotate) { push({rotation:90}); push({rotation:180}); push({rotation:270}); }
    if (rule && rule.allowFlipX) push({flipX:true});
    if (rule && rule.allowFlipY) push({flipY:true});
    if (rule && rule.allowFlipX && rule.allowRotate) {
      push({flipX:true,rotation:90}); push({flipX:true,rotation:180}); push({flipX:true,rotation:270});
    }
    if (rule && rule.allowFlipY && rule.allowRotate) {
      push({flipY:true,rotation:90}); push({flipY:true,rotation:180}); push({flipY:true,rotation:270});
    }
    return transforms;
  }

  // ── signature building ────────────────────────────────────────────────────
  function readCellTerrainTypeId(layer, col, row) {
    if (!layer || row < 0 || col < 0) return null;
    const cell = layer.cellData && layer.cellData[row] && layer.cellData[row][col];
    if (cell && typeof cell === 'object' && cell.terrainTypeId != null && cell.terrainTypeId !== '') {
      return normalizeTerrainRef(cell.terrainTypeId, null);
    }
    const terrain = layer.terrain && layer.terrain[row] && layer.terrain[row][col];
    return normalizeTerrainRef(terrain, null);
  }
  function buildTerrainNeighborSignature(layerOrNeighborhood, col, row) {
    if (layerOrNeighborhood && typeof layerOrNeighborhood === 'object'
        && Array.isArray(layerOrNeighborhood.cellData)) {
      return {
        terrainTypeId: readCellTerrainTypeId(layerOrNeighborhood, col, row),
        top:           readCellTerrainTypeId(layerOrNeighborhood, col,     row - 1),
        right:         readCellTerrainTypeId(layerOrNeighborhood, col + 1, row),
        bottom:        readCellTerrainTypeId(layerOrNeighborhood, col,     row + 1),
        left:          readCellTerrainTypeId(layerOrNeighborhood, col - 1, row),
        topLeft:       readCellTerrainTypeId(layerOrNeighborhood, col - 1, row - 1),
        topRight:      readCellTerrainTypeId(layerOrNeighborhood, col + 1, row - 1),
        bottomRight:   readCellTerrainTypeId(layerOrNeighborhood, col + 1, row + 1),
        bottomLeft:    readCellTerrainTypeId(layerOrNeighborhood, col - 1, row + 1),
      };
    }
    const n = layerOrNeighborhood && typeof layerOrNeighborhood === 'object' ? layerOrNeighborhood : {};
    const out = { terrainTypeId: normalizeTerrainRef(n.terrainTypeId != null ? n.terrainTypeId : n.center, null) };
    NEIGHBOR_KEYS.forEach((key) => { out[key] = normalizeTerrainRef(n[key], null); });
    return out;
  }

  // ── matching and scoring ──────────────────────────────────────────────────
  function requirementMatches(requirement, actual, centerTerrainTypeId) {
    const req    = normalizeNeighborValue(requirement);
    const nbr    = normalizeTerrainRef(actual, null);
    const center = normalizeTerrainRef(centerTerrainTypeId, null);
    if (req == null || req === '*') return { ok:true, wildcard:true, exact:false, failReason:null };
    if (req === 'same')      {
      const ok = nbr != null && center != null && nbr === center;
      return { ok, wildcard:false, exact:true, failReason: ok ? null : `expected same as "${center}", got "${nbr}"` };
    }
    if (req === 'different') {
      const ok = nbr == null || center == null || nbr !== center;
      return { ok, wildcard:false, exact:true, failReason: ok ? null : `expected different from "${center}", got "${nbr}"` };
    }
    const ok = nbr === req;
    return { ok, wildcard:false, exact:ok, failReason: ok ? null : `expected "${req}", got "${nbr}"` };
  }

  function scoreTerrainRule(rule, signature) {
    const normalizedRule = normalizeTerrainRule(rule);
    const sig    = buildTerrainNeighborSignature(signature || {});
    const center = normalizeTerrainRef(sig.terrainTypeId, null);
    let exact = 0, wildcard = 0, mismatch = 0, constrained = 0;
    const failedChecks = [];
    NEIGHBOR_KEYS.forEach((key) => {
      const req    = normalizedRule.neighbors[key];
      const result = requirementMatches(req, sig[key], center);
      if (req != null && req !== '*') constrained += 1;
      if (!result.ok) { mismatch += 1; failedChecks.push({ key, reason: result.failReason }); }
      else if (result.wildcard) wildcard += 1;
      else if (result.exact)    exact    += 1;
    });
    const quality = mismatch > 0
      ? -100000 - mismatch
      : (constrained * 100) + (exact * 10) - wildcard;
    return { exact, wildcard, mismatch, constrained, compared:NEIGHBOR_KEYS.length, quality,
             isValid:mismatch === 0, failedChecks };
  }

  function matchTerrainRule(rule, signature) {
    if (!rule || rule.enabled === false) return null;
    const normalizedRule = normalizeTerrainRule(rule);
    const sig = buildTerrainNeighborSignature(signature || {});
    if (normalizeTerrainRef(normalizedRule.terrainTypeId, null)
        !== normalizeTerrainRef(sig.terrainTypeId, null)) return null;
    let best = null;
    getRuleTransforms(normalizedRule).forEach((transform) => {
      const transformedRule = applyTransformToRule(normalizedRule, transform);
      const score = scoreTerrainRule(transformedRule, sig);
      if (!score.isValid) return;
      const penalty = (transform.flipX || transform.flipY || transform.rotation !== 0) ? 1 : 0;
      const effectiveQuality = score.quality - penalty;
      const candidate = { rule:transformedRule, score, transform:normalizeTransformSpec(transform),
                          weight:transformedRule.weight, effectiveQuality };
      if (!best || effectiveQuality > best.effectiveQuality
          || (effectiveQuality === best.effectiveQuality && candidate.weight > best.weight)) {
        best = candidate;
      }
    });
    return best;
  }

  // ── deterministic candidate selection ─────────────────────────────────────
  /**
   * Sort candidates deterministically.
   * Tie-break: quality → exact → weight → tileIndex → rule id (alpha).
   */
  function sortCandidatesDeterministic(candidates) {
    return [...candidates].sort((a, b) => {
      if (b.effectiveQuality !== a.effectiveQuality) return b.effectiveQuality - a.effectiveQuality;
      if ((b.score.exact || 0) !== (a.score.exact || 0)) return (b.score.exact||0) - (a.score.exact||0);
      if ((b.weight||0) !== (a.weight||0)) return (b.weight||0) - (a.weight||0);
      if ((a.rule.tileIndex||0) !== (b.rule.tileIndex||0)) return (a.rule.tileIndex||0) - (b.rule.tileIndex||0);
      return String(a.rule.id||'').localeCompare(String(b.rule.id||''));
    });
  }

  /**
   * Pick the best candidate deterministically.
   * When multiple top-quality candidates exist AND they have different weights,
   * use a seeded hash (not Math.random) for weighted selection.
   *
   * @param {object[]} candidates  — sorted (highest quality first)
   * @param {object}   seedContext — { layerId, col, row, terrainTypeId }
   */
  function pickBestTerrainRuleDeterministic(candidates, seedContext = {}) {
    if (!candidates || !candidates.length) return null;
    const sorted = sortCandidatesDeterministic(candidates);
    const bestQuality = sorted[0].effectiveQuality;
    const top = sorted.filter((c) => c.effectiveQuality === bestQuality);
    if (top.length === 1) return top[0];
    // Check if weights differ among top candidates
    const weights = top.map((c) => Math.max(0, Number(c.weight) || 0));
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const allEqualWeight = weights.every((w) => w === weights[0]);
    if (allEqualWeight || totalWeight <= 0) {
      // Pure deterministic: first in sorted order wins
      return top[0];
    }
    // Weighted selection using seeded hash — fully reproducible
    const seed = makeSeed(seedContext.layerId, seedContext.col, seedContext.row, seedContext.terrainTypeId);
    const roll = seededHash(seed) * totalWeight;
    let cumulative = 0;
    for (let i = 0; i < top.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) return top[i];
    }
    return top[top.length - 1];
  }

  // ── primary solver entry point ────────────────────────────────────────────
  function resolveTerrainRuleTile(terrainSet, signature, options = {}) {
    const set = normalizeTerrainSetV35(terrainSet);
    const sig = buildTerrainNeighborSignature(signature || {});
    const terrainTypeId = normalizeTerrainRef(sig.terrainTypeId, null);
    if (!terrainTypeId) {
      return { terrainTypeId:null, neighborSignature:sig, matchedRuleId:null, tileIndex:-1,
               transform:normalizeTransformSpec(null), fallbackUsed:true,
               fallbackReason:'Cell has no terrainTypeId', score:null,
               candidates:[], top5Candidates:[], candidateCount:0, matchedRule:null };
    }
    // Collect, score, sort — all rules sorted before matching to ensure determinism
    const sortedRules = [...set.rules].sort((a, b) =>
      String(a.id||'').localeCompare(String(b.id||'')));
    const candidates = [];
    sortedRules.forEach((rule, order) => {
      const candidate = matchTerrainRule(rule, sig);
      if (!candidate) return;
      candidates.push(Object.assign(candidate, {
        order, ruleId:candidate.rule.id, tileIndex:candidate.rule.tileIndex,
        terrainTypeId:candidate.rule.terrainTypeId,
      }));
    });
    // Also gather failed candidates for debug (top 5 by score, including non-matching)
    const allScored = sortedRules
      .filter((r) => r.enabled !== false && normalizeTerrainRef(r.terrainTypeId,'') === terrainTypeId)
      .map((rule) => {
        const normRule = normalizeTerrainRule(rule);
        const score = scoreTerrainRule(normRule, sig);
        return { ruleId:rule.id, tileIndex:normRule.tileIndex, score,
                 matched:score.isValid, failedChecks:score.failedChecks };
      })
      .sort((a, b) => b.score.quality - a.score.quality)
      .slice(0, 5);

    const seedCtx = { layerId:options.layerId||'', col:options.col||0,
                      row:options.row||0, terrainTypeId };
    const picked = pickBestTerrainRuleDeterministic(candidates, seedCtx);

    if (!picked) {
      return { terrainTypeId, neighborSignature:sig, matchedRuleId:null, tileIndex:-1,
               transform:normalizeTransformSpec(null), fallbackUsed:true,
               fallbackReason:'No enabled terrain rule matched this neighbor signature',
               score:null, candidates, top5Candidates:allScored,
               candidateCount:candidates.length, matchedRule:null };
    }
    return {
      terrainTypeId, neighborSignature:sig,
      matchedRuleId:picked.ruleId, ruleId:picked.ruleId,
      tileIndex:picked.tileIndex,
      transform:normalizeTransformSpec(picked.transform),
      fallbackUsed:false, fallbackReason:'',
      score:Object.assign({},picked.score,{effectiveQuality:picked.effectiveQuality}),
      candidates, top5Candidates:allScored,
      candidateCount:candidates.length, weight:picked.weight, matchedRule:picked.rule,
    };
  }

  // ── cell / layer rebuild ──────────────────────────────────────────────────
  function ensureLayerCell(layer, col, row) {
    if (!layer || row < 0 || col < 0) return null;
    if (!Array.isArray(layer.cellData)) layer.cellData = [];
    if (!Array.isArray(layer.cellData[row])) layer.cellData[row] = [];
    let cell = layer.cellData[row][col];
    if (!cell || typeof cell !== 'object') cell = {};
    cell.terrainTypeId = normalizeTerrainRef(
      cell.terrainTypeId != null ? cell.terrainTypeId
        : (layer.terrain && layer.terrain[row] && layer.terrain[row][col]), null);
    cell.terrainSetId = normalizeTerrainRef(cell.terrainSetId, null);
    cell.tileIndex = Number.isFinite(Number(cell.tileIndex)) ? Number(cell.tileIndex) : -1;
    cell.transform = normalizeTransformSpec(cell.transform);
    layer.cellData[row][col] = cell;
    return cell;
  }

  function rebuildTerrainCell(terrainSet, layer, col, row, options = {}) {
    if (!layer || row < 0 || col < 0
        || !Array.isArray(layer.tiles) || !Array.isArray(layer.tiles[row])) {
      return { changed:false, result:null };
    }
    const cell = ensureLayerCell(layer, col, row);
    const signature = buildTerrainNeighborSignature(layer, col, row);
    const seedCtx = { layerId:options.layerId||layer.id||'', col, row,
                      terrainTypeId:signature.terrainTypeId };
    const result = resolveTerrainRuleTile(terrainSet, signature,
      Object.assign({}, options, seedCtx));
    const nextTile = Number.isFinite(Number(result.tileIndex)) ? Number(result.tileIndex) : -1;
    const prevTile = Number.isFinite(Number(layer.tiles[row][col])) ? Number(layer.tiles[row][col]) : -1;
    let changed = prevTile !== nextTile;
    layer.tiles[row][col] = nextTile;
    if (cell) {
      const prevJson = JSON.stringify({ tileIndex:cell.tileIndex, transform:cell.transform });
      cell.tileIndex = nextTile;
      cell.transform = normalizeTransformSpec(result.transform);
      cell.terrainSetId = normalizeTerrainRef(terrainSet && terrainSet.id, cell.terrainSetId);
      cell.terrainDiagnostics = {
        terrainTypeId:result.terrainTypeId, neighborSignature:result.neighborSignature,
        matchedRuleId:result.matchedRuleId, tileIndex:nextTile,
        fallbackReason:result.fallbackReason||'', fallbackUsed:result.fallbackUsed===true,
        score:result.score||null, transform:cell.transform,
        top5Candidates:result.top5Candidates||[], candidateCount:result.candidateCount||0,
      };
      if (JSON.stringify({tileIndex:cell.tileIndex,transform:cell.transform}) !== prevJson) changed = true;
    }
    return { changed, result };
  }

  function rebuildTerrainNeighborhood(terrainSet, layer, col, row, radius = 1, options = {}) {
    let changed = false;
    const results = [];
    for (let y = row - radius; y <= row + radius; y++) {
      for (let x = col - radius; x <= col + radius; x++) {
        const out = rebuildTerrainCell(terrainSet, layer, x, y, options);
        if (out.changed) changed = true;
        if (out.result)  results.push({ col:x, row:y, result:out.result });
      }
    }
    return { changed, results };
  }

  function rebuildTerrainLayer(terrainSet, layer, options = {}) {
    if (!layer || !Array.isArray(layer.tiles)) return { changed:false, solvedCells:0, results:[] };
    let changed = false;
    const results = [];
    for (let row = 0; row < layer.tiles.length; row++) {
      const width = Array.isArray(layer.tiles[row]) ? layer.tiles[row].length : 0;
      for (let col = 0; col < width; col++) {
        const terrainTypeId = readCellTerrainTypeId(layer, col, row);
        if (!terrainTypeId) continue;
        const out = rebuildTerrainCell(terrainSet, layer, col, row,
          Object.assign({}, options, { layerId:options.layerId||layer.id||'' }));
        if (out.changed) changed = true;
        results.push({ col, row, result:out.result });
      }
    }
    return { changed, solvedCells:results.length, results };
  }

  // ── debug helper ──────────────────────────────────────────────────────────
  function debugCell(terrainSet, layer, col, row) {
    const signature = buildTerrainNeighborSignature(layer, col, row);
    const result    = resolveTerrainRuleTile(terrainSet, signature,
      { layerId:layer&&layer.id||'', col, row, randomize:false });
    const existing  = layer && layer.cellData && layer.cellData[row] && layer.cellData[row][col]
      ? layer.cellData[row][col].terrainDiagnostics || null : null;
    return {
      col, row,
      terrainTypeId:result.terrainTypeId,
      neighborSignature:result.neighborSignature,
      matchedRuleId:result.matchedRuleId,
      tileIndex:result.tileIndex,
      transform:result.transform,
      fallbackUsed:result.fallbackUsed,
      fallbackReason:result.fallbackReason,
      score:result.score,
      candidates:result.candidates,
      top5Candidates:result.top5Candidates||[],
      candidateCount:result.candidateCount,
      existingDiagnostics:existing,
    };
  }

  // ── conflict / rule validation ────────────────────────────────────────────
  /**
   * Validate a terrain set and return structured issues.
   * Each issue: { level: 'ERROR'|'WARNING'|'INFO', code, message, ruleId?, terrainTypeId? }
   */
  function validateTerrainSetConflicts(terrainSet) {
    // Keep the raw rules for pre-normalization checks (e.g. tileIndex before clamping)
    const rawRules = Array.isArray(terrainSet && terrainSet.rules) ? terrainSet.rules : [];
    const set = normalizeTerrainSetV35(terrainSet);
    const issues = [];
    const typeIds = new Set((set.terrainTypes||[]).map((t) => String(t.id||'')).filter(Boolean));

    // Duplicate type IDs
    const seenTypeIds = new Set();
    (set.terrainTypes||[]).forEach((t) => {
      const id = String(t.id||'');
      if (!id) { issues.push({ level:'ERROR', code:'MISSING_TYPE_ID', message:'Terrain type is missing an id', terrainTypeId:null }); }
      else if (seenTypeIds.has(id)) { issues.push({ level:'ERROR', code:'DUPLICATE_TYPE_ID', message:`Duplicate terrain type id: "${id}"`, terrainTypeId:id }); }
      seenTypeIds.add(id);
    });

    // Per-type rule coverage
    typeIds.forEach((tid) => {
      const rulesForType = (set.rules||[]).filter((r) => String(r.terrainTypeId||'') === tid);
      const enabledRules = rulesForType.filter((r) => r.enabled !== false);
      if (rulesForType.length === 0) {
        issues.push({ level:'WARNING', code:'NO_RULES_FOR_TYPE', message:`Terrain type "${tid}" has no rules — cells will always use fallback tile`, terrainTypeId:tid });
      } else if (enabledRules.length === 0) {
        issues.push({ level:'WARNING', code:'ALL_RULES_DISABLED', message:`Terrain type "${tid}" has rules but all are disabled — cells will use fallback tile`, terrainTypeId:tid });
      } else {
        const hasWildcard = enabledRules.some((r) =>
          NEIGHBOR_KEYS.every((k) => { const v = r.neighbors&&r.neighbors[k]; return v==null||v==='*'; }));
        if (!hasWildcard) {
          issues.push({ level:'INFO', code:'NO_WILDCARD_RULE', message:`Terrain type "${tid}" has no wildcard rule — isolated cells may not resolve`, terrainTypeId:tid });
        }
      }
    });

    // Per-rule issues
    const seenRuleIds = new Set();
    const neighborSigs = new Map(); // sig -> ruleId (detect exact duplicates)
    (set.rules||[]).forEach((rule) => {
      const id = String(rule.id||'');
      const tid = String(rule.terrainTypeId||'');

      if (!id) {
        issues.push({ level:'ERROR', code:'MISSING_RULE_ID', message:'Rule is missing an id', ruleId:null, terrainTypeId:tid });
      } else if (seenRuleIds.has(id)) {
        issues.push({ level:'ERROR', code:'DUPLICATE_RULE_ID', message:`Duplicate rule id: "${id}"`, ruleId:id, terrainTypeId:tid });
      }
      seenRuleIds.add(id);

      if (!tid || !typeIds.has(tid)) {
        issues.push({ level:'ERROR', code:'INVALID_TERRAIN_TYPE', message:`Rule "${id}" references unknown terrain type "${tid}"`, ruleId:id, terrainTypeId:tid });
      }
      // Check raw (pre-normalization) tileIndex to catch genuine authoring errors
      const rawRule = rawRules[set.rules.indexOf(rule)] || {};
      const rawTileIndex = rawRule.tileIndex != null ? rawRule.tileIndex : rule.tileIndex;
      if (rawTileIndex == null || !Number.isFinite(Number(rawTileIndex)) || Number(rawTileIndex) < 0) {
        issues.push({ level:'ERROR', code:'INVALID_TILE_INDEX', message:`Rule "${id}" has invalid tileIndex: ${rawTileIndex}`, ruleId:id, terrainTypeId:tid });
      }
      // Duplicate neighbor signature (same tid + same neighbor pattern)
      if (rule.enabled !== false) {
        const normN = normalizeNeighbors(rule.neighbors);
        const sigKey = `${tid}:${NEIGHBOR_KEYS.map((k)=>normN[k]||'*').join(',')}`;
        if (neighborSigs.has(sigKey)) {
          issues.push({ level:'WARNING', code:'DUPLICATE_RULE_SIGNATURE', message:`Rule "${id}" has identical neighbors to rule "${neighborSigs.get(sigKey)}" — one is unreachable`, ruleId:id, terrainTypeId:tid });
        } else {
          neighborSigs.set(sigKey, id);
        }
      }
    });

    return issues;
  }

  // ── compat wrapper ────────────────────────────────────────────────────────
  function resolveTerrainTile(terrainSet, options = {}) {
    const result = resolveTerrainRuleTile(
      terrainSet, buildTerrainNeighborSignature(options.neighborhood || {}), options);
    return {
      terrainTypeId:result.terrainTypeId, tileIndex:result.tileIndex, transform:result.transform,
      ruleId:result.matchedRuleId, matchedRuleId:result.matchedRuleId,
      neighborSignature:result.neighborSignature, fallbackUsed:result.fallbackUsed,
      fallbackReason:result.fallbackReason, score:result.score,
      candidateCount:result.candidateCount, candidates:result.candidates,
      top5Candidates:result.top5Candidates||[], isExact:!result.fallbackUsed,
      bestMatch:result.matchedRule||null,
      desired:{ center:result.terrainTypeId, terrainTypeId:result.terrainTypeId, neighbors:result.neighborSignature },
      matchedEdges:CARDINAL_KEYS.reduce((o,k)=>{o[k]=result.fallbackUsed?0:1;return o;},{}),
      matchedCorners:DIAGONAL_KEYS.reduce((o,k)=>{o[k]=result.fallbackUsed?0:1;return o;},{}),
      eligibleCandidates:result.candidates, candidatesChecked:result.candidateCount,
    };
  }

  // ── public API ────────────────────────────────────────────────────────────
  return {
    NEIGHBOR_KEYS, CARDINAL_KEYS, DIAGONAL_KEYS,
    normalizeTerrainRef, normalizeNeighborValue, normalizeNeighbors,
    normalizeTransformSpec, normalizeTerrainType, normalizeTerrainRule, normalizeTerrainSetV35,
    applyTransformToRule, getRuleTransforms,
    getTransformPenalty(t) { const n=normalizeTransformSpec(t); return (n.flipX||n.flipY||n.rotation!==0)?1:0; },
    buildTerrainNeighborSignature,
    scoreTerrainRule, matchTerrainRule,
    sortCandidatesDeterministic, pickBestTerrainRuleDeterministic,
    resolveTerrainRuleTile, resolveTerrainTile,
    ensureLayerCell, rebuildTerrainCell, rebuildTerrainNeighborhood, rebuildTerrainLayer,
    debugCell, validateTerrainSetConflicts,
    // compat shims
    resolveTerrainTileCandidates(terrainSet, options) {
      const r = resolveTerrainTile(terrainSet, options||{});
      return { desired:r.desired, candidates:r.candidates, eligibleCandidates:r.eligibleCandidates,
               bestMatch:r.bestMatch, candidatesChecked:r.candidateCount };
    },
    buildDesiredLabels(_ts, neighborhood) {
      const sig = buildTerrainNeighborSignature(neighborhood||{});
      return { setType:'rules', center:sig.terrainTypeId, terrainTypeId:sig.terrainTypeId, neighbors:sig };
    },
    clampTerrainLabel:normalizeTerrainRef,
    normalizeNeighborhood:normalizeNeighbors,
    normalizeTerrainSetType() { return 'rules'; },
    applyTransformToMeta:applyTransformToRule,
    getCandidateTransforms:getRuleTransforms,
    scoreTileCandidate:scoreTerrainRule,
    normalizeTileLabelMetadata:normalizeTerrainRule,
    computeCandidateWeight(_ts, _desired, rule) {
      const weight = Math.max(0,Number(rule&&rule.weight==null?1:rule&&rule.weight)||0);
      return { tileProbability:weight, terrainProbability:1, centerTerrainProbability:1,
               weight, disabled:weight<=0||rule.enabled===false };
    },
    getTerrainProbability() { return 1; },
  };
});


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
