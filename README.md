# Roku Visual Editor

A focused, local visual editor and native BrightScript build/test workspace for MOL, DOM, Dusty Digger, and future Roku projects. **Native Roku/BrightScript is the only supported game target.** Games run through the upstream BrightScript Simulation Engine, using the same native source and assets that ship to Roku. The browser hosts the editor and simulator. The editor itself needs no external packages or Electron; building the simulator requires its npm dependencies.

## Start

Install Node.js 22 or newer, then run from this folder:

```powershell
npm.cmd start
```

Open **http://127.0.0.1:4173** in your browser. MOL and DOM are discovered in neighboring repository folders. For Dusty Digger or another game, click **Open project** and enter the full repository path or its `roku` folder. A project must contain `source/` with BrightScript files. Use `RGE_EDITOR_PORT` to choose another port if needed.

On a fresh clone, complete the simulator setup below before using **Build & test**. The simulator source and generated files are installed locally rather than committed to this repository.

## Edit and export

### Native BrightScript development and testing

One-time setup on another checkout:

```powershell
npm.cmd run simulator:setup
npm.cmd start
```

Setup clones [lvcabral/brs-engine](https://github.com/lvcabral/brs-engine) into `tools/brs-engine`, checks the upstream revision against `tools/brs-engine.lock.json`, installs its locked dependencies, and builds its browser runtime. The upstream source is MIT licensed and retains its LICENSE. The nested clone and generated builds are ignored by this repository. Update the lock deliberately when adopting another upstream revision.

Open **http://127.0.0.1:4173**, choose a game, then click **Build & test**. This saves edits, exports a separate native project, creates `game.zip` with a root manifest, and opens the actual BrightScript game in a new simulator tab. Restart, Stop, native print/error output and ZIP download are available there. **http://127.0.0.1:4173/simulator/** also accepts existing game ZIPs. The server supplies SharedArrayBuffer isolation headers automatically; use normal Chrome and a localhost URL rather than opening HTML files directly.

The native package includes current BrightScript source and runtime assets, excluding development tools, tests and old ZIPs. Packaging does not regenerate artwork or maze assets or run arbitrary game scripts. Refresh generated assets with each game's own asset builder when needed, then reopen the project before building here. SceneGraph extension support is not included in this first integration; MOL and DOM use the supported Draw 2D APIs.

Develop gameplay in native `source/*.brs` files and keep runtime artwork, audio and data in the Roku project. Build and test that same native project throughout development. Dusty Digger can use the same workflow once its Roku project is available. External game repositories and their existing asset-generation tools have not been reorganized by this editor setup.

For the standalone upstream sample app, `npm.cmd run simulator` serves the built clone at **http://127.0.0.1:4174**. Before setup it can fall back to a downloaded `brs-engine-*-web-app` folder in Downloads. You can select another simulator folder with `npm.cmd run simulator -- "C:\path\to\simulator-folder"`.

1. Choose a project and a drawing function from the screen selector.
2. Select a drawing in the layer list or canvas. Drag positioned drawings with grid snapping, or edit their properties. Undo and redo are available.
3. Browse the actual project artwork; click an image to use it as a preview reference.
4. **Save edits** stores a session under `.visual-editor/` in this workspace.
5. **Export edited copy** copies the Roku project to `.visual-editor/exports/` and applies edits directly to the copied BrightScript source. The original game is never modified. The resulting folder retains the original project structure; use its packaging workflow to produce a sideload ZIP.
6. **Build & test** creates a native ZIP from that edited copy and launches the BrightScript simulator.

Source changes made outside the editor invalidate an open session before saving/exporting. Reopening detects stale saved sessions and leaves them unapplied. Saving a new session archives the stale session automatically beside it.

## Supported editing

The importer reads `DrawText`, `DrawRect`, `DrawObject`, and `DrawScaledObject` calls. Literal x/y coordinates, dimensions, scales, RGBA colors, and complete literal text strings can be edited. Dynamic text expressions are preserved. The canvas displays sample text and approximate system fonts. It is a layout aid, not a Roku renderer or gameplay simulator.

Calculated coordinates and helper functions (for example MOLText, CenterText, and sprite/maze renderers) need game-specific adapters before their calculated layouts can be edited visually. Drawings with calculated positions are available in the layer list for their other literal properties. Sprite calls currently have placeholder boxes; the artwork browser shows the real source assets. Reference artwork does not change exported rendering. Conditional drawings within a function may appear together in the preview.

MOL and DOM work through this generic source importer today. Dusty Digger was not present locally during implementation; open its Roku source folder to use the same importer. Future games should use literal drawing properties or factor presentation into documented data files for adapter support. Gameplay is authored in BrightScript.

## Development and preserved engine

`npm.cmd test` runs source-patching and containment checks. The new application lives entirely in `visual-editor/`. The previous scene editor, engine runtime, export code and documentation remain in their existing locations for selective reuse; they are not loaded by the new application. `npm start` launches the focused editor. Legacy editor completeness and Roku runtime compatibility are separate from this editor's source editing support. Exported games still require validation on Roku hardware.

With the editor running, `npm.cmd run test:browser` performs an optional headless Chrome startup check for discovered MOL/DOM projects, builds native ZIPs, verifies browser isolation, checks for JavaScript errors, and checks for painted game pixels. This is a startup smoke test, not full gameplay validation. On other systems set `CHROME_PATH` to the Chrome executable; set `RGE_EDITOR_URL` if the editor uses a different port. Temporary browser profiles and generated games stay under ignored `.visual-editor/`.

## Update GitHub

On Windows, double-click **Roku-Game-Engine-Git-Push.bat**. It uses Git for Windows to run the companion script from this repository, stages local changes, creates a timestamped commit when needed, and pushes the current branch to `origin`. Review your changes before launching it. Existing GitHub authentication must be configured.

From Git Bash, Linux or macOS, optionally supply a descriptive commit message:

```bash
bash Roku-Game-Engine-Git-Push.sh "Describe the editor changes"
```

The scripts work after moving or cloning the repository; no machine-specific project path is required. They stop on conflicts or push failures and do not force-push. Generated sessions, game exports, browser profiles, dependencies and the nested simulator clone are excluded by `.gitignore`. The pinned simulator revision is tracked in `tools/brs-engine.lock.json`.
