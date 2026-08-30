globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * ui_transition_editor.js — RGE Phase 7: Transition Preset Editor Panel
 *
 * Bottom-panel editor for creating and previewing UITransitionPreset resources.
 * Features:
 *   - Preset list (add / rename / duplicate / delete)
 *   - All transition settings (type, duration, easing, color, flags)
 *   - Live animated preview canvas showing the exact transition effect
 *   - Loading screen preview (progress bar + spinner + label)
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const TRANSITION_TYPES = ['instant','fade','slide_left','slide_right','slide_up','slide_down','wipe'];
  const EASINGS          = ['linear','ease_in','ease_out','ease_in_out','elastic_out'];

  const TYPE_ICONS = {
    instant:'⚡', fade:'◑', slide_left:'◀', slide_right:'▶',
    slide_up:'▲', slide_down:'▼', wipe:'▷'
  };

  // ── Bridge helpers ─────────────────────────────────────────────────────────
  // bridge → RGE_ROOT.RGEEditorBridge.bridge (shared, see editor/editor_bridge.js)
  const bridge = () => RGE_ROOT.RGEEditorBridge ? RGE_ROOT.RGEEditorBridge.bridge() : (RGE_ROOT.RGESceneBridge || null);
  function presets()  { return bridge()?.getUITransitionPresets() ?? []; }
  function selId()    { return bridge()?.getSelectedUITransitionPresetId() ?? null; }
  function selPreset(){ const id = selId(); return id ? bridge()?.getUITransitionPresetById(id) : null; }

  // ── Canvas / animation ─────────────────────────────────────────────────────
  let _canvas = null;
  let _ctx    = null;
  let _rafId  = null;
  let _dirty  = true;

  // Animation state for preview
  let _previewT       = 0;     // 0→1 for "out" phase, 1→0 for "in" phase
  let _previewPhase   = 'out'; // 'out' | 'hold' | 'in' | 'done'
  let _previewElapsed = 0;
  let _previewRunning = false;
  let _previewHoldMs  = 400;   // ms to hold at full coverage
  let _lastTimestamp  = 0;

  function startPreview() {
    _previewT       = 0;
    _previewPhase   = 'out';
    _previewElapsed = 0;
    _previewRunning = true;
    _lastTimestamp  = 0;
    markDirty();
  }

  function tickPreview(timestamp) {
    if (!_previewRunning) return;
    if (_lastTimestamp === 0) _lastTimestamp = timestamp;
    const dt = Math.min((timestamp - _lastTimestamp) / 1000, 0.1);
    _lastTimestamp = timestamp;

    const preset = selPreset();
    const dur    = preset ? Number(preset.duration) || 0.35 : 0.35;
    const half   = dur * 0.5;

    if (_previewPhase === 'out') {
      _previewElapsed += dt;
      _previewT = Math.min(_previewElapsed / half, 1);
      if (_previewElapsed >= half) {
        _previewPhase   = 'hold';
        _previewElapsed = 0;
        _previewT       = 1;
      }
    } else if (_previewPhase === 'hold') {
      _previewElapsed += dt * 1000; // ms
      if (_previewElapsed >= _previewHoldMs) {
        _previewPhase   = 'in';
        _previewElapsed = 0;
      }
    } else if (_previewPhase === 'in') {
      _previewElapsed += dt;
      _previewT = Math.max(1 - _previewElapsed / half, 0);
      if (_previewElapsed >= half) {
        _previewPhase   = 'done';
        _previewRunning = false;
        _previewT       = 0;
      }
    }
    markDirty();
  }

  // ── Easing ─────────────────────────────────────────────────────────────────
  function ease(t, easing) {
    t = Math.max(0, Math.min(1, t));
    switch (easing) {
      case 'ease_in':     return t * t;
      case 'ease_out':    return 1 - (1-t)*(1-t);
      case 'ease_in_out': return t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t);
      case 'elastic_out': {
        if (t === 0 || t === 1) return t;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10*t) * Math.sin((t*10 - 10.75) * c4) + 1;
      }
      default: return t; // linear
    }
  }

  // ── Hex color → RGBA components ────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    const s = (hex || '#000000').replace('#', '');
    const r = parseInt(s.slice(0,2)||'00', 16);
    const g = parseInt(s.slice(2,4)||'00', 16);
    const b = parseInt(s.slice(4,6)||'00', 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Canvas draw ────────────────────────────────────────────────────────────
  function draw() {
    if (!_canvas || !_ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cw  = _canvas.offsetWidth;
    const ch  = _canvas.offsetHeight;
    if (!cw || !ch) return;
    if (_canvas.width !== cw*dpr || _canvas.height !== ch*dpr) {
      _canvas.width  = cw*dpr; _canvas.height = ch*dpr;
      _canvas.style.width = cw+'px'; _canvas.style.height = ch+'px';
    }
    const ctx = _ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const preset = selPreset();

    // Checker background (represents "content behind the transition")
    const sz = 14;
    for (let y = 0; y < ch; y += sz)
      for (let x = 0; x < cw; x += sz) {
        ctx.fillStyle = ((Math.floor(x/sz)+Math.floor(y/sz))%2===0) ? '#1e2436':'#161925';
        ctx.fillRect(x, y, sz, sz);
      }

    // Label for the "content behind"
    ctx.fillStyle = 'rgba(100,120,160,0.5)';
    ctx.font = '11px "Noto Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[ content behind transition ]', cw/2, ch/2);
    ctx.textAlign = 'left';

    if (!preset) {
      ctx.fillStyle = 'rgba(130,150,190,0.5)';
      ctx.font = '13px "Noto Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select or create a transition preset', cw/2, ch/2 + 30);
      ctx.textAlign = 'left';
      return;
    }

    const tt    = preset.transType || 'fade';
    const color = preset.color || '#000000';
    const t     = ease(_previewT, preset.easing || 'ease_in_out');
    const alpha = t;

    if (alpha > 0.001) {
      if (tt === 'instant' || tt === 'fade') {
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.fillRect(0, 0, cw, ch);

      } else if (tt === 'slide_left') {
        const x = Math.round(cw * (1 - t));
        ctx.fillStyle = hexToRgba(color, 1);
        ctx.fillRect(x, 0, cw-x, ch);

      } else if (tt === 'slide_right') {
        const w2 = Math.round(cw * t);
        ctx.fillStyle = hexToRgba(color, 1);
        ctx.fillRect(0, 0, w2, ch);

      } else if (tt === 'slide_up') {
        const y = Math.round(ch * (1 - t));
        ctx.fillStyle = hexToRgba(color, 1);
        ctx.fillRect(0, y, cw, ch-y);

      } else if (tt === 'slide_down') {
        const h2 = Math.round(ch * t);
        ctx.fillStyle = hexToRgba(color, 1);
        ctx.fillRect(0, 0, cw, h2);

      } else if (tt === 'wipe') {
        const w2 = Math.round(cw * t);
        ctx.fillStyle = hexToRgba(color, 1);
        ctx.fillRect(0, 0, w2, ch);
      }
    }

    // Loading screen overlay during hold phase
    if (_previewPhase === 'hold' && preset.waitForLoad) {
      _drawLoadingPreview(ctx, cw, ch, preset);
    }

    // Status label
    ctx.fillStyle = 'rgba(200,220,255,0.8)';
    ctx.font = 'bold 11px "Noto Sans", sans-serif';
    const phaseLabel = _previewRunning ? `▶ ${_previewPhase} (t=${_previewT.toFixed(2)})` : 'Press ▶ to preview';
    ctx.fillText(phaseLabel, 8, ch - 8);
  }

  function _drawLoadingPreview(ctx, cw, ch, preset) {
    const label = preset.loadingLabel || 'Loading...';
    const progress = 0.65; // demo value
    const barW = Math.min(300, cw - 60);
    const barH = 12;
    const bx = (cw - barW) / 2;
    const by = ch / 2 + 30;

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, cw, ch);

    // Label
    ctx.fillStyle = '#e7eef7';
    ctx.font = 'bold 14px "Noto Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cw/2, ch/2);

    if (preset.showLoadingProgress) {
      // Track
      ctx.fillStyle = '#1a2638';
      ctx.fillRect(bx, by, barW, barH);
      // Fill
      ctx.fillStyle = '#4a90d9';
      ctx.fillRect(bx, by, Math.round(barW * progress), barH);
      // Border
      ctx.strokeStyle = '#5e7594';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
      // Pct
      ctx.fillStyle = '#8899aa';
      ctx.font = '10px "Noto Sans", sans-serif';
      ctx.fillText('65%', cw/2, by + barH + 14);
    }
    ctx.textAlign = 'left';
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────
  function startLoop() {
    if (_rafId) return;
    function tick(ts) {
      _rafId = null;
      if (_previewRunning) { tickPreview(ts); _dirty = true; }
      if (_dirty) { draw(); _dirty = false; }
      // Only re-queue when there is work to do (preview running or explicit dirty).
      // markDirty() calls startLoop() to resume.
      if (_previewRunning || _dirty) _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);
  }

  // markDirty uses local _dirty flag; also restarts the idle loop.
  function markDirty() { _dirty = true; startLoop(); }

  // ── Preset list ────────────────────────────────────────────────────────────
  function renderPresetList() {
    const listEl = document.getElementById('te-preset-list');
    if (!listEl) return;
    const b = bridge(); if (!b) return;
    const all = presets();
    const sel = selId();
    listEl.innerHTML = '';

    if (!all.length) {
      listEl.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-faint)">No presets. Click + to add.</div>';
      return;
    }

    for (const preset of all) {
      const row = document.createElement('div');
      row.className = 'te-preset-row' + (preset.id === sel ? ' active' : '');

      const icon = document.createElement('span');
      icon.style.cssText = 'flex-shrink:0;font-size:13px;min-width:18px;text-align:center;';
      icon.textContent = TYPE_ICONS[preset.transType] || '◑';

      const name = document.createElement('span');
      name.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;';
      name.textContent = preset.name;

      const dur = document.createElement('span');
      dur.style.cssText = 'font-size:10px;color:var(--text-faint);flex-shrink:0;';
      dur.textContent = `${Number(preset.duration||0.35).toFixed(2)}s`;

      row.appendChild(icon); row.appendChild(name); row.appendChild(dur);
      row.addEventListener('click', () => { b.setSelectedUITransitionPresetId(preset.id); renderAll(); });
      listEl.appendChild(row);
    }
  }

  // ── Controls pane ──────────────────────────────────────────────────────────
  function renderControlsPane() {
    const preset = selPreset();

    const set = (id, val, prop = 'value') => { const el = document.getElementById(id); if (el) el[prop] = val; };
    set('te-name',         preset?.name         || '');
    set('te-type',         preset?.transType     || 'fade');
    set('te-duration',     preset?.duration      ?? 0.35);
    set('te-easing',       preset?.easing        || 'ease_in_out');
    set('te-color',        preset?.color         || '#000000');
    set('te-block-input',  preset?.blockInput !== false, 'checked');
    set('te-wait-load',    preset?.waitForLoad   === true, 'checked');
    set('te-loading-label',preset?.loadingLabel  || 'Loading...');
    set('te-show-progress',preset?.showLoadingProgress !== false, 'checked');
    set('te-fake-progress',preset?.fakeProgress  === true, 'checked');
    set('te-fake-rate',    preset?.fakeProgressRate ?? 0.6);

    const loadSection = document.getElementById('te-load-section');
    if (loadSection) loadSection.style.display = preset?.waitForLoad ? '' : 'none';
  }

  function renderAll() {
    renderPresetList();
    renderControlsPane();
    markDirty();
  }

  // ── Bindings ───────────────────────────────────────────────────────────────
  let _initialized = false;

  function _bindOnce() {
    if (_initialized) return;
    _initialized = true;

    _canvas = document.getElementById('te-canvas');
    _ctx    = _canvas?.getContext('2d');
    if (_canvas) {
      const ro = new ResizeObserver(() => markDirty());
      ro.observe(_canvas.parentElement || _canvas);
    }
    startLoop();

    // Add preset
    document.getElementById('te-btn-add')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const resourcesApi = window.RokuSchemaResources;
      const p = resourcesApi?.createDefaultUITransitionPreset
        ? resourcesApi.createDefaultUITransitionPreset(Date.now())
        : { id:`transition_${Date.now()}`, name:'New Transition', transType:'fade', duration:0.35, easing:'ease_in_out', color:'#000000', blockInput:true, waitForLoad:false };
      b.addUITransitionPreset(p);
      const name = prompt('Preset name:', p.name);
      if (name?.trim() && name.trim() !== p.name) b.updateUITransitionPreset(p.id, { name: name.trim() });
      renderAll();
    });

    // Duplicate
    document.getElementById('te-btn-dupe')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const id = selId(); if (!id) return;
      b.duplicateUITransitionPreset(id); renderAll();
    });

    // Delete
    document.getElementById('te-btn-delete')?.addEventListener('click', () => {
      const b = bridge(); if (!b) return;
      const p = selPreset(); if (!p) return;
      if (!confirm(`Delete "${p.name}"?`)) return;
      b.deleteUITransitionPreset(p.id); renderAll();
    });

    // Preview button
    document.getElementById('te-btn-preview')?.addEventListener('click', startPreview);

    // Field change handler factory
    function onField(elId, propKey, coerce) {
      document.getElementById(elId)?.addEventListener('change', () => {
        const b = bridge(); if (!b) return;
        const id = selId(); if (!id) return;
        const el = document.getElementById(elId);
        let val = el.type === 'checkbox' ? el.checked : el.value;
        if (coerce === 'float')   val = parseFloat(val) || 0;
        if (coerce === 'string')  val = String(val);
        b.updateUITransitionPreset(id, { [propKey]: val });
        if (propKey === 'waitForLoad') {
          const loadSection = document.getElementById('te-load-section');
          if (loadSection) loadSection.style.display = val ? '' : 'none';
        }
        renderPresetList(); markDirty();
      });
    }

    onField('te-name',         'name',                'string');
    onField('te-type',         'transType',           'string');
    onField('te-duration',     'duration',            'float');
    onField('te-easing',       'easing',              'string');
    onField('te-color',        'color',               'string');
    onField('te-block-input',  'blockInput',          null);
    onField('te-wait-load',    'waitForLoad',         null);
    onField('te-loading-label','loadingLabel',        'string');
    onField('te-show-progress','showLoadingProgress', null);
    onField('te-fake-progress','fakeProgress',        null);
    onField('te-fake-rate',    'fakeProgressRate',    'float');
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function render() {
    _bindOnce();
    renderAll();
  }

  RGE_ROOT.RGETransitionEditor = { render, markDirty };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
