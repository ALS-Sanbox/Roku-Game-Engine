# Roku Game Engine — User Manual

**Production Alpha · v0.1.0 · Desktop authoring and native Roku runtime**

Create scenes, artwork, menus, animation, audio and BrightScript behaviors; then build, test and deploy a native Roku game.

This manual describes the active application in this repository. Reference tables are generated from its current schema and visible controls. Screenshots show the included Collect the Stars project in the earlier Dark theme. Mid-tone is now the default for new preferences. Docks can move, so your arrangement may differ. Explanatory diagrams are labeled illustrations, not screenshots of additional features.

## 1. What the engine is

Roku Game Engine is a desktop 2D editor built around a scene tree. Arrange visual and logical nodes, change their properties, attach reusable components, and write BrightScript when built-in behaviors are not enough. The result is a native Roku package containing BrightScript, assets and a manifest. The authoring canvas uses Konva; exported games use the canonical runtime under source/engine.

It supports remote-controlled arcade games, simple scrolling games, puzzles, menus, HUDs and prototypes. Its active tools include camera helpers, tile painting, image slicing, animation, AABB physics, audio authoring, persistent options/high scores, simulator testing and developer-device deployment.

The scene canvas and camera preview are authoring views. Build & Test executes the exported native package in the simulator. This is an alpha: verify final input, audio, memory and performance on the Roku models you intend to support.

| Term | Meaning |
| --- | --- |
| Project | A folder containing project.settings.json, scenes, artwork, audio, fonts and scripts. |
| Scene | A saved .rkscene document containing a root and a hierarchy of nodes. |
| Node | An object in the hierarchy: sprite, camera, menu control, timer, path or other helper. |
| Component | A behavior attached to a node: movement, collision, audio, animation or a script. |
| Resource | A reusable image, sprite sheet, frame library, tileset, style, font or audio clip. |
| Inspector | The property editor for the selected item. |
| Runtime | The BrightScript engine executing the exported game. |
| res:// | Project-relative path, such as res://images/player.png. |
| pkg:/ | The resource prefix inside the native package. |

[[figure:pipeline]]

## 2. Install, launch and first build

Install Node.js 22.12 or newer and Git. Open PowerShell in the repository folder. Initial dependency and simulator setup require downloads.

```powershell
npm.cmd ci
npm.cmd run simulator:setup
npm.cmd start
```

Use npm.cmd start on subsequent launches. In other shells, npm can replace npm.cmd. Do not double-click index.html: filesystem, native builds and device operations depend on Electron.

In the project manager, select a project to inspect its details. Open its folder rather than an individual asset. Search/sort controls organize the project list. Create a project for a new game; open samples/collect-the-stars to follow this guide.

Create makes a project folder; Import registers an existing one; Scan Folder Projects searches a local folder, not the Roku network. The selected project's Edit opens it; Export builds it; Rename changes its folder; Duplicate copies it; Manage Tags edits comma-separated tags; Remove removes the manager entry without deleting the folder. Project-manager Settings controls default list sorting and recent-project limit, not game input or the editor theme.

1. Open samples/collect-the-stars, then CollectStars.rkscene.
2. Select player in the Scene tree and inspect its transform/components.
3. Choose the startup scene in the top toolbar.
4. Click Build & Test or press F5. Wait for export, validation and simulator startup.
5. Use the simulator remote's Select/OK action to start; move Right to collect stars; use Select to restart after winning.
6. Change a label or position, build again, and save your authored scene separately.

Build & Test includes current in-memory scene edits. It is not a substitute for saving the scene/project. Scripts have a separate save state; builds save edited scripts through the script editor before compiling.

## 3. Workspace and docking

[[figure:workspace]]

The numbered markers locate the toolbar, left tools, world canvas, Inspector, Scene tree and Output. The center has open-scene tabs; the right Inspector follows the active selection. Specialist tools appear in docks. Use Tabs to reveal a hidden tool, drag dividers to resize areas, and Tabs → Default to restore the default arrangement. Closing a dock tab hides the tool; it does not delete its data. Return to dock exits the UI designer's expanded arrangement.

Select nodes through the tree or canvas. Selection handles describe the editing rectangle. Camera frames, path lines, trigger outlines and marker crosses are guides, not artwork exported into the game. Eye/visibility controls on actual nodes can affect the game; guide toggles in the Camera menu only change authoring overlays.

World nodes live in camera-controlled space. UI nodes normally belong beneath CanvasLayer and use screen-space layout. Place the HUD under CanvasLayer rather than under the player sprite so world movement does not become menu placement.

[[figure:hierarchy]]

## 4. Icons, buttons and toolbar

Tooltips are the quickest reminder of a symbol's meaning. A plus usually adds an item in the current list. A tab cross closes/hides the tab; a delete/trash control removes selected data. A triangle usually plays/previews. A circular arrow refreshes that tool; it does not necessarily restart the game.

