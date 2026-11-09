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
      // ── Shape ────────────────────────────────────────────────────────────
      width:           512,
      height:          288,
      opacity:         0.15,
      tint:            '#4caf50',
      // ── Zone behaviour ───────────────────────────────────────────────────
      enabled:         true,
      mode:            'Normal',
      priority:        0,
      blendTime:       0.5,
      // ── Camera overrides (null = use camera default) ──────────────────────
      zoom:            1.0,
      offsetX:         0,
      offsetY:         0,
      followLerp:      null,
      // ── Reference overrides (empty string = none) ─────────────────────────
      boundsOverride:       '',
      targetGroupOverride:  '',
      pathOverride:         '',
      // ── Events ───────────────────────────────────────────────────────────
      eventsEnabled:   true,
      // ── Debug / editor ───────────────────────────────────────────────────
      showGizmo:       true,
      showDebug:       true,
    },
    CameraBounds2D: {
      width:1024,height:768,opacity:0.1,tint:'#2196f3',
      clampPosition:true,clampZoom:true,showBounds:true
    },
    CameraPath2D: {
      closedPath:false,loop:false,duration:2,autoPlay:false,
      speed:200,interpolation:'Linear',
      points:[{x:0,y:0}]
    },
    // ── CameraTargetGroup ─────────────────────────────────────────────────────
    // AUTHORITATIVE SOURCE: src/schema/nodes.js  NodeDefaults.CameraTargetGroup
    // Keep these two in sync. The migration in schema/nodes.js automatically
    // upgrades older scenes that still use the legacy flat `padding` field.
    CameraTargetGroup: {
      targets:        [],
      autoTrack:      true,
      minZoom:        0.5,
      maxZoom:        3.0,
      paddingLeft:    64,
      paddingRight:   64,
      paddingTop:     64,
      paddingBottom:  64,
      smoothing:      0.15,
      enableAutoZoom: true,
      showDebug:      true,
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
      followViewport: true
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
      focusMode: 'none'
    },
    HBoxContainer: {
      width: 320, height: 64, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      separation: 4, alignment: 'begin',
    },
    VBoxContainer: {
      width: 120, height: 320, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      separation: 4, alignment: 'begin',
    },
    MarginContainer: {
      width: 280, height: 180, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      paddingLeft: 8, paddingTop: 8, paddingRight: 8, paddingBottom: 8,
    },
    ScrollContainer: {
      width: 320, height: 240, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      scrollHorizontal: 'auto', scrollVertical: 'auto',
      scrollOffsetX: 0, scrollOffsetY: 0,
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
      disabled: false, focusMode: 'all', action: 'action'
    },
    CircleButton: {
      width: 80, height: 80, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: '', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', action: 'action'
    },
    TriangleButton: {
      width: 80, height: 80, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: '', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', action: 'action'
    },
    OvalButton: {
      width: 160, height: 56, opacity: 1,
      anchorLeft: 0, anchorTop: 0, anchorRight: 0, anchorBottom: 0,
      marginLeft: 0, marginTop: 0, marginRight: 0, marginBottom: 0,
      text: 'Button', normalColor: '#375a7f', focusedColor: '#5b8def',
      pressedColor: '#8ab4ff', textColor: '#ffffff', disabledColor: '#4b5563',
      disabled: false, focusMode: 'all', action: 'action'
    }
  };



  const ComponentRegistry = {
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
      description: 'Adds box solid physics and selectable box or circle trigger contacts.',
      defaults: { enabled: true, priority: 150, width: 32, height: 32, offsetX: 0, offsetY: 0, isTrigger: false, contactMethod: 'project', circleRadius: 0, layer: 'default', mask: 'default', debug: false }
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
      description: 'References a Roku script file for future runtime hooks.',
      defaults: { enabled: true, priority: 300, scriptPath: '', entryPoint: 'Update', exposeNode: true }
    },
    AudioSourceComponent: {
      type: 'AudioSourceComponent',
      displayName: 'AudioSource',
      description: 'Stores audio playback settings for a node.',
      defaults: { enabled: true, priority: 400, resourcePath: '', autoplay: false, loop: false, volume: 100, playOnInput: false, triggerButton: 6, triggerAction: 'action' }
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
      defaults: { enabled: true, priority: 350, animation: '', autoplay: true, playing: true, speedScale: 1, triggerAction: 'action' }
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
        { key: 'transform.rotation', label: 'Rotation', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.scaleX', label: 'Scale X', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.scaleY', label: 'Scale Y', type: 'number', step: 0.01, section: 'Transform' },
        { key: 'transform.pivotPreset', label: 'Pivot Preset', type: 'pivot_preset', section: 'Transform' },
        { key: 'transform.pivotX', label: 'Pivot X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.pivotY', label: 'Pivot Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.tilesetId', label: 'Assigned TileSet', type: 'select', options: [], section: 'TileMap' },
        { key: 'properties.mapWidth', label: 'Map Width', type: 'number', min: 1, step: 1, section: 'TileMap' },
        { key: 'properties.mapHeight', label: 'Map Height', type: 'number', min: 1, step: 1, section: 'TileMap' },
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
        { key: 'properties.cameraPreset', label: 'Camera Preset', type: 'select', options: ['Side Scroller','Metroidvania','Top Down Adventure','Twin Stick Shooter','RPG/JRPG','RTS','Fighting Game','Shmup','Pixel Perfect','Cinematic','Multi Target'], section: 'Camera' },
        { key: 'properties.lookAheadX', label: 'Look Ahead X', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.lookAheadY', label: 'Look Ahead Y', type: 'number', step: 1, section: 'Camera' },
        { key: 'properties.smoothFollow', label: 'Smooth Follow', type: 'boolean', section: 'Camera' },
        { key: 'properties.cameraBounds', label: 'Use Camera Bounds', type: 'boolean', section: 'Camera' },
        { key: 'properties.dynamicZoom', label: 'Dynamic Zoom', type: 'boolean', section: 'Camera' },
        { key: 'properties.screenShake', label: 'Enable Screen Shake', type: 'boolean', section: 'Camera' },
        { key: 'properties.zoomMin', label: 'Min Zoom', type: 'number', section: 'Camera' },
        { key: 'properties.zoomMax', label: 'Max Zoom', type: 'number', section: 'Camera' },
        { key: 'properties.roomLock', label: 'Room Lock', type: 'boolean', section: 'Camera' },
        { key: 'properties.combatZoom', label: 'Combat Zoom', type: 'number', section: 'Camera' }
      ]
    },
    CanvasLayer: {
      type: 'CanvasLayer',
      displayName: 'CanvasLayer',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 1280, height: 720 },
      inspectorSections: ['Node', 'Transform', 'UI Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.layer', label: 'Layer', type: 'number', step: 1, section: 'UI Layout' },
        { key: 'properties.followViewport', label: 'Follow Viewport', type: 'boolean', section: 'UI Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'UI Layout' }
      ]
    },
    Control: {
      type: 'Control',
      displayName: 'Control',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 240, height: 64 },
      inspectorSections: ['Node', 'Transform', 'UI Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'UI Layout' },
        { key: 'properties.focusMode', label: 'Focus Mode', type: 'select', options: ['none', 'click', 'all'], section: 'UI Layout' },
        { key: 'properties.clipContent', label: 'Clip Content', type: 'boolean', section: 'UI Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'UI Layout' }
      ]
    },
    Label: {
      type: 'Label',
      displayName: 'Label',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 240, height: 36 },
      inspectorSections: ['Node', 'Transform', 'Text', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Text' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Text' },
        { key: 'properties.text', label: 'Text', type: 'string', section: 'Text' },
        { key: 'properties.fontSize', label: 'Font Size', type: 'number', min: 8, step: 1, section: 'Text' },
        { key: 'properties.textColor', label: 'Text Color', type: 'color', section: 'Text' },
        { key: 'properties.align', label: 'Align', type: 'select', options: ['left', 'center', 'right'], section: 'Text' },
        { key: 'properties.valign', label: 'Vertical Align', type: 'select', options: ['top', 'center', 'bottom'], section: 'Text' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Text' }
      ]
    },
    Panel: {
      type: 'Panel',
      displayName: 'Panel',
      category: 'UI',
      canHaveChildren: true,
      creatable: true,
      defaultSize: { width: 280, height: 120 },
      inspectorSections: ['Node', 'Transform', 'Appearance', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Appearance' },
        { key: 'properties.color', label: 'Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderColor', label: 'Border Color', type: 'color', section: 'Appearance' },
        { key: 'properties.borderWidth', label: 'Border Width', type: 'number', min: 0, step: 1, section: 'Appearance' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Appearance' }
      ]
    },
    TextureRect: {
      type: 'TextureRect',
      displayName: 'TextureRect',
      category: 'UI',
      canHaveChildren: false,
      creatable: true,
      defaultSize: { width: 160, height: 90 },
      inspectorSections: ['Node', 'Transform', 'Appearance', 'Sprite', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
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
      inspectorSections: ['Node', 'Transform', 'Text', 'Button', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
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
        { key: 'properties.action', label: 'Action', type: 'string', section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' }
      ]
    },
    CircleButton: {
      type: 'CircleButton', displayName: 'CircleButton', category: 'UI',
      canHaveChildren: false, creatable: true, defaultSize: { width: 80, height: 80 },
      inspectorSections: ['Node', 'Transform', 'Text', 'Button', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
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
        { key: 'properties.action', label: 'Action', type: 'string', section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' }
      ]
    },
    TriangleButton: {
      type: 'TriangleButton', displayName: 'TriangleButton', category: 'UI',
      canHaveChildren: false, creatable: true, defaultSize: { width: 80, height: 80 },
      inspectorSections: ['Node', 'Transform', 'Text', 'Button', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
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
        { key: 'properties.action', label: 'Action', type: 'string', section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' }
      ]
    },
    OvalButton: {
      type: 'OvalButton', displayName: 'OvalButton', category: 'UI',
      canHaveChildren: false, creatable: true, defaultSize: { width: 160, height: 56 },
      inspectorSections: ['Node', 'Transform', 'Text', 'Button', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
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
        { key: 'properties.action', label: 'Action', type: 'string', section: 'Button' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Button' }
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
    },
    HBoxContainer: {
      type: 'HBoxContainer', displayName: 'HBoxContainer', category: 'UI',
      canHaveChildren: true, creatable: true, defaultSize: { width: 320, height: 64 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft', label: 'Anchor Left', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop', label: 'Anchor Top', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight', label: 'Anchor Right', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft', label: 'Margin Left', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop', label: 'Margin Top', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight', label: 'Margin Right', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.separation', label: 'Separation', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.alignment', label: 'Alignment', type: 'select', options: ['begin', 'center', 'end'], section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    VBoxContainer: {
      type: 'VBoxContainer', displayName: 'VBoxContainer', category: 'UI',
      canHaveChildren: true, creatable: true, defaultSize: { width: 120, height: 320 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft', label: 'Anchor Left', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop', label: 'Anchor Top', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight', label: 'Anchor Right', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft', label: 'Margin Left', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop', label: 'Margin Top', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight', label: 'Margin Right', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.separation', label: 'Separation', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.alignment', label: 'Alignment', type: 'select', options: ['begin', 'center', 'end'], section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    MarginContainer: {
      type: 'MarginContainer', displayName: 'MarginContainer', category: 'UI',
      canHaveChildren: true, creatable: true, defaultSize: { width: 280, height: 180 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Layout', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft', label: 'Anchor Left', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop', label: 'Anchor Top', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight', label: 'Anchor Right', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft', label: 'Margin Left', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop', label: 'Margin Top', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight', label: 'Margin Right', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Layout' },
        { key: 'properties.paddingLeft', label: 'Padding Left', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingTop', label: 'Padding Top', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingRight', label: 'Padding Right', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.paddingBottom', label: 'Padding Bottom', type: 'number', min: 0, step: 1, section: 'Layout' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Layout' }
      ]
    },
    ScrollContainer: {
      type: 'ScrollContainer', displayName: 'ScrollContainer', category: 'UI',
      canHaveChildren: true, creatable: true, defaultSize: { width: 320, height: 240 },
      inspectorSections: ['Node', 'Transform', 'Anchors & Margins', 'Scroll', 'Metadata'],
      fields: [
        { key: 'name', label: 'Name', type: 'string', section: 'Node' },
        { key: 'visible', label: 'Visible', type: 'boolean', section: 'Node' },
        { key: 'transform.x', label: 'X', type: 'number', step: 1, section: 'Transform' },
        { key: 'transform.y', label: 'Y', type: 'number', step: 1, section: 'Transform' },
        { key: 'properties.anchorPreset', label: 'Anchor Preset', type: 'anchor_preset', section: 'Anchors & Margins' },
        { key: 'properties.anchorLeft', label: 'Anchor Left', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorTop', label: 'Anchor Top', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorRight', label: 'Anchor Right', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.anchorBottom', label: 'Anchor Bottom', type: 'number', min: 0, max: 1, step: 0.01, section: 'Anchors & Margins' },
        { key: 'properties.marginLeft', label: 'Margin Left', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginTop', label: 'Margin Top', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginRight', label: 'Margin Right', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.marginBottom', label: 'Margin Bottom', type: 'number', step: 1, section: 'Anchors & Margins' },
        { key: 'properties.width', label: 'Width', type: 'number', min: 1, step: 1, section: 'Scroll' },
        { key: 'properties.height', label: 'Height', type: 'number', min: 1, step: 1, section: 'Scroll' },
        { key: 'properties.scrollHorizontal', label: 'Horizontal Scroll', type: 'select', options: ['auto', 'always', 'never'], section: 'Scroll' },
        { key: 'properties.scrollVertical', label: 'Vertical Scroll', type: 'select', options: ['auto', 'always', 'never'], section: 'Scroll' },
        { key: 'properties.scrollOffsetX', label: 'Scroll Offset X', type: 'number', step: 1, section: 'Scroll' },
        { key: 'properties.scrollOffsetY', label: 'Scroll Offset Y', type: 'number', step: 1, section: 'Scroll' },
        { key: 'properties.opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, section: 'Scroll' }
      ]
    }
  };

  function getNodeDef(type) {
    return NodeRegistry[type] || null;
  }

  function getCreatableNodeTypes() {
    return Object.values(NodeRegistry).filter((def) => def.creatable);
  }
  function isUiNodeType(type) {
    return ['CanvasLayer', 'Control', 'Label', 'Panel', 'TextureRect', 'Button', 'HBoxContainer', 'VBoxContainer', 'MarginContainer', 'ScrollContainer', 'CircleButton', 'TriangleButton', 'OvalButton'].includes(type);
  }

  function isWorldNodeType(type) {
    return !isUiNodeType(type) && type !== 'SceneRoot';
  }


  function getDefaultPivotForNode(type, properties = {}) {
    if (type === 'SceneRoot') {
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
    return (getNodeDef(type)?.fields || []).slice();
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
    ROOT_NODE_ID
  };
})();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
