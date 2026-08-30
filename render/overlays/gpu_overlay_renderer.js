globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class GPUOverlayRenderer {
  constructor(device) {
    this.device = device;
    this.commands = [];
  }

  queue(command) {
    this.commands.push(command);
  }

  render() {
    this.commands.length = 0;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
