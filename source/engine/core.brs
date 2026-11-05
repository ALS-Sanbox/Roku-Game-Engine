' core.brs - generated classic 2D runtime

function RokuEngine_Create(initialSceneName as String) as Object
  screen = CreateObject("roScreen", true)
  if screen = invalid then screen = CreateObject("roScreen")
  if screen = invalid then return invalid

  port = CreateObject("roMessagePort")
  screen.SetPort(port)
  screen.SetAlphaEnable(true)

  compositor = CreateObject("roCompositor")
  compositor.SetDrawTo(screen, 0)

  engine = {
    screen: screen
    port: port
    compositor: compositor
    initialSceneName: initialSceneName
    scene: invalid
    inputState: { rawEvents: [], frameEvents: [], pressedActions: {}, releasedActions: {}, heldActions: {} }
    pendingInputEvents: []
    lastColliderList: []
    running: true
    clearColor: &h101820FF
    frameClock: CreateObject("roTimespan")
    phaseClock: CreateObject("roTimespan")
    collisionSystem: invalid
    projectSettings: invalid
    resources: invalid
    inputActionMap: {}
    sceneStack: []
    namedNodeMap: {}
    transformVersionCounter: 0
    collisionPairsPrevious: {}
    collisionPairsCurrent: {}
    activeCameraNodeId: ""
    width: screen.GetWidth()
    height: screen.GetHeight()
    compositorSprites: {}
    compositorTickMs: 0
    fixedDt: 1.0 / 60.0
    maxFrameDt: 0.25
    maxSubsteps: 4
    accumulator: 0.0
    frameNumber: 0
    stats: {
      rawDt: 0.0
      scaledDt: 0.0
      frameMs: 0.0
      updateMs: 0.0
      physicsMs: 0.0
      renderMs: 0.0
      messagePumpMs: 0.0
      inputMs: 0.0
      audioMs: 0.0
      fixedSteps: 0
      fps: 0.0
      fpsSmoothed: 0.0
      droppedPhysicsSteps: 0
      inputEventCount: 0
      collisionCount: 0
      spriteCount: 0
    }
    Run: RokuEngine_Run
    RunFrame: RokuEngine_RunFrame
    BeginFrameTiming: RokuEngine_BeginFrameTiming
    EndPhaseTiming: RokuEngine_EndPhaseTiming
    ResetSceneFrameStats: RokuEngine_ResetSceneFrameStats
    CreateEmptyPhaseLists: RokuEngine_CreateEmptyPhaseLists
    MarkPhaseCachesDirty: RokuEngine_MarkPhaseCachesDirty
    EnsurePhaseCaches: RokuEngine_EnsurePhaseCaches
    RebuildPhaseCaches: RokuEngine_RebuildPhaseCaches
    BuildTraversalNodeIds: RokuEngine_BuildTraversalNodeIds
    CreateComponentRegistry: RokuEngine_CreateComponentRegistry
    RegisterBuiltinComponents: RokuEngine_RegisterBuiltinComponents
    RegisterComponentDefinition: RokuEngine_RegisterComponentDefinition
    GetComponentDefinition: RokuEngine_GetComponentDefinition
    GetComponentPhaseMetadata: RokuEngine_GetComponentPhaseMetadata
    ResolveComponentPriority: RokuEngine_ResolveComponentPriority
    AddComponentPhaseEntry: RokuEngine_AddComponentPhaseEntry
    SortPhaseEntries: RokuEngine_SortPhaseEntries
    RunComponentPhase: RokuEngine_RunComponentPhase
    DispatchComponentPhaseEntry: RokuEngine_DispatchComponentPhaseEntry
    EnsureScriptReady: RokuEngine_EnsureScriptReady
    PumpPlatformMessages: RokuEngine_PumpPlatformMessages
    ProcessMessages: RokuEngine_ProcessMessages
    StageInputEvents: RokuEngine_StageInputEvents
    ProcessInputPhase: RokuEngine_ProcessInputPhase
    RunPreUpdatePhase: RokuEngine_RunPreUpdatePhase
    RunFixedStepLoop: RokuEngine_RunFixedStepLoop
    RunFixedStep: RokuEngine_RunFixedStep
    RunVariableUpdatePhase: RokuEngine_RunVariableUpdatePhase
    RunLateUpdatePhase: RokuEngine_RunLateUpdatePhase
    FinalizeCollisionPhase: RokuEngine_FinalizeCollisionPhase
    SyncRenderState: RokuEngine_SyncRenderState
    ApplyPendingSceneChange: RokuEngine_ApplyPendingSceneChange
    QueueSceneChange: RokuEngine_QueueSceneChange
    SetPaused: RokuEngine_SetPaused
    SetPhysicsPaused: RokuEngine_SetPhysicsPaused
    SetTimeScale: RokuEngine_SetTimeScale
    LoadScene: RokuEngine_LoadScene
    Update: RokuEngine_Update
    UpdateComponents: RokuEngine_UpdateComponents
    ProcessNodeComponents: RokuEngine_ProcessNodeComponents
    ProcessComponentPhaseEntry: RokuEngine_ProcessComponentPhaseEntry
    InvokeComponentPhase: RokuEngine_InvokeComponentPhase
    UpdateMovementComponents: RokuEngine_UpdateMovementComponents
    UpdatePhysicsComponents: RokuEngine_UpdatePhysicsComponents
    UpdateInputComponents: RokuEngine_UpdateInputComponents
    UpdateAnimationComponents: RokuEngine_UpdateAnimationComponents
    RunCollisionPass: RokuEngine_RunCollisionPass
    RunScriptHooks: RokuEngine_RunScriptHooks
    UpdateAudioComponents: RokuEngine_UpdateAudioComponents
    Render: RokuEngine_Render
    MarkUIDirty: RokuEngine_MarkUIDirty
    MarkUIClean: RokuEngine_MarkUIClean
    GetRenderTraversalNodeIds: RokuEngine_GetRenderTraversalNodeIds
    RenderPassWorldSprites: RokuEngine_RenderPassWorldSprites
    RenderPassTileMaps: RokuEngine_RenderPassTileMaps
    RenderPassWorldDebug: RokuEngine_RenderPassWorldDebug
    RenderPassUI: RokuEngine_RenderPassUI
    RenderPassOverlay: RokuEngine_RenderPassOverlay
    RenderUiPass: RokuEngine_RenderUiPass
    RenderUiNode: RokuEngine_RenderUiNode
    DrawUiText: RokuEngine_DrawUiText
    DrawUiTextAligned: RokuEngine_DrawUiTextAligned
    RenderDebugNode: RokuEngine_RenderDebugNode
    HandleInputEvent: RokuEngine_HandleInputEvent
    HandleButtonCode: RokuEngine_HandleButtonCode
    InitializeUiRuntime: RokuEngine_InitializeUiRuntime
    RebuildUiRuntime: RokuEngine_RebuildUiRuntime
    GetUiTraversalNodeIds: RokuEngine_GetUiTraversalNodeIds
    BuildUiTraversalNodeIds: RokuEngine_BuildUiTraversalNodeIds
    GetNodeScreenTransform: RokuEngine_GetNodeScreenTransform
    IsUiNodeType: RokuEngine_IsUiNodeType
    IsWorldNodeType: RokuEngine_IsWorldNodeType
    InitializeFocusManager: RokuEngine_InitializeFocusManager
    RebuildFocusables: RokuEngine_RebuildFocusables
    GetFocusedNodeId: RokuEngine_GetFocusedNodeId
    GetFocusedNode: RokuEngine_GetFocusedNode
    SetFocusedNode: RokuEngine_SetFocusedNode
    MoveFocus: RokuEngine_MoveFocus
    MoveFocusDirection: RokuEngine_MoveFocusDirection
    HandleFocusInput: RokuEngine_HandleFocusInput
    UpdateFocusState: RokuEngine_UpdateFocusState
    IsNodeFocusable: RokuEngine_IsNodeFocusable
    HandleComponentInput: RokuEngine_HandleComponentInput
    GetResourceManifest: RokuEngine_GetResourceManifest
    ' ── Screen manager ───────────────────────────────────────────────────
    InitializeScreenManager: RokuEngine_InitializeScreenManager
    LoadScreensFromManifest: RokuEngine_LoadScreensFromManifest
    ShowStartupScreen: RokuEngine_ShowStartupScreen
    SetFocusToScreen: RokuEngine_SetFocusToScreen
    ChangeScreen: RGE_UI_ChangeScreen
    PushScreen: RGE_UI_PushScreen
    PopScreen: RGE_UI_PopScreen
    ShowScreen: RGE_UI_ShowScreen
    HideScreen: RGE_UI_HideScreen
    GetCurrentScreen: RGE_UI_GetCurrentScreen
    IsScreenVisible: RGE_UI_IsScreenVisible
    ' ── Transition manager ────────────────────────────────────────────────
    InitializeTransitionManager: RokuEngine_InitializeTransitionManager
    UpdateTransition: RokuEngine_UpdateTransition
    RenderTransitionOverlay: RokuEngine_RenderTransitionOverlay
    StartTransition: RGE_UI_StartTransition
    IsTransitionActive: RGE_UI_IsTransitionActive
    TransitionToScreen: RGE_UI_TransitionToScreen
    TransitionToScene: RGE_UI_TransitionToScene
    SetLoadProgress: RGE_UI_SetLoadProgress
    MarkLoadComplete: RGE_UI_MarkLoadComplete
    IsInputBlocked: RGE_UI_IsInputBlocked
    ' ── Storage ──────────────────────────────────────────────────────────
    InitializeStorage: RokuEngine_InitializeStorage
    Storage_Save: RGE_Storage_Save
    Storage_Load: RGE_Storage_Load
    Storage_LoadFloat: RGE_Storage_LoadFloat
    Storage_LoadInt: RGE_Storage_LoadInt
    Storage_LoadBool: RGE_Storage_LoadBool
    Storage_Delete: RGE_Storage_Delete
    Storage_ClearNamespace: RGE_Storage_ClearNamespace
    Storage_Exists: RGE_Storage_Exists
    Storage_ListKeys: RGE_Storage_ListKeys
    ' ── Options ──────────────────────────────────────────────────────────
    InitializeOptions: RokuEngine_InitializeOptions
    Options_Get: RGE_Options_Get
    Options_GetFloat: RGE_Options_GetFloat
    Options_GetInt: RGE_Options_GetInt
    Options_GetBool: RGE_Options_GetBool
    Options_Set: RGE_Options_Set
    Options_Reset: RGE_Options_Reset
    Options_ResetAll: RGE_Options_ResetAll
    Options_Cycle: RGE_Options_Cycle
    Options_GetDisplayText: RGE_Options_GetDisplayText
    UpdateOptionBindings: RokuEngine_UpdateOptionBindings
    ' ── High Scores ──────────────────────────────────────────────────────
    InitializeHighScores: RokuEngine_InitializeHighScores
    HighScores_Add: RGE_HighScores_Add
    HighScores_GetEntries: RGE_HighScores_GetEntries
    HighScores_Clear: RGE_HighScores_Clear
    HighScores_IsHighScore: RGE_HighScores_IsHighScore
    HighScores_GetRowText: RGE_HighScores_GetRowText
    UpdateHighScoreBindings: RokuEngine_UpdateHighScoreBindings
    UpdateUiBindings: RokuEngine_UpdateUiBindings
    HandleAudioEvent: RokuEngine_HandleAudioEvent
    DrawNodeTree: RokuEngine_DrawNodeTree
    DrawNode: RokuEngine_DrawNode
    DrawNodeShapes: RokuEngine_DrawNodeShapes
    SyncCompositorSprites: RokuEngine_SyncCompositorSprites
    SyncNodeSprite: RokuEngine_SyncNodeSprite
    EnsureSpriteNodeRuntime: RokuEngine_EnsureSpriteNodeRuntime
    RemoveNodeCompositorSprite: RokuEngine_RemoveNodeCompositorSprite
    RemoveAllCompositorSprites: RokuEngine_RemoveAllCompositorSprites
    ApplySpriteTransform: RokuEngine_ApplySpriteTransform
    ComputeSpriteScale: RokuEngine_ComputeSpriteScale
    CreateIdentityTransform: RokuEngine_CreateIdentityTransform
    EnsureTransformRuntime: RokuEngine_EnsureTransformRuntime
    MarkNodeTransformDirty: RokuEngine_MarkNodeTransformDirty
    MarkSubtreeDirty: RokuEngine_MarkSubtreeDirty
    UpdateWorldTransforms: RokuEngine_UpdateWorldTransforms
    GetWorldTransform: RokuEngine_GetWorldTransform
    GetLocalTransform: RokuEngine_GetLocalTransform
    CreateResourceManager: RokuEngine_CreateResourceManager
    ComputeWorldTransform: RokuEngine_ComputeWorldTransform
    BuildNodeMap: RokuEngine_BuildNodeMap
    LoadSceneAsset: RokuEngine_LoadSceneAsset
    LoadImageAsset: RokuEngine_LoadImageAsset
    LoadSpriteSheetTile: RokuEngine_LoadSpriteSheetTile
    ParseTileAssetPath: RokuEngine_ParseTileAssetPath
    FindSpriteSheetByResourcePath: RokuEngine_FindSpriteSheetByResourcePath
    BuildAnimationFrames: RokuEngine_BuildAnimationFrames
    ComputeAnimationFrameIndex: RokuEngine_ComputeAnimationFrameIndex
    DrawDebugText: RokuEngine_DrawDebugText
    RootNodeIds: RokuEngine_RootNodeIds
    ChangeScene: RokuEngine_ChangeScene
    ReloadScene: RokuEngine_ReloadScene
    PushScene: RokuEngine_PushScene
    PopScene: RokuEngine_PopScene
    RefreshSceneCaches: RokuEngine_RefreshSceneCaches
    BuildChildrenMap: RokuEngine_BuildChildrenMap
    BuildNamedNodeMap: RokuEngine_BuildNamedNodeMap
    FindNodeByName: RokuEngine_FindNodeByName
    UpdateActiveCameraNode: RokuEngine_UpdateActiveCameraNode
    ApplyCameraFollow: RokuEngine_ApplyCameraFollow
    ShakeCamera: RokuEngine_ShakeCamera
    EnsureNodeRuntime: RokuEngine_EnsureNodeRuntime
    GetNodeCollider: RokuEngine_GetNodeCollider
    BuildColliderList: RokuEngine_BuildColliderList
    ApplyRigidBodyMotion: RokuEngine_ApplyRigidBodyMotion
    ResolveRigidBodyCollisions: RokuEngine_ResolveRigidBodyCollisions
    OverlapsCollider: RokuEngine_OverlapsCollider
    ProcessCollisions: RokuEngine_ProcessCollisions
    PlayNodeAudio: RokuEngine_PlayNodeAudio
    ControlAudio: RokuEngine_ControlAudio
    InvokeScriptComponent: RokuEngine_InvokeScriptComponent
    InvokeNodeScripts: RokuEngine_InvokeNodeScripts
    GetActionForButtonCode: RokuEngine_GetActionForButtonCode
    SpawnNode: RokuEngine_SpawnNode
    DestroyNode: RokuEngine_DestroyNode
    GenerateId: RokuEngine_GenerateId
    PoolAcquire: RokuEngine_PoolAcquire
    PoolRelease: RokuEngine_PoolRelease
    PoolReleaseAll: RokuEngine_PoolReleaseAll
    PoolReleaseAllPools: RokuEngine_PoolReleaseAllPools
    PoolActiveCount: RokuEngine_PoolActiveCount
    PoolGetActive: RokuEngine_PoolGetActive
  }

  RokuEngine_BindRuntimeMethods(engine)
  engine.componentRegistry = engine.CreateComponentRegistry()
  engine.RegisterBuiltinComponents(engine.componentRegistry)
  engine.resources = engine.CreateResourceManager(engine)
  engine.resources.LoadManifest()
  engine.collisionSystem = RokuEngine_CreateCollisionSystem(engine)
  engine.projectSettings = engine.resources.GetJsonDocument("pkg:/assets/project_settings.json")
  engine.inputActionMap = engine.RokuEngine_NormalizeActionMap(invalid)
  engine.InitializeUiRuntime()
  engine.InitializeFocusManager()
  engine.InitializeTransitionManager()
  engine.InitializeStorage()
  return engine
