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

Camera following, static camera zoom/bounds, parent scale, sprite pivots, UI anchors and texture sizing have simulator regression checks. Advanced camera and UI authoring features are not all implemented in the native runtime. Builds report known gaps as warnings. Referenced SVG artwork is rasterized during the native build.

Open `samples/collect-the-stars` in the project manager for an editable game with Title, Game and Win screens. Press Select to start, hold Right to collect four stars, then press Select to restart. Its BrightScript behavior lives in `components/behaviors/collect.brs`.

See [the compatibility report](docs/NATIVE_RUNTIME_COMPATIBILITY.md) for implemented fixes, required rework and testing limits. MOL and DOM can run as native ZIPs in the simulator; converting their drawing code into editable engine scenes remains separate work.

## Simulator

`npm.cmd run simulator:setup` installs and builds the local upstream clone at the revision in `tools/brs-engine.lock.json`. The clone retains its MIT license and is ignored by this repository. No upstream changes are needed for this integration.

`npm.cmd run simulator` serves the standalone upstream sample at **http://127.0.0.1:4174**. The earlier source-visualization utility remains available through `npm.cmd run start:visual`; the original game engine is the default application.

## Checks

```powershell
npm.cmd test
npm.cmd run check:runtime
npm.cmd run test:browser
npm.cmd run test:browser-suite
npm.cmd run test:ui
```

The UI audit checks dock tabs, button bindings, resource actions, collapsible inspector sections, numeric controls and scrolling at a short editor size. It opens Project Settings at 700×420 and checks its tabs, scrolling and saved settings using an isolated fixture project. Reports and screenshots go to `.visual-editor/artifacts/ui/`. Native file pickers and uploads to a physical Roku require manual checks.

With the visual server running (`npm.cmd run start:visual`), `npm.cmd run test:visual-browser` play-tests neighboring `MOL/roku` and `DOM/roku` projects in Chrome. It checks start, movement/fire input, stable pause frames and resume, and saves screenshots and reports to `.visual-editor/artifacts/native-games/`. Both projects are required; their original source files are preserved.

The browser check opens hidden Electron windows, loads a fixture scene in the actual editor, builds native BrightScript and checks camera-follow, HUD and texture pixels in the simulator's frame buffer. The full browser suite also checks coordinates and sample gameplay, restart, and package equivalence across simulator, export and sideload builds. Logs and results are written to `.visual-editor/artifacts/results/`. Generated profiles and projects stay under ignored `.visual-editor/`. These are focused checks, not exhaustive gameplay or device validation.

## Update GitHub

Double-click **Roku-Game-Engine-Git-Push.bat** on Windows with Git for Windows installed. It stages changes, creates a timestamped commit when needed and pushes the current branch to origin. Review changes before running it; existing GitHub authentication is required.

From Git Bash, Linux or macOS:

```bash
bash Roku-Game-Engine-Git-Push.sh "Describe the engine changes"
```

The scripts locate the repository automatically and stop on conflicts/push failures. They never force-push. Dependencies, generated builds, test profiles and the simulator clone are excluded from commits.
