globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * asset_registry.js — RGE v91 Runtime Asset Pipeline
 *
 * Central registry for all project assets. Provides GUID assignment,
 * dependency tracking, validation, hot-reload signaling, and manifest
 * generation. This is the single source of truth for asset identity;
 * the resource_manager.brs on the Roku side is the authoritative runtime
 * consumer of the manifest this module emits.
 *
 * Architecture notes:
 *  - Assets are identified by a stable GUID that survives renames.
 *  - Dependency edges are stored as a directed adjacency list so that
 *    "what breaks if I delete this texture?" can be answered in O(deps).
 *  - The registry never holds binary data — only metadata + paths.
 *  - Hot-reload events are emitted through RGE_ROOT.RGEBus so any panel
 *    can listen without coupling to this module.
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const REGISTRY_VERSION = 1;
  const ASSET_KINDS = new Set([
    'texture', 'spritesheet', 'atlas', 'audio', 'font',
    'tilemap', 'animation_clip', 'effect_meta', 'ui_asset', 'scene'
  ]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function generateGuid() {
    // RFC-4122 v4 UUID using crypto.getRandomValues when available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function now() { return Date.now(); }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function') {
        RGE_ROOT.RGEBus.emit(event, data);
      }
    } catch (_) {}
  }

  // ── AssetRegistry ──────────────────────────────────────────────────────────

  class AssetRegistry {
    constructor() {
      /** @type {Map<string, AssetEntry>} guid → entry */
      this._byGuid = new Map();
      /** @type {Map<string, string>} normalizedPath → guid */
      this._byPath = new Map();
      /** @type {Map<string, Set<string>>} guid → Set of guids that depend on it */
      this._dependents = new Map();
      /** @type {Map<string, Set<string>>} guid → Set of guids it depends on */
      this._dependencies = new Map();
      this._version = REGISTRY_VERSION;
      this._dirty = false;
    }

    // ── Registration ──────────────────────────────────────────────────────

    /**
     * Register or update an asset entry.
     * @param {object} opts
     * @param {string} opts.path       - project-relative path (e.g. "assets/textures/hero.png")
     * @param {string} opts.kind       - one of ASSET_KINDS
     * @param {string} [opts.guid]     - provide to preserve identity across renames
     * @param {string} [opts.name]     - display name; defaults to basename
     * @param {object} [opts.meta]     - kind-specific metadata
     * @returns {AssetEntry}
     */
    register(opts) {
      const path = normalizePath(opts.path);
      if (!path) throw new Error('AssetRegistry.register: path is required');
      const kind = opts.kind;
      if (!ASSET_KINDS.has(kind)) throw new Error(`AssetRegistry: unknown kind "${kind}"`);

      // Reuse existing entry if path already known
      const existingGuid = this._byPath.get(path);
      if (existingGuid) {
        const entry = this._byGuid.get(existingGuid);
        if (entry) {
          entry.updatedAt = now();
          if (opts.meta) entry.meta = Object.assign({}, entry.meta, opts.meta);
          this._dirty = true;
          return entry;
        }
      }

      const guid = (opts.guid && !this._byGuid.has(opts.guid))
        ? opts.guid
        : generateGuid();

      const entry = {
        guid,
        path,
        kind,
        name: opts.name || basename(path),
        meta: opts.meta || {},
        version: 1,
        createdAt: now(),
        updatedAt: now(),
        missing: false,
      };

      this._byGuid.set(guid, entry);
      this._byPath.set(path, guid);
      this._dependents.set(guid, new Set());
      this._dependencies.set(guid, new Set());
      this._dirty = true;

      emit('asset:registered', { guid, path, kind });
      return entry;
    }

    /**
     * Remove an asset. Clears dependency edges and emits warning if dependents exist.
     */
    unregister(guid) {
      const entry = this._byGuid.get(guid);
      if (!entry) return false;

      const deps = this._dependents.get(guid);
      if (deps && deps.size > 0) {
        emit('asset:broken_references', { guid, dependents: Array.from(deps) });
      }

      // Remove from dependency reverse-index
      const myDeps = this._dependencies.get(guid) || new Set();
      for (const depGuid of myDeps) {
        const revSet = this._dependents.get(depGuid);
        if (revSet) revSet.delete(guid);
      }

      this._byPath.delete(entry.path);
      this._byGuid.delete(guid);
      this._dependents.delete(guid);
      this._dependencies.delete(guid);
      this._dirty = true;
      emit('asset:unregistered', { guid });
      return true;
    }

    // ── Lookup ────────────────────────────────────────────────────────────

    getByGuid(guid) { return this._byGuid.get(guid) || null; }
    getByPath(path) {
      const guid = this._byPath.get(normalizePath(path));
      return guid ? this._byGuid.get(guid) || null : null;
    }

    /** Return all entries of a given kind */
    getByKind(kind) {
      const result = [];
      for (const entry of this._byGuid.values()) {
        if (entry.kind === kind) result.push(entry);
      }
      return result;
    }

    get size() { return this._byGuid.size; }

    // ── Dependencies ──────────────────────────────────────────────────────

    /**
     * Declare that `consumerGuid` depends on `providerGuid`.
     * E.g. a spritesheet depends on its source texture.
     */
    addDependency(consumerGuid, providerGuid) {
      if (!this._byGuid.has(consumerGuid) || !this._byGuid.has(providerGuid)) return;
      this._dependencies.get(consumerGuid).add(providerGuid);
      this._dependents.get(providerGuid).add(consumerGuid);
    }

    getDependencies(guid) {
      return Array.from(this._dependencies.get(guid) || [])
        .map(g => this._byGuid.get(g)).filter(Boolean);
    }

    getDependents(guid) {
      return Array.from(this._dependents.get(guid) || [])
        .map(g => this._byGuid.get(g)).filter(Boolean);
    }

    // ── Validation ────────────────────────────────────────────────────────

    /**
     * Mark asset as missing (file not found on disk).
     * Returns a list of affected dependent entries.
     */
    markMissing(guid, missing = true) {
      const entry = this._byGuid.get(guid);
      if (!entry) return [];
      entry.missing = missing;
      entry.updatedAt = now();
      const affected = this.getDependents(guid);
      emit('asset:missing', { guid, missing, affected: affected.map(e => e.guid) });
      return affected;
    }

    /**
     * Validate all registered assets against the provided file-existence checker.
     * @param {function(string):boolean} existsFn - returns true if path exists on disk
     * @returns {{ missing: AssetEntry[], recovered: AssetEntry[] }}
     */
    validateAll(existsFn) {
      const missing = [];
      const recovered = [];
      for (const entry of this._byGuid.values()) {
        const exists = existsFn(entry.path);
        if (!exists && !entry.missing) {
          this.markMissing(entry.guid, true);
          missing.push(entry);
        } else if (exists && entry.missing) {
          this.markMissing(entry.guid, false);
          recovered.push(entry);
        }
      }
      return { missing, recovered };
    }

    // ── Versioning / hot-reload ───────────────────────────────────────────

    /**
     * Bump version counter for an asset (e.g. file changed on disk).
     * Consumers subscribed via RGEBus will receive 'asset:hot_reload'.
     */
    touch(guid) {
      const entry = this._byGuid.get(guid);
      if (!entry) return;
      entry.version++;
      entry.updatedAt = now();
      this._dirty = true;
      emit('asset:hot_reload', { guid, path: entry.path, version: entry.version });
    }

    touchByPath(path) {
      const guid = this._byPath.get(normalizePath(path));
      if (guid) this.touch(guid);
    }

    // ── Duplicate / unused detection ──────────────────────────────────────

    /**
     * Returns groups of entries that share identical paths (should not happen)
     * or identical content hashes if `hashFn` is provided.
     */
    findDuplicates(hashFn = null) {
      const groups = new Map();
      for (const entry of this._byGuid.values()) {
        const key = hashFn ? (hashFn(entry) || entry.path) : entry.path;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      }
      const result = [];
      for (const group of groups.values()) {
        if (group.length > 1) result.push(group);
      }
      return result;
    }

    /**
     * Find assets not referenced by any other asset (candidate orphans).
     * Caller should cross-reference with scene data before deleting.
     */
    findUnused() {
      const result = [];
      for (const [guid, deps] of this._dependents) {
        if (deps.size === 0) {
          const entry = this._byGuid.get(guid);
          if (entry) result.push(entry);
        }
      }
      return result;
    }

    // ── Manifest generation ───────────────────────────────────────────────

    /**
     * Produce asset_manifest.json content for Roku deployment.
     * The Roku resource_manager.brs reads this at runtime.
     */
    buildManifest() {
      const manifest = {
        formatVersion: REGISTRY_VERSION,
        generatedAt: new Date().toISOString(),
        assets: {},
        byKind: {},
      };

      for (const entry of this._byGuid.values()) {
        manifest.assets[entry.guid] = {
          guid: entry.guid,
          path: entry.path,
          kind: entry.kind,
          name: entry.name,
          version: entry.version,
          meta: entry.meta,
        };
        if (!manifest.byKind[entry.kind]) manifest.byKind[entry.kind] = [];
        manifest.byKind[entry.kind].push(entry.guid);
      }

      return manifest;
    }

    // ── Serialization ─────────────────────────────────────────────────────

    serialize() {
      const entries = [];
      for (const entry of this._byGuid.values()) {
        entries.push({
          ...entry,
          _deps: Array.from(this._dependencies.get(entry.guid) || []),
        });
      }
      return { version: REGISTRY_VERSION, entries };
    }

    /** Restore from serialized data. Non-destructive — merges into existing. */
    deserialize(data) {
      if (!data || data.version !== REGISTRY_VERSION) return;
      const pendingDeps = [];
      for (const raw of (data.entries || [])) {
        if (!raw.guid || !raw.path) continue;
        const existing = this._byGuid.get(raw.guid);
        if (existing) {
          Object.assign(existing, raw);
          delete existing._deps;
        } else {
          const entry = { ...raw };
          const deps = entry._deps || [];
          delete entry._deps;
          this._byGuid.set(entry.guid, entry);
          this._byPath.set(entry.path, entry.guid);
          this._dependents.set(entry.guid, new Set());
          this._dependencies.set(entry.guid, new Set());
          pendingDeps.push({ guid: entry.guid, deps });
        }
      }
      for (const { guid, deps } of pendingDeps) {
        for (const depGuid of deps) this.addDependency(guid, depGuid);
      }
      this._dirty = false;
    }

    get dirty() { return this._dirty; }
    clearDirty() { this._dirty = false; }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  function normalizePath(p) {
    return String(p || '').replace(/\\/g, '/').toLowerCase().trim();
  }

  function basename(p) {
    const parts = String(p || '').replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || p;
  }

  // ── Singleton export ───────────────────────────────────────────────────────

  const registry = new AssetRegistry();

  RGE_ROOT.RGEAssetRegistry = registry;
  RGE_ROOT.RGEAssetRegistry.AssetRegistry = AssetRegistry; // allow tests to create fresh instances
  RGE_ROOT.RGEAssetRegistry.ASSET_KINDS = ASSET_KINDS;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
