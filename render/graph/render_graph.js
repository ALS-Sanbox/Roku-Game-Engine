globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class RenderGraph {
  constructor() {
    this.passes = [];
  }

  addPass(name, execute) {
    this.passes.push({ name, execute });
  }

  execute(context) {
    for (const pass of this.passes) {
      pass.execute(context);
    }
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
