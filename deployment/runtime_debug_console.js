globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * runtime_debug_console.js — RGE v91
 *
 * Editor panel that aggregates:
 *  - Live log stream from RokuDeviceBridge
 *  - Crash / error detection with stack highlighting
 *  - FPS / frame time graph (ring buffer)
 *  - Remote memory stats overlay
 *  - Filter / search across all log lines
 *
 * Renders into a DOM container provided by the editor dock system.
 * Uses throttled redraws via RenderScheduler to avoid blocking the editor.
 */

(function () {
  'use strict';

  const MAX_DISPLAY_LINES = 500;
  const FPS_RING_SIZE     = 120; // 2 minutes at 1-sample/sec
  const LEVEL_COLORS = {
    ERROR:   'var(--red)',
    WARN:    'var(--yellow)',
    INFO:    'var(--accent-2)',
    DEBUG:   'var(--text-dim)',
    DEFAULT: 'var(--text)',
  };
  const ERROR_PATTERNS = [/error:/i, /exception:/i, /crash/i, /undefined/i, /nil/i, /invalid/i];
  const WARN_PATTERNS  = [/warning:/i, /warn:/i, /deprecated/i];

  function classifyLine(line) {
    if (ERROR_PATTERNS.some(r => r.test(line))) return 'ERROR';
    if (WARN_PATTERNS.some(r => r.test(line)))  return 'WARN';
    if (/\[info\]/i.test(line))  return 'INFO';
    if (/\[debug\]/i.test(line)) return 'DEBUG';
    return 'DEFAULT';
  }

  // ── FPS ring buffer ────────────────────────────────────────────────────────

  class FpsRing {
    constructor(size) {
      this._buf = new Array(size).fill(0);
      this._head = 0;
      this._size = size;
    }
    push(fps) {
      this._buf[this._head] = fps;
      this._head = (this._head + 1) % this._size;
    }
    toArray() {
      const out = new Array(this._size);
      for (let i = 0; i < this._size; i++) {
        out[i] = this._buf[(this._head + i) % this._size];
      }
      return out;
    }
    avg() {
      const a = this.toArray().filter(v => v > 0);
      return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    }
  }

  // ── RuntimeDebugConsole ────────────────────────────────────────────────────

  class RuntimeDebugConsole {
    constructor() {
      this._container = null;
      this._lineBuffer = [];   // { t, level, line }
      this._filter = '';
      this._filterLevel = 'ALL'; // 'ALL' | 'ERROR' | 'WARN' | 'INFO'
      this._fpsRing = new FpsRing(FPS_RING_SIZE);
      this._lastStats = null;
      this._autoScroll = true;
      this._redrawScheduled = false;
      this._logUnsub = null;
      this._statsUnsub = null;

      // Subscribe to bridge events
      this._logUnsub = RGE_ROOT.RGEDeviceBridge
        ? RGE_ROOT.RGEDeviceBridge.onLog((entry) => this._onLog(entry))
        : null;
      this._statsUnsub = RGE_ROOT.RGEDeviceBridge
        ? RGE_ROOT.RGEDeviceBridge.onStats((stats) => this._onStats(stats))
        : null;

      // Also listen for RGEBus
      this._bindBus();
    }

    _bindBus() {
      if (!RGE_ROOT.RGEBus) return;
      RGE_ROOT.RGEBus.on('bridge:log',   (e) => this._onLog(e));
      RGE_ROOT.RGEBus.on('bridge:stats', (s) => this._onStats(s));
    }

    // ── Panel lifecycle ───────────────────────────────────────────────────

    mount(containerEl) {
      this._container = containerEl;
      this._buildDOM();
      this._redraw();
    }

    unmount() {
      if (this._logUnsub) this._logUnsub();
      if (this._statsUnsub) this._statsUnsub();
      if (this._container) this._container.innerHTML = '';
      this._container = null;
    }

    // ── DOM ───────────────────────────────────────────────────────────────

    _buildDOM() {
      const c = this._container;
      if (!c) return;
      c.innerHTML = `
        <div class="rdc-root" style="display:flex;flex-direction:column;height:100%;background:var(--viewport);color:var(--text);font-family:monospace;font-size:12px;">
          <div class="rdc-toolbar" style="display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--bg);border-bottom:1px solid var(--panel-2);flex-shrink:0;">
            <span style="font-weight:700;color:var(--accent-2);font-size:11px;">RUNTIME CONSOLE</span>
            <input class="rdc-filter" placeholder="Filter…" style="flex:1;background:var(--panel);border:1px solid var(--border);color:var(--text);padding:2px 6px;border-radius:3px;font-size:11px;" />
            <select class="rdc-level" style="background:var(--panel);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:11px;">
              <option value="ALL">All</option>
              <option value="ERROR">Errors</option>
              <option value="WARN">Warnings</option>
              <option value="INFO">Info</option>
            </select>
            <button class="rdc-clear" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim);padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px;">Clear</button>
            <label style="display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-dim);cursor:pointer;">
              <input type="checkbox" class="rdc-autoscroll" checked /> Auto
            </label>
          </div>
          <div class="rdc-stats" style="display:flex;gap:12px;padding:3px 8px;background:var(--bg);border-bottom:1px solid var(--panel-2);flex-shrink:0;font-size:11px;color:var(--text-dim);">
            <span class="rdc-fps">FPS: —</span>
            <span class="rdc-mem">MEM: —</span>
            <span class="rdc-errcnt">Errors: 0</span>
          </div>
          <div class="rdc-lines" style="flex:1;overflow-y:auto;padding:4px 8px;"></div>
        </div>
      `;

      const filter = c.querySelector('.rdc-filter');
      filter.addEventListener('input', () => { this._filter = filter.value; this._redraw(); });

      const level = c.querySelector('.rdc-level');
      level.addEventListener('change', () => { this._filterLevel = level.value; this._redraw(); });

      c.querySelector('.rdc-clear').addEventListener('click', () => {
        this._lineBuffer = [];
        if (RGE_ROOT.RGEDeviceBridge) RGE_ROOT.RGEDeviceBridge.clearLogs();
        this._redraw();
      });

      const auto = c.querySelector('.rdc-autoscroll');
      auto.addEventListener('change', () => { this._autoScroll = auto.checked; });
    }

    // ── Data ingestion ────────────────────────────────────────────────────

    _onLog(entry) {
      const level = classifyLine(entry.line);
      this._lineBuffer.push({ t: entry.t, level, line: entry.line });
      if (this._lineBuffer.length > MAX_DISPLAY_LINES * 2) {
        this._lineBuffer = this._lineBuffer.slice(-MAX_DISPLAY_LINES);
      }
      this._scheduleRedraw();
    }

    _onStats(stats) {
      this._lastStats = stats;
      if (stats.fps != null) this._fpsRing.push(stats.fps);
      this._updateStatsBar();
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    _scheduleRedraw() {
      if (this._redrawScheduled) return;
      this._redrawScheduled = true;
      requestAnimationFrame(() => {
        this._redrawScheduled = false;
        this._redraw();
      });
    }

    _redraw() {
      if (!this._container) return;
      const linesEl = this._container.querySelector('.rdc-lines');
      if (!linesEl) return;

      const filterText = this._filter.toLowerCase();
      const level = this._filterLevel;

      const visible = this._lineBuffer
        .filter(e => {
          if (level !== 'ALL' && e.level !== level) return false;
          if (filterText && !e.line.toLowerCase().includes(filterText)) return false;
          return true;
        })
        .slice(-MAX_DISPLAY_LINES);

      const html = visible.map(e => {
        const color = LEVEL_COLORS[e.level] || LEVEL_COLORS.DEFAULT;
        const line = escHtml(e.line);
        const time = new Date(e.t).toTimeString().slice(0, 8);
        return `<div style="color:${color};line-height:1.5;white-space:pre-wrap;">`
          + `<span style="color:var(--border);user-select:none;">${time} </span>${line}</div>`;
      }).join('');

      linesEl.innerHTML = html;
      if (this._autoScroll) linesEl.scrollTop = linesEl.scrollHeight;

      this._updateStatsBar();
    }

    _updateStatsBar() {
      if (!this._container) return;
      const fps = this._fpsRing.avg();
      const fpsEl = this._container.querySelector('.rdc-fps');
      const memEl = this._container.querySelector('.rdc-mem');
      const errEl = this._container.querySelector('.rdc-errcnt');
      if (fpsEl) fpsEl.textContent = `FPS: ${fps > 0 ? fps.toFixed(1) : '—'}`;
      if (memEl && this._lastStats && this._lastStats.memKb != null) {
        memEl.textContent = `${this._lastStats.estimated ? 'CACHE ESTIMATE' : 'MEM'}: ${Math.round(this._lastStats.memKb / 1024)} MB`;
      }
      const errorCount = this._lineBuffer.filter(e => e.level === 'ERROR').length;
      if (errEl) {
        errEl.textContent = `Errors: ${errorCount}`;
        errEl.style.color = errorCount > 0 ? 'var(--red)' : 'var(--text-dim)';
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGERuntimeDebugConsole = {
    console: new RuntimeDebugConsole(),
    RuntimeDebugConsole,
  };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
