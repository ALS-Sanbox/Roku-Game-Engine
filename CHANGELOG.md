# RGE CameraPath2D – Production-Ready Upgrade Changelog

## Version: RGE_100 + CameraPath2D Full Feature Pass
**All 8 phases implemented in one pass.**

---

## Modified Files

| File | Change Summary |
|---|---|
| `src/nodes.js` | Added `speed`, `interpolation` defaults; backward-compat normalization |
| `src/schema/nodes.js` | Added `speed`, `interpolation` defaults and inspector fields; backward-compat normalization |
| `src/editor/scene_editor.js` | Multi-select, Delete key, segment insertion, new point rendering, loop/closed/speed/interpolation undo support |
| `src/editor/panels/camera_preview_panel.js` | Smooth/Cubic interpolation; speed from path properties; closedPath preview |

## Newly Created Files

| File | Purpose |
|---|---|
| `src/runtime/camera/camera_path_runtime.js` | Standalone runtime path evaluator (Phase 8) |

---

## Phase 1 — Multi-Select Path Points

- Replaced `state.cameraPathEditor.selectedPointIndex` (single `number`) with `state.cameraPathEditor.selectedPointIndices` (`Set<number>`).
- **Single click** clears previous selection, selects clicked point.
- **Ctrl+Click / Meta+Click** toggles the clicked point in/out of selection.
- **Shift+Click** selects range from last selected point to clicked point.
- Selection visually distinct: selected handles render larger (`r=8`), filled `#fff3c4`, stroked `#ff9800` at `strokeWidth 2.5`.
- Inspector point buttons highlight background when selected.
- All code paths that previously referenced `selectedPointIndex` updated to use `selectedPointIndices`.
- Selection survives inspector refreshes (stored in `state`, not DOM).

---

## Phase 2 — Delete Selected Points

- Added `deleteSelectedCameraPathPoints(nodeId)` function.
- **Delete / Backspace** key fires in camera-path edit mode (capture-phase listener, skips `INPUT`/`TEXTAREA`).
- Indices sorted descending before deletion to prevent index-shift bugs.
- **Safety**: never reduces path below 1 point — keeps first unselected point when all are selected.
- After deletion: selection cleared, inspector and viewport refreshed, undo history pushed.
- Inspector "Delete Selected" button also calls this function.
- Single-point delete via inspector trash button still calls `deleteCameraPathPoint`.

---

## Phase 3 — Insert Point Between Existing Points

- Double-clicking a **path segment line** inserts a point midway between the segment's endpoints.
- Right-clicking a path segment also triggers insertion.
- Invisible wide (`strokeWidth:16`) `Konva.Line` shapes per segment capture these events without interfering with handle drag.
- Segment lines highlight on hover (orange tint) in edit mode.
- Inserted point is immediately selected (`selectedPointIndices = new Set([newIndex])`).
- Full undo/redo support via `pushHistory('Insert Camera Path Point', before)`.
- Inspector refresh and viewport redraw fire after insertion.
- Context menu on a point also offers "Insert Point After" (existing path kept).

---

## Phase 4 — Path Loop Toggle

- `closedPath: boolean` (default `false`) — visually connected: dashed `closeLine` from last to first point.
- `loop: boolean` (default `false`) — runtime preview wraps distance for looping.
- Inspector fields: `loop` label is "Loop Playback", `closedPath` is "Closed Path".
- Both properties serialized/deserialized correctly. Older scenes load with defaults `false`.
- Undo/redo flows through standard `updateField` path.

---

## Phase 5 — Runtime Path Preview

- Camera Preview panel Play/Stop buttons start/stop `_pathPlayback`.
- Inspector section for CameraPath2D exposes **▶ Play** and **■ Stop** buttons.
- Preview uses `requestAnimationFrame` — no frame leaks.
- Preview does **not** mutate scene state.
- Preview respects `loop`, `closedPath`, `speed`, and `interpolation`.

---

## Phase 6 — Camera Movement Speed

- Added `speed: number` property (default `200` px/s, minimum `1`).
- Inspector field: **Camera Speed**.
- `speed` takes priority over legacy `duration`-based calculation.
- Older scenes load with `speed=200` via `normalizeNode`.
- Undo/redo via standard `updateField`.

---

## Phase 7 — Interpolation Types

- Added `interpolation: string` property (default `'Linear'`).
- Inspector: dropdown with `['Linear', 'Smooth', 'Cubic']`.
- **Linear**: standard lerp.
- **Smooth**: `smoothstep(t) = t²(3−2t)`.
- **Cubic**: Catmull-Rom spline with wraparound edge handling.
- Implemented in both `camera_preview_panel.js` and `camera_path_runtime.js`.
- Older scenes load with `interpolation='Linear'` via `normalizeNode`.

---

## Phase 8 — Runtime Camera Path Evaluator

New file: **`src/runtime/camera/camera_path_runtime.js`**

- Fully independent of editor — exports `CameraPathRuntime` on `window`/`globalThis`.
- `new CameraPathRuntime(pathNode)` — takes a CameraPath2D node.
- `runtime.update(dt)` — returns `{ x, y, finished }`.
- `runtime.reset()`, `runtime.seek(distance)`, `runtime.getProgress()`, `runtime.isFinished()`.
- Respects `speed`, `interpolation`, `loop`, `closedPath`.
- Legacy `duration` fallback if `speed` absent.
- Full Catmull-Rom, smoothstep, and arc-length sampling.
- Reusable by future cutscene systems.

---

## Undo / Redo Coverage

All new mutations push undo history:

- Insert point (segment dblclick/rightclick): `Insert Camera Path Point`
- Delete selected points (multi): `Delete Camera Path Points`
- Delete single point: `Delete Camera Path Point`
- Move to start/end: `Set Camera Path Start/End Point`
- Add point: `Add Camera Path Point`
- closedPath / loop / speed / interpolation: via standard `updateField`

---

## Serialization / Backward Compatibility

- New properties (`speed`, `interpolation`) in `NodeDefaultProperties` for both node files.
- `normalizeNode` applies defaults when loading older scenes.
- `closedPath` and `loop` default-patching also added for robustness.
- `waypoints` → `points` migration preserved unchanged.

---

## Validation Results

1. ✅ No syntax errors — `node --check` passes on all files.
2. ✅ Zero stale `selectedPointIndex` references.
3. ✅ CameraPath2D creation works with all new defaults.
4. ✅ Save/load: new properties serialized correctly; old scenes auto-migrated.
5. ✅ Undo/redo: all mutations push history.
6. ✅ Runtime preview: Play/Stop wired; speed + interpolation respected.
7. ✅ Interpolation: Linear, Smooth, Cubic in preview and runtime.
8. ✅ Loop playback: `loop` + `closedPath` respected everywhere.
