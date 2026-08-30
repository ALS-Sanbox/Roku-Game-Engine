globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * ui_options_editor.js — RGE Phase 8: Options & High Scores Editor Panel
 *
 * Two-tab bottom panel:
 *   Options tab   — define option keys, types, defaults, allowed values
 *   High Scores tab — define score tables, maxEntries, sortOrder
 *
 * All data persists via RGESceneBridge (state.uiOptionDefs / state.uiHighScoreTables).
 */

(function () {
  'use strict';

  // ── Bridge helpers ─────────────────────────────────────────────────────────
  // bridge → RGE_ROOT.RGEEditorBridge.bridge (shared, see editor/editor_bridge.js)
  const bridge = () => RGE_ROOT.RGEEditorBridge ? RGE_ROOT.RGEEditorBridge.bridge() : (RGE_ROOT.RGESceneBridge || null);

  // ── Tab state ──────────────────────────────────────────────────────────────
  let _activeTab        = 'options';   // 'options' | 'highscores'
  let _selectedOptId    = null;
  let _selectedTableId  = null;
  let _initialized      = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const OPTION_TYPES  = ['string', 'float', 'int', 'bool'];
  const SORT_ORDERS   = ['desc', 'asc'];

  const BUILTIN_OPTION_KEYS = [
    { key: 'music_volume',  label: 'Music Volume',  type: 'float',  defaultValue: '1.0', allowedValues: [] },
    { key: 'sound_volume',  label: 'Sound Volume',  type: 'float',  defaultValue: '1.0', allowedValues: [] },
    { key: 'difficulty',    label: 'Difficulty',    type: 'string', defaultValue: 'medium', allowedValues: ['easy','medium','hard'] },
    { key: 'display_mode',  label: 'Display Mode',  type: 'string', defaultValue: 'normal', allowedValues: ['normal','fullscreen'] },
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONS TAB
  // ──────────────────────────────────────────────────────────────────────────

  function renderOptionsList() {
    const listEl = document.getElementById('oe-opt-list');
    if (!listEl) return;
    const b = bridge(); if (!b) return;
    const opts   = b.getUIOptionDefs() || [];
    const selId  = _selectedOptId;
    listEl.innerHTML = '';

    if (!opts.length) {
      listEl.innerHTML = '<div class="oe-empty">No options defined. Click + or add a preset.</div>';
    } else {
      for (const opt of opts) {
        const row = document.createElement('div');
        row.className = 'oe-list-row' + (opt.id === selId ? ' active' : '');
        row.dataset.id = opt.id;

        const key = document.createElement('span');
        key.className = 'oe-list-key';
        key.textContent = opt.key || opt.id;

        const type = document.createElement('span');
        type.className = 'oe-list-type';
        type.textContent = opt.optionType || 'string';

        const def = document.createElement('span');
        def.className = 'oe-list-default';
        def.textContent = opt.defaultValue ?? '';

        row.appendChild(key); row.appendChild(type); row.appendChild(def);
        row.addEventListener('click', () => { _selectedOptId = opt.id; renderAll(); });
        listEl.appendChild(row);
      }
    }
  }

  function renderOptionEditor() {
    const b = bridge(); if (!b) return;
    const opts = b.getUIOptionDefs() || [];
    const opt  = opts.find(o => o.id === _selectedOptId) || null;
    const wrap = document.getElementById('oe-opt-editor');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!opt) {
      wrap.innerHTML = '<div class="oe-empty">Select an option to edit it.</div>';
      return;
    }

    function field(label, el) {
      const row = document.createElement('div'); row.className = 'oe-field';
      const lbl = document.createElement('label'); lbl.textContent = label;
      lbl.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block;';
      row.appendChild(lbl); row.appendChild(el); wrap.appendChild(row);
    }

    // Key
    const keyEl = document.createElement('input'); keyEl.type='text'; keyEl.value = opt.key || '';
    keyEl.addEventListener('change', () => {
      const clean = keyEl.value.trim().replace(/\s+/g,'_').toLowerCase();
      b.updateUIOptionDef(opt.id, { key: clean }); renderAll();
    });
    field('Option Key (used in scripts)', keyEl);

    // Label
    const labelEl = document.createElement('input'); labelEl.type='text'; labelEl.value = opt.label || '';
    labelEl.addEventListener('change', () => b.updateUIOptionDef(opt.id, { label: labelEl.value.trim() }));
    field('Display Label', labelEl);

    // Type
    const typeEl = document.createElement('select');
    OPTION_TYPES.forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; typeEl.appendChild(o); });
    typeEl.value = opt.optionType || 'string';
    typeEl.addEventListener('change', () => { b.updateUIOptionDef(opt.id, { optionType: typeEl.value }); renderAll(); });
    field('Type', typeEl);

    // Default value
    const defEl = document.createElement('input'); defEl.type='text'; defEl.value = opt.defaultValue ?? '';
    defEl.addEventListener('change', () => b.updateUIOptionDef(opt.id, { defaultValue: defEl.value }));
    field('Default Value', defEl);

    // Allowed values (comma-separated)
    const avEl = document.createElement('input'); avEl.type='text';
    avEl.value = Array.isArray(opt.allowedValues) ? opt.allowedValues.join(', ') : '';
    avEl.placeholder = 'Comma-separated, e.g.: easy, medium, hard';
    avEl.addEventListener('change', () => {
      const vals = avEl.value.split(',').map(s=>s.trim()).filter(Boolean);
      b.updateUIOptionDef(opt.id, { allowedValues: vals });
    });
    field('Allowed Values (leave empty for free input)', avEl);

    // Description
    const descEl = document.createElement('input'); descEl.type='text'; descEl.value = opt.description || '';
    descEl.placeholder = 'Optional description';
    descEl.addEventListener('change', () => b.updateUIOptionDef(opt.id, { description: descEl.value }));
    field('Description', descEl);

    // Binding hint
    const hint = document.createElement('div');
    hint.className = 'oe-hint';
    hint.innerHTML = `
      <strong>To bind a Label:</strong> set <code>properties.boundOptionKey = "${opt.key || opt.id}"</code><br>
      <strong>To cycle with Button:</strong> action = <code>option_cycle:${opt.key || opt.id}</code><br>
      <strong>To set with Button:</strong> action = <code>option_set:${opt.key || opt.id}=value</code>
    `;
    wrap.appendChild(hint);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HIGH SCORES TAB
  // ──────────────────────────────────────────────────────────────────────────

  function renderTablesList() {
    const listEl = document.getElementById('oe-hs-list');
    if (!listEl) return;
    const b = bridge(); if (!b) return;
    const tables  = b.getUIHighScoreTables() || [];
    const selId   = _selectedTableId;
    listEl.innerHTML = '';

    if (!tables.length) {
      listEl.innerHTML = '<div class="oe-empty">No tables defined. Click +.</div>';
    } else {
      for (const table of tables) {
        const row = document.createElement('div');
        row.className = 'oe-list-row' + (table.id === selId ? ' active' : '');
        row.dataset.id = table.id;

        const name = document.createElement('span');
        name.className = 'oe-list-key';
        name.textContent = table.label || table.tableId;

        const meta = document.createElement('span');
        meta.className = 'oe-list-type';
        meta.textContent = `top ${table.maxEntries} ${table.sortOrder}`;

        row.appendChild(name); row.appendChild(meta);
        row.addEventListener('click', () => { _selectedTableId = table.id; renderAll(); });
        listEl.appendChild(row);
      }
    }
  }

  function renderTableEditor() {
    const b = bridge(); if (!b) return;
    const tables = b.getUIHighScoreTables() || [];
    const table  = tables.find(t => t.id === _selectedTableId) || null;
    const wrap   = document.getElementById('oe-hs-editor');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!table) {
      wrap.innerHTML = '<div class="oe-empty">Select a table to edit it.</div>';
      return;
    }

    function field(label, el) {
      const row = document.createElement('div'); row.className = 'oe-field';
      const lbl = document.createElement('label'); lbl.textContent = label;
      lbl.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block;';
      row.appendChild(lbl); row.appendChild(el); wrap.appendChild(row);
    }

    // Table ID
    const tidEl = document.createElement('input'); tidEl.type='text';
    tidEl.value = table.tableId || '';
    tidEl.addEventListener('change', () => {
      const clean = tidEl.value.trim().replace(/\s+/g,'_').toLowerCase();
      b.updateUIHighScoreTable(table.id, { tableId: clean }); renderAll();
    });
    field('Table ID (used in scripts)', tidEl);

    // Label
    const lblEl = document.createElement('input'); lblEl.type='text'; lblEl.value = table.label || '';
    lblEl.addEventListener('change', () => b.updateUIHighScoreTable(table.id, { label: lblEl.value }));
    field('Display Label', lblEl);

    // Max entries
    const maxEl = document.createElement('input'); maxEl.type='number'; maxEl.min='1'; maxEl.max='100'; maxEl.step='1';
    maxEl.value = String(table.maxEntries ?? 10);
    maxEl.addEventListener('change', () => b.updateUIHighScoreTable(table.id, { maxEntries: Math.max(1,Math.min(100,Number(maxEl.value)||10)) }));
    field('Max Entries (1–100)', maxEl);

    // Sort order
    const sortEl = document.createElement('select');
    SORT_ORDERS.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s==='desc'?'Descending (highest first)':'Ascending (lowest first)'; sortEl.appendChild(o); });
    sortEl.value = table.sortOrder || 'desc';
    sortEl.addEventListener('change', () => b.updateUIHighScoreTable(table.id, { sortOrder: sortEl.value }));
    field('Sort Order', sortEl);

    // Binding hint
    const hint = document.createElement('div');
    hint.className = 'oe-hint';
    const tid = table.tableId || table.id;
    hint.innerHTML = `
      <strong>To display row in Label:</strong><br>
      &nbsp;&nbsp;<code>properties.boundHighScoreTable = "${tid}"</code><br>
      &nbsp;&nbsp;<code>properties.boundHighScoreRank = 1</code> (1 = top entry)<br>
      <br>
      <strong>Script API:</strong><br>
      &nbsp;&nbsp;<code>engine.HighScores_Add("${tid}", score, "AAA")</code><br>
      &nbsp;&nbsp;<code>engine.HighScores_IsHighScore("${tid}", score)</code><br>
      &nbsp;&nbsp;<code>engine.HighScores_GetEntries("${tid}")</code><br>
      &nbsp;&nbsp;<code>engine.HighScores_Clear("${tid}")</code>
    `;
    wrap.appendChild(hint);
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  function switchTab(tab) {
    _activeTab = tab;
    document.getElementById('oe-tab-options')?.classList.toggle('active', tab === 'options');
    document.getElementById('oe-tab-highscores')?.classList.toggle('active', tab === 'highscores');
    document.getElementById('oe-options-pane')?.style.setProperty('display', tab === 'options' ? 'flex' : 'none');
    document.getElementById('oe-highscores-pane')?.style.setProperty('display', tab === 'highscores' ? 'flex' : 'none');
    renderAll();
  }

  function renderAll() {
    renderOptionsList();
    renderOptionEditor();
    renderTablesList();
    renderTableEditor();
  }

  // ── Init / bindings ────────────────────────────────────────────────────────
  function _bindOnce() {
    if (_initialized) return;
    _initialized = true;

    // Tab buttons
    document.getElementById('oe-tab-options')?.addEventListener('click', () => switchTab('options'));
    document.getElementById('oe-tab-highscores')?.addEventListener('click', () => switchTab('highscores'));

    // Option toolbar
    document.getElementById('oe-btn-add-opt')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const api = window.RokuSchemaResources;
      const def = api?.createDefaultUIOptionDef
        ? api.createDefaultUIOptionDef(Date.now())
        : { id:`option_${Date.now()}`, key:`option_${Date.now()}`, label:'New Option', optionType:'string', defaultValue:'', allowedValues:[] };
      const added = b.addUIOptionDef(def);
      _selectedOptId = added.id;
      renderAll();
    });

    document.getElementById('oe-btn-add-builtin')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const api = window.RokuSchemaResources;
      const existing = new Set((b.getUIOptionDefs()||[]).map(d=>d.key));
      let added = 0;
      for (const preset of BUILTIN_OPTION_KEYS) {
        if (existing.has(preset.key)) continue;
        const def = api?.createDefaultUIOptionDef ? api.createDefaultUIOptionDef(Date.now()+added) : {};
        const merged = Object.assign(def, { key: preset.key, label: preset.label, optionType: preset.type, defaultValue: preset.defaultValue, allowedValues: preset.allowedValues });
        b.addUIOptionDef(merged);
        added++;
      }
      renderAll();
    });

    document.getElementById('oe-btn-del-opt')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      if (!_selectedOptId) return;
      if (!confirm('Delete this option?')) return;
      b.deleteUIOptionDef(_selectedOptId);
      _selectedOptId = null;
      renderAll();
    });

    // High score toolbar
    document.getElementById('oe-btn-add-hs')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const api = window.RokuSchemaResources;
      const tbl = api?.createDefaultUIHighScoreTable
        ? api.createDefaultUIHighScoreTable(Date.now())
        : { id:`scores_${Date.now()}`, tableId:`scores_${Date.now()}`, label:'High Scores', maxEntries:10, sortOrder:'desc' };
      const added = b.addUIHighScoreTable(tbl);
      _selectedTableId = added.id;
      renderAll();
    });

    document.getElementById('oe-btn-del-hs')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      if (!_selectedTableId) return;
      if (!confirm('Delete this table?')) return;
      b.deleteUIHighScoreTable(_selectedTableId);
      _selectedTableId = null;
      renderAll();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function render() {
    _bindOnce();
    switchTab(_activeTab);
  }

  RGE_ROOT.RGEOptionsEditor = { render };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
