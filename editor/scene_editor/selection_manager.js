globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

window.SelectionManager = {
  selectedNodeId: null,
  hoveredNodeId: null,

  setSelected(id){
    this.selectedNodeId = id;
  },

  clear(){
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
  }
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
