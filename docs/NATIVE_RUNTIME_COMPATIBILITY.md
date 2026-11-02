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
| Camera2D follow | Moving target remains centered in the native frame-buffer check | Zoom, rotation, static camera placement, time-based smoothing and advanced bounds need a consistent native camera model. |
| CameraPath2D, CameraZone2D, CameraTargetGroup | Editor/schema tooling exists | Implement path evaluation, zone selection, group framing and transitions in BrightScript, rendering and culling. Builds warn about these nodes. |
| Basic HUD | Panels/labels render in screen space while the world camera follows | Anchors, margins, presets, inherited scale and clipping need a shared native layout pass. Use explicit positions/dimensions for now. |
| UI textures | TextureRect sizing has a native pixel check | Use PNG artwork. SVG skins need build-time rasterization before roBitmap loading. |
| UI controls/screens | Native implementations are packaged and startup works | Navigation/actions, screen/scene transitions, options persistence, high scores and nine-slice states need interaction regressions. Inclusion is not proof every state works. |
| Transforms/rendering | Translation, static sprite scaling and parented sprite placement are tested | Parent rotation, authored pivots and rotation across sprites, tilemaps, culling and collision need coordinated work. Sprite tint/opacity and animated/scaling-heavy scenes need additional validation. Builds warn about authored rotation/pivots. |
| Components | Native MoveComponent drives the camera test | Collision, physics, enemy patterns and pooling compile but need gameplay regressions. |
| Audio | Native implementations and metadata are packaged | Pitch/bus controls have no demonstrated native parity. Playback, mixing, transitions and hardware limits need a separate pass. |
| Export consistency | Simulator builds use canonical source, UI manifests and compiler validation | Older export/sideload paths should eventually share the same build service. |

## Validation scope

`npm test` checks packaging, preservation of edits, resource metadata and native build validation. `npm run check:runtime` checks all canonical BrightScript in the source scope. `npm run test:browser` opens the actual Electron editor and a simulator window and checks startup errors and native frame-buffer pixels for a moving camera target, fixed HUD and correctly sized texture.

This is a small supported subset. It does not establish full camera/UI parity, full-game compatibility, SceneGraph support, certification or device performance. The simulator makes gaps reproducible; it cannot implement absent engine systems automatically.