end function

sub RokuEngine_Run()
  m.scene = m.LoadScene(m.initialSceneName)
  if m.scene = invalid then return
  print "RokuEngine: loaded scene "; m.initialSceneName

  m.frameClock.Mark()
  while m.running
    msg = wait(1, m.port)
    m.ProcessMessages(msg)

    dtMs = m.frameClock.TotalMilliseconds()
    m.frameClock.Mark()
    rawDt = dtMs / 1000.0
    if rawDt < 0 then rawDt = 0.0

    m.RunFrame(rawDt)
  end while
  if m.audioStreamPlayer <> invalid then m.audioStreamPlayer.Stop()
end sub

sub RokuEngine_RunFrame(rawDt as Float)
  if m.scene = invalid then return

  m.BeginFrameTiming(rawDt)
  m.PumpPlatformMessages()
  m.EndPhaseTiming("messagePumpMs")

  m.ResetSceneFrameStats()

  m.StageInputEvents()
  m.EndPhaseTiming("inputMs")

  m.ApplyPendingSceneChange()
  if m.scene = invalid then return

  m.phaseClock.Mark()
  m.RunPreUpdatePhase()
  preUpdateMs = m.phaseClock.TotalMilliseconds()

  m.phaseClock.Mark()
  m.RunFixedStepLoop()
  m.stats.physicsMs = m.phaseClock.TotalMilliseconds()

  m.phaseClock.Mark()
  m.RunVariableUpdatePhase()
  m.RunLateUpdatePhase()
  m.FinalizeCollisionPhase()
  m.stats.updateMs = preUpdateMs + m.phaseClock.TotalMilliseconds()

  m.phaseClock.Mark()
  m.UpdateAudioComponents()
  m.stats.audioMs = m.phaseClock.TotalMilliseconds()

  m.ApplyPendingSceneChange()
  if m.scene = invalid then return

  m.phaseClock.Mark()
  m.SyncRenderState()
  m.Render()
