globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * terrain_rebuild.js  —  Patch v35.2
 *
 * Batch terrain-rebuild utilities.
 *
 * ── Solver fast path ─────────────────────────────────────────────────────────
 *
 *  When `api.solver` and `api.terrainSet` are provided the direct solver path
 *  is used.  This is the standard v35 code path and does not require any
 *  callback functions.
 *
 *    rebuildApi.rebuildTerrainLayer(node, layer, {
 *      solver:     window.RokuTerrainSolver,
 *      terrainSet: activeTerrainSet,
 *      options:    { randomize: false },
 *    });
 *
 * ── Callback path (legacy / scene_editor integration) ────────────────────────
 *
 *  When the scene editor manages its own cell state (transforms, diagnostics,
 *  the separate layer.terrain alias grid) the callback path is used:
 *
 *    rebuildApi.rebuildTerrainLayer(node, layer, {
 *      getTerrainId:   getTileMapCellTerrainId,
 *      applySolverAt:  applyTerrainSolverAt,
 *    });
 *
 *  `applySolverAt` is responsible for writing to both layer.tiles and
 *  cell.terrainDiagnostics via the editor's own resolver.
 *
 * ── Cell grouping helpers ────────────────────────────────────────────────────
 *
 *  getUniqueCells / buildNeighborhoodCells are pure utilities used by the
 *  editor to expand a painted-cell set before or after solving.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.RokuTerrainRebuild = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(_global) {
  'use strict';

  // ── cell set helpers ─────────────────────────────────────────────────────────

  /**
   * Deduplicate a list of { col, row } objects.
   * Out-of-bounds or non-finite coordinates are dropped.
   */
  function getUniqueCells(cells) {
    const seen = new Set();
    return (Array.isArray(cells) ? cells : []).filter((cell) => {
      const col = Number(cell?.col);
      const row = Number(cell?.row);
      if (!Number.isFinite(col) || !Number.isFinite(row)) return false;
      const key = `${col},${row}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((cell) => ({ col: Number(cell.col), row: Number(cell.row) }));
  }

  /**
   * Expand a cell list to include all neighbours within `radius` tiles.
   * Returns a deduplicated list.
   */
  function buildNeighborhoodCells(cells, radius = 1) {
    const expanded = [];
    getUniqueCells(cells).forEach(({ col, row }) => {
      for (let y = row - radius; y <= row + radius; y += 1) {
        for (let x = col - radius; x <= col + radius; x += 1) {
          expanded.push({ col: x, row: y });
        }
      }
    });
    return getUniqueCells(expanded);
  }

  // ── single-layer rebuild ─────────────────────────────────────────────────────

  /**
   * Rebuild all terrain-painted cells in a single layer.
   *
   * Two dispatch paths (checked in order):
   *
   *  1. Solver fast path  — api.solver + api.terrainSet
   *     Calls solver.rebuildTerrainLayer(terrainSet, layer, options) directly.
   *     Returns { changed, solvedCells, results }.
   *
   *  2. Callback path  — api.getTerrainId + api.applySolverAt
   *     Used by scene_editor which manages transforms and diagnostics itself.
   *     Returns { changed, solvedCells, reconciledCells, terrainCells }.
   *     After solving all painted cells a reconciliation pass re-solves the
   *     1-radius neighbourhood of every painted cell so borders update.
   *
   * @param {object}  tilemap  TileMap node (used only in callback path).
   * @param {object}  layer    Layer object with cellData / tiles.
   * @param {object}  api      Dispatch configuration (see above).
   */
  function rebuildTerrainLayer(tilemap, layer, api = {}) {
    // ── Path 1: direct solver ──────────────────────────────────────────────
    if (api.solver && api.terrainSet && typeof api.solver.rebuildTerrainLayer === 'function') {
      return api.solver.rebuildTerrainLayer(api.terrainSet, layer, api.options || {});
    }

    // ── Path 2: editor callback ────────────────────────────────────────────
    if (!tilemap || !layer
        || typeof api.getTerrainId   !== 'function'
        || typeof api.applySolverAt  !== 'function') {
      return { changed: false, solvedCells: 0, reconciledCells: 0, terrainCells: [] };
    }

    const height = Array.isArray(layer.cellData) ? layer.cellData.length : 0;
    const width  = height > 0 && Array.isArray(layer.cellData[0]) ? layer.cellData[0].length : 0;
    const terrainCells = [];
    let changed = false;

    // First pass: solve every painted cell
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (api.getTerrainId(layer, col, row) != null) {
          terrainCells.push({ col, row });
          if (api.applySolverAt(tilemap, layer, col, row,
              { randomize: false, respectProbability: false, rebuild: true })) {
            changed = true;
          }
        }
      }
    }

    // Reconciliation pass: re-solve the border ring so neighbour-sensitive
    // tiles on the edge of painted regions update correctly
    const reconcileCells = buildNeighborhoodCells(terrainCells, 1);
    reconcileCells.forEach(({ col, row }) => {
      if (api.applySolverAt(tilemap, layer, col, row,
          { randomize: false, respectProbability: false, rebuild: true, reconcile: true })) {
        changed = true;
      }
    });

    return {
      changed,
      solvedCells:    terrainCells.length,
      reconciledCells: reconcileCells.length,
      terrainCells,
    };
  }

  // ── multi-tilemap rebuild ────────────────────────────────────────────────────

  /**
   * Rebuild all terrain layers across multiple TileMap nodes.
   *
   * @param {object[]} tilemaps  Array of TileMap nodes.
   * @param {object}   api       Same api object as rebuildTerrainLayer.
   * @returns {{ changed: boolean, results: Array }}
   */
  function rebuildAllTerrainLayers(tilemaps, api = {}) {
    const items = Array.isArray(tilemaps) ? tilemaps : [];
    const results = [];
    let changed = false;
    items.forEach((tilemap) => {
      const layers = Array.isArray(tilemap?.properties?.layers) ? tilemap.properties.layers : [];
      layers.forEach((layer) => {
        const result = rebuildTerrainLayer(tilemap, layer, api);
        results.push({ tilemapId: tilemap?.id || '', layerId: layer?.id || '', result });
        if (result.changed) changed = true;
      });
    });
    return { changed, results };
  }

  // ── pre-export rebuild ───────────────────────────────────────────────────────

  /**
   * Re-solve all terrain cells immediately before export using the direct
   * solver path.  Returns a list of human-readable fallback warnings so the
   * exporter can surface them to the user.
   *
   * api.getTerrainSetForLayer(tilemap, layer) is called to look up the active
   * terrain set per layer.  Falls back to api.terrainSet if not provided.
   *
   * @param {object[]} tilemaps
   * @param {object}   api  { solver, terrainSet?, getTerrainSetForLayer?, options? }
   * @returns {{ changed: boolean, warnings: string[] }}
   */
  function preExportTerrainRebuild(tilemaps, api = {}) {
    const solver = api.solver || null;
    const warnings = [];
    const items = Array.isArray(tilemaps) ? tilemaps : [];
    let changed = false;

    items.forEach((tilemap) => {
      const layers = Array.isArray(tilemap?.properties?.layers) ? tilemap.properties.layers : [];
      layers.forEach((layer) => {
        const terrainSet = typeof api.getTerrainSetForLayer === 'function'
          ? api.getTerrainSetForLayer(tilemap, layer)
          : api.terrainSet;
        if (!terrainSet || !solver || typeof solver.rebuildTerrainLayer !== 'function') return;

        const result = solver.rebuildTerrainLayer(
          terrainSet, layer, Object.assign({ randomize: false }, api.options || {}));
        if (result.changed) changed = true;

        (result.results || []).forEach((entry) => {
          if (entry?.result?.fallbackUsed) {
            const tilemapLabel = String(tilemap?.name || tilemap?.id || 'TileMap');
            const layerLabel   = String(layer?.name  || layer?.id  || 'Layer');
            const reason       = entry.result.fallbackReason || 'terrain fallback';
            warnings.push(`${tilemapLabel}:${layerLabel}:${entry.col},${entry.row}: ${reason}`);
          }
        });
      });
    });

    return { changed, warnings };
  }

  // ── public API ───────────────────────────────────────────────────────────────

  return {
    getUniqueCells,
    buildNeighborhoodCells,
    rebuildTerrainLayer,
    rebuildAllTerrainLayers,
    preExportTerrainRebuild,
  };
});


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
