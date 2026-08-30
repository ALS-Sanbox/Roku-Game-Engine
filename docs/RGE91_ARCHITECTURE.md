# RGE v91 — Architecture Summary & Change Report

## Overview

RGE v91 transforms the engine from a prototype editor into a professional
Roku-native 2D game engine with production-grade tooling. All additions are
additive — no existing project files, scene serialization, or BRS runtime
files were broken.

---

## New Systems

### 1. Central Event Bus (`core/rge_bus.js`)
- Lightweight pub/sub bus (`RGEBus`) used by every new v91 module.
- `on / once / off / emit / clear` API.
- Must be the first script loaded.
- Exceptions in one handler do not block others.

### 2. Centralized Scheduler (`core/rge_scheduler.js`)
- Single `requestAnimationFrame` loop drives all registered panels.
- Throttled callbacks (configurable interval) prevent CPU waste.
- Dirty-flag invalidation: panels only re-render when marked dirty.
- Auto-evicts panels whose DOM containers become detached (memory leak prevention).

### 3. Asset Registry (`pipeline/asset_registry.js`)
- GUID-based identity: assets survive renames.
- Dependency graph: bidirectional edges between assets.
- Validates existence, detects duplicates, finds orphans.
- Hot-reload: `touch(guid)` bumps version and emits `asset:hot_reload`.
- `buildManifest()` generates `asset_manifest.json` for Roku deployment.
- Fully serializable; deserializes non-destructively into existing registries.

### 4. Preload Manager (`pipeline/asset_preload_manager.js`)
- Preload groups map 1-to-1 with Roku's `preloadGroups` manifest section.
- Lazy queue: processes N assets per idle tick (no UI blocking).
- LRU eviction when memory budget is exceeded.
- Editor-side simulation of what Roku will hold in RAM.

### 5. Atlas Generator (`atlas/atlas_generator.js`)
- Shelf-packing algorithm for sprite→atlas packing.
- Targets Roku's 2048×2048 max texture limit with power-of-2 output sizes.
- Multiple named groups (world, UI, effects) with independent outputs.
- Rebuild detection via content hash — only regenerates on actual changes.
- Draw-call reduction analysis: reports before/after texture swap counts.

### 6. Animation State Machine — Editor (`animation/animation_state_machine.js`)
- `AnimationClip`: frame index sequence + fps + frame events.
- `AnimationState`: named node wrapping a clip.
- `Transition`: directed edge with condition expressions (==, !=, <, <=, >, >=).
- `AnimationGraph`: full node/edge graph with typed parameters (float, bool, int, trigger).
- `AnimationController`: per-entity instance; advances time, evaluates transitions, fires events.
- Serialization contract exactly mirrors `animation_state_machine.brs`.

### 7. Animation State Machine — Runtime (`source/engine/animation_state_machine.brs`)
- BrightScript mirror of the editor-side graph runtime.
- `RokuAnim_LoadGraph`, `RokuAnim_CreateController`, `RokuAnim_Update`.
- Typed parameter setters: `RokuAnim_SetFloat/Bool/Int/SetTrigger`.
- Frame event callbacks integrated with engine script hook system.

### 8. Asset Streaming Runtime (`source/engine/asset_stream.brs`)
- `RokuStream_Create` augments `resource_manager.brs`.
- Preload group execution reads manifest's `preloadGroups` section.
- Lazy queue processes `batchSize` (default: 3) assets per engine frame.
- LRU eviction when `totalKb` exceeds `budgetKb` (default: 80 MB).
- Missing asset recovery: returns magenta placeholder bitmap.
- Manifest validation reports missing paths before runtime crash.

### 9. Memory Budgeting (`memory/memory_budget.js`)
- Conservative Roku limits: 180 MB total, 80 MB texture VRAM, 20 MB audio, 8 MB scene.
- Estimators: texture = W×H×4 bytes; audio = sampleRate × channels × 2 × duration.
- Warnings at 80% utilization; errors at 100%.
- Special warnings: oversized textures, too many audio clips, too many atlases.
- `MemoryInspectorPanel` renders live budget bars in the editor dock.

### 10. Deployment Manager (`deployment/deployment_manager.js`)
- Device registry with LAN discovery via ECP ping sweep.
- Build profiles: `debug`, `dev`, `release`.
- One-click deploy: validate → build package → upload via sideload API.
- Package size warning at 4 MB (Roku sideload limit).
- Deployment history (last 20 records).
- Serializes device list + profile to project settings.

### 11. Roku Device Bridge (`deployment/roku_device_bridge.js`)
- ECP REST calls: ping, device-info, screenshot.
- Auto-reconnect with exponential back-off (max 30s).
- Stats polling every 2 seconds: FPS, memory.
- Log stream forwarded from main process via `onSideloadProgress`.

### 12. Runtime Debug Console (`deployment/runtime_debug_console.js`)
- Live log stream with level detection (ERROR/WARN/INFO/DEBUG).
- Filter by text + log level.
- FPS ring buffer (120-sample = 2 minutes of history).
- Auto-scroll with toggle.
- Error/warning counters in status bar.

### 13. Render Authority (`render/render_authority.js`)
- Shared `RenderCommand` tagged union for all draw operations.
- `RenderCommandQueue`: builds per-frame command list, validates against Roku constraints.
- `RendererCapabilitySystem`: analyzes draw calls, texture swaps, batch count.
- Emits warnings for: high texture swaps (>16), high draw calls (>200), unsupported commands.
- `DirtyRectManager`: merges dirty regions for minimal redraw.
- Unsupported commands (`draw_gradient`, `draw_shadow`, `draw_blur`, `set_blend_mode`) are flagged and stripped from Roku-safe queue.

