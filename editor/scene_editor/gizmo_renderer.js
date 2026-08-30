globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

window.GizmoRenderer = {
  drawSelectionOutline(ctx, rect){
    if(!ctx || !rect) return;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};


/* V148 Render Consolidation */

RGE_ROOT.RGEGizmoRenderFilter = function(commands){
  return (commands||[]).filter(Boolean);
};
