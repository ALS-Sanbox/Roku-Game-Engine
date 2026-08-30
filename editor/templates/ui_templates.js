globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
/**
 * ui_templates.js — RGE Phase 10: UI Template System
 *
 * Defines 8 built-in UI screen templates. Each template describes a
 * complete screen that can be instantiated into the current project with
 * one click. Templates create:
 *   - CanvasLayer node (with uiScreenName set)
 *   - Child UI nodes (Panels, Labels, Buttons, etc.)
 *   - A UIScreen definition (via bridge.addUIScreen)
 *   - Optional UITransitionPreset
 *   - Optional UIOptionDef / UIHighScoreTable entries
 *
 * Template spec format:
 * {
 *   id:           string   — unique template id
 *   name:         string   — display name
 *   screenType:   string   — one of the 8 UIScreen types
 *   icon:         string   — emoji icon for the list
 *   description:  string   — one-sentence description
 *   color:        string   — preview background colour (CSS hex)
 *   nodes:        NodeSpec[] — tree of nodes to create
 *   uiScreen:     object   — UIScreen definition overrides
 *   transition?:  object   — optional UITransitionPreset to create
 *   optionDefs?:  object[] — optional UIOptionDef entries to add
 *   highScoreTable?: object — optional UIHighScoreTable to add
 * }
 *
 * NodeSpec format:
 * {
 *   type:       string     — UI node type
 *   name:       string     — node name
 *   transform:  { x, y }
 *   props:      object     — merged into node.properties
 *   children:   NodeSpec[] — child nodes
 * }
 */

