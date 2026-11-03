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
| Camera2D follow | Moving target remains centered in the native frame-buffer check | Static camera placement, zoom and bounds have coordinate/frame-buffer checks. Camera rotation and advanced follow behavior still need validation. |
| CameraPath2D, CameraZone2D, CameraTargetGroup | Editor/schema tooling exists | Implement path evaluation, zone selection, group framing and transitions in BrightScript, rendering and culling. Builds warn about these nodes. |
| Basic HUD | Panels/labels render in screen space while the world camera follows | Anchors, margins and inherited scale use a shared layout pass with a focused regression check. Clipping and broader preset combinations remain unverified. |
| UI textures | TextureRect sizing has a native pixel check | Referenced SVG artwork is rasterized to PNG during the shared native build; external SVG resources are rejected. |
| UI controls/screens | Native implementations are packaged and startup works | The editable sample exercises Select navigation, Title/Game/Win screens and scene restart. Options persistence, high scores and nine-slice states need further interaction regressions. |
| Transforms/rendering | Translation, static sprite scaling and parented sprite placement are tested | Parent scale, sprite pivots and collision bounds have a coordinate regression. Arbitrary sprite rotation is not implemented; rotated bounds use a conservative fallback. Sprite tint/opacity and animated/scaling-heavy scenes need additional validation. Builds warn about rotation and unsupported tint/opacity. |
| Components | Native MoveComponent drives the camera test | The sample exercises scripted movement, trigger collisions and collection. Physics, enemy patterns and pooling need further gameplay regressions. |
| Audio | Native implementations and metadata are packaged | Pitch/bus controls have no demonstrated native parity. Playback, mixing, transitions and hardware limits need a separate pass. |
| Export consistency | Simulator builds use canonical source, UI manifests and compiler validation | Simulator, export and sideload use the same native build service; the sample regression compares their packaged file contents. |

## Validation scope

`projects/MOL` converts Messenger of Light into 215 editable engine nodes and pooled sprite templates, retaining its original 22-day simulation in components. `npm.cmd run test:mol` checks editor save/reopen, native export, the original regression tests, remote navigation, movement/fire, pause/resume and final-game screens. Test-only encounter/delivery checkpoints cover victory and score entry without claiming a full campaign playthrough. See [the project guide](../projects/MOL/README.md).

Runtime JSON loads with case-insensitive members so scripted edits replace camel-case properties. Canvas-only scenes skip world sprite/transform work, and UI traversal stays cached until scene structure changes. TextureRect tint and opacity support the converted effects; world sprite limitations above still apply.

`npm test` checks packaging, preservation of edits, resource metadata and native build validation. `npm run check:runtime` checks all canonical BrightScript in the source scope. `npm run test:browser` opens the actual Electron editor and a simulator window and checks startup errors and native frame-buffer pixels for a moving camera target, fixed HUD and correctly sized texture.

`npm.cmd run test:browser-suite` also checks static zoom/bounds, parent scale, pivots, anchors, sample gameplay/restart and package equivalence. Results and logs are stored under `.visual-editor/artifacts/results/`.

This is a small supported subset. It does not establish full camera/UI parity, full-game compatibility, SceneGraph support, certification or device performance. The simulator makes gaps reproducible; it cannot implement absent engine systems automatically.
