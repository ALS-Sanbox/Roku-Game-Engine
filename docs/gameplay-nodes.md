# Gameplay helper nodes

Add world helpers from the scene editor's node list. Add **FocusGroup** from the UI Screens tab. Helper outlines use the editor's shared dashed style and keep their individual colors. Outlines, labels, and crosshairs are editor guides and are not drawn into the native game.

Open [the sample project](../samples/gameplay-helpers/README.md) for a scene containing all nine node types.

| Node | Setup and behavior |
| --- | --- |
| Marker2D | A named position with an editor crosshair. Use it for spawn points, starts, checkpoints, or attachment locations. Its origin is the marker position; its editor label does not enlarge selection bounds. |
| Timer | `waitTime` is seconds. Configure `oneShot`, `autostart`, and `paused`. Uses scaled game time and stops advancing when the scene pauses. `processWhenPaused` advances it using real frame time while paused. |
| TriggerZone2D | Configure width, height, collision layer, mask, and enabled state. It participates in the existing trigger collision system without needing a Collider2D component. Attach a Script component for collision events. |
| Path2D | Edit the waypoint array in the inspector or select **Edit Path** to drag points and insert/delete them. `closedPath` adds a segment back to the first point. Points are local to the path, so moving, rotating, or scaling the path moves its route. |
| PathFollow2D | Parent it under a Path2D, or set `path` to a path node's ID/name. Put moving artwork under the follower. `speed` is path-local units per second; `progress` sets the initial distance or seeks when changed. Configure `loop`, `playing`, and `rotates`. Routes use straight segments. Negative speeds are supported. |
| Parallax2D | Parent background sprites, animated sprites, or tilemaps under it. `scrollScaleX/Y` set motion relative to the camera: 0 stays fixed on screen, 1 follows ordinary world motion. `autoscrollX/Y` add world units per second. Positive `repeatWidth/Height` repeat descendant artwork along the layer's local axes; 0 disables that axis. Match repeat size to the artwork's local spacing. |
| VisibilityEnabler2D | Set `target` to a gameplay node's ID/name, or parent the region under its target. The target subtree's component processing, physics collisions, and gameplay helpers suspend while the region is outside the camera plus `margin`. It does not change authored visibility or component enabled flags. Multiple regions for one target keep it awake if any region is onscreen. Set `enabled` false to remove its suspension rule. |
| Spawner2D | Set `template` to an existing node's ID/name. The spawner clones that node and its child hierarchy. You can first instantiate a reusable scene in the editor and use that instance as the template. Hide the original template's root if it should not render. Alternatively, set `poolName` to use an existing ObjectPoolComponent pool. Set `spawnPoints` to an array of marker IDs/names; an empty array uses the spawner origin. Markers cycle in order. |
| FocusGroup | Parent menu controls under it. Set `initialFocus`, `wrap`, `restoreFocus`, and `trapFocus`. By default navigation stays inside the group and wraps at its edges. Reopening a hidden group restores its previous valid selection. Disable the group to remove its descendants from focus navigation. Controls expose Up/Down/Left/Right focus links in the UI inspector. |

References accept node IDs or names; unique names or stable IDs avoid ambiguity. The exporter checks missing references, invalid timing, malformed paths, recursive spawn templates, and initial focus outside its group.

## Script events and APIs

Attach a Script component and define hooks using the script's generated prefix. For `components/events.brs`, the prefix is `RokuScript_components_events`:

```brightscript
sub RokuScript_components_events_Timeout(context as Object)
  print "Timer fired: "; context.node.name
end sub

sub RokuScript_components_events_Spawned(context as Object)
  print "New node: "; context.extra.spawnedNodeId
end sub

sub RokuScript_components_events_CollisionEnter(context as Object)
  print "Entered trigger: "; context.extra.otherNodeId
end sub
```

| Hook | Source | Extra data |
| --- | --- | --- |
| Timeout | Timer | `waitTime` |
| CollisionEnter / CollisionStay / CollisionExit | TriggerZone2D and the other collider | `otherNodeId`, `isTrigger`, `phase` |
| PathFinished | Non-looping PathFollow2D reaching an endpoint | `progress` |
| ScreenEntered / ScreenExited | VisibilityEnabler2D; also reports its initial state | `targetNodeId` |
| Spawned | Spawner2D after successful creation/acquisition | `spawnedNodeId` |

```brightscript
context.engine.StartTimer("RespawnTimer")
context.engine.StartTimer("RespawnTimer", 2.5) ' Override wait time and restart.
context.engine.StopTimer("RespawnTimer")
spawned = context.engine.SpawnFromSpawner("EnemySpawner")
```

For automatic spawning, `interval` is seconds between bursts, `spawnCount` is the number requested per burst, and `maxActive` limits live spawned roots. `autostart = false` permits manual spawning only. Destroying a clone or releasing a pooled object frees an active slot. Exhausted pools return `invalid` without allocating more objects. Script callbacks can inspect `scene.runtime.nodes[nodeId].spawnedIds`, `timerRunning`, `timerElapsed`, or `pathProgress` for runtime state.

Timing work is bounded: repeating timers dispatch up to 32 callbacks per update and retain any backlog; automatic spawners issue at most one burst of up to 64 objects per update. Parallax rendering draws at most 256 copies per descendant per frame. Large repeated artwork or very small repeat sizes should be profiled on the target Roku.

The trigger solver uses enclosing axis-aligned bounds for rotated regions, matching the engine's existing collision behavior. Parallax repeats artwork; use a separate collision layer for gameplay geometry. Marker lookup and path following honor parent transforms. Spawned roots are placed at the marker origin; their authored orientation and scale are retained.

## Validation

Run `npm test` and `npm run check:runtime`. The gameplay tests check schema round trips, inspector geometry, invalid settings, sample export, and script hook packaging. When the local simulator's Node interpreter is built with `npm run build:node` inside `tools/brs-engine`, they also execute native BrightScript tests for timers, paths, trigger bounds, visibility suspension, spawning, parallax, and focus navigation. That runtime execution test is skipped when the optional interpreter is unavailable.
