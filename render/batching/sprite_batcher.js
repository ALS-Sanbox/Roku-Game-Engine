globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class SpriteBatcher {
  constructor(device) {
    this.device = device;
    this.instances = [];
  }

  submit(instance) {
    this.instances.push(instance);
  }

  flush() {
    // GPU instance upload path
    this.instances.length = 0;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
