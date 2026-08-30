globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * memory_budget.js — RGE v91 Memory Budgeting Tools
 *
 * Estimates and tracks editor-side memory usage for Roku deployment.
 * Because Roku devices have strict RAM limits (256–512 MB shared between
 * OS, video plane, and app), this module provides warnings before packaging.
 *
 * Categories tracked:
 *  - Textures  (RGBA 4 bytes/pixel, power-of-2 padded)
 *  - Audio     (WAV/MP3 decoded size estimate)
 *  - Scene     (node count × avg overhead)
 *  - Atlas     (packed atlas bitmaps)
 *
 * Emits 'memory:warning' events through RGEBus when budgets are exceeded.
 */

(function () {
  'use strict';

  // Roku platform limits (conservative)
  const LIMITS = {
    totalKb:         180 * 1024,  // 180 MB usable app RAM
    textureKb:        80 * 1024,  // 80 MB VRAM budget
    audioKb:          20 * 1024,  // 20 MB decoded audio
    sceneKb:           8 * 1024,  // 8 MB scene/node overhead
    atlasKb:          32 * 1024,  // 32 MB for atlases
    maxTextureSize:    2048,       // pixels per side
    maxActiveAudio:    8,          // simultaneous decoded clips
    maxAtlasCount:     8,          // atlas bitmaps in VRAM at once
  };

  // ── Size estimators ────────────────────────────────────────────────────────

  /**
   * RGBA bitmap size. Roku stores textures as 32-bit RGBA.
   * @param {number} w
   * @param {number} h
   * @returns {number} bytes
   */
  function estimateTextureBytes(w, h) {
    return w * h * 4;
  }

  /**
   * Estimate decoded audio size.
   * @param {'wav'|'mp3'|'ogg'} format
   * @param {number} durationSec
   * @param {number} [channels=2]
   * @param {number} [sampleRate=44100]
   */
  function estimateAudioBytes(format, durationSec, channels = 2, sampleRate = 44100) {
    // Decode to PCM 16-bit regardless of source
    return Math.ceil(durationSec * sampleRate * channels * 2);
  }

  /**
   * Node overhead: each entity in the scene contributes ~2 KB of runtime
   * object + component tables.  Tilemap cells add separately.
   */
  function estimateSceneBytes(nodeCount, tilemapCellCount = 0) {
    return nodeCount * 2048 + tilemapCellCount * 64;
  }

  // ── MemoryEntry ────────────────────────────────────────────────────────────

  class MemoryEntry {
    constructor(category, id, label, bytes) {
      this.category = category;
      this.id = id;
      this.label = label;
      this.bytes = bytes;
      this.warnings = [];
    }

    get kb() { return this.bytes / 1024; }
    get mb() { return this.bytes / (1024 * 1024); }
  }

  // ── MemoryBudget ───────────────────────────────────────────────────────────

  class MemoryBudget {
    constructor(limits = {}) {
      this._limits = Object.assign({}, LIMITS, limits);
      /** @type {MemoryEntry[]} */
      this._entries = [];
      this._listeners = [];
    }

    setLimit(key, value) { this._limits[key] = value; }
    getLimits() { return Object.assign({}, this._limits); }

    // ── Entry management ──────────────────────────────────────────────────

    clear() { this._entries = []; }

    addTexture(id, label, widthPx, heightPx) {
      const bytes = estimateTextureBytes(widthPx, heightPx);
      const entry = new MemoryEntry('texture', id, label, bytes);
      if (widthPx > this._limits.maxTextureSize || heightPx > this._limits.maxTextureSize) {
        entry.warnings.push(`Texture exceeds Roku max size ${this._limits.maxTextureSize}px`);
      }
      this._entries.push(entry);
      return entry;
    }

    addAtlas(id, label, widthPx, heightPx) {
      const bytes = estimateTextureBytes(widthPx, heightPx);
      const entry = new MemoryEntry('atlas', id, label, bytes);
      this._entries.push(entry);
      return entry;
    }

    addAudio(id, label, format, durationSec, channels = 2) {
      const bytes = estimateAudioBytes(format, durationSec, channels);
      const entry = new MemoryEntry('audio', id, label, bytes);
      this._entries.push(entry);
      return entry;
    }

    addScene(id, label, nodeCount, tilemapCells = 0) {
      const bytes = estimateSceneBytes(nodeCount, tilemapCells);
      const entry = new MemoryEntry('scene', id, label, bytes);
      this._entries.push(entry);
      return entry;
    }

    // ── Analysis ──────────────────────────────────────────────────────────

    /**
     * Run full analysis and return a report with warnings.
     */
    analyze() {
      const byCategory = {};
      for (const e of this._entries) {
        if (!byCategory[e.category]) byCategory[e.category] = [];
        byCategory[e.category].push(e);
      }

      const textureKb = sumKb(byCategory.texture || []);
      const atlasKb   = sumKb(byCategory.atlas || []);
      const audioKb   = sumKb(byCategory.audio || []);
      const sceneKb   = sumKb(byCategory.scene || []);
      const totalKb   = textureKb + atlasKb + audioKb + sceneKb;

      const warnings = [];
      const errors   = [];

      check(warnings, errors, textureKb, this._limits.textureKb, 'Texture VRAM');
      check(warnings, errors, atlasKb,   this._limits.atlasKb,   'Atlas VRAM');
      check(warnings, errors, audioKb,   this._limits.audioKb,   'Audio RAM');
      check(warnings, errors, sceneKb,   this._limits.sceneKb,   'Scene RAM');
      check(warnings, errors, totalKb,   this._limits.totalKb,   'Total app RAM');

      const audioEntries = byCategory.audio || [];
      if (audioEntries.length > this._limits.maxActiveAudio) {
        warnings.push(`${audioEntries.length} audio clips registered; Roku recommends ≤${this._limits.maxActiveAudio} active`);
      }

      const atlasEntries = byCategory.atlas || [];
      if (atlasEntries.length > this._limits.maxAtlasCount) {
        warnings.push(`${atlasEntries.length} atlases; Roku recommends ≤${this._limits.maxAtlasCount} in VRAM simultaneously`);
      }

      // Per-entry warnings
      const entryWarnings = [];
      for (const e of this._entries) {
        if (e.warnings.length > 0) entryWarnings.push({ id: e.id, label: e.label, warnings: e.warnings });
      }

      const report = {
        totalKb,
        textureKb,
        atlasKb,
        audioKb,
        sceneKb,
        budgetKb: this._limits.totalKb,
        utilizationPct: Math.round((totalKb / this._limits.totalKb) * 100),
        warnings,
        errors,
        entryWarnings,
        entries: this._entries.map(e => ({
          id: e.id, label: e.label, category: e.category,
          kb: Math.round(e.kb), mb: e.mb.toFixed(2)
        })),
        byCategory: Object.fromEntries(
          Object.entries(byCategory).map(([k, v]) => [k, { count: v.length, kb: Math.round(sumKb(v)) }])
        ),
      };

      if (warnings.length > 0 || errors.length > 0) {
        emit('memory:warning', report);
      }

      return report;
    }

    // ── Spike detection ───────────────────────────────────────────────────

    /**
     * Returns the top-N largest assets by category.
     */
    topByCategory(category, n = 5) {
      return this._entries
        .filter(e => e.category === category)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, n);
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function sumKb(entries) {
    return entries.reduce((s, e) => s + e.kb, 0);
  }

  function check(warnings, errors, actualKb, limitKb, label) {
    const pct = limitKb > 0 ? (actualKb / limitKb) * 100 : 0;
    if (pct >= 100) {
      errors.push(`${label}: ${Math.round(actualKb)} KB used of ${limitKb} KB budget (${Math.round(pct)}%) — OVER BUDGET`);
    } else if (pct >= 80) {
      warnings.push(`${label}: ${Math.round(actualKb)} KB used of ${limitKb} KB budget (${Math.round(pct)}%) — approaching limit`);
    }
  }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEMemoryBudget = {
    budget: new MemoryBudget(),
    MemoryBudget,
    LIMITS,
    estimateTextureBytes,
    estimateAudioBytes,
    estimateSceneBytes,
  };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
