globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  window.RokuEditorModules = window.RokuEditorModules || {};
  window.RokuEditorModules.spriteframesEditor = {
    name: 'spriteframes_editor',
    description: 'SpriteFrames editor module boundary. Active implementation remains hosted in editor/scene_editor.js during the staged refactor.'
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
