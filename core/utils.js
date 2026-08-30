globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * core/utils.js — Shared utility functions
 *
 * Single source of truth for helpers previously duplicated across
 * schema/nodes.js, schema/resources.js, schema/terrain_migration.js,
 * nodes.js, and editor/scene_editor.js.
 */
(function () {
  'use strict';

  /**
   * Deep-clone any JSON-serialisable value.
   * @param {*} value
   * @returns {*}
   */
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Normalise a terrain reference value to a non-empty trimmed string or the
   * given fallback.  Handles null / undefined / false / 0 / '' / whitespace.
   *
   * This is the canonical implementation (superset of all five prior copies):
   *   - Numeric values ≤ 0 → fallback  (was missing from terrain_solver copy)
   *   - Positive numbers   → String     (scene_editor variant)
   *   - Non-empty strings  → trimmed    (all variants)
   *
   * @param {*}  value
   * @param {*}  [fallback=null]
   * @returns {string|null}
   */
  function normalizeTerrainRef(value, fallback = null) {
    if (value == null || value === '' || value === false) return fallback;
    const num = Number(value);
    if (Number.isFinite(num)) {
      if (num <= 0) return fallback;
      return String(num);
    }
    const text = String(value).trim();
    return text ? text : fallback;
  }

  const api = { deepClone, normalizeTerrainRef };

  if (typeof window !== 'undefined') RGE_ROOT.RGEUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