[[figure:icons]]

| Icon/label | Action and consequence |
| --- | --- |
| Build & Test / play triangle | Export, validate, package and run the native game. Shortcut: F5. Read compiler diagnostics if it fails. |
| Startup scene | Choose the entry scene for the next build; distinct from the active editing tab. |
| Select / selection symbol | Select and manipulate scene objects. |
| Pan / four-way symbol | Move the editing view without moving game nodes or the runtime camera. |
| Edit Path | Edit points on selected Path2D/CameraPath2D rather than moving the whole node. |
| Undo / curved left arrow | Undo a supported edit in the current editor. Text has its own history. |
| Redo / curved right arrow | Reapply an undone edit. New edits can replace the redo branch. |
| Frame / framing box | Bring selection into view; node coordinates are unchanged. |
| Grid / square grid | Toggle the editing grid, which is not exported artwork. |
| Snap | Toggle snapping for supported edits. Check snap settings when motion seems constrained. |
| Camera dropdown | Show/hide guides and open camera navigation/preview tools. |
| Eye in a tree | Toggle the node's authored visibility. |
| Lock in a tree | Protect/unprotect an item from accidental editing interaction. |
| Disclosure triangle | Expand/collapse a tree branch or property section without disabling it. |
| Plus | Add an item appropriate to the current resource list or node context. |
| Tab cross | Hide/close a tab; it is not node deletion. |
| Refresh / circular arrow | Refresh that panel's preview or data. |
| Fit / 100% / percentage | Change authoring-preview magnification, not Camera2D runtime zoom. |
| Gear / Options | Open configuration for its current context. Project Settings is File → Settings. |

### File menu

Create Project starts a new project; Open Project selects a folder; Back to Manager returns to project selection. Save Project saves project work; Save As saves through the project-copy workflow. Export Game produces a Roku package. Build & Test in Roku Simulator runs the native build path. Sideload to Roku opens the developer-device dialog. Settings opens project/input/screen configuration and editor appearance. Quit exits.

The Scene panel search finds editable nodes by name, type or ID, ignoring case. Combine words to narrow results. Matching nodes appear with their ancestors even when those branches were collapsed. Enter selects the first match; Escape or the clear button restores the full tree. Select a node to drag it from inside its selection rectangle, including when guide overlays cover its artwork. Locked nodes remain fixed.

### Scene menu

New Scene creates a scene; Open Scene opens one; Rename Scene changes its name. Save Scene and Save Scene As persist it. Reload Saved Scene replaces current memory state with the saved version: preserve edits first. New Inherited Scene derives from a base; Rebase Inherited Scene updates from its base; Revert Inherited To Base removes its overrides through that workflow. Back up before intentionally discarding overrides. Close Scene/Close All Scenes close editing tabs, not runtime scenes.

## 5. Nodes, transforms and Inspector

Create adds a node from the available types. Select the intended parent first and inspect the resulting hierarchy. The tree/context menu exposes available hierarchy, duplication and deletion operations. Names help humans; IDs are stable references. Avoid changing IDs used in scripts and avoid ambiguous duplicate names when target settings resolve by name.

X/Y are parent-local coordinates, positive right/down. Rotation is degrees. Scale multiplies the node and descendants; negative scale flips supported artwork. Pivot X/Y are local pixel units describing the rotation/scale origin. Pivot Preset is a convenient origin choice. Width/height size the rectangle; scale changes its transformation. Z/order determines relevant sibling drawing order. Opacity is normally 0–1 and inherited. Node tint/colors belong to the game, independently of editor appearance.

[[figure:transform]]

Inspector search finds properties. Disclosure arrows open sections. Numeric steppers adjust values; typing sets exact values. Checkboxes are boolean toggles; dropdowns choose modes; resource pickers assign project assets. An empty target/resource normally means unassigned, not an automatic search for artwork.

SceneInstance references a reusable scene: use it for enemies, menu sections and prefabs. The source is the template, while per-instance overrides customize it. Editable children and selected override determine what you are changing. Fix missing source references rather than treating a placeholder as the source. Runtime scene loads use fresh authored copies; previous playthrough mutations do not replace the saved template.

| Key/gesture | Context and result |
| --- | --- |
| F5 | Build & Test. |
| Arrow keys / Shift + Arrow | Nudge world selection by one unit / grid step when not editing text. |
| Ctrl/Cmd + D | Duplicate selected world nodes outside text editing. |
| Delete / Backspace | Delete world selection; in path mode, delete selected points. |
| Escape | Close applicable menus or leave/cancel applicable point editing. |
| O / E / P on world viewport | Tile picker / erase / paint operations; context-sensitive. |
| Ctrl/Cmd + S in Scripts | Save the active script. |
| Ctrl/Cmd + F in Scripts | Find text; Find next advances the search. |
| Tab in Scripts | Insert two-space indentation. |
| Wheel in UI preview | Pan; Ctrl + wheel zooms; Alt + drag pans. |

