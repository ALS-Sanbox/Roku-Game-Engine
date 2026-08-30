globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * memory_inspector_panel.js — RGE v91
 *
 * Editor panel showing real-time Roku memory estimates.
 * Updates when assets change or when explicitly refreshed.
 */

(function () {
  'use strict';

  class MemoryInspectorPanel {
    constructor() {
      this._container = null;
      this._lastReport = null;
      this._unsubs = [];
    }

    mount(containerEl) {
      this._container = containerEl;
      this._buildDOM();
      this._refresh();
      // Auto-refresh when assets change
      if (RGE_ROOT.RGEBus) {
        this._unsubs.push(
          RGE_ROOT.RGEBus.on('asset:registered', () => this._scheduleRefresh()),
          RGE_ROOT.RGEBus.on('asset:unregistered', () => this._scheduleRefresh()),
          RGE_ROOT.RGEBus.on('atlas:built',       () => this._scheduleRefresh()),
        );
      }
      // Register with scheduler for throttled panel redraws
      if (RGE_ROOT.RGEScheduler) {
        RGE_ROOT.RGEScheduler.register(
          'memory_inspector', () => this._redraw(), null, 500, containerEl
        );
      }
    }

    unmount() {
      this._unsubs.forEach(fn => { try { fn(); } catch(_){} });
      this._unsubs = [];
      if (RGE_ROOT.RGEScheduler) RGE_ROOT.RGEScheduler.unregister('memory_inspector');
      if (this._container) this._container.innerHTML = '';
      this._container = null;
    }

    _buildDOM() {
      this._container.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;background:#1c1e26;color:#dde3f0;font-family:'Noto Sans','Segoe UI',system-ui,sans-serif;font-size:12px;">
          <div style="display:flex;align-items:center;padding:8px 10px;background:#252830;border-bottom:1px solid #3a3f52;flex-shrink:0;gap:8px;">
            <span style="font-size:14px;">🧠</span>
            <span style="font-weight:700;">Memory Inspector</span>
            <div style="flex:1;"></div>
            <button class="mi-refresh" style="background:#3a3f52;border:none;color:#dde3f0;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px;">Refresh</button>
          </div>
          <div class="mi-body" style="flex:1;overflow-y:auto;padding:10px;"></div>
        </div>
      `;
      this._container.querySelector('.mi-refresh').addEventListener('click', () => this._refresh());
    }

    _scheduleRefresh() {
      if (RGE_ROOT.RGEScheduler) RGE_ROOT.RGEScheduler.invalidate('memory_inspector');
      else this._refresh();
    }

    _refresh() {
      const budget = RGE_ROOT.RGEMemoryBudget && RGE_ROOT.RGEMemoryBudget.budget;
      const registry = RGE_ROOT.RGEAssetRegistry;
      if (!budget || !registry) { this._lastReport = null; this._redraw(); return; }

      budget.clear();

      // Populate from asset registry
      for (const kind of ['texture', 'spritesheet']) {
        const entries = registry.getByKind(kind);
        for (const e of entries) {
          const w = e.meta.width || 256;
          const h = e.meta.height || 256;
          budget.addTexture(e.guid, e.name, w, h);
        }
      }

      for (const e of registry.getByKind('atlas')) {
        const w = e.meta.atlasWidth || 1024;
        const h = e.meta.atlasHeight || 1024;
        budget.addAtlas(e.guid, e.name, w, h);
      }

      for (const e of registry.getByKind('audio')) {
        const dur = e.meta.durationSec || 5;
        const fmt = e.meta.format || 'mp3';
        budget.addAudio(e.guid, e.name, fmt, dur);
      }

      this._lastReport = budget.analyze();
      this._redraw();
    }

    _redraw() {
      const body = this._container && this._container.querySelector('.mi-body');
      if (!body) return;
      const r = this._lastReport;
      if (!r) { body.innerHTML = '<div style="color:#8a93b0;">No data — click Refresh.</div>'; return; }

      const bar = (used, total) => {
        const pct = Math.min(100, total > 0 ? Math.round((used / total) * 100) : 0);
        const color = pct >= 100 ? '#e05555' : pct >= 80 ? '#e0a030' : '#4caf7d';
        return `<div style="background:#2a2d38;border-radius:3px;height:6px;overflow:hidden;margin-top:3px;">
          <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s;"></div>
        </div><div style="font-size:10px;color:#8a93b0;margin-top:2px;">${Math.round(used)} / ${Math.round(total)} KB (${pct}%)</div>`;
      };

      const warnHtml = r.warnings.length > 0
        ? r.warnings.map(w => `<div style="color:#e0a030;font-size:11px;">⚠ ${escHtml(w)}</div>`).join('')
        : '';
      const errHtml = r.errors.length > 0
        ? r.errors.map(e => `<div style="color:#e05555;font-size:11px;">✗ ${escHtml(e)}</div>`).join('')
        : '';

      body.innerHTML = `
        <div style="margin-bottom:10px;">
          <div style="font-size:10px;font-weight:600;color:#6bc5f8;letter-spacing:.06em;">TOTAL APP RAM</div>
          ${bar(r.totalKb, r.budgetKb)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div>
            <div style="font-size:10px;color:#8a93b0;">Textures</div>
            ${bar(r.textureKb, RGE_ROOT.RGEMemoryBudget.LIMITS.textureKb)}
          </div>
          <div>
            <div style="font-size:10px;color:#8a93b0;">Atlas</div>
            ${bar(r.atlasKb, RGE_ROOT.RGEMemoryBudget.LIMITS.atlasKb)}
          </div>
          <div>
            <div style="font-size:10px;color:#8a93b0;">Audio</div>
            ${bar(r.audioKb, RGE_ROOT.RGEMemoryBudget.LIMITS.audioKb)}
          </div>
          <div>
            <div style="font-size:10px;color:#8a93b0;">Scene</div>
            ${bar(r.sceneKb, RGE_ROOT.RGEMemoryBudget.LIMITS.sceneKb)}
          </div>
        </div>
        ${warnHtml}${errHtml}
        ${r.entries.length > 0 ? `
        <div style="font-size:10px;font-weight:600;color:#6bc5f8;letter-spacing:.06em;margin-top:10px;margin-bottom:6px;">TOP ASSETS</div>
        ${r.entries.slice(0,12).map(e => `
          <div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid #252830;">
            <span style="flex:1;color:#dde3f0;">${escHtml(e.label)}</span>
            <span style="color:#8a93b0;font-size:10px;">${e.category}</span>
            <span style="color:#dde3f0;text-align:right;min-width:50px;">${e.kb} KB</span>
          </div>`).join('')}
        ` : ''}
      `;
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  RGE_ROOT.RGEMemoryInspectorPanel = { MemoryInspectorPanel };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
