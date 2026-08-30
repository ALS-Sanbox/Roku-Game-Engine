globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  /**
   * inspector.js — RGE Editor Inspector Module
   *
   * Phase 10: Screen Templates and Polish
   * ─────────────────────────────────────────────────────────────────────────
   * The active inspector implementation lives in editor/scene_editor.js.
   *
   * Phase 10 additions:
   *
   * Screen Templates panel (editor/templates/ui_templates.js)
   *   8 built-in templates: TitleScreen, OptionsMenu, PauseMenu, GameOver,
   *   HighScores, LoadingScreen, FadeTransition, ConfirmDialog.
   *   Each template creates: CanvasLayer node tree + UIScreen def +
   *   optional TransitionPreset, OptionDefs, HighScoreTable.
   *
   * ✦ Inspector sections (all collapsible, persistent collapse state)
   *   CanvasLayer  → Node | Transform | UI Layout | Screen
   *   Control      → Node | Transform | UI Layout | Focus & Navigation
   *   Panel        → Node | Transform | Appearance
   *   Label        → Node | Transform | Text | Data Binding
   *   TextureRect  → Node | Transform | Sprite
   *   Button       → Node | Transform | Text | Button | Focus & Navigation
   *   NineSlicePanel → Node | Transform | NineSlice
   *   MenuList     → Node | Transform | MenuList | Appearance | Focus & Navigation
   *   ProgressBar  → Node | Transform | Appearance
   *
   * ✦ Data Binding fields on Label:
   *   boundOptionKey      → auto-update text from option value each frame
   *   boundOptionPrefix   → prefix prepended to option display text
   *   boundHighScoreTable → show formatted score row text
   *   boundHighScoreRank  → which rank to display (1 = top)
   *
   * ✦ Action picker supports (all accessible via "custom…" in dropdown):
   *   back | quit_to_title | start_game | resume_game | open_options |
   *   close | popscreen | options_reset | screen:… | pushscreen:… |
   *   scene:… | push:… | custom:… | transition_screen:… |
   *   transition_scene:… | option_cycle:key | option_set:key=value
   *
   * ✦ Starter assets in assets/ui/:
   *   default_panel.svg    (256×128, nine-slice 16px)
   *   default_button.svg   (256×64,  nine-slice 12px)
   *   focused_button.svg   (256×64,  nine-slice 12px)
   *   dialog_box.svg       (480×256, nine-slice 20px)
   *   progress_bar_track.svg / progress_bar_fill.svg
   *   selector_cursor.svg | loading_spinner.svg
   *
   * ✦ Documentation: docs/ui_system.md
   *   Full reference covering all Phase 1–10 APIs, node setup,
   *   template guide, export/runtime behaviour.
   * ─────────────────────────────────────────────────────────────────────────
   */
  window.RokuEditorModules = window.RokuEditorModules || {};
  window.RokuEditorModules.inspector = {
    name: 'inspector',
    description: 'Inspector module boundary. Phase 10 Screen Templates & Polish complete.',
    version: '44.10',
    uiNodeTypes: [
      'CanvasLayer', 'Control', 'Panel', 'Label', 'TextureRect',
      'Button', 'NineSlicePanel', 'MenuList', 'ProgressBar'
    ],
    focusableTypes: ['Button', 'MenuList', 'Control', 'CheckBox', 'Slider'],
    transitionTypes: ['instant','fade','slide_left','slide_right','slide_up','slide_down','wipe'],
    easings: ['linear','ease_in','ease_out','ease_in_out','elastic_out'],
    builtinOptionKeys: ['music_volume','sound_volume','difficulty','display_mode'],
    builtinActions: [
      'back', 'quit_to_title', 'start_game', 'resume_game',
      'open_options', 'close', 'popscreen', 'options_reset',
      'screen:…', 'pushscreen:…',
      'scene:…', 'push:…', 'custom:…',
      'transition_screen:…', 'transition_scene:…',
      'option_cycle:key', 'option_set:key=value'
    ],
    screenTypes: [
      'TitleScreen', 'LoadingScreen', 'PauseMenu', 'OptionsMenu',
      'HighScoresScreen', 'GameOverScreen', 'TransitionScreen', 'CustomScreen'
    ],
    exportWarningCodes: [
      'WARN_MISSING_TEXTURE', 'WARN_INVALID_NINESLICE',
      'WARN_UNKNOWN_ACTION', 'WARN_MISSING_SCREEN',
      'WARN_INVALID_FOCUS_LINK', 'WARN_INVALID_OPTION_BINDING',
      'WARN_INVALID_HIGHSCORE_RANK', 'WARN_INVALID_HIGHSCORE_BINDING',
      'WARN_MISSING_SCREEN_NODE', 'WARN_EMPTY_SCREEN'
    ],
    templates: [
      'tpl_title', 'tpl_options', 'tpl_pause', 'tpl_gameover',
      'tpl_highscores', 'tpl_loading', 'tpl_fade', 'tpl_confirm'
    ],
    starterAssets: [
      'assets/ui/default_panel.svg',
      'assets/ui/default_button.svg',
      'assets/ui/focused_button.svg',
      'assets/ui/dialog_box.svg',
      'assets/ui/progress_bar_track.svg',
      'assets/ui/progress_bar_fill.svg',
      'assets/ui/selector_cursor.svg',
      'assets/ui/loading_spinner.svg'
    ],
    documentation: 'docs/ui_system.md'
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