## 6. Images, sprites and slicing

Sprite2D displays an image. Assign a project-relative path. Contain shows the whole image within the rectangle and may leave space; Cover fills the rectangle while cropping overflow; Stretch fills it by changing aspect ratio. PNG is predictable raster artwork. The native build can rasterize referenced SVG to PNG; external SVG resources are rejected.

Sprites manages sprite sheets. Upload an image, set Tile W/H, Padding and Offset X/Y, then select cells. Grid toggles the overlay. Search/sort/category filters organize sheets. A SpriteFrames library groups frame indices into named animation clips. Changing sheet geometry can change which pixels an existing frame index selects.

### Sprite Slicer procedure

1. Open Tabs → Sprite Slicer. Import image or Use selected element image.
2. Enter cell dimensions, spacing and offsets; choose Slice grid. Complete cells are generated in row order.
3. Select cells; Ctrl/Shift-click toggles multi-selection. For irregular atlases choose Draw rectangle and drag a region. Zoom/scroll as needed.
4. Name the slices and Save selected regions. Batch names are numbered; the source image is preserved.
5. Select a saved region and scene element, then Apply region to selected element. Existing size, position, pivot and script connections remain.
6. Create from region instead makes Sprite2D, TextureRect, Button or Panel at natural size with a top-left pivot.
7. Save the scene and resource state.

UI borders preserve edge pixels as a button/panel resizes. Left/top/right/bottom borders must leave a center. Zero borders give a simple crop. Edit UI borders / states opens detailed atlas styling. Slicing creates reusable regions, not animation clips; author those in Sprites/Sprite Frames.

[[figure:nineslice]]

## 7. Animation and graphs

AnimatedSprite2D needs a SpriteFrames library and valid animation name. Frame supports manual/non-playing selection. Playing advances frames; Speed Scale changes playback rate. AnimationPlayerComponent provides component playback and graph integration.

Set graphPath on that component to a project JSON graph. The sprite's spriteFramesId points at an imported library; graph clips can override it. A graph clip name selects library metadata, while its frames are sheet indices. Parameters drive transitions. Duration fades the previous state image into the new state; this is an image crossfade, not skeletal blending.

```json
{
  "id":"hero", "defaultState":"idle",
  "parameters":{"Speed":{"type":"float","defaultValue":0}},
  "states":[{"id":"idle","clipId":"idleClip"},{"id":"run","clipId":"runClip"}],
  "clips":[
    {"id":"idleClip","name":"Idle","frames":[0,1],"fps":4,"loop":true},
    {"id":"runClip","name":"Run","frames":[2,3,4,5],"fps":10,"loop":true,
     "events":[{"frame":2,"name":"footstep"}]}
  ],
  "transitions":[
    {"from":"idle","to":"run","duration":0.15,
     "conditions":[{"param":"Speed","op":">","value":0}]},
    {"from":"run","to":"idle","duration":0.15,
     "conditions":[{"param":"Speed","op":"==","value":0}]}
  ]
}
```

Call context.engine.SetAnimationParameter(context.node.id, "Speed", 2.0) from an attached script. Initial graphParameters accepts JSON such as {"Speed":0}. Set trigger parameters true; evaluation clears them. AnimationEvent supplies authored frame events; AnimationStateChanged identifies transitions. Clearing graphPath restores ordinary animation. Catch-up events are bounded to eight cycles and 64 events per update.

[[figure:animation]]

## 8. Tilemaps, layers and terrain

Import the sheet, create a tileset, then assign it to TileMap. Map Width/Height are cell counts; Tile Width/Height are cell dimensions. The node transform positions the map. Choose the active layer before painting. Layers separate background/decorations/gameplay content.

| Tool/mode | Purpose |
| --- | --- |
| Paint / Rect / Line | Place the selected tile or brush cell-by-cell, as a rectangle or along a line. |
| Erase | Remove cells from the active layer. |
| Fill | Fill a connected area under the current mode/brush rules. |
| Pick | Sample a placed tile into the current brush. |
| Tiles / Terrain / Collision | Edit explicit tile identities / terrain rules / collision-related data. |
| + Layer | Add a layer to the map. |
| Sync Screen | Synchronize map dimensions using the current screen setup. |
| Clear | Clear the relevant map/layer data; verify the active context first. |
| Rules / Collision overlays | Reveal terrain-rule or collision metadata on the tileset. |
| Select w/ Rules | Select tiles that have terrain rules. |
| Clear Selection | Clear editing selection without deleting the tiles. |

Terrain sets organize terrain types and neighbor/socket rules. Define terrain types, assign appropriate rule data and variants to tiles, then paint terrain. Probability/randomized interiors choose among eligible alternatives; they do not create missing art. Save the scene/resource data after tileset changes.