(function () {
  'use strict';

  // ── Template definitions ───────────────────────────────────────────────────

  const SW = 1280;   // logical screen width
  const SH = 720;    // logical screen height

  const TITLE_COLOR    = '#1a1e2c';
  const OVERLAY_COLOR  = 'rgba(0,0,0,0.65)';

  // Shared palette
  const PAL = {
    bgDark:    '#12151d',
    bgPanel:   '#1e2636',
    panelBdr:  '#2e4060',
    btnNormal: '#253550',
    btnFocus:  '#2f5a90',
    btnPress:  '#4a80c4',
    btnDis:    '#2a2e40',
    textLight: '#e8eef8',
    textDim:   '#8899bb',
    accent:    '#4a90d9',
    danger:    '#d94a4a',
    gold:      '#f6d365',
    white:     '#ffffff',
  };

  function btn(name, text, x, y, w, h, action, defaultFocus = false) {
    return {
      type: 'Button', name,
      transform: { x, y },
      props: {
        text, width: w, height: h,
        normalColor: PAL.btnNormal, focusedColor: PAL.btnFocus,
        pressedColor: PAL.btnPress, disabledColor: PAL.btnDis,
        textColor: PAL.textLight, fontSize: 22,
        action, focusable: true, defaultFocus
      }
    };
  }

  function lbl(name, text, x, y, w, h, opts = {}) {
    return {
      type: 'Label', name,
      transform: { x, y },
      props: {
        text, width: w, height: h,
        textColor: opts.color ?? PAL.textLight,
        fontSize: opts.size ?? 22,
        align: opts.align ?? 'center',
        valign: opts.valign ?? 'center',
        ...opts.extra
      }
    };
  }

  function panel(name, x, y, w, h, color = PAL.bgPanel, border = PAL.panelBdr) {
    return {
      type: 'Panel', name,
      transform: { x, y },
      props: { width: w, height: h, color, borderColor: border, borderWidth: 1, opacity: 1 }
    };
  }

  function layer(name, screenName, children) {
    return {
      type: 'CanvasLayer', name,
      transform: { x: 0, y: 0 },
      props: { width: SW, height: SH, layer: 0, opacity: 1, uiScreenName: screenName },
      children
    };
  }

  // ── 1: Title Screen ────────────────────────────────────────────────────────
  const TITLE_SCREEN = {
    id: 'tpl_title',
    name: 'Title Screen',
    screenType: 'TitleScreen',
    icon: '🎮',
    color: '#12151d',
    description: 'A full-screen title with game logo, Play, Options, and Quit buttons.',
    uiScreen: { startupScreen: true },
    transition: {
      name: 'Title Fade In', transType: 'fade', duration: 0.5, easing: 'ease_in_out',
      color: '#000000', blockInput: true
    },
    nodes: layer('TitleScreen_Layer', 'TitleScreen', [
      { ...panel('BG', 0, 0, SW, SH, PAL.bgDark, PAL.bgDark) },
      lbl('GameTitle', 'MY GAME', SW/2 - 300, 160, 600, 80, { size: 52, color: PAL.gold }),
      lbl('Subtitle', 'An Adventure Awaits', SW/2 - 300, 250, 600, 40, { size: 22, color: PAL.textDim }),
      btn('BtnPlay',    'Play',    SW/2 - 130, 340, 260, 54, 'transition_scene:Game', true),
      btn('BtnOptions', 'Options', SW/2 - 130, 410, 260, 54, 'transition_screen:OptionsMenu'),
      btn('BtnQuit',    'Quit',    SW/2 - 130, 480, 260, 54, 'quit_to_title'),
      lbl('Version', 'v1.0.0', SW - 140, SH - 40, 120, 30, { size: 14, color: PAL.textDim, align: 'right' })
    ])
  };

  // ── 2: Options Menu ────────────────────────────────────────────────────────
  const OPTIONS_MENU = {
    id: 'tpl_options',
    name: 'Options Menu',
    screenType: 'OptionsMenu',
    icon: '⚙',
    color: '#1a2030',
    description: 'Volume sliders, difficulty selector, and back button with live label updates.',
    optionDefs: [
      { key: 'music_volume', label: 'Music Volume', optionType: 'float', defaultValue: '1.0', allowedValues: [] },
      { key: 'sound_volume', label: 'Sound Volume', optionType: 'float', defaultValue: '1.0', allowedValues: [] },
      { key: 'difficulty',   label: 'Difficulty',   optionType: 'string', defaultValue: 'medium', allowedValues: ['easy','medium','hard'] },
    ],
    nodes: layer('OptionsMenu_Layer', 'OptionsMenu', [
      panel('OptBG', 0, 0, SW, SH, PAL.bgDark, PAL.bgDark),
      panel('OptPanel', SW/2 - 280, 100, 560, 480, PAL.bgPanel, PAL.panelBdr),
      lbl('OptTitle', 'OPTIONS', SW/2 - 280, 108, 560, 50, { size: 28, color: PAL.accent }),
      // Music volume row
      lbl('MusicLabel', 'Music Volume', SW/2 - 240, 180, 200, 40, { align: 'left' }),
      {
        type: 'Label', name: 'MusicValue',
        transform: { x: SW/2 + 40, y: 180 },
        props: { width: 120, height: 40, textColor: PAL.textLight, fontSize: 20, align: 'center', valign: 'center', boundOptionKey: 'music_volume', boundOptionPrefix: '' }
      },
      btn('BtnMusicDown', '◀', SW/2 + 0, 180, 40, 40, 'option_set:music_volume=0.5'),
      btn('BtnMusicUp',   '▶', SW/2 + 160, 180, 40, 40, 'option_set:music_volume=1.0'),
      // Sound volume row
      lbl('SoundLabel', 'Sound Volume', SW/2 - 240, 240, 200, 40, { align: 'left' }),
      {
        type: 'Label', name: 'SoundValue',
        transform: { x: SW/2 + 40, y: 240 },
        props: { width: 120, height: 40, textColor: PAL.textLight, fontSize: 20, align: 'center', valign: 'center', boundOptionKey: 'sound_volume', boundOptionPrefix: '' }
      },
      btn('BtnSoundDown', '◀', SW/2 + 0, 240, 40, 40, 'option_set:sound_volume=0.5'),
      btn('BtnSoundUp',   '▶', SW/2 + 160, 240, 40, 40, 'option_set:sound_volume=1.0'),
      // Difficulty row
      lbl('DiffLabel', 'Difficulty', SW/2 - 240, 300, 200, 40, { align: 'left' }),
      {
        type: 'Label', name: 'DiffValue',
        transform: { x: SW/2 + 0, y: 300 },
        props: { width: 200, height: 40, textColor: PAL.gold, fontSize: 20, align: 'center', valign: 'center', boundOptionKey: 'difficulty', boundOptionPrefix: '' }
      },
      btn('BtnDiffCycle', 'Change ▶', SW/2 + 160, 300, 100, 40, 'option_cycle:difficulty'),
      // Reset + Back
      btn('BtnReset', 'Reset Defaults', SW/2 - 160, 460, 180, 46, 'options_reset'),
      btn('BtnBack',  '← Back',         SW/2 - 20, 460, 160, 46, 'back', true)
    ])
  };

  // ── 3: Pause Menu ──────────────────────────────────────────────────────────
  const PAUSE_MENU = {
    id: 'tpl_pause',
    name: 'Pause Menu',
    screenType: 'PauseMenu',
    icon: '⏸',
    color: '#1a1e2c',
    description: 'Semi-transparent overlay with Resume, Options, and Quit to Title buttons.',
    nodes: layer('PauseMenu_Layer', 'PauseMenu', [
      // Dark overlay
      { type: 'Panel', name: 'Overlay', transform: { x: 0, y: 0 }, props: { width: SW, height: SH, color: '#00000099', borderColor: '#000000', borderWidth: 0, opacity: 0.75 } },
      panel('PausePanel', SW/2 - 200, SH/2 - 170, 400, 340, PAL.bgPanel, PAL.panelBdr),
      lbl('PauseTitle', 'PAUSED', SW/2 - 200, SH/2 - 150, 400, 50, { size: 30, color: PAL.textLight }),
      btn('BtnResume',  'Resume',         SW/2 - 140, SH/2 - 60,  280, 54, 'resume_game', true),
      btn('BtnOptions', 'Options',         SW/2 - 140, SH/2 + 10,  280, 54, 'pushscreen:OptionsMenu'),
      btn('BtnQuitTitle','Quit to Title',  SW/2 - 140, SH/2 + 80,  280, 54, 'quit_to_title'),
    ])
  };

  // ── 4: Game Over Screen ────────────────────────────────────────────────────
  const GAME_OVER = {
    id: 'tpl_gameover',
    name: 'Game Over Screen',
    screenType: 'GameOverScreen',
    icon: '💀',
    color: '#1a0808',
    description: 'Game over with score display, retry and quit options.',
    nodes: layer('GameOver_Layer', 'GameOverScreen', [
      panel('GOBG', 0, 0, SW, SH, '#120808', '#120808'),
      panel('GOPanel', SW/2 - 280, SH/2 - 220, 560, 440, PAL.bgPanel, PAL.danger),
      lbl('GOTitle', 'GAME OVER', SW/2 - 280, SH/2 - 195, 560, 70, { size: 44, color: PAL.danger }),
      lbl('ScoreLabel', 'YOUR SCORE', SW/2 - 200, SH/2 - 110, 400, 36, { size: 18, color: PAL.textDim }),
      lbl('ScoreValue', '0', SW/2 - 200, SH/2 - 74, 400, 54, { size: 38, color: PAL.gold }),
      lbl('RankLabel', '#1  AAA  00000  --------', SW/2 - 200, SH/2 - 10, 400, 36, { size: 16, color: PAL.textDim, extra: { boundHighScoreTable: 'default', boundHighScoreRank: 1 } }),
      btn('BtnRetry', 'Try Again',    SW/2 - 140, SH/2 + 60, 280, 54, 'transition_scene:Game', true),
      btn('BtnMenu',  'Main Menu',    SW/2 - 140, SH/2 + 130, 280, 54, 'transition_screen:TitleScreen'),
    ]),
    highScoreTable: { tableId: 'default', label: 'High Scores', maxEntries: 10, sortOrder: 'desc' }
  };

  // ── 5: High Scores Screen ──────────────────────────────────────────────────
  const HIGH_SCORES = {
    id: 'tpl_highscores',
    name: 'High Scores Screen',
    screenType: 'HighScoresScreen',
    icon: '🏆',
    color: '#1a1a10',
    description: 'Shows the top 10 scores with initials and date, bound to the default score table.',
    highScoreTable: { tableId: 'default', label: 'High Scores', maxEntries: 10, sortOrder: 'desc' },
    nodes: (() => {
      const rows = [];
      for (let i = 1; i <= 10; i++) {
        rows.push({
          type: 'Label', name: `ScoreRow${i}`,
          transform: { x: SW/2 - 260, y: 150 + (i - 1) * 44 },
          props: {
            width: 520, height: 40,
            textColor: i === 1 ? PAL.gold : PAL.textLight,
            fontSize: i <= 3 ? 20 : 18,
            align: 'left', valign: 'center',
            boundHighScoreTable: 'default', boundHighScoreRank: i
          }
        });
      }
      return layer('HighScores_Layer', 'HighScoresScreen', [
        panel('HSBG', 0, 0, SW, SH, '#0e0e0a', '#0e0e0a'),
        panel('HSPanel', SW/2 - 300, 80, 600, 550, PAL.bgPanel, PAL.gold),
        lbl('HSTitle', '🏆 HIGH SCORES', SW/2 - 300, 88, 600, 50, { size: 26, color: PAL.gold }),
        ...rows,
        btn('HSBack', '← Back', SW/2 - 100, 600, 200, 46, 'back', true)
      ]);
    })()
  };

  // ── 6: Loading Screen ──────────────────────────────────────────────────────
  const LOADING_SCREEN = {
    id: 'tpl_loading',
    name: 'Loading Screen',
    screenType: 'LoadingScreen',
    icon: '⏳',
    color: '#0e1018',
    description: 'Full-screen loading with animated spinner and progress bar driven by the transition manager.',
    transition: {
      name: 'Load Transition', transType: 'fade', duration: 0.4, easing: 'ease_in',
      color: '#000000', blockInput: true, waitForLoad: true, fakeProgress: true,
      fakeProgressRate: 0.4, loadingLabel: 'Loading...', showLoadingProgress: true
    },
    nodes: layer('LoadingScreen_Layer', 'LoadingScreen', [
      panel('LoadBG', 0, 0, SW, SH, '#0a0c12', '#0a0c12'),
      lbl('LoadTitle', 'LOADING', SW/2 - 200, SH/2 - 60, 400, 50, { size: 30, color: PAL.textDim }),
      lbl('LoadHint', 'Please wait…', SW/2 - 160, SH/2 + 30, 320, 36, { size: 18, color: PAL.textDim }),
      {
        type: 'ProgressBar', name: 'LoadBar',
        transform: { x: SW/2 - 200, y: SH/2 + 80 },
        props: { width: 400, height: 14, value: 0, minValue: 0, maxValue: 1, fillColor: PAL.accent, trackColor: '#1a2638', borderColor: '#3a5a80', borderWidth: 1, showLabel: false }
      }
    ])
  };

  // ── 7: Fade Transition ─────────────────────────────────────────────────────
  const FADE_TRANSITION = {
    id: 'tpl_fade',
    name: 'Fade Transition',
    screenType: 'TransitionScreen',
    icon: '↔',
    color: '#000000',
    description: 'Reusable fade-to-black transition preset. No CanvasLayer needed — works via the transition manager.',
    transition: {
      name: 'Fade to Black', transType: 'fade', duration: 0.35, easing: 'ease_in_out',
      color: '#000000', blockInput: true, waitForLoad: false
    },
    nodes: layer('FadeTrans_Layer', 'FadeTransition', [
      lbl('FadeHint', '(Fade Transition — no visual content needed)', SW/2 - 300, SH/2 - 20, 600, 40, { size: 16, color: '#333344' })
    ])
  };

  // ── 8: Confirmation Dialog ─────────────────────────────────────────────────
  const CONFIRM_DIALOG = {
    id: 'tpl_confirm',
    name: 'Confirmation Dialog',
    screenType: 'CustomScreen',
    icon: '❓',
    color: '#12151d',
    description: 'Push-screen dialog with Yes/No buttons. Use pushscreen: action to show it.',
    nodes: layer('ConfirmDialog_Layer', 'ConfirmDialog', [
      { type: 'Panel', name: 'DialogOverlay', transform: { x: 0, y: 0 }, props: { width: SW, height: SH, color: '#000000AA', borderColor: '#000000', borderWidth: 0, opacity: 0.7 } },
      panel('DialogBox', SW/2 - 240, SH/2 - 120, 480, 240, PAL.bgPanel, PAL.panelBdr),
      lbl('DialogTitle', 'Are you sure?', SW/2 - 240, SH/2 - 105, 480, 44, { size: 22, color: PAL.textLight }),
      lbl('DialogBody', 'This action cannot be undone.', SW/2 - 200, SH/2 - 50, 400, 36, { size: 16, color: PAL.textDim }),
      btn('BtnYes', 'Yes', SW/2 - 150, SH/2 + 20, 130, 48, 'custom:DialogConfirm', true),
      btn('BtnNo',  'No',  SW/2 + 20,  SH/2 + 20, 130, 48, 'popscreen'),
    ])
  };

  // ── Template registry ──────────────────────────────────────────────────────

  const TEMPLATES = [
    TITLE_SCREEN, OPTIONS_MENU, PAUSE_MENU, GAME_OVER,
    HIGH_SCORES, LOADING_SCREEN, FADE_TRANSITION, CONFIRM_DIALOG
  ];

  // ── Template Engine ────────────────────────────────────────────────────────

  /**
   * createTemplateInProject
   * Instantiates a template into the current project via RGESceneBridge.
   * Returns { canvasLayerId, uiScreenId } or null on failure.
   */
  function createTemplateInProject(templateId, opts = {}) {
    const b = RGE_ROOT.RGESceneBridge;
    if (!b) return null;
    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return null;

    const resourcesApi = window.RokuSchemaResources;
    const nodesApi     = window.RokuNodes;
    const before       = b.serializeScene();
    b.pushHistory(`Create template: ${tpl.name}`, before);

    // 1. Create all nodes from the tree spec
    const rootSpec   = tpl.nodes;
    const rootNodeId = b.getRootNodeId();

    function buildNode(spec, parentId) {
      const node = nodesApi.createDefaultNode(spec.type);
      node.name = spec.name || spec.type;
      if (spec.transform) {
        Object.assign(node.transform, spec.transform);
      }
      if (spec.props) {
        Object.assign(node.properties, spec.props);
      }
      node.parentId = parentId;
      node.zIndex = b.getChildren(parentId).length;
      b.getNodes().push(node);

      // Recurse children
      if (Array.isArray(spec.children)) {
        for (const child of spec.children) {
          buildNode(child, node.id);
        }
      }
      return node;
    }

    const rootNode = buildNode(rootSpec, rootNodeId);
    const canvasLayerId = rootNode.id;

    // 2. Create the UIScreen definition
    const screenName = tpl.nodes.props?.uiScreenName || tpl.name.replace(/\s+/g, '');
    const screenDef  = resourcesApi?.createDefaultUIScreen
      ? resourcesApi.createDefaultUIScreen(Date.now())
      : { id: `uiscreen_${Date.now()}`, name: screenName, screenType: tpl.screenType, startupScreen: false, rootNodeIds: [], onEnter: '', onExit: '', onPause: '', onResume: '' };

    screenDef.name        = screenName;
    screenDef.screenType  = tpl.screenType || 'CustomScreen';
    screenDef.rootNodeIds = [canvasLayerId];
    if (tpl.uiScreen?.startupScreen && opts.setAsStartup !== false) {
      // Clear existing startup flags
      b.getUIScreens().forEach(s => { if (s.startupScreen) b.updateUIScreen(s.id, { startupScreen: false }); });
      screenDef.startupScreen = true;
    }

    const addedScreen = b.addUIScreen(screenDef);

    // 3. Optional transition preset
    if (tpl.transition) {
      const existingPresets = b.getUITransitionPresets();
      const alreadyExists = existingPresets.some(p => p.name === tpl.transition.name);
      if (!alreadyExists) {
        const preset = resourcesApi?.createDefaultUITransitionPreset
          ? resourcesApi.createDefaultUITransitionPreset(Date.now())
          : { id: `transition_${Date.now()}` };
        Object.assign(preset, tpl.transition);
        b.addUITransitionPreset(preset);
      }
    }

    // 4. Optional option defs
    if (Array.isArray(tpl.optionDefs)) {
      const existingKeys = new Set(b.getUIOptionDefs().map(d => d.key));
      for (const defSpec of tpl.optionDefs) {
        if (existingKeys.has(defSpec.key)) continue;
        const def = resourcesApi?.createDefaultUIOptionDef
          ? resourcesApi.createDefaultUIOptionDef(Date.now())
          : { id: `option_${Date.now()}` };
        Object.assign(def, defSpec);
        b.addUIOptionDef(def);
      }
    }

    // 5. Optional high score table
    if (tpl.highScoreTable) {
      const existingTables = b.getUIHighScoreTables();
      const alreadyExists = existingTables.some(t => t.tableId === tpl.highScoreTable.tableId);
      if (!alreadyExists) {
        const table = resourcesApi?.createDefaultUIHighScoreTable
          ? resourcesApi.createDefaultUIHighScoreTable(Date.now())
          : { id: `scores_${Date.now()}` };
        Object.assign(table, tpl.highScoreTable);
        b.addUIHighScoreTable(table);
      }
    }

    // 6. Refresh scene and select the new layer
    b.refreshAll();
    b.selectNode(canvasLayerId);

    return { canvasLayerId, uiScreenId: addedScreen.id };
  }

  // ── Preview canvas rendering ────────────────────────────────────────────────

  /**
   * drawTemplatePreview
   * Renders a schematic preview of the template onto a canvas 2D context.
   */
  function drawTemplatePreview(ctx, tpl, cw, ch) {
    // Background
    ctx.fillStyle = tpl.color || '#12151d';
    ctx.fillRect(0, 0, cw, ch);

    // Scale: logical 1280x720 → canvas
    const sx = cw / 1280;
    const sy = ch / 720;

    function drawNodeSpec(spec) {
      const x = (spec.transform?.x ?? 0) * sx;
      const y = (spec.transform?.y ?? 0) * sy;
      const w = ((spec.props?.width  ?? 200)) * sx;
      const h = ((spec.props?.height ?? 40))  * sy;

      if (spec.type === 'Panel' || spec.type === 'CanvasLayer') {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = spec.props?.color ?? '#1e2636';
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        if (spec.props?.borderColor && spec.props?.borderWidth > 0) {
          ctx.strokeStyle = spec.props.borderColor;
          ctx.lineWidth   = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      } else if (spec.type === 'Button') {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = spec.props?.normalColor ?? '#253550';
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#4a80c4';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = spec.props?.textColor ?? '#e8eef8';
        ctx.font = `bold ${Math.max(8, Math.round(13 * sx))}px "Noto Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(spec.props?.text ?? ''), x + w/2, y + h/2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (spec.type === 'Label') {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = spec.props?.textColor ?? '#e8eef8';
        const fs = Math.max(7, Math.round(12 * sx));
        ctx.font = `${fs}px "Noto Sans", sans-serif`;
        ctx.textAlign = spec.props?.align === 'center' ? 'center' : 'left';
        const tx = spec.props?.align === 'center' ? x + w/2 : x;
        ctx.fillText(String(spec.props?.text ?? ''), tx, y + h * 0.7);
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      } else if (spec.type === 'ProgressBar') {
        ctx.fillStyle = '#1a2638';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#4a90d9';
        ctx.fillRect(x, y, w * 0.5, h);
        ctx.strokeStyle = '#3a5a80'; ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }

      if (Array.isArray(spec.children)) {
        for (const child of spec.children) drawNodeSpec(child);
      }
    }

    drawNodeSpec(tpl.nodes);

    // Template name overlay
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, ch - 22, cw, 22);
    ctx.fillStyle = 'rgba(200,220,255,0.7)';
    ctx.font = `bold 11px "Noto Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${tpl.icon}  ${tpl.name}`, cw / 2, ch - 6);
    ctx.textAlign = 'left';
  }

  // ── Bottom-panel UI ────────────────────────────────────────────────────────

  let _initialized = false;
  let _selectedTplId = TEMPLATES[0].id;
  let _previewCanvas = null;
  let _previewCtx    = null;
  let _dirty = true;
  let _rafId = null;

  function render() {
    _initOnce();
    _renderList();
    _renderDetail();
    _dirty = true;
  }

  function _initOnce() {
    if (_initialized) return;
    _initialized = true;

    _previewCanvas = document.getElementById('tpl-preview-canvas');
    _previewCtx    = _previewCanvas?.getContext('2d');

    const ro = new ResizeObserver(() => { _dirty = true; });
    const wrap = document.getElementById('tpl-preview-wrap');
    if (wrap && ro) ro.observe(wrap);

    _startLoop();

    document.getElementById('tpl-btn-create')?.addEventListener('click', _onCreateClick);
  }

  function _startLoop() {
    if (_rafId) return;
    function tick() {
      if (_dirty) { _drawPreview(); _dirty = false; }
      _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);
  }

  function _drawPreview() {
    const canvas = _previewCanvas;
    if (!canvas || !_previewCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(rect.width || canvas.offsetWidth || canvas.parentElement?.clientWidth || 1));
    const ch = Math.max(1, Math.floor(rect.height || canvas.offsetHeight || canvas.parentElement?.clientHeight || 1));
    if (!cw || !ch) return;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    }
    const ctx = _previewCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const tpl = TEMPLATES.find(t => t.id === _selectedTplId);
    if (tpl) drawTemplatePreview(ctx, tpl, cw, ch);
  }

  function _renderList() {
    const listEl = document.getElementById('tpl-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    for (const tpl of TEMPLATES) {
      const row = document.createElement('div');
      row.className = 'tpl-list-row' + (tpl.id === _selectedTplId ? ' active' : '');
      const icon = document.createElement('span'); icon.style.cssText = 'font-size:16px;flex-shrink:0;'; icon.textContent = tpl.icon;
      const name = document.createElement('span'); name.style.cssText = 'font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; name.textContent = tpl.name;
      row.appendChild(icon); row.appendChild(name);
      row.addEventListener('click', () => { _selectedTplId = tpl.id; _renderList(); _renderDetail(); _dirty = true; });
      listEl.appendChild(row);
    }
  }

  function _renderDetail() {
    const tpl = TEMPLATES.find(t => t.id === _selectedTplId);
    const nameEl = document.getElementById('tpl-detail-name');
    const descEl = document.getElementById('tpl-detail-desc');
    const typeEl = document.getElementById('tpl-detail-type');
    const extrasEl = document.getElementById('tpl-detail-extras');
    if (nameEl) nameEl.textContent = tpl ? `${tpl.icon} ${tpl.name}` : '';
    if (descEl) descEl.textContent = tpl?.description ?? '';
    if (typeEl) typeEl.textContent = tpl ? `Type: ${tpl.screenType}` : '';
    if (extrasEl) {
      const extras = [];
      if (tpl?.transition) extras.push(`+ Transition: "${tpl.transition.name}"`);
      if (tpl?.optionDefs?.length) extras.push(`+ ${tpl.optionDefs.length} option def(s)`);
      if (tpl?.highScoreTable) extras.push(`+ High score table: "${tpl.highScoreTable.tableId}"`);
      extrasEl.textContent = extras.join('   ');
    }
    const startupCb = document.getElementById('tpl-set-startup');
    if (startupCb) {
      startupCb.style.display = (tpl?.uiScreen?.startupScreen) ? '' : 'none';
      const startupRow = document.getElementById('tpl-startup-row');
      if (startupRow) startupRow.style.display = (tpl?.screenType === 'TitleScreen') ? '' : 'none';
    }
  }

  function _onCreateClick() {
    const tpl = TEMPLATES.find(t => t.id === _selectedTplId);
    if (!tpl) return;
    const setAsStartup = document.getElementById('tpl-startup-cb')?.checked ?? false;
    const result = createTemplateInProject(tpl.id, { setAsStartup });
    if (result) {
      RGE_ROOT.RGESceneBridge?.setStatus?.(`Template "${tpl.name}" created.`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  RGE_ROOT.RGEUITemplates = {
    render,
    refresh: render,
    requestPreviewRedraw: () => { _dirty = true; },
    getTemplates: () => TEMPLATES,
    createTemplateInProject,
    drawTemplatePreview,
  };

})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