end sub

sub RokuEngine_BeginFrameTiming(rawDt as Float)
  if rawDt < 0 then rawDt = 0.0
  if rawDt > m.maxFrameDt then rawDt = m.maxFrameDt

  scaledDt = rawDt
  if m.scene <> invalid then
    timeScale = m.scene.timeScale
    if timeScale = invalid then timeScale = 1.0
    if timeScale < 0 then timeScale = 0.0
    scaledDt = rawDt * timeScale
    if m.scene.paused = true then scaledDt = 0.0
  end if

  stats = m.stats
  stats.rawDt = rawDt
  stats.scaledDt = scaledDt
  stats.fixedSteps = 0
  stats.droppedPhysicsSteps = 0
  stats.updateMs = 0.0
  stats.physicsMs = 0.0
  stats.renderMs = 0.0
  stats.messagePumpMs = 0.0
  stats.inputMs = 0.0
  stats.audioMs = 0.0
  stats.inputEventCount = 0
  stats.collisionCount = 0
  stats.spriteCount = 0

  if rawDt > 0 then
    fpsNow = 1.0 / rawDt
    if stats.fpsSmoothed = invalid or stats.fpsSmoothed <= 0 then
      stats.fpsSmoothed = fpsNow
    else
      stats.fpsSmoothed = (stats.fpsSmoothed * 0.9) + (fpsNow * 0.1)
    end if
    stats.fps = stats.fpsSmoothed
  else
    stats.fps = 0.0
  end if

  m.frameNumber = m.frameNumber + 1
  m.phaseClock.Mark()
