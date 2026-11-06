globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * deployment_manager.js — RGE v91
 *
 * Orchestrates the full Roku deployment workflow:
 *  1. Build validation
 *  2. Package assembly (zip of pkg:/ tree)
 *  3. Device discovery (LAN broadcast, known device list)
 *  4. Sideload upload via the authenticated developer installer
 *  5. Post-deploy: log streaming, remote restart, screenshot
 *
 * This module runs in the Electron main/renderer bridge. It calls
 * electronAPI methods that proxy to main.js IPC handlers.
 *
 * Build profiles:
 *  'debug' / 'dev' — emit runtime telemetry
 *  'release' — omit runtime telemetry; user script logging is unchanged
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
        dev.reachable = !!(result && result.success);
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
        const result = await window.electronAPI.sideloadPing({ scan: true });
        if (!result?.success) throw new Error(result?.reason || 'Device discovery failed.');
        if (result && Array.isArray(result.devices)) {
          for (const d of result.devices) this.addDevice(d.ip, d.username, d.password);
        }
      } catch (error) {
        emit('deploy:discovery_done', { count: this._devices.length, error: error.message });
        throw error;
      }
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
          ...exportPayload,
          profile: usedProfile,
          ip,
          user: dev.username,
          pass: dev.password,
        });
      } catch (err) {
        record.finish(false, String(err));
        return record;
      }

      if (!buildResult || !buildResult.success) {
        record.finish(false, buildResult ? (buildResult.reason || buildResult.error) : 'Build failed');
        return record;
      }
      record.packageSizeKb = Math.round((buildResult.zipBytes || buildResult.bytes || 0) / 1024);
      record.addLog(`Package built: ${record.packageSizeKb} KB`);

      // Package size warning


      // ── Phase 3: upload ───────────────────────────────────────────────
      record.status = 'uploading';
      record.addLog(`Uploading to ${ip}…`);
      try {
        const uploadResult = await window.electronAPI.sideloadUpload({
          zipPath: buildResult.zipPath,
          ip,
          user: dev.username,
          pass: dev.password,
        });
        if (!uploadResult || !uploadResult.success) throw new Error(uploadResult ? (uploadResult.reason || uploadResult.error) : 'Upload failed');
        record.addLog('Upload successful. App is running on device.');
      } catch (err) {
        record.finish(false, String(err));
        return record;
      }

      record.buildWarnings.push(...(buildResult.warnings || []));
      record.finish(true);
      if (RGE_ROOT.RGEDeviceBridge) {
        Promise.resolve(RGE_ROOT.RGEDeviceBridge.connect(ip, dev.username, dev.password))
          .catch(error => record.addLog('Log connection failed: ' + error.message));
      }
      return record;
    }

    // ── Validation ─────────────────────────────────────────────────────────

    _validate(exportPayload) {
      const warnings = [];
      const errors   = [];
      if (!exportPayload) { errors.push('No export payload provided'); return { warnings, errors }; }
      if (!Array.isArray(exportPayload.scenes) || !exportPayload.scenes.length) errors.push('No scenes in the build snapshot.');
      return { warnings, errors };
    }

    // ── Remote controls ───────────────────────────────────────────────────

    async remoteRestart(ip) {
      const dev = this._devices.find(d => d.ip === ip);
      if (!dev) return;
      const result = await window.electronAPI.sideloadRestart({ ip });
      if (!result?.success) throw new Error(result?.reason || 'Restart failed');
      emit('deploy:remote_restart', { ip });
      return result;
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
