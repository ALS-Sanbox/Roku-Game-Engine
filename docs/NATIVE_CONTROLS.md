# Native runtime controls

Rebuild projects to use the updated runtime. Existing editor settings are read from the saved scene and the current Build & Test snapshot.

## Rendering

Sprite2D and AnimatedSprite2D use native transformed artwork with authored pivots, rotation, signed scale, tint and opacity. Tilemaps apply rotation/scale and tint/opacity to their tiles. World drawing follows sibling Z order across sprites, tilemaps and colored nodes. UI descendants respect intersected ancestor `clipContent` rectangles, including nested clipping. Atlas buttons select their authored normal/hover/pressed/disabled regions; progress bars use background/fill/thumb regions, and nine-slice surfaces respect opacity. UI rotation, affine shear and polygon collision remain separate limits; builds retain warnings for unsupported rotated UI.

Transformed sprites use cached bitmaps with a 16 MiB aggregate budget, 4 MiB per sprite and 2048 pixels per axis. Large or heavily animated scenes still need device profiling. Native UI clipping uses one additional full-screen surface.

## Cameras

Enable **Current** on a Camera2D. Follow Target accepts a node name or ID. Native behavior includes look-ahead based on movement direction, offsets, deadzones, smoothing and bounds.

- CameraPath2D: enable Auto Play. Speed takes precedence; set speed below 1 to use duration. Linear, Smooth and Cubic interpolation, closed paths and loop playback are supported. `engine.EnsureNodeRuntime(pathNode).pathPlaying` can pause/resume; `pathTime` seeks in seconds.
- CameraZone2D: the highest-priority enabled zone containing the tracked target controls zoom/offsets. Room Lock centers that zone. Blend Time controls transitions. Path/group/bounds overrides accept node IDs or names. `CameraZoneChanged(context)` hooks receive `context.extra.zoneId` and `previousZoneId`.
- CameraTargetGroup: add targets; native framing includes their bounds and the group's padding, zoom limits and smoothing. Auto Track enables automatic selection; a zone can select a specific group.
- Dynamic Zoom responds to tracked-target speed and clamps to Min/Max Zoom. Set `context.scene.combatActive = true` to use Combat Zoom.
- `context.engine.ShakeCamera(8, 0.4)` requests shake with an 8-world-unit starting magnitude for 0.4 seconds. The camera's Screen Shake setting enables it.

## Physics

Collider2DComponent supplies AABB bounds and triggers. RigidBody2DComponent supplies dynamic/static/kinematic behavior, acceleration, gravity, friction, restitution and mass. Fast movement sweeps against solid boxes instead of only checking the final position. Collision correction converts back to parent coordinates, including scaled parents. Rotation Lock prevents SpinComponent from rotating a rigid body.

This is an AABB solver, not a general polygon, angular-dynamics or joint solver. Trigger callbacks are based on overlapping fixed-step positions; very fast objects may cross a thin trigger between steps.

## Audio

Configure clips and buses in Audio. Native export preserves mixer routing, volume, mute/solo, pan, EQ, pitch and effects by rendering processed variants into the build's `audio/native/` folder. Original files are preserved. All seven editor FX use the same Web Audio graph during an isolated hidden Electron render. Reverb is seeded for repeatable packages.

Looping variants retain their period after effect warm-up; non-looping variants include a finite effect tail. Effects are baked per clip rather than processed live across concurrent voices, and parameter changes require rebuilding.

Check One Shot for short effects. Compressed one-shots are converted to WAV during export. These use Roku's low-latency sound slots; the device determines how many can overlap. Music uses a shared streaming player. Starting another music voice replaces the current stream. Streaming voices support pause/resume; one-shots support play/stop. Scene changes, removed nodes and disabled components stop their voices.

Attach an AudioSourceComponent and assign the clip's resource path. Play On Input and Trigger Action are available in its Inspector; clip Play On Awake comes from the Audio panel. Scripts can use:

```brightscript
context.engine.ControlAudio("MusicNode", "play")
context.engine.ControlAudio("MusicNode", "pause")
context.engine.ControlAudio("MusicNode", "resume")
context.engine.ControlAudio("MusicNode", "stop")
```

An optional third argument chooses a component ID when a node has several audio sources. The function returns false for missing/disabled sources or unsupported commands. Actual sound quality, latency, memory and decoder behavior still require Roku hardware testing.
