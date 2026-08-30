globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
export class AudioSource {
  constructor(config = {}) {
    this.type = 'AudioSource';
    this.clip = config.clip || '';
    this.bus = config.bus || 'SFX';
    this.volume = config.volume ?? 1;
    this.loop = !!config.loop;
    this.autoplay = !!config.autoplay;
    this.streaming = !!config.streaming;
    this.priority = config.priority ?? 50;
    this.playOnAwake = !!config.playOnAwake;
  }

  serialize() {
    return { ...this };
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
