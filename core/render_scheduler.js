globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class RenderScheduler {
  constructor() {
    this.pending = false;
    this.invalidRegions = [];
  }

  invalidate(region = null) {
    if (region) {
      this.invalidRegions.push(region);
    }

    if (this.pending) return;

    this.pending = true;

    requestAnimationFrame(() => {
      this.pending = false;
      this.flush();
    });
  }

  flush() {
    const regions = [...this.invalidRegions];
    this.invalidRegions.length = 0;

    if (this.onRender) {
      this.onRender(regions);
    }
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
