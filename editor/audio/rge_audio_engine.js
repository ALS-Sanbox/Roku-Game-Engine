globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * RGE Web Audio Engine — RGE_82
 * ─────────────────────────────────────────────────────────────────────────
 * Real Web Audio API engine for the editor.
 *
 * Bus audio graph per mixer:
 *   GainNode (volume/mute/solo)
 *     → StereoPannerNode (pan)
 *       → EqLow → EqMid → EqHigh   (3-band BiquadFilter)
 *         → FX chain (Reverb/Delay/Compressor/Distortion/Chorus/Phaser/BitCrusher)
 *           → AnalyserNode (VU meter)
 *             → SendGain (send level)
 *               → master destination / another bus
 *
 * Changes in RGE_82:
 *  • FX chain fully wired: Reverb (Convolver), Delay, Compressor, Distortion
 *    (WaveShaper), Chorus (Delay+LFO), Phaser (AllPass+LFO), BitCrusher
 *    (ScriptProcessor). Effects respect enabled flag.
 *  • No spatial audio — spatialBlend/maxDistance removed throughout.
 *  • Full serialize/deserialize: mixers, clips, bus connections restored on load.
 *  • Volume exported as 0-100 int for Roku (multiply 0-1 float by 100).
 *  • No fallback stubs — RGEAudioEngine is always present.
 */

