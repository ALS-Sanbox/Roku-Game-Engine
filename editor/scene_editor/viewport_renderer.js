globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

window.ViewportRenderer = {
  dirty: false,

  invalidate(){
    this.dirty = true;
  },

  flush(renderFn){
    if(!this.dirty) return;
    this.dirty = false;
    if(typeof renderFn === 'function') renderFn();
  }
};



/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};


/* V146 Dirty redraw enforcement */
window.ViewportRenderer.requestRender = function(renderFn){
  this.invalidate();
  this.flush(renderFn);
};


/* V149 Dirty Region Rendering */

window.ViewportRenderer.flushDirtyRegions = function(renderFn){
  if(!RGE_ROOT.RGEDirtyRegions || RGE_ROOT.RGEDirtyRegions.length===0) return;
  const regions = RGE_ROOT.RGEDirtyRegions.splice(0);
  if(typeof renderFn==='function') renderFn(regions);
};