Tile Opts includes collision/physics shape tools: Rect draws a rectangle; Poly clicks points and double-click closes; Select selects/moves shapes; Full Tile inserts a tile-sized box; Clear All removes those shapes. Native physics uses enclosing AABBs for polygon/compound data, not polygon rigid-body dynamics. If painting fails, check map, tileset, active layer, brush, visibility and mode before repainting a level.

## 9. Cameras and overlays

Set Current and Enabled on the Camera2D that should drive the game. Follow Target identifies the tracked node. Without a follow target, use a static position. Follow Lerp/Smooth Follow control response; Offset changes framing. A deadzone allows movement before following. Look Ahead anticipates target direction. Runtime camera Zoom differs from editor viewport zoom.

CameraBounds2D/camera bounds restrict travel. CameraZone2D applies regional behavior: the highest-priority enabled containing zone wins, Blend Time controls transition timing and Room Lock centers a room. Target groups frame referenced nodes with padding and zoom limits. CameraPath2D follows authored points; Auto Play starts automatically. Speed takes precedence over Duration; a speed below 1 uses duration. Camera paths support Linear/Smooth/Cubic interpolation; gameplay Path2D is separate and uses straight segments.

[[figure:camera]]

The Camera menu controls frame, deadzone, look-ahead, bounds, labels, zones, paths and target-group guides. These are authoring overlays. Focus/Frame/Jump To Camera navigate the editing view. Toggle Preview Panel opens the camera preview. Select a camera, Fit or choose magnification, pause/resume and refresh. Play Path/Stop preview the selected camera path; they do not record a movie or replace a native run.

Native camera view rotation is not implemented. A rotated camera outline does not rotate the exported view. Sprite rotation is supported separately. Consult build warnings before depending on unsupported UI/camera transforms.

## 10. UI Screens and layout

[[figure:ui]]

Open Tabs → UI Screens. Choose a screen/layer to isolate it. Select a control in Elements and edit Element properties. Fit, minus/plus and percentage change magnification; Refresh redraws; Return to dock restores docking. Other screens can be hidden in the preview without being removed from the project.

Begin with CanvasLayer, then add Control, Panel, Label, Button and other controls beneath it. Anchors are fractions of parent dimensions; margins are pixel offsets from those anchors. Right/bottom anchors of 1 follow those edges. Stretch presets choose matching anchor pairs. Alignment tools arrange selections. Container-owned children can have authored positions overridden by layout.

| Layout node | Native behavior |
| --- | --- |
| Control | General rectangle/group; clipContent constrains descendants. |
| HBoxContainer | Visible children in a row with separation and begin/center/end alignment. |
| VBoxContainer | Visible children in a column with separation and alignment. |
| MarginContainer | Children fill its padded inner rectangle. |
| ScrollContainer | Offset the content and clip descendants to the viewport; change scrollOffsetX/Y by property/script. |

Oversized box children shrink proportionally to fit. Check text and buttons at the intended screen resolution. UI supports anchors, inherited scale, clipping, textures and opacity; rotated UI and affine shear are outside the native renderer.

Label stores text, size, color and alignment. UI typography controls expose available font file/family and style options. Choose font selects a project font; resource paths usually look like res://fonts/name.ttf. Build/target support still matters. Large type in a short rectangle can clip.

TextureRect displays fitted artwork; Panel is a colored/styled rectangle. NineSlicePanel preserves textured edges/corners. ProgressBar maps Value between Min/Max with an optional label and style regions: update Value from gameplay rather than resizing its rectangle each frame.

## 11. Buttons, focus and actions

Button, CircleButton, TriangleButton and OvalButton share state colors, text, focus and action settings. The shape affects drawing; navigation remains remote-driven. Focused Color identifies current focus; Pressed Color indicates activation. Default Focus provides an initial choice where applicable. Disabled controls cannot be activated normally.

Explicit Focus Up/Down/Left/Right links resolve ambiguous spatial navigation. FocusGroup traps related menu controls; Initial Focus starts selection, Wrap moves around edges, Restore Focus remembers a valid prior control. Disabling the group removes descendants from navigation.

MenuList items can be strings or objects with label, action and disabled. Up/down changes selectedIndex and skips disabled entries; the visible row window follows selection. OK uses the item's action or the node action. Set wrap false to stop at the ends. MenuSelectionChanged/MenuItemSelected hooks belong on the MenuList owner.

```json
["Continue", {"label":"Start","action":"scene:Game"},
 {"label":"Locked","disabled":true}]
```