end sub

sub RokuEngine_EndPhaseTiming(fieldName as String)
  elapsed = m.phaseClock.TotalMilliseconds()
  m.phaseClock.Mark()
  if fieldName <> invalid and fieldName <> "" and m.stats.DoesExist(fieldName) then
    m.stats[fieldName] = elapsed
  end if
end sub

sub RokuEngine_ResetSceneFrameStats()
  if m.scene = invalid then return
  if m.scene.debugStats = invalid then m.scene.debugStats = {}
  m.scene.debugStats.frameNumber = m.frameNumber
  m.scene.debugStats.rawDt = m.stats.rawDt
  m.scene.debugStats.scaledDt = m.stats.scaledDt
  m.scene.debugStats.lastDt = m.stats.scaledDt
  m.scene.debugStats.fixedDt = m.fixedDt
  m.scene.debugStats.fixedSteps = 0
  m.scene.debugStats.fps = m.stats.fps
  m.scene.debugStats.frameMs = 0.0
  m.scene.debugStats.updateMs = 0.0
  m.scene.debugStats.physicsMs = 0.0
  m.scene.debugStats.renderMs = 0.0
  m.scene.debugStats.messagePumpMs = 0.0
  m.scene.debugStats.audioMs = 0.0
  m.scene.debugStats.spriteCount = 0
  m.scene.debugStats.collisionPairCount = 0
  m.scene.debugStats.lastColliderCount = 0
  m.scene.debugStats.lastInputEventCount = 0
  m.scene.debugStats.droppedPhysicsSteps = 0
  m.scene.debugStats.accumulator = m.accumulator
end sub

function RokuEngine_EnsureNodeRuntime(node as Object) as Object
  if node = invalid then return {}
  m.EnsureTransformRuntime(m.scene)
  if m.scene <> invalid and m.scene.runtime <> invalid and m.scene.runtime.nodes <> invalid then
    if node.id <> invalid and node.id <> "" then
      if m.scene.runtime.nodes.DoesExist(node.id) <> true then m.scene.runtime.nodes[node.id] = {}
      return m.scene.runtime.nodes[node.id]
    end if
  end if
  if node.runtime = invalid then node.runtime = {}
  return node.runtime
end function

function RokuEngine_EnsureSpriteNodeRuntime(node as Object) as Object
  runtime = m.EnsureNodeRuntime(node)
  if runtime.spriteState = invalid then runtime.spriteState = {}
  return runtime.spriteState
end function

sub RokuEngine_RemoveNodeCompositorSprite(node as Object)
  if node = invalid then return
  runtime = m.EnsureNodeRuntime(node)
  spriteState = runtime.spriteState
  if spriteState <> invalid and spriteState.member <> invalid then
    spriteState.member.Remove()
  end if
  if spriteState <> invalid and spriteState.scaledBytes <> invalid and m.scaledSpriteBytes <> invalid then m.scaledSpriteBytes = m.scaledSpriteBytes - spriteState.scaledBytes
  runtime.spriteState = invalid
  if m.compositorSprites <> invalid and node.id <> invalid and m.compositorSprites.DoesExist(node.id) then
    m.compositorSprites.Delete(node.id)
  end if
end sub

sub RokuEngine_RemoveAllCompositorSprites()
  if m.compositorSprites = invalid then
    m.compositorSprites = {}
    return
  end if
  for each key in m.compositorSprites
    member = m.compositorSprites[key]
    if member <> invalid then member.Remove()
  end for
  m.compositorSprites = {}
  m.scaledSpriteBytes = 0
end sub

function RokuEngine_GetNodeCollider(node as Object) as Dynamic
  if m.collisionSystem = invalid then return invalid
  return m.collisionSystem.GetNodeCollider(node)
end function

function RokuEngine_OverlapsCollider(target as Object, colliders as Object, skipNodeId as String) as Dynamic
  if m.collisionSystem = invalid then return invalid
  return m.collisionSystem.FindOverlap(target, colliders, skipNodeId)
end function

sub RokuEngine_ApplyRigidBodyMotion(node as Object, component as Object, dt as Float)
  if m.collisionSystem = invalid then return
  m.collisionSystem.ApplyRigidBodyMotion(node, component, dt)
end sub

sub RokuEngine_ResolveRigidBodyCollisions(node as Object, component as Object, colliders as Object)
  if m.collisionSystem = invalid then return
  m.collisionSystem.ResolveRigidBodyCollisions(node, component, colliders)
end sub

sub RokuEngine_ProcessCollisions()
  if m.collisionSystem = invalid then return
  m.collisionSystem.Process()
end sub

