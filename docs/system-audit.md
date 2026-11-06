# Engine system audit

The functional gaps identified in the previous audit are now implemented in the active editor and canonical BrightScript runtime. This report covers code and automated verification; physical Roku testing remains outstanding.

## Repairs

| Area | Current behavior |
| --- | --- |
| Scene reload and object pools | Scene reload clones the authored template and resets scene-owned state. Released pool objects and their descendants stop processing and colliding until reacquired. |
| Native UI | CircleButton, TriangleButton and OvalButton render and participate in focus. HBoxContainer, VBoxContainer and MarginContainer calculate child positions and sizes. ScrollContainer applies offsets and clips descendants. |
| MenuList | Up/down changes the selected item, skips disabled entries and wraps unless disabled. OK dispatches the selected item's action. The visible row window follows selection. |
| Animation graphs | AnimationPlayerComponent loads and advances a graph, uses its sprite frames, dispatches frame/state events and fades between states using transition duration. Script parameters can drive transitions. Clearing graphPath returns to ordinary animation. |
| Asset streaming | The runtime constructs and processes the queue each frame. Successful bitmap loads update a monotonic LRU and byte estimates. Eviction removes actual bitmap and derived-cache references, while active scene assets remain pinned. Missing textures are not marked loaded. |
| Deployment | The panel uses the current build/upload IPC contract and developer credentials. Discovery uses SSDP; ping and restart use ECP. Restart launches the developer channel without uninstalling it. Upload and screenshots use the authenticated developer installer. |
| Device debugging | The main process receives TCP console output, handles fragmented UTF-8 and telnet negotiation, and routes logs and native telemetry to the requesting editor. Disconnect cancels reconnect attempts. |
| Editor panels | Deploy, Device Logs and Memory Estimates are mounted in the bottom dock. Memory estimates receive the current editor's asset metadata and refresh after changes. |

Usage and configuration: [Native systems guide](native-systems.md).

## Verification

- `npm test`: native export, packaged script hooks, UI layout/menu behavior, animation graph events/blending, streaming failure/eviction/pinning, and deployment/device-service regressions.
- `npm run check:runtime`: compile and validate all canonical BrightScript sources.
- Device transport tests use local HTTP/TCP servers and a simulated SSDP socket. They do not deploy to or control a physical device.
- `npm run test:ui` timed out before Electron exposed its debugging endpoint in this environment. The new panel presentation has not been visually verified here.

## Practical limits

Memory figures estimate asset/cache allocations; they do not measure total device RAM. Pinned active assets can exceed the streaming budget; the manager retains them and records a warning rather than breaking the current scene. Audio preloading resolves metadata, while native audio playback owns the audio data. Graph event catch-up is bounded to eight animation cycles and 64 events per update.

Physical-device checks still needed: UI appearance and clipping, fade performance, SSDP discovery on the target network, developer authentication, screenshot capture, restart, and live console telemetry.

## Dormant infrastructure

The current editor uses Konva and native BrightScript export. Separate WebGPU/ECS modules and unused editor bridge files remain legacy scaffolding, outside the active application path. They have not been activated or represented as working features. No legacy files were deleted because other entry points may still refer to them. Export prefers canonical files under `source/engine` over fallback templates.