| Action string | Runtime effect |
| --- | --- |
| scene:Game / push:Pause | Change scene / push a scene through scene-stack behavior. |
| screen:Title / pushscreen:Pause | Change / push a UI screen. |
| popscreen | Pop the UI screen stack. |
| transition_screen:Game / transition_scene:Game | Change screen/scene using the default transition. |
| custom:StartGame | Deliver a custom action/event for scripts. |
| option_cycle:musicVolume | Cycle a defined option. |
| option_set:difficulty=hard | Assign a defined option. |
| options_reset | Restore option defaults. |

Names must match existing scenes/screens/options. Connect selected button in Scripts replaces the old action with a generated custom action. Save both script source and scene attachment/action data.

## 12. UI assets, transitions, options and scores

UI Assets Atlas stores reusable nine-slice styles. Pick Image selects a source. Slice borders protect corners/edges; Center/Edge modes choose how other areas draw. Button styles can have state regions; progress styles can have background/fill/thumb regions. Save Style persists the definition; Delete removes it, so check its users first.

Transitions authors presets: plus creates, type/easing/timing configure, Preview auditions, Duplicate copies and Delete removes. Runtime changes must reference a preset or supported action/API. A preview does not prove device performance.

Options defines persistent settings. Add built-in options inserts the supplied definitions; plus creates custom definitions; delete removes the selected definition. Each key/type/default provides data for actions and UI bindings. High Scores creates named local score tables, not a network leaderboard. Configure limits and bind entry/display UI. Device registry data persists separately from the editor definition; deleting a definition is not an explicit storage clear.

Templates generate editable starter UI structures. Choose one, review startup options and Create. Adapt labels/actions to existing scenes. A template is a starting point, not a complete game controller.

## 13. Gameplay helpers and pooling

Marker2D is a named position for starts, spawns or checkpoints. Timer emits Timeout in seconds: Autostart starts it, One Shot ends after one firing, Paused stops that timer. Process When Paused permits real-time advancement while the scene is paused.

TriggerZone2D is a trigger without a separate Collider2D. Contact Method selects project default, AABB box or circle; Circle Radius 0 fits half the smaller dimension. Set Layer/Mask and attach collision hooks. Path2D stores local points. PathFollow2D references a path or its Path2D parent; put artwork beneath it. Speed is path-local units/second, Progress sets/seeks distance, Loop repeats, Rotates follows its tangent. Negative speed is supported.

Parallax2D changes descendants' camera-relative motion. Scroll Scale 0 stays fixed onscreen; 1 behaves like world motion. Autoscroll adds units/second. Positive repeat dimensions repeat artwork; zero disables that axis. Repeated artwork does not duplicate gameplay collision.

VisibilityEnabler2D suspends target processing/physics outside the camera plus Margin. It does not rewrite authored visibility/enabled flags. Multiple regions keep the target active if any is onscreen. Spawner2D clones an existing template hierarchy or acquires a pool item. Spawn Points cycle marker references; an empty list uses the spawner origin. Interval is seconds per burst, Spawn Count is requests per burst, Max Active caps live roots.

ObjectPoolComponent preallocates reusable objects. PoolAcquire returns an item or invalid if exhausted; PoolRelease suspends it until reused. Merely hiding a node is not pool release. See samples/gameplay-helpers for the helper types and script hooks. Repeating timers dispatch at most 32 callbacks per update; automatic spawners issue at most one burst of up to 64 objects; parallax drawing caps copies per descendant.

[[figure:gameplay]]

## 14. Components, input and physics

Add a component through the node Inspector. Enabled toggles the behavior; Priority orders execution within its phase. Avoid competing movement behaviors unless their combination is intentional. Move adds velocity, Spin rotates, Bob adds a sine offset, input components move from remote actions, Enemy AI supplies selected movement patterns, Object Pool prepares reusable objects, and animation/audio/script components connect those systems.

Collider2DComponent supplies axis-aligned dimensions/offsets, trigger state and collision Layer/Mask. RigidBody2DComponent supplies body type, velocity, acceleration, gravity, friction, bounce and mass. Dynamic bodies advance through physics; choose static/kinematic when appropriate. Lock Rotation prevents SpinComponent rotation through the rigid-body path.

For triggers, Contact Method selects project default, AABB (box bounds) or Circle (distance checks). File → Settings → Physics sets the project default; existing projects default to AABB. Circle Radius 0 uses half the smaller Width/Height; a positive value sets a local radius. The circle center is the rectangle midpoint plus offsets. World radius uses the largest transform stretch, keeping a conservative circle under nonuniform scale. Circle mode ignores custom Physics Shapes. Solid colliders always use AABB physics.

Circle-circle contacts compare squared distances without a per-pair square root; mixed circle-box contacts use the closest box point. Both choices retain spatial buckets, layer masks and Enter/Stay/Exit hooks. Neither guarantees higher frame rate: scene traversal, transforms, scripts and drawing also cost time. Rebuild after changing project settings.

