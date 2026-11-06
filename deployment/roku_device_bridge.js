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
      this._ip = null; this._username = 'rokudev'; this._password = ''; this._connected = false;
      this._logBuffer = []; this._logListeners = []; this._statsListeners = []; this._lastStats = null;
      this._maxLogBuffer = 2000; this._reconnectAttempts = 0; this._generation = 0;
      this._reconnectTimer = null; this._statsPollTimer = null;
      this._unsub = window.electronAPI?.onSideloadProgress?.(data => {
        if (!data || data.ip !== this._ip) return;
        if (data.type === 'log') this._handleLogLine(data.line);
        if (data.type === 'stats') this._handleStats(data.stats);
        if (data.type === 'debug-disconnected' || data.type === 'debug-error') {
          emit('bridge:error', { op: 'debug', error: data.reason || 'Debug console disconnected' });
          this._scheduleReconnect();
        }
      });
    }
    async connect(ip, username, password) {
      await this.disconnect();
      this._ip = ip; this._username = username || 'rokudev'; this._password = password || '';
      this._reconnectAttempts = 0; this._stopped = false;
      return this._attemptConnect(this._generation);
    }
    async _attemptConnect(generation = this._generation) {
      try {
        const ping = await window.electronAPI.sideloadPing({ ip: this._ip });
        if (generation !== this._generation || this._stopped) return;
        if (!ping?.success) throw new Error(ping?.reason || 'Device unavailable');
        const result = await window.electronAPI.sideloadDebugConnect({ ip: this._ip });
        if (generation !== this._generation || this._stopped) return;
        if (!result?.success) throw new Error(result?.reason || 'Debug console unavailable');
        this._connected = true; this._reconnectAttempts = 0;
        emit('bridge:connected', { ip: this._ip }); this._startStatsPoll();
        return result;
      } catch (error) {
        if (generation !== this._generation || this._stopped) return;
        emit('bridge:error', { op: 'connect', error: String(error) }); this._scheduleReconnect();
        return { success: false, reason: String(error) };
      }
    }
    _scheduleReconnect() {
      if (this._stopped || this._reconnectTimer) return;
      this._connected = false; clearInterval(this._statsPollTimer); this._statsPollTimer = null;
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempts++), RECONNECT_MAX_MS);
      const generation = this._generation;
      emit('bridge:reconnecting', { ip: this._ip, attempt: this._reconnectAttempts, delayMs: delay });
      this._reconnectTimer = setTimeout(() => { this._reconnectTimer = null; if (generation === this._generation) this._attemptConnect(generation); }, delay);
    }
    async disconnect() {
      this._generation++; this._stopped = true;
      clearTimeout(this._reconnectTimer); clearInterval(this._statsPollTimer);
      this._reconnectTimer = null; this._statsPollTimer = null; this._connected = false;
      await window.electronAPI?.sideloadDebugDisconnect?.();
      emit('bridge:disconnected', { ip: this._ip });
    }
    get connected() { return this._connected; }
    async screenshot() {
      const result = await window.electronAPI.sideloadScreenshot({ ip: this._ip, user: this._username, pass: this._password });
      if (!result?.success) { emit('bridge:error', { op: 'screenshot', error: result?.reason }); return null; }
      emit('bridge:screenshot', { url: result.dataUrl }); return result.dataUrl;
    }
    async queryDeviceInfo() {
      const result = await window.electronAPI.sideloadPing({ ip: this._ip });
      if (!result?.success) return null;
      emit('bridge:device_info', result); return result;
    }
    _handleLogLine(line) {
      const entry = { t: Date.now(), line: String(line || '') };
      this._logBuffer.push(entry); if (this._logBuffer.length > this._maxLogBuffer) this._logBuffer.shift();
      for (const fn of this._logListeners) { try { fn(entry); } catch {} }
      emit('bridge:log', entry);
    }
    onLog(fn) { this._logListeners.push(fn); return () => { this._logListeners = this._logListeners.filter(f => f !== fn); }; }
    getLogs() { return [...this._logBuffer]; }
    clearLogs() { this._logBuffer = []; emit('bridge:logs_cleared', {}); }
    _startStatsPoll() {
      if (!this._statsPollTimer) this._statsPollTimer = setInterval(() => this._pollStats(), STATS_POLL_INTERVAL);
    }
    async _pollStats() {
      if (!this._connected) return;
      const generation = this._generation;
      try {
        const result = await window.electronAPI.sideloadPing({ ip: this._ip });
        if (generation === this._generation && !result?.success) this._scheduleReconnect();
      } catch { if (generation === this._generation) this._scheduleReconnect(); }
    }
    _handleStats(stats) {
      this._lastStats = { ...stats, polledAt: Date.now() };
      for (const fn of this._statsListeners) { try { fn(this._lastStats); } catch {} }
      emit('bridge:stats', this._lastStats);
    }
    onStats(fn) { this._statsListeners.push(fn); return () => { this._statsListeners = this._statsListeners.filter(f => f !== fn); }; }
    getLastStats() { return this._lastStats; }
    async dispose() { await this.disconnect(); this._unsub?.(); }
  }

  RGE_ROOT.RGEDeviceBridge = new RokuDeviceBridge();
  RGE_ROOT.RGEDeviceBridge.RokuDeviceBridge = RokuDeviceBridge;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
