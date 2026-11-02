# Roku Game Engine

Build scenes, sprites, tilemaps, components and menus in the original Electron editor, then test the exported native BrightScript game with the integrated [BrightScript Simulation Engine](https://github.com/lvcabral/brs-engine). **Roku/BrightScript is the game target.** Simulator support does not automatically implement absent engine features.

## Install and run

Use Node.js 22.12 or newer and Git. On a fresh checkout:

```powershell
npm.cmd ci
npm.cmd run simulator:setup
npm.cmd start
```

If dependencies and the simulator are already installed, run only `npm.cmd start`. This opens the original engine project manager as a desktop application. Do not open `index.html` directly.

1. Create or open an engine project containing `.rkscene` files.
2. Build scenes using the existing viewport, node tree, inspector, artwork and component tools.
3. Click **Build & Test** or press **F5**. The engine snapshots open scenes, exports native BrightScript, validates it, creates a Roku ZIP and opens the simulator automatically.
4. Read runtime output, restart or stop the game, or download its ZIP in the simulator window.

F5 uses current in-memory scenes. Save the project separately to preserve scene changes. Builds go under `.visual-editor/engine-builds/`; testing does not overwrite original project assets/source. An internal localhost server starts on an available port with the isolation headers required for SharedArrayBuffer.

**File → Export Game** and **Sideload to Roku** remain available. Final performance, audio and remote behavior still require checks on Roku hardware.

## Camera and UI compatibility

Basic camera following, fixed-position panels/labels and UI texture sizing have a simulator regression test. Advanced camera and UI authoring features are not all implemented in the native runtime. Builds report known gaps as warnings.

See [the compatibility report](docs/NATIVE_RUNTIME_COMPATIBILITY.md) for implemented fixes, required rework and testing limits. MOL and DOM can run as native ZIPs in the simulator; converting their drawing code into editable engine scenes remains separate work.

## Simulator

`npm.cmd run simulator:setup` installs and builds the local upstream clone at the revision in `tools/brs-engine.lock.json`. The clone retains its MIT license and is ignored by this repository. No upstream changes are needed for this integration.

`npm.cmd run simulator` serves the standalone upstream sample at **http://127.0.0.1:4174**. The earlier source-visualization utility remains available through `npm.cmd run start:visual`; the original game engine is the default application.

## Checks

```powershell
npm.cmd test
npm.cmd run check:runtime
npm.cmd run test:browser
```

The browser check opens hidden Electron windows, loads a fixture scene in the actual editor, builds native BrightScript and checks camera-follow, HUD and texture pixels in the simulator's frame buffer. Generated profiles and projects stay under ignored `.visual-editor/`. These are focused checks, not exhaustive gameplay or device validation.

## Update GitHub

Double-click **Roku-Game-Engine-Git-Push.bat** on Windows with Git for Windows installed. It stages changes, creates a timestamped commit when needed and pushes the current branch to origin. Review changes before running it; existing GitHub authentication is required.

From Git Bash, Linux or macOS:

```bash
bash Roku-Game-Engine-Git-Push.sh "Describe the engine changes"
```

The scripts locate the repository automatically and stop on conflicts/push failures. They never force-push. Dependencies, generated builds, test profiles and the simulator clone are excluded from commits.