Solid movement sweeps against AABBs and resolves position/velocity; collision hooks report contacts. Trigger checks use fixed-step overlap, so very fast objects can cross thin triggers. Use `engine.QuerySegment(x1, y1, x2, y2, radius, skipId, colliders)` for swept projectile queries against the selected box/circle contacts; it returns ordered hit records with nodeId, fraction, x, y and collider. Radius defaults to 0, skipId to an empty string, and an omitted collider list builds a native snapshot. Polygon/rotated box shapes use enclosing AABBs. There is no general joint, polygon or angular-dynamics solver.

File → Settings → Input maps move_up/down/left/right, action, pause and back to remote buttons. Prefer action names in game code so mapping changes do not require rewriting gameplay. The simulator remote controls runtime input; the editing shortcuts in chapter 5 control authoring instead.

## 15. Audio authoring and playback

Audio imports/manages clips and buses. Select a clip to set volume, pitch, pan, loop, one-shot and play-on-awake. Mixer routes apply gain, mute/solo, EQ and supported effects. Mute silences a route; Solo isolates according to mixer rules. Preview auditions authoring sound, not device decoder behavior.

[[figure:audio]]

### Mixer controls and seven effects

Clear Solo clears solo isolation across buses. + Add Bus creates a submixer. A bus name can be renamed; its delete control removes a non-master bus. A fader changes gain; meters display signal activity. Pan positions sound left/right. Send routing selects an output bus and its send amount. Avoid routing cycles. EQ opens LOW (80 Hz), MID (1 kHz) and HIGH (12 kHz) gain sliders. FX opens the effect list; Add inserts the selected effect; the checkbox bypasses/enables it; the pencil opens its parameters; the cross removes it. + Import Clip imports project audio, while a clip row's transport auditions it. Parameter changes are saved as authoring metadata and baked during export.

| Effect | Parameter meanings and defaults |
| --- | --- |
| Reverb | roomSize 0.5: apparent space; damping 0.5: damping of reverberation; wet 0.3: processed amount. |
| Delay | time 0.25 seconds: echo delay; feedback 0.4: repeated echo amount; wet 0.3: processed amount. |
| Compressor | threshold -24 dB: onset; ratio 4: compression ratio; attack 0.003 seconds and release 0.25 seconds: response timing. |
| Distortion | drive 0.5: saturation intensity; tone 0.5: tonal setting; wet 0.7: processed amount. |
| Chorus | rate 1.5 Hz: modulation speed; depth 0.7: modulation extent; feedback 0.3: recirculation; wet 0.5. |
| Phaser | rate 0.5 Hz: modulation speed; depth 0.6: sweep extent; feedback 0.7: recirculation; wet 0.5. |
| BitCrusher | bits 8: quantization resolution; normFreq 0.1: normalized sample-rate setting; wet 0.5. |

Wet values run from 0 to 1. The panel's sliders show the supported range/units for each parameter. More effect intensity is not necessarily louder-safe audio: audition levels and verify the baked result. Effects are editor/export processing, not live device automation.

Export bakes mixer/effect processing into audio/native playback variants, preserving original files. It is not a live multi-voice DSP graph on Roku; changing baked parameters needs a rebuild. Loops retain their period after warm-up; non-loops can include effect tails. All seven supported editor FX are baked by the export audio path.

Use One Shot for short effects; compressed sources convert to WAV. Device low-latency slots determine overlap. Music uses one shared stream, so a second music stream replaces the first. Streaming supports play/pause/resume/stop; one-shots support play/stop. Test codec support, latency and memory on hardware.

Attach AudioSourceComponent and assign Resource Path. Play On Input/Trigger Action can activate it; Play On Awake comes from clip settings. Scripts can control it:

```brightscript
context.engine.ControlAudio("MusicNode", "play")
context.engine.ControlAudio("MusicNode", "pause")
context.engine.ControlAudio("MusicNode", "resume")
context.engine.ControlAudio("MusicNode", "stop")
```

An optional third argument selects a component ID for nodes with multiple sources. False indicates missing/disabled sources or unsupported commands. A small compressed source can expand greatly after decoding.

## 16. BrightScript editor and hooks

[[figure:scripts]]

Open Tabs → Scripts, double-click a project script in FileSystem, or choose Edit script on its component. New creates a .brs file under components. Select a node, then Attach to selected node to add ScriptComponent. Related/controller links describe architecture; they do not attach another executable script automatically.

Hook names use the relative path: components/player.brs becomes RokuScript_components_player. Update prefixes and component paths if moving/renaming a script. Generated source/main.brs and source/engine are outside the project script editor's normal editable source list.

```brightscript
sub RokuScript_components_player_Ready(context as Object)
  context.node.properties.opacity = 1.0
end sub

sub RokuScript_components_player_Update(context as Object)
  context.node.transform.x = context.node.transform.x + 60 * context.dt
end sub
```

