globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
(function () {
  const BaseNodeDefaults = {
    id: null,
    type: 'Node2D',
    name: 'Node',
    parentId: null,
    children: [],
    visible: true,
    locked: false,
    zIndex: 0,
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      pivotX: 0,
      pivotY: 0
    },
    properties: {},
    metadata: {},
    components: []
  };

  const NodeDefaultProperties = {
    SceneRoot: {},
    Node2D: {
      width: 160,
      height: 120,
      opacity: 1,
      tint: '#5e7594'
    },
    Sprite2D: {
      width: 96,
      height: 96,
      opacity: 1,
      imagePath: '',
      imageDataUrl: '',
      fitMode: 'contain'
    },
    AnimatedSprite2D: {
      width: 96,
      height: 96,
      opacity: 1,
      spriteFramesId: '',
      animation: '',
      frame: 0,
      playing: true,
      autoplay: false,
      speedScale: 1
    },
    TileMap: {
      width: 320,
      height: 256,
      opacity: 1,
      tilesetId: '',
      mapWidth: 10,
      mapHeight: 8,
      tileWidth: 32,
      tileHeight: 32,
      showGrid: true,
      showTerrainOverlay: true,
      showCollisionOverlay: true,
      activeLayerId: '',
      layers: []
    },
    Camera2D: {
      width: 96,
      height: 72,
      opacity: 0.35,
      tint: '#8f7cf6',
      current: false,
      enabled: true,
      followTargetName: '',
      followLerp: 1,
      offsetX: 0,
      offsetY: 0,
      deadzoneWidth: 0,
      deadzoneHeight: 0,
      deadzoneOffsetX: 0,
      deadzoneOffsetY: 0,
      zoom: 1,
      cameraPreset: 'Side Scroller',
      lookAheadX: 64,
      lookAheadY: 0,
      smoothFollow: true,
      cameraBounds: true,
      dynamicZoom: false,
      screenShake: true,
      zoomMin: 0.5,
      zoomMax: 2,
      roomLock: false,
      combatZoom: 1.2
    },
    CameraZone2D: {
      width: 512, height: 288, opacity: 0.15, tint: '#4caf50',
      mode: 'Normal',
      enabled: true,
      priority: 0,
      blendTime: 0.5,
      showDebug: true,
      showGizmo: true,
      eventsEnabled: true,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      followLerp: null,
      boundsOverride: null,
      targetGroupOverride: null,
      pathOverride: null,
      // Legacy alias kept for old saves
      transitionSpeed: 0.5,
    },
    CameraBounds2D: {
      width: 1024, height: 768, opacity: 0.1, tint: '#2196f3',
      clampPosition: true, clampZoom: true, showBounds: true
    },
    CameraPath2D: {
      closedPath: false, loop: false, duration: 2, autoPlay: false,
      speed: 200, interpolation: 'Linear',
      points: [{x:0,y:0}]
    },
    CameraTargetGroup: {
      targets: [],
      autoTrack: true,
      minZoom: 0.5,
      maxZoom: 3.0,
      paddingLeft: 64,
      paddingRight: 64,
      paddingTop: 64,
      paddingBottom: 64,
      smoothing: 0.15,
      enableAutoZoom: true,
      showDebug: true,
    },
    SceneInstance: {
      width: 160,
      height: 120,
      opacity: 1,
      sourceScenePath: '',
      sourceSceneName: '',
      missingSource: false,
      sourceOverrides: {},
      selectedOverrideNodeId: '',
      editableChildren: true
    },
    CanvasLayer: {
      width: 1280,
      height: 720,
      opacity: 1,
      layer: 0,
      followViewport: true,
      uiScreenName: '',
    },
    Control: {
      width: 240,
      height: 64,
      opacity: 1,
      anchorLeft: 0,
      anchorTop: 0,
      anchorRight: 0,
      anchorBottom: 0,
      marginLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      clipContent: false,
      focusMode: 'none',
      focusable: false,
      defaultFocus: false,
      focusUp: '',
      focusDown: '',
      focusLeft: '',
      focusRight: '',
    },
    HBoxContainer: {
      width: 320,
      height: 64,
      opacity: 1,
      anchorLeft: 0,
      anchorTop: 0,
      anchorRight: 0,
      anchorBottom: 0,
      marginLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      separation: 4,
      alignment: 'begin',
    },
    VBoxContainer: {
      width: 120,
      height: 320,
      opacity: 1,
      anchorLeft: 0,
      anchorTop: 0,
      anchorRight: 0,
      anchorBottom: 0,
      marginLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      separation: 4,
      alignment: 'begin',
    },
    MarginContainer: {
      width: 280,
      height: 180,
      opacity: 1,
      anchorLeft: 0,
      anchorTop: 0,
      anchorRight: 0,
      anchorBottom: 0,
      marginLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      paddingLeft: 8,
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
    },
    ScrollContainer: {
      width: 320,
      height: 240,
      opacity: 1,
      anchorLeft: 0,
      anchorTop: 0,
      anchorRight: 0,
      anchorBottom: 0,
      marginLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      scrollHorizontal: 'auto',
      scrollVertical: 'auto',
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    },
    Label: {
      width: 240, height: 36, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: 'Label', fontSize: 24, textColor: '#e7eef7', align: 'left', valign: 'center'
    },
    Panel: {
      width: 280, height: 120, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      color: '#263247', borderColor: '#5e7594', borderWidth: 2
    },
    TextureRect: {
      width: 160, height: 90, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      imagePath: '', imageDataUrl: '', fitMode: 'contain'
    },
    Button: {
      width: 220, height: 56, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: 'Button', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', focusable: true, defaultFocus: false,
      action: '', actionBack: '', focusUp: '', focusDown: '', focusLeft: '', focusRight: '',
    },
    CircleButton: {
      width: 80, height: 80, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: '', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', focusable: true, defaultFocus: false,
      action: '', actionBack: '', focusUp: '', focusDown: '', focusLeft: '', focusRight: '',
    },
    TriangleButton: {
      width: 80, height: 80, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: '', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', focusable: true, defaultFocus: false,
      action: '', actionBack: '', focusUp: '', focusDown: '', focusLeft: '', focusRight: '',
    },
    OvalButton: {
      width: 160, height: 56, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: 'Button', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', focusable: true, defaultFocus: false,
      action: '', actionBack: '', focusUp: '', focusDown: '', focusLeft: '', focusRight: '',
    },
    NineSlicePanel: {
      width: 320, height: 200, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      imagePath: '', imageDataUrl: '', sliceLeft: 16, sliceTop: 16, sliceRight: 16, sliceBottom: 16, color: '#ffffff'
    },
    MenuList: {
      width: 280, height: 240, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      items: [], selectedIndex: 0, itemHeight: 48,
      normalColor: '#263247', selectedColor: '#375a7f',
      textColor: '#e7eef7', selectedTextColor: '#ffffff',
      fontSize: 22, focusMode: 'all', focusable: true, defaultFocus: false,
      action: '', focusUp: '', focusDown: '', focusLeft: '', focusRight: '',
    },
    ProgressBar: {
      width: 300, height: 28, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      value: 0.5, minValue: 0, maxValue: 1,
      fillColor: '#4a90d9', trackColor: '#1a2638', borderColor: '#5e7594',
      borderWidth: 1, showLabel: false, labelColor: '#e7eef7', fontSize: 18
    }
  };



  const ComponentRegistry = {
    ObjectPoolComponent: {
      type: 'ObjectPoolComponent',
      displayName: 'Object Pool',
      description: 'Pre-spawns reusable node instances. Call engine.PoolAcquire(name,x,y) and engine.PoolRelease(nodeId) from scripts.',
      defaults: {
        enabled: true,
        priority: 10,
        pools: '[{"name":"Bullet","nodeType":"Sprite2D","size":30},{"name":"Explosion","nodeType":"AnimatedSprite2D","size":10}]',
      }
    },
    EnemyAIComponent: {
      type: 'EnemyAIComponent',
      displayName: 'Enemy AI',
      description: 'Drives enemy movement with a selectable AI pattern.',
      defaults: {
        enabled:       true,
        priority:      90,
        aiType:        'patrol',
        speed:         60,
        targetName:    'Player',
        // patrol
        patrolWidth:   160,
        // wander
        wanderMoveTime: 1.8,
        wanderWaitTime: 0.8,
        // guard
        alertRadius:   120,
        leashRadius:   200,
        returnSpeed:   40,
        // chase/flee/homing
        stopDistance:  8,
        turnSpeed:     2.5,
        // bounce
        boundsWidth:   1920,
        boundsHeight:  1080,
        // circle
        orbitRadius:   80,
        // sine_wave
        sineAmplitude: 40,
        sineFrequency: 2,
        moveAxisX:     0,
        moveAxisY:     -1,
        // flank
        flankDistance: 80,
      }
    },
    MoveComponent: {
      type: 'MoveComponent',
      displayName: 'Move',
      description: 'Moves a node every frame using velocity.',
      defaults: { enabled: true, priority: 120, vx: 0, vy: 0 }
    },
    SpinComponent: {
      type: 'SpinComponent',
      displayName: 'Spin',
      description: 'Rotates a node continuously.',
      defaults: { enabled: true, priority: 130, degreesPerSecond: 90 }
    },
    BobComponent: {
      type: 'BobComponent',
      displayName: 'Bob',
      description: 'Offsets a node with a sine wave.',
      defaults: { enabled: true, priority: 140, axis: 'y', amplitude: 16, speed: 2, phase: 0 }
    },
    FollowInputComponent: {
      type: 'FollowInputComponent',
      displayName: 'Follow Input',
      description: 'Moves a node when Roku remote button events fire.',
      defaults: { enabled: true, priority: 100, speed: 24, controlsCamera: false }
    },
    Collider2DComponent: {
      type: 'Collider2DComponent',
      displayName: 'Collider2D',
      description: 'Adds an AABB collider used by physics and trigger checks.',
      defaults: { enabled: true, priority: 150, width: 32, height: 32, offsetX: 0, offsetY: 0, isTrigger: false, layer: 'default', mask: 'default', debug: false }
    },
    RigidBody2DComponent: {
      type: 'RigidBody2DComponent',
      displayName: 'RigidBody2D',
      description: 'Applies simple velocity, acceleration, gravity, and collision resolution.',
      defaults: { enabled: true, priority: 120, bodyType: 'dynamic', vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, friction: 1, bounce: 0, mass: 1, lockRotation: true }
    },
    ScriptComponent: {
      type: 'ScriptComponent',
      displayName: 'Script',
      description: 'Runs BrightScript hooks. Use Edit script to open its source.',
      defaults: { enabled: true, priority: 300, scriptPath: '', entryPoint: 'Update', exposeNode: true }
    },
    AudioSourceComponent: {
      type: 'AudioSourceComponent',
      displayName: 'AudioSource',
      description: 'References an audio clip from the Audio Mixer. Playback settings (volume, pitch, loop, bus, etc.) are configured in the Audio tab.',
      defaults: { enabled: true, priority: 400, resourcePath: '', playOnInput: false, triggerAction: 'action' }
    },
    InputControllerComponent: {
      type: 'InputControllerComponent',
      displayName: 'InputController',
      description: 'Maps Roku remote button presses to node movement.',
      defaults: { enabled: true, priority: 110, moveStep: 24, controlsCamera: false, allowHorizontal: true, allowVertical: true }
    },
    AnimationPlayerComponent: {
      type: 'AnimationPlayerComponent',
      displayName: 'AnimationPlayer',
      description: 'Controls AnimatedSprite2D playback state and animation selection.',
      defaults: { enabled: true, priority: 350, animation: '', graphPath: '', graphParameters: '{}', autoplay: true, playing: true, speedScale: 1, triggerAction: 'action' }
    }
  };

  function getComponentDef(type) {
    return ComponentRegistry[type] || null;
  }

  function getCreatableComponentTypes() {
    return Object.values(ComponentRegistry);
  }

  function createDefaultComponent(type, overrides = {}) {
    const def = getComponentDef(type);
    if (!def) throw new Error(`Unknown component type: ${type}`);
    const componentId = typeof overrides.id === 'string' && overrides.id.trim() ? overrides.id.trim() : generateNodeId();
    return Object.assign({
      id: componentId,
      type,
      name: def.displayName,
      enabled: true
    }, deepClone(def.defaults || {}), deepClone(overrides || {}));
  }

  function normalizeComponent(component) {
    if (!isPlainObject(component)) return null;
    const type = typeof component.type === 'string' ? component.type.trim() : '';
    const def = getComponentDef(type);
    if (!def) return null;
    return createDefaultComponent(type, component);
  }

  function normalizeComponents(components) {
    if (!Array.isArray(components)) return [];
    return components.map(normalizeComponent).filter(Boolean);
  }

  const SCENE_FORMAT_VERSION = 2;
  const EDITOR_STATE_VERSION = 1;
  const ROOT_NODE_ID = generateNodeId();

  // deepClone → RGE_ROOT.RGEUtils.deepClone (shared, see core/utils.js)
  const deepClone = (typeof window !== 'undefined' && RGE_ROOT.RGEUtils)
    ? RGE_ROOT.RGEUtils.deepClone
    : (v) => JSON.parse(JSON.stringify(v));

  function generateNodeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `node_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  function createDefaultEditorState(rootNodeId = ROOT_NODE_ID) {
    return {
      editorVersion: EDITOR_STATE_VERSION,
      selection: [],
      expandedTreeNodes: [rootNodeId],
      viewport: {
        x: 0,
        y: 0,
        scale: 1
      },
      spritesheets: [],
      recentInspectorSections: {},
      spriteFramesLibraries: [],
      tilesets: [],
      selectedSheetId: null,
      selectedSpriteFramesId: null,
      selectedTilesetId: null,
      uiMeta: null,   // populated on first UI editor open; see ui_editor.js _defaultUiMeta
      nineSliceStyles: [],   // NineSliceStyle resource definitions
      selectedNineSliceStyleId: null,
      uiScreens: [],         // UIScreen definitions
      selectedUIScreenId: null,
      uiTransitionPresets: [],   // UITransitionPreset definitions
      selectedUITransitionPresetId: null,
      uiOptionDefs: [],          // UIOptionDef definitions
      uiHighScoreTables: [],     // UIHighScoreTable definitions
      cameraPreview: { selectedCameraId: null, overlays: { showFrame: true, showDeadZone: true, showLookAhead: true, showBounds: true, showLabels: true, showZones: true, showPaths: true } },  // Camera Preview panel state
    };
  }

  const sharedSections = ['Node', 'Transform', 'Metadata'];

  const NodeRegistry = {
    SceneRoot: {
      type: 'SceneRoot',
      displayName: 'SceneRoot',
      category: 'Core',
      canHaveChildren: true,
      creatable: false,
      defaultSize: null,
      inspectorSections: ['Node', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' }
      ]
    },
    Node2D: {
      type: 'Node2D',
      displayName: 'Node2D',
      category: 'Core',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 160, height: 120 },
      inspectorSections: ['Node', 'Transform', 'Appearance', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.tint', label: 'Tint', type: 'color', section: 'Appearance' }
      ]
    },
    Sprite2D: {
      type: 'Sprite2D',
      displayName: 'Sprite2D',
      category: 'Visual',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 96, height: 96 },
      inspectorSections: ['Node', 'Transform', 'Appearance', 'Sprite', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.imagePath', label: 'Image Path', type: 'readonly', section: 'Sprite' },
        { key: 'properties.fitMode', label: 'Fit Mode', type: 'select', options: ['contain', 'cover', 'stretch'], section: 'Sprite' },
        { key: 'properties.imageDataUrl', label: 'Pick Image', type: 'image_picker', section: 'Sprite' }
      ]
    },
    AnimatedSprite2D: {
      type: 'AnimatedSprite2D',
      displayName: 'AnimatedSprite2D',
      category: 'Visual',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 96, height: 96 },
      inspectorSections: ['Node', 'Transform', 'Appearance', 'Sprite', 'Animation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.spriteFramesId', label: 'SpriteFrames', type: 'select', options: [], section: 'Sprite' },
        { key: 'properties.animation', label: 'Animation', type: 'select', options: [], section: 'Animation' },
        { key: 'properties.frame', label: 'Frame', type: 'number', min: 0, step: 1, section: 'Animation' },
        { key: 'properties.playing', label: 'Playing', type: 'boolean', section: 'Animation' },
        { key: 'properties.autoplay', label: 'Autoplay', type: 'boolean', section: 'Animation' },
        { key: 'properties.speedScale', label: 'Speed Scale', type: 'number', min: 0.1, step: 0.1, section: 'Animation' }
      ]
    },
    TileMap: {
      type: 'TileMap',
      displayName: 'TileMap',
      category: 'Visual',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 320, height: 256 },
      inspectorSections: ['Node', 'Transform', 'TileMap', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.tilesetId', label: 'Assigned TileSet', type: 'select', options: [], section: 'TileMap' },
        { key: 'properties.tileWidth', label: 'Tile Width', type: 'number', min: 1, step: 1, section: 'TileMap' },
        { key: 'properties.tileHeight', label: 'Tile Height', type: 'number', min: 1, step: 1, section: 'TileMap' },
        { key: 'properties.showGrid', label: 'Show Grid', type: 'boolean', section: 'TileMap' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'TileMap' }
      ]
    },
    Camera2D: {
      type: 'Camera2D',
      displayName: 'Camera2D',
      category: 'Core',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 96, height: 72 },
      inspectorSections: ['Node', 'Transform', 'Camera', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.current', label: 'Current', type: 'boolean', section: 'Camera' },
        { key: 'properties.enabled', label: 'Enabled', type: 'boolean', section: 'Camera' },
        { key: 'properties.followTargetName', label: 'Follow Target Name', type: 'string', section: 'Camera' },
        { key: 'properties.followLerp', label: 'Follow Lerp', type: 'number', min: 0, max: 1, step: 0.05, section: 'Camera' },
        { key: 'properties.offsetX', label: 'Offset X', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.offsetY', label: 'Offset Y', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.deadzoneWidth', label: 'Deadzone Width', type: 'number', min: 0, step: 1, section: 'Camera' },
        { key: 'properties.deadzoneHeight', label: 'Deadzone Height', type: 'number', min: 0, step: 1, section: 'Camera' },
        { key: 'properties.deadzoneOffsetX', label: 'Deadzone Offset X', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.deadzoneOffsetY', label: 'Deadzone Offset Y', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.zoom', label: 'Zoom', type: 'number', min: 0.1, max: 10, step: 0.1, section: 'Camera' },
        { key: 'properties.cameraPreset', label: 'Camera Preset', type: 'select', options: ['Side Scroller','Metroidvania','Top Down Adventure','Twin Stick Shooter','RPG/JRPG','RTS','Fighting Game','Shmup','Pixel Perfect','Cinematic','Multi Target'], section: 'Camera' },
        { key: 'properties.lookAheadX', label: 'Look Ahead X', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.lookAheadY', label: 'Look Ahead Y', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.smoothFollow', label: 'Smooth Follow', type: 'boolean', section: 'Camera' },
        { key: 'properties.cameraBounds', label: 'Use Camera Bounds', type: 'boolean', section: 'Camera' },
        { key: 'properties.boundsX', label: 'Bounds Left', type: 'number', section: 'Camera' },
        { key: 'properties.boundsY', label: 'Bounds Top', type: 'number', section: 'Camera' },
        { key: 'properties.boundsWidth', label: 'Bounds Width', type: 'number', section: 'Camera' },
        { key: 'properties.boundsHeight', label: 'Bounds Height', type: 'number', section: 'Camera' },
        { key: 'properties.dynamicZoom', label: 'Dynamic Zoom', type: 'boolean', section: 'Camera' },
        { key: 'properties.screenShake', label: 'Enable Screen Shake', type: 'boolean', section: 'Camera' },
        { key: 'properties.zoomMin', label: 'Min Zoom', type: 'number', section: 'Camera' },
        { key: 'properties.zoomMax', label: 'Max Zoom', type: 'number', section: 'Camera' },
        { key: 'properties.roomLock', label: 'Room Lock', type: 'boolean', section: 'Camera' },
        { key: 'properties.combatZoom', label: 'Combat Zoom', type: 'number', section: 'Camera' }
      ]
    },
    CameraZone2D: {
      type: 'CameraZone2D',
      displayName: 'CameraZone2D',
      category: 'Camera',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 512, height: 288 },
      inspectorSections: ['Node', 'Transform', 'Zone', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Zone' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Zone' },
        { key: 'properties.enabled', label: 'Enabled', type: 'boolean', section: 'Zone' },
        { key: 'properties.mode', label: 'Mode', type: 'select', options: ['Normal','Room Lock','Zoom Zone','Cinematic','Boss Arena'], section: 'Zone' },
        { key: 'properties.priority', label: 'Priority', type: 'number', step: 1, section: 'Zone' },
        { key: 'properties.blendTime', label: 'Blend Time', type: 'number', min: 0, step: 0.05, section: 'Zone' },
        { key: 'properties.zoom', label: 'Zoom Override', type: 'number', min: 0.1, max: 10, step: 0.1, section: 'Zone' },
        { key: 'properties.offsetX', label: 'Offset X', type: 'number', step: 1, section: 'Zone' },
        { key: 'properties.offsetY', label: 'Offset Y', type: 'number', step: 1, section: 'Zone' },
        { key: 'properties.eventsEnabled', label: 'Events Enabled', type: 'boolean', section: 'Zone' },
        { key: 'properties.showDebug', label: 'Show Debug', type: 'boolean', section: 'Zone' },
        { key: 'properties.showGizmo', label: 'Show Gizmo', type: 'boolean', section: 'Zone' },
      ]
    },
    CameraBounds2D: {
      type: 'CameraBounds2D',
      displayName: 'CameraBounds2D',
      category: 'Camera',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 1024, height: 768 },
      inspectorSections: ['Node', 'Transform', 'Bounds', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Bounds' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Bounds' },
        { key: 'properties.clampPosition', label: 'Clamp Position', type: 'boolean', section: 'Bounds' },
        { key: 'properties.clampZoom', label: 'Clamp Zoom', type: 'boolean', section: 'Bounds' },
      ]
    },
    CameraPath2D: {
      type: 'CameraPath2D',
      displayName: 'CameraPath2D',
      category: 'Camera',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 320, height: 256 },
      inspectorSections: ['Node', 'Transform', 'Path', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.closedPath', label: 'Closed Path', type: 'boolean', section: 'Path' },
        { key: 'properties.loop', label: 'Loop Playback', type: 'boolean', section: 'Path' },
        { key: 'properties.speed', label: 'Camera Speed', type: 'number', min: 1, step: 1, section: 'Path' },
        { key: 'properties.interpolation', label: 'Interpolation', type: 'select', options: ['Linear', 'Smooth', 'Cubic'], section: 'Path' },
        { key: 'properties.duration', label: 'Duration (s)', type: 'number', min: 0.1, step: 0.1, section: 'Path' },
        { key: 'properties.autoPlay', label: 'Auto Play', type: 'boolean', section: 'Path' },
      ]
    },
    CameraTargetGroup: {
      type: 'CameraTargetGroup',
      displayName: 'CameraTargetGroup',
      category: 'Camera',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 64, height: 64 },
      inspectorSections: ['Node', 'Transform', 'Targeting', 'Zoom', 'Padding', 'Debug', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.autoTrack', label: 'Auto Track', type: 'boolean', section: 'Targeting' },
        { key: 'properties.smoothing', label: 'Smoothing', type: 'number', min: 0, max: 1, step: 0.01, section: 'Targeting' },
        { key: 'properties.enableAutoZoom', label: 'Enable Auto Zoom', type: 'boolean', section: 'Zoom' },
        { key: 'properties.minZoom', label: 'Min Zoom', type: 'number', min: 0.1, max: 10, step: 0.1, section: 'Zoom' },
        { key: 'properties.maxZoom', label: 'Max Zoom', type: 'number', min: 0.1, max: 10, step: 0.1, section: 'Zoom' },
        { key: 'properties.paddingLeft', label: 'Padding Left', type: 'number', min: 0, step: 1, section: 'Padding' },
        { key: 'properties.paddingRight', label: 'Padding Right', type: 'number', min: 0, step: 1, section: 'Padding' },
        { key: 'properties.paddingTop', label: 'Padding Top', type: 'number', min: 0, step: 1, section: 'Padding' },
        { key: 'properties.paddingBottom', label: 'Padding Bottom', type: 'number', min: 0, step: 1, section: 'Padding' },
        { key: 'properties.showDebug', label: 'Show Debug', type: 'boolean', section: 'Debug' },
      ]
    },
    CanvasLayer: {
      type: 'CanvasLayer',
      displayName: 'CanvasLayer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 1280, height: 720 },
      inspectorSections: ['Node', 'Transform', 'UI Layout', 'Screen', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.layer', label: 'Layer', type: 'number', step: 1, section: 'UI Layout' },
        { key: 'properties.followViewport', label: 'Follow Viewport', type: 'boolean', section: 'UI Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'UI Layout' },
        { key: 'properties.uiScreenName', label: 'UI Screen Name', type: 'string', section: 'Screen' }
      ]
    },
    Control: {
      type: 'Control',
      displayName: 'Control',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 240, height: 64 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'UI Layout', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'UI Layout' },
        { key: 'properties.clipContent', label: 'Clip Content', type: 'boolean', section: 'UI Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'UI Layout' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    HBoxContainer: {
      type: 'HBoxContainer',
      displayName: 'HBoxContainer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 320, height: 64 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.separation', label: 'Separation', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.alignment', label: 'Alignment', type: 'select', options: ['begin', 'center', 'end'], section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    VBoxContainer: {
      type: 'VBoxContainer',
      displayName: 'VBoxContainer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 120, height: 320 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.separation', label: 'Separation', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.alignment', label: 'Alignment', type: 'select', options: ['begin', 'center', 'end'], section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    MarginContainer: {
      type: 'MarginContainer',
      displayName: 'MarginContainer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 280, height: 180 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.paddingLeft',   label: 'Padding Left',   type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingTop',    label: 'Padding Top',    type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingRight',  label: 'Padding Right',  type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingBottom', label: 'Padding Bottom', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    ScrollContainer: {
      type: 'ScrollContainer',
      displayName: 'ScrollContainer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 320, height: 240 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Scroll', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Scroll' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Scroll' },
        { key: 'properties.scrollHorizontal', label: 'Horizontal Scroll', type: 'select', options: ['auto', 'always', 'never'], section: 'Scroll' },
        { key: 'properties.scrollVertical',   label: 'Vertical Scroll',   type: 'select', options: ['auto', 'always', 'never'], section: 'Scroll' },
        { key: 'properties.scrollOffsetX', label: 'Scroll Offset X', type: 'number', step: 1, section: 'Scroll' },
        { key: 'properties.scrollOffsetY', label: 'Scroll Offset Y', type: 'number', step: 1, section: 'Scroll' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Scroll' }
      ]
    },
    Label: {
      type: 'Label',
      displayName: 'Label',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 240, height: 36 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Text', 'Data Binding', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Text' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Text' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.fontSize', label: 'Font Size', type: 'number', min: 8, step: 1, section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.align', label: 'Align', type: 'select', options: ['left', 'center', 'right'], section: 'Text' },
        { key: 'properties.valign', label: 'Vertical Align', type: 'select', options: ['top', 'center', 'bottom'], section: 'Text' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Text' },
        { key: 'properties.boundOptionKey', label: 'Bound Option Key', type: 'string', section: 'Data Binding' },
        { key: 'properties.boundOptionPrefix', label: 'Option Label Prefix', type: 'string', section: 'Data Binding' },
        { key: 'properties.boundHighScoreTable', label: 'High Score Table ID', type: 'string', section: 'Data Binding' },
        { key: 'properties.boundHighScoreRank', label: 'High Score Rank', type: 'number', min: 1, step: 1, section: 'Data Binding' }
      ]
    },
    Panel: {
      type: 'Panel',
      displayName: 'Panel',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 280, height: 120 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Appearance', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.color', label: 'Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderColor', label: 'Border Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderWidth', label: 'Border Width', type: 'number', min: 0, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.nineSliceStyleId', label: 'Nine-Slice Style', type: 'nineslice_style_picker', section: 'Appearance' }
      ]
    },
    TextureRect: {
      type: 'TextureRect',
      displayName: 'TextureRect',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 160, height: 90 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Appearance', 'Sprite', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.imagePath', label: 'Image Path', type: 'readonly', section: 'Sprite' },
        { key: 'properties.fitMode', label: 'Fit Mode', type: 'select', options: ['contain', 'cover', 'stretch'], section: 'Sprite' },
        { key: 'properties.imageDataUrl', label: 'Pick Image', type: 'image_picker', section: 'Sprite' }
      ]
    },
    Button: {
      type: 'Button',
      displayName: 'Button',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 220, height: 56 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Text', 'Button', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.normalColor', label: 'Normal Color', type: 'color', section: 'Button' },
        { key: 'properties.focusedColor', label: 'Focused Color', type: 'color', section: 'Button' },
        { key: 'properties.pressedColor', label: 'Pressed Color', type: 'color', section: 'Button' },
        { key: 'properties.disabledColor', label: 'Disabled Color', type: 'color', section: 'Button' },
        { key: 'properties.disabled', label: 'Disabled', type: 'boolean', section: 'Button' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' },
        { key: 'properties.nineSliceStyleId', label: 'Nine-Slice Style', type: 'nineslice_style_picker', section: 'Button' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.action', label: 'Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.actionBack', label: 'Back Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.boundOptionKey', label: 'Cycles Option Key', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    CircleButton: {
      type: 'CircleButton',
      displayName: 'CircleButton',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 80, height: 80 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Text', 'Button', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Diameter (W)', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.height', label: 'Diameter (H)', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.normalColor', label: 'Normal Color', type: 'color', section: 'Button' },
        { key: 'properties.focusedColor', label: 'Focused Color', type: 'color', section: 'Button' },
        { key: 'properties.pressedColor', label: 'Pressed Color', type: 'color', section: 'Button' },
        { key: 'properties.disabledColor', label: 'Disabled Color', type: 'color', section: 'Button' },
        { key: 'properties.disabled', label: 'Disabled', type: 'boolean', section: 'Button' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.action', label: 'Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.actionBack', label: 'Back Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.boundOptionKey', label: 'Cycles Option Key', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    TriangleButton: {
      type: 'TriangleButton',
      displayName: 'TriangleButton',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 80, height: 80 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Text', 'Button', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.normalColor', label: 'Normal Color', type: 'color', section: 'Button' },
        { key: 'properties.focusedColor', label: 'Focused Color', type: 'color', section: 'Button' },
        { key: 'properties.pressedColor', label: 'Pressed Color', type: 'color', section: 'Button' },
        { key: 'properties.disabledColor', label: 'Disabled Color', type: 'color', section: 'Button' },
        { key: 'properties.disabled', label: 'Disabled', type: 'boolean', section: 'Button' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.action', label: 'Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.actionBack', label: 'Back Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.boundOptionKey', label: 'Cycles Option Key', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    OvalButton: {
      type: 'OvalButton',
      displayName: 'OvalButton',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 160, height: 56 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Text', 'Button', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Button' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.normalColor', label: 'Normal Color', type: 'color', section: 'Button' },
        { key: 'properties.focusedColor', label: 'Focused Color', type: 'color', section: 'Button' },
        { key: 'properties.pressedColor', label: 'Pressed Color', type: 'color', section: 'Button' },
        { key: 'properties.disabledColor', label: 'Disabled Color', type: 'color', section: 'Button' },
        { key: 'properties.disabled', label: 'Disabled', type: 'boolean', section: 'Button' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.action', label: 'Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.actionBack', label: 'Back Action', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.boundOptionKey', label: 'Cycles Option Key', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    NineSlicePanel: {
      type: 'NineSlicePanel',
      displayName: 'NineSlicePanel',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 320, height: 200 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Appearance', 'NineSlice', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.color', label: 'Tint Color', type: 'color', section: 'Appearance' },
        { key: 'properties.imagePath', label: 'Image Path', type: 'readonly', section: 'NineSlice' },
        { key: 'properties.imageDataUrl', label: 'Pick Image', type: 'image_picker', section: 'NineSlice' },
        { key: 'properties.sliceLeft', label: 'Slice Left', type: 'number', min: 0, step: 1, section: 'NineSlice' },
        { key: 'properties.sliceTop', label: 'Slice Top', type: 'number', min: 0, step: 1, section: 'NineSlice' },
        { key: 'properties.sliceRight', label: 'Slice Right', type: 'number', min: 0, step: 1, section: 'NineSlice' },
        { key: 'properties.sliceBottom', label: 'Slice Bottom', type: 'number', min: 0, step: 1, section: 'NineSlice' },
        { key: 'properties.centerMode', label: 'Center Mode', type: 'select', options: ['stretch', 'tile'], section: 'NineSlice' },
        { key: 'properties.edgeMode', label: 'Edge Mode', type: 'select', options: ['stretch', 'tile'], section: 'NineSlice' },
        { key: 'properties.nineSliceStyleId', label: 'Nine-Slice Style', type: 'nineslice_style_picker', section: 'NineSlice' }
      ]
    },
    MenuList: {
      type: 'MenuList',
      displayName: 'MenuList',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 280, height: 240 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'MenuList', 'Appearance', 'Focus & Navigation', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'MenuList' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'MenuList' },
        { key: 'properties.itemHeight', label: 'Item Height', type: 'number', min: 16, step: 1, section: 'MenuList' },
        { key: 'properties.selectedIndex', label: 'Selected Index', type: 'number', min: 0, step: 1, section: 'MenuList' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'MenuList' },
        { key: 'properties.normalColor', label: 'Item Color', type: 'color', section: 'Appearance' },
        { key: 'properties.selectedColor', label: 'Selected Color', type: 'color', section: 'Appearance' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Appearance' },
        { key: 'properties.selectedTextColor', label: 'Selected Text Color', type: 'color', section: 'Appearance' },
        { key: 'properties.fontSize', label: 'Font Size', type: 'number', min: 8, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' },
        { key: 'properties.focusable', label: 'Focusable', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.defaultFocus', label: 'Default Focus', type: 'boolean', section: 'Focus & Navigation' },
        { key: 'properties.action', label: 'Action (on select)', type: 'ui_action_picker', section: 'Focus & Navigation' },
        { key: 'properties.focusUp', label: 'Focus Up (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusDown', label: 'Focus Down (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusLeft', label: 'Focus Left (id/name)', type: 'string', section: 'Focus & Navigation' },
        { key: 'properties.focusRight', label: 'Focus Right (id/name)', type: 'string', section: 'Focus & Navigation' }
      ]
    },
    ProgressBar: {
      type: 'ProgressBar',
      displayName: 'ProgressBar',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 300, height: 28 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'ProgressBar', 'Appearance', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft',   label: 'Anchor Left',   type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop',    label: 'Anchor Top',    type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight',  label: 'Anchor Right',  type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft',   label: 'Margin Left',   type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop',    label: 'Margin Top',    type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight',  label: 'Margin Right',  type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'ProgressBar' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'ProgressBar' },
        { key: 'properties.value', label: 'Value', type: 'number', min: 0, max: 1, step: 0.01, section: 'ProgressBar' },
        { key: 'properties.minValue', label: 'Min Value', type: 'number', step: 1, section: 'ProgressBar' },
        { key: 'properties.maxValue', label: 'Max Value', type: 'number', step: 1, section: 'ProgressBar' },
        { key: 'properties.showLabel', label: 'Show Label', type: 'boolean', section: 'ProgressBar' },
        { key: 'properties.fillColor', label: 'Fill Color', type: 'color', section: 'Appearance' },
        { key: 'properties.trackColor', label: 'Track Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderColor', label: 'Border Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderWidth', label: 'Border Width', type: 'number', min: 0, step: 1, section: 'Appearance' },
        { key: 'properties.labelColor', label: 'Label Color', type: 'color', section: 'Appearance' },
        { key: 'properties.fontSize', label: 'Font Size', type: 'number', min: 8, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' }
      ]
    },
    SceneInstance: {
      type: 'SceneInstance',
      displayName: 'SceneInstance',
      category: 'Core',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 160, height: 120 },
      inspectorSections: ['Node', 'Transform', 'Instance', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Instance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Instance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Instance' },
        { key: 'properties.sourceScenePath', label: 'Source Scene', type: 'readonly', section: 'Instance' },
        { key: 'properties.sourceSceneName', label: 'Source Name', type: 'readonly', section: 'Instance' },
        { key: 'properties.editableChildren', label: 'Editable Children', type: 'boolean', section: 'Instance' }
      ]
    }
  };

  // Gameplay helpers share the same registration, serialization, and inspector path.
  const gameplayNodes = {
    Marker2D: { category: 'Gameplay', defaults: { gizmoSize: 16, tint: '#f2cf66' } },
    Timer: { category: 'Gameplay', defaults: { waitTime: 1, oneShot: false, autostart: true, paused: false, processWhenPaused: false, tint: '#70c9d1' } },
    TriggerZone2D: { category: 'Gameplay', defaults: { width: 160, height: 120, enabled: true, layer: 'default', mask: 'default', tint: '#6dbd79' } },
    Path2D: { category: 'Gameplay', defaults: { points: [{ x: 0, y: 0 }, { x: 160, y: 0 }], closedPath: false, tint: '#66c9e8' } },
    PathFollow2D: { category: 'Gameplay', defaults: { path: '', speed: 60, progress: 0, loop: true, rotates: false, playing: true, tint: '#66c9e8' } },
    Parallax2D: { category: 'World', defaults: { width: 320, height: 180, scrollScaleX: 0.5, scrollScaleY: 0.5, autoscrollX: 0, autoscrollY: 0, repeatWidth: 0, repeatHeight: 0, tint: '#b496ff' } },
    VisibilityEnabler2D: { category: 'Gameplay', defaults: { width: 160, height: 120, target: '', enabled: true, margin: 64, tint: '#72bdab' } },
    Spawner2D: { category: 'Gameplay', defaults: { template: '', poolName: '', spawnPoints: [], interval: 1, maxActive: 10, spawnCount: 1, autostart: true, enabled: true, tint: '#f0a266' } },
    FocusGroup: { category: 'UI', defaults: { width: 320, height: 240, opacity: 1, enabled: true, initialFocus: '', wrap: true, restoreFocus: true, trapFocus: true, tint: '#e5c97a' } }
  };
  const helperLabels = {
    path: 'Path (node ID or name; blank = parent)', target: 'Target (node ID or name; blank = parent)',
    template: 'Template node (ID or name)', spawnPoints: 'Spawn markers (node IDs or names)',
    poolName: 'Pool name (optional)', initialFocus: 'Initial focus (node ID or name)',
    repeatWidth: 'Horizontal repeat size (0 = off)', repeatHeight: 'Vertical repeat size (0 = off)'
  };
  for (const [type, config] of Object.entries(gameplayNodes)) {
    NodeDefaultProperties[type] = config.defaults;
    const fields = [
      { key: 'name', label: 'Name', type: 'string', section: 'Node' },
      { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
      ...['x', 'y', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY'].map(key => ({ key: `transform.${key}`, label: key, type: 'number', step: key.startsWith('scale') ? 0.01 : 1, section: 'Transform' })),
      ...Object.entries(config.defaults).map(([key, value]) => ({
        key: `properties.${key}`, label: helperLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
        type: Array.isArray(value) ? 'json' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : key === 'tint' ? 'color' : 'string',
        step: 0.1, section: 'Settings'
      }))
    ];
    NodeRegistry[type] = { type, displayName: type, category: config.category, canHaveChildren: true, creatable: true,
      defaultSize: { width: config.defaults.width || 32, height: config.defaults.height || 32 },
      inspectorSections: ['Node', 'Transform', 'Settings', 'Metadata'], fields };
  }

  function normalizeGameplayProperties(type, properties) {
    if (!gameplayNodes[type]) return;
    for (const [key, value] of Object.entries(gameplayNodes[type].defaults)) {
      if (typeof value === 'number') properties[key] = Number.isFinite(Number(properties[key])) ? Number(properties[key]) : value;
    }
    if (type === 'Path2D') {
      const points = Array.isArray(properties.points) ? properties.points.filter(p => p && typeof p === 'object') : [];
      properties.points = points.length ? points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : deepClone(gameplayNodes.Path2D.defaults.points);
    }
    if (type === 'Spawner2D') properties.spawnPoints = Array.isArray(properties.spawnPoints) ? properties.spawnPoints.map(String) : [];
  }

  function getNodeDef(type) {
    return NodeRegistry[type] || null;
  }

  function getCreatableNodeTypes() {
    return Object.values(NodeRegistry).filter((def) => def.creatable);
  }
  function isUiNodeType(type) {
    return ['FocusGroup', 'CanvasLayer', 'Control', 'Label', 'Panel', 'TextureRect', 'Button', 'NineSlicePanel', 'MenuList', 'ProgressBar', 'HBoxContainer', 'VBoxContainer', 'MarginContainer', 'ScrollContainer', 'CircleButton', 'TriangleButton', 'OvalButton'].includes(type);
  }

  function isWorldNodeType(type) {
    return !isUiNodeType(type) && type !== 'SceneRoot';
  }


  function getDefaultPivotForNode(type, properties = {}) {
    if (gameplayNodes[type]) return { pivotPreset: 'top-left', pivotX: 0, pivotY: 0 };
    if (type === 'SceneRoot') {
      return { pivotPreset: 'top-left', pivotX: 0, pivotY: 0 };
    }

    // Camera nodes draw their visual rect from the top-left of the Konva group origin
    // (pivotX/Y = 0,0). Using center pivot (width/2, height/2) would offset the visual
    // rect by half its size relative to the transform position, breaking the alignment
    // between the Konva shape, the selection outline, and the camera overlay/gizmo.
    if (
      type === 'Camera2D' ||
      type === 'CameraZone2D' ||
      type === 'CameraBounds2D' ||
      type === 'CameraPath2D' ||
      type === 'CameraTargetGroup'
    ) {
      return { pivotPreset: 'top-left', pivotX: 0, pivotY: 0 };
    }

    const width = Math.max(1, Number(properties.width) || 96);
    const height = Math.max(1, Number(properties.height) || 96);
    return { pivotPreset: 'center', pivotX: width / 2, pivotY: height / 2 };
  }

  function createDefaultNode(type, overrides = {}) {
    const def = getNodeDef(type);
    if (!def) throw new Error(`Unknown node type: ${type}`);

    const node = deepClone(BaseNodeDefaults);
    node.id = overrides.id || generateNodeId();
    node.type = type;
    node.name = overrides.name || def.displayName;
    node.properties = deepClone(NodeDefaultProperties[type] || {});
    Object.assign(node, overrides);
    if (overrides.transform) node.transform = Object.assign(deepClone(BaseNodeDefaults.transform), overrides.transform);
    if (overrides.properties) node.properties = Object.assign(deepClone(NodeDefaultProperties[type] || {}), overrides.properties);
    normalizeGameplayProperties(type, node.properties);
    if (type === 'CameraPath2D') {
      const rawPoints = Array.isArray(node.properties.points)
        ? node.properties.points
        : (Array.isArray(node.properties.waypoints) ? node.properties.waypoints : []);
      node.properties.points = rawPoints.length
        ? rawPoints.map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
        : [{ x: 0, y: 0 }];
      delete node.properties.waypoints;
    }
    if (!Array.isArray(node.children)) node.children = [];
    node.components = normalizeComponents(overrides.components != null ? overrides.components : node.components);

    if (!overrides.transform || (
      overrides.transform.pivotPreset == null &&
      overrides.transform.pivotX == null &&
      overrides.transform.pivotY == null
    )) {
      const pivot = getDefaultPivotForNode(type, node.properties);
      node.transform.pivotPreset = pivot.pivotPreset;
      node.transform.pivotX = pivot.pivotX;
      node.transform.pivotY = pivot.pivotY;
    }

    return node;
  }

  function getNodeFields(type) {
    const fields=(getNodeDef(type)?.fields || []).slice();
    if (['Label','Button','CircleButton','TriangleButton','OvalButton'].includes(type)) {
      const typography=[
        {key:'properties.fontSize',label:'Font size',type:'number',min:1,step:1},
        {key:'properties.fontFamily',label:'Font family',type:'string'},
        {key:'properties.fontPath',label:'Font file (res://fonts/...)',type:'string'},
        {key:'properties.fontBold',label:'Bold',type:'boolean'},
        {key:'properties.fontItalic',label:'Italic',type:'boolean'},
        {key:'properties.align',label:'Text alignment',type:'select',options:['left','center','right']},
        {key:'properties.valign',label:'Vertical alignment',type:'select',options:['top','center','bottom']}
      ];
      for(const field of typography) if(!fields.some(f=>f.key===field.key)) fields.push({...field,section:type==='Label'?'Text':'Appearance'});
    }
    return fields;
  }

  function getNodeFieldsBySection(type) {
    return getNodeFields(type).reduce((acc, field) => {
      const key = field.section || 'Node';
      if (!acc[key]) acc[key] = [];
      acc[key].push(field);
      return acc;
    }, {});
  }

  function canParentNode(childType, parentType) {
    const parent = getNodeDef(parentType);
    return !!parent && !!parent.canHaveChildren;
  }

  function getValueByPath(obj, path) {
    return path.split('.').reduce((curr, part) => (curr == null ? curr : curr[part]), obj);
  }

  function setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (curr[key] == null || typeof curr[key] !== 'object') curr[key] = {};
      curr = curr[key];
    }
    curr[parts[parts.length - 1]] = value;
  }


  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeNodeTransform(transform) {
    return Object.assign(deepClone(BaseNodeDefaults.transform), isPlainObject(transform) ? transform : {});
  }

  function normalizeNode(node, fallbackType = 'Node2D') {
    const source = isPlainObject(node) ? node : {};
    const sourceType = typeof source.type === 'string' && source.type.trim() ? source.type.trim() : '';
    const type = getNodeDef(sourceType) ? sourceType : (sourceType || fallbackType);
    const def = getNodeDef(type);
    const normalized = deepClone(BaseNodeDefaults);
    normalized.id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : generateNodeId();
    normalized.type = type;
    normalized.name = typeof source.name === 'string' && source.name.trim() ? source.name : (def?.displayName || type || fallbackType);
    normalized.parentId = source.parentId == null ? null : String(source.parentId);
    normalized.children = Array.isArray(source.children) ? source.children.map(String) : [];
    normalized.visible = source.visible !== false;
    normalized.locked = source.locked === true;
    normalized.zIndex = Number.isFinite(Number(source.zIndex)) ? Number(source.zIndex) : 0;
    normalized.transform = normalizeNodeTransform(source.transform);
    normalized.properties = Object.assign(deepClone(def ? (NodeDefaultProperties[type] || {}) : {}), isPlainObject(source.properties) ? source.properties : {});
    normalizeGameplayProperties(type, normalized.properties);
    if (type === 'CameraPath2D') {
      const sourceProps = isPlainObject(source.properties) ? source.properties : {};
      const rawPoints = Array.isArray(sourceProps.points)
        ? sourceProps.points
        : (Array.isArray(sourceProps.waypoints) ? sourceProps.waypoints : []);
      normalized.properties.points = rawPoints.length
        ? rawPoints.map((point) => ({
            x: Number(point?.x) || 0,
            y: Number(point?.y) || 0
          }))
        : [{ x: 0, y: 0 }];
      delete normalized.properties.waypoints;
      // Apply defaults for new properties (backward compat for older scenes)
      if (normalized.properties.closedPath == null) normalized.properties.closedPath = false;
      if (normalized.properties.loop == null) normalized.properties.loop = false;
      if (normalized.properties.speed == null) normalized.properties.speed = 200;
      if (!normalized.properties.interpolation) normalized.properties.interpolation = 'Linear';
    }
    // ── CameraTargetGroup migration ────────────────────────────────────────
    if (type === 'CameraTargetGroup') {
      const sourceProps = isPlainObject(source.properties) ? source.properties : {};
      // Migrate legacy targetNames (array of name strings) → targets (array of {nodeId})
      // Note: nodeId resolution happens at runtime since we only have node names here.
      // We store the names temporarily and let ensureCTGTargets resolve them on first use.
      if (Array.isArray(sourceProps.targetNames) && sourceProps.targetNames.length &&
          (!Array.isArray(sourceProps.targets) || !sourceProps.targets.length)) {
        normalized.properties._legacyTargetNames = sourceProps.targetNames.slice();
      }
      delete normalized.properties.targetNames;
      // Migrate old single 'padding' value → individual sides
      if (sourceProps.padding != null && sourceProps.paddingLeft == null) {
        const pad = Number(sourceProps.padding) || 64;
        normalized.properties.paddingLeft   = pad;
        normalized.properties.paddingRight  = pad;
        normalized.properties.paddingTop    = pad;
        normalized.properties.paddingBottom = pad;
      }
      delete normalized.properties.padding;
      // Apply defaults for all required fields
      if (!Array.isArray(normalized.properties.targets)) normalized.properties.targets = [];
      if (normalized.properties.autoTrack == null)       normalized.properties.autoTrack = true;
      if (normalized.properties.minZoom == null)         normalized.properties.minZoom = 0.5;
      if (normalized.properties.maxZoom == null)         normalized.properties.maxZoom = 3.0;
      if (normalized.properties.paddingLeft == null)     normalized.properties.paddingLeft = 64;
      if (normalized.properties.paddingRight == null)    normalized.properties.paddingRight = 64;
      if (normalized.properties.paddingTop == null)      normalized.properties.paddingTop = 64;
      if (normalized.properties.paddingBottom == null)   normalized.properties.paddingBottom = 64;
      if (normalized.properties.smoothing == null)       normalized.properties.smoothing = 0.15;
      if (normalized.properties.enableAutoZoom == null)  normalized.properties.enableAutoZoom = true;
      if (normalized.properties.showDebug == null)       normalized.properties.showDebug = true;
    }
    // ── CameraZone2D migration ─────────────────────────────────────────────
    if (type === 'CameraZone2D') {
      const sp = isPlainObject(source.properties) ? source.properties : {};
      // Migrate transitionSpeed → blendTime
      if (normalized.properties.blendTime == null && sp.transitionSpeed != null) {
        normalized.properties.blendTime = Number(sp.transitionSpeed) || 0.5;
      }
      // Apply defaults for all required fields (backwards compat for older scenes)
      if (normalized.properties.enabled == null)              normalized.properties.enabled = true;
      if (normalized.properties.priority == null)             normalized.properties.priority = 0;
      if (normalized.properties.blendTime == null)            normalized.properties.blendTime = 0.5;
      if (normalized.properties.showDebug == null)            normalized.properties.showDebug = true;
      if (normalized.properties.showGizmo == null)            normalized.properties.showGizmo = true;
      if (normalized.properties.eventsEnabled == null)        normalized.properties.eventsEnabled = true;
      if (normalized.properties.zoom == null)                 normalized.properties.zoom = 1;
      if (normalized.properties.offsetX == null)              normalized.properties.offsetX = 0;
      if (normalized.properties.offsetY == null)              normalized.properties.offsetY = 0;
      if (!('followLerp' in normalized.properties))           normalized.properties.followLerp = null;
      if (!('boundsOverride' in normalized.properties))       normalized.properties.boundsOverride = null;
      if (!('targetGroupOverride' in normalized.properties))  normalized.properties.targetGroupOverride = null;
      if (!('pathOverride' in normalized.properties))         normalized.properties.pathOverride = null;
    }
    normalized.metadata = isPlainObject(source.metadata) ? deepClone(source.metadata) : {};
    normalized.components = normalizeComponents(source.components);
    return normalized;
  }

  function parseSceneJson(text) {
    try {
      return {
        ok: true,
        data: JSON.parse(text),
        fatalErrors: [],
        warnings: []
      };
    } catch (error) {
      return {
        ok: false,
        data: null,
        fatalErrors: [{
          code: 'INVALID_JSON',
          message: `Scene file is not valid JSON: ${error.message}`
        }],
        warnings: []
      };
    }
  }

  function isSupportedSceneFormatVersion(version) {
    return Number(version) === SCENE_FORMAT_VERSION;
  }

  function isNodeTypeKnown(type) {
    return !!getNodeDef(type);
  }

  function validateRequiredNodeFields(node, fatalErrors) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      fatalErrors.push({
        code: 'INVALID_NODE_OBJECT',
        message: 'Every node entry must be an object.'
      });
      return;
    }

    if (typeof node.id !== 'string' || !node.id.trim()) {
      fatalErrors.push({
        code: 'MISSING_NODE_ID',
        message: 'A node is missing required string id.'
      });
    }

    if (typeof node.name !== 'string' || !node.name.trim()) {
      fatalErrors.push({
        code: 'MISSING_NODE_NAME',
        nodeId: typeof node.id === 'string' ? node.id : null,
        message: `Node "${typeof node.id === 'string' ? node.id : '(unknown)'}" is missing required name.`
      });
    }

    if (typeof node.type !== 'string' || !node.type.trim()) {
      fatalErrors.push({
        code: 'MISSING_NODE_TYPE',
        nodeId: typeof node.id === 'string' ? node.id : null,
        message: `Node "${typeof node.id === 'string' ? node.id : '(unknown)'}" is missing required type.`
      });
    }

    if (node.transform != null && !isPlainObject(node.transform)) {
      fatalErrors.push({
        code: 'INVALID_TRANSFORM',
        nodeId: typeof node.id === 'string' ? node.id : null,
        message: `Node "${typeof node.id === 'string' ? node.id : '(unknown)'}" has invalid transform data.`
      });
    }

    if (node.properties != null && !isPlainObject(node.properties)) {
      fatalErrors.push({
        code: 'INVALID_PROPERTIES',
        nodeId: typeof node.id === 'string' ? node.id : null,
        message: `Node "${typeof node.id === 'string' ? node.id : '(unknown)'}" has invalid properties data.`
      });
    }
  }

  async function validateSceneDocument(scene, options = {}) {
    const fatalErrors = [];
    const warnings = [];

    if (!isPlainObject(scene)) {
      fatalErrors.push({
        code: 'INVALID_SCENE_OBJECT',
        message: 'Scene file root must be an object.'
      });
      return { ok: false, fatalErrors, warnings };
    }

    if (!isSupportedSceneFormatVersion(scene.formatVersion)) {
      fatalErrors.push({
        code: 'UNSUPPORTED_FORMAT_VERSION',
        message: `Unsupported formatVersion: ${scene.formatVersion}`
      });
    }

    if (!isPlainObject(scene.scene)) {
      fatalErrors.push({
        code: 'MISSING_SCENE_BLOCK',
        message: 'Missing required scene block.'
      });
    }

    if (!Array.isArray(scene.nodes)) {
      fatalErrors.push({
        code: 'MISSING_NODES_ARRAY',
        message: 'Missing required nodes array.'
      });
      return { ok: false, fatalErrors, warnings };
    }

    const nodes = scene.nodes;
    const nodesById = new Map();
    const duplicateIds = new Set();

    nodes.forEach((node) => {
      validateRequiredNodeFields(node, fatalErrors);
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;

      const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
      if (nodeId) {
        if (nodesById.has(nodeId)) duplicateIds.add(nodeId);
        else nodesById.set(nodeId, node);
      }

      if (typeof node.type === 'string' && node.type.trim() && !isNodeTypeKnown(node.type.trim())) {
        warnings.push({
          code: 'UNKNOWN_NODE_TYPE',
          nodeId: nodeId || null,
          message: `Node "${nodeId || '(unknown)'}" uses unknown type "${node.type.trim()}".`
        });
      }
    });

    duplicateIds.forEach((id) => {
      fatalErrors.push({
        code: 'DUPLICATE_NODE_ID',
        nodeId: id,
        message: `Duplicate node id "${id}" found.`
      });
    });

    const rootNodeId = typeof scene.scene?.rootNodeId === 'string' && scene.scene.rootNodeId.trim()
      ? scene.scene.rootNodeId.trim()
      : '';

    if (!rootNodeId) {
      fatalErrors.push({
        code: 'MISSING_ROOT_NODE_ID',
        message: 'scene.rootNodeId is required.'
      });
    } else if (!nodesById.has(rootNodeId)) {
      fatalErrors.push({
        code: 'ROOT_NODE_NOT_FOUND',
        nodeId: rootNodeId,
        message: `Root node "${rootNodeId}" does not exist.`
      });
    }

    nodes.forEach((node) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;
      const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
      if (!nodeId || nodeId === rootNodeId) return;

      if (typeof node.parentId !== 'string' || !node.parentId.trim()) {
        fatalErrors.push({
          code: 'MISSING_PARENT_ID',
          nodeId,
          message: `Node "${nodeId}" is missing parentId.`
        });
        return;
      }

      if (!nodesById.has(node.parentId.trim())) {
        fatalErrors.push({
          code: 'INVALID_PARENT_ID',
          nodeId,
          parentId: node.parentId,
          message: `Node "${nodeId}" points to missing parent "${node.parentId}".`
        });
      }
    });

    const visitState = new Map();
    const childMap = new Map();
    nodes.forEach((node) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;
      const parentId = typeof node.parentId === 'string' ? node.parentId.trim() : '';
      const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
      if (!nodeId || !parentId) return;
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId).push(nodeId);
    });

    function walk(nodeId, trail = []) {
      const state = visitState.get(nodeId) || 0;
      if (state === 1) {
        fatalErrors.push({
          code: 'CYCLIC_PARENTING',
          nodeId,
          message: `Cycle detected: ${[...trail, nodeId].join(' -> ')}`
        });
        return;
      }
      if (state === 2) return;

      visitState.set(nodeId, 1);
      const children = childMap.get(nodeId) || [];
      children.forEach((childId) => walk(childId, [...trail, nodeId]));
      visitState.set(nodeId, 2);
    }

    if (rootNodeId && nodesById.has(rootNodeId)) {
      walk(rootNodeId, []);
      nodesById.forEach((_node, nodeId) => {
        if ((visitState.get(nodeId) || 0) === 0) {
          warnings.push({
            code: 'DISCONNECTED_NODE',
            nodeId,
            message: `Node "${nodeId}" is not reachable from root "${rootNodeId}".`
          });
        }
      });
    }

    const resourceExists = typeof options.resourceExists === 'function' ? options.resourceExists : null;
    const spriteFramesLookup = typeof options.spriteFramesLookup === 'function' ? options.spriteFramesLookup : null;
    const animationLookup = typeof options.animationLookup === 'function' ? options.animationLookup : null;

    for (const node of nodes) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
      const nodeName = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : (nodeId || '(unknown)');
      const type = typeof node.type === 'string' ? node.type.trim() : '';
      const props = isPlainObject(node.properties) ? node.properties : {};

      if (type === 'Sprite2D') {
        const hasEmbeddedData = typeof props.imageDataUrl === 'string' && !!props.imageDataUrl.trim();
        const imagePath = typeof props.imagePath === 'string' ? props.imagePath.trim() : '';
        if (!hasEmbeddedData && !imagePath) {
          warnings.push({
            code: 'MISSING_IMAGE_PATH',
            nodeId,
            message: `Sprite2D "${nodeName}" has no imagePath or embedded image data.`
          });
        } else if (imagePath && resourceExists) {
          const exists = await resourceExists(imagePath);
          if (!exists) {
            warnings.push({
              code: 'MISSING_IMAGE_RESOURCE',
              nodeId,
              path: imagePath,
              message: `Image resource not found: ${imagePath}`
            });
          }
        }
      }

      if (type === 'SceneInstance') {
        const sourceScenePath = typeof props.sourceScenePath === 'string' ? props.sourceScenePath.trim() : '';
        if (!sourceScenePath) {
          warnings.push({
            code: 'MISSING_SCENE_INSTANCE_SOURCE',
            nodeId,
            message: `SceneInstance "${nodeName}" is missing sourceScenePath.`
          });
        } else if (resourceExists) {
          const exists = await resourceExists(sourceScenePath);
          if (!exists) {
            warnings.push({
              code: 'MISSING_SCENE_INSTANCE_SOURCE_RESOURCE',
              nodeId,
              path: sourceScenePath,
              message: `Scene instance source not found: ${sourceScenePath}`
            });
          }
        }
      }

      if (type === 'AnimatedSprite2D') {
        const spriteFramesId = typeof props.spriteFramesId === 'string' ? props.spriteFramesId.trim() : '';
        if (!spriteFramesId) {
          warnings.push({
            code: 'MISSING_SPRITESHEET',
            nodeId,
            message: `AnimatedSprite2D "${nodeName}" is missing spriteFramesId.`
          });
        } else if (spriteFramesLookup) {
          const lib = await spriteFramesLookup(spriteFramesId);
          if (!lib) {
            warnings.push({
              code: 'MISSING_SPRITEFRAMES_RESOURCE',
              nodeId,
              spriteFramesId,
              message: `SpriteFrames resource not found: ${spriteFramesId}`
            });
          }
        }

        const animationName = typeof props.animation === 'string' ? props.animation.trim() : '';
        if (spriteFramesId && animationName && animationLookup) {
          const exists = await animationLookup(spriteFramesId, animationName);
          if (!exists) {
            warnings.push({
              code: 'INVALID_ANIMATION_REFERENCE',
              nodeId,
              animation: animationName,
              spriteFramesId,
              message: `Animation "${animationName}" was not found in SpriteFrames "${spriteFramesId}".`
            });
          }
        }
      }

      // ── UI node validation ───────────────────────────────────────────
      if (isUiNodeType(type)) {
        const width = Number(props.width);
        const height = Number(props.height);
        if (!Number.isFinite(width) || width <= 0) {
          warnings.push({ code: 'INVALID_UI_SIZE', nodeId, message: `UI node "${nodeName}" (${type}) has invalid or missing width.` });
        }
        if (!Number.isFinite(height) || height <= 0) {
          warnings.push({ code: 'INVALID_UI_SIZE', nodeId, message: `UI node "${nodeName}" (${type}) has invalid or missing height.` });
        }
        if (props.opacity !== undefined) {
          const opacity = Number(props.opacity);
          if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            warnings.push({ code: 'INVALID_UI_OPACITY', nodeId, message: `UI node "${nodeName}" (${type}) opacity must be 0–1.` });
          }
        }
      }

      if (type === 'ProgressBar') {
        const minV = Number(props.minValue ?? 0);
        const maxV = Number(props.maxValue ?? 1);
        const value = Number(props.value ?? 0.5);
        if (maxV <= minV) {
          warnings.push({ code: 'INVALID_PROGRESSBAR_RANGE', nodeId, message: `ProgressBar "${nodeName}" maxValue must be greater than minValue.` });
        } else if (value < minV || value > maxV) {
          warnings.push({ code: 'INVALID_PROGRESSBAR_VALUE', nodeId, message: `ProgressBar "${nodeName}" value ${value} is outside [${minV}, ${maxV}].` });
        }
      }

      if (type === 'NineSlicePanel') {
        for (const sliceKey of ['sliceLeft', 'sliceTop', 'sliceRight', 'sliceBottom']) {
          const v = Number(props[sliceKey]);
          if (!Number.isFinite(v) || v < 0) {
            warnings.push({ code: 'INVALID_NINESLICE_MARGINS', nodeId, message: `NineSlicePanel "${nodeName}" has invalid ${sliceKey}: ${props[sliceKey]}.` });
          }
        }
      }

      if (type === 'MenuList') {
        const items = Array.isArray(props.items) ? props.items : [];
        const selectedIndex = Number(props.selectedIndex ?? 0);
        if (items.length > 0 && (selectedIndex < 0 || selectedIndex >= items.length)) {
          warnings.push({ code: 'INVALID_MENULIST_INDEX', nodeId, message: `MenuList "${nodeName}" selectedIndex ${selectedIndex} is out of range (${items.length} items).` });
        }
      }
    }

    return {
      ok: fatalErrors.length === 0,
      fatalErrors,
      warnings
    };
  }

  function deriveChildrenFromParentIds(nodes, rootNodeId) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    nodes.forEach((node) => { node.children = []; });
    nodes.forEach((node) => {
      if (!node || node.id === rootNodeId) return;
      const parentId = byId.has(node.parentId) ? node.parentId : rootNodeId;
      node.parentId = parentId;
      const parent = byId.get(parentId);
      if (parent) parent.children.push(node.id);
    });
  }

  function inferSceneFormatVersion(scene) {
    if (!isPlainObject(scene)) return null;
    if (Number.isFinite(Number(scene.formatVersion))) {
      return Number(scene.formatVersion);
    }

    const hasSceneBlock = isPlainObject(scene.scene);
    const hasNodesArray = Array.isArray(scene.nodes);
    const hasRootNodeId = typeof scene.scene?.rootNodeId === 'string' && scene.scene.rootNodeId.trim();
    const hasSceneName = typeof scene.scene?.name === 'string' && scene.scene.name.trim();

    if (hasSceneBlock && hasNodesArray && (hasRootNodeId || hasSceneName)) {
      return 2;
    }

    if (hasNodesArray) {
      return 1;
    }
    return null;
  }

  function createMigrationWarning(code, message, extra = {}) {
    return Object.assign({ code, message }, extra);
  }

  function migrateSceneV1ToV2(scene) {
    const migrated = isPlainObject(scene) ? deepClone(scene) : {};
    const rawNodes = Array.isArray(migrated.nodes)
      ? migrated.nodes.map((node) => (isPlainObject(node) ? deepClone(node) : {}))
      : [];

    const rootName = (typeof migrated.scene?.name === 'string' && migrated.scene.name.trim())
      || (typeof migrated.sceneName === 'string' && migrated.sceneName.trim())
      || (typeof migrated.name === 'string' && migrated.name.trim())
      || (typeof migrated.title === 'string' && migrated.title.trim())
      || 'MainScene';

    let rootNodeId = (typeof migrated.scene?.rootNodeId === 'string' && migrated.scene.rootNodeId.trim())
      || (rawNodes.find((node) => node?.type === 'SceneRoot' && typeof node.id === 'string' && node.id.trim())?.id)
      || (rawNodes.find((node) => node?.parentId == null && typeof node.id === 'string' && node.id.trim())?.id)
      || generateNodeId();

    let rootNode = rawNodes.find((node) => node?.id === rootNodeId) || null;
    if (!rootNode) {
      rootNode = createDefaultNode('SceneRoot', { id: rootNodeId, name: rootName, parentId: null, children: [] });
      rawNodes.unshift(rootNode);
    }

    rootNode.type = 'SceneRoot';
    rootNode.parentId = null;
    rootNode.name = (typeof rootNode.name === 'string' && rootNode.name.trim()) ? rootNode.name.trim() : rootName;

    migrated.formatVersion = 2;
    migrated.scene = Object.assign({}, isPlainObject(migrated.scene) ? migrated.scene : {}, {
      name: rootName,
      rootNodeId
    });
    migrated.nodes = rawNodes;

    return {
      scene: migrated,
      warnings: [createMigrationWarning(
        'SCENE_MIGRATED_V1_TO_V2',
        'Scene was upgraded from legacy formatVersion 1 to formatVersion 2.'
      )]
    };
  }

  function migrateSceneDocument(scene) {
    if (!isPlainObject(scene)) {
      return {
        ok: false,
        data: null,
        originalVersion: null,
        finalVersion: null,
        migrations: [],
        warnings: [],
        fatalErrors: [{
          code: 'INVALID_SCENE_OBJECT',
          message: 'Scene file root must be an object.'
        }]
      };
    }

    const originalVersion = inferSceneFormatVersion(scene);
    if (originalVersion == null) {
      return {
        ok: false,
        data: null,
        originalVersion: null,
        finalVersion: null,
        migrations: [],
        warnings: [],
        fatalErrors: [{
          code: 'UNKNOWN_SCENE_FORMAT_VERSION',
          message: 'Could not determine scene formatVersion for migration.'
        }]
      };
    }

    if (originalVersion > SCENE_FORMAT_VERSION) {
      return {
        ok: false,
        data: null,
        originalVersion,
        finalVersion: originalVersion,
        migrations: [],
        warnings: [],
        fatalErrors: [{
          code: 'UNSUPPORTED_FORMAT_VERSION',
          message: `Unsupported formatVersion: ${originalVersion}`
        }]
      };
    }

    let working = deepClone(scene);
    let version = originalVersion;
    const migrations = [];
    const warnings = [];

    while (version < SCENE_FORMAT_VERSION) {
      if (version === 1) {
        const result = migrateSceneV1ToV2(working);
        working = result.scene;
        version = 2;
        migrations.push({ fromVersion: 1, toVersion: 2 });
        if (Array.isArray(result.warnings)) warnings.push(...result.warnings);
        continue;
      }

      return {
        ok: false,
        data: null,
        originalVersion,
        finalVersion: version,
        migrations,
        warnings,
        fatalErrors: [{
          code: 'MISSING_SCENE_MIGRATION_STEP',
          message: `Missing migration step for formatVersion ${version}.`
        }]
      };
    }

    working.formatVersion = SCENE_FORMAT_VERSION;

    return {
      ok: true,
      data: working,
      originalVersion,
      finalVersion: SCENE_FORMAT_VERSION,
      migrations,
      warnings,
      fatalErrors: []
    };
  }

  function buildDefaultRuntimeScene() {
    const rootNodeId = generateNodeId();
    return {
      formatVersion: SCENE_FORMAT_VERSION,
      scene: {
        name: 'MainScene',
        rootNodeId
      },
      nodes: [
        createDefaultNode('SceneRoot', { id: rootNodeId, name: 'MainScene', parentId: null, children: [] })
      ]
    };
  }

  function normalizeScene(scene) {
    const base = buildDefaultRuntimeScene();
    if (!scene || !Array.isArray(scene.nodes)) return base;

    const rawNodes = scene.nodes.map((node) => normalizeNode(node, node?.type || 'Node2D'));
    const seenIds = new Set();
    rawNodes.forEach((node) => {
      if (!node.id || seenIds.has(node.id)) node.id = generateNodeId();
      seenIds.add(node.id);
    });

    let rootNodeId = typeof scene.scene?.rootNodeId === 'string' && scene.scene.rootNodeId.trim()
      ? scene.scene.rootNodeId.trim()
      : (rawNodes.find((node) => node.type === 'SceneRoot')?.id || generateNodeId());

    let rootNode = rawNodes.find((node) => node.id === rootNodeId);
    if (!rootNode) {
      rootNode = rawNodes.find((node) => node.type === 'SceneRoot') || null;
    }
    if (!rootNode) {
      rootNode = createDefaultNode('SceneRoot', { id: rootNodeId, name: scene.scene?.name || 'MainScene', parentId: null, children: [] });
      rawNodes.unshift(rootNode);
    }

    rootNode.type = 'SceneRoot';
    rootNode.parentId = null;
    rootNode.name = typeof scene.scene?.name === 'string' && scene.scene.name.trim()
      ? scene.scene.name.trim()
      : (rootNode.name || 'MainScene');

    rawNodes.forEach((node) => {
      if (node.id === rootNodeId) {
        node.parentId = null;
      } else if (!node.parentId || !rawNodes.some((candidate) => candidate.id === node.parentId)) {
        node.parentId = rootNodeId;
      }
    });

    deriveChildrenFromParentIds(rawNodes, rootNodeId);

    const extraSceneProps = isPlainObject(scene.scene)
      ? Object.fromEntries(Object.entries(scene.scene).filter(([key]) => key !== 'name' && key !== 'rootNodeId'))
      : {};

    return {
      formatVersion: SCENE_FORMAT_VERSION,
      scene: Object.assign({}, extraSceneProps, {
        name: rootNode.name || 'MainScene',
        rootNodeId
      }),
      nodes: rawNodes
    };
  }

  // ── Resolve _legacyTargetNames for CameraTargetGroup nodes ─────────────────
  // Called once after normalizeScene, when all node IDs are available.
  function resolveCTGLegacyTargetNames(normalizedScene) {
    if (!normalizedScene || !Array.isArray(normalizedScene.nodes)) return;
    const nameIndex = {};
    normalizedScene.nodes.forEach(n => { if (n && n.name) nameIndex[n.name] = n.id; });
    normalizedScene.nodes.forEach(n => {
      if (n && n.type === 'CameraTargetGroup' && Array.isArray(n.properties?._legacyTargetNames)) {
        const resolved = n.properties._legacyTargetNames
          .map(name => nameIndex[name] ? { nodeId: nameIndex[name] } : null)
          .filter(Boolean);
        if (!Array.isArray(n.properties.targets)) n.properties.targets = [];
        // Merge without duplicates
        const existing = new Set(n.properties.targets.map(t => t.nodeId));
        resolved.forEach(r => { if (!existing.has(r.nodeId)) n.properties.targets.push(r); });
        delete n.properties._legacyTargetNames;
      }
    });
  }

  function normalizeEditorState(editorState, runtimeScene, legacyScene) {
    const source = isPlainObject(editorState)
      ? editorState
      : (isPlainObject(legacyScene?.editor) ? legacyScene.editor : {});
    const rootNodeId = runtimeScene?.scene?.rootNodeId || ROOT_NODE_ID;
    const normalized = Object.assign(createDefaultEditorState(rootNodeId), isPlainObject(source) ? deepClone(source) : {});
    const nodeIds = new Set((runtimeScene?.nodes || []).map((node) => node.id));
    normalized.editorVersion = EDITOR_STATE_VERSION;
    normalized.selection = Array.isArray(normalized.selection)
      ? normalized.selection.map(String).filter((id) => id !== rootNodeId && nodeIds.has(id))
      : [];
    normalized.expandedTreeNodes = Array.isArray(normalized.expandedTreeNodes)
      ? Array.from(new Set(normalized.expandedTreeNodes.map(String).filter((id) => nodeIds.has(id))))
      : [];
    if (!normalized.expandedTreeNodes.includes(rootNodeId)) {
      normalized.expandedTreeNodes.unshift(rootNodeId);
    }
    normalized.viewport = Object.assign({ x: 0, y: 0, scale: 1 }, isPlainObject(normalized.viewport) ? normalized.viewport : {});
    normalized.viewport.x = Number(normalized.viewport.x) || 0;
    normalized.viewport.y = Number(normalized.viewport.y) || 0;
    normalized.viewport.scale = Math.max(0.2, Number(normalized.viewport.scale) || 1);
    normalized.spritesheets = Array.isArray(normalized.spritesheets) ? normalized.spritesheets : [];
    normalized.recentInspectorSections = isPlainObject(normalized.recentInspectorSections) ? normalized.recentInspectorSections : {};
    normalized.spriteFramesLibraries = Array.isArray(normalized.spriteFramesLibraries) ? normalized.spriteFramesLibraries : [];
    normalized.tilesets = Array.isArray(normalized.tilesets) ? normalized.tilesets : [];
    normalized.selectedSheetId = normalized.selectedSheetId || null;
    normalized.selectedSpriteFramesId = normalized.selectedSpriteFramesId || null;
    normalized.selectedTilesetId = normalized.selectedTilesetId || null;
    // Preserve uiMeta (snap settings, layer definitions, guides) as-is — validated by ui_editor.js
    normalized.uiMeta = (isPlainObject(source.uiMeta) ? source.uiMeta : null) ?? (isPlainObject(normalized.uiMeta) ? normalized.uiMeta : null) ?? null;
    // Nine-slice styles — validated by resources.js normalizeNineSliceStyle
    normalized.nineSliceStyles = Array.isArray(source.nineSliceStyles) ? source.nineSliceStyles : (Array.isArray(normalized.nineSliceStyles) ? normalized.nineSliceStyles : []);
    normalized.selectedNineSliceStyleId = source.selectedNineSliceStyleId || normalized.selectedNineSliceStyleId || null;
    // UI Screens
    normalized.uiScreens = Array.isArray(source.uiScreens) ? source.uiScreens : (Array.isArray(normalized.uiScreens) ? normalized.uiScreens : []);
    normalized.selectedUIScreenId = source.selectedUIScreenId || normalized.selectedUIScreenId || null;
    // Transition presets
    normalized.uiTransitionPresets = Array.isArray(source.uiTransitionPresets) ? source.uiTransitionPresets : (Array.isArray(normalized.uiTransitionPresets) ? normalized.uiTransitionPresets : []);
    normalized.selectedUITransitionPresetId = source.selectedUITransitionPresetId || normalized.selectedUITransitionPresetId || null;
    // Options and High Scores
    normalized.uiOptionDefs = Array.isArray(source.uiOptionDefs) ? source.uiOptionDefs : (Array.isArray(normalized.uiOptionDefs) ? normalized.uiOptionDefs : []);
    normalized.uiHighScoreTables = Array.isArray(source.uiHighScoreTables) ? source.uiHighScoreTables : (Array.isArray(normalized.uiHighScoreTables) ? normalized.uiHighScoreTables : []);
    // Audio engine state — preserve as-is (opaque JSON string)
    normalized.audioEngine = (typeof source.audioEngine === 'string' && source.audioEngine) ? source.audioEngine : (normalized.audioEngine || null);
    // Camera preview panel state
    normalized.cameraPreview = (source.cameraPreview && typeof source.cameraPreview === 'object')
      ? {
          selectedCameraId: source.cameraPreview.selectedCameraId || null,
          overlays: Object.assign(
            { showFrame: true, showDeadZone: true, showLookAhead: true, showBounds: true, showLabels: true, showZones: true, showPaths: true },
            (typeof source.cameraPreview.overlays === 'object' && source.cameraPreview.overlays) || {}
          ),
        }
      : { selectedCameraId: null, overlays: { showFrame: true, showDeadZone: true, showLookAhead: true, showBounds: true, showLabels: true, showZones: true, showPaths: true } };
    return normalized;
  }


  window.RokuNodes = {
    BaseNodeDefaults,
    NodeDefaultProperties,
    NodeRegistry,
    ComponentRegistry,
    getNodeDef,
    getCreatableNodeTypes,
    isUiNodeType,
    isWorldNodeType,
    createDefaultNode,
    getComponentDef,
    getCreatableComponentTypes,
    createDefaultComponent,
    normalizeComponents,
    getNodeFields,
    getNodeFieldsBySection,
    canParentNode,
    getValueByPath,
    setValueByPath,
    normalizeScene,
    normalizeEditorState,
    parseSceneJson,
    validateSceneDocument,
    isSupportedSceneFormatVersion,
    inferSceneFormatVersion,
    migrateSceneDocument,
    generateNodeId,
    ROOT_NODE_ID,
    resolveCTGLegacyTargetNames
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
