globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * rge_bus.js — RGE v91 Central Event Bus
 *
 * Lightweight publish/subscribe bus used by every new v91 system.
 * Must be loaded before all other v91 modules.
 *
 * API:
 *   RGEBus.on(event, handler)    → unsubscribe fn
 *   RGEBus.once(event, handler)  → unsubscribe fn
 *   RGEBus.off(event, handler)
 *   RGEBus.emit(event, data)
 *   RGEBus.clear(event?)
 *
 * Design rules:
 *  - Handlers are called synchronously (microtask-safe).
 *  - Exceptions in one handler do not prevent others from running.
 *  - No memory leaks: panels must call the returned unsubscribe fn on unmount.
 *  - Wildcard event '*' receives every emission.
 */

(function () {
  'use strict';

  if (RGE_ROOT.RGEBus) return; // already loaded

  class EventBus {
    constructor() {
      /** @type {Map<string, Set<Function>>} */
      this._handlers = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {function} handler
     * @returns {function} call to unsubscribe
     */
    on(event, handler) {
      if (!this._handlers.has(event)) this._handlers.set(event, new Set());
      this._handlers.get(event).add(handler);
      return () => this.off(event, handler);
    }

    /**
     * Subscribe once; auto-removes after first call.
     */
    once(event, handler) {
      const wrapper = (data) => {
        this.off(event, wrapper);
        handler(data);
      };
      return this.on(event, wrapper);
    }

    off(event, handler) {
      const set = this._handlers.get(event);
      if (set) set.delete(handler);
    }

    /**
     * Emit an event.  Runs all handlers for the event and for '*'.
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
      for (const bucket of [this._handlers.get(event), this._handlers.get('*')]) {
        if (!bucket) continue;
        for (const handler of bucket) {
          try { handler(data, event); } catch (err) {
            console.error(`[RGEBus] Error in handler for "${event}":`, err);
          }
        }
      }
    }

    /** Remove all handlers, optionally scoped to one event. */
    clear(event) {
      if (event) {
        this._handlers.delete(event);
      } else {
        this._handlers.clear();
      }
    }

    get eventNames() {
      return Array.from(this._handlers.keys());
    }
  }

  RGE_ROOT.RGEBus = new EventBus();

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
