globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * roku_device_bridge.js — RGE v91
 *
 * Transport layer between the editor and a running Roku device.
 * Handles:
 *  - ECP (External Control Protocol) REST calls
 *  - Debug log streaming (telnet to port 8085)
 *  - FPS / performance stats polling
 *  - Remote screenshot capture
 *  - Runtime memory stats query
 *  - Auto-reconnect with exponential back-off
 *
 * NOTE: Raw TCP log streaming requires Electron's net module on the
 *       main process side.  This module provides the renderer-side API;
 *       the IPC bridge in main.js forwards the data via 'roku-debug-log' events.
 */

(function () {
  'use strict';

  const ECP_PORT = 8060;
  const RECONNECT_BASE_MS  = 1000;
  const RECONNECT_MAX_MS   = 30000;
  const STATS_POLL_INTERVAL = 2000;

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── RokuDeviceBridge ───────────────────────────────────────────────────────

  class RokuDeviceBridge {
    constructor() {
      this._ip = null;
      this._username = 'rokudev';
      this._password = '';
      this._connected = false;
      this._logBuffer = [];
      this._statsPollTimer = null;
      this._reconnectTimer = null;
      this._reconnectAttempts = 0;
      this._maxLogBuffer = 2000;
      this._logListeners = [];
      this._statsListeners = [];
      this._lastStats = null;

      // Subscribe to log events forwarded from main process
      try {
        if (window.electronAPI && window.electronAPI.onSideloadProgress) {
          window.electronAPI.onSideloadProgress((data) => {
            if (data && data.type === 'log') this._handleLogLine(data.line);
            if (data && data.type === 'stats') this._handleStats(data.stats);
          });
        }
      } catch (_) {}
    }

    // ── Connection ────────────────────────────────────────────────────────

    connect(ip, username, password) {
      this._ip = ip;
      this._username = username || 'rokudev';
      this._password = password || '';
      this._reconnectAttempts = 0;
      this._attemptConnect();
    }

    _attemptConnect() {
      this._ping().then(ok => {
        if (ok) {
          this._connected = true;
          this._reconnectAttempts = 0;
          emit('bridge:connected', { ip: this._ip });
          this._startStatsPoll();
        } else {
          this._scheduleReconnect();
        }
      });
    }

    _scheduleReconnect() {
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempts),
        RECONNECT_MAX_MS
      );
      this._reconnectAttempts++;
      emit('bridge:reconnecting', { ip: this._ip, attempt: this._reconnectAttempts, delayMs: delay });
      this._reconnectTimer = setTimeout(() => this._attemptConnect(), delay);
    }

    disconnect() {
      clearTimeout(this._reconnectTimer);
      clearInterval(this._statsPollTimer);
      this._statsPollTimer = null;
      this._reconnectTimer = null;
      this._connected = false;
      emit('bridge:disconnected', { ip: this._ip });
    }

    get connected() { return this._connected; }

    // ── ECP calls ─────────────────────────────────────────────────────────

    async _ecpGet(path) {
      if (!this._ip) throw new Error('No device IP set');
      const url = `http://${this._ip}:${ECP_PORT}${path}`;
      const resp = await fetch(url, { method: 'GET' });
      return resp;
    }

    async _ping() {
      try {
        const r = await this._ecpGet('/query/device-info');
        return r.ok;
      } catch (_) { return false; }
    }

    async screenshot() {
      try {
        const r = await this._ecpGet('/capture-screens');
        if (!r.ok) return null;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        emit('bridge:screenshot', { url });
        return url;
      } catch (err) {
        emit('bridge:error', { op: 'screenshot', error: String(err) });
        return null;
      }
    }

    async queryDeviceInfo() {
      try {
        const r = await this._ecpGet('/query/device-info');
        if (!r.ok) return null;
        const text = await r.text();
        // Parse XML response for key fields
        const extract = (tag) => {
          const m = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
          return m ? m[1] : '';
        };
        const info = {
          model:           extract('model-name'),
          serial:          extract('serial-number'),
          firmwareVersion: extract('software-version'),
          softwareBuild:   extract('software-build'),
          screenWidth:     extract('ui-resolution-x'),
          screenHeight:    extract('ui-resolution-y'),
        };
        emit('bridge:device_info', info);
        return info;
      } catch (err) {
        emit('bridge:error', { op: 'device_info', error: String(err) });
        return null;
      }
    }

    // ── Log streaming ─────────────────────────────────────────────────────

    _handleLogLine(line) {
      const entry = { t: Date.now(), line: String(line || '') };
      this._logBuffer.push(entry);
      if (this._logBuffer.length > this._maxLogBuffer) {
        this._logBuffer.shift();
      }
      for (const fn of this._logListeners) {
        try { fn(entry); } catch (_) {}
      }
      emit('bridge:log', entry);
    }

    onLog(fn) {
      this._logListeners.push(fn);
      return () => { this._logListeners = this._logListeners.filter(f => f !== fn); };
    }

    getLogs() { return [...this._logBuffer]; }
    clearLogs() { this._logBuffer = []; emit('bridge:logs_cleared', {}); }

    // ── Stats polling ─────────────────────────────────────────────────────

    _startStatsPoll() {
      if (this._statsPollTimer) return;
      this._statsPollTimer = setInterval(() => this._pollStats(), STATS_POLL_INTERVAL);
    }

    async _pollStats() {
      if (!this._connected) return;
      try {
        const r = await this._ecpGet('/query/active-app');
        if (!r.ok) { this._connected = false; this._scheduleReconnect(); return; }
        const text = await r.text();
        // Parse FPS / memory if available in ECP response
        const fpsMatch = text.match(/fps[=:\s]+(\d+\.?\d*)/i);
        const memMatch = text.match(/mem[=:\s]+(\d+)/i);
        const stats = {
          fps:   fpsMatch ? parseFloat(fpsMatch[1]) : null,
          memKb: memMatch ? parseInt(memMatch[1], 10) : null,
          polledAt: Date.now(),
        };
        this._lastStats = stats;
        for (const fn of this._statsListeners) { try { fn(stats); } catch (_) {} }
        emit('bridge:stats', stats);
      } catch (_) {
        this._connected = false;
        this._scheduleReconnect();
      }
    }

    _handleStats(stats) {
      this._lastStats = Object.assign({ polledAt: Date.now() }, stats);
      for (const fn of this._statsListeners) { try { fn(this._lastStats); } catch (_) {} }
      emit('bridge:stats', this._lastStats);
    }

    onStats(fn) {
      this._statsListeners.push(fn);
      return () => { this._statsListeners = this._statsListeners.filter(f => f !== fn); };
    }

    getLastStats() { return this._lastStats; }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEDeviceBridge = new RokuDeviceBridge();
  RGE_ROOT.RGEDeviceBridge.RokuDeviceBridge = RokuDeviceBridge;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
