# Native Roku engine compatibility

The original Electron scene editor is the application launched by `npm start`. F5 builds open scenes into the native Draw 2D runtime and runs that ZIP in `brs-engine`. Camera and UI components are engine abstractions drawn through `roScreen`; they do not need to become SceneGraph nodes to use the simulator.

## Repairs made during integration

- Restored Electron/Konva dependencies and their correct script path; removed startup references to unavailable JavaScript preview modules. Existing camera-path preview fallback remains in the editor.
- Made `source/engine/` the canonical exported runtime. Older templates previously took precedence, including UI implementations lacking newer node types.
- Fixed parse errors, duplicate focus/color functions, reserved parameter names and invalid string/number conversions. Replaced nonexistent roRandom/roJSON usage with native functions.
- Bound stateful helpers to the engine associative array so UI options, storage, focus and rendering retain their `m` context. Restored missing transform bindings.
- Fixed the message pump: `wait(0, port)` blocks indefinitely; nonblocking `GetMessage()` allows frames to advance.
- Fixed RGBA parsing and fallback constants; corrected TextureRect scaling factors; reused UI font registries.
- Wrapped compositor images in native regions and replaced unsupported roSprite.SetScale calls with cached scaled bitmap regions. Animated/scaling-heavy scenes still need memory/performance checks.
- Restored MoveComponent registration and one-argument scene-change actions used by UI controls.
- Preloaded simulator common assets before execution, eliminating a fonts/audio startup race. The host supplies isolation headers and the required font policy.

## Current baseline and remaining work

| System | Current evidence | Required work / limit |
| --- | --- | --- |
| Editor and build | Original scene opens; exported BrightScript validates; simulator starts | Missing optional preview modules were removed from startup, not recreated. Native preview is the execution reference. |
| Camera2D follow | Static/follow position, frame-rate-independent smoothing, directional look-ahead, deadzones and bounds run natively | Dynamic zoom responds to target speed; `scene.combatActive` selects combat zoom. `ShakeCamera` supplies decaying shake. Camera view rotation remains unsupported. |
| CameraPath2D, CameraZone2D, CameraTargetGroup | Native path playback (Linear/Smooth/Cubic), priority zones, room lock, overrides and target-group framing | Speed takes precedence over duration; duration is the fallback. Group framing includes target extents/padding. Zone blend time controls transitions. Device performance remains to be measured. |
| Basic HUD | Panels/labels render in screen space while the world camera follows | Anchors/margins/inherited scale and nested ancestor clipping have native pixel checks. Clipping uses a reusable full-screen offscreen surface; it has a memory/render cost. |
| UI textures | TextureRect sizing has a native pixel check | Referenced SVG artwork is rasterized to PNG during the shared native build; external SVG resources are rejected. |
| UI controls/screens | The editable sample exercises Select navigation, Title/Game/Win screens and scene restart | Atlas button-state selection, progress-bar skins and nine-slice opacity have native pixel checks. Broader options/high-score interaction and hardware behavior still need coverage. |
| Transforms/rendering | Sprites render rotation, signed scale, crop, tint and inherited opacity; tilemaps use transformed/tinted tile draws | Rotated/tinted/half-opacity sprite pixels are checked. UI rotation and affine shear from rotated nonuniform ancestors remain outside the supported renderer. Transformed sprite cache is limited to 16 MiB total / 4 MiB per node / 2048 pixels per axis. |
| Components | Native motion, triggers and AABB rigid bodies | Swept axis collision prevents thin-wall tunneling; correction uses parent space, mass/restitution transfer velocity, friction scales with dt, and contact pairs are deduplicated. Rotated/polygon collision is not an oriented rigid-body solver. |
| Audio | Mixer metadata and per-component voices reach native playback | Gain/mute/solo/routing, pitch, pan, EQ and all seven editor effects are baked into packaged WAV variants using the editor DSP graph. One music decoder plus device-limited one-shot WAV slots; live DSP/mixer automation is not provided. Hardware playback/latency still need checks. |
| Export consistency | Simulator builds use canonical source, UI manifests and compiler validation | Simulator, export and sideload use the same native build service; the sample regression compares their packaged file contents. |

## Validation scope

The separate `C:\Development\MOL_RGE` project converts Messenger of Light into 215 editable engine nodes and pooled sprite templates, retaining its original 22-day simulation in components. `npm.cmd run test:mol` checks editor save/reopen, native export, the original regression tests, remote navigation, movement/fire, pause/resume and final-game screens. Test-only encounter/delivery checkpoints cover victory and score entry without claiming a full campaign playthrough. `MOL_RGE_PROJECT` overrides the project location. The project and its assets are not required in the engine repository; unit integration checks skip when no MOL project is available.

Runtime JSON loads with case-insensitive members so scripted edits replace camel-case properties. Canvas-only scenes skip world sprite/transform work, and UI traversal stays cached until scene structure changes. TextureRect tint/opacity and cropped sprite/UI regions are supported. See the remaining renderer limits above.

`npm.cmd run test:ui-screens` checks the external MOL project's UI designer on an isolated copy: typography, custom fonts, CanvasLayer synchronization, zoom/pan, layout tools, undo/redo, scrolling and save/reopen. `npm.cmd run test:typography` compares native framebuffer text using default fonts, bold/italic/aligned text, a packaged TTF family and multiline text. Label and Button font settings are rendered in native builds; custom font variants must be supplied for matching family styles. These simulator checks do not establish typography parity on hardware.

`npm test` checks packaging, preservation of edits, resource metadata and native build validation. `npm run check:runtime` checks all canonical BrightScript in the source scope. `npm run test:browser` opens the actual Electron editor and a simulator window and checks startup errors and native frame-buffer pixels for a moving camera target, fixed HUD and correctly sized texture.

`npm.cmd run test:browser-suite` also checks static zoom/bounds, parent scale, pivots, anchors, sample gameplay/restart and package equivalence. Results and logs are stored under `.visual-editor/artifacts/results/`.

`npm.cmd run test:native-features` runs native assertions for camera look-ahead, paths, group framing, room zones, shake, swept collisions, penetration correction, scaled parents, mass transfer and audio setup, plus pixels for rotation/tint/opacity and UI clipping. `npm.cmd run test:native-audio` renders all seven effects, checks repeatable reverb, loop duration and stereo panning. Audio baking requires Electron; render failures become build errors. Offline render buffers are capped at 128 MiB; simple PCM processing is capped at 64 MiB. Non-looping effects include a finite tail (delay tails capped at ten seconds); looping effects are warmed up and exported as one period. Each clip is baked separately, so nonlinear shared-bus processing is not the same as live multi-voice DSP.

These checks do not establish full camera/UI parity, full-game compatibility, SceneGraph support, certification or device performance. In particular, polygon shape authoring does not turn the AABB solver into a polygon/constraint physics engine. Simulator coverage is recorded separately from Roku hardware validation.