Context contains node (owner), component, scene, engine, dt (seconds) and extra (event data). Each attachment has an owner context. Do not attach a central controller repeatedly unless it should run for each owner. Runtime mutations affect the running scene copy, not the saved authored template.

### Source editing controls

The file dropdown switches drafts; Refresh updates the file list; Save writes source; Reload reads from disk and can replace a draft. Insert reference inserts a lookup for the selected element. Connect selected button attaches the script, replaces the button action and creates an Action hook. Owner buttons select owners; connection links open related source/hook positions. Find/Find next search. Compiler diagnostics appear at build time: syntax coloring is not compilation.

External changes block unsafe source overwrites. Copy important unsaved work before Reload. Saving an attachment requires saving scene data; saving a hook requires saving source. Build & Test saves edited scripts through this workflow before compiling.

```brightscript
sub RokuScript_components_player_Ready(context as Object)
  label = context.scene.nodeMap["ScoreLabel"]
  if label <> invalid then label.properties.text = "Score: 0"
end sub
```

Use the stable ID inserted by the reference tool and check for invalid. FindNodeByName is convenient but duplicate names are ambiguous.

| Hook | Purpose and extra data |
| --- | --- |
| Ready / Init | Owner initialization; Init is a legacy alternative. Avoid duplicate initialization. |
| SceneEnter / SceneExit | Scene lifecycle and exit cleanup. |
| PreUpdate / PhysicsUpdate / Update / LateUpdate / PostUpdate | Corresponding variable/fixed-step phases; dt is seconds. |
| Input / Action | Remote events/actions; inspect extra and the intended owner. |
| Collision / CollisionEnter / CollisionStay / CollisionExit | Contacts; extras include otherNodeId/phase where supplied. |
| Timeout | Timer fired; waitTime. |
| PathFinished | Non-looping follower reached an endpoint; progress. |
| ScreenEntered / ScreenExited | Visibility region state, including initial state; targetNodeId. |
| Spawned | Successful spawn/acquisition; spawnedNodeId. |
| MenuSelectionChanged / MenuItemSelected | MenuList selection change/acceptance. |
| AnimationEvent | Graph event; extra.event holds authored event data. |
| AnimationStateChanged | Destination stateId/clipId after a graph transition. |
| CameraZoneChanged | Zone notification when emitted by the camera event path. |

## 17. Build, export, simulator and devices

F5, Export Game and device deployment share native export/validation. Current snapshots overlay unsaved scenes while unopened scenes remain available for transitions. References must exist inside the project and be package-safe; prefer res:// to machine-specific absolute paths.

Packages contain root manifest, source/main.brs, source/engine, scene JSON, resource metadata and assets. Generated builds live under .visual-editor/engine-builds. Edit project/canonical source instead of a generated copy that the next build will replace.

Simulator provides runtime output, remote controls, restart/stop and downloadable ZIP. Compiler failures must be fixed before interpreting missing gameplay as rendering errors. Check visibility, layout, resource paths and native warnings for invisible controls.

### Deploy dock

Open Deploy, Add an IP or Scan, select Target and enter developer username/password. Deploy builds the current native project and uploads it. Debug/Dev emit runtime telemetry; Release disables it without stripping user print statements. Status, warnings, package size and history report the result.

Connect logs opens the native console; Disconnect stops it and automatic reconnection. Screenshot uses the selected device credentials. Restart returns Home and launches the installed developer channel; it does not uninstall it. The separate Sideload dialog uses the same native build/upload service.

The device/network must permit developer services. If scanning finds nothing, add the IP manually and check reachability. Connection, build and upload success are separate outcomes. Local transport tests are not physical-device or network certification.

## 18. Logs, memory, streaming and performance

Output records editing/build activity. Device Logs displays native console lines, filter/level choices, clear-display controls and available telemetry. Clearing a display does not clear device storage. A connected console is not proof of healthy frame rate.

Memory Estimates reads editor asset metadata and may use defaults when dimensions/duration are unavailable. Live telemetry reports cache/allocation estimates and frame timing when enabled. Neither measures total device RAM. Use these views to identify expensive content, then profile hardware.

Streaming processes a lazy queue in PreUpdate. Manifest preloadGroups.boot.textures queues at startup. Other groups can be requested by script. batchSize caps assets processed per frame, but one decode remains synchronous. budgetKb controls LRU bitmap eviction. Active scene textures/libraries/tilesets/styles remain pinned; lastWarning explains why a pinned set can exceed budget. Audio preload resolves metadata rather than inventing allocated memory.

```brightscript
context.engine.assetStream.PreloadGroup("level2", true)
```

Transformed sprite cache limits are 16 MiB total, 4 MiB per sprite and 2048 pixels/axis. UI clipping uses an extra full-screen surface. Repeated parallax, large textures, many animations and script work add cost. Resize artwork appropriately, reuse assets, pool frequent spawns and test the most crowded scenes.

