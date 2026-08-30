globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class ArchetypeStorage {
  constructor() {
    this.tables = new Map();
  }

  getArchetypeKey(types) {
    return [...types].sort().join('|');
  }

  addEntity(entity, types) {
    const key = this.getArchetypeKey(types);

    if (!this.tables.has(key)) {
      this.tables.set(key, []);
    }

    this.tables.get(key).push(entity);
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
