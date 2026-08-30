globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// ── EditorStore ────────────────────────────────────────────────────────────────
// Central reactive state container for the RGE editor.
// Panels subscribe to slices; the store notifies only affected subscribers
// when that slice's version changes.
//
// Usage:
//   EditorStore.subscribe('inspector', () => refreshInspector());
//   EditorStore.touch('inspector');   // mark dirty → triggers subscriber next rAF
//   EditorStore.getVersion('inspector');  // monotonic counter per slice

const SLICES = [
  'tree',
  'inspector',
  'viewport',
  'sceneSummary',
  'tilemaps',
  'sceneTabs',
  'historyBtns',
  'zoomReadout',
  'spritesheets',
  'tilesets',
  'spriteFrames',
  'filesystem',
  'audioPanel',
  'perf',        // performance monitor slice
];

const _versions     = Object.create(null); // slice → monotonic int
const _subscribers  = Object.create(null); // slice → Set<Function>
const _dirty        = new Set();           // slices marked dirty this tick
let   _rafId        = null;

for (const s of SLICES) {
  _versions[s]    = 0;
  _subscribers[s] = new Set();
}

function _flush() {
  _rafId = null;
  const batch = Array.from(_dirty);
  _dirty.clear();
  for (const slice of batch) {
    _versions[slice] = (_versions[slice] || 0) + 1;
    for (const fn of (_subscribers[slice] || [])) {
      try { fn(slice, _versions[slice]); } catch (e) { console.error('[EditorStore] subscriber error', slice, e); }
    }
  }
}

const EditorStore = {
  /** Mark a slice as needing a refresh.  Batches into one rAF flush. */
  touch(slice) {
    if (!Object.prototype.hasOwnProperty.call(_versions, slice)) {
      console.warn('[EditorStore] unknown slice:', slice);
      return;
    }
    _dirty.add(slice);
    if (_rafId === null) _rafId = requestAnimationFrame(_flush);
  },

  /** Flush all pending dirty slices synchronously (use before DOM queries). */
  flushSync() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    _flush();
  },

  /** Subscribe to a slice.  fn(slice, version) is called whenever slice is touched. */
  subscribe(slice, fn) {
    if (!_subscribers[slice]) _subscribers[slice] = new Set();
    _subscribers[slice].add(fn);
    return () => _subscribers[slice].delete(fn);   // returns unsubscribe fn
  },

  /** Get current monotonic version for a slice (useful for cheap equality checks). */
  getVersion(slice) {
    return _versions[slice] || 0;
  },

  /** Touch multiple slices at once. */
  touchMany(...slices) {
    for (const s of slices) this.touch(s);
  },

  /** List of valid slice names (for tooling / perf monitor). */
  slices: SLICES.slice(),
};

window.EditorStore = EditorStore;


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