## 19. Settings and appearance

File → Settings provides Project Name, Input, Screen, Physics and Appearance. Project Name is saved to project.settings.json. Input defines action mappings/profile. Screen selects mode, dimensions and fullscreen where supported. Physics chooses the default AABB/circle trigger contact method. Save writes project settings. Close/Cancel without Save does not commit that project-edit operation.

Appearance offers Dark, Light and Mid-tone. Mid-tone is the default when no valid preference exists; existing saved choices remain. Changes apply immediately to open editor windows and save automatically across projects, independently of project Save. They do not recolor artwork, game UI or node guides. A preference-save failure rolls back the change and reports the error.

[[figure:themes]]

## 20. Worked example: title screen to game

1. Create/open a project and a Game scene. Add a player Sprite2D with a small image.
2. Attach an input component for simple movement or a script for continuous action-driven movement.
3. Add Collider2D and only the rigid-body behavior you need. Add static walls/ground.
4. Create Camera2D, enable Current and assign the player as its follow target. Test with F5.
5. Add CanvasLayer for a HUD. Create ScoreLabel and anchor it near the top-left.
6. Build a title screen/layer with Panel, title Label and Start Button. Use FocusGroup and Initial Focus.
7. Assign the matching screen/scene action or connect a controller script. scene:Game requires an actual scene named Game.
8. Add Timer/Spawner if needed; set Max Active and use pools for frequent disposable objects.
9. Configure Audio clips and AudioSource components; reserve the stream for music and one-shots for short effects.
10. Save scenes/source/resources, choose the startup scene, build/test, then verify the game on a real Roku.

Implement and test one system at a time: static visibility, movement, collision, camera, then UI. This separates resource-reference problems from input/physics problems.

## 21. Troubleshooting and recovery

| Symptom | Checks/recovery |
| --- | --- |
| Editor fails to start | Launch with npm.cmd start; verify dependencies and local Konva. |
| Dock disappeared | Use Tabs or Tabs → Default. |
| Cannot select an item | Check editing lock, active workspace/tool and hierarchy; use the tree. |
| Child jumps during layout | Check anchors/margins, parent transforms and container-owned layout. |
| Blank artwork | Check path/file, visibility/opacity, dimensions, camera and build errors. |
| Frozen animation | Check library/clip, playing, speed scale and component/graph configuration. |
| Camera will not follow | Check Current/Enabled, target, bounds and zone/path overrides. |
| Menu cannot activate | Check disabled/focusable, group state, focus and input action map. |
| UI action does nothing | Match target scene/screen/option and script prefix/attachment. |
| Wrong tiles change | Check map, layer, brush, mode and tileset. |
| Script will not save | Check external edits/path; copy drafts before Reload. |
| Audio FX differ | Rebuild baked audio and check stream/one-shot limits on hardware. |
| Deployment fails | Check IP/network, developer credentials/services and compiler/package errors. |
| No live statistics | Use Debug/Dev telemetry and Connect logs; Release omits engine telemetry. |
| Cache budget exceeded | Reduce pinned assets/dimensions; estimates are not total RAM. |
| Runtime edit vanished on reload | Runtime state is temporary; save an authored edit for permanent content changes. |

Recovery/autosave supports the project workflow but does not replace deliberate saves/backups. Preserve source assets, .rkscene files and editor-state sidecars together. Keep source-control history or copies before large inheritance/resource edits.

## 22. Native limits and release checklist

Camera view rotation, rotated UI and affine shear rendering are not implemented. Solid physics uses AABBs; trigger contacts and projectile queries can use boxes or circles. Audio FX are baked; streams/one-shots have device limits. Old WebGPU/ECS scaffolding is not the active editor/runtime. Do not assume an unused source module is an available feature.

Before release, verify startup scene, references, compilation, remote focus, Back/Pause, screen transitions, persistence, sound loops, long sessions, busy scenes and memory on intended hardware. Simulator success does not establish certification or device performance.

The following catalogs cover every creatable node/component and its schema-exposed settings. The control index covers static buttons/selects in the application pages; dynamic controls are covered by workflow chapters and catalogs. The script API chapter documents game-facing operations. Its final signature index is for advanced source navigation; internal method presence does not make it a stable game API.

### Sprite Slicer live frame preview

Import an image or use the selected element image. The whole image is selected initially and the resized preview appears below the source. Use Grid or Draw rectangle to choose an atlas region. Set All slice margins for equal borders, then adjust Left, Top, Right and Bottom individually or drag the pink guides over the source image. Smaller margins produce thinner preserved borders. Output width and height resize the center while keeping the corner dimensions. Save selected regions after changing margins, then Apply or Create; the output dimensions are applied to the element. Use Panel or Button for nine-slice frames; Sprite2D and TextureRect use ordinary image stretching and accept regions without borders. Select a saved region to restore its margins.
