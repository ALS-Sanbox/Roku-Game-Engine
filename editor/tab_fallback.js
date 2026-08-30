globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

(function () {
  function activateDock(rootSelector, key) {
    if (!key) return;
    const root = document.querySelector(rootSelector);
    if (!root) return;
    root.querySelectorAll('.dock-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === key);
    });
    root.querySelectorAll('.dock-panel').forEach((panel) => {
      const active = panel.dataset.panel === key;
      panel.classList.toggle('active', active);
      panel.style.display = active ? '' : 'none';
    });
  }

  function activateBottom(key) {
    if (!key) return;
    document.querySelectorAll('.bottom-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.bottom === key);
    });
    document.querySelectorAll('.bottom-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.bottomPanel === key);
    });
  }

  function activateWorkspace(tab) {
    const workspace = tab?.dataset?.workspace || 'game';
    if (typeof RGE_ROOT.RGEActivateWorkspace === 'function') {
      return;
    }

    document.querySelectorAll('.workspace-tab').forEach((item) => {
      item.classList.toggle('active', item === tab);
    });
    const vpWrap = document.getElementById('viewport-wrap');
    const uiWrap = document.getElementById('ui-editor-wrap');
    if (workspace === 'ui') {
      if (vpWrap) vpWrap.style.display = 'none';
      if (uiWrap) uiWrap.style.display = 'flex';
      if (RGE_ROOT.RGEUIEditor?.activate) RGE_ROOT.RGEUIEditor.activate();
    } else {
      if (vpWrap) vpWrap.style.display = '';
      if (uiWrap) uiWrap.style.display = 'none';
      if (RGE_ROOT.RGEUIEditor?.deactivate) RGE_ROOT.RGEUIEditor.deactivate();
    }
  }

  function bindTabs() {
    document.querySelectorAll('.left-dock .dock-tab').forEach((tab) => {
      if (tab.dataset.fallbackBound === '1') return;
      tab.dataset.fallbackBound = '1';
      tab.addEventListener('click', () => activateDock('.left-dock', tab.dataset.tab), true);
    });

    document.querySelectorAll('.right-dock .dock-tab').forEach((tab) => {
      if (tab.dataset.fallbackBound === '1') return;
      tab.dataset.fallbackBound = '1';
      tab.addEventListener('click', () => activateDock('.right-dock', tab.dataset.tab), true);
    });

    document.querySelectorAll('.bottom-tab').forEach((tab) => {
      if (tab.dataset.fallbackBound === '1') return;
      tab.dataset.fallbackBound = '1';
      tab.addEventListener('click', () => activateBottom(tab.dataset.bottom), true);
    });

    document.querySelectorAll('.workspace-tab').forEach((tab) => {
      if (tab.dataset.fallbackBound === '1') return;
      tab.dataset.fallbackBound = '1';
      tab.addEventListener('click', () => activateWorkspace(tab), true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTabs, { once: true });
  } else {
    bindTabs();
  }
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
