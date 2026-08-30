globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class ECSEditorBridge {
  constructor(world) {
    this.world = world;
  }

  createNode(data) {
    const entity = this.world.createEntity();

    for (const [type, component] of Object.entries(data)) {
      this.world.addComponent(entity, type, component);
    }

    return entity;
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
