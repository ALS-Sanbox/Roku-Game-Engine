globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * editor/editor_bridge.js — Shared bridge accessor for UI editor panels
 *
 * Previously each panel (ui_editor, ui_transition_editor,
 * ui_options_editor) defined its own identical `bridge()` one-liner.
 * This module is the single source of truth.
 *
 * Usage (inside any IIFE editor panel):
 *   const bridge = RGE_ROOT.RGEEditorBridge.bridge;
 *   // or destructure:
 *   const { bridge, makeDirtyFlag } = RGE_ROOT.RGEEditorBridge;
 */
(function () {
  'use strict';

  /**
   * Returns the active RGESceneBridge or null.
   * @returns {object|null}
   */
  function bridge() {
    return RGE_ROOT.RGESceneBridge || null;
  }

  /**
   * Creates a self-contained dirty flag with a setter.
   * Each editor panel that needs its own _dirty state calls this.
   * @returns {{ isDirty: () => boolean, markDirty: () => void, clearDirty: () => void }}
   */
  function makeDirtyFlag() {
    let _dirty = true;
    return {
      isDirty:    () => _dirty,
      markDirty:  () => { _dirty = true; },
      clearDirty: () => { _dirty = false; },
    };
  }

  RGE_ROOT.RGEEditorBridge = { bridge, makeDirtyFlag };
})();



/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