sub RokuEngine_PlayNodeAudio(node as Object, component as Object)
  if node = invalid or component = invalid then return
  runtime = RokuAudio_GetRuntime(m,node,component)
  runtime.lastAudioFrame = m.frameNumber
  resourcePath = invalid
  if component.resourcePath <> invalid then resourcePath = component.resourcePath

  ' Look up clip settings from the audio manifest (set in Audio tab, single source of truth)
  loopEnabled = false
  volume = 100
  if m.resources <> invalid then
    audioMeta = invalid
    ' Try by audioId first, then by resourcePath
    if component.audioId <> invalid and component.audioId <> "" then
      audioMeta = m.resources.GetAudio(component.audioId)
    end if
    if audioMeta = invalid and resourcePath <> invalid then
      audioMeta = m.resources.GetAudioByPath(resourcePath)
    end if
    if audioMeta <> invalid then
      if audioMeta.path <> invalid and audioMeta.path <> "" then resourcePath = audioMeta.path
      if audioMeta.loop = true then loopEnabled = true
      if audioMeta.volume <> invalid then volume = Int(audioMeta.volume * 100)
      if audioMeta.nativePath <> invalid and audioMeta.nativePath <> "" then resourcePath = audioMeta.nativePath
      if volume < 0 then volume = 0
      if volume > 100 then volume = 100
    end if
  end if
  if resourcePath = invalid or resourcePath = "" then return

  configKey = resourcePath + "|" + LCase(RokuEngine_ToString(loopEnabled)) + "|" + StrI(volume)
  if runtime.audioConfigKey = configKey and runtime.audioReady = true and runtime.audioPlayer <> invalid then return

  if runtime.audioPlayer <> invalid then
    runtime.audioPlayer.Stop()
  end if

  pkgPath = resourcePath
  if Left(pkgPath, 6) = "res://" then pkgPath = "pkg:/" + Mid(pkgPath, 7)

  runtime.audioReady = false
  runtime.audioAutoplayStarted = false
  runtime.audioConfigKey = configKey
  runtime.audioClipPath = resourcePath
  runtime.audioLoop = loopEnabled
  runtime.audioVolume = volume

  oneShot = false
  if audioMeta <> invalid then oneShot = audioMeta.oneShot = true
  voiceId = node.id+"|"+_BRS_StrCoalesce(component.id,resourcePath)
  player = RokuAudio_CreateVoice(m,voiceId,pkgPath,loopEnabled,oneShot)
  if player <> invalid then player.nodeId = node.id
  if player = invalid then return
  runtime.audioPlayer = player
  runtime.audioReady = true
end sub

sub RokuEngine_HandleAudioEvent(msg as Object)
  if msg = invalid or m.scene = invalid then return
  if m.activeStreamNodeId = invalid or not m.scene.nodeMap.DoesExist(m.activeStreamNodeId) then return
  runtime = m.EnsureNodeRuntime(m.scene.nodeMap[m.activeStreamNodeId])
  runtime.audioEventReceived = true
  runtime.audioLastMessage = msg.GetMessage()
  runtime.audioFailed = msg.IsRequestFailed()
end sub

sub RokuEngine_SetPaused(isPaused as Boolean)
  if m.scene = invalid then return
  m.scene.paused = isPaused
end sub

sub RokuEngine_SetPhysicsPaused(isPaused as Boolean)
  if m.scene = invalid then return
  m.scene.physicsPaused = isPaused
end sub

sub RokuEngine_SetTimeScale(scale as Float)
  if m.scene = invalid then return
  if scale < 0 then scale = 0.0
  m.scene.timeScale = scale
end sub

sub RokuEngine_StageInputEvents()
  if m.inputState = invalid then m.inputState = { rawEvents: [], frameEvents: [], pressedActions: {}, releasedActions: {}, heldActions: {} }
  if m.inputState.rawEvents = invalid or type(m.inputState.rawEvents) <> "roArray" then m.inputState.rawEvents = []
  if m.inputState.frameEvents = invalid or type(m.inputState.frameEvents) <> "roArray" then m.inputState.frameEvents = []
  if m.inputState.pressedActions = invalid then m.inputState.pressedActions = {}
  if m.inputState.releasedActions = invalid then m.inputState.releasedActions = {}
  if m.inputState.heldActions = invalid then m.inputState.heldActions = {}

  m.inputState.pressedActions = {}
  m.inputState.releasedActions = {}
  staged = []
  for each evt in m.inputState.rawEvents
    if evt = invalid then continue for
    if evt.action <> invalid and evt.action <> "" then
      if evt.isRelease = true then
        m.inputState.releasedActions[evt.action] = true
        if m.inputState.heldActions.DoesExist(evt.action) then m.inputState.heldActions.Delete(evt.action)
      else
        m.inputState.pressedActions[evt.action] = true
        m.inputState.heldActions[evt.action] = true
      end if
    end if
    staged.Push(evt)
  end for
  m.inputState.frameEvents = staged
  m.pendingInputEvents = staged
  m.inputState.rawEvents = []

  if m.scene <> invalid and m.scene.debugStats <> invalid then
    m.scene.debugStats.lastInputEventCount = staged.Count()
  end if
  m.stats.inputEventCount = staged.Count()
end sub

sub RokuEngine_RunPreUpdatePhase()
  inputDt = m.stats.scaledDt
  if m.scene <> invalid and m.scene.paused = true and m.scene.uiUpdatesWhenPaused <> true then inputDt = 0.0
  if m.scene <> invalid and type(m.scene.doc.nodes) = "roArray" then
    for each node in m.scene.doc.nodes
      if node = invalid then continue for
      runtime = m.EnsureNodeRuntime(node)
      runtime.animationInputToggled = false
    end for
  end if
  m.EnsurePhaseCaches()
  ' Phase 7: advance transition state machine each frame
  m.UpdateTransition(m.stats.rawDt)
  m.UpdateFocusState()
  ' Focus state and transitions always mutate visible UI — mark dirty every frame.
  ' The render loop will clear the flag after the UI pass completes.
  m.MarkUIDirty()
  m.ProcessInputPhase(inputDt)
  m.RunComponentPhase("pre_update", inputDt, invalid)
end sub

sub RokuEngine_RunFixedStepLoop()
  if m.scene = invalid then return
  if m.scene.paused = true or m.scene.physicsPaused = true then
    m.accumulator = 0.0
    return
  end if

  m.accumulator = m.accumulator + m.stats.scaledDt
  steps = 0
  maxSubsteps = m.maxSubsteps
  if maxSubsteps <= 0 then maxSubsteps = 1

  while m.accumulator >= m.fixedDt and steps < maxSubsteps
    m.RunFixedStep(m.fixedDt)
    m.accumulator = m.accumulator - m.fixedDt
    steps = steps + 1
  end while

  if m.accumulator >= m.fixedDt then
    while m.accumulator >= m.fixedDt
      m.accumulator = m.accumulator - m.fixedDt
      m.stats.droppedPhysicsSteps = m.stats.droppedPhysicsSteps + 1
    end while
  end if

  m.stats.fixedSteps = steps
  if m.scene.debugStats <> invalid then
    m.scene.debugStats.fixedSteps = steps
    m.scene.debugStats.droppedPhysicsSteps = m.stats.droppedPhysicsSteps
    m.scene.debugStats.accumulator = m.accumulator
  end if
