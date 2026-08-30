# RGE UI System — Complete Reference

> Phase 1–10 UI System for Roku Game Engine (RGE)
> Written for RGE v44 · BrightScript + Electron editor

---

## Table of Contents

1. [Overview](#overview)
2. [Engine Loop Order](#engine-loop-order)
3. [UI Node Types](#ui-node-types)
4. [How to Create a Title Screen](#how-to-create-a-title-screen)
5. [How to Create an Options Menu](#how-to-create-an-options-menu)
6. [How to Create a Game Over Screen](#how-to-create-a-game-over-screen)
7. [How to Use Nine-Slice Panels](#how-to-use-nine-slice-panels)
8. [How to Bind Button Actions](#how-to-bind-button-actions)
9. [Screen Manager API](#screen-manager-api)
10. [Transition Manager API](#transition-manager-api)
11. [Storage, Options, and High Scores API](#storage-options-and-high-scores-api)
12. [Focus Navigation System](#focus-navigation-system)
13. [UI Data Bindings](#ui-data-bindings)
14. [Export and Roku Package](#export-and-roku-package)
15. [Starter Assets](#starter-assets)
16. [Template Reference](#template-reference)

---

## Overview

The RGE UI System is a screen-space, resolution-independent UI layer that renders on top of the game world. It handles:

- **Screens** — named groups of CanvasLayers (TitleScreen, PauseMenu, etc.)
- **Focus navigation** — D-pad and remote navigation with spatial nearest-neighbour
- **Transitions** — fade, slide, wipe with configurable easing
- **Options storage** — persistent game settings via Roku registry
- **High scores** — sorted score tables with initials and date, persisted to registry
- **Nine-slice panels** — scalable UI textures that preserve corners

All UI renders **after** the game world in the same frame, using `roScreen.DrawRect`, `DrawText`, `DrawObject`, and `DrawScaledObject` — no SceneGraph required.

---

## Engine Loop Order

Every frame executes in this exact order:

```
PumpPlatformMessages         ← roMessagePort events (input, audio)
StageInputEvents             ← raw → frameEvents
ApplyPendingSceneChange      ← safe to swap scenes here
RunPreUpdatePhase:
  UpdateTransition(rawDt)    ← advance fade/slide/wipe state machine
  UpdateFocusState()         ← sets uiFocused per node
    UpdateUiBindings()       ← syncs boundOptionKey, boundHighScoreTable labels
  ProcessInputPhase()        ← BLOCKED if transition.blockInput = true
  RunComponentPhase(pre_update)
RunFixedStepLoop             ← physics (paused when UI only)
RunVariableUpdatePhase       ← game scripts (update phase)
RunLateUpdatePhase
SyncRenderState
Render:
  RenderPassWorldSprites     ← Sprite2D, AnimatedSprite2D
  RenderPassTileMaps         ← TileMap nodes
  RenderPassWorldDebug
  RenderPassUI:
    RenderUiPass()           ← all UI nodes (layer+zIndex sorted)
    RenderTransitionOverlay()← fade/slide/wipe + loading screen ON TOP
  RenderPassOverlay          ← debug text
```

---

## UI Node Types

| Type | Description | Focusable by default |
|---|---|---|
| `CanvasLayer` | Root container for a screen. Set `uiScreenName` to link to a UIScreen. | No |
| `Control` | Transparent container with optional focus. | `focusMode: "all"` |
| `Panel` | Colored rect with optional border and NineSlice style. | No |
| `Label` | Text node. Supports data binding. | No |
| `TextureRect` | Image node. Missing textures → magenta placeholder. | No |
| `Button` | Focusable with normal/focused/pressed/disabled states + action. | Yes |
| `NineSlicePanel` | Scalable image using 9-region draw. | No |
| `MenuList` | Scrollable list of items. | Yes |
| `ProgressBar` | Value-driven fill bar. | No |

---

## How to Create a Title Screen

### Using the Template (recommended)

1. Open the **Screen Templates** bottom tab
2. Select **Title Screen**
3. Check "Set as startup screen" if this is your first screen
4. Click **✦ Create in Project**

This creates:
- A `TitleScreen_Layer` CanvasLayer with uiScreenName = `TitleScreen`
- Child Labels and Buttons already wired with actions
- A `UIScreen` definition with `startupScreen: true`
- A fade-in transition preset

### Manual Setup

```
CanvasLayer "TitleScreen_Layer"
  properties.uiScreenName = "TitleScreen"
  
  Panel "Background"
    width=1280, height=720, color=#12151d
    
  Label "GameTitle"
    text="MY GAME", fontSize=52, textColor=#f6d365
    align=center
    
  Button "BtnPlay"
    text="Play", action="transition_scene:Game"
    focusable=true, defaultFocus=true
    
  Button "BtnOptions"
    text="Options", action="transition_screen:OptionsMenu"
    
  Button "BtnQuit"
    text="Quit", action="quit_to_title"
```

Then in the **UI Screens** tab:
- Create a screen named `TitleScreen` of type `TitleScreen`
- Assign `TitleScreen_Layer` as the root layer
- Enable "Startup Screen"

---

## How to Create an Options Menu

### Using the Template

1. Open **Screen Templates** → select **Options Menu**
2. Click **✦ Create in Project**

Creates: option defs for music_volume, sound_volume, difficulty + a full options panel.

### Manual Setup

**Option Defs** (Options & Scores tab → Options → ★ Add built-ins):
- `music_volume` · float · default `1.0`
- `sound_volume` · float · default `1.0`  
- `difficulty` · string · default `medium` · allowed: `easy,medium,hard`

**Node tree:**
```
CanvasLayer "OptionsMenu_Layer"
  properties.uiScreenName = "OptionsMenu"
  
  Label "MusicValueLabel"
    boundOptionKey = "music_volume"
    boundOptionPrefix = "Music: "
    ← updates automatically every frame to show "Music: 80%"
    
  Button "BtnMusicDown"
    action = "option_set:music_volume=0.5"
    
  Button "BtnDiffCycle"
    action = "option_cycle:difficulty"
    ← cycles easy → medium → hard → easy
    
  Button "BtnBack"
    action = "back"
    defaultFocus = true
```

**Button action to navigate here:**
```
action = "transition_screen:OptionsMenu"
```

---

## How to Create a Game Over Screen

### Using the Template

1. Open **Screen Templates** → select **Game Over Screen** → **✦ Create in Project**

Creates: panel, score Label, high score rank Label (auto-updates), Retry and Main Menu buttons, and a `default` high score table.

### Displaying the Current Score (from script)

```brightscript
' In your game-over script component:
sub OnGameOver(score as Integer)
  ' Show the screen
  engine.TransitionToScreen("GameOverScreen", { transType: "fade" })
  
  ' Add score to table
  engine.HighScores_Add("default", score, "AAA")
end sub
```

### Showing High Score Rows

Bind a Label to show rank 1:
```
Label.properties.boundHighScoreTable = "default"
Label.properties.boundHighScoreRank  = 1
```

The label text auto-updates to: `1. AAA  98765  20250101`

---

## How to Use Nine-Slice Panels

Nine-slice (9-patch) lets a UI texture scale without stretching its corners.

### Setup

1. Open the **Nine-Slice** bottom tab
2. Click **+** to create a new style, then **Pick Image** to load your panel texture
3. Drag the 4 guide handles to define slice margins (or type pixel values)
4. Choose **Center Mode** (stretch/tile) and **Edge Mode** (stretch/tile)
5. Click **Save Style**

### Assign to a node

In the node inspector, set **Nine-Slice Style** to your saved style name. Works on:
- `Panel`
- `Button`
- `NineSlicePanel`

### Starter assets

`assets/ui/default_panel.svg` — 256×128 panel with 16px slice margins  
`assets/ui/default_button.svg` — 256×64 button with 12px slice margins  
`assets/ui/focused_button.svg` — 256×64 focused state button  
`assets/ui/dialog_box.svg` — 480×256 dialog with 20px slice margins

Slice margins are marked with dashed guides in the SVGs.

---

## How to Bind Button Actions

Buttons fire an action when the OK/Accept key is pressed while focused.

### Built-in actions

| Action string | Effect |
|---|---|
| `back` | Pop scene or pop screen |
| `quit_to_title` | Load the initial scene |
| `start_game` | Load the `Game` scene |
| `resume_game` | Call `SetPaused(false)` |
| `open_options` | Push `Options` scene |
| `close` | Pop scene |
| `popscreen` | Pop the top UI screen from the stack |
| `options_reset` | Reset all options to defaults |

### Screen navigation (Phase 6)

| Action string | Effect |
|---|---|
| `screen:ScreenName` | `RGE_UI_ChangeScreen("ScreenName")` |
| `pushscreen:ScreenName` | `RGE_UI_PushScreen("ScreenName")` |

### Scene navigation

| Action string | Effect |
|---|---|
| `scene:SceneName` | `QueueSceneChange("SceneName")` |
| `push:SceneName` | `PushScene("SceneName")` |

### With transitions (Phase 7)

| Action string | Effect |
|---|---|
| `transition_screen:ScreenName` | Fade → change screen |
| `transition_scene:SceneName` | Fade → change scene |

### Options (Phase 8)

| Action string | Effect |
|---|---|
| `option_cycle:key` | Cycle to next allowed value |
| `option_set:key=value` | Set option to a fixed value |

### Custom events

```
action = "custom:MyEvent"
```

Fires `RunScriptHooks` with `{ name: "UIAction", action: "custom:MyEvent" }`.
Your ScriptComponent can intercept it:

```brightscript
sub UIAction(event as Object)
  if event.action = "custom:MyEvent" then
    ' handle it
  end if
end sub
```

---

## Screen Manager API

```brightscript
' Change screen (replace stack)
engine.ChangeScreen("PauseMenu")

' Push screen (overlay, current screen pauses)
engine.PushScreen("ConfirmDialog")

' Pop screen (current hides, previous resumes)
engine.PopScreen()

' Show/hide without stack change
engine.ShowScreen("HUDOverlay")
engine.HideScreen("HUDOverlay")

' Query
engine.GetCurrentScreen()     ' → "PauseMenu"
engine.IsScreenVisible("HUD") ' → true/false
```

Lifecycle hooks fire automatically:
- `UIScreen_Enter` — screen becomes active
- `UIScreen_Exit`  — screen is removed
- `UIScreen_Pause` — screen goes behind a push
- `UIScreen_Resume`— screen comes back after pop

---

## Transition Manager API

```brightscript
' Start a raw transition (no action)
engine.StartTransition("fade")

' With options
engine.StartTransition("slide_left", {
  duration:    0.35
  easing:      "ease_in_out"  ' linear | ease_in | ease_out | ease_in_out | elastic_out
  color:       &h000000FF
  blockInput:  true
})

' Transition then change screen
engine.TransitionToScreen("TitleScreen")
engine.TransitionToScreen("PauseMenu", { transType: "slide_up", duration: 0.25 })

' Transition then change scene
engine.TransitionToScene("GameScene", { transType: "fade" })

' With loading screen
engine.TransitionToScene("GameScene", {
  transType:           "fade"
  waitForLoad:         true
  loadingLabel:        "Loading level..."
  showLoadingProgress: true
  fakeProgress:        true
  fakeProgressRate:    0.5  ' auto-advance bar at 50%/sec
})

' Drive real load progress from a script
engine.SetLoadProgress(0.75) ' 0.0–1.0
engine.MarkLoadComplete()    ' releases the hold phase

' Query
engine.IsTransitionActive()  ' → true/false
engine.IsInputBlocked()      ' → true while blockInput transition runs
```

**Transition types:** `instant` · `fade` · `slide_left` · `slide_right` · `slide_up` · `slide_down` · `wipe`

---

## Storage, Options, and High Scores API

### Storage (low-level)

```brightscript
engine.Storage_Save("my.namespace", "key", "value")
engine.Storage_Load("my.namespace", "key", "default")
engine.Storage_LoadFloat("my.namespace", "vol", 1.0)
engine.Storage_LoadBool("my.namespace", "sfx_on", true)
engine.Storage_Delete("my.namespace", "key")
engine.Storage_ClearNamespace("my.namespace")
engine.Storage_Exists("my.namespace", "key") ' → bool
```

Namespace: `rge.options` for options, `rge.scores.<tableId>` for high scores.

### Options

```brightscript
' Read
engine.Options_Get("music_volume")         ' → "0.8"
engine.Options_GetFloat("music_volume")    ' → 0.8
engine.Options_GetBool("sfx_enabled")      ' → true
engine.Options_GetDisplayText("music_volume") ' → "80%"

' Write
engine.Options_Set("difficulty", "hard")   ' validates against allowedValues
engine.Options_Cycle("difficulty")         ' easy → medium → hard → easy
engine.Options_Reset("music_volume")       ' restore defaultValue
engine.Options_ResetAll()
```

Built-in keys: `music_volume` · `sound_volume` · `difficulty` · `display_mode`

### High Scores

```brightscript
' Add a score
survived = engine.HighScores_Add("default", 98765, "RGE")  ' → true if made table

' Check if qualifies
if engine.HighScores_IsHighScore("default", playerScore) then
  ' prompt for initials
end if

' Get entries
entries = engine.HighScores_GetEntries("default")
' each entry: { initials, score, date, extra }

' Get formatted row text
rowText = engine.HighScores_GetRowText("default", 1)
' → "1. RGE  98765  20250101"

' Clear table
engine.HighScores_Clear("default")
```

---

## Focus Navigation System

### Automatic (spatial)

By default, D-pad navigation finds the nearest focusable node in the pressed direction using centre-point distance scoring. No configuration needed.

### Manual links

Set on any focusable node:
```
properties.focusUp    = "BtnPlay"     ← node name or id
properties.focusDown  = "BtnOptions"
properties.focusLeft  = ""
properties.focusRight = ""
```

Manual links take priority over spatial navigation. Invalid links fall back to spatial silently.

### Default focus

Set `properties.defaultFocus = true` on one node per screen. That node receives focus when the screen becomes active.

### Focusable types

- `Button` — always focusable
- `MenuList` — always focusable
- `Control` — focusable when `focusMode = "all"`
- Any node — focusable when `properties.focusable = true`

---

## UI Data Bindings

Labels update automatically every frame when bound to an option or high score.

### Option binding

```
Label.properties.boundOptionKey    = "music_volume"
Label.properties.boundOptionPrefix = "Music: "
→ "Music: 80%"

Label.properties.boundOptionKey    = "difficulty"
→ "Medium"
```

### High score binding

```
Label.properties.boundHighScoreTable = "default"
Label.properties.boundHighScoreRank  = 1
→ "1. AAA  98765  20250101"
```

Set rank 1–10 to show different rows. Empty string when no entry at that rank.

---

## Export and Roku Package

When you export your project, the following UI files are written into the Roku package:

```
source/engine/ui/
  ui_focus_manager.brs      ← spatial nav, action dispatch
  ui_screen_manager.brs     ← show/hide/push/pop/change
  ui_transition_manager.brs ← fade/slide/wipe + loading screen
  ui_nineslice.brs          ← 9-region draw (4 stretch modes)
  ui_storage.brs            ← roRegistry wrapper
  ui_options.brs            ← options system
  ui_high_scores.brs        ← score tables

assets/resources.json       ← includes uiScreens, uiOptionDefs,
                               uiHighScoreTable, uiTransitionPresets,
                               nineSliceStyles
```

### Export validation warnings

| Code | Meaning | Runtime fallback |
|---|---|---|
| `WARN_MISSING_TEXTURE` | TextureRect image not found | Magenta placeholder |
| `WARN_INVALID_NINESLICE` | Negative slice margins | Clamped to 0 |
| `WARN_UNKNOWN_ACTION` | Unrecognised action string | Forwarded as UIAction event |
| `WARN_MISSING_SCREEN` | `screen:X` target not defined | No-op |
| `WARN_INVALID_FOCUS_LINK` | Nav link target missing | Spatial nav used |
| `WARN_INVALID_OPTION_BINDING` | boundOptionKey not defined | Empty text |
| `WARN_INVALID_HIGHSCORE_RANK` | boundHighScoreRank < 1 | Empty text |
| `WARN_INVALID_HIGHSCORE_BINDING` | High score table not defined | Empty text |
| `WARN_MISSING_SCREEN_NODE` | UIScreen rootNodeId missing | Screen invisible |
| `WARN_EMPTY_SCREEN` | UIScreen has no layers | Screen invisible |

---

## Starter Assets

All assets are in `assets/ui/`. Import them into your project's `assets/` folder before referencing in TextureRect or NineSlicePanel nodes.

| File | Size | Nine-slice margins | Use |
|---|---|---|---|
| `default_panel.svg` | 256×128 | 16px all sides | Background panels |
| `default_button.svg` | 256×64 | 12px all sides | Normal button state |
| `focused_button.svg` | 256×64 | 12px all sides | Focused button state |
| `dialog_box.svg` | 480×256 | 20px all sides | Modal dialogs |
| `progress_bar_track.svg` | 400×20 | 8px left/right | ProgressBar track |
| `progress_bar_fill.svg` | 400×20 | 8px left/right | ProgressBar fill |
| `selector_cursor.svg` | 32×32 | n/a | D-pad cursor sprite |
| `loading_spinner.svg` | 64×64 | n/a | Animated loading icon |

---

## Template Reference

All templates are available in the **Screen Templates** bottom panel.

| Template | Type | Creates |
|---|---|---|
| **Title Screen** | `TitleScreen` | Full title with Play/Options/Quit, set as startup, fade-in transition |
| **Options Menu** | `OptionsMenu` | Volume/difficulty controls with live labels, Reset + Back |
| **Pause Menu** | `PauseMenu` | Semi-transparent overlay with Resume/Options/Quit |
| **Game Over Screen** | `GameOverScreen` | Score display, top score row binding, Retry/Menu buttons |
| **High Scores Screen** | `HighScoresScreen` | Top 10 rows all bound to `default` table |
| **Loading Screen** | `LoadingScreen` | Label + ProgressBar + fake-progress transition preset |
| **Fade Transition** | `TransitionScreen` | Reusable fade-to-black preset (no visual content) |
| **Confirmation Dialog** | `CustomScreen` | Yes/No push-screen dialog |

Each template also creates:
- The UIScreen definition with correct `screenType` and `rootNodeIds`
- Optional UITransitionPreset (Title, Loading, Fade templates)
- Optional UIOptionDef entries (Options template)
- Optional UIHighScoreTable (Game Over, High Scores templates)
