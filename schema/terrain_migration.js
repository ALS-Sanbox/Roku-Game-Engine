globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * terrain_migration.js  —  Patch v35.1
 *
 * Migrates legacy terrain-set data to the v35 rule model.
 *
 * Old model fields (authoritative pre-v35):
 *   terrainSet.type            ('corner' | 'edge' | 'mixed')
 *   terrainSet.terrains[]      (array with { id, name, color, probability, … })
 *   terrainSet.enableTransforms / preferUntransformed
 *   tileMetadata[n].terrainId  (numeric or string pointing at a terrain)
 *   tileMetadata[n].autotileMask
 *   tileMetadata[n].edgeLabels   { top, right, bottom, left }
 *   tileMetadata[n].cornerLabels { topLeft, topRight, bottomRight, bottomLeft }
 *   rule.terrainId             (pre-rename of terrainTypeId)
 *   rule.autotileMask          (bitmask fallback)
 *   rule.edgeLabels / cornerLabels
 *
 * New model (v35):
 *   terrainSet.terrainTypes[]  (id, name, color, iconTileIndex)
 *   terrainSet.rules[]         (id, terrainTypeId, tileIndex, neighbors{8}, weight,
 *                               allowRotate, allowFlipX, allowFlipY, enabled)
 *
 * Migration guarantees:
 *   - Run once per load via migrateEditorResourceState.
 *   - Idempotent: already-migrated data passes through unchanged.
 *   - Never discards terrainTypes[] or rules[] that already exist.
 *   - Old fields are preserved under _legacy_* keys so the raw project JSON
 *     is not silently mutated until the user saves (save strips them via
 *     normalizeTerrainSetV35 in resources.js).
 *   - Returns a log of every migration action taken.
 */
