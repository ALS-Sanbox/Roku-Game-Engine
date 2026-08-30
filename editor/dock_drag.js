globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/* RGE Dock Tab Dragging v46.9 stabilization
 * Tabs and matching panel content divs move together between dock zones.
 * Adds a main-bar Tabs menu for hide/show, per-tab default docking, and persistent layouts.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'rge.dockTabLayout.v4';
  const LEGACY_STORAGE_KEYS = ['rge.dockTabLayout.v3', 'rge.dockTabLayout.v2', 'rge.dockTabLayout.v1'];
  const DOCKS = [
    { id: 'left-top', zone: '#left-dock-top', bar: '#left-dock-top .dock-tabs' },
    { id: 'left-bottom', zone: '#left-dock-bottom', bar: '#left-dock-bottom .dock-tabs' },
    { id: 'center', zone: '#center-dock', bar: '#center-dock .dock-tabs' },
    { id: 'right', zone: '#right-dock', bar: '#right-dock .dock-tabs' },
    { id: 'bottom', zone: '#bottom-dock', bar: '#bottom-dock .bottom-tabs' },
  ];

  const MENU_TABS = [
    { key: 'create', label: 'Create Tab', defaultDock: 'left-top' },
    { key: 'scene', label: 'Scene Tab', defaultDock: 'left-bottom' },
    { key: 'filesystem', label: 'File System', defaultDock: 'left-top' },
    { key: 'game', label: 'Main Scene', defaultDock: 'center' },
    { key: 'ui', label: 'UI Screens', defaultDock: 'bottom' },
    { key: 'inspector', label: 'Inspector', defaultDock: 'right' },
    { key: 'node-info', label: 'Tile Opts', defaultDock: 'right' },
    { key: 'output', label: 'Output', defaultDock: 'bottom' },
    { key: 'audio', label: 'Audio', defaultDock: 'bottom' },
    { key: 'sprites', label: 'Sprites', defaultDock: 'bottom' },
    { key: 'spriteframes', label: 'Sprite Frames', defaultDock: 'bottom' },
    { key: 'transitions', label: 'Transitions', defaultDock: 'bottom' },
    { key: 'tilesets', label: 'Tile Sets', defaultDock: 'bottom' },
    { key: 'uitemplates', label: 'Ui Templates', defaultDock: 'bottom' },
    { key: 'optscores', label: 'Options & Scores', defaultDock: 'bottom' },
    { key: 'nineslice', label: 'UI Assets Atlas', defaultDock: 'bottom' },
    { key: 'tilemaps', label: 'Tile Maps', defaultDock: 'bottom' },
    { key: 'camera-preview', label: 'Camera Preview', defaultDock: 'bottom' },
  ];



  const FACTORY_DEFAULT_LAYOUT = {
    'left-top': ['dock-panel-create'],
    'left-bottom': ['dock-panel-scene'],
    center: ['viewport-wrap'],
    right: ['dock-panel-inspector'],
    bottom: ['dock-panel-output'],
    hidden: [
      'dock-panel-filesystem', 'dock-panel-audio', 'dock-panel-sprites', 'ui-editor-wrap',
      'dock-panel-node-info', 'dock-panel-node', 'dock-panel-spriteframes', 'dock-panel-transitions',
      'dock-panel-tilesets', 'dock-panel-uitemplates',
      'dock-panel-optscores', 'dock-panel-nineslice', 'dock-panel-tilemaps',
      'dock-panel-camera-preview'
    ],
  };
  let draggedTab = null;
  let defaultLayout = null;
  let workspaceSyncing = false;
  let hiddenHost = null;
  let menuRenderQueued = false;
  let dockVisibilityQueued = false;
  let lastDragOverBar = null;
  let lastDragOverBefore = undefined;

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  }

  function getDockInfoById(id) { return DOCKS.find((d) => d.id === id) || null; }
  function getTabKey(tab) { return tab?.dataset?.dockKey || tab?.dataset?.tab || tab?.dataset?.bottom || ''; }
  function panelSelector() { return '.dock-panel, .bottom-panel'; }
  function tabButtons(bar) { return qsa('button.rge-dock-tab', bar); }
  function allTabButtons() { return qsa('button.rge-dock-tab'); }
  function menuMetaForKey(key) { return MENU_TABS.find((m) => m.key === key) || null; }

  function findPanelForKey(key) {
    if (!key) return null;
    return qs(`.dock-panel[data-panel="${cssEscape(key)}"]`) || qs(`.bottom-panel[data-bottom-panel="${cssEscape(key)}"]`);
  }

  function getTabTargetId(tab) {
    if (!tab) return '';
    if (tab.dataset.target) return tab.dataset.target;
    const panel = findPanelForKey(getTabKey(tab));
    return panel?.id || '';
  }

  function findPanelForTab(tab) {
    const targetId = getTabTargetId(tab);
    return targetId ? document.getElementById(targetId) : findPanelForKey(getTabKey(tab));
  }

  function zoneForElement(el) {
    return el?.closest?.('#left-dock-top, #left-dock-bottom, #center-dock, #right-dock, #bottom-dock, #dock-hidden-host') || null;
  }

  function ensureHiddenHost() {
    if (hiddenHost && document.body.contains(hiddenHost)) return hiddenHost;
    hiddenHost = document.getElementById('dock-hidden-host');
    if (!hiddenHost) {
      hiddenHost = document.createElement('div');
      hiddenHost.id = 'dock-hidden-host';
      hiddenHost.hidden = true;
      document.body.appendChild(hiddenHost);
    }
    return hiddenHost;
  }

  function movePanelToBarDock(tab, bar) {
    if (!tab || !bar) return null;
    const panel = findPanelForTab(tab);
    const zone = zoneForElement(bar);
    if (!panel || !zone) return panel;
    if (panel.parentElement !== zone) zone.appendChild(panel);
    return panel;
  }

  function labelForKey(key, fallback) {
    const meta = menuMetaForKey(key);
    if (meta) return meta.label;
    return fallback || key;
  }

  function setTabLabel(tab, label) {
    if (!tab || !label) return;
    let labelEl = tab.querySelector(':scope > .dock-tab-label');
    let closeEl = tab.querySelector(':scope > .dock-tab-close');
    if (!labelEl) {
      const current = Array.from(tab.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.nodeValue)
        .join('')
        .trim() || tab.textContent.trim();
      tab.textContent = '';
      labelEl = document.createElement('span');
      labelEl.className = 'dock-tab-label';
      labelEl.textContent = label || current;
      tab.appendChild(labelEl);
    } else {
      labelEl.textContent = label;
    }
    if (!closeEl) {
      closeEl = document.createElement('span');
      closeEl.className = 'dock-tab-close';
      closeEl.textContent = '×';
      closeEl.title = 'Hide tab';
      closeEl.setAttribute('aria-label', 'Hide tab');
      tab.appendChild(closeEl);
    }
  }

  function ensurePanelIdsAndTargets() {
    qsa('.dock-panel[data-panel], .bottom-panel[data-bottom-panel]').forEach((panel) => {
      const key = panel.dataset.panel || panel.dataset.bottomPanel;
      if (!panel.id) panel.id = `dock-panel-${key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
    });

    qsa('.dock-tab[data-tab], .bottom-tab[data-bottom]').forEach((tab) => {
      const key = tab.dataset.tab || tab.dataset.bottom;
      const panel = findPanelForKey(key);
      tab.classList.add('rge-dock-tab');
      tab.draggable = true;
      tab.dataset.dockKey = key;
      if (panel) tab.dataset.target = panel.id;
      tab.setAttribute('role', 'tab');
      setTabLabel(tab, labelForKey(key, tab.textContent.trim()));
      tab.title = 'Drag to move this tab to another dock zone';
    });

    // Also apply setTabLabel (which adds the standard .dock-tab-close button) to any
    // tab that already carries class="rge-dock-tab" and data-dock-key but was not
    // processed above (e.g. manually written in HTML before this migration).
    qsa('button.rge-dock-tab[data-dock-key]').forEach((tab) => {
      if (tab.querySelector('.dock-tab-label')) return; // already processed
      const key = tab.dataset.dockKey;
      const panel = findPanelForKey(key);
      tab.draggable = true;
      if (panel && !tab.dataset.target) tab.dataset.target = panel.id;
      tab.setAttribute('role', 'tab');
      setTabLabel(tab, labelForKey(key, tab.textContent.trim()));
      if (!tab.title) tab.title = 'Drag to move this tab to another dock zone';
    });
  }

  function normalizeLayout(layout) {
    if (!layout || typeof layout !== 'object') return null;
    if (!layout['left-top'] && !layout['left-bottom'] && !layout.center) {
      layout = {
        'left-top': Array.isArray(layout.left) ? layout.left : [],
        'left-bottom': [],
        center: [],
        right: Array.isArray(layout.right) ? layout.right : [],
        bottom: Array.isArray(layout.bottom) ? layout.bottom : [],
        hidden: [],
      };
    }
    layout.hidden = Array.isArray(layout.hidden) ? layout.hidden : [];
    return layout;
  }

  function captureLayout() {
    const layout = {};
    DOCKS.forEach((d) => {
      const bar = qs(d.bar);
      layout[d.id] = bar ? tabButtons(bar).map(getTabTargetId).filter(Boolean) : [];
    });
    const host = ensureHiddenHost();
    layout.hidden = tabButtons(host).map(getTabTargetId).filter(Boolean);
    return layout;
  }

  function readStoredLayout() {
    try {
      const keys = [STORAGE_KEY].concat(LEGACY_STORAGE_KEYS);
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) return normalizeLayout(JSON.parse(raw));
      }
    } catch (_) {}
    return null;
  }

  function saveLayout() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(captureLayout())); } catch (_) {}
    scheduleTabsMenuRender();
  }

  function hideTab(tab, options = {}) {
    if (!tab) return;
    const panel = findPanelForTab(tab);
    const host = ensureHiddenHost();
    tab.classList.remove('active');
    host.appendChild(tab);
    if (panel) {
      panel.classList.remove('active');
      panel.style.display = 'none';
      host.appendChild(panel);
    }
    const sourceBar = options.sourceBar || null;
    if (sourceBar && tabButtons(sourceBar).length) activateTab(tabButtons(sourceBar)[0]);
    updateDockVisibility();
    if (!options.skipSave) saveLayout();
  }

  function showTabInDock(key, options = {}) {
    const tab = allTabButtons().find((t) => getTabKey(t) === key);
    const meta = menuMetaForKey(key) || {};
    const dockId = options.dockId || meta.defaultDock || 'bottom';
    const dockInfo = getDockInfoById(dockId) || getDockInfoById('bottom');
    const bar = dockInfo ? qs(dockInfo.bar) : null;
    if (!tab || !bar) return;
    bar.appendChild(tab);
    movePanelToBarDock(tab, bar);
    activateTab(tab);
    updateDockVisibility();
    if (!options.skipSave) saveLayout();
  }

  function applyLayout(layout) {
    if (!layout) return;
    const normalized = normalizeLayout(layout);
    const tabsByTarget = new Map(allTabButtons().map((tab) => [getTabTargetId(tab), tab]));

    DOCKS.forEach((d) => {
      const bar = qs(d.bar);
      const targets = Array.isArray(normalized[d.id]) ? normalized[d.id] : [];
      if (!bar) return;
      targets.forEach((targetId) => {
        const tab = tabsByTarget.get(targetId);
        if (tab) {
          bar.appendChild(tab);
          movePanelToBarDock(tab, bar);
        }
      });
    });

    (normalized.hidden || []).forEach((targetId) => {
      const tab = tabsByTarget.get(targetId);
      if (tab) hideTab(tab, { skipSave: true });
    });
  }

  function clearActivePanelsInSameZone(panel) {
    if (!panel) return;
    const zone = zoneForElement(panel);
    if (!zone || zone.id === 'dock-hidden-host') return;
    qsa(panelSelector(), zone).forEach((p) => {
      const active = p === panel;
      p.classList.toggle('active', active);
      if (active) {
        if (p.style.display === 'none') p.style.display = '';
      } else if (p.style) {
        p.style.display = 'none';
      }
    });
  }


  function forceUiEditorPanelLayout() {
    const wrap = document.getElementById('ui-editor-wrap');
    const sidebar = document.getElementById('ui-editor-sidebar');
    const canvasWrap = document.getElementById('ui-editor-canvas-wrap');
    const canvas = document.getElementById('ui-editor-canvas');
    if (!wrap || !wrap.classList.contains('active')) return;

    // Inline guard for Electron builds where older injected styles may win over
    // stylesheet order after dock reparenting. Panels still move normally; this
    // only locks the UI Components's internal split layout.
    Object.assign(wrap.style, {
      display: 'grid',
      gridTemplateColumns: '230px minmax(240px, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      width: '100%',
      height: '100%',
      minWidth: '0',
      minHeight: '0',
      overflow: 'hidden',
      padding: '0'
    });
    if (sidebar) Object.assign(sidebar.style, {
      gridColumn: '1',
      gridRow: '1',
      width: 'auto',
      height: '100%',
      minHeight: '0',
      overflowY: 'auto',
      overflowX: 'hidden'
    });
    if (canvasWrap) Object.assign(canvasWrap.style, {
      gridColumn: '2',
      gridRow: '1',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'relative',
      width: '100%',
      height: '100%',
      minWidth: '240px',
      minHeight: '160px',
      overflow: 'hidden',
      pointerEvents: 'auto'
    });
    if (canvas) Object.assign(canvas.style, {
      display: 'block',
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'auto'
    });
  }

  function runPanelSideEffects(key) {
    if (!key) return;

    // UI Components draws selection / resize handles directly on its own canvas.
    // When any non-UI tab becomes active, explicitly deactivate and clear that
    // canvas so those editor handles can never bleed into the Main Scene view.
    if (key !== 'ui' && RGE_ROOT.RGEUIEditor && typeof RGE_ROOT.RGEUIEditor.deactivate === 'function') {
      RGE_ROOT.RGEUIEditor.deactivate();
    }

    if ((key === 'game' || key === 'ui') && typeof RGE_ROOT.RGEActivateWorkspace === 'function') {
      RGE_ROOT.RGEActivateWorkspace(key, { force: true, __fromDock: true });
      if (key === 'ui') forceUiEditorPanelLayout();
      requestAnimationFrame(() => {
        if (key === 'ui') {
          forceUiEditorPanelLayout();
          RGE_ROOT.RGEUIEditor?.ensureLayout?.();
          RGE_ROOT.RGEUIEditor?.forceRefresh?.('dock-activate');
        }
        if (key === 'game') {
          if (typeof window.scheduleRender === 'function' && window.RenderFlags) window.scheduleRender(window.RenderFlags.VIEWPORT);
          window.dispatchEvent(new Event('resize'));
          // v49: notify UIEditorLayer so it re-centres the canvas
          window.dispatchEvent(new CustomEvent('rge:dock-changed'));
        }
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (key === 'ui') {
          forceUiEditorPanelLayout();
          RGE_ROOT.RGEUIEditor?.ensureLayout?.();
          RGE_ROOT.RGEUIEditor?.forceRefresh?.('dock-activate-late');
        }
        if (key === 'game' && typeof window.scheduleRender === 'function' && window.RenderFlags) window.scheduleRender(window.RenderFlags.VIEWPORT);
      }));
    }
    if (key === 'spriteframes' && typeof window.renderSpriteFramesPanel === 'function') window.renderSpriteFramesPanel();
    if (key === 'tilemaps' && typeof window.scheduleRender === 'function' && window.RenderFlags) window.scheduleRender(window.RenderFlags.VIEWPORT);
    if (key === 'nineslice') RGE_ROOT.RGENineSliceEditor?.render?.();
    if (key === 'transitions') RGE_ROOT.RGETransitionEditor?.render?.();
    if (key === 'optscores') RGE_ROOT.RGEOptionsEditor?.render?.();
    if (key === 'uitemplates') RGE_ROOT.RGEUITemplates?.render?.();
  }

  function activateTab(tab) {
    if (!tab) return;
    const bar = tab.closest('.dock-tabs, .bottom-tabs');
    const panel = bar ? movePanelToBarDock(tab, bar) : findPanelForTab(tab);
    if (!panel || !bar) return;

    tabButtons(bar).forEach((t) => t.classList.toggle('active', t === tab));
    clearActivePanelsInSameZone(panel);
    updateDockVisibility();
    runPanelSideEffects(getTabKey(tab));
    scheduleTabsMenuRender();
  }

  function updateDockVisibilityNow() {
    DOCKS.forEach((d) => {
      const zone = qs(d.zone);
      const bar = qs(d.bar);
      if (!zone || !bar) return;
      const hasSceneTabs = d.id === 'center' && !!qs('#scene-tabs .scene-tab');
      const hasTabs = tabButtons(bar).length > 0 || hasSceneTabs || (d.id === 'center' && !!qs('#viewport-wrap'));
      zone.classList.toggle('dock-empty', !hasTabs);
      zone.setAttribute('aria-hidden', hasTabs ? 'false' : 'true');
      qsa(panelSelector(), zone).forEach((panel) => {
        if (!hasTabs) panel.classList.remove('active');
      });
    });

    const leftDock = qs('#left-dock');
    if (leftDock) {
      const leftHasTabs = ['left-top', 'left-bottom'].some((id) => {
        const info = getDockInfoById(id);
        const bar = info && qs(info.bar);
        return bar && tabButtons(bar).length > 0;
      });
      leftDock.classList.toggle('dock-empty', !leftHasTabs);
      leftDock.setAttribute('aria-hidden', leftHasTabs ? 'false' : 'true');
    }
    scheduleTabsMenuRender();
  }

  function updateDockVisibility() { scheduleDockVisibilityUpdate(); }

  function getInsertBefore(bar, clientX) {
    const tabs = tabButtons(bar).filter((tab) => tab !== draggedTab);
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    tabs.forEach((tab) => {
      const rect = tab.getBoundingClientRect();
      const offset = clientX - rect.left - rect.width / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, element: tab };
    });
    return closest.element;
  }

  function makeZoneDropTarget(zone, bar) {
    const onDragOver = (e) => {
      if (!draggedTab) return;
      e.preventDefault();
      zone.classList.add('dock-drop-zone-active');
      bar.classList.add('dock-drop-zone-active');
      const before = getInsertBefore(bar, e.clientX);
      if (lastDragOverBar !== bar || lastDragOverBefore !== before) {
        if (before) bar.insertBefore(draggedTab, before);
        else bar.appendChild(draggedTab);
        movePanelToBarDock(draggedTab, bar);
        lastDragOverBar = bar;
        lastDragOverBefore = before || null;
        updateDockVisibility();
      }
    };

    const onDragLeave = (e) => {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('dock-drop-zone-active');
        bar.classList.remove('dock-drop-zone-active');
      }
    };

    const onDrop = (e) => {
      if (!draggedTab) return;
      e.preventDefault();
      zone.classList.remove('dock-drop-zone-active');
      bar.classList.remove('dock-drop-zone-active');
      movePanelToBarDock(draggedTab, bar);
      activateTab(draggedTab);
      saveLayout();
      updateDockVisibility();
    };

    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
  }

  function bindDragEvents() {
    DOCKS.forEach((d) => {
      const zone = qs(d.zone);
      const bar = qs(d.bar);
      if (!zone || !bar || zone.dataset.dockDropBound === '1') return;
      zone.dataset.dockId = d.id;
      bar.dataset.dockId = d.id;
      zone.dataset.dockDropBound = '1';
      makeZoneDropTarget(zone, bar);
    });

    document.addEventListener('dragstart', (e) => {
      const tab = e.target.closest('button.rge-dock-tab');
      if (!tab || e.target.closest('.dock-tab-close')) return;
      draggedTab = tab;
      lastDragOverBar = null;
      lastDragOverBefore = undefined;
      tab.classList.add('is-dragging');
      document.body.classList.add('dock-tab-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', getTabTargetId(tab));
    });

    document.addEventListener('dragend', () => {
      if (draggedTab) {
        const bar = draggedTab.closest('.dock-tabs, .bottom-tabs');
        if (bar) movePanelToBarDock(draggedTab, bar);
        draggedTab.classList.remove('is-dragging');
      }
      draggedTab = null;
      lastDragOverBar = null;
      lastDragOverBefore = undefined;
      document.body.classList.remove('dock-tab-dragging');
      qsa('.dock-drop-zone-active').forEach((el) => el.classList.remove('dock-drop-zone-active'));
      saveLayout();
      updateDockVisibility();
    });
  }

  function bindClickCompatibility() {
    document.addEventListener('click', (e) => {
      const close = e.target.closest('.dock-tab-close');
      if (close) {
        const tab = close.closest('button.rge-dock-tab');
        const sourceBar = tab?.closest('.dock-tabs, .bottom-tabs') || null;
        e.preventDefault();
        e.stopImmediatePropagation();
        hideTab(tab, { sourceBar });
        return;
      }
      const tab = e.target.closest('button.rge-dock-tab');
      if (!tab) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      activateTab(tab);
      saveLayout();
    }, true);
  }

  function isTabVisible(key) {
    const tab = allTabButtons().find((t) => getTabKey(t) === key);
    return !!(tab && tab.closest('.dock-tabs, .bottom-tabs'));
  }


  function scheduleTabsMenuRender() {
    if (menuRenderQueued) return;
    menuRenderQueued = true;
    requestAnimationFrame(() => {
      menuRenderQueued = false;
      renderTabsMenu();
    });
  }

  function scheduleDockVisibilityUpdate() {
    if (dockVisibilityQueued) return;
    dockVisibilityQueued = true;
    requestAnimationFrame(() => {
      dockVisibilityQueued = false;
      updateDockVisibilityNow();
    });
  }

  function applyFactoryDefaultLayout() {
    applyLayout(FACTORY_DEFAULT_LAYOUT);
    allTabButtons().forEach((tab) => tab.classList.remove('active'));
    ['left-top', 'left-bottom', 'center', 'right', 'bottom'].forEach((dockId) => {
      const d = getDockInfoById(dockId);
      const first = d ? qs(`${d.bar} button.rge-dock-tab`) : null;
      if (first) activateTab(first);
    });
    updateDockVisibilityNow();
    saveLayout();
    if (typeof RGE_ROOT.RGEResetDockSizes === 'function') RGE_ROOT.RGEResetDockSizes();
  }

  function renderTabsMenu() {
    const list = qs('#tabs-menu-list');
    if (!list) return;
    list.innerHTML = '';
    MENU_TABS.forEach((meta) => {
      const tab = allTabButtons().find((t) => getTabKey(t) === meta.key);
      const row = document.createElement('button');
      const visible = isTabVisible(meta.key);
      row.type = 'button';
      row.className = `tabs-menu-item ${visible ? 'is-visible' : 'is-hidden'}`;
      row.disabled = !tab;
      row.dataset.tabKey = meta.key;
      row.innerHTML = `<span class="tabs-menu-tab-name"></span><span class="tabs-menu-state"></span><span class="tabs-menu-hide" title="Hide tab" aria-label="Hide tab">×</span>`;
      row.querySelector('.tabs-menu-tab-name').textContent = meta.label;
      row.querySelector('.tabs-menu-state').textContent = visible ? 'Shown' : 'Hidden';
      row.addEventListener('click', (e) => {
        const clickedHide = e.target.closest('.tabs-menu-hide');
        const currentTab = allTabButtons().find((t) => getTabKey(t) === meta.key);
        // Bug 7 fix: always close the dropdown after any row interaction
        const closeDrop = () => {
          const drop = qs('#tabs-menu-dropdown');
          const trig = qs('#btn-tabs-menu');
          if (drop) drop.classList.add('hidden');
          if (trig) trig.setAttribute('aria-expanded', 'false');
        };
        if (!currentTab) return;
        if (visible) {
          if (!clickedHide) {
            // Clicking the row itself (not ×) when visible → just close the menu
            closeDrop();
            return;
          }
          const sourceBar = currentTab.closest('.dock-tabs, .bottom-tabs') || null;
          hideTab(currentTab, { sourceBar });
          closeDrop();
          return;
        }
        showTabInDock(meta.key);
        closeDrop();
      });
      list.appendChild(row);
    });
  }

  function bindTabsMenu() {
    const menu = qs('#tabs-menu');
    const trigger = qs('#btn-tabs-menu');
    const dropdown = qs('#tabs-menu-dropdown');
    const defaultBtn = qs('#tabs-menu-default');
    if (!menu || !trigger || !dropdown) return;
    if (defaultBtn && defaultBtn.dataset.bound !== '1') {
      defaultBtn.dataset.bound = '1';
      defaultBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.removeItem(STORAGE_KEY); LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key)); } catch (_) {}
        applyFactoryDefaultLayout();
      });
    }
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const hidden = dropdown.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      renderTabsMenu();
    });
    document.addEventListener('click', (e) => {
      if (menu.contains(e.target)) return;
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function syncWorkspaceDockTab(key) {
    if (workspaceSyncing) return;
    const normalized = key === 'ui' ? 'ui' : 'game';
    const tab = qs(`button.rge-dock-tab[data-dock-key="${cssEscape(normalized)}"], button.rge-dock-tab[data-tab="${cssEscape(normalized)}"]`);
    if (!tab || !tab.closest('.dock-tabs, .bottom-tabs')) return;
    workspaceSyncing = true;
    try { activateTab(tab); }
    finally { workspaceSyncing = false; }
  }

  function wrapWorkspaceActivator() {
    if (typeof RGE_ROOT.RGEActivateWorkspace !== 'function' || RGE_ROOT.RGEActivateWorkspace.__dockWrapped) return;
    const original = RGE_ROOT.RGEActivateWorkspace;
    const wrapped = function (workspace, options) {
      const result = original.call(this, workspace, options || {});
      if (!options || !options.__fromDock) syncWorkspaceDockTab(workspace === 'ui' ? 'ui' : 'game');
      return result;
    };
    wrapped.__dockWrapped = true;
    RGE_ROOT.RGEActivateWorkspace = wrapped;
  }

  function addResetButton() {
    const footer = qs('#statusbar');
    if (!footer || qs('#dock-layout-reset')) return;
    const btn = document.createElement('button');
    btn.id = 'dock-layout-reset';
    btn.type = 'button';
    btn.className = 'dock-reset-btn';
    btn.textContent = 'Reset Dock Layout';
    btn.addEventListener('click', () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      } catch (_) {}
      applyFactoryDefaultLayout();
    });
    footer.appendChild(btn);
  }

  function init() {
    ensureHiddenHost();
    ensurePanelIdsAndTargets();
    wrapWorkspaceActivator();
    defaultLayout = FACTORY_DEFAULT_LAYOUT;
    applyLayout(readStoredLayout() || FACTORY_DEFAULT_LAYOUT);
    bindClickCompatibility();
    bindDragEvents();
    bindTabsMenu();
    addResetButton();
    updateDockVisibility();

    DOCKS.forEach((d) => {
      const bar = qs(d.bar);
      if (!bar || !tabButtons(bar).length) return;
      const active = qs('button.rge-dock-tab.active', bar) || qs('button.rge-dock-tab', bar);
      activateTab(active);
    });
    if (typeof RGE_ROOT.RGEActivateWorkspace === 'function') {
      RGE_ROOT.RGEActivateWorkspace('game', { force: true, __fromDock: true });
    }
    renderTabsMenu();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
