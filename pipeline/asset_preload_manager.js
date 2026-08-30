globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * asset_preload_manager.js — RGE v91
 *
 * Manages preload groups, lazy load queues, and asset cache state for the
 * editor.  The Roku runtime has its own counterpart in resource_manager.brs;
 * this module drives the *editor-side* representation so the editor can
 * accurately simulate what Roku will hold in memory.
 *
 * Design goals:
 *  - Preload groups map 1-to-1 with the manifest's preloadGroups section.
 *  - Lazy queue processes entries one tick at a time to avoid blocking UI.
 *  - Cache entries are evicted via LRU when a configurable memory budget
 *    is approached.
 *  - All state changes emit through RGEBus so panels stay in sync.
 */

(function () {
  'use strict';

  const DEFAULT_MEMORY_BUDGET_KB = 48 * 1024; // 48 MB — conservative Roku limit
  const LAZY_BATCH_SIZE = 4;                   // assets processed per idle tick

  // ── CacheEntry ─────────────────────────────────────────────────────────────

  class CacheEntry {
    constructor(guid, sizeKb) {
      this.guid = guid;
      this.sizeKb = sizeKb || 0;
      this.lastAccessAt = Date.now();
      this.loadedAt = Date.now();
      this.pinned = false;           // pinned entries are never evicted
      this.state = 'loaded';         // 'loading' | 'loaded' | 'error'
    }
    touch() { this.lastAccessAt = Date.now(); }
  }

  // ── PreloadGroup ───────────────────────────────────────────────────────────

  class PreloadGroup {
    constructor(id, label) {
      this.id = id;
      this.label = label || id;
      this.guids = new Set();
      this.priority = 0;
    }
    add(guid) { this.guids.add(guid); }
    remove(guid) { this.guids.delete(guid); }
    has(guid) { return this.guids.has(guid); }
    toJSON() {
      return { id: this.id, label: this.label, guids: Array.from(this.guids), priority: this.priority };
    }
  }

  // ── AssetPreloadManager ────────────────────────────────────────────────────

  class AssetPreloadManager {
    constructor() {
      /** @type {Map<string, PreloadGroup>} */
      this._groups = new Map();
      /** @type {Map<string, CacheEntry>} guid → CacheEntry */
      this._cache = new Map();
      /** @type {string[]} lazy queue */
      this._lazyQueue = [];
      this._lazyTimer = null;
      this._budgetKb = DEFAULT_MEMORY_BUDGET_KB;
      this._loadFn = null;   // injected: async (guid) => { sizeKb }
      this._unloadFn = null; // injected: (guid) => void
      this._statsListeners = [];
    }

    // ── Configuration ─────────────────────────────────────────────────────

    setMemoryBudgetKb(kb) { this._budgetKb = Math.max(1024, Number(kb) || DEFAULT_MEMORY_BUDGET_KB); }
    setLoadFunction(fn) { this._loadFn = fn; }
    setUnloadFunction(fn) { this._unloadFn = fn; }

    // ── Groups ────────────────────────────────────────────────────────────

    createGroup(id, label) {
      if (!this._groups.has(id)) {
        this._groups.set(id, new PreloadGroup(id, label));
        emit('preload:group_created', { id });
      }
      return this._groups.get(id);
    }

    getGroup(id) { return this._groups.get(id) || null; }

    addToGroup(groupId, guid) {
      const g = this._groups.get(groupId) || this.createGroup(groupId);
      g.add(guid);
      emit('preload:group_updated', { groupId, guid, action: 'add' });
    }

    removeFromGroup(groupId, guid) {
      const g = this._groups.get(groupId);
      if (g) { g.remove(guid); emit('preload:group_updated', { groupId, guid, action: 'remove' }); }
    }

    groupsForGuid(guid) {
      const result = [];
      for (const g of this._groups.values()) if (g.has(guid)) result.push(g);
      return result;
    }

    // ── Preloading ────────────────────────────────────────────────────────

    async preloadGroup(groupId) {
      const group = this._groups.get(groupId);
      if (!group) return;
      emit('preload:group_start', { groupId });
      const promises = [];
      for (const guid of group.guids) {
        if (!this._cache.has(guid)) promises.push(this._load(guid, true));
      }
      await Promise.allSettled(promises);
      emit('preload:group_done', { groupId });
    }

    // ── Lazy loading ──────────────────────────────────────────────────────

    enqueueLazy(guid) {
      if (this._cache.has(guid) || this._lazyQueue.includes(guid)) return;
      this._lazyQueue.push(guid);
      this._scheduleLazyTick();
    }

    _scheduleLazyTick() {
      if (this._lazyTimer !== null) return;
      this._lazyTimer = setTimeout(() => {
        this._lazyTimer = null;
        this._processLazyBatch();
      }, 0);
    }

    _processLazyBatch() {
      const batch = this._lazyQueue.splice(0, LAZY_BATCH_SIZE);
      batch.forEach(guid => this._load(guid, false).catch(() => {}));
      if (this._lazyQueue.length > 0) this._scheduleLazyTick();
    }

    // ── Cache operations ──────────────────────────────────────────────────

    async _load(guid, pinned = false) {
      if (this._cache.has(guid)) {
        const e = this._cache.get(guid);
        e.touch();
        if (pinned) e.pinned = true;
        return e;
      }
      const entry = new CacheEntry(guid, 0);
      entry.state = 'loading';
      entry.pinned = pinned;
      this._cache.set(guid, entry);
      emit('asset:load_start', { guid });

      try {
        if (typeof this._loadFn === 'function') {
          const result = await this._loadFn(guid);
          entry.sizeKb = (result && result.sizeKb) ? result.sizeKb : 0;
        }
        entry.state = 'loaded';
        entry.loadedAt = Date.now();
        this._evictIfNeeded();
        emit('asset:load_done', { guid, sizeKb: entry.sizeKb });
      } catch (err) {
        entry.state = 'error';
        emit('asset:load_error', { guid, error: String(err) });
      }
      this._emitStats();
      return entry;
    }

    unload(guid) {
      const entry = this._cache.get(guid);
      if (!entry || entry.pinned) return;
      if (typeof this._unloadFn === 'function') this._unloadFn(guid);
      this._cache.delete(guid);
      emit('asset:unloaded', { guid });
      this._emitStats();
    }

    getEntry(guid) {
      const e = this._cache.get(guid);
      if (e) e.touch();
      return e || null;
    }

    isLoaded(guid) {
      const e = this._cache.get(guid);
      return e ? e.state === 'loaded' : false;
    }

    // ── Eviction (LRU) ────────────────────────────────────────────────────

    _evictIfNeeded() {
      const used = this._totalCacheKb();
      if (used <= this._budgetKb) return;

      const evictable = Array.from(this._cache.values())
        .filter(e => !e.pinned && e.state === 'loaded')
        .sort((a, b) => a.lastAccessAt - b.lastAccessAt);

      let freed = 0;
      const target = used - this._budgetKb;
      for (const entry of evictable) {
        if (freed >= target) break;
        freed += entry.sizeKb;
        this.unload(entry.guid);
      }
      if (freed > 0) emit('preload:evicted', { freedKb: freed });
    }

    _totalCacheKb() {
      let total = 0;
      for (const e of this._cache.values()) total += e.sizeKb;
      return total;
    }

    // ── Stats ─────────────────────────────────────────────────────────────

    getStats() {
      return {
        totalEntries: this._cache.size,
        totalKb: this._totalCacheKb(),
        budgetKb: this._budgetKb,
        utilizationPct: Math.round((this._totalCacheKb() / this._budgetKb) * 100),
        lazyQueueDepth: this._lazyQueue.length,
        loadedCount: Array.from(this._cache.values()).filter(e => e.state === 'loaded').length,
        errorCount:  Array.from(this._cache.values()).filter(e => e.state === 'error').length,
      };
    }

    _emitStats() { emit('preload:stats', this.getStats()); }

    // ── Serialization ─────────────────────────────────────────────────────

    serializeGroups() {
      const groups = {};
      for (const [id, g] of this._groups) groups[id] = g.toJSON();
      return groups;
    }

    deserializeGroups(data) {
      if (!data) return;
      for (const [id, raw] of Object.entries(data)) {
        const g = this.createGroup(id, raw.label);
        g.priority = raw.priority || 0;
        (raw.guids || []).forEach(guid => g.add(guid));
      }
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEPreloadManager = new AssetPreloadManager();
  RGE_ROOT.RGEPreloadManager.AssetPreloadManager = AssetPreloadManager;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
