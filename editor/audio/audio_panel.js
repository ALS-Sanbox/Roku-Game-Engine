globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * AudioPanel — full-featured audio mixer panel for RGE.
 *
 * RGE_67 redesign:
 *  • Clips are GLOBAL (engine.clips), never per-bus — deleting a bus never removes clips.
 *  • Each clip has a busId routing it to a bus.
 *  • Clip vol/pitch/loop/oneShot sync back to any linked AudioSourceComponent via window._rgeAudioClips.
 *  • "+ Import Clip" triggers the native importProjectAsset('audio') flow.
 *  • Mute + Solo are a prominent row on every bus strip.
 *  • Volume fader is flanked by vertical VU bars on both sides.
 */

window.AudioPanel = class AudioPanel {
  constructor(engine, container) {
    this.engine   = engine;
    this.container = container;
    this.audioFiles         = [];
    this.selectedMixerId    = null;
    this.expandedFx         = new Set();
    this.expandedEQ         = new Set();
    this.pendingFrame       = null;
    this.dirtyMixers        = new Set();
    this._meterLoopActive   = false;
    this._meterFrame        = null;
    this.lastMeterFrame     = 0;
    this.meterFrameInterval = 1000 / 30;
    this.meterState         = new Map();
  }

  refresh(files) { this.audioFiles = files || []; this.render(); }

  mount() {
    if (!this.container) return;
    if (this.container.dataset.audioPanelMounted === 'true') return;
    this.container.dataset.audioPanelMounted = 'true';
    this.container.classList.add('audio-workspace');
    this._ensureEngine();
    this.render();
    this._startMeterLoop();
  }

  unmount() {
    this._meterLoopActive = false;
    if (this._meterFrame) { cancelAnimationFrame(this._meterFrame); this._meterFrame = null; }
    this._stopPreview();
    this.pendingFrame = null;
  }

  render() {
    this._ensureEngine();
    if (!this.container.querySelector('.ap-workspace')) {
      this.container.innerHTML = '';
      this.container.appendChild(this._buildToolbar());
      const ws = document.createElement('div'); ws.className = 'ap-workspace';
      const sa = document.createElement('div'); sa.className = 'ap-strip-area';
      ws.appendChild(sa);
      ws.appendChild(this._buildDetailPanel());
      this.container.appendChild(ws);
    } else {
      const old = this.container.querySelector('.ap-toolbar');
      if (old) old.replaceWith(this._buildToolbar());
    }
    this._rebuildStripArea();
    this._refreshDetailPanel();
  }

  _rebuildStripArea() {
    // Clear cached meter element refs — they'll be repopulated by _buildVUBar
    this._meterEls = {};
    const ws = this.container.querySelector('.ap-workspace');
    if (!ws) return;
    const old = ws.querySelector('.ap-strip-area');
    const area = document.createElement('div'); area.className = 'ap-strip-area';
    if (this.engine && this.engine.masterMixer) area.appendChild(this._buildStrip(this.engine.masterMixer, true));
    const sep = document.createElement('div'); sep.className = 'ap-bus-sep'; sep.textContent = 'SUB MIXERS';
    area.appendChild(sep);
    if (this.engine && this.engine.mixers) {
      for (const mx of this.engine.mixers.values()) {
        if (!mx.isMaster) area.appendChild(this._buildStrip(mx, false));
      }
    }
    if (old) ws.replaceChild(area, old); else ws.insertBefore(area, ws.firstChild);
  }

  _buildToolbar() {
    const bar = document.createElement('div'); bar.className = 'ap-toolbar';
    const title = document.createElement('span'); title.className = 'ap-toolbar-title'; title.textContent = 'Audio Mixer';
    bar.appendChild(title);
    const right = document.createElement('div'); right.className = 'ap-toolbar-right';
    const clearSolo = this._mkBtn('Clear Solo', 'ap-toolbar-btn', () => {
      if (!this.engine || !this.engine.mixers) return;
      for (const m of this.engine.mixers.values()) { m.solo = false; m._soloMuted = false; }
      this._syncSoloButtons();
      this._syncMuteButtons();
    });
    right.appendChild(clearSolo);
    right.appendChild(this._mkBtn('+ Add Bus', 'ap-toolbar-btn ap-toolbar-btn--accent', () => this._createSubMixer()));
    bar.appendChild(right);
    return bar;
  }

  // ── Bus Strip ────────────────────────────────────────────────────────────

  _buildStrip(mixer, isMaster) {
    const strip = document.createElement('div');
    strip.className = 'ap-strip' + (isMaster ? ' ap-strip--master' : '') + (mixer.id === this.selectedMixerId ? ' ap-strip--selected' : '');
    strip.dataset.mixerId = mixer.id;
    strip.addEventListener('click', (e) => {
      if (e.target.closest('button,input,select,label,canvas')) return;
      this.selectedMixerId = mixer.id;
      this.container.querySelectorAll('.ap-strip').forEach(s => s.classList.toggle('ap-strip--selected', s.dataset.mixerId === mixer.id));
    });

    // Header
    const hdr = document.createElement('div'); hdr.className = 'ap-strip-header';
    const nameEl = document.createElement('div'); nameEl.className = 'ap-strip-name';
    nameEl.textContent = isMaster ? 'MASTER' : mixer.name;
    nameEl.title = isMaster ? 'Master Bus' : 'Double-click to rename';
    if (!isMaster) nameEl.addEventListener('dblclick', () => this._inlineRename(nameEl, mixer));
    hdr.appendChild(nameEl);
    if (!isMaster) {
      const renBtn = document.createElement('button'); renBtn.className = 'ap-strip-rename'; renBtn.title = 'Rename'; renBtn.textContent = '✎';
      renBtn.addEventListener('click', (e) => { e.stopPropagation(); this._inlineRename(nameEl, mixer); });
      hdr.appendChild(renBtn);
      const delBtn = document.createElement('button'); delBtn.className = 'ap-strip-delete'; delBtn.title = 'Remove bus'; delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteMixer(mixer.id); });
      hdr.appendChild(delBtn);
    }
    strip.appendChild(hdr);

    // Body: fader+VU on left, all controls in right column
    const body = document.createElement('div');
    body.className = 'ap-strip-body';

    // Left: fader with flanking VU bars (fills available height)
    body.appendChild(this._buildFaderWithVU(mixer));

    // Right: all controls stacked vertically
    const right = document.createElement('div');
    right.className = 'ap-strip-right';

    // Mute / Solo
    const msRow = document.createElement('div'); msRow.className = 'ap-ms-row';
    const muteBtn = this._mkBtn('M', 'ap-ms-btn ap-ms-mute' + (mixer.muted ? ' active' : ''), () => {
      if (this.engine && this.engine.toggleMute) {
        this.engine.toggleMute(mixer.id);
      } else {
        mixer.muted = !mixer.muted;
        muteBtn.classList.toggle('active', mixer.muted);
      }
    });
    muteBtn.title = 'Mute';
    const soloBtn = this._mkBtn('S', 'ap-ms-btn ap-ms-solo' + (mixer.solo ? ' active' : ''), () => {
      if (this.engine && this.engine.toggleSolo) {
        this.engine.toggleSolo(mixer.id);
      } else {
        mixer.solo = !mixer.solo;
        soloBtn.classList.toggle('active', mixer.solo);
      }
    });
    soloBtn.title = 'Solo';
    msRow.append(muteBtn, soloBtn);
    right.appendChild(msRow);

    // Pan knob (small canvas)
    right.appendChild(this._buildPanKnob(mixer));

    // FX button
    const ctrlRow = document.createElement('div'); ctrlRow.className = 'ap-strip-controls';
    const fxBtn = this._mkBtn('FX', 'ap-ctrl-btn ap-ctrl-fx' + (this.expandedFx.has(mixer.id) ? ' active' : ''), () => {
      this.expandedFx.has(mixer.id) ? this.expandedFx.delete(mixer.id) : this.expandedFx.add(mixer.id);
      fxBtn.classList.toggle('active', this.expandedFx.has(mixer.id));
      const rack = strip.querySelector('.ap-fx-rack');
      if (rack) rack.classList.toggle('ap-fx-rack--open', this.expandedFx.has(mixer.id));
    });
    fxBtn.title = 'Effects Rack';
    ctrlRow.append(fxBtn);
    right.appendChild(ctrlRow);

    // EQ button
    const eqRow = document.createElement('div'); eqRow.className = 'ap-eq-row';
    const eqBtn = this._mkBtn('EQ', 'ap-ctrl-btn ap-ctrl-eq' + (this.expandedEQ.has(mixer.id) ? ' active' : ''), () => {
      this.expandedEQ.has(mixer.id) ? this.expandedEQ.delete(mixer.id) : this.expandedEQ.add(mixer.id);
      eqBtn.classList.toggle('active', this.expandedEQ.has(mixer.id));
      const eqPanel = strip.querySelector('.ap-eq-panel');
      if (eqPanel) eqPanel.classList.toggle('ap-eq-panel--open', this.expandedEQ.has(mixer.id));
    });
    eqBtn.title = 'Toggle 3-band EQ';
    eqRow.appendChild(eqBtn);
    right.appendChild(eqRow);

    // Send row (sub buses only)
    if (!isMaster) right.appendChild(this._buildSendRow(mixer));

    body.appendChild(right);
    strip.appendChild(body);

    // EQ and FX panels span full width below body (collapsible)
    strip.appendChild(this._buildEQPanel(mixer));
    strip.appendChild(this._buildFXRack(mixer));
    return strip;
  }

  // ── Fader + flanking VU bars ─────────────────────────────────────────────

  _buildFaderWithVU(mixer) {
    const wrap = document.createElement('div'); wrap.className = 'ap-fader-vu-wrap';
    wrap.appendChild(this._buildVUBar(mixer.id, 'L'));

    const col = document.createElement('div'); col.className = 'ap-fader-section';
    const lbl = document.createElement('div'); lbl.className = 'ap-fader-label'; lbl.textContent = 'VOL';
    const dbDisp = document.createElement('div'); dbDisp.className = 'ap-fader-db'; dbDisp.dataset.mixerVol = mixer.id;
    dbDisp.textContent = this._volToDb(mixer.volume != null ? mixer.volume : 1);
    const fader = document.createElement('input'); fader.type = 'range'; fader.className = 'ap-fader';
    fader.min = '0'; fader.max = '1.5'; fader.step = '0.01'; fader.value = String(mixer.volume != null ? mixer.volume : 1);
    fader.addEventListener('input', () => {
      mixer.volume = parseFloat(fader.value);
      if (this.engine && this.engine.setMixerVolume) {
        this.engine.setMixerVolume(mixer.id, mixer.volume);
      }
      dbDisp.textContent = this._volToDb(mixer.volume);
    });
    col.append(lbl, dbDisp, fader);
    wrap.appendChild(col);
    wrap.appendChild(this._buildVUBar(mixer.id, 'R'));
    return wrap;
  }

  _buildVUBar(mixerId, ch) {
    const col = document.createElement('div'); col.className = 'ap-vu-col';
    const track = document.createElement('div'); track.className = 'ap-vu-track';
    const fill = document.createElement('div'); fill.className = 'ap-vu-fill';
    if (ch === 'L') fill.dataset.meterL = mixerId; else fill.dataset.meterR = mixerId;
    const peak = document.createElement('div'); peak.className = 'ap-vu-peak';
    if (ch === 'L') peak.dataset.peakL = mixerId; else peak.dataset.peakR = mixerId;
    track.append(fill, peak);
    const lbl = document.createElement('div'); lbl.className = 'ap-vu-lbl'; lbl.textContent = ch;
    col.append(track, lbl);

    // Cache refs so updateMeters never calls querySelector
    if (!this._meterEls) this._meterEls = {};
    if (!this._meterEls[mixerId]) this._meterEls[mixerId] = {};
    if (ch === 'L') { this._meterEls[mixerId].fillL = fill; this._meterEls[mixerId].peakL = peak; }
    else            { this._meterEls[mixerId].fillR = fill; this._meterEls[mixerId].peakR = peak; }

    return col;
  }

  // ── Pan knob ─────────────────────────────────────────────────────────────

  _buildPanKnob(mixer) {
    const wrap = document.createElement('div'); wrap.className = 'ap-pan-wrap';
    const lbl = document.createElement('div'); lbl.className = 'ap-pan-label'; lbl.textContent = 'PAN';
    wrap.appendChild(lbl);
    const kw = document.createElement('div'); kw.className = 'ap-knob-wrap';
    const canvas = document.createElement('canvas'); canvas.className = 'ap-knob'; canvas.width = 34; canvas.height = 34;
    canvas.title = 'Drag to pan (dbl-click to reset)';
    const ps = { v: mixer.pan != null ? mixer.pan : 0 };
    this._drawKnob(canvas, ps.v);
    let drag = false, sy = 0, sv = 0;
    canvas.addEventListener('mousedown', (e) => { drag = true; sy = e.clientY; sv = ps.v; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      ps.v = Math.max(-1, Math.min(1, sv + (sy - e.clientY) / 100));
      mixer.pan = ps.v; this._drawKnob(canvas, ps.v); panVal.textContent = this._panLabel(ps.v);
    });
    window.addEventListener('mouseup', () => { drag = false; });
    canvas.addEventListener('dblclick', () => { ps.v = 0; mixer.pan = 0; this._drawKnob(canvas, 0); panVal.textContent = 'C'; });
    kw.appendChild(canvas); wrap.appendChild(kw);
    const panVal = document.createElement('div'); panVal.className = 'ap-pan-val'; panVal.textContent = this._panLabel(ps.v);
    wrap.appendChild(panVal);
    return wrap;
  }

  _drawKnob(canvas, v) {
    const ctx = canvas.getContext('2d'), cx = canvas.width/2, cy = canvas.height/2, r = cx - 4;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0.75*Math.PI, 2.25*Math.PI);
    ctx.strokeStyle = '#313545'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    const s = 1.5*Math.PI, e = s + v*0.75*Math.PI;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(s,e), Math.max(s,e));
    ctx.strokeStyle = v < 0 ? '#d19a66' : v > 0 ? '#6ec6e8' : '#478cbf'; ctx.lineWidth = 4; ctx.stroke();
    const a = s + v*0.75*Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx+Math.cos(a)*r*0.7, cy+Math.sin(a)*r*0.7);
    ctx.strokeStyle = '#dde3f0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fillStyle = '#dde3f0'; ctx.fill();
  }

  // ── Send / EQ / FX ───────────────────────────────────────────────────────

  _buildSendRow(mixer) {
    const row = document.createElement('div'); row.className = 'ap-send-row';

    const lbl = document.createElement('label'); lbl.className = 'ap-send-label'; lbl.textContent = 'Send →';
    row.appendChild(lbl);

    const sel = document.createElement('select'); sel.className = 'ap-send-select';
    if (this.engine && this.engine.masterMixer) {
      const opt = document.createElement('option'); opt.value = this.engine.masterMixer.id; opt.textContent = '♦ Master';
      if ((mixer.sendTo || this.engine.masterMixer.id) === this.engine.masterMixer.id) opt.selected = true;
      sel.appendChild(opt);
    }
    if (this.engine && this.engine.mixers) {
      for (const m of this.engine.mixers.values()) {
        if (m.isMaster || m.id === mixer.id) continue;
        const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
        if (mixer.sendTo === m.id) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    sel.addEventListener('change', () => { mixer.sendTo = sel.value; if (this.engine && this.engine.setSendTarget) this.engine.setSendTarget(mixer.id, sel.value); });
    row.appendChild(sel);

    // Send level — radial knob (same style as pan, 0→1 range)
    const levelWrap = document.createElement('div'); levelWrap.className = 'ap-pan-wrap';
    const levelLbl = document.createElement('div'); levelLbl.className = 'ap-pan-label'; levelLbl.textContent = 'LVL';
    levelWrap.appendChild(levelLbl);

    const kw = document.createElement('div'); kw.className = 'ap-knob-wrap';
    const canvas = document.createElement('canvas'); canvas.className = 'ap-knob'; canvas.width = 34; canvas.height = 34;
    canvas.title = 'Drag to set send level (dbl-click to reset to 100%)';

    const sv = { v: mixer.sendLevel != null ? mixer.sendLevel : 1 };
    this._drawSendKnob(canvas, sv.v);

    let drag = false, startY = 0, startV = 0;
    canvas.addEventListener('mousedown', (e) => { drag = true; startY = e.clientY; startV = sv.v; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      sv.v = Math.max(0, Math.min(1, startV + (startY - e.clientY) / 100));
      mixer.sendLevel = sv.v;
      this._drawSendKnob(canvas, sv.v);
      levelVal.textContent = Math.round(sv.v * 100) + '%';
    });
    window.addEventListener('mouseup', () => { drag = false; });
    canvas.addEventListener('dblclick', () => {
      sv.v = 1; mixer.sendLevel = 1;
      this._drawSendKnob(canvas, 1); levelVal.textContent = '100%';
    });

    kw.appendChild(canvas); levelWrap.appendChild(kw);
    const levelVal = document.createElement('div'); levelVal.className = 'ap-pan-val';
    levelVal.textContent = Math.round(sv.v * 100) + '%';
    levelWrap.appendChild(levelVal);
    row.appendChild(levelWrap);

    return row;
  }

  // Draw a 0→1 knob (sweeps from 7 o'clock to 5 o'clock, same arc as pan)
  _drawSendKnob(canvas, v) {
    const ctx = canvas.getContext('2d'), cx = canvas.width/2, cy = canvas.height/2, r = cx - 4;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Track arc
    ctx.beginPath(); ctx.arc(cx, cy, r, 0.75*Math.PI, 2.25*Math.PI);
    ctx.strokeStyle = '#313545'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    // Value arc — sweeps from 7 o'clock (0.75π) by v * 1.5π
    const startA = 0.75*Math.PI, endA = startA + v * 1.5*Math.PI;
    ctx.beginPath(); ctx.arc(cx, cy, r, startA, endA);
    ctx.strokeStyle = v > 0.8 ? '#6ec6e8' : v > 0.4 ? '#478cbf' : '#2d6080';
    ctx.lineWidth = 4; ctx.stroke();
    // Pointer line
    const a = startA + v * 1.5*Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a)*r*0.7, cy + Math.sin(a)*r*0.7);
    ctx.strokeStyle = '#dde3f0'; ctx.lineWidth = 2; ctx.stroke();
    // Centre dot
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fillStyle = '#dde3f0'; ctx.fill();
  }

  _buildEQPanel(mixer) {
    const panel = document.createElement('div'); panel.className = 'ap-eq-panel' + (this.expandedEQ.has(mixer.id) ? ' ap-eq-panel--open' : '');
    [{ key:'eqLow',label:'LOW',freq:'80Hz',def:mixer.eqLow??0 },{ key:'eqMid',label:'MID',freq:'1kHz',def:mixer.eqMid??0 },{ key:'eqHigh',label:'HIGH',freq:'12kHz',def:mixer.eqHigh??0 }].forEach(band => {
      const col = document.createElement('div'); col.className = 'ap-eq-band';
      const bL = document.createElement('div'); bL.className = 'ap-eq-band-label'; bL.textContent = band.label;
      const fL = document.createElement('div'); fL.className = 'ap-eq-freq-label'; fL.textContent = band.freq;
      const dbD = document.createElement('div'); dbD.className = 'ap-eq-db'; dbD.textContent = (band.def>=0?'+':'')+band.def.toFixed(1)+'dB';
      const sl = document.createElement('input'); sl.type='range'; sl.className='ap-eq-slider'; sl.min='-12'; sl.max='12'; sl.step='0.5'; sl.value=String(band.def);
      sl.addEventListener('input', () => { const v=parseFloat(sl.value); mixer[band.key]=v; dbD.textContent=(v>=0?'+':'')+v.toFixed(1)+'dB'; if(this.engine&&this.engine.setEQ)this.engine.setEQ(mixer.id,band.key,v); });
      col.append(bL,fL,dbD,sl); panel.appendChild(col);
    });
    return panel;
  }

  _buildFXRack(mixer) {
    const rack = document.createElement('div'); rack.className = 'ap-fx-rack' + (this.expandedFx.has(mixer.id) ? ' ap-fx-rack--open' : '');
    if (!mixer.effects) mixer.effects = [];
    const addBar = document.createElement('div'); addBar.className = 'ap-fx-add-bar';
    const fxSel = document.createElement('select'); fxSel.className = 'ap-fx-sel';
    ['— Add Effect —','Reverb','Delay','Compressor','Distortion','Chorus','Phaser','BitCrusher'].forEach(n => {
      const opt = document.createElement('option'); opt.textContent=n; opt.value=n==='— Add Effect —'?'':n; fxSel.appendChild(opt);
    });
    const fxList = document.createElement('div'); fxList.className = 'ap-fx-list';
    addBar.append(fxSel, this._mkBtn('Add','ap-fx-add-btn',() => { const t=fxSel.value; if(!t)return; mixer.effects.push({id:crypto.randomUUID(),type:t,enabled:true,params:this._defaultFxParams(t)}); fxSel.value=''; if(this.engine&&this.engine.rebuildFx)this.engine.rebuildFx(mixer.id); this._rerenderFXList(mixer,fxList); }));
    rack.appendChild(addBar); this._rerenderFXList(mixer,fxList); rack.appendChild(fxList);
    return rack;
  }

  _rerenderFXList(mixer, fxList) {
    fxList.innerHTML = '';
    (mixer.effects||[]).forEach((fx,idx) => {
      const row = document.createElement('div'); row.className='ap-fx-row';
      const handle = document.createElement('span'); handle.className='ap-fx-drag'; handle.textContent='⠿';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=fx.enabled!==false; cb.className='ap-fx-enable';
      cb.addEventListener('change',()=>{ fx.enabled=cb.checked; if(this.engine&&this.engine.rebuildFx)this.engine.rebuildFx(mixer.id); });
      const nm = document.createElement('span'); nm.className='ap-fx-name'; nm.textContent=fx.type;
      const pBtn = this._mkBtn('✎','ap-fx-params-btn',()=>{
        const existing = fxList.querySelector('.ap-fx-params[data-fx-id="'+fx.id+'"]');
        if (existing) { existing.remove(); return; }
        // Remove any other open params panels first
        fxList.querySelectorAll('.ap-fx-params').forEach(p => p.remove());
        const panel = this._buildFxParams(fx);
        panel.dataset.fxId = fx.id;
        // Insert after this row
        row.insertAdjacentElement('afterend', panel);
      }); pBtn.title='Edit parameters';
      const del = this._mkBtn('✕','ap-fx-del-btn',()=>{ mixer.effects.splice(idx,1); if(this.engine&&this.engine.rebuildFx)this.engine.rebuildFx(mixer.id); this._rerenderFXList(mixer,fxList); });
      row.append(handle,cb,nm,pBtn,del); fxList.appendChild(row);
    });
  }

  _buildFxParams(fx) {
    const wrap = document.createElement('div'); wrap.className='ap-fx-params';
    Object.entries(fx.params||{}).forEach(([key,val]) => {
      const row = document.createElement('div'); row.className='ap-fx-param-row';
      const lbl = document.createElement('label'); lbl.className='ap-fx-param-label'; lbl.textContent=key;
      const ctrl = document.createElement('div'); ctrl.className='ap-fx-param-control';
      const meta = this._fxParamMeta(fx.type,key);
      const inp = document.createElement('input'); inp.type='range'; inp.className='ap-fx-param-slider';
      inp.min=String(meta.min); inp.max=String(meta.max); inp.step=String(meta.step); inp.value=String(val);
      const dv = document.createElement('span'); dv.className='ap-fx-param-val'; dv.textContent=val+(meta.unit||'');
      inp.addEventListener('input',()=>{ fx.params[key]=parseFloat(inp.value); dv.textContent=inp.value+(meta.unit||''); if(this.engine&&this.engine.rebuildFx)this.engine.rebuildFx(mixer.id); });
      ctrl.append(inp,dv);
      row.append(lbl,ctrl);
      wrap.appendChild(row);
    });
    return wrap;
  }

  _defaultFxParams(t) { return ({Reverb:{roomSize:.5,damping:.5,wet:.3},Delay:{time:.25,feedback:.4,wet:.3},Compressor:{threshold:-24,ratio:4,attack:.003,release:.25},Distortion:{drive:.5,tone:.5,wet:.7},Chorus:{rate:1.5,depth:.7,feedback:.3,wet:.5},Phaser:{rate:.5,depth:.6,feedback:.7,wet:.5},BitCrusher:{bits:8,normFreq:.1,wet:.5}})[t]||{}; }

  _fxParamMeta(t,k) {
    const all = {roomSize:{min:0,max:1,step:.01,unit:''},damping:{min:0,max:1,step:.01,unit:''},wet:{min:0,max:1,step:.01,unit:''},time:{min:0,max:2,step:.01,unit:'s'},feedback:{min:0,max:.95,step:.01,unit:''},threshold:{min:-60,max:0,step:1,unit:'dB'},ratio:{min:1,max:20,step:.5,unit:':1'},attack:{min:0,max:1,step:.001,unit:'s'},release:{min:0,max:2,step:.01,unit:'s'},drive:{min:0,max:1,step:.01,unit:''},tone:{min:0,max:1,step:.01,unit:''},rate:{min:.1,max:10,step:.1,unit:'Hz'},depth:{min:0,max:1,step:.01,unit:''},bits:{min:1,max:16,step:1,unit:'bit'},normFreq:{min:.001,max:1,step:.001,unit:''}};
    return all[k]||{min:0,max:1,step:.01,unit:''};
  }

  // ── Global Clip List ──────────────────────────────────────────────────────

  _buildDetailPanel() {
    const panel = document.createElement('div'); panel.className='ap-detail-panel'; panel.dataset.detailPanel='1';
    const cs = document.createElement('div'); cs.className='ap-clip-section'; cs.dataset.clipSection='1';
    const ct = document.createElement('div'); ct.className='ap-section-title'; ct.textContent='Audio Clips';
    cs.appendChild(ct);
    this._renderClipList(cs);
    panel.appendChild(cs);
    return panel;
  }

  _refreshDetailPanel() {
    const cs = this.container.querySelector('[data-clip-section]');
    if (cs) this._renderClipList(cs);
  }

  _renderClipList(clipSection) {
    clipSection.querySelectorAll('.ap-clip-list,.ap-clip-add-bar,.ap-empty-notice').forEach(e=>e.remove());
    this._ensureEngine();
    const clips = this.engine.clips;

    const addBar = document.createElement('div'); addBar.className='ap-clip-add-bar';
    addBar.appendChild(this._mkBtn('+ Import Clip','ap-toolbar-btn',()=>this._importClip(clipSection)));
    clipSection.appendChild(addBar);

    const list = document.createElement('div'); list.className='ap-clip-list';
    list.addEventListener('dragover',(e)=>{e.preventDefault();list.classList.add('ap-drop-active');});
    list.addEventListener('dragleave',()=>list.classList.remove('ap-drop-active'));
    list.addEventListener('drop',(e)=>{
      e.preventDefault(); list.classList.remove('ap-drop-active');
      const path=e.dataTransfer.getData('text/plain')||'';
      if(!path||clips.find(c=>c.path===path))return;
      clips.push(this._makeClip(path)); this._syncClipRegistry(); this._renderClipList(clipSection);
    });

    if (!clips.length) {
      const empty = document.createElement('div'); empty.className='ap-empty-notice'; empty.textContent='Click "+ Import Clip" or drop audio files here';
      list.appendChild(empty);
    } else {
      clips.forEach((clip,idx)=>list.appendChild(this._buildClipRow(clip,idx,clips,clipSection)));
    }
    clipSection.appendChild(list);
  }

  _importClip(clipSection) {
    (async () => {
      if (!window.electronAPI?.importProjectAsset) {
        if (typeof setStatus==='function') setStatus('Import not available — add files to assets/audio/ manually.',true); return;
      }
      const result = await window.electronAPI.importProjectAsset({assetType:'audio'});
      if (!result?.success) return;
      if (typeof refreshFilesystem==='function') await refreshFilesystem();
      const path = result.resPath||result.filePath||'';
      if (path) {
        this._ensureEngine();
        if (!this.engine.clips.find(c=>c.path===path)) { this.engine.clips.push(this._makeClip(path)); this._syncClipRegistry(); }
      }
      this._renderClipList(clipSection);
      if (typeof setStatus==='function') setStatus('Imported '+(result.resPath||result.filePath||'audio')+'.');
    })();
  }

  _makeClip(path) {
    return { id: crypto.randomUUID(), path, busId: (this.engine&&this.engine.masterMixer)?this.engine.masterMixer.id:'master', volume:1, pitch:1, loop:false, oneShot:false, playOnAwake:false };
  }

  _syncClipRegistry() {
    if (!window._rgeAudioClips) window._rgeAudioClips = {};
    if (!this.engine||!Array.isArray(this.engine.clips)) return;
    for (const clip of this.engine.clips) window._rgeAudioClips[clip.id] = clip;
  }

  _getBusOptions() {
    const opts = [];
    if (this.engine&&this.engine.mixers) for (const m of this.engine.mixers.values()) opts.push({id:m.id,name:m.isMaster?'Master':m.name});
    return opts;
  }

  // ── Audio preview ─────────────────────────────────────────────────────────
  // Single shared audio element — only one clip previews at a time.
  _getPreviewPlayer() {
    if (!this._previewAudio) {
      this._previewAudio = new Audio();
      this._previewAudio.addEventListener('ended', () => this._stopPreview());
      this._previewAudio.addEventListener('error', () => this._stopPreview());
    }
    return this._previewAudio;
  }

  async _previewClip(clip, btn) {
    // If this clip is already playing, stop it
    if (this._previewingClipId === clip.id) {
      this._stopPreview();
      return;
    }
    // Stop any other preview
    this._stopPreview();

    // First try to play through the real engine so mixer, VU, and live controls all work
    if (this.engine && this.engine.playEventOnBus) {
      btn.textContent = '⏹';
      btn.classList.add('ap-preview-btn--playing');
      this._previewingClipId = clip.id;
      this._previewingBtn = btn;
      const voiceId = await this.engine.playEventOnBus(clip.path, {
        busId:   clip.busId  || 'master',
        volume:  clip.volume ?? 1,
        pitch:   clip.pitch  ?? 1,
        loop:    false,
        oneShot: true,
      });
      if (voiceId) {
        this._previewVoiceId = voiceId;
        // Poll for voice end to reset button
        const checkDone = setInterval(() => {
          const v = this.engine._voices && this.engine._voices.get(voiceId);
          if (!v || !v.active) {
            clearInterval(checkDone);
            if (this._previewingClipId === clip.id) this._stopPreview();
          }
        }, 200);
        this._previewDoneInterval = checkDone;
        return;
      }
      // Engine play failed — fall through to HTMLAudio fallback
      this._previewingClipId = null;
      this._previewingBtn = null;
      btn.textContent = '▶';
      btn.classList.remove('ap-preview-btn--playing');
    }

    // Fallback: HTMLAudioElement (no mixer routing, but still works)
    btn.textContent = '⏹';
    btn.classList.add('ap-preview-btn--playing');
    this._previewingClipId = clip.id;
    this._previewingBtn = btn;

    const player = this._getPreviewPlayer();
    player.volume = Math.min(1, Math.max(0, clip.volume ?? 1));
    player.playbackRate = Math.min(4, Math.max(0.25, clip.pitch ?? 1));
    player.loop = false;

    try {
      if (window.electronAPI?.readProjectAsset && clip.path) {
        const result = await window.electronAPI.readProjectAsset({ resourcePath: clip.path });
        if (result?.success && result.dataUrl) {
          player.src = result.dataUrl;
          await player.play();
          return;
        }
      }
      const url = clip.path.startsWith('res://') ? clip.path.replace('res://', '') : clip.path;
      player.src = url;
      await player.play();
    } catch (err) {
      console.warn('[AudioPanel] Preview failed:', err);
      this._stopPreview();
      if (typeof setStatus === 'function') setStatus('Could not preview: ' + (clip.path.split('/').pop() || clip.path), true);
    }
  }

  _stopPreview() {
    if (this._previewDoneInterval) { clearInterval(this._previewDoneInterval); this._previewDoneInterval = null; }
    if (this._previewVoiceId && this.engine && this.engine.stopVoice) {
      this.engine.stopVoice(this._previewVoiceId);
      this._previewVoiceId = null;
    }
    if (this._previewAudio) {
      this._previewAudio.pause();
      this._previewAudio.src = '';
    }
    if (this._previewingBtn) {
      this._previewingBtn.textContent = '▶';
      this._previewingBtn.classList.remove('ap-preview-btn--playing');
    }
    this._previewingClipId = null;
    this._previewingBtn = null;
  }

  _buildClipRow(clip, idx, clips, clipSection) {
    const row = document.createElement('div'); row.className='ap-clip-row';

    // ── Top line: preview | name | bus | checks | reset | del ──
    const topLine = document.createElement('div'); topLine.className='ap-clip-top';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'ap-preview-btn'; previewBtn.title = 'Preview clip'; previewBtn.textContent = '▶';
    previewBtn.addEventListener('click', () => this._previewClip(clip, previewBtn));

    const name = document.createElement('span');
    name.className='ap-clip-name'; name.title=clip.path;
    name.textContent=clip.path.split('/').pop().replace(/^res:\/\//,'')||clip.path;

    const busLbl = document.createElement('label'); busLbl.className='ap-clip-prop-label'; busLbl.textContent='Bus';
    const busSel = document.createElement('select'); busSel.className='ap-clip-bus-sel';
    const busOpts = this._getBusOptions();
    if (!busOpts.length) { const o=document.createElement('option');o.value='master';o.textContent='Master';busSel.appendChild(o); }
    else { busOpts.forEach(b=>{ const o=document.createElement('option');o.value=b.id;o.textContent=b.name;if((clip.busId||'master')===b.id)o.selected=true;busSel.appendChild(o); }); }
    busSel.addEventListener('change',()=>{ clip.busId=busSel.value; this._syncClipRegistry(); });

    // Checkboxes
    const loopLbl = document.createElement('label'); loopLbl.className='ap-clip-prop-label'; loopLbl.textContent='Loop';
    const loopCb = document.createElement('input'); loopCb.type='checkbox'; loopCb.checked=!!clip.loop; loopCb.className='ap-clip-cb';
    loopCb.addEventListener('change',()=>{ clip.loop=loopCb.checked; this._syncClipRegistry(); this._syncLinked(clip,'loop'); });
    const osLbl = document.createElement('label'); osLbl.className='ap-clip-prop-label'; osLbl.textContent='1-Shot';
    const osCb = document.createElement('input'); osCb.type='checkbox'; osCb.checked=!!clip.oneShot; osCb.className='ap-clip-cb';
    osCb.addEventListener('change',()=>{ clip.oneShot=osCb.checked; this._syncClipRegistry(); this._syncLinked(clip,'oneShot'); });
    const pawLbl = document.createElement('label'); pawLbl.className='ap-clip-prop-label'; pawLbl.textContent='On Awake';
    const pawCb = document.createElement('input'); pawCb.type='checkbox'; pawCb.checked=!!clip.playOnAwake; pawCb.className='ap-clip-cb';
    pawCb.title='Play automatically when the scene loads';
    pawCb.addEventListener('change',()=>{ clip.playOnAwake=pawCb.checked; this._syncClipRegistry(); });

    const cbGroup = document.createElement('div'); cbGroup.className='ap-clip-checks';
    cbGroup.append(loopLbl,loopCb,osLbl,osCb,pawLbl,pawCb);

    // Reset button — resets vol + pitch to defaults
    const resetBtn = this._mkBtn('↺','ap-clip-reset',()=>{
      clip.volume=1; clip.pitch=1;
      volSl.value='1'; volVal.textContent='1.00';
      pitchSl.value='1'; pitchVal.textContent='1.00';
      this._syncClipRegistry();
      this._syncLinked(clip,'volume'); this._syncLinked(clip,'pitch');
      if(this.engine&&this.engine.updateClipPlayback) this.engine.updateClipPlayback(clip.path,{volume:1,pitch:1});
    });
    resetBtn.title='Reset volume and pitch to defaults';

    const del = this._mkBtn('✕','ap-clip-del',()=>{
      if(this._previewingClipId===clip.id) this._stopPreview();
      clips.splice(idx,1); this._syncClipRegistry(); this._renderClipList(clipSection);
    });

    topLine.append(previewBtn, name, busLbl, busSel, cbGroup, resetBtn, del);

    // ── Bottom line: two full-width sliders ──
    const bottomLine = document.createElement('div'); bottomLine.className='ap-clip-sliders-row';

    // Volume slider
    const volWrap = document.createElement('div'); volWrap.className='ap-clip-slider-wrap';
    const volLbl = document.createElement('label'); volLbl.className='ap-clip-prop-label'; volLbl.textContent='Vol';
    const volVal = document.createElement('span'); volVal.className='ap-clip-prop-val'; volVal.textContent=(clip.volume??1).toFixed(2);
    const volSl = document.createElement('input'); volSl.type='range'; volSl.className='ap-clip-slider';
    volSl.min='0'; volSl.max='1.5'; volSl.step='0.01'; volSl.value=String(clip.volume??1);
    volSl.addEventListener('input',()=>{
      clip.volume=parseFloat(volSl.value); volVal.textContent=clip.volume.toFixed(2);
      this._syncClipRegistry();
      if(this.engine&&this.engine.updateClipPlayback) this.engine.updateClipPlayback(clip.path,{volume:clip.volume});
      clearTimeout(this._syncLinkedTimer);
      this._syncLinkedTimer=setTimeout(()=>this._syncLinked(clip,'volume'),150);
    });
    volSl.addEventListener('change',()=>{ this._syncLinked(clip,'volume'); });
    volWrap.append(volLbl, volVal, volSl);

    // Pitch slider
    const pitchWrap = document.createElement('div'); pitchWrap.className='ap-clip-slider-wrap';
    const pitchLbl = document.createElement('label'); pitchLbl.className='ap-clip-prop-label'; pitchLbl.textContent='Pitch';
    const pitchVal = document.createElement('span'); pitchVal.className='ap-clip-prop-val'; pitchVal.textContent=(clip.pitch??1).toFixed(2);
    const pitchSl = document.createElement('input'); pitchSl.type='range'; pitchSl.className='ap-clip-slider';
    pitchSl.min='0.25'; pitchSl.max='2'; pitchSl.step='0.01'; pitchSl.value=String(clip.pitch??1);
    pitchSl.addEventListener('input',()=>{
      clip.pitch=parseFloat(pitchSl.value); pitchVal.textContent=clip.pitch.toFixed(2);
      this._syncClipRegistry();
      if(this.engine&&this.engine.updateClipPlayback) this.engine.updateClipPlayback(clip.path,{pitch:clip.pitch});
      clearTimeout(this._syncLinkedTimer);
      this._syncLinkedTimer=setTimeout(()=>this._syncLinked(clip,'pitch'),150);
    });
    pitchSl.addEventListener('change',()=>{ this._syncLinked(clip,'pitch'); });
    pitchWrap.append(pitchLbl, pitchVal, pitchSl);

    bottomLine.append(volWrap, pitchWrap);
    row.append(topLine, bottomLine);
    return row;
  }

  // Push clip field changes into any AudioSourceComponent referencing this clip
  _syncLinked(clip, field) {
    try {
      const allNodes = (window.state&&window.state.scene&&window.state.scene.nodes) ? Object.values(window.state.scene.nodes) : [];
      for (const node of allNodes) {
        if (!Array.isArray(node.components)) continue;
        for (const comp of node.components) {
          if (comp.type==='AudioSourceComponent'&&comp.resourcePath===clip.path) comp[field]=clip[field];
        }
      }
    } catch(_) {}
  }

  // ── Meter loop ───────────────────────────────────────────────────────────

  _startMeterLoop() {
    // SLUGGISH-FIX: Only run meter loop when panel is mounted and audio is active.
    // Previously the loop ran continuously even when the audio panel was hidden
    // or when no clips were playing, consuming a full rAF slot every frame.
    if (this._meterLoopActive) return;
    this._meterLoopActive = true;
    const tick = (ts) => {
      if (!this._meterLoopActive) return;
      // Pause loop if no audio context or context is not running
      const ctx = this._engine?.context;
      const hasActiveClips = this._engine?.clips?.some(c => c._source) ?? false;
      if (!ctx || ctx.state !== 'running' || !hasActiveClips) {
        // Park: re-check in 500 ms via setTimeout, not rAF
        this._meterFrame = setTimeout(() => {
          this._meterFrame = null;
          if (this._meterLoopActive) tick(performance.now());
        }, 500);
        return;
      }
      this.updateMeters(ts);
      this._meterFrame = requestAnimationFrame(tick);
    };
    this._meterFrame = requestAnimationFrame(tick);
  }

  updateMeters(ts) {
    if (ts==null) ts=performance.now();
    if (ts-this.lastMeterFrame<this.meterFrameInterval) return;
    this.lastMeterFrame=ts;
    if (!this.engine||!this.engine.mixers) return;
    if (!this._meterEls) return; // refs not built yet
    for (const mixer of this.engine.mixers.values()) {
      const els = this._meterEls[mixer.id];
      if (!els) continue;
      const level=(this.engine.getMeterLevel&&this.engine.getMeterLevel(mixer.id))||0;
      const lv=Math.min(1,level*(0.9+Math.random()*.1)), rv=Math.min(1,level*(0.85+Math.random()*.15));
      if (!this.meterState.has(mixer.id)) this.meterState.set(mixer.id,{holdL:0,holdR:0,tL:0,tR:0});
      const ms=this.meterState.get(mixer.id);
      if(lv>=ms.holdL){ms.holdL=lv;ms.tL=ts+1500;}else if(ts>ms.tL)ms.holdL=Math.max(0,ms.holdL-.008);
      if(rv>=ms.holdR){ms.holdR=rv;ms.tR=ts+1500;}else if(ts>ms.tR)ms.holdR=Math.max(0,ms.holdR-.008);
      const apply=(fill,fVal,peak,pVal)=>{
        if(!fill||!peak)return;
        const pct=(fVal*100).toFixed(1)+'%', pkPct=(pVal*100).toFixed(1)+'%';
        if(fill.style.height!==pct)fill.style.height=pct;
        if(peak.style.bottom!==pkPct)peak.style.bottom=pkPct;
        const col=fVal>.9?'#e06c75':fVal>.7?'#e5c97a':'#6dbd79';
        if(fill.style.background!==col)fill.style.background=col;
      };
      apply(els.fillL,lv,els.peakL,ms.holdL);
      apply(els.fillR,rv,els.peakR,ms.holdR);
    }
  }

  // ── Engine bootstrap ─────────────────────────────────────────────────────

  _ensureEngine() {
    if (!this.engine) this.engine = RGE_ROOT.RGEAudioEngine;
    if (!this.engine.mixers) this.engine.mixers = new Map();
    if (!Array.isArray(this.engine.clips)) this.engine.clips = [];
    // Ensure master bus exists
    const master = Array.from(this.engine.mixers.values()).find(m => m.isMaster);
    if (!master && this.engine.createMixer) {
      const m = this.engine.createMixer('Master');
      m.isMaster = true;
      this.engine.masterMixer = m;
    } else if (master) {
      this.engine.masterMixer = master;
    }
    this._syncClipRegistry();
  }

  // Update the dB readout for a specific mixer's fader
  _updateVolDisplay(id) {
    const el = this.container && this.container.querySelector(`[data-mixer-vol="${id}"]`);
    const mx = this.engine && this.engine.mixers.get(id);
    if (el && mx) el.textContent = this._volToDb(mx.volume);
  }

  // Sync mute button visual state for all strips
  _syncMuteButtons() {
    if (!this.container) return;
    for (const mx of this.engine.mixers.values()) {
      const strip = this.container.querySelector(`.ap-strip[data-mixer-id="${mx.id}"]`);
      if (!strip) continue;
      const btn = strip.querySelector('.ap-ms-mute');
      if (btn) btn.classList.toggle('active', !!(mx.muted || mx._soloMuted));
    }
  }

  // Sync solo button visual state for all strips
  _syncSoloButtons() {
    if (!this.container) return;
    for (const mx of this.engine.mixers.values()) {
      const strip = this.container.querySelector(`.ap-strip[data-mixer-id="${mx.id}"]`);
      if (!strip) continue;
      const btn = strip.querySelector('.ap-ms-solo');
      if (btn) btn.classList.toggle('active', !!mx.solo);
    }
  }

  _createSubMixer() {
    this._ensureEngine();
    const n=Array.from(this.engine.mixers.values()).filter(m=>!m.isMaster).length;
    const mx=this.engine.createMixer('Bus '+(n+1));
    if (!mx) return;
    this._rebuildStripArea();
    this._refreshDetailPanel(); // refresh bus dropdowns
  }

  _deleteMixer(id) {
    if (!this.engine||!this.engine.mixers) return;
    this.engine.mixers.delete(id);
    if (this.selectedMixerId===id) this.selectedMixerId=null;
    // Reroute clips on deleted bus to master
    if (Array.isArray(this.engine.clips)) {
      const mid=this.engine.masterMixer?this.engine.masterMixer.id:'master';
      for (const c of this.engine.clips) if(c.busId===id) c.busId=mid;
      this._syncClipRegistry();
    }
    this._rebuildStripArea();
    this._refreshDetailPanel();
  }

  _inlineRename(nameEl, mixer) {
    const inp=document.createElement('input'); inp.className='ap-inline-rename'; inp.value=mixer.name;
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    const commit=()=>{ const n=inp.value.trim()||mixer.name; mixer.name=n; if(this.engine&&this.engine.renameMixer)this.engine.renameMixer(mixer.id,n); inp.replaceWith(nameEl); nameEl.textContent=n; this._refreshDetailPanel(); };
    inp.addEventListener('blur',commit);
    inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter')commit(); if(e.key==='Escape')inp.replaceWith(nameEl); });
  }

  _mkBtn(lbl,cls,fn) { const b=document.createElement('button'); b.type='button'; b.className=cls; b.textContent=lbl; b.addEventListener('click',fn); return b; }
  _volToDb(v) { if(v<=0)return'-∞'; const d=20*Math.log10(v); return(d>=0?'+':'')+d.toFixed(1)+' dB'; }
  _panLabel(v) { if(Math.abs(v)<.01)return'C'; const p=Math.round(Math.abs(v)*100); return v<0?'L'+p:'R'+p; }
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
