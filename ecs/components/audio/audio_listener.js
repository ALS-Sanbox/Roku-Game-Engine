globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
export class AudioListener {
  constructor(config = {}) {
    this.type = 'AudioListener';
    this.enabled = config.enabled !== false;
    this.masterVolume = config.masterVolume ?? 1;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
