globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export function diffHierarchy(previous, next) {
  const patches = [];

  const prev = new Map(previous.map(n => [n.id, n]));
  const nextMap = new Map(next.map(n => [n.id, n]));

  for (const node of next) {
    if (!prev.has(node.id)) {
      patches.push({ type: 'add', node });
    }
  }

  for (const node of previous) {
    if (!nextMap.has(node.id)) {
      patches.push({ type: 'remove', node });
    }
  }

  return patches;
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
