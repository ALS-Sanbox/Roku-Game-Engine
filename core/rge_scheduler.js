globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';
/**
 * rge_scheduler.js — RGE v91 Centralized Scheduler  (sluggish-fix rev)
 *
 * KEY FIX: Loop is DEMAND-DRIVEN — only runs a rAF when there is actual work.
 * Previously it ran a permanent 60fps loop even with zero registered panels.
 */

(function () {
  'use strict';

  if (RGE_ROOT.RGEScheduler) return;

  class PanelRegistration {
    constructor(id, renderFn, cleanupFn, throttleMs) {
      this.id = id;
      this.renderFn = renderFn;
      this.cleanupFn = cleanupFn || null;
      this.throttleMs = throttleMs || 0;
      this._lastRenderAt = 0;
      this._dirty = true;
      this._destroyed = false;
      this.container = null;
    }
    markDirty() { this._dirty = true; }
    shouldRender(now) {
      if (this._destroyed || !this._dirty) return false;
      if (this.throttleMs > 0 && (now - this._lastRenderAt) < this.throttleMs) return false;
      return true;
    }
    render(now) {
      try { this.renderFn(); } catch (err) {
        console.error('[RGEScheduler] Panel "' + this.id + '" render error:', err);
      }
      this._dirty = false;
      this._lastRenderAt = now;
    }
    isDetached() { return this.container ? !document.contains(this.container) : false; }
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      try { if (this.cleanupFn) this.cleanupFn(); } catch (_) {}
    }
  }

  class RGEScheduler {
    constructor() {
      this._panels = new Map();
      this._throttled = new Map();
      this._rafId = null;
      this._frameCount = 0;
      this._gcInterval = 60;
    }

    register(id, renderFn, cleanupFn, throttleMs, container) {
      if (this._panels.has(id)) this.unregister(id);
      const reg = new PanelRegistration(id, renderFn, cleanupFn, throttleMs || 0);
      reg.container = container || null;
      this._panels.set(id, reg);
      this._wake();
      return reg;
    }

    unregister(id) {
      const reg = this._panels.get(id);
      if (reg) { reg.destroy(); this._panels.delete(id); }
    }

    invalidate(id) {
      const reg = this._panels.get(id);
      if (reg) { reg.markDirty(); this._wake(); }
    }

    invalidateAll() {
      for (const reg of this._panels.values()) reg.markDirty();
      if (this._panels.size > 0) this._wake();
    }

    // Throttled: uses setTimeout so it doesn't consume rAF budget each frame
    addThrottled(id, fn, intervalMs) {
      this.removeThrottled(id);
      const entry = { id, fn, interval: intervalMs, _timer: null, _removed: false };
      const arm = () => {
        if (entry._removed) return;
        entry._timer = setTimeout(() => {
          entry._timer = null;
          if (entry._removed) return;
          try { fn(performance.now()); } catch (_) {}
          arm();
        }, intervalMs);
      };
      this._throttled.set(id, entry);
      arm();
    }

    removeThrottled(id) {
      const e = this._throttled.get(id);
      if (e) { e._removed = true; if (e._timer) clearTimeout(e._timer); this._throttled.delete(id); }
    }

    // Demand-driven: schedules ONE rAF pass; goes idle when nothing is dirty
    _wake() {
      if (this._rafId !== null) return;
      this._rafId = requestAnimationFrame((ts) => {
        this._rafId = null;
        this._frameCount++;
        for (const reg of this._panels.values()) {
          if (reg.shouldRender(ts)) reg.render(ts);
        }
        if (this._frameCount % this._gcInterval === 0) this._gc();
        // Re-wake only if panels are still dirty
        for (const reg of this._panels.values()) {
          if (reg._dirty && !reg._destroyed) { this._wake(); break; }
        }
      });
    }

    _gc() {
      for (const [id, reg] of this._panels) {
        if (reg.isDetached()) { console.warn('[RGEScheduler] evicting detached panel "' + id + '"'); this.unregister(id); }
      }
    }

    get panelCount() { return this._panels.size; }
    get idle() { return this._rafId === null; }
  }

  RGE_ROOT.RGEScheduler = new RGEScheduler();
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
