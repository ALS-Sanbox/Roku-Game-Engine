globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// ── PerfMonitor ────────────────────────────────────────────────────────────────
// Lightweight internal performance monitor.
// Tracks per-slice redraw counts, last render timestamps, and frame timing.
// Renders into a small floating HUD (hidden by default, toggled with Alt+Shift+P).
//
// Public API:
//   PerfMonitor.recordRedraw(sliceName)  – call at the top of every render fn
//   PerfMonitor.show() / .hide() / .toggle()
//   PerfMonitor.reset()

const PerfMonitor = (() => {
  // ── internal state ─────────────────────────────────────────────────────────
  const _counts     = Object.create(null); // slice → total redraws this session
  const _lastTime   = Object.create(null); // slice → timestamp of last redraw
  let   _frameCount = 0;
  let   _sessionStart = performance.now();
  let   _visible    = false;
  let   _hudEl      = null;
  let   _rafId      = null;

  // ── HUD construction ───────────────────────────────────────────────────────
  function _buildHud() {
    const el = document.createElement('div');
    el.id = 'rge-perf-monitor';
    el.setAttribute('aria-label', 'RGE Performance Monitor');
    Object.assign(el.style, {
      position:      'fixed',
      bottom:        '48px',
      right:         '12px',
      zIndex:        '9999',
      background:    'rgba(10,10,20,0.92)',
      color:         '#b0e0ff',
      fontFamily:    'monospace',
      fontSize:      '11px',
      lineHeight:    '1.5',
      padding:       '8px 12px',
      borderRadius:  '6px',
      border:        '1px solid #2a4a7a',
      minWidth:      '220px',
      pointerEvents: 'none',
      userSelect:    'none',
      display:       'none',
    });
    el.innerHTML = '<div style="color:#7ab8e8;font-weight:bold;margin-bottom:4px">⬡ RGE Perf Monitor</div><div id="rge-perf-body"></div>';
    document.body.appendChild(el);
    return el;
  }

  function _ensureHud() {
    if (!_hudEl) _hudEl = _buildHud();
    return _hudEl;
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  function _renderHud() {
    _rafId = null;
    if (!_visible) return;
    const hud   = _ensureHud();
    const body  = hud.querySelector('#rge-perf-body');
    const now   = performance.now();
    const elapsedS = Math.max(0.001, (now - _sessionStart) / 1000);
    const fps   = (_frameCount / elapsedS).toFixed(1);

    const rows = Object.keys(_counts)
      .sort()
      .map((slice) => {
        const age = now - (_lastTime[slice] || 0);
        const heat = age < 200 ? '#ffd060' : age < 1000 ? '#7ad07a' : '#4a6a8a';
        return `<div style="display:flex;justify-content:space-between;gap:12px">` +
               `<span style="color:${heat}">${slice}</span>` +
               `<span>${_counts[slice]}×</span>` +
               `</div>`;
      }).join('');

    body.innerHTML =
      `<div style="color:#ffd060;margin-bottom:2px">frames: ${_frameCount} | avg fps: ${fps}</div>` +
      `<hr style="border:none;border-top:1px solid #2a4a7a;margin:4px 0">` +
      (rows || '<div style="color:#4a6a8a">(no redraws yet)</div>');

    _scheduleRefresh();
  }

  function _scheduleRefresh() {
    if (!_visible || _rafId !== null) return;
    _rafId = requestAnimationFrame(_renderHud);
  }

  // ── public API ─────────────────────────────────────────────────────────────
  function recordRedraw(slice) {
    _counts[slice]   = (_counts[slice]   || 0) + 1;
    _lastTime[slice] = performance.now();
    _frameCount++;
    if (_visible) _scheduleRefresh();
  }

  function show() {
    _visible = true;
    const hud = _ensureHud();
    hud.style.display = 'block';
    _scheduleRefresh();
  }

  function hide() {
    _visible = false;
    if (_hudEl) _hudEl.style.display = 'none';
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  function toggle() { _visible ? hide() : show(); }

  function reset() {
    for (const k of Object.keys(_counts)) delete _counts[k];
    for (const k of Object.keys(_lastTime)) delete _lastTime[k];
    _frameCount  = 0;
    _sessionStart = performance.now();
    if (_visible) _scheduleRefresh();
  }

  // ── keyboard shortcut: Alt+Shift+P ────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      toggle();
      e.preventDefault();
    }
  });

  return { recordRedraw, show, hide, toggle, reset };
})();

window.PerfMonitor = PerfMonitor;


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