end sub

sub RokuEngine_RunFixedStep(dt as Float)
  if m.scene = invalid then return
  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    runtime = m.EnsureNodeRuntime(node)
    runtime.isColliding = false
  end for

  m.EnsurePhaseCaches()
  m.RunComponentPhase("fixed_update", dt, invalid)
  colliders = m.BuildColliderList()
  if m.scene.debugStats <> invalid and type(colliders) = "roArray" then
    m.scene.debugStats.lastColliderCount = colliders.Count()
  end if
  m.RunCollisionPass(dt)
end sub

sub RokuEngine_RunVariableUpdatePhase()
  if m.scene = invalid then return
  variableDt = m.stats.scaledDt
  if m.scene.paused = true and m.scene.uiUpdatesWhenPaused <> true then variableDt = 0.0

  m.EnsurePhaseCaches()
  m.RunComponentPhase("update", variableDt, invalid)
end sub

sub RokuEngine_RunLateUpdatePhase()
  if m.scene = invalid then return
  lateDt = m.stats.scaledDt
  if m.scene.paused = true and m.scene.uiUpdatesWhenPaused <> true then lateDt = 0.0
  m.EnsurePhaseCaches()
  m.RunComponentPhase("late_update", lateDt, invalid)
  m.ApplyCameraFollow(lateDt)
end sub

sub RokuEngine_FinalizeCollisionPhase()
  if m.scene = invalid then return
  m.EnsurePhaseCaches()
  m.RunComponentPhase("post_update", m.stats.scaledDt, invalid)
end sub

sub RokuEngine_SyncRenderState()
  if m.scene = invalid then return
  m.EnsurePhaseCaches()
  m.RunComponentPhase("render_sync", m.stats.scaledDt, invalid)
  m.UpdateFocusState()
  m.SyncCompositorSprites()
end sub


function RokuEngine_CreateEmptyPhaseLists() as Object
  return {
    input: []
    pre_update: []
    fixed_update: []
    update: []
    late_update: []
    post_update: []
    render_sync: []
    audio: []
  }
end function

sub RokuEngine_MarkPhaseCachesDirty()
  if m.scene = invalid then return
  m.scene.phaseCacheDirty = true
  m.scene.componentOrderVersion = m.scene.componentOrderVersion + 1
end sub

sub RokuEngine_EnsurePhaseCaches()
  if m.scene = invalid then return
  if m.scene.phaseLists = invalid then m.scene.phaseLists = m.CreateEmptyPhaseLists()
  if m.scene.phaseCacheDirty = true then m.RebuildPhaseCaches()
end sub

sub RokuEngine_RebuildPhaseCaches()
  if m.scene = invalid then return
  phaseLists = m.CreateEmptyPhaseLists()
  traversalIds = m.BuildTraversalNodeIds()
  nodeOrderMap = {}
  entryOrdinal = 0

  for i = 0 to traversalIds.Count() - 1
    nodeId = traversalIds[i]
    nodeOrderMap[nodeId] = i
    if m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      components = node.components
      if type(components) = "roArray" then
        for componentIndex = 0 to components.Count() - 1
          component = components[componentIndex]
          if component <> invalid and component.enabled <> false then
            metadata = m.GetComponentPhaseMetadata(component)
            if metadata <> invalid and type(metadata.phases) = "roArray" then
              nodeOrder = i
              for each phaseName in metadata.phases
                if phaseName = invalid or phaseName = "" then continue for
                priority = m.ResolveComponentPriority(component, phaseName, metadata.priority)
                entry = {
                  phase: phaseName
                  nodeId: nodeId
                  componentIndex: componentIndex
                  priority: priority
                  nodeOrder: nodeOrder
                  ordinal: entryOrdinal
                }
                m.AddComponentPhaseEntry(phaseLists, entry)
                entryOrdinal = entryOrdinal + 1
              end for
            end if
          end if
        end for
      end if
    end if
  end for

  for each phaseName in phaseLists
    phaseLists[phaseName] = m.SortPhaseEntries(phaseLists[phaseName])
  end for

  m.scene.phaseLists = phaseLists
  m.scene.nodeTraversalOrder = nodeOrderMap
  m.scene.phaseCacheDirty = false
end sub

function RokuEngine_BuildTraversalNodeIds() as Object
  ids = []
  if m.scene = invalid then return ids
  visited = {}
  rootIds = m.RootNodeIds()

  if type(rootIds) = "roArray" and rootIds.Count() > 0 then
    for each rootId in rootIds
      stack = [rootId]
      while stack.Count() > 0
        nodeId = stack.Pop()
        if nodeId = invalid or nodeId = "" then continue while
        if visited.DoesExist(nodeId) then continue while
        visited[nodeId] = true
        ids.Push(nodeId)

        children = []
        if m.scene.childrenByParent <> invalid and m.scene.childrenByParent.DoesExist(nodeId) then children = m.scene.childrenByParent[nodeId]
        if type(children) = "roArray" and children.Count() > 0 then
          for childIndex = children.Count() - 1 to 0 step -1
            stack.Push(children[childIndex])
          end for
        end if
      end while
    end for
  end if

  if type(m.scene.doc.nodes) = "roArray" then
    for each node in m.scene.doc.nodes
      if node = invalid or node.id = invalid or node.id = "" then continue for
      if visited.DoesExist(node.id) then continue for
      visited[node.id] = true
      ids.Push(node.id)
    end for
  end if

  return ids
end function

function RokuEngine_ResolveComponentPriority(component as Object, phaseName as String, defaultPriority as Integer) as Integer
  priority = defaultPriority
  if component = invalid then return priority
  if component.priority <> invalid then priority = Int(component.priority)
  if component.phasePriorities <> invalid and component.phasePriorities.DoesExist(phaseName) then
    priority = Int(component.phasePriorities[phaseName])
  end if
  return priority
end function

sub RokuEngine_AddComponentPhaseEntry(phaseLists as Object, entry as Object)
  if phaseLists = invalid or entry = invalid then return
  phaseName = entry.phase
  if phaseName = invalid or phaseName = "" then return
  if phaseLists.DoesExist(phaseName) <> true then phaseLists[phaseName] = []
  phaseLists[phaseName].Push(entry)
end sub

