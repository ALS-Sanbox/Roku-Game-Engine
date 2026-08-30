globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class TextureAtlasManager {
  constructor() {
    this.textures = [];
  }

  add(texture) {
    this.textures.push(texture);
  }

  get(id) {
    return this.textures.find(t => t.id === id);
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
