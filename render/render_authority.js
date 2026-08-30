globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * render_authority.js — RGE v91 Unified Renderer Authority
 *
 * Prevents editor/runtime rendering divergence by defining a shared
 * render command set that both the browser canvas renderer and the
 * Roku BrightScript renderer can execute.
 *
 * Architecture:
 *  - RenderCommand: tagged union of all supported draw operations.
 *  - RenderCommandQueue: ordered list built per-frame, then dispatched.
 *  - RendererCapabilitySystem: validates commands against Roku constraints.
 *  - FeatureFlags: bitmask of runtime-safe features.
 *
 * Commands outside the capability set are demoted to warnings and
 * replaced with safe fallbacks, ensuring the editor preview matches
 * what Roku will actually render.
 *
 * Roku runtime constraints (sourced from BrightScript SDK docs):
 *  - No floating-point blend modes beyond standard alpha composite
 *  - No per-pixel shaders (only region-based draw calls)
 *  - Rotation clamped to 0/90/180/270 in compositor mode
 *  - No gradient fills
 *  - Alpha only 0–255 integer
 */

(function () {
  'use strict';

  // ── Command types ──────────────────────────────────────────────────────────

  const CMD = {
    CLEAR:          'clear',
    DRAW_SPRITE:    'draw_sprite',
    DRAW_RECT:      'draw_rect',
    DRAW_TEXT:      'draw_text',
    DRAW_LINE:      'draw_line',
    DRAW_REGION:    'draw_region',
    SET_ALPHA:      'set_alpha',
    SET_CLIP:       'set_clip',
    CLEAR_CLIP:     'clear_clip',
    // Editor-only (flagged as unsupported at runtime)
    DRAW_GRADIENT:  'draw_gradient',
    DRAW_SHADOW:    'draw_shadow',
    DRAW_BLUR:      'draw_blur',
    SET_BLEND_MODE: 'set_blend_mode',
  };

  const ROKU_UNSUPPORTED_CMDS = new Set([
    CMD.DRAW_GRADIENT,
    CMD.DRAW_SHADOW,
    CMD.DRAW_BLUR,
    CMD.SET_BLEND_MODE,
  ]);

  // ── RenderCommand ──────────────────────────────────────────────────────────

  function makeCmd(type, payload) {
    return Object.freeze({ type, ...payload });
  }

  const RenderCommand = {
    clear:       (color)                    => makeCmd(CMD.CLEAR,       { color }),
    drawSprite:  (textureId, x, y, opts)    => makeCmd(CMD.DRAW_SPRITE, { textureId, x, y, opts: opts || {} }),
    drawRegion:  (textureId, srcX, srcY, srcW, srcH, dstX, dstY, opts) =>
      makeCmd(CMD.DRAW_REGION, { textureId, srcX, srcY, srcW, srcH, dstX, dstY, opts: opts || {} }),
    drawRect:    (x, y, w, h, color)        => makeCmd(CMD.DRAW_RECT,   { x, y, w, h, color }),
    drawText:    (text, x, y, fontId, opts) => makeCmd(CMD.DRAW_TEXT,   { text, x, y, fontId, opts: opts || {} }),
    drawLine:    (x1, y1, x2, y2, color)    => makeCmd(CMD.DRAW_LINE,   { x1, y1, x2, y2, color }),
    setAlpha:    (alpha)                    => makeCmd(CMD.SET_ALPHA,    { alpha: clampAlpha(alpha) }),
    setClip:     (x, y, w, h)              => makeCmd(CMD.SET_CLIP,     { x, y, w, h }),
    clearClip:   ()                         => makeCmd(CMD.CLEAR_CLIP,   {}),
    // Editor-only
    drawGradient:(x, y, w, h, stops)       => makeCmd(CMD.DRAW_GRADIENT,{ x, y, w, h, stops }),
    drawShadow:  (opts)                     => makeCmd(CMD.DRAW_SHADOW,  opts),
  };

  // ── RenderCommandQueue ─────────────────────────────────────────────────────

  class RenderCommandQueue {
    constructor() {
      this._cmds = [];
      this._warnings = [];
    }

    push(cmd) {
      this._cmds.push(cmd);
      return this;
    }

    /** Validate all queued commands against Roku capability constraints. */
    validate() {
      this._warnings = [];
      for (const cmd of this._cmds) {
        if (ROKU_UNSUPPORTED_CMDS.has(cmd.type)) {
          this._warnings.push({
            cmd: cmd.type,
            message: `"${cmd.type}" is not supported on Roku hardware; it will be ignored at runtime.`
          });
        }
      }
      return this._warnings;
    }

    /**
     * Produce a Roku-safe copy of this queue.
     * Unsupported commands are dropped (not replaced, because there is no
     * safe pixel-shader fallback on BrightScript).
     */
    toRokuSafe() {
      const safe = new RenderCommandQueue();
      for (const cmd of this._cmds) {
        if (!ROKU_UNSUPPORTED_CMDS.has(cmd.type)) safe.push(cmd);
      }
      return safe;
    }

    get commands() { return this._cmds; }
    get warnings() { return this._warnings; }
    get length() { return this._cmds.length; }

    clear() { this._cmds = []; this._warnings = []; }
  }

  // ── RendererCapabilitySystem ───────────────────────────────────────────────

  class RendererCapabilitySystem {
    constructor() {
      this._diagnostics = [];
      this._drawCalls   = 0;
      this._textureSwaps = 0;
      this._batchCount  = 0;
    }

    /**
     * Analyse a completed command queue for diagnostics.
     * @param {RenderCommandQueue} queue
     * @returns {object} diagnostics report
     */
    analyse(queue) {
      this._diagnostics = [];
      this._drawCalls   = 0;
      this._textureSwaps = 0;
      this._batchCount  = 0;

      let lastTexture = null;
      let batchSize   = 0;

      for (const cmd of queue.commands) {
        if (cmd.type === CMD.DRAW_SPRITE || cmd.type === CMD.DRAW_REGION) {
          this._drawCalls++;
          if (cmd.textureId !== lastTexture) {
            if (batchSize > 0) this._batchCount++;
            this._textureSwaps++;
            lastTexture = cmd.textureId;
            batchSize = 1;
          } else {
            batchSize++;
          }
        }
      }
      if (batchSize > 0) this._batchCount++;

      // Warnings
      if (this._textureSwaps > 16) {
        this._diagnostics.push({
          level: 'warn',
          message: `High texture swap count (${this._textureSwaps}). Consider using texture atlases.`
        });
      }
      if (this._drawCalls > 200) {
        this._diagnostics.push({
          level: 'warn',
          message: `Draw call count ${this._drawCalls} is high for Roku. Target <100 per frame.`
        });
      }

      const unsupported = queue.validate();
      for (const w of unsupported) {
        this._diagnostics.push({ level: 'error', message: w.message });
      }

      emit('renderer:diagnostics', this.getReport());
      return this.getReport();
    }

    getReport() {
      return {
        drawCalls:    this._drawCalls,
        textureSwaps: this._textureSwaps,
        batchCount:   this._batchCount,
        diagnostics:  [...this._diagnostics],
      };
    }
  }

  // ── DirtyRectManager ──────────────────────────────────────────────────────

  class DirtyRectManager {
    constructor(screenW, screenH) {
      this._sw = screenW;
      this._sh = screenH;
      this._regions = [];
    }

    markDirty(x, y, w, h) {
      this._regions.push({ x: Math.max(0, x), y: Math.max(0, y), w, h });
    }

    markAll() { this._regions = [{ x: 0, y: 0, w: this._sw, h: this._sh }]; }

    getMergedRegions() {
      if (this._regions.length === 0) return [];
      // Simple union merge: combine all into one bounding rect
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of this._regions) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      }
      return [{ x: minX, y: minY, w: maxX - minX, h: maxY - minY }];
    }

    clear() { this._regions = []; }
    get count() { return this._regions.length; }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clampAlpha(a) { return Math.max(0, Math.min(255, Math.round(Number(a) || 0))); }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGERenderAuthority = {
    CMD,
    ROKU_UNSUPPORTED_CMDS,
    RenderCommand,
    RenderCommandQueue,
    RendererCapabilitySystem,
    DirtyRectManager,
  };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
