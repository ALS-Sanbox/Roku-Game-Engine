globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class SparseSet {
  constructor() {
    this.sparse = [];
    this.dense = [];
  }

  add(id) {
    if (this.has(id)) return;

    this.sparse[id] = this.dense.length;
    this.dense.push(id);
  }

  remove(id) {
    if (!this.has(id)) return;

    const index = this.sparse[id];
    const last = this.dense[this.dense.length - 1];

    this.dense[index] = last;
    this.sparse[last] = index;

    this.dense.pop();
  }

  has(id) {
    const index = this.sparse[id];
    return this.dense[index] === id;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
