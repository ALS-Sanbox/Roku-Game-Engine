globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
'use strict';

// ── TilemapPaintController ─────────────────────────────────────────────────────
// Owns all viewport tilemap painting logic.  Extracted from scene_editor.js
// to isolate the hot pointer-paint path and make it independently testable.
//
// Depends on: state, scheduleRender, RenderFlags, paintTileMapAt,
//             getViewportTilePaintCell, drawTileHoverOverlay, clearTileHoverOverlay,
//             serializeScene, pushHistory, selectNode, getSelectedNodeIds,
//             resetTileMapStrokeTracking, getTileMapShapePreviewCells,
//             getUniqueTileMapCells, scheduleTileMapCanvasRedraw,
//             endViewportGroupSelect (for group select is kept here too),
//             suppressStageClick (writable ref managed externally)
//
// All functions are thin wrappers that read/write the shared `state` object
// already used by scene_editor.js — no data is duplicated.

const TilemapPaintController = (() => {
  // These are resolved lazily at call-time via window globals so there are
  // no circular-dependency issues during the initial script evaluation.
  function _state()    { return window._rgeState; }
  function _sched(f)   { window.scheduleRender?.(f); }
  function _flags()    { return window.RenderFlags; }

  /** Start a paint or group-select session on a TileMap node. */
  function beginViewportTilePaint(node, shape, evt) {
    const state = _state();
    if (!node || node.type !== 'TileMap' || state.tool !== 'select') return false;
    if (state.selectedId !== node.id || window.getSelectedNodeIds?.().length !== 1) {
      window.selectNode?.(node.id);
      return false;
    }
    if (state.viewport.isPanning || state.viewport.isMarqueeSelecting) return false;
    const cell = window.getViewportTilePaintCell?.(node, shape);
    if (!cell || !cell.inside) return false;

    // Shift + left-drag → group-select marquee
    if (evt.shiftKey && (evt.button == null || evt.button === 0)) {
      window._suppressStageClick = true;
      state.tilemapEditor.viewportGroupSelect = {
        active: true, nodeId: node.id,
        startCol: cell.col, startRow: cell.row,
        currentCol: cell.col, currentRow: cell.row,
      };
      state.tilemapEditor.hoverCol = cell.col;
      state.tilemapEditor.hoverRow = cell.row;
      _sched(_flags().VIEWPORT);
      return true;
    }

    // Right-click → pick tile
    if (evt.button === 2) {
      window._suppressStageClick = true;
      window.resetTileMapStrokeTracking?.();
      state.tilemapEditor.hoverCol = cell.col;
      state.tilemapEditor.hoverRow = cell.row;
      state.tilemapEditor.lastPick = { nodeId: node.id, col: cell.col, row: cell.row };
      const prevTool = state.tilemapEditor.tool;
      state.tilemapEditor.tool = 'pick';
      window.paintTileMapAt?.(node, cell.col, cell.row);
      state.tilemapEditor.tool = prevTool === 'pick' ? 'paint' : prevTool;
      window.updateTileMapToolButtons?.();
      window.renderTileMapsPanel?.();
      return true;
    }

    if (evt.button != null && evt.button !== 0) return false;
    window._suppressStageClick = true;
    window.resetTileMapStrokeTracking?.();

    // Fill tool → one-shot
    if (state.tilemapEditor.tool === 'fill') {
      const before = window.serializeScene?.();
      const changed = window.paintTileMapAt?.(node, cell.col, cell.row);
      if (changed) { window.pushHistory?.('Paint TileMap', before); _sched(_flags().VIEWPORT); }
      return true;
    }

    const isShapeTool = state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line';
    state.tilemapEditor.viewportPaint = {
      active: true, nodeId: node.id,
      beforeSnapshot: window.serializeScene?.(),
      pointerId: evt.pointerId ?? null,
      startCol: cell.col, startRow: cell.row,
      currentCol: cell.col, currentRow: cell.row,
      previewCells: isShapeTool ? [{ col: cell.col, row: cell.row }] : [],
    };
    state.tilemapEditor.isPointerDown = true;
    state.tilemapEditor.hoverCol = cell.col;
    state.tilemapEditor.hoverRow = cell.row;

    if (isShapeTool) { _sched(_flags().VIEWPORT); return true; }

    const changed = window.paintTileMapAt?.(node, cell.col, cell.row);
    if (changed) _sched(_flags().VIEWPORT);
    return true;
  }

  /** Update a running paint or group-select session (called on pointermove). */
  function updateViewportTilePaint() {
    const state = _state();
    const gsel = state.tilemapEditor.viewportGroupSelect;
    if (gsel?.active) {
      const node = window.getNode?.(gsel.nodeId);
      const shape = node ? window.shapeRefs?.get(node.id) : null;
      if (!node || !shape) return;
      const cell = window.getViewportTilePaintCell?.(node, shape);
      if (cell) {
        state.tilemapEditor.hoverCol = cell.col;
        state.tilemapEditor.hoverRow = cell.row;
        const changed = cell.col !== gsel.currentCol || cell.row !== gsel.currentRow;
        gsel.currentCol = cell.col;
        gsel.currentRow = cell.row;
        if (changed) window.drawTileHoverOverlay?.(node);
      }
      return;
    }

    const session = state.tilemapEditor.viewportPaint;
    if (!session?.active) return;
    const node = window.getNode?.(session.nodeId);
    const shape = node ? window.shapeRefs?.get(node.id) : null;
    if (!node || !shape) return;
    const cell = window.getViewportTilePaintCell?.(node, shape);
    if (!cell || !cell.inside) {
      const hadHover = state.tilemapEditor.hoverCol >= 0 || state.tilemapEditor.hoverRow >= 0;
      state.tilemapEditor.hoverCol = -1;
      state.tilemapEditor.hoverRow = -1;
      if (hadHover) window.clearTileHoverOverlay?.();
      return;
    }
    const hoverChanged = cell.col !== state.tilemapEditor.hoverCol || cell.row !== state.tilemapEditor.hoverRow;
    state.tilemapEditor.hoverCol = cell.col;
    state.tilemapEditor.hoverRow = cell.row;

    if (state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line') {
      const previewChanged = cell.col !== session.currentCol || cell.row !== session.currentRow;
      session.currentCol = cell.col; session.currentRow = cell.row;
      session.previewCells = window.getTileMapShapePreviewCells?.(
        node, state.tilemapEditor.tool,
        session.startCol, session.startRow, cell.col, cell.row
      );
      if (hoverChanged || previewChanged) window.drawTileHoverOverlay?.(node);
      return;
    }

    const changed = window.paintTileMapAt?.(node, cell.col, cell.row);
    if (changed) {
      window.scheduleTileMapCanvasRedraw?.(node);
      window.drawTileHoverOverlay?.(node);
    } else if (hoverChanged) {
      window.drawTileHoverOverlay?.(node);
    }
  }

  /** Commit a running paint session (called on pointerup). */
  function endViewportTilePaint() {
    const state = _state();
    const session = state.tilemapEditor.viewportPaint;
    if (!session?.active) return;
    const node = window.getNode?.(session.nodeId);
    let changed = false;

    if (node && (state.tilemapEditor.tool === 'rectangle' || state.tilemapEditor.tool === 'line')) {
      const previewCells = window.getUniqueTileMapCells?.(
        Array.isArray(session.previewCells) ? session.previewCells : []
      ) || [];
      previewCells.forEach((cell) => {
        if (window.paintTileMapAt?.(node, cell.col, cell.row)) changed = true;
      });
    }

    state.tilemapEditor.viewportPaint = {
      active: false, nodeId: null, beforeSnapshot: '', pointerId: null,
      startCol: -1, startRow: -1, currentCol: -1, currentRow: -1, previewCells: [],
    };
    state.tilemapEditor.isPointerDown = false;
    window.resetTileMapStrokeTracking?.();

    const before = session.beforeSnapshot || '';
    const after  = window.serializeScene?.();
    if (before && before !== after) window.pushHistory?.('Paint TileMap', before);

    window.clearTileHoverOverlay?.();
    const flags = _flags();
    _sched(flags.VIEWPORT | (changed ? flags.TILEMAPS | flags.SCENE_SUMMARY : 0));
  }

  // Expose for external callers (e.g. initViewport event wiring)
  return { beginViewportTilePaint, updateViewportTilePaint, endViewportTilePaint };
})();

window.TilemapPaintController = TilemapPaintController;


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
