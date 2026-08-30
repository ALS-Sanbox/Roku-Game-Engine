globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class RedrawGuard {
  constructor() {
    this.frameId = 0;
  }

  beginFrame() {
    this.frameId++;
  }

  shouldRender(lastFrame) {
    return lastFrame !== this.frameId;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
