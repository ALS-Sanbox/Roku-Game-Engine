globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class EntityManager {
  constructor() {
    this.entities = new Map();
    this.nextId = 1;
  }

  create(components = {}) {
    const id = this.nextId++;
    this.entities.set(id, components);
    return id;
  }

  get(id) {
    return this.entities.get(id);
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
