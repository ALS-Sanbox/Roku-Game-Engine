globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  const STORAGE_KEY = 'rge.dockSizes.v46.5';
  const MIN_LEFT = 140;
  const MAX_LEFT = 620;
  const MIN_RIGHT = 160;
  const MAX_RIGHT = 680;
  const MIN_BOTTOM = 60;
  const MAX_BOTTOM = 620;
  const MIN_LEFT_ZONE = 38;

  function px(n) { return Math.round(n) + 'px'; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function readSizes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function saveSizes(next) {
    try {
      const merged = Object.assign(readSizes(), next || {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }

  function applySizes() {
    const sizes = readSizes();
    const leftDock = document.getElementById('left-dock');
    const rightDock = document.getElementById('right-dock');
    const bottomDock = document.getElementById('bottom-dock');
    const leftTop = document.getElementById('left-dock-top');
    const leftBottom = document.getElementById('left-dock-bottom');

    if (leftDock && Number.isFinite(sizes.leftWidth)) {
      leftDock.style.width = px(sizes.leftWidth);
      leftDock.style.flexBasis = px(sizes.leftWidth);
    }
    if (rightDock && Number.isFinite(sizes.rightWidth)) {
      rightDock.style.width = px(sizes.rightWidth);
      rightDock.style.flexBasis = px(sizes.rightWidth);
    }
    if (bottomDock && Number.isFinite(sizes.bottomHeight)) {
      bottomDock.style.height = px(sizes.bottomHeight);
      bottomDock.style.flexBasis = px(sizes.bottomHeight);
    }
    if (leftTop && leftBottom && Number.isFinite(sizes.leftTopHeight)) {
      leftTop.style.height = px(sizes.leftTopHeight);
      leftTop.style.flexBasis = px(sizes.leftTopHeight);
      leftBottom.style.flex = '1 1 auto';
    }
  }

  // SLUGGISH-FIX: notifyResize was firing synchronously on every pointermove pixel
  // AND calling scheduleRender(VIEWPORT) twice (once inside onResize, once directly).
  // Now: debounced through a single rAF; duplicate scheduleRender removed since
  // window.onResize() already calls it.
  let _notifyRafId = null;
  function notifyResize() {
    if (_notifyRafId !== null) return; // coalesce rapid resize events into one rAF
    _notifyRafId = requestAnimationFrame(() => {
      _notifyRafId = null;
      if (typeof window.onResize === 'function') {
        try { window.onResize(); } catch (_) {}
      }
      // window.onResize() already calls scheduleRender(VIEWPORT) — no second call needed.
    });
  }

  function bindDrag(handle, onMove, onDone) {
    if (!handle || handle.dataset.resizeBound === '1') return;
    handle.dataset.resizeBound = '1';

    let dragging = false;
    let pointerId = null;

    const move = (event) => {
      if (!dragging) return;
      if (pointerId != null && event.pointerId != null && event.pointerId !== pointerId) return;
      onMove(event);
      notifyResize();
    };

    const stop = (event) => {
      if (!dragging) return;
      if (pointerId != null && event && event.pointerId != null && event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      handle.classList.remove('dragging');
      document.body.classList.remove('is-resizing-panels');
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', stop, true);
      if (typeof onDone === 'function') onDone();
    };

    const start = (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      pointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
      handle.classList.add('dragging');
      document.body.classList.add('is-resizing-panels');
      if (typeof handle.setPointerCapture === 'function' && pointerId != null) {
        try { handle.setPointerCapture(pointerId); } catch (_) {}
      }
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', stop, true);
    };

    handle.addEventListener('pointerdown', start, true);
    handle.addEventListener('mousedown', start, true);
  }

  function bindResizers() {
    const appShell = document.getElementById('app-shell');
    const workspace = document.getElementById('workspace');
    const leftDock = document.getElementById('left-dock');
    const rightDock = document.getElementById('right-dock');
    const bottomDock = document.getElementById('bottom-dock');
    const leftTop = document.getElementById('left-dock-top');
    const leftBottom = document.getElementById('left-dock-bottom');
    const leftSplit = document.querySelector('#left-dock .dock-zone-splitter');
    if (!appShell || !workspace || !leftDock || !rightDock || !bottomDock) return;

    applySizes();

    let last = {};
    bindDrag(document.getElementById('resize-left'), (event) => {
      const shellRect = appShell.getBoundingClientRect();
      const next = clamp(event.clientX - shellRect.left, MIN_LEFT, Math.min(MAX_LEFT, shellRect.width - 340));
      leftDock.style.width = px(next);
      leftDock.style.flexBasis = px(next);
      last.leftWidth = Math.round(next);
    }, () => saveSizes({ leftWidth: last.leftWidth }));

    bindDrag(document.getElementById('resize-right'), (event) => {
      const shellRect = appShell.getBoundingClientRect();
      const next = clamp(shellRect.right - event.clientX, MIN_RIGHT, Math.min(MAX_RIGHT, shellRect.width - 340));
      rightDock.style.width = px(next);
      rightDock.style.flexBasis = px(next);
      last.rightWidth = Math.round(next);
    }, () => saveSizes({ rightWidth: last.rightWidth }));

    bindDrag(document.getElementById('resize-bottom'), (event) => {
      const workspaceRect = workspace.getBoundingClientRect();
      const next = clamp(workspaceRect.bottom - event.clientY, MIN_BOTTOM, Math.min(MAX_BOTTOM, workspaceRect.height - 140));
      bottomDock.style.height = px(next);
      bottomDock.style.flexBasis = px(next);
      last.bottomHeight = Math.round(next);
    }, () => saveSizes({ bottomHeight: last.bottomHeight }));

    if (leftSplit && leftTop && leftBottom) {
      bindDrag(leftSplit, (event) => {
        const dockRect = leftDock.getBoundingClientRect();
        const splitHeight = leftSplit.getBoundingClientRect().height || 4;
        const maxTop = Math.max(MIN_LEFT_ZONE, dockRect.height - splitHeight - MIN_LEFT_ZONE);
        const next = clamp(event.clientY - dockRect.top, MIN_LEFT_ZONE, maxTop);
        leftTop.style.height = px(next);
        leftTop.style.flexBasis = px(next);
        leftBottom.style.flex = '1 1 auto';
        last.leftTopHeight = Math.round(next);
      }, () => saveSizes({ leftTopHeight: last.leftTopHeight }));
    }
  }

  RGE_ROOT.RGEResetDockSizes = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    ['left-dock', 'right-dock', 'bottom-dock', 'left-dock-top', 'left-dock-bottom'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.width = '';
      el.style.height = id === 'bottom-dock' ? '220px' : '';
      el.style.flexBasis = '';
      el.style.flex = '';
    });
    notifyResize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindResizers);
  } else {
    bindResizers();
  }
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
