globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;

export function mergeDirtyRegions(regions) {
  if (regions.length <= 1) {
    return regions;
  }

  const merged = [];

  for (const region of regions) {
    let combined = false;

    for (const target of merged) {
      const overlap =
        region.x < target.x + target.width &&
        region.x + region.width > target.x &&
        region.y < target.y + target.height &&
        region.y + region.height > target.y;

      if (overlap) {
        const x1 = Math.min(region.x, target.x);
        const y1 = Math.min(region.y, target.y);
        const x2 = Math.max(
          region.x + region.width,
          target.x + target.width
        );
        const y2 = Math.max(
          region.y + region.height,
          target.y + target.height
        );

        target.x = x1;
        target.y = y1;
        target.width = x2 - x1;
        target.height = y2 - y1;

        combined = true;
        break;
      }
    }

    if (!combined) {
      merged.push({ ...region });
    }
  }

  return merged;
}


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
