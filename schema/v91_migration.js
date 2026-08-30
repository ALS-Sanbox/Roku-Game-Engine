globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * v91_migration.js — RGE v91
 *
 * Safe migration handler for older project files.
 * Called during project open, before any v91 system reads the data.
 *
 * Rules:
 *  - Never destructively modifies existing scene/editor state.
 *  - Adds missing v91 keys with safe defaults.
 *  - Validates and repairs corrupted v91-specific data.
 *  - Emits 'migration:v91' event with a report of what was changed.
 */

(function () {
  'use strict';

  const V91_SCHEMA_VERSION = 91;

  /**
   * Migrate a raw project save blob to v91 format.
   * @param {object} projectData  - raw data from disk
   * @returns {{ data: object, changes: string[], warnings: string[] }}
   */
  function migrateToV91(projectData) {
    const data = projectData ? JSON.parse(JSON.stringify(projectData)) : {};
    const changes = [];
    const warnings = [];

    // ── Asset registry ───────────────────────────────────────────────────
    if (!data.v91) {
      data.v91 = {};
      changes.push('Added v91 system state container');
    }

    if (!data.v91.assetRegistry) {
      data.v91.assetRegistry = { version: 1, entries: [] };
      changes.push('Initialised empty asset registry');
    } else {
      if (!Array.isArray(data.v91.assetRegistry.entries)) {
        data.v91.assetRegistry.entries = [];
        warnings.push('asset registry entries was not an array — reset to empty');
      }
    }

    // ── Preload groups ────────────────────────────────────────────────────
    if (!data.v91.preloadGroups) {
      data.v91.preloadGroups = {
        boot: { id: 'boot', label: 'Boot', guids: [], priority: 100 }
      };
      changes.push('Initialised default preload groups');
    }

    // ── Atlas groups ──────────────────────────────────────────────────────
    if (!data.v91.atlasGroups) {
      data.v91.atlasGroups = {
        groups: {
          world: { id: 'world', label: 'World Sprites', sources: [], padding: 2 },
          ui:    { id: 'ui',    label: 'UI Assets',     sources: [], padding: 2 },
        }
      };
      changes.push('Initialised default atlas groups');
    }

    // ── Animation graphs ──────────────────────────────────────────────────
    if (!data.v91.animationGraphs) {
      data.v91.animationGraphs = [];
      changes.push('Initialised empty animation graph registry');
    } else if (!Array.isArray(data.v91.animationGraphs)) {
      data.v91.animationGraphs = [];
      warnings.push('animationGraphs was not an array — reset to empty');
    }

    // ── Deployment settings ───────────────────────────────────────────────
    if (!data.v91.deployment) {
      data.v91.deployment = { profile: 'debug', devices: [] };
      changes.push('Initialised deployment settings with default profile');
    }
    if (!Array.isArray(data.v91.deployment.devices)) {
      data.v91.deployment.devices = [];
      warnings.push('deployment.devices was not an array — reset to empty');
    }

    // ── Schema version stamp ──────────────────────────────────────────────
    const prev = data.v91.schemaVersion || 0;
    data.v91.schemaVersion = V91_SCHEMA_VERSION;
    if (prev > 0 && prev !== V91_SCHEMA_VERSION) {
      changes.push(`Schema version updated ${prev} → ${V91_SCHEMA_VERSION}`);
    }

    const report = { changes, warnings, schemaVersion: V91_SCHEMA_VERSION };
    emit('migration:v91', report);
    return { data, changes, warnings };
  }

  /**
   * Validate that a v91 data blob is structurally correct.
   * Returns { valid: bool, issues: string[] }.
   */
  function validateV91(v91Data) {
    const issues = [];
    if (!v91Data) { return { valid: false, issues: ['v91 block missing'] }; }
    if (!v91Data.assetRegistry) issues.push('assetRegistry missing');
    if (!Array.isArray(v91Data.animationGraphs)) issues.push('animationGraphs not an array');
    if (!v91Data.deployment) issues.push('deployment settings missing');
    return { valid: issues.length === 0, issues };
  }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  RGE_ROOT.RGEV91Migration = { migrateToV91, validateV91, V91_SCHEMA_VERSION };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
