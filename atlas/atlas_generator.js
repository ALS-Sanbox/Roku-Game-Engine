globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * atlas_generator.js — RGE v91 Texture Atlas Pipeline
 *
 * Shelf-packing algorithm for grouping sprites into Roku-friendly power-of-2
 * atlases.  Runs entirely in the editor (browser side); the output is a JSON
 * descriptor + a set of canvas-backed bitmap blits that can be exported as
 * PNG files alongside the Roku package.
 *
 * Design notes:
 *  - Targets Roku's 2048×2048 max texture limit.
 *  - Multiple atlas groups (UI, world, effects) with independent outputs.
 *  - Padding/extrusion prevents colour bleeding at runtime.
 *  - Rebuild detection: atlas is only regenerated when source content changes.
 *  - draw call analysis: provides estimated sprite-batch draw calls before/after.
 */

(function () {
  'use strict';

  const MAX_ATLAS_DIM = 2048;
  const DEFAULT_PADDING = 2;  // px between sprites

  // ── Shelf packer ───────────────────────────────────────────────────────────

  class ShelfPacker {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this._shelves = []; // { y, usedWidth, height }
    }

    /**
     * @param {number} w - sprite width + 2*padding
     * @param {number} h - sprite height + 2*padding
     * @returns {{ x, y } | null}
     */
    pack(w, h) {
      // Try to fit on an existing shelf
      for (const shelf of this._shelves) {
        if (shelf.usedWidth + w <= this.width && h <= shelf.height) {
          const result = { x: shelf.usedWidth, y: shelf.y };
          shelf.usedWidth += w;
          return result;
        }
      }
      // Open a new shelf
      const usedHeight = this._shelves.reduce((sum, s) => sum + s.height, 0);
      if (usedHeight + h > this.height) return null; // doesn't fit
      const shelf = { y: usedHeight, usedWidth: w, height: h };
      this._shelves.push(shelf);
      return { x: 0, y: shelf.y };
    }

    get usedArea() {
      return this._shelves.reduce((sum, s) => sum + s.usedWidth * s.height, 0);
    }
    get totalArea() { return this.width * this.height; }
    get efficiency() { return this.totalArea > 0 ? this.usedArea / this.totalArea : 0; }
  }

  // ── AtlasGroup ─────────────────────────────────────────────────────────────

  class AtlasGroup {
    constructor(id, label) {
      this.id = id;
      this.label = label || id;
      /** @type {Array<{guid:string, path:string, w:number, h:number}>} */
      this.sources = [];
      this.padding = DEFAULT_PADDING;
      this.maxWidth = MAX_ATLAS_DIM;
      this.maxHeight = MAX_ATLAS_DIM;
      this._contentHash = null;
    }

    addSource(guid, path, w, h) {
      if (this.sources.find(s => s.guid === guid)) return;
      this.sources.push({ guid, path, w: w || 0, h: h || 0 });
      this._contentHash = null; // invalidate
    }

    removeSource(guid) {
      this.sources = this.sources.filter(s => s.guid !== guid);
      this._contentHash = null;
    }

    _computeHash() {
      return this.sources.map(s => `${s.guid}:${s.w}x${s.h}`).sort().join('|');
    }

    isDirty(previousHash) {
      const h = this._computeHash();
      this._contentHash = h;
      return h !== previousHash;
    }
  }

  // ── AtlasGenerator ────────────────────────────────────────────────────────

  class AtlasGenerator {
    constructor() {
      /** @type {Map<string, AtlasGroup>} */
      this._groups = new Map();
      /** @type {Map<string, string>} groupId → last content hash */
      this._lastHashes = new Map();
      /** @type {Map<string, AtlasResult>} groupId → last result */
      this._results = new Map();
    }

    // ── Group management ──────────────────────────────────────────────────

    createGroup(id, label) {
      if (!this._groups.has(id)) this._groups.set(id, new AtlasGroup(id, label));
      return this._groups.get(id);
    }

    getGroup(id) { return this._groups.get(id) || null; }
    listGroups() { return Array.from(this._groups.values()); }

    // ── Build ─────────────────────────────────────────────────────────────

    /**
     * (Re)build atlas for a group.  Only rebuilds if content changed.
     * @param {string} groupId
     * @param {boolean} [force=false] - force rebuild even if hash unchanged
     * @returns {AtlasResult | null}
     */
    build(groupId, force = false) {
      const group = this._groups.get(groupId);
      if (!group) return null;

      const prevHash = this._lastHashes.get(groupId) || null;
      if (!force && !group.isDirty(prevHash)) {
        return this._results.get(groupId) || null;
      }
      this._lastHashes.set(groupId, group._contentHash);

      // Sort sources largest-first (improves packing efficiency)
      const sorted = [...group.sources].sort((a, b) => (b.w * b.h) - (a.w * a.h));
      const pad = group.padding;

      // Find smallest power-of-2 dimensions that fit
      const atlasW = nextPow2(Math.min(group.maxWidth, estimateWidth(sorted, pad)));
      const atlasH = nextPow2(Math.min(group.maxHeight, estimateHeight(sorted, pad)));

      const packer = new ShelfPacker(atlasW, atlasH);
      const placed = [];
      const overflow = [];

      for (const src of sorted) {
        const pw = src.w + pad * 2;
        const ph = src.h + pad * 2;
        const pos = packer.pack(pw, ph);
        if (pos) {
          placed.push({
            guid: src.guid,
            path: src.path,
            x: pos.x + pad,
            y: pos.y + pad,
            w: src.w,
            h: src.h,
          });
        } else {
          overflow.push(src.guid);
        }
      }

      const result = {
        groupId,
        atlasWidth: atlasW,
        atlasHeight: atlasH,
        placed,
        overflow,
        efficiency: Math.round(packer.efficiency * 100),
        packingReport: {
          totalSprites: sorted.length,
          packedCount: placed.length,
          overflowCount: overflow.length,
          efficiency: Math.round(packer.efficiency * 100),
        }
      };

      this._results.set(groupId, result);
      emit('atlas:built', { groupId, packedCount: placed.length, overflow: overflow.length });
      return result;
    }

    buildAll(force = false) {
      const results = {};
      for (const id of this._groups.keys()) {
        results[id] = this.build(id, force);
      }
      return results;
    }

    getResult(groupId) { return this._results.get(groupId) || null; }

    // ── Draw call analysis ─────────────────────────────────────────────────

    /**
     * Estimate draw call reduction from atlasing.
     * @param {number} uniqueTexturesBefore
     * @param {object} results  groupId → AtlasResult
     * @returns {{ before: number, after: number, reduction: number }}
     */
    analyzeDrawCalls(uniqueTexturesBefore, results) {
      const atlasCount = Object.keys(results).length;
      const packed = Object.values(results).reduce((sum, r) => r ? sum + r.placed.length : sum, 0);
      const overflow = Object.values(results).reduce((sum, r) => r ? sum + r.overflow.length : sum, 0);
      const after = atlasCount + overflow;
      const before = uniqueTexturesBefore;
      return {
        before,
        after,
        reduction: Math.max(0, before - after),
        reductionPct: before > 0 ? Math.round(((before - after) / before) * 100) : 0,
      };
    }

    // ── Serialization ─────────────────────────────────────────────────────

    serialize() {
      const groups = {};
      for (const [id, g] of this._groups) {
        groups[id] = { id: g.id, label: g.label, sources: g.sources, padding: g.padding };
      }
      return { groups };
    }

    deserialize(data) {
      if (!data || !data.groups) return;
      for (const [id, raw] of Object.entries(data.groups)) {
        const g = this.createGroup(id, raw.label);
        g.padding = raw.padding || DEFAULT_PADDING;
        (raw.sources || []).forEach(s => g.addSource(s.guid, s.path, s.w, s.h));
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  function estimateWidth(sources, pad) {
    const total = sources.reduce((s, src) => s + src.w + pad * 2, 0);
    return Math.ceil(Math.sqrt(total));
  }

  function estimateHeight(sources, pad) {
    const total = sources.reduce((s, src) => s + src.h + pad * 2, 0);
    return Math.ceil(Math.sqrt(total));
  }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEAtlasGenerator = new AtlasGenerator();
  RGE_ROOT.RGEAtlasGenerator.AtlasGenerator = AtlasGenerator;
  RGE_ROOT.RGEAtlasGenerator.ShelfPacker = ShelfPacker;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
