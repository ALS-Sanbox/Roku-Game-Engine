globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';
(function(){
  if (window.SceneRenderScheduler) return;

  const RenderFlags = Object.freeze({
    TREE:          1 << 0,
    INSPECTOR:     1 << 1,
    VIEWPORT:      1 << 2,
    SCENE_SUMMARY: 1 << 3,
    TILEMAPS:      1 << 4,
    SCENE_TABS:    1 << 5,
    HISTORY_BTNS:  1 << 6,
    ZOOM_READOUT:  1 << 7,
    SPRITESHEETS:  1 << 8,
    TILESETS:      1 << 9,
    SPRITE_FRAMES: 1 << 10,
    STRUCTURAL:    (1 << 0) | (1 << 2) | (1 << 3),
    FULL:          (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) |
                   (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) |
                   (1 << 8) | (1 << 9) | (1 << 10),
  });

  let pendingFlags = 0;
  let rafId = null;
  let handlers = null;

  function registerHandlers(nextHandlers) { handlers = nextHandlers; }

  function getHandlers() {
    return handlers || (handlers = {
      sceneTabs: () => window.renderSceneTabs?.(),
      tree: () => window.refreshTree?.(),
      inspector: () => window.refreshInspector?.(),
      spritesheets: () => window.renderSpritesheetsPanel?.(),
      tilesets: () => window.renderTilesetsPanel?.(),
      tilemaps: () => window.renderTileMapsPanel?.(),
      viewport: () => window.renderViewport?.(),
      sceneSummary: () => window.updateSceneSummary?.(),
      historyBtns: () => window.updateHistoryButtons?.(),
      zoomReadout: () => window.updateZoomReadout?.(),
      spriteFrames: () => window.renderSpriteFramesPanel?.(),
    });
  }

  function flush(flags) {
    const pm = () => window.PerfMonitor;
    const h = getHandlers();

    function run(flagBit, name, fn) {
      if (!(flags & flagBit)) return;
      pm()?.recordRedraw(name);
      fn?.();
    }

    run(RenderFlags.SCENE_TABS, 'sceneTabs', h.sceneTabs);
    run(RenderFlags.TREE, 'tree', h.tree);
    run(RenderFlags.INSPECTOR, 'inspector', h.inspector);
    run(RenderFlags.SPRITESHEETS, 'spritesheets', h.spritesheets);
    run(RenderFlags.TILESETS, 'tilesets', h.tilesets);
    run(RenderFlags.TILEMAPS, 'tilemaps', h.tilemaps);
    run(RenderFlags.VIEWPORT, 'viewport', h.viewport);
    run(RenderFlags.SCENE_SUMMARY, 'sceneSummary', h.sceneSummary);
    run(RenderFlags.HISTORY_BTNS, 'historyBtns', h.historyBtns);
    run(RenderFlags.ZOOM_READOUT, 'zoomReadout', h.zoomReadout);
    run(RenderFlags.SPRITE_FRAMES, 'spriteFrames', h.spriteFrames);
  }

  // Sluggish-fix: guard against re-entrant scheduling during flush
  let _flushing = false;

  function schedule(flags) {
    pendingFlags |= flags;
    if (rafId !== null) return; // already queued — flags accumulate above
    if (_flushing) return;      // re-entrant: flush already executing this tick

    rafId = requestAnimationFrame(() => {
      rafId = null;
      const current = pendingFlags;
      pendingFlags = 0;
      _flushing = true;
      try { flush(current); } finally { _flushing = false; }
    });
  }

  function flushNow() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
    const current = pendingFlags;
    pendingFlags = 0;
    flush(current);
  }

  window.SceneRenderScheduler = {
    RenderFlags,
    scheduleRender: schedule,
    flushScheduledRender: flushNow,
    flushRender: flush,
    registerHandlers,
  };
})();



RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};


RGE_ROOT.RGEScheduleRenderPass = function(commands){
  if(RGE_ROOT.RGEActiveRuntimeIntegration){
    return RGE_ROOT.RGEActiveRuntimeIntegration.sortRenderCommands(commands||[]);
  }
  return commands||[];
};


/* V152 Core Consolidation */
RGE_ROOT.RGECoreServices = RGE_ROOT.RGECoreServices || {
  renderAuthority: true,
  memoryAuthority: true,
  sceneAuthority: true
};


/* V153 Render Queue Ownership */

RGE_ROOT.RGESubmitScheduledCommands = function(commands){
  const q = RGE_ROOT.RGEAuthoritativeRenderQueue;
  (commands||[]).forEach(c => q && q.submit(c));
  return q ? q.commands.length : 0;
};


/* V155 Final Roku Cleanup */

RGE_ROOT.RGEValidateRenderPath = function(){
  return {
    centralQueue: !!RGE_ROOT.RGEAuthoritativeRenderQueue,
    schedulerIntegrated: true
  };
};
