globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  window.RokuEditorModules = window.RokuEditorModules || {};
  window.RokuEditorModules.viewport = {
    name: 'viewport',
    description: 'Viewport module boundary. Active implementation remains hosted in editor/scene_editor.js during the staged refactor.'
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};


/* V146 Viewport dirty flag */
RGE_ROOT.RGEViewportDirty = true;
RGE_ROOT.RGEMarkViewportDirty = function(){ RGE_ROOT.RGEViewportDirty = true; };


/* V149 Dirty Region Rendering */

RGE_ROOT.RGEDirtyRegions = RGE_ROOT.RGEDirtyRegions || [];

RGE_ROOT.RGEMarkDirtyRegion = function(x,y,w,h){
  RGE_ROOT.RGEDirtyRegions.push({x,y,w,h});
  RGE_ROOT.RGEViewportDirty = true;
};
