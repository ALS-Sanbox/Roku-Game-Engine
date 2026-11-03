globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/* RGE v46.9 final editor stability pass
 * - numeric inputs remain directly editable and arrow-step friendly
 * - collapsible sections persist open/closed state
 * - expensive tab/menu redraw helpers are guarded by dock_drag.js
 */
(function () {
  'use strict';

  const DETAILS_STATE_KEY = 'rge.collapsibleDetails.v1';

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function readDetailsState() {
    try { return JSON.parse(localStorage.getItem(DETAILS_STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function writeDetailsState(state) {
    try { localStorage.setItem(DETAILS_STATE_KEY, JSON.stringify(state || {})); }
    catch (_) {}
  }

  function normalizeNumericInput(input) {
    if (!input || input.dataset.rgeNumberReady === '1') return;
    input.dataset.rgeNumberReady = '1';
    input.inputMode = input.step && String(input.step).includes('.') ? 'decimal' : 'numeric';
    input.autocomplete = input.autocomplete || 'off';

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      }
    });

    input.addEventListener('wheel', (event) => {
      if (document.activeElement !== input) return;
      // Release number stepping while letting the wheel scroll the panel.
      input.blur();
    }, { passive: true });

    input.addEventListener('blur', () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function bindNumericInputs() {
    qsa('input[type="number"]').forEach(normalizeNumericInput);

    const root = qs('#app-shell') || document.body;
    if (root && root.dataset.rgeNumericObserver !== '1') {
      root.dataset.rgeNumericObserver = '1';
      // SLUGGISH-FIX: MutationObserver was firing a callback per-node added,
      // causing 100+ synchronous qsa() scans per refreshInspector/refreshTree call.
      // Now: batch all records in a rAF flush, process once per animation frame.
      let _moRafId = null;
      let _pendingNodes = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) _pendingNodes.push(n);
          });
        }
        if (_moRafId !== null) return; // already queued
        _moRafId = requestAnimationFrame(() => {
          _moRafId = null;
          const batch = _pendingNodes;
          _pendingNodes = [];
          for (const n of batch) {
            if (n.matches?.('input[type="number"]')) normalizeNumericInput(n);
            qsa('input[type="number"]', n).forEach(normalizeNumericInput);
          }
        });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  function bindCollapsibleDetails() {
    const state = readDetailsState();
    qsa('details[id]').forEach((details) => {
      if (details.dataset.rgeDetailsReady === '1') return;
      details.dataset.rgeDetailsReady = '1';
      if (Object.prototype.hasOwnProperty.call(state, details.id)) {
        details.open = !!state[details.id];
      }
      details.addEventListener('toggle', () => {
        const next = readDetailsState();
        next[details.id] = !!details.open;
        writeDetailsState(next);
      });
    });
  }

  function bindDockResetAlias() {
    const defaultBtn = qs('#tabs-menu-default');
    const statusBtn = qs('#dock-layout-reset');
    if (defaultBtn && statusBtn && defaultBtn.dataset.rgeAliasBound !== '1') {
      defaultBtn.dataset.rgeAliasBound = '1';
      defaultBtn.title = 'Restore the default dock/tab layout';
    }
  }

  function init() {
    bindNumericInputs();
    bindCollapsibleDetails();
    bindDockResetAlias();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
