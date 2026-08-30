globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * animation_state_machine.js — RGE v91
 *
 * Editor-side animation graph runtime.  Mirrors the logic in animation.brs
 * so preview in the editor matches Roku exactly.
 *
 * Systems:
 *  - AnimationClip   : named sequence of frame indices + fps
 *  - AnimationState  : one node in the state graph (wraps a clip)
 *  - Transition      : directed edge with condition expression
 *  - AnimationGraph  : drives state evaluation; serialises to JSON consumed by animation.brs
 *  - AnimationController : per-entity instance; advances time, evaluates transitions
 *
 * Serialization contract (must match animation.brs schema):
 *  {
 *    id, name,
 *    parameters: { [name]: { type: 'float'|'bool'|'trigger'|'int', defaultValue } },
 *    states: [{ id, name, clipId, speed, loop }],
 *    transitions: [{ id, from, to, conditions: [{param, op, value}], hasExitTime, exitTime, duration }],
 *    defaultState: stateId,
 *    clips: [{ id, name, frames, fps, loop, spriteFramesId }]
 *  }
 */

(function () {
  'use strict';

  // ── Parameter types ────────────────────────────────────────────────────────

  const PARAM_TYPE = { FLOAT: 'float', BOOL: 'bool', TRIGGER: 'trigger', INT: 'int' };
  const OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);

  // ── AnimationClip ──────────────────────────────────────────────────────────

  class AnimationClip {
    constructor(id, name) {
      this.id = id || generateId('clip');
      this.name = name || 'Clip';
      /** @type {number[]} sprite frame indices */
      this.frames = [];
      this.fps = 8;
      this.loop = true;
      this.spriteFramesId = '';
      /** @type {Array<{frame:number, event:string, data:any}>} */
      this.events = [];
    }

    duration() {
      return this.frames.length > 0 && this.fps > 0
        ? this.frames.length / this.fps
        : 0;
    }

    toJSON() {
      return {
        id: this.id, name: this.name,
        frames: this.frames, fps: this.fps, loop: this.loop,
        spriteFramesId: this.spriteFramesId, events: this.events,
      };
    }

    static fromJSON(data) {
      const c = new AnimationClip(data.id, data.name);
      c.frames = Array.isArray(data.frames) ? data.frames : [];
      c.fps = Number(data.fps) || 8;
      c.loop = data.loop !== false;
      c.spriteFramesId = data.spriteFramesId || '';
      c.events = Array.isArray(data.events) ? data.events : [];
      return c;
    }
  }

  // ── AnimationState ─────────────────────────────────────────────────────────

  class AnimationState {
    constructor(id, name) {
      this.id = id || generateId('state');
      this.name = name || 'State';
      this.clipId = '';
      this.speed = 1.0;
      this.loop = true;
    }

    toJSON() {
      return { id: this.id, name: this.name, clipId: this.clipId, speed: this.speed, loop: this.loop };
    }

    static fromJSON(d) {
      const s = new AnimationState(d.id, d.name);
      s.clipId = d.clipId || '';
      s.speed = Number(d.speed) || 1.0;
      s.loop = d.loop !== false;
      return s;
    }
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  class Transition {
    constructor(id, from, to) {
      this.id = id || generateId('trans');
      this.from = from;   // state id or '*' for any
      this.to = to;
      /** @type {Array<{param:string, op:string, value:any}>} */
      this.conditions = [];
      this.hasExitTime = false;
      this.exitTime = 1.0;   // normalized (0–1) within clip duration
      this.duration = 0.1;   // cross-fade duration in seconds (editor display only)
    }

    evaluate(params) {
      if (this.conditions.length === 0) return false;
      return this.conditions.every(c => evalCondition(c, params));
    }

    toJSON() {
      return {
        id: this.id, from: this.from, to: this.to,
        conditions: this.conditions,
        hasExitTime: this.hasExitTime, exitTime: this.exitTime, duration: this.duration,
      };
    }

    static fromJSON(d) {
      const t = new Transition(d.id, d.from, d.to);
      t.conditions = Array.isArray(d.conditions) ? d.conditions : [];
      t.hasExitTime = !!d.hasExitTime;
      t.exitTime = Number(d.exitTime) || 1.0;
      t.duration = Number(d.duration) || 0.1;
      return t;
    }
  }

  function evalCondition(c, params) {
    const pval = params[c.param];
    if (pval === undefined) return false;
    const actual = pval.value !== undefined ? pval.value : pval;
    const target = c.value;
    switch (c.op) {
      case '==': return actual === target;
      case '!=': return actual !== target;
      case '<':  return actual < target;
      case '<=': return actual <= target;
      case '>':  return actual > target;
      case '>=': return actual >= target;
      default:   return false;
    }
  }

  // ── AnimationGraph ─────────────────────────────────────────────────────────

  class AnimationGraph {
    constructor(id, name) {
      this.id = id || generateId('graph');
      this.name = name || 'AnimationGraph';
      /** @type {Map<string, AnimationClip>} */
      this.clips = new Map();
      /** @type {Map<string, AnimationState>} */
      this.states = new Map();
      /** @type {Transition[]} */
      this.transitions = [];
      /** @type {Object<string,{type:string,defaultValue:any}>} */
      this.parameters = {};
      this.defaultStateId = '';
    }

    // ── Clip management ──────────────────────────────────────────────────

    addClip(clip) { this.clips.set(clip.id, clip); return clip; }
    removeClip(id) { this.clips.delete(id); }
    getClip(id) { return this.clips.get(id) || null; }

    createClip(name) {
      return this.addClip(new AnimationClip(generateId('clip'), name));
    }

    // ── State management ─────────────────────────────────────────────────

    addState(state) {
      this.states.set(state.id, state);
      if (!this.defaultStateId) this.defaultStateId = state.id;
      return state;
    }

    createState(name) {
      return this.addState(new AnimationState(generateId('state'), name));
    }

    removeState(id) {
      this.states.delete(id);
      this.transitions = this.transitions.filter(t => t.from !== id && t.to !== id);
      if (this.defaultStateId === id) this.defaultStateId = this.states.keys().next().value || '';
    }

    // ── Transition management ─────────────────────────────────────────────

    addTransition(fromId, toId) {
      const t = new Transition(generateId('trans'), fromId, toId);
      this.transitions.push(t);
      return t;
    }

    removeTransition(id) {
      this.transitions = this.transitions.filter(t => t.id !== id);
    }

    // ── Parameter management ──────────────────────────────────────────────

    addParameter(name, type, defaultValue) {
      if (!Object.values(PARAM_TYPE).includes(type)) throw new Error(`Unknown param type ${type}`);
      this.parameters[name] = { type, defaultValue: defaultValue ?? defaultForType(type) };
    }

    removeParameter(name) { delete this.parameters[name]; }

    // ── Serialization ─────────────────────────────────────────────────────

    toJSON() {
      return {
        id: this.id, name: this.name,
        parameters: this.parameters,
        states: Array.from(this.states.values()).map(s => s.toJSON()),
        transitions: this.transitions.map(t => t.toJSON()),
        defaultState: this.defaultStateId,
        clips: Array.from(this.clips.values()).map(c => c.toJSON()),
      };
    }

    static fromJSON(data) {
      const g = new AnimationGraph(data.id, data.name);
      g.parameters = data.parameters || {};
      g.defaultStateId = data.defaultState || '';
      (data.clips || []).forEach(c => g.clips.set(c.id, AnimationClip.fromJSON(c)));
      (data.states || []).forEach(s => g.states.set(s.id, AnimationState.fromJSON(s)));
      g.transitions = (data.transitions || []).map(t => Transition.fromJSON(t));
      return g;
    }
  }

  // ── AnimationController (per-entity instance) ──────────────────────────────

  class AnimationController {
    constructor(graph) {
      this.graph = graph;
      this.currentStateId = graph.defaultStateId || '';
      this._elapsed = 0;         // time in current state
      this._frameIndex = 0;
      /** @type {Object<string,{type:string,value:any}>} */
      this.params = {};
      this._initParams();
    }

    _initParams() {
      for (const [name, def] of Object.entries(this.graph.parameters)) {
        this.params[name] = { type: def.type, value: def.defaultValue };
      }
    }

    setFloat(name, v) { if (this.params[name]) this.params[name].value = Number(v); }
    setBool(name, v) { if (this.params[name]) this.params[name].value = !!v; }
    setInt(name, v) { if (this.params[name]) this.params[name].value = Math.round(v); }
    setTrigger(name) { if (this.params[name]) this.params[name].value = true; }
    _clearTriggers() {
      for (const p of Object.values(this.params)) {
        if (p.type === PARAM_TYPE.TRIGGER) p.value = false;
      }
    }

    /**
     * Advance time by dt seconds.
     * @returns {{ stateId, clipId, frameIndex, changed: boolean }}
     */
    update(dt) {
      const graph = this.graph;
      const state = graph.states.get(this.currentStateId);
      if (!state) return { stateId: this.currentStateId, clipId: '', frameIndex: 0, changed: false };

      const clip = graph.clips.get(state.clipId);
      const duration = clip ? clip.duration() : 0;

      this._elapsed += dt * (state.speed || 1);

      // Evaluate transitions
      let changed = false;
      const candidates = graph.transitions.filter(
        t => (t.from === this.currentStateId || t.from === '*')
      );

      for (const t of candidates) {
        const exitOk = !t.hasExitTime || (duration > 0 && this._elapsed >= t.exitTime * duration);
        if (exitOk && t.evaluate(this.params)) {
          this.currentStateId = t.to;
          this._elapsed = 0;
          this._frameIndex = 0;
          changed = true;
          break;
        }
      }

      // Compute frame index in current clip
      const newState = graph.states.get(this.currentStateId);
      const newClip = newState ? graph.clips.get(newState.clipId) : null;
      if (newClip && newClip.frames.length > 0 && newClip.fps > 0) {
        const frameF = this._elapsed * newClip.fps;
        if (newClip.loop) {
          this._frameIndex = Math.floor(frameF) % newClip.frames.length;
        } else {
          this._frameIndex = Math.min(Math.floor(frameF), newClip.frames.length - 1);
        }
      }

      // Fire events
      if (newClip && newClip.events.length > 0) {
        for (const ev of newClip.events) {
          if (this._frameIndex === ev.frame) {
            emit('animation:event', { event: ev.event, data: ev.data });
          }
        }
      }

      this._clearTriggers();

      return {
        stateId: this.currentStateId,
        clipId: newClip ? newClip.id : '',
        frameIndex: newClip ? (newClip.frames[this._frameIndex] ?? 0) : 0,
        changed,
      };
    }

    reset() {
      this.currentStateId = this.graph.defaultStateId || '';
      this._elapsed = 0;
      this._frameIndex = 0;
      this._initParams();
    }
  }

  // ── Registry ───────────────────────────────────────────────────────────────

  class AnimationGraphRegistry {
    constructor() {
      /** @type {Map<string, AnimationGraph>} */
      this._graphs = new Map();
    }

    register(graph) { this._graphs.set(graph.id, graph); return graph; }
    get(id) { return this._graphs.get(id) || null; }
    list() { return Array.from(this._graphs.values()); }
    remove(id) { this._graphs.delete(id); }

    createGraph(name) {
      const g = new AnimationGraph(generateId('graph'), name);
      return this.register(g);
    }

    serialize() {
      return Array.from(this._graphs.values()).map(g => g.toJSON());
    }

    deserialize(data) {
      if (!Array.isArray(data)) return;
      for (const raw of data) {
        const g = AnimationGraph.fromJSON(raw);
        this._graphs.set(g.id, g);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  let _idCounter = 0;
  function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
  }

  function defaultForType(type) {
    if (type === PARAM_TYPE.BOOL || type === PARAM_TYPE.TRIGGER) return false;
    return 0;
  }

  function emit(event, data) {
    try {
      if (RGE_ROOT.RGEBus && typeof RGE_ROOT.RGEBus.emit === 'function')
        RGE_ROOT.RGEBus.emit(event, data);
    } catch (_) {}
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  RGE_ROOT.RGEAnimation = {
    registry: new AnimationGraphRegistry(),
    AnimationGraph,
    AnimationClip,
    AnimationState,
    Transition,
    AnimationController,
    AnimationGraphRegistry,
    PARAM_TYPE,
  };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