function RokuEngine_SortPhaseEntries(entries as Object) as Object
  if type(entries) <> "roArray" then return []
  sorted = []
  for each entry in entries
    sorted.Push(entry)
  end for

  if sorted.Count() <= 1 then return sorted

  for i = 1 to sorted.Count() - 1
    j = i
    while j > 0
      current = sorted[j]
      previous = sorted[j - 1]
      shouldSwap = false
      if current.priority < previous.priority then
        shouldSwap = true
      else if current.priority = previous.priority and current.nodeOrder < previous.nodeOrder then
        shouldSwap = true
      else if current.priority = previous.priority and current.nodeOrder = previous.nodeOrder and current.ordinal < previous.ordinal then
        shouldSwap = true
      end if
      if shouldSwap <> true then exit while
      sorted[j] = previous
      sorted[j - 1] = current
      j = j - 1
    end while
  end for

  return sorted
end function

sub RokuEngine_RunComponentPhase(phaseName as String, dt as Float, event as Dynamic)
  if m.scene = invalid then return
  m.EnsurePhaseCaches()
  if m.scene.phaseLists = invalid or m.scene.phaseLists.DoesExist(phaseName) <> true then return
  entries = m.scene.phaseLists[phaseName]
  if type(entries) <> "roArray" then return
  for each entry in entries
    m.DispatchComponentPhaseEntry(entry, dt, event)
  end for
end sub

sub RokuEngine_EnsureScriptReady(node as Object, component as Object, dt as Float)
  if node = invalid or component = invalid then return
  runtime = m.EnsureNodeRuntime(node)
  scriptKey = "__default__"
  if component.scriptPath <> invalid and component.scriptPath <> "" then scriptKey = RokuEngine_NormalizeScriptPath(component.scriptPath)
  if runtime.scriptReadyState = invalid then runtime.scriptReadyState = {}
  if runtime.scriptReadyState.DoesExist(scriptKey) then return
  runtime.scriptReadyState[scriptKey] = true
  m.InvokeScriptComponent(node, component, "Ready", dt, { phase: "ready" })
  m.InvokeScriptComponent(node, component, "Init", dt, { phase: "init" })
end sub

sub RokuEngine_DispatchComponentPhaseEntry(entry as Object, dt as Float, event as Dynamic)
  if entry = invalid or m.scene = invalid then return
  if m.scene.nodeMap.DoesExist(entry.nodeId) <> true then return
  node = m.scene.nodeMap[entry.nodeId]
  if node = invalid then return
  components = node.components
  if type(components) <> "roArray" then return
  if entry.componentIndex < 0 or entry.componentIndex >= components.Count() then return
  component = components[entry.componentIndex]
  if component = invalid or component.enabled = false then return
  m.ProcessComponentPhaseEntry(node, component, entry.phase, dt, event)
end sub

sub RokuEngine_UpdateComponents(dt as Float)
  if m.scene = invalid then return
  m.RunComponentPhase("update", dt, invalid)
end sub

sub RokuEngine_ProcessNodeComponents(node as Object, phase as String, dt as Float, event as Dynamic)
  if node = invalid then return
  components = node.components
  if type(components) <> "roArray" then return
  for each component in components
    if component = invalid or component.enabled = false then continue for
    m.ProcessComponentPhaseEntry(node, component, phase, dt, event)
  end for
end sub

sub RokuEngine_ProcessComponentPhaseEntry(node as Object, component as Object, phase as String, dt as Float, event as Dynamic)
  m.InvokeComponentPhase(node, component, phase, dt, event)
end sub

sub RokuEngine_UpdateMovementComponents(dt as Float)
  if m.scene = invalid then return
  m.RunComponentPhase("update", dt, invalid)
end sub

sub RokuEngine_UpdatePhysicsComponents(dt as Float)
  if m.scene = invalid then return
  m.RunComponentPhase("fixed_update", dt, invalid)
end sub

sub RokuEngine_ProcessInputPhase(dt as Float)
  if m.scene = invalid then return
  events = m.inputState.frameEvents
  if type(events) <> "roArray" or events.Count() = 0 then return

  ' Phase 7: block all input while a blocking transition is active
  if m.RGE_UI_IsInputBlocked() then
    m.inputState.frameEvents = []
    m.pendingInputEvents = []
    return
  end if

  for each evt in events
    if evt = invalid then continue for
    m.HandleFocusInput(evt)
    if evt.consumed <> true then m.RunComponentPhase("input", dt, evt)
  end for

  m.UpdateFocusState()
  m.inputState.frameEvents = []
  m.pendingInputEvents = []
end sub

sub RokuEngine_UpdateInputComponents(dt as Float)
  m.ProcessInputPhase(dt)
end sub

sub RokuEngine_UpdateAnimationComponents(dt as Float)
  if m.scene = invalid then return
  m.RunComponentPhase("update", dt, invalid)
end sub

function RokuEngine_BuildColliderList() as Object
  if m.collisionSystem = invalid then return []
  colliders = m.collisionSystem.BuildColliderList()
  m.lastColliderList = colliders
  return colliders
end function

sub RokuEngine_RunCollisionPass(dt as Float)
  if m.collisionSystem = invalid then return
  colliders = m.lastColliderList
  if type(colliders) <> "roArray" then colliders = m.BuildColliderList()
  m.collisionSystem.Process(dt, colliders)
end sub

sub RokuEngine_RunScriptHooks(dt as Float, event as Dynamic)
  if m.scene = invalid then return
  eventName = ""
  phaseName = ""
  if event <> invalid and event.name <> invalid then eventName = RokuEngine_Trim(RokuEngine_ToString(event.name))
  if event <> invalid and event.phase <> invalid then phaseName = RokuEngine_Trim(RokuEngine_ToString(event.phase))
  if phaseName = "ui_action" then eventName = "Action"

  if eventName = "Input" then
    m.RunComponentPhase("input", dt, event)
    return
  else if eventName = "PreUpdate" then
    m.RunComponentPhase("pre_update", dt, event)
    return
  else if eventName = "PhysicsUpdate" then
    m.RunComponentPhase("fixed_update", dt, event)
    return
  else if eventName = "Update" then
    m.RunComponentPhase("update", dt, event)
    return
  else if eventName = "LateUpdate" then
    m.RunComponentPhase("late_update", dt, event)
    return
  else if eventName = "PostUpdate" then
    m.RunComponentPhase("post_update", dt, event)
    return
  end if

  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    components = node.components
    if type(components) <> "roArray" then continue for
    for each component in components
      if component = invalid or component.enabled = false then continue for
      if component.type <> "ScriptComponent" then continue for
      runtime = m.EnsureNodeRuntime(node)
      scriptKey = "__default__"
      if component.scriptPath <> invalid and component.scriptPath <> "" then scriptKey = RokuEngine_NormalizeScriptPath(component.scriptPath)
      if eventName <> "SceneExit" and runtime.scriptReadyState = invalid then runtime.scriptReadyState = {}
      if eventName <> "SceneExit" and runtime.scriptReadyState.DoesExist(scriptKey) <> true then m.EnsureScriptReady(node, component, dt)
      m.InvokeScriptComponent(node, component, eventName, dt, event)
    end for
  end for