(function () {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── FX node builders ──────────────────────────────────────────────────────

  function buildFxNode(ctx, type, params) {
    switch (type) {

      case 'Reverb': {
        // Convolver with a synthesised IR
        const conv = ctx.createConvolver();
        conv._wet = ctx.createGain();
        conv._dry = ctx.createGain();
        const sampleRate = ctx.sampleRate;
        const length = Math.floor(sampleRate * (0.5 + (params.roomSize ?? 0.5) * 3));
        const ir = ctx.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, (1 - (params.damping ?? 0.5)) * 4 + 0.5);
          }
        }
        conv.buffer = ir;
        const wet = params.wet ?? 0.3;
        conv._wet.gain.value = wet;
        conv._dry.gain.value = 1 - wet * 0.5;
        conv._input  = ctx.createGain();
        conv._output = ctx.createGain();
        conv._input.connect(conv._dry); conv._dry.connect(conv._output);
        conv._input.connect(conv); conv.connect(conv._wet); conv._wet.connect(conv._output);
        conv.input  = conv._input;
        conv.output = conv._output;
        return conv;
      }

      case 'Delay': {
        const delay = ctx.createDelay(5.0);
        delay.delayTime.value = clamp(params.time ?? 0.25, 0, 4.99);
        const fb = ctx.createGain();
        fb.gain.value = clamp(params.feedback ?? 0.4, 0, 0.95);
        const wet = ctx.createGain(); wet.gain.value = params.wet ?? 0.3;
        const dry = ctx.createGain(); dry.gain.value = 1 - (params.wet ?? 0.3) * 0.5;
        const inp = ctx.createGain(); const out = ctx.createGain();
        inp.connect(dry); dry.connect(out);
        inp.connect(delay); delay.connect(wet); wet.connect(out);
        delay.connect(fb); fb.connect(delay);
        delay.input = inp; delay.output = out;
        return delay;
      }

      case 'Compressor': {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = params.threshold ?? -24;
        comp.ratio.value     = params.ratio     ?? 4;
        comp.attack.value    = params.attack     ?? 0.003;
        comp.release.value   = params.release    ?? 0.25;
        comp.input  = comp;
        comp.output = comp;
        return comp;
      }

      case 'Distortion': {
        const ws = ctx.createWaveShaper();
        const drive = params.drive ?? 0.5;
        const n = 256;
        const curve = new Float32Array(n);
        const k = drive * 400;
        for (let i = 0; i < n; i++) {
          const x = (i * 2) / n - 1;
          curve[i] = k === 0 ? x : ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
        }
        ws.curve = curve;
        ws.oversample = '4x';
        const wet = ctx.createGain(); wet.gain.value = params.wet ?? 0.7;
        const dry = ctx.createGain(); dry.gain.value = 1 - (params.wet ?? 0.7);
        const inp = ctx.createGain(); const out = ctx.createGain();
        inp.connect(dry); dry.connect(out);
        inp.connect(ws);  ws.connect(wet); wet.connect(out);
        ws.input = inp; ws.output = out;
        return ws;
      }

      case 'Chorus': {
        const rate  = params.rate  ?? 1.5;
        const depth = params.depth ?? 0.7;
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.02;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth * 0.005;
        lfo.connect(lfoGain); lfoGain.connect(delay.delayTime);
        lfo.start();
        const wet = ctx.createGain(); wet.gain.value = params.wet ?? 0.5;
        const dry = ctx.createGain(); dry.gain.value = 1 - (params.wet ?? 0.5) * 0.5;
        const inp = ctx.createGain(); const out = ctx.createGain();
        inp.connect(dry); dry.connect(out);
        inp.connect(delay); delay.connect(wet); wet.connect(out);
        delay._lfo = lfo;
        delay.input = inp; delay.output = out;
        return delay;
      }

      case 'Phaser': {
        const rate  = params.rate  ?? 0.5;
        const depth = params.depth ?? 0.6;
        // Chain of 4 allpass filters
        const filters = Array.from({ length: 4 }, () => {
          const ap = ctx.createBiquadFilter();
          ap.type = 'allpass';
          ap.frequency.value = 1000;
          ap.Q.value = 10;
          return ap;
        });
        const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = depth * 1000;
        lfo.connect(lfoGain);
        filters.forEach(f => lfoGain.connect(f.frequency));
        lfo.start();
        const inp = ctx.createGain(); const out = ctx.createGain();
        const wet = ctx.createGain(); wet.gain.value = params.wet ?? 0.5;
        inp.connect(filters[0]);
        filters.reduce((a, b) => { a.connect(b); return b; });
        filters[filters.length - 1].connect(wet); wet.connect(out);
        inp.connect(out); // dry pass
        filters[0]._lfo = lfo;
        inp.input = inp; inp.output = out;
        return inp;
      }

      case 'BitCrusher': {
        // Implement as a periodic waveshaper approximation (no ScriptProcessor — deprecated)
        const bits = Math.round(clamp(params.bits ?? 8, 1, 16));
        const steps = Math.pow(2, bits);
        const ws = ctx.createWaveShaper();
        const n = 65536;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i * 2) / n - 1;
          curve[i] = Math.round(x * steps / 2) / (steps / 2);
        }
        ws.curve = curve;
        const wet = ctx.createGain(); wet.gain.value = params.wet ?? 0.5;
        const dry = ctx.createGain(); dry.gain.value = 1 - (params.wet ?? 0.5);
        const inp = ctx.createGain(); const out = ctx.createGain();
        inp.connect(dry); dry.connect(out);
        inp.connect(ws); ws.connect(wet); wet.connect(out);
        ws.input = inp; ws.output = out;
        return ws;
      }

      default:
        return null;
    }
  }

  function disposeFxNode(node) {
    if (!node) return;
    try { if (node._lfo) node._lfo.stop(); } catch(_) {}
    try { if (node.input) node.input.disconnect(); } catch(_) {}
    try { if (node.output) node.output.disconnect(); } catch(_) {}
    try { node.disconnect(); } catch(_) {}
  }

  // ── BusNode ───────────────────────────────────────────────────────────────

  class BusNode {
    constructor(ctx, id, name, isMaster) {
      this.ctx      = ctx;
      this.id       = id;
      this.name     = name;
      this.isMaster = isMaster;

      this._gainNode  = ctx.createGain();
      this._panNode   = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      this._eqLow     = ctx.createBiquadFilter();
      this._eqMid     = ctx.createBiquadFilter();
      this._eqHigh    = ctx.createBiquadFilter();
      this._analyser  = ctx.createAnalyser();
      this._sendGain  = ctx.createGain();
      this._fxNodes   = [];  // live Web Audio FX nodes

      this._eqLow.type  = 'lowshelf';  this._eqLow.frequency.value  = 80;
      this._eqMid.type  = 'peaking';   this._eqMid.frequency.value  = 1000; this._eqMid.Q.value = 0.8;
      this._eqHigh.type = 'highshelf'; this._eqHigh.frequency.value = 10000;
      this._analyser.fftSize = 256;
      this._analyserData = new Uint8Array(this._analyser.frequencyBinCount);

      // Base chain (before FX): gain → pan → eq3 → [FX slot] → analyser → sendGain
      this._chainHead = this._gainNode;
      let prev = this._gainNode;
      if (this._panNode) { prev.connect(this._panNode); prev = this._panNode; }
      prev.connect(this._eqLow);
      this._eqLow.connect(this._eqMid);
      this._eqMid.connect(this._eqHigh);
      // eqHigh → analyser inserted after FX are built
      this._eqHighOut = this._eqHigh; // will be overwritten by rebuildFxChain
      this._eqHigh.connect(this._analyser);
      this._analyser.connect(this._sendGain);
    }

    get input()  { return this._gainNode; }
    get output() { return this._sendGain; }

    setVolume(v) {
      this._gainNode.gain.setTargetAtTime(clamp(v, 0, 1.5), this.ctx.currentTime, 0.01);
    }

    setMuted(muted) {
      // Snap to 0 immediately on mute to avoid audible tail
      const g = muted ? 0 : (this._volume || 1);
      this._gainNode.gain.setTargetAtTime(g, this.ctx.currentTime, muted ? 0 : 0.02);
    }

    setPan(p) {
      if (this._panNode) this._panNode.pan.setTargetAtTime(clamp(p, -1, 1), this.ctx.currentTime, 0.01);
    }

    setSendLevel(v) {
      this._sendGain.gain.setTargetAtTime(clamp(v, 0, 1), this.ctx.currentTime, 0.01);
    }

    setEQ(band, db) {
      const node = band === 'eqLow' ? this._eqLow : band === 'eqMid' ? this._eqMid : this._eqHigh;
      if (node) node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
    }

    // Rebuild the FX chain between eqHigh and analyser whenever effects change
    rebuildFxChain(effects) {
      // Disconnect old FX
      try { this._eqHigh.disconnect(); } catch(_) {}
      this._fxNodes.forEach(disposeFxNode);
      this._fxNodes = [];

      const active = (effects || []).filter(fx => fx.enabled !== false && fx.type);
      if (!active.length) {
        this._eqHigh.connect(this._analyser);
        return;
      }

      const nodes = active.map(fx => buildFxNode(this.ctx, fx.type, fx.params || {})).filter(Boolean);
      this._fxNodes = nodes;

      // Wire: eqHigh → fx0.input → fx0.output → fx1.input → ... → analyser
      let prev = this._eqHigh;
      for (const n of nodes) {
        prev.connect(n.input || n);
        prev = n.output || n;
      }
      prev.connect(this._analyser);
    }

    readMeterLevel() {
      this._analyser.getByteTimeDomainData(this._analyserData);
      let peak = 0;
      for (let i = 0; i < this._analyserData.length; i++) {
        const v = Math.abs(this._analyserData[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      return peak;
    }

    disconnect() {
      this._fxNodes.forEach(disposeFxNode);
      try { this._gainNode.disconnect(); } catch(_) {}
      try { this._sendGain.disconnect(); } catch(_) {}
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  class Voice {
    constructor(ctx, busNode, audioBuffer, options = {}) {
      this.id      = crypto.randomUUID();
      this.busNode = busNode;
      this.ctx     = ctx;
      this.active  = true;

      this._gainNode = ctx.createGain();
      this._gainNode.gain.value = clamp(options.volume ?? 1, 0, 1.5);

      this._source = ctx.createBufferSource();
      this._source.buffer           = audioBuffer;
      this._source.loop             = options.loop ?? false;
      this._source.playbackRate.value = clamp(options.pitch ?? 1, 0.1, 4);

      this._source.connect(this._gainNode);
      this._gainNode.connect(busNode.input);

      this._source.onended = () => this.stop();
      this._source.start(0);
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      try { this._source.stop(); } catch(_) {}
      try { this._gainNode.disconnect(); } catch(_) {}
    }
  }

  // ── RGEAudioEngine ────────────────────────────────────────────────────────

  class RGEAudioEngine {
    constructor() {
      this._ctx         = null;
      this._buses       = new Map();
      this._voices      = new Map();       // id → Voice
      this._voicesByPath = new Map();      // clipPath → Set of Voice ids (for live updates)
      this._bufferCache = new Map();
      this._loading     = new Map();

      // Public data — AudioPanel reads/writes these plain objects
      this.mixers      = new Map();
      this.masterMixer = null;
      this.clips       = [];
      this.maxVoices   = 64;

      this._initMaster();
    }

    // ── Context ─────────────────────────────────────────────────────────────

    _getCtx() {
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      return this._ctx;
    }

    // ── Master bus init ──────────────────────────────────────────────────────

    _initMaster() {
      const m = {
        id: 'master', name: 'Master', isMaster: true,
        volume: 1, pan: 0, muted: false, solo: false, _soloMuted: false,
        effects: [], sendTo: null, sendLevel: 1,
        meterLevel: 0, eqLow: 0, eqMid: 0, eqHigh: 0, activeVoices: 0
      };
      this.mixers.set('master', m);
      this.masterMixer = m;
    }

    _ensureBusNode(mixer) {
      if (this._buses.has(mixer.id)) return this._buses.get(mixer.id);
      const ctx = this._getCtx();
      const bus = new BusNode(ctx, mixer.id, mixer.name, !!mixer.isMaster);
      bus.setVolume(mixer.volume ?? 1);
      bus._volume = mixer.volume ?? 1;
      bus.setPan(mixer.pan ?? 0);
      bus.setSendLevel(mixer.sendLevel ?? 1);
      bus.setEQ('eqLow',  mixer.eqLow  ?? 0);
      bus.setEQ('eqMid',  mixer.eqMid  ?? 0);
      bus.setEQ('eqHigh', mixer.eqHigh ?? 0);
      bus.rebuildFxChain(mixer.effects || []);
      if (!!(mixer.muted || mixer._soloMuted)) bus.setMuted(true);
      this._buses.set(mixer.id, bus);

      // Connect output
      if (mixer.isMaster) {
        bus.output.connect(ctx.destination);
      } else {
        const targetId = mixer.sendTo || 'master';
        const targetMixer = this.mixers.get(targetId) || this.masterMixer;
        bus.output.connect(this._ensureBusNode(targetMixer).input);
      }
      return bus;
    }

    // ── Public mixer API ─────────────────────────────────────────────────────

    createMixer(name) {
      const id = 'bus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const data = {
        id, name, isMaster: false,
        volume: 1, pan: 0, muted: false, solo: false, _soloMuted: false,
        effects: [], sendTo: this.masterMixer.id, sendLevel: 1,
        meterLevel: 0, eqLow: 0, eqMid: 0, eqHigh: 0, activeVoices: 0
      };
      this.mixers.set(id, data);
      if (this._ctx) this._ensureBusNode(data);
      return data;
    }

    setMixerVolume(id, vol) {
      const data = this.mixers.get(id);
      if (!data) return;
      data.volume = clamp(vol, 0, 1.5);
      const bus = this._buses.get(id);
      if (bus) { bus._volume = data.volume; bus.setVolume(data.volume); }
    }

    toggleMute(id) {
      const data = this.mixers.get(id);
      if (!data) return;
      data.muted = !data.muted;
      const bus = this._buses.get(id);
      if (bus) bus.setMuted(!!(data.muted || data._soloMuted));
      this._syncPanel('mute');
    }

    toggleSolo(id) {
      const data = this.mixers.get(id);
      if (!data) return;
      data.solo = !data.solo;
      this._applySoloLogic();
      this._syncPanel('mute');
      this._syncPanel('solo');
    }

    _applySoloLogic() {
      const anySolo = Array.from(this.mixers.values()).some(m => m.solo);
      for (const data of this.mixers.values()) {
        data._soloMuted = anySolo && !data.solo;
        const bus = this._buses.get(data.id);
        if (bus) bus.setMuted(!!(data.muted || data._soloMuted));
      }
    }

    setSendTarget(id, targetId) {
      const data = this.mixers.get(id);
      if (!data) return;
      data.sendTo = targetId;
      const bus = this._buses.get(id);
      if (!bus || !this._ctx) return;
      bus.output.disconnect();
      const targetData = this.mixers.get(targetId) || this.masterMixer;
      bus.output.connect(this._ensureBusNode(targetData).input);
    }

    setEQ(id, band, value) {
      const data = this.mixers.get(id);
      if (data) data[band] = value;
      const bus = this._buses.get(id);
      if (bus) bus.setEQ(band, value);
    }

    // Called when FX are added/removed/enabled-toggled from the panel
    rebuildFx(id) {
      const data = this.mixers.get(id);
      const bus  = this._buses.get(id);
      if (data && bus) bus.rebuildFxChain(data.effects || []);
    }

    getMeterLevel(id) {
      const bus  = this._buses.get(id);
      const data = this.mixers.get(id);
      if (!data) return 0;
      if (bus) {
        const peak = bus.readMeterLevel();
        // Smooth decay on the stored meterLevel
        data.meterLevel = Math.max(peak, (data.meterLevel || 0) * 0.88);
      } else {
        data.meterLevel = (data.meterLevel || 0) * 0.88;
      }
      return data.meterLevel;
    }

    renameMixer(id, name) {
      const data = this.mixers.get(id);
      if (data) data.name = name;
      const bus = this._buses.get(id);
      if (bus) bus.name = name;
    }

    // ── Playback ─────────────────────────────────────────────────────────────

    async playEventOnBus(clipPath, options = {}) {
      if (!clipPath) return null;
      const ctx = this._getCtx();

      let mixerData;
      if (options.busId && this.mixers.has(options.busId)) {
        mixerData = this.mixers.get(options.busId);
      } else if (options.busName) {
        mixerData = Array.from(this.mixers.values()).find(m => m.name === options.busName) || this.masterMixer;
      } else {
        mixerData = this.masterMixer;
      }
      const bus = this._ensureBusNode(mixerData);

      // Evict oldest voice at limit
      if (this._voices.size >= this.maxVoices) {
        const oldest = this._voices.keys().next().value;
        this._voices.get(oldest)?.stop();
        this._voices.delete(oldest);
      }

      try {
        const buffer = await this._loadBuffer(clipPath);
        if (!buffer) return null;
        const voice = new Voice(ctx, bus, buffer, {
          volume: options.volume ?? 1,
          pitch:  options.pitch  ?? 1,
          loop:   options.loop   ?? false,
        });
        voice.clipPath = clipPath;
        this._voices.set(voice.id, voice);
        // Track by path for live updates
        if (!this._voicesByPath.has(clipPath)) this._voicesByPath.set(clipPath, new Set());
        this._voicesByPath.get(clipPath).add(voice.id);
        mixerData.meterLevel = Math.min(1, (mixerData.meterLevel || 0) + 0.6);
        if (mixerData.activeVoices != null) mixerData.activeVoices++;
        voice._source.onended = () => {
          this._voices.delete(voice.id);
          const pathSet = this._voicesByPath.get(clipPath);
          if (pathSet) { pathSet.delete(voice.id); if (!pathSet.size) this._voicesByPath.delete(clipPath); }
          if (mixerData.activeVoices > 0) mixerData.activeVoices--;
          voice.active = false;
        };
        return voice.id;
      } catch (err) {
        console.warn('[RGEAudioEngine] playEventOnBus failed:', clipPath, err.message);
        return null;
      }
    }

    playEvent(name, overrides = {}) {
      return this.playEventOnBus(overrides.clip || name, overrides);
    }

    stopVoice(id) {
      const v = this._voices.get(id);
      if (v) { v.stop(); this._voices.delete(id); }
    }

    stopAll() {
      for (const v of this._voices.values()) v.stop();
      this._voices.clear();
      this._voicesByPath.clear();
    }

    // Live-update all currently playing voices for a clip (volume 0-1.5, pitch 0.1-4)
    updateClipPlayback(clipPath, options = {}) {
      const ids = this._voicesByPath.get(clipPath);
      if (!ids || !ids.size) return;
      const now = this._ctx ? this._ctx.currentTime : 0;
      for (const id of ids) {
        const voice = this._voices.get(id);
        if (!voice || !voice.active) continue;
        if (options.volume != null) {
          voice._gainNode.gain.setTargetAtTime(Math.max(0, options.volume), now, 0.02);
        }
        if (options.pitch != null) {
          voice._source.playbackRate.setTargetAtTime(Math.max(0.1, options.pitch), now, 0.02);
        }
      }
    }

    update(dt) {
      for (const [id, v] of this._voices) {
        if (!v.active) this._voices.delete(id);
      }
    }

    // ── Buffer loading ────────────────────────────────────────────────────────

    async _loadBuffer(clipPath) {
      if (this._bufferCache.has(clipPath)) return this._bufferCache.get(clipPath);
      if (this._loading.has(clipPath)) return this._loading.get(clipPath);
      const p = this._fetchAndDecode(clipPath);
      this._loading.set(clipPath, p);
      try {
        const buf = await p;
        this._bufferCache.set(clipPath, buf);
        return buf;
      } finally {
        this._loading.delete(clipPath);
      }
    }

    async _fetchAndDecode(clipPath) {
      const ctx = this._getCtx();
      if (window.electronAPI?.readProjectAsset) {
        try {
          const r = await window.electronAPI.readProjectAsset({ resourcePath: clipPath });
          if (r?.success && r.dataUrl) {
            const ab = await this._dataUrlToArrayBuffer(r.dataUrl);
            return await ctx.decodeAudioData(ab);
          }
        } catch(e) {
          console.warn('[RGEAudioEngine] readProjectAsset failed, trying fetch:', e.message);
        }
      }
      const url = clipPath.startsWith('res://') ? clipPath.replace('res://', '') : clipPath;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await ctx.decodeAudioData(await resp.arrayBuffer());
    }

    _dataUrlToArrayBuffer(dataUrl) {
      return new Promise((resolve, reject) => {
        try {
          const b64 = dataUrl.split(',')[1];
          if (!b64) { reject(new Error('empty dataUrl')); return; }
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(bytes.buffer);
        } catch(e) { reject(e); }
      });
    }

    // ── Panel sync ────────────────────────────────────────────────────────────

    _syncPanel(type) {
      const ap = window._audioPanelInstance;
      if (!ap) return;
      if (type === 'mute' && typeof ap._syncMuteButtons === 'function') ap._syncMuteButtons();
      if (type === 'solo' && typeof ap._syncSoloButtons === 'function') ap._syncSoloButtons();
    }

    // ── Serialize / Deserialize ───────────────────────────────────────────────

    serialize() {
      const mixerArr = Array.from(this.mixers.values()).map(m => ({
        id:       m.id,
        name:     m.name,
        isMaster: !!m.isMaster,
        volume:   m.volume,
        pan:      m.pan,
        muted:    m.muted,
        solo:     m.solo,
        effects:  m.effects || [],
        sendTo:   m.sendTo || null,
        sendLevel:m.sendLevel ?? 1,
        eqLow:    m.eqLow  ?? 0,
        eqMid:    m.eqMid  ?? 0,
        eqHigh:   m.eqHigh ?? 0,
      }));
      return JSON.stringify({ mixers: mixerArr, clips: this.clips });
    }

    deserialize(json) {
      let data;
      try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch(_) { return; }
      if (!data || typeof data !== 'object') return;

      // Restore clips
      if (Array.isArray(data.clips)) {
        this.clips = data.clips;
        // Sync into panel registry
        if (!window._rgeAudioClips) window._rgeAudioClips = {};
        for (const c of this.clips) window._rgeAudioClips[c.id] = c;
      }

      // Restore mixers
      if (Array.isArray(data.mixers)) {
        // Clear existing sub-buses (keep master slot, will be replaced if present)
        for (const [id, bus] of this._buses) {
          bus.disconnect();
          this._buses.delete(id);
        }
        this.mixers.clear();

        // First pass: restore data objects
        for (const saved of data.mixers) {
          const m = {
            id:          saved.id,
            name:        saved.name,
            isMaster:    !!saved.isMaster,
            volume:      saved.volume      ?? 1,
            pan:         saved.pan         ?? 0,
            muted:       !!saved.muted,
            solo:        !!saved.solo,
            _soloMuted:  false,
            effects:     Array.isArray(saved.effects) ? saved.effects : [],
            sendTo:      saved.sendTo      || null,
            sendLevel:   saved.sendLevel   ?? 1,
            eqLow:       saved.eqLow       ?? 0,
            eqMid:       saved.eqMid       ?? 0,
            eqHigh:      saved.eqHigh      ?? 0,
            meterLevel:  0,
            activeVoices:0,
          };
          this.mixers.set(m.id, m);
          if (m.isMaster) this.masterMixer = m;
        }
        // Ensure master exists
        if (!this.masterMixer) this._initMaster();

        // Second pass: build bus nodes (requires all mixers in map for send routing)
        if (this._ctx) {
          for (const m of this.mixers.values()) this._ensureBusNode(m);
        }
        this._applySoloLogic();
      }

      // Refresh the panel UI
      const ap = window._audioPanelInstance;
      if (ap) {
        ap.engine = this;
        ap.render();
      }
    }
  }

  RGE_ROOT.RGEAudioEngine = new RGEAudioEngine();
  console.log('[RGEAudioEngine] Web Audio engine ready (RGE_82).');

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