### 14. Schema Migration (`schema/v91_migration.js`)
- `migrateToV91(projectData)` safely upgrades any pre-v91 project.
- Adds missing v91 keys with safe defaults (never overwrites existing data).
- Returns `{ data, changes, warnings }` for audit logging.
- `validateV91(v91Data)` confirms structural integrity.

### 15. Editor Panels
- **DeploymentPanel** (`editor/panels/deployment_panel.js`): device list, ping, deploy button, history, remote restart.
- **MemoryInspectorPanel** (`editor/panels/memory_inspector_panel.js`): live budget bars, per-category breakdown, top asset list.

### 16. Exporter v91 Extensions (`exporter.js`)
- `serializeV91Systems()` — serializes all v91 state alongside scene.
- `deserializeV91Systems(data)` — restores v91 state on project load.
- Both functions are safe no-ops if any v91 system is not yet initialized.

---

## File-by-File Change Report

| File | Status | Notes |
|---|---|---|
| `core/rge_bus.js` | **NEW** | Central event bus |
| `core/rge_scheduler.js` | **NEW** | Centralized panel scheduler |
| `pipeline/asset_registry.js` | **NEW** | GUID asset registry |
| `pipeline/asset_preload_manager.js` | **NEW** | Preload + lazy + LRU cache |
| `atlas/atlas_generator.js` | **NEW** | Shelf-pack atlas pipeline |
| `animation/animation_state_machine.js` | **NEW** | Editor animation graph |
| `memory/memory_budget.js` | **NEW** | Roku memory estimator |
| `deployment/deployment_manager.js` | **NEW** | Full deploy workflow |
| `deployment/roku_device_bridge.js` | **NEW** | ECP + log transport |
| `deployment/runtime_debug_console.js` | **NEW** | Live log + FPS panel |
| `render/render_authority.js` | **NEW** | Render command abstraction |
| `editor/panels/deployment_panel.js` | **NEW** | Deploy dock panel |
| `editor/panels/memory_inspector_panel.js` | **NEW** | Memory inspector panel |
| `schema/v91_migration.js` | **NEW** | Project migration handler |
| `source/engine/animation_state_machine.brs` | **NEW** | BRS animation graph runtime |
| `source/engine/asset_stream.brs` | **NEW** | BRS lazy load + LRU cache |
| `exporter.js` | **PATCHED** | Added `serializeV91Systems / deserializeV91Systems` |
| `export/classic2d_export.js` | **PATCHED** | Added v91 BRS files to export list |
| `index.html` | **PATCHED** | Added v91 script loading block |
| All other files | **UNCHANGED** | No existing code was modified |

---

## Performance Optimization Report

- **No rAF duplication**: `rge_scheduler.js` runs a single shared loop; panels do not start their own.
- **Throttled redraws**: all panels register minimum-interval guards (e.g. memory inspector = 500 ms).
- **Dirty-flag rendering**: panels only redraw when `markDirty()` is called; idle panels cost 0 CPU.
- **Lazy asset queue**: processes at most 3–4 assets per frame; no frame hitching on load.
- **Atlas packing reduces draw calls**: fewer texture swaps = shorter GPU command lists on Roku.
- **LRU eviction**: Roku runtime never exceeds configured texture budget; prevents allocation spikes.
- **Render command queue**: unsupported Roku operations are stripped at build time, not silently ignored at runtime.

---

## Memory Optimization Report

- **Asset registry**: holds metadata only (no binary data); negligible RAM cost in editor.
- **Atlas LRU**: Roku runtime evicts cold atlases when 80 MB VRAM budget is approached.
- **Audio limit warning**: fires at >8 simultaneous decoded clips (Roku recommendation).
- **Placeholder bitmap**: single 16×16 magenta bitmap shared across all missing assets (no per-asset allocation).
- **Panel cleanup**: `rge_scheduler.js` auto-evicts detached panels, preventing DOM + listener leaks.

---

## Remaining Engine Risks

1. **Sideload transport security**: Roku ECP uses HTTP digest auth over LAN; not suitable for production CI without VPN.
2. **Atlas canvas rendering**: atlas preview bitmaps are synthesized from canvas in the editor, not from actual source files; visual fidelity depends on browser canvas → PNG export quality.
3. **Animation event timing**: frame events fire based on `frameIndex === ev.frame` equality; at low FPS with large dt, frames can be skipped. A range-check loop would be more robust.
4. **BrightScript LRU sort**: the bubble sort in `asset_stream.brs` is O(n²). With >50 loaded assets this may cause micro-hitches. Replace with insertion sort or use AA lookup by timestamp bucket.
5. **Deployment panel device credentials**: passwords are serialized to project settings JSON in plaintext. Recommend OS keychain integration in a future pass.

---

## Recommended Next Phase Roadmap (v92)

1. **Tilemap autotile runtime**: bring autotile solver into BRS for runtime level streaming.
2. **Scene streaming**: load/unload scenes as spatial chunks rather than all-or-nothing.
3. **Prefab system**: saveable node subtrees with override properties.
4. **Roku CI integration**: automated sideload + screenshot diff testing pipeline.
5. **Input rebinding UI**: runtime-accessible key remapping with persistence to `roRegistry`.
6. **Shader metadata catalog**: validate effect metadata against Roku's `roRegion.SetOpacity / DrawObject` API surface.
7. **Atlas canvas export**: actually blit source images on canvas and export PNG for packaging (requires file system access from main process).
8. **Animation blend trees**: weighted multi-clip blending (currently unsupported on Roku; implement as frame-mix approximation).
9. **Collision debug draw**: visual overlay of AABB + tilemap colliders rendered in editor viewport using render authority command queue.
10. **Remote entity inspector**: inspect + edit live component values on running Roku device via ECP telemetry.
