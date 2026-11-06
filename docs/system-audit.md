# Engine system audit

Scope: current editor entry point (`index.html`), native export pipeline, canonical BrightScript runtime (`source/engine`), deployment IPC, and the newly added gameplay helpers. This is a code and automated-test audit, not certification on a physical Roku. No device uploads, deletes, or network commands were performed.

## Confirmed bugs repaired

### Scene reload reused mutated cached scene data

`Resources.GetScene` caches and returns the authored document. `LoadScene` previously used that same object as the live scene. Changing transforms, collecting objects, or spawning nodes modified the template used by the next restart/retry. Focus and screen-manager state also survived the scene replacement.

Fix: [scene_manager.brs](../source/engine/scene_manager.brs) now clones the cached document before creating the live scene and resets scene-owned focus/screen state. Native execution tests verify that authored properties and transforms return, runtime clones disappear, the cached asset remains unchanged, and stale focus/screen state is removed.

### Inactive pooled objects continued processing and colliding

Pool release sets `poolActive = false`, but the component dispatcher and collider path did not use that flag. Hidden pooled objects could continue moving, running scripts, and participating in collision checks. Generic script broadcasts also bypassed the suspension checks used by the normal component phases.

Fix: [gameplay_nodes.brs](../source/engine/gameplay_nodes.brs) treats inactive pooled objects and their descendants as suspended. [core.brs](../source/engine/core.brs) applies suspension to generic script broadcasts, while retaining SceneExit cleanup. Tests execute component dispatch, script broadcasts, collider lookup, and reactivation after reacquisition.

## Remaining functional gaps

### High priority: editor UI types missing native support

The schema/editor expose `CircleButton`, `TriangleButton`, and `OvalButton`. None appears in the native UI type predicate or UI renderer, so these buttons are omitted from native drawing and focus navigation.

`HBoxContainer`, `VBoxContainer`, `MarginContainer`, and `ScrollContainer` are also absent from the native UI type predicate. Native layout does not implement their automatic spacing, padding, scroll offsets, or scroll clipping. Descendant UI controls can still render using authored positions, which can disguise the missing container behavior.

Evidence: [ui_system.brs](../source/engine/ui_system.brs), [ui_renderer.brs](../source/engine/renderers/ui_renderer.brs), and [schema/nodes.js](../schema/nodes.js).

Change made during this audit: native export now emits explicit `NATIVE_UI_SHAPE` and `NATIVE_UI_LAYOUT` warnings for these types. This exposes the gap; it does not implement the missing controls. Individual rectangular Buttons and explicit child positioning remain the supported alternatives.

### High priority: MenuList draws but does not navigate its items

The renderer reads `properties.selectedIndex`. Built-in directional input moves focus between nodes and never changes that index; acceptance dispatches the node's action rather than an item-specific action. A MenuList therefore looks functional while its items cannot be selected using the built-in remote navigation.

Evidence: [ui_renderer.brs](../source/engine/renderers/ui_renderer.brs) and [ui_focus_manager.brs](../source/engine/ui/ui_focus_manager.brs).

Change made during this audit: export emits `NATIVE_MENU_INPUT`. Use separate Buttons or custom selection scripting until native item navigation is implemented.

### Medium priority: deployment manager uses obsolete IPC contracts

The loaded `DeploymentManager` class expects ping/build/upload results with `ok`, but the main process returns `success`. It expects `packagePath` and sends `username`/`password`; the current upload handler requires `zipPath` and `user`/`pass`. Its discovery call sends `{scan:true}`, but the ping handler requires an IP and contains no scan implementation. Its `remoteRestart` method calls the delete handler and does not check the returned failure.

Evidence: [deployment_manager.js](../deployment/deployment_manager.js) and [main.js](../main.js) sideload handlers.

This is the older deployment-manager path, not evidence that the separate sideload dialog has the same contract mismatch. The old DeploymentPanel class is exported but no mounting call is present in the current editor, so this broken path is currently dormant.

### Medium priority: asset-streaming/LRU system is disconnected and incomplete

The exporter includes `asset_stream.brs`, but the current runtime never constructs `RokuStream_Create` or calls its queue processor. Ordinary resource loading still works through `resource_manager.brs`; the advertised streaming manager is not running automatically.

Even if called manually, `LoadAsset` marks a texture loaded when `GetBitmap` returns `invalid`. Access times come from freshly created timespans instead of a shared clock, so they do not establish useful LRU ordering. Eviction deletes tracking metadata but does not remove the actual bitmap/region references held in the resource manager's caches.

Evidence: [asset_stream.brs](../source/engine/asset_stream.brs), [resource_manager.brs](../source/engine/resource_manager.brs), and [core.brs](../source/engine/core.brs).

### Medium priority: animation graph frame events are a real stub

`RokuAnim_Update` contains a frame-event loop whose matching branch only has the comment `Dispatch via script hooks if available`; no dispatch occurs. Transition duration is loaded but is not used for blending. The graph helper library is exported, but the ordinary AnimatedSprite2D/AnimationPlayer component path never constructs or updates a graph controller automatically.

Evidence: [animation_state_machine.brs](../source/engine/animation_state_machine.brs) and [component_registry.brs](../source/engine/component_registry.brs).

Basic sprite animation is implemented separately and remains functional. The gap concerns graph integration, frame events, and transition blending.

### Medium priority: live device debugging is not connected

The device bridge listens for sideload progress records with `type: 'log'` or `type: 'stats'`. The current main-process sideload code has no runtime TCP-log transport producing those records. The DeploymentPanel, RuntimeDebugConsole, and MemoryInspectorPanel classes are loaded/exported but have no mount calls in the current editor. Memory estimates depend on an auxiliary asset registry that is not populated by the active scene-editor asset workflow.

Evidence: [roku_device_bridge.js](../deployment/roku_device_bridge.js), [runtime_debug_console.js](../deployment/runtime_debug_console.js), [memory_inspector_panel.js](../editor/panels/memory_inspector_panel.js), [index.html](../index.html), and [editor/scene_editor.js](../editor/scene_editor.js).

These classes should not be described as an operational live debugger or device memory monitor yet.

## Dormant/legacy infrastructure

The current editor uses its Konva scene editor and native BrightScript exporter. The separate WebGPU/ECS renderer modules and several small `editor/scene_editor/*` bridge/renderer files are not imported by that entry point. Some are minimal scaffolding rather than complete subsystems. Their presence alone does not mean those capabilities are available in the application.

No legacy files were deleted in this audit: external tools or old entry points may still refer to them. Export runtime templates are fallback copies; the exporter prefers canonical files in `source/engine`, so a stale fallback file does not by itself establish a bug in the current package.

## Verification

- Native execution regression checks are in [runtime_audit_checks.brs](../export/test/fixtures/runtime_audit_checks.brs), run through the local BrightScript interpreter by [gameplay_nodes.test.cjs](../export/test/gameplay_nodes.test.cjs).
- A diagnostic test verifies explicit warnings for all seven missing UI node implementations and MenuList input.
- Run `npm test` and `npm run check:runtime` for the complete automated checks.
- Visual Electron checks remain unavailable in this environment because the Electron installation fails the Windows sandbox access check. Physical-device behavior, device discovery, deployment authentication, and live debugging were not exercised.

Suggested implementation order: native UI classification/rendering/layout; MenuList item navigation; consolidation of deployment onto the current IPC contract; then streaming and animation-graph integration.
