globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export class IncrementalUpdateManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.dirtyNodes = new Set();
  }

  markDirty(nodeId) {
    this.dirtyNodes.add(nodeId);
  }

  flush(sceneGraph) {
    for (const nodeId of this.dirtyNodes) {
      const node = sceneGraph.getNode(nodeId);

      if (node) {
        this.renderer.updateNode(node);
      }
    }

    this.dirtyNodes.clear();
  }
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