(function () {
  'use strict';

  // ─── constants ────────────────────────────────────────────────────────────

  const NEIGHBOR_KEYS = ['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  const CARDINAL_KEYS = ['top', 'right', 'bottom', 'left'];
  const DIAGONAL_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  const SPECIAL_NEIGHBOR_VALUES = new Set(['*', 'same', 'different']);

  // bitmask → neighbor key  (RPGMaker-style autotile convention)
  // Bit 0=top, 1=right, 2=bottom, 3=left (cardinal), 4=topLeft, 5=topRight, 6=bottomRight, 7=bottomLeft
  const AUTOTILE_BIT_MAP = [
    [0, 'top'], [1, 'right'], [2, 'bottom'], [3, 'left'],
    [4, 'topLeft'], [5, 'topRight'], [6, 'bottomRight'], [7, 'bottomLeft'],
  ];

  // ─── helpers ──────────────────────────────────────────────────────────────

  // deepClone → RGE_ROOT.RGEUtils.deepClone (shared, see core/utils.js)
  const deepClone = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
    ? RGE_ROOT.RGEUtils.deepClone
    : (v) => JSON.parse(JSON.stringify(v));

  function makeId(prefix, seed) {
    const clean = String(seed == null ? '' : seed).trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
    return `${prefix}_${clean || Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeNeighborLiteral(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!s) return null;
    if (SPECIAL_NEIGHBOR_VALUES.has(s)) return s;
    return s;          // terrain-type-id reference — kept as-is
  }

  function defaultNeighbors() {
    return NEIGHBOR_KEYS.reduce((o, k) => { o[k] = '*'; return o; }, {});
  }

  /** Convert an 8-bit autotile mask to neighbor requirements.
   *  Bit set = "same" terrain on that side; bit clear = "different". */
  function autotileMaskToNeighbors(mask) {
    const n = defaultNeighbors();
    const m = Number(mask);
    if (!Number.isFinite(m)) return n;
    AUTOTILE_BIT_MAP.forEach(([bit, key]) => {
      n[key] = (m & (1 << bit)) ? 'same' : 'different';
    });
    return n;
  }

  /** Convert edgeLabels { top, right, bottom, left } to neighbor requirements.
   *  Accepted label values: 'same' | 'different' | '*' | null | terrain-type-id. */
  function edgeLabelsToNeighbors(edgeLabels, cornerLabels) {
    const n = defaultNeighbors();
    const el = edgeLabels && typeof edgeLabels === 'object' ? edgeLabels : {};
    const cl = cornerLabels && typeof cornerLabels === 'object' ? cornerLabels : {};
    CARDINAL_KEYS.forEach((k) => {
      const v = normalizeNeighborLiteral(el[k]);
      if (v !== null) n[k] = v;
    });
    DIAGONAL_KEYS.forEach((k) => {
      const v = normalizeNeighborLiteral(cl[k]);
      if (v !== null) n[k] = v;
    });
    return n;
  }

  /** True when a neighbor object has been explicitly authored (any non-'*' value). */
  function hasExplicitNeighbors(neighbors) {
    if (!neighbors || typeof neighbors !== 'object') return false;
    return NEIGHBOR_KEYS.some((k) => neighbors[k] != null && neighbors[k] !== '*');
  }

  /** Determine the neighbors for a rule coming from old data sources.
   *  Priority: edgeLabels+cornerLabels > autotileMask > existing neighbors > default '*'. */
  function resolveRuleLegacyNeighbors(source) {
    const hasEdge = source.edgeLabels && typeof source.edgeLabels === 'object'
      && CARDINAL_KEYS.some((k) => source.edgeLabels[k] != null);
    const hasCorner = source.cornerLabels && typeof source.cornerLabels === 'object'
      && DIAGONAL_KEYS.some((k) => source.cornerLabels[k] != null);

    if (hasEdge || hasCorner) {
      return { source: 'labels', neighbors: edgeLabelsToNeighbors(source.edgeLabels, source.cornerLabels) };
    }
    if (source.autotileMask != null && Number.isFinite(Number(source.autotileMask))) {
      return { source: 'autotileMask', neighbors: autotileMaskToNeighbors(source.autotileMask) };
    }
    if (source.neighbors && hasExplicitNeighbors(source.neighbors)) {
      return { source: 'existing', neighbors: null };   // already good — keep as-is
    }
    return { source: 'default', neighbors: defaultNeighbors() };
  }

  // ─── terrain-set level migration ──────────────────────────────────────────

  /**
   * Migrate old terrainSet.terrains[] → terrainSet.terrainTypes[].
   * If terrainTypes[] already exists and is non-empty, terrains[] is only
   * used to backfill any types that are referenced by rules but missing.
   */
  function migrateTerrainTypesFromLegacy(terrainSet, log) {
    const hasTypes = Array.isArray(terrainSet.terrainTypes) && terrainSet.terrainTypes.length > 0;
    const hasOldTerrains = Array.isArray(terrainSet.terrains) && terrainSet.terrains.length > 0;

    if (hasTypes || !hasOldTerrains) return;  // nothing to do

    log.push(`[terrain_migration] terrainSet "${terrainSet.id}": migrating ${terrainSet.terrains.length} legacy terrains[] → terrainTypes[]`);

    terrainSet.terrainTypes = terrainSet.terrains.map((t, i) => {
      if (!t || typeof t !== 'object') return null;
      return {
        id: String(t.id || makeId('terrain', `${terrainSet.id}_${i}`)),
        name: String(t.name || 'Terrain'),
        color: String(t.color || '#7a6ff0'),
        iconTileIndex: (t.iconTileIndex != null && t.iconTileIndex !== '') ? Math.max(0, Math.floor(Number(t.iconTileIndex) || 0)) : null,
        _legacy_probability: t.probability,    // preserved for reference
      };
    }).filter(Boolean);
  }

  /**
   * Migrate per-rule legacy fields.
   * Rules that already have terrainTypeId and no old fields pass through untouched.
   */
  function migrateRule(rule, terrainSet, tileIndex, log) {
    if (!rule || typeof rule !== 'object') return null;
    const r = deepClone(rule);

    // ── terrainId → terrainTypeId ──────────────────────────────────
    if (!r.terrainTypeId && r.terrainId != null && r.terrainId !== '') {
      r._legacy_terrainId = r.terrainId;
      r.terrainTypeId = String(r.terrainId);
      log.push(`[terrain_migration] rule "${r.id}": terrainId → terrainTypeId "${r.terrainTypeId}"`);
    }

    // ── neighbors from legacy sources ─────────────────────────────
    const legacyNeighbors = resolveRuleLegacyNeighbors(r);
    if (legacyNeighbors.source !== 'existing' && legacyNeighbors.neighbors) {
      if (legacyNeighbors.source !== 'default' || !hasExplicitNeighbors(r.neighbors)) {
        r._legacy_neighborSource = legacyNeighbors.source;
        if (r.edgeLabels) r._legacy_edgeLabels = r.edgeLabels;
        if (r.cornerLabels) r._legacy_cornerLabels = r.cornerLabels;
        if (r.autotileMask != null) r._legacy_autotileMask = r.autotileMask;
        r.neighbors = legacyNeighbors.neighbors;
        log.push(`[terrain_migration] rule "${r.id}": neighbors built from ${legacyNeighbors.source}`);
      }
    }

    // ── tileIndex — if rule has no tileIndex but was inferred from tileMetadata ──
    if (tileIndex != null && (r.tileIndex == null || !Number.isFinite(Number(r.tileIndex)))) {
      r.tileIndex = Math.max(0, Math.floor(Number(tileIndex) || 0));
    }

    // ── defaults for new boolean flags ─────────────────────────────
    if (r.allowRotate == null) r.allowRotate = false;
    if (r.allowFlipX == null)  r.allowFlipX = false;
    if (r.allowFlipY == null)  r.allowFlipY = false;
    if (r.enabled == null)     r.enabled = true;
    if (r.weight == null)      r.weight = 1;

    return r;
  }

  /**
   * Synthesise rules from old per-tile tileMetadata entries.
   * Only called when the terrainSet has zero rules and tileMetadata is present.
   */
  function synthesiseRulesFromTileMetadata(terrainSet, tileMetadata, log) {
    if (!tileMetadata || typeof tileMetadata !== 'object') return;
    if (Array.isArray(terrainSet.rules) && terrainSet.rules.length > 0) return;

    terrainSet.rules = [];
    const entries = Object.entries(tileMetadata);
    let synthesised = 0;

    entries.forEach(([tileKey, meta]) => {
      if (!meta || typeof meta !== 'object') return;

      // Resolve terrainTypeId
      let terrainTypeId = null;
      if (meta.terrainTypeId != null && meta.terrainTypeId !== '') {
        terrainTypeId = String(meta.terrainTypeId);
      } else if (meta.terrainId != null && meta.terrainId !== '') {
        terrainTypeId = String(meta.terrainId);
      }
      if (!terrainTypeId) return;

      const tileIndex = Math.max(0, Math.floor(Number(tileKey) || 0));
      const legacyNeighbors = resolveRuleLegacyNeighbors(meta);
      const neighbors = legacyNeighbors.neighbors || defaultNeighbors();

      const rule = {
        id: makeId('rule', `${terrainSet.id}_tile${tileIndex}`),
        terrainTypeId,
        tileIndex,
        neighbors,
        weight: (meta.probability != null && Number.isFinite(Number(meta.probability))) ? Math.max(0, Number(meta.probability)) : 1,
        allowRotate: meta.allowRotate === true || meta.allowRotate90 === true,
        allowFlipX:  meta.allowFlipX === true,
        allowFlipY:  meta.allowFlipY === true,
        enabled:     meta.enabled !== false,
        _legacy_synthesised: true,
        _legacy_neighborSource: legacyNeighbors.source,
      };

      terrainSet.rules.push(rule);
      synthesised += 1;
    });

    if (synthesised > 0) {
      log.push(`[terrain_migration] terrainSet "${terrainSet.id}": synthesised ${synthesised} rules from tileMetadata`);
    }
  }

  /**
   * Full migration of one terrain set.
   * tileMetadata is optional — pass it if available so rules can be synthesised.
   */
  function migrateTerrainSet(terrainSet, tileMetadata, log) {
    if (!terrainSet || typeof terrainSet !== 'object') return terrainSet;
    const ts = deepClone(terrainSet);
    if (!ts.id) ts.id = makeId('terrainset', Math.random().toString(36).slice(2, 9));

    // 1. Migrate terrain types from old terrains[] if needed
    migrateTerrainTypesFromLegacy(ts, log);

    // 2. If rules[] is empty, try synthesising from tileMetadata
    const hasRules = Array.isArray(ts.rules) && ts.rules.length > 0;
    if (!hasRules) {
      synthesiseRulesFromTileMetadata(ts, tileMetadata, log);
    }

    // 3. Migrate existing rules (fix terrainId refs, build neighbors from labels)
    if (Array.isArray(ts.rules)) {
      ts.rules = ts.rules.map((rule) => migrateRule(rule, ts, null, log)).filter(Boolean);
    } else {
      ts.rules = [];
    }

    // 4. Ensure terrainTypes is an array
    if (!Array.isArray(ts.terrainTypes)) ts.terrainTypes = [];

    // 5. Mark the set as migrated (idempotence guard)
    ts._migratedV35 = true;

    return ts;
  }

  /**
   * Migrate a full tileset resource object.
   * Returns { tileset, log }.
   */
  function migrateTilesetResource(tileset, log) {
    if (!tileset || typeof tileset !== 'object') return { tileset, log };
    const ts = deepClone(tileset);
    const tileMetadata = ts.tileMetadata && typeof ts.tileMetadata === 'object' ? ts.tileMetadata : {};

    if (Array.isArray(ts.terrainSets)) {
      ts.terrainSets = ts.terrainSets.map((set) => {
        if (set && set._migratedV35) return set;   // idempotent
        return migrateTerrainSet(set, tileMetadata, log);
      });
    }
    return { tileset: ts, log };
  }

  /**
   * Migrate a full editorState object (top-level entry point).
   * Returns { editorState, log }.
   */
  function migrateEditorResourceState(editorState) {
    const log = [];
    const source = editorState && typeof editorState === 'object' ? deepClone(editorState) : {};

    if (Array.isArray(source.tilesets)) {
      source.tilesets = source.tilesets.map((tileset) => {
        const result = migrateTilesetResource(tileset, log);
        return result.tileset;
      });
    }

    return { editorState: source, log };
  }

  // ─── validation (surfaced as warnings) ───────────────────────────────────

  /**
   * Validate a terrain set and return an array of warning strings.
   * Mirrors resources.js validateTerrainSet but returns plain strings
   * suitable for console output.
   */
  function warnTerrainSet(terrainSet, path, tileCount) {
    const warnings = [];
    if (!terrainSet || typeof terrainSet !== 'object') {
      warnings.push(`${path}: not an object`);
      return warnings;
    }

    // Unique ids — terrain types
    const typeIds = new Set();
    (Array.isArray(terrainSet.terrainTypes) ? terrainSet.terrainTypes : []).forEach((t, i) => {
      const id = t?.id == null ? '' : String(t.id);
      if (!id)             warnings.push(`${path}.terrainTypes[${i}].id is missing`);
      else if (typeIds.has(id)) warnings.push(`${path}.terrainTypes[${i}].id "${id}" is a duplicate`);
      typeIds.add(id);
    });

    // Unique ids — rules
    const ruleIds = new Set();
    (Array.isArray(terrainSet.rules) ? terrainSet.rules : []).forEach((rule, i) => {
      const id = rule?.id == null ? '' : String(rule.id);
      if (!id)              warnings.push(`${path}.rules[${i}].id is missing`);
      else if (ruleIds.has(id)) warnings.push(`${path}.rules[${i}].id "${id}" is a duplicate`);
      ruleIds.add(id);

      const rPath = `${path}.rules[${i}]`;
      if (!rule || typeof rule !== 'object') { warnings.push(`${rPath}: not an object`); return; }

      // terrainTypeId reference
      if (!rule.terrainTypeId) {
        warnings.push(`${rPath}.terrainTypeId is empty`);
      } else if (!typeIds.has(String(rule.terrainTypeId))) {
        warnings.push(`${rPath}.terrainTypeId "${rule.terrainTypeId}" does not match any terrain type`);
      }

      // tileIndex range
      const ti = Number(rule.tileIndex);
      if (!Number.isFinite(ti) || ti < 0) warnings.push(`${rPath}.tileIndex must be >= 0`);
      else if (tileCount > 0 && ti >= tileCount) warnings.push(`${rPath}.tileIndex ${ti} is outside the tile range (0–${tileCount - 1})`);

      // neighbor values
      const neighbors = rule.neighbors && typeof rule.neighbors === 'object' ? rule.neighbors : {};
      NEIGHBOR_KEYS.forEach((key) => {
        const v = neighbors[key];
        if (v == null) return;                     // null = wildcard, fine
        const s = String(v);
        if (!SPECIAL_NEIGHBOR_VALUES.has(s) && !typeIds.has(s)) {
          warnings.push(`${rPath}.neighbors.${key} "${s}" is not a special value or known terrain type id`);
        }
      });

      // booleans
      ['allowRotate', 'allowFlipX', 'allowFlipY', 'enabled'].forEach((key) => {
        if (rule[key] != null && typeof rule[key] !== 'boolean') {
          warnings.push(`${rPath}.${key} must be boolean, got ${typeof rule[key]}`);
        }
      });

      // weight
      if (rule.weight != null && (!Number.isFinite(Number(rule.weight)) || Number(rule.weight) < 0)) {
        warnings.push(`${rPath}.weight must be a finite number >= 0`);
      }
    });

    return warnings;
  }

  /**
   * Validate the full editor resource state and return all warnings.
   */
  function warnEditorResourceState(editorState) {
    const warnings = [];
    const tilesets = Array.isArray(editorState?.tilesets) ? editorState.tilesets : [];
    tilesets.forEach((tileset, ti) => {
      const sheetCols = Number(tileset?.columns || 0);
      const sheetRows = Number(tileset?.rows || 0);
      const tileCount = (sheetCols > 0 && sheetRows > 0) ? sheetCols * sheetRows : 0;
      const sets = Array.isArray(tileset?.terrainSets) ? tileset.terrainSets : [];
      sets.forEach((set, si) => {
        warnings.push(...warnTerrainSet(set, `tilesets[${ti}].terrainSets[${si}]`, tileCount));
      });
    });
    return warnings;
  }

  // ─── public API ───────────────────────────────────────────────────────────

  const api = {
    // Migration
    migrateTerrainSet,
    migrateTilesetResource,
    migrateEditorResourceState,
    // Helpers (exposed for testing)
    autotileMaskToNeighbors,
    edgeLabelsToNeighbors,
    resolveRuleLegacyNeighbors,
    // Validation warnings
    warnTerrainSet,
    warnEditorResourceState,
  };

  if (typeof window !== 'undefined') window.RokuTerrainMigration = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
