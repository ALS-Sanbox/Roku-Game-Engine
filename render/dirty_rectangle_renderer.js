globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class DirtyRectangleRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.rects = [];
  }

  invalidate(x, y, width, height) {
    this.rects.push({ x, y, width, height });
  }

  flush(drawCallback) {
    for (const rect of this.rects) {
      this.ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
      drawCallback(rect);
    }

    this.rects.length = 0;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
