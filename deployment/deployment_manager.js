globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * deployment_manager.js — RGE v91
 *
 * Orchestrates the full Roku deployment workflow:
 *  1. Build validation
 *  2. Package assembly (zip of pkg:/ tree)
 *  3. Device discovery (LAN broadcast, known device list)
 *  4. Sideload upload via Roku ECP REST API
 *  5. Post-deploy: log streaming, remote restart, screenshot
 *
 * This module runs in the Electron main/renderer bridge. It calls
 * electronAPI methods that proxy to main.js IPC handlers.
 *
 * Build profiles:
 *  'debug'   — all logging enabled, symbol tables preserved
 *  'dev'     — moderate logging, dev assertions active
 *  'release' — stripped, minimal logging
 */

(function () {
  'use strict';

  const BUILD_PROFILES = ['debug', 'dev', 'release'];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  function now() { return Date.now(); }
  function ts() { return new Date().toISOString(); }

  // ── DeploymentRecord ───────────────────────────────────────────────────────

  class DeploymentRecord {
    constructor(profile, device) {
      this.id = `deploy_${now().toString(36)}`;
      this.profile = profile;
      this.device = device;
      this.startedAt = ts();
      this.finishedAt = null;
      this.status = 'pending'; // 'pending' | 'building' | 'uploading' | 'done' | 'error'
      this.error = null;
      this.packageSizeKb = 0;
      this.buildWarnings = [];
      this.buildErrors = [];
      this.log = [];
    }

    addLog(msg) {
      this.log.push({ t: ts(), msg: String(msg) });
      emit('deploy:log', { id: this.id, msg });
    }

    finish(ok, error = null) {
      this.finishedAt = ts();
      this.status = ok ? 'done' : 'error';
      this.error = error;
      emit('deploy:finished', { id: this.id, ok, error });
    }
  }

  // ── DeviceInfo ─────────────────────────────────────────────────────────────

  class DeviceInfo {
    constructor(ip, username, password) {
      this.ip = ip;
      this.username = username || 'rokudev';
      this.password = password || '';
      this.model = '';
      this.serial = '';
      this.firmwareVersion = '';
      this.lastSeenAt = null;
      this.reachable = false;
    }

    get label() { return this.model ? `${this.model} (${this.ip})` : this.ip; }

    toJSON() {
      return {
        ip: this.ip, username: this.username,
        model: this.model, serial: this.serial,
        firmwareVersion: this.firmwareVersion,
        lastSeenAt: this.lastSeenAt, reachable: this.reachable,
      };
    }
  }

  // ── DeploymentManager ──────────────────────────────────────────────────────

  class DeploymentManager {
    constructor() {
      /** @type {DeviceInfo[]} */
      this._devices = [];
      /** @type {DeploymentRecord[]} max 20 kept */
      this._history = [];
      this._activeRecord = null;
      this._logStreamActive = false;
      this._profile = 'debug';
    }

    // ── Build profile ─────────────────────────────────────────────────────

    setProfile(profile) {
      if (!BUILD_PROFILES.includes(profile)) throw new Error(`Unknown profile: ${profile}`);
      this._profile = profile;
    }

    get profile() { return this._profile; }

    // ── Device management ─────────────────────────────────────────────────

    addDevice(ip, username, password) {
      const existing = this._devices.find(d => d.ip === ip);
      if (existing) {
        existing.username = username || existing.username;
        existing.password = password || existing.password;
        return existing;
      }
      const dev = new DeviceInfo(ip, username, password);
      this._devices.push(dev);
      emit('deploy:device_added', { ip });
      return dev;
    }

    removeDevice(ip) {
      this._devices = this._devices.filter(d => d.ip !== ip);
      emit('deploy:device_removed', { ip });
    }

    listDevices() { return [...this._devices]; }

    /**
     * Ping a device to check reachability.  Delegates to electronAPI.
     */
    async pingDevice(ip) {
      const dev = this._devices.find(d => d.ip === ip);
      if (!dev) return false;
      try {
        const result = await window.electronAPI.sideloadPing({ ip, username: dev.username, password: dev.password });
        dev.reachable = !!(result && result.ok);
        dev.lastSeenAt = ts();
        if (result && result.model) dev.model = result.model;
        emit('deploy:device_status', { ip, reachable: dev.reachable, model: dev.model });
        return dev.reachable;
      } catch (err) {
        dev.reachable = false;
        emit('deploy:device_status', { ip, reachable: false, error: String(err) });
        return false;
      }
    }

    async discoverDevices() {
      emit('deploy:discovery_start', {});
      try {
        // electronAPI.sideloadBuild doubles as a scan in main.js
        // LAN discovery is handled by the main process (SSDP / known IPs sweep)
        const result = await window.electronAPI.sideloadPing({ scan: true });
        if (result && Array.isArray(result.devices)) {
          for (const d of result.devices) this.addDevice(d.ip, d.username, d.password);
        }
      } catch (_) {}
      emit('deploy:discovery_done', { count: this._devices.length });
    }

    // ── Build + Deploy ────────────────────────────────────────────────────

    /**
     * Full one-click deploy pipeline.
     * @param {object} opts
     * @param {string} opts.ip         - target Roku device IP
     * @param {string} [opts.profile]  - override build profile
     * @param {object} opts.exportPayload - output of exporter.js
     */
    async deploy(opts) {
      const { ip, profile, exportPayload } = opts || {};
      const dev = this._devices.find(d => d.ip === ip);
      if (!dev) throw new Error(`No device registered for IP ${ip}`);

      const usedProfile = profile || this._profile;
      const record = new DeploymentRecord(usedProfile, dev.toJSON());
      this._activeRecord = record;
      this._pushHistory(record);

      emit('deploy:start', { id: record.id, profile: usedProfile, ip });

      // ── Phase 1: validation ───────────────────────────────────────────
      record.status = 'building';
      record.addLog(`[${usedProfile}] Validating export…`);
      const validation = this._validate(exportPayload);
      record.buildWarnings = validation.warnings;
      record.buildErrors   = validation.errors;
      if (validation.errors.length > 0) {
        record.addLog(`Build errors: ${validation.errors.join('; ')}`);
        record.finish(false, validation.errors.join('; '));
        return record;
      }
      if (validation.warnings.length > 0) {
        record.addLog(`Build warnings: ${validation.warnings.join('; ')}`);
      }

      // ── Phase 2: package build ────────────────────────────────────────
      record.addLog('Building Roku package…');
      let buildResult;
      try {
        buildResult = await window.electronAPI.sideloadBuild({
          exportPayload,
          profile: usedProfile,
          ip,
          username: dev.username,
          password: dev.password,
        });
      } catch (err) {
        record.finish(false, String(err));
        return record;
      }

      if (!buildResult || !buildResult.ok) {
        record.finish(false, buildResult ? buildResult.error : 'Build failed');
        return record;
      }
      record.packageSizeKb = buildResult.sizeKb || 0;
      record.addLog(`Package built: ${record.packageSizeKb} KB`);

      // Package size warning
      if (record.packageSizeKb > 4096) {
        record.addLog('WARNING: Package exceeds 4 MB; Roku may reject sideloads over this limit.');
      }

      // ── Phase 3: upload ───────────────────────────────────────────────
      record.status = 'uploading';
      record.addLog(`Uploading to ${ip}…`);
      try {
        const uploadResult = await window.electronAPI.sideloadUpload({
          packagePath: buildResult.packagePath,
          ip,
          username: dev.username,
          password: dev.password,
        });
        if (!uploadResult || !uploadResult.ok) throw new Error(uploadResult ? uploadResult.error : 'Upload failed');
        record.addLog('Upload successful. App is running on device.');
      } catch (err) {
        record.finish(false, String(err));
        return record;
      }

      record.finish(true);
      return record;
    }

    // ── Validation ─────────────────────────────────────────────────────────

    _validate(exportPayload) {
      const warnings = [];
      const errors   = [];
      if (!exportPayload) { errors.push('No export payload provided'); return { warnings, errors }; }
      const manifest = exportPayload.manifest;
      if (!manifest) { warnings.push('No resource manifest in export; missing assets may crash at runtime'); }
      return { warnings, errors };
    }

    // ── Remote controls ───────────────────────────────────────────────────

    async remoteRestart(ip) {
      const dev = this._devices.find(d => d.ip === ip);
      if (!dev) return;
      try {
        await window.electronAPI.sideloadDelete({ ip, username: dev.username, password: dev.password });
        emit('deploy:remote_restart', { ip });
      } catch (_) {}
    }

    // ── History ───────────────────────────────────────────────────────────

    _pushHistory(record) {
      this._history.unshift(record);
      if (this._history.length > 20) this._history.length = 20;
    }

    getHistory() { return [...this._history]; }

    // ── Serialization ─────────────────────────────────────────────────────

    serialize() {
      return {
        profile: this._profile,
        devices: this._devices.map(d => d.toJSON()),
      };
    }

    deserialize(data) {
      if (!data) return;
      if (data.profile && BUILD_PROFILES.includes(data.profile)) this._profile = data.profile;
      (data.devices || []).forEach(d => {
        if (d.ip) this.addDevice(d.ip, d.username, d.password);
      });
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEDeploymentManager = new DeploymentManager();
  RGE_ROOT.RGEDeploymentManager.DeploymentManager = DeploymentManager;
  RGE_ROOT.RGEDeploymentManager.DeviceInfo = DeviceInfo;
  RGE_ROOT.RGEDeploymentManager.BUILD_PROFILES = BUILD_PROFILES;

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
