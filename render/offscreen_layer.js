globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class OffscreenLayer {
  constructor(width, height) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  render(draw) {
    if (!this.dirty) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    draw(this.ctx);

    this.dirty = false;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
