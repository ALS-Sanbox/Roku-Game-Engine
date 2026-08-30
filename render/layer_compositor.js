globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class LayerCompositor {
  constructor() {
    this.layers = [];
  }

  addLayer(name, canvas) {
    this.layers.push({ name, canvas });
  }

  compose(ctx) {
    for (const layer of this.layers) {
      ctx.drawImage(layer.canvas, 0, 0);
    }
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
