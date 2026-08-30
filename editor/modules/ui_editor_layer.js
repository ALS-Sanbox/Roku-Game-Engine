globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// ── UIEditorLayer ──────────────────────────────────────────────────────────────
// Ensures the UI Components canvas stays correctly sized and centred.
//
// PERF RULE: this module must NEVER observe the full DOM with MutationObserver
// or subscribe to high-frequency events without rAF debouncing.
// Only two triggers are allowed:
//   1. ResizeObserver on #ui-editor-canvas-wrap  (fires only when that element resizes)
//   2. window 'rge:dock-changed' custom event     (fired once by dock_drag.js after drop)
//
// Public API:
//   UIEditorLayer.recenter()  – force a re-centre repaint immediately
//   UIEditorLayer.mount()     – idempotently attach observers (called from init)
//   UIEditorLayer.unmount()   – remove observers

const UIEditorLayer = (() => {
  let _observer = null;   // ResizeObserver on canvas-wrap only
  let _mounted  = false;
  let _rafId    = null;

  function _scheduleRecenter() {
    // Debounce: only one rAF in flight at a time
    if (_rafId !== null) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      recenter();
    });
  }

  function recenter() {
    // recenterCanvas was removed; forceRefresh handles resize/redraw.
    if (RGE_ROOT.RGEUIEditor && typeof RGE_ROOT.RGEUIEditor.forceRefresh === 'function') {
      RGE_ROOT.RGEUIEditor.forceRefresh('resize-observer');
    }
    window.PerfMonitor?.recordRedraw('uiEditorLayer');
  }

  function _attachObserver() {
    const wrap = document.getElementById('ui-editor-canvas-wrap');
    if (!wrap || _observer) return;
    if (typeof ResizeObserver !== 'undefined') {
      _observer = new ResizeObserver(_scheduleRecenter);
      _observer.observe(wrap);
    }
  }

  function mount() {
    if (_mounted) return;
    _mounted = true;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _attachObserver, { once: true });
    } else {
      _attachObserver();
    }

    // Only listen for the explicit dock-changed event — not generic resize
    // (the ResizeObserver already covers container size changes).
    window.addEventListener('rge:dock-changed', _scheduleRecenter);
  }

  function unmount() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    window.removeEventListener('rge:dock-changed', _scheduleRecenter);
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    _mounted = false;
  }

  return { recenter, mount, unmount };
})();

window.UIEditorLayer = UIEditorLayer;


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
