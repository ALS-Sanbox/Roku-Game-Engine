globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class GPUOverlayRenderer {
  constructor(canvas) {
    this.gl = canvas.getContext('webgl2') ||
              canvas.getContext('webgl');

    this.queue = [];
  }

  queueRect(x, y, w, h) {
    this.queue.push({ type: 'rect', x, y, w, h });
  }

  queueLine(x1, y1, x2, y2) {
    this.queue.push({ type: 'line', x1, y1, x2, y2 });
  }

  render() {
    this.queue.length = 0;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
