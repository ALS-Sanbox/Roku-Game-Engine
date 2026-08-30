globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class ListenerRegistry {
  constructor() {
    this.listeners = new Map();
  }

  add(target, type, handler) {
    const key = `${type}_${handler.name}`;

    if (this.listeners.has(key)) {
      return false;
    }

    target.addEventListener(type, handler);
    this.listeners.set(key, { target, type, handler });

    return true;
  }

  removeAll() {
    for (const listener of this.listeners.values()) {
      listener.target.removeEventListener(
        listener.type,
        listener.handler
      );
    }

    this.listeners.clear();
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