end sub

sub RokuEngine_UpdateAudioComponents()
  if m.scene = invalid then return
  m.RunComponentPhase("audio", 0.0, invalid)
  for each node in m.scene.doc.nodes
    owner = m.EnsureNodeRuntime(node)
    if owner.audioVoices = invalid then continue for
    for each key in owner.audioVoices
      voice = owner.audioVoices[key]
      if voice.lastAudioFrame <> m.frameNumber and voice.audioPlayer <> invalid then
        voice.audioPlayer.Stop()
        voice.audioAutoplayStarted = false
      end if
    end for
  end for
end sub


sub RokuEngine_HandleComponentInput(code as Integer)
  m.HandleButtonCode(code, true, false)
end sub

' ── Resource manifest accessor (used by NineSlice style lookup) ───────────────

function RokuEngine_GetResourceManifest() as Dynamic
  if m.resources = invalid then return invalid
  return m.resources.manifest
end function

' ══════════════════════════════════════════════════════════════════════════
' SpawnNode / DestroyNode — runtime node creation & removal
' ══════════════════════════════════════════════════════════════════════════

' SpawnNode — creates a new node at runtime and inserts it into the scene.
'
' template: AA with any node fields (type, name, transform, properties,
'           components, visible, zIndex, etc.)
' parentId: optional — parent node id string, or invalid for root
' returns:  the new node AA, or invalid on failure
'
function RokuEngine_SpawnNode(template as Object, parentId as Dynamic) as Dynamic
  if m.scene = invalid or m.scene.doc = invalid then return invalid
  if type(m.scene.doc.nodes) <> "roArray" then return invalid

  ' Build the node with safe defaults
  node = {
    id:         RokuEngine_GenerateId()
    type:       "Node2D"
    name:       "SpawnedNode"
    parentId:   ""
    visible:    true
    locked:     false
    zIndex:     0
    transform:  { x: 0.0, y: 0.0, rotation: 0.0, scaleX: 1.0, scaleY: 1.0, pivotX: 0.0, pivotY: 0.0 }
    properties: {}
    metadata:   {}
    components: []
  }

  ' Apply template fields
  if template <> invalid then
    if template.type <> invalid and template.type <> ""         then node.type       = template.type
    if template.name <> invalid and template.name <> ""         then node.name       = template.name
    if template.visible <> invalid                              then node.visible    = template.visible
    if template.zIndex <> invalid                               then node.zIndex     = template.zIndex
    if template.properties <> invalid                           then node.properties = template.properties
    if template.components <> invalid                           then node.components = template.components
    if template.metadata <> invalid                             then node.metadata   = template.metadata
    if template.transform <> invalid then
      t = template.transform
      if t.x        <> invalid then node.transform.x        = t.x
      if t.y        <> invalid then node.transform.y        = t.y
      if t.rotation <> invalid then node.transform.rotation = t.rotation
      if t.scaleX   <> invalid then node.transform.scaleX   = t.scaleX
      if t.scaleY   <> invalid then node.transform.scaleY   = t.scaleY
      if t.pivotX   <> invalid then node.transform.pivotX   = t.pivotX
      if t.pivotY   <> invalid then node.transform.pivotY   = t.pivotY
    end if
  end if

  ' Resolve parent
  if parentId <> invalid and parentId <> "" then
    node.parentId = parentId
  else if m.scene.rootNodeId <> invalid then
    node.parentId = m.scene.rootNodeId
  end if

  ' Insert into scene document
  m.scene.doc.nodes.Push(node)

  ' Rebuild caches so the node is immediately visible to all systems
  m.RefreshSceneCaches()
  m.MarkNodeTransformDirty(node.id)
  m.MarkPhaseCachesDirty()

  return node
end function

' DestroyNode — removes a node (and all its descendants) from the scene.
'
' nodeId: id of the node to remove
'
sub RokuEngine_DestroyNode(nodeId as String)
  if m.scene = invalid or m.scene.doc = invalid then return
  if type(m.scene.doc.nodes) <> "roArray" then return
  if nodeId = invalid or nodeId = "" then return

  ' Collect this node and all descendants
  toRemove = {}
  toRemove[nodeId] = true
  changed = true
  while changed
    changed = false
    for each node in m.scene.doc.nodes
      if node = invalid then continue for
      pid = ""
      if node.parentId <> invalid then pid = node.parentId
      if toRemove.DoesExist(pid) and not toRemove.DoesExist(node.id) then
        toRemove[node.id] = true
        changed = true
      end if
    end for
  end while

  ' Remove compositor sprites for all affected nodes
  for each id in toRemove
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(id) then
      m.RemoveNodeCompositorSprite(m.scene.nodeMap[id])
      RokuAudio_StopNode(m,m.scene.nodeMap[id])
    end if
    ' Clear runtime state
    if m.scene.runtime <> invalid and m.scene.runtime.nodes <> invalid then
      if m.scene.runtime.nodes.DoesExist(id) then m.scene.runtime.nodes.Delete(id)
    end if
  end for

  ' Filter nodes array
  kept = []
  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    if not toRemove.DoesExist(node.id) then kept.Push(node)
  end for
  m.scene.doc.nodes = kept

  ' Rebuild caches
  m.RefreshSceneCaches()
  m.MarkPhaseCachesDirty()
end sub

' Generate a random id string
function RokuEngine_GenerateId() as String
  ts   = CreateObject("roTimespan")
  hex  = "0123456789abcdef"
  id   = "sp_"
  for i = 0 to 11
    id = id + Mid(hex, (Abs(Rnd(16)) mod 16) + 1, 1)
  end for
  return id
end function
