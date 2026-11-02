' Explicit engine context for stateful helpers.
sub RokuEngine_BindRuntimeMethods(engine as Object)
  engine.RGE_HighScores_Add = RGE_HighScores_Add
  engine.RGE_HighScores_Clear = RGE_HighScores_Clear
  engine.RGE_HighScores_GetEntries = RGE_HighScores_GetEntries
  engine.RGE_HighScores_GetRowText = RGE_HighScores_GetRowText
  engine.RGE_HighScores_IsHighScore = RGE_HighScores_IsHighScore
  engine.RGE_Options_Cycle = RGE_Options_Cycle
  engine.RGE_Options_Get = RGE_Options_Get
  engine.RGE_Options_GetBool = RGE_Options_GetBool
  engine.RGE_Options_GetDisplayText = RGE_Options_GetDisplayText
  engine.RGE_Options_GetFloat = RGE_Options_GetFloat
  engine.RGE_Options_GetInt = RGE_Options_GetInt
  engine.RGE_Options_Reset = RGE_Options_Reset
  engine.RGE_Options_ResetAll = RGE_Options_ResetAll
  engine.RGE_Options_Set = RGE_Options_Set
  engine.RGE_Storage_ClearNamespace = RGE_Storage_ClearNamespace
  engine.RGE_Storage_Delete = RGE_Storage_Delete
  engine.RGE_Storage_Exists = RGE_Storage_Exists
  engine.RGE_Storage_ListKeys = RGE_Storage_ListKeys
  engine.RGE_Storage_Load = RGE_Storage_Load
  engine.RGE_Storage_LoadBool = RGE_Storage_LoadBool
  engine.RGE_Storage_LoadFloat = RGE_Storage_LoadFloat
  engine.RGE_Storage_LoadInt = RGE_Storage_LoadInt
  engine.RGE_Storage_Save = RGE_Storage_Save
  engine.RGE_UI_ChangeScreen = RGE_UI_ChangeScreen
  engine.RGE_UI_GetCurrentScreen = RGE_UI_GetCurrentScreen
  engine.RGE_UI_HideScreen = RGE_UI_HideScreen
  engine.RGE_UI_IsInputBlocked = RGE_UI_IsInputBlocked
  engine.RGE_UI_IsScreenVisible = RGE_UI_IsScreenVisible
  engine.RGE_UI_IsTransitionActive = RGE_UI_IsTransitionActive
  engine.RGE_UI_MarkLoadComplete = RGE_UI_MarkLoadComplete
  engine.RGE_UI_PopScreen = RGE_UI_PopScreen
  engine.RGE_UI_PushScreen = RGE_UI_PushScreen
  engine.RGE_UI_SetLoadProgress = RGE_UI_SetLoadProgress
  engine.RGE_UI_ShowScreen = RGE_UI_ShowScreen
  engine.RGE_UI_StartTransition = RGE_UI_StartTransition
  engine.RGE_UI_TransitionToScene = RGE_UI_TransitionToScene
  engine.RGE_UI_TransitionToScreen = RGE_UI_TransitionToScreen
  engine.RokuEngine_ApplyCameraFollow = RokuEngine_ApplyCameraFollow
  if engine.ApplyCameraFollow = invalid then engine.ApplyCameraFollow = RokuEngine_ApplyCameraFollow
  engine.RokuEngine_ApplyPendingSceneChange = RokuEngine_ApplyPendingSceneChange
  if engine.ApplyPendingSceneChange = invalid then engine.ApplyPendingSceneChange = RokuEngine_ApplyPendingSceneChange
  engine.RokuEngine_ApplyRigidBodyMotion = RokuEngine_ApplyRigidBodyMotion
  if engine.ApplyRigidBodyMotion = invalid then engine.ApplyRigidBodyMotion = RokuEngine_ApplyRigidBodyMotion
  engine.RokuEngine_ApplySpriteTransform = RokuEngine_ApplySpriteTransform
  if engine.ApplySpriteTransform = invalid then engine.ApplySpriteTransform = RokuEngine_ApplySpriteTransform
  engine.RokuEngine_BeginFrameTiming = RokuEngine_BeginFrameTiming
  if engine.BeginFrameTiming = invalid then engine.BeginFrameTiming = RokuEngine_BeginFrameTiming
  engine.RokuEngine_BuildAnimationFrames = RokuEngine_BuildAnimationFrames
  if engine.BuildAnimationFrames = invalid then engine.BuildAnimationFrames = RokuEngine_BuildAnimationFrames
  engine.RokuEngine_BuildColliderList = RokuEngine_BuildColliderList
  if engine.BuildColliderList = invalid then engine.BuildColliderList = RokuEngine_BuildColliderList
  engine.RokuEngine_BuildScriptContext = RokuEngine_BuildScriptContext
  if engine.BuildScriptContext = invalid then engine.BuildScriptContext = RokuEngine_BuildScriptContext
  engine.RokuEngine_BuildTraversalNodeIds = RokuEngine_BuildTraversalNodeIds
  if engine.BuildTraversalNodeIds = invalid then engine.BuildTraversalNodeIds = RokuEngine_BuildTraversalNodeIds
  engine.RokuEngine_BuildUiTraversalNodeIds = RokuEngine_BuildUiTraversalNodeIds
  if engine.BuildUiTraversalNodeIds = invalid then engine.BuildUiTraversalNodeIds = RokuEngine_BuildUiTraversalNodeIds
  engine.RokuEngine_ChangeScene = RokuEngine_ChangeScene
  if engine.ChangeScene = invalid then engine.ChangeScene = RokuEngine_ChangeScene
  engine.RokuEngine_ChangeScreen = RokuEngine_ChangeScreen
  if engine.ChangeScreen = invalid then engine.ChangeScreen = RokuEngine_ChangeScreen
  engine.RokuEngine_ComputeWorldTransform = RokuEngine_ComputeWorldTransform
  if engine.ComputeWorldTransform = invalid then engine.ComputeWorldTransform = RokuEngine_ComputeWorldTransform
  engine.RokuEngine_DestroyNode = RokuEngine_DestroyNode
  if engine.DestroyNode = invalid then engine.DestroyNode = RokuEngine_DestroyNode
  engine.RokuEngine_DispatchComponentPhaseEntry = RokuEngine_DispatchComponentPhaseEntry
  if engine.DispatchComponentPhaseEntry = invalid then engine.DispatchComponentPhaseEntry = RokuEngine_DispatchComponentPhaseEntry
  engine.RokuEngine_DrawDebugText = RokuEngine_DrawDebugText
  if engine.DrawDebugText = invalid then engine.DrawDebugText = RokuEngine_DrawDebugText
  engine.RokuEngine_DrawNode = RokuEngine_DrawNode
  if engine.DrawNode = invalid then engine.DrawNode = RokuEngine_DrawNode
  engine.RokuEngine_DrawNodeShapes = RokuEngine_DrawNodeShapes
  if engine.DrawNodeShapes = invalid then engine.DrawNodeShapes = RokuEngine_DrawNodeShapes
  engine.RokuEngine_DrawNodeTree = RokuEngine_DrawNodeTree
  if engine.DrawNodeTree = invalid then engine.DrawNodeTree = RokuEngine_DrawNodeTree
  engine.RokuEngine_DrawUiText = RokuEngine_DrawUiText
  if engine.DrawUiText = invalid then engine.DrawUiText = RokuEngine_DrawUiText
  engine.RokuEngine_DrawUiTextAligned = RokuEngine_DrawUiTextAligned
  if engine.DrawUiTextAligned = invalid then engine.DrawUiTextAligned = RokuEngine_DrawUiTextAligned
  engine.RokuEngine_EndPhaseTiming = RokuEngine_EndPhaseTiming
  if engine.EndPhaseTiming = invalid then engine.EndPhaseTiming = RokuEngine_EndPhaseTiming
  engine.RokuEngine_EnsureNodeRuntime = RokuEngine_EnsureNodeRuntime
  if engine.EnsureNodeRuntime = invalid then engine.EnsureNodeRuntime = RokuEngine_EnsureNodeRuntime
  engine.RokuEngine_EnsurePhaseCaches = RokuEngine_EnsurePhaseCaches
  if engine.EnsurePhaseCaches = invalid then engine.EnsurePhaseCaches = RokuEngine_EnsurePhaseCaches
  engine.RokuEngine_EnsureScriptReady = RokuEngine_EnsureScriptReady
  if engine.EnsureScriptReady = invalid then engine.EnsureScriptReady = RokuEngine_EnsureScriptReady
  engine.RokuEngine_EnsureSpriteNodeRuntime = RokuEngine_EnsureSpriteNodeRuntime
  if engine.EnsureSpriteNodeRuntime = invalid then engine.EnsureSpriteNodeRuntime = RokuEngine_EnsureSpriteNodeRuntime
  engine.RokuEngine_FinalizeCollisionPhase = RokuEngine_FinalizeCollisionPhase
  if engine.FinalizeCollisionPhase = invalid then engine.FinalizeCollisionPhase = RokuEngine_FinalizeCollisionPhase
  engine.RokuEngine_FindNodeByName = RokuEngine_FindNodeByName
  if engine.FindNodeByName = invalid then engine.FindNodeByName = RokuEngine_FindNodeByName
  engine.RokuEngine_FindSpriteSheetByResourcePath = RokuEngine_FindSpriteSheetByResourcePath
  if engine.FindSpriteSheetByResourcePath = invalid then engine.FindSpriteSheetByResourcePath = RokuEngine_FindSpriteSheetByResourcePath
  engine.RokuEngine_GetActionForButtonCode = RokuEngine_GetActionForButtonCode
  if engine.GetActionForButtonCode = invalid then engine.GetActionForButtonCode = RokuEngine_GetActionForButtonCode
  engine.RokuEngine_GetComponentDefinition = RokuEngine_GetComponentDefinition
  if engine.GetComponentDefinition = invalid then engine.GetComponentDefinition = RokuEngine_GetComponentDefinition
  engine.RokuEngine_GetComponentPhaseMetadata = RokuEngine_GetComponentPhaseMetadata
  if engine.GetComponentPhaseMetadata = invalid then engine.GetComponentPhaseMetadata = RokuEngine_GetComponentPhaseMetadata
  engine.RokuEngine_GetFocusedNode = RokuEngine_GetFocusedNode
  if engine.GetFocusedNode = invalid then engine.GetFocusedNode = RokuEngine_GetFocusedNode
  engine.RokuEngine_GetFocusedNodeId = RokuEngine_GetFocusedNodeId
  if engine.GetFocusedNodeId = invalid then engine.GetFocusedNodeId = RokuEngine_GetFocusedNodeId
  engine.RokuEngine_GetLocalTransform = RokuEngine_GetLocalTransform
  if engine.GetLocalTransform = invalid then engine.GetLocalTransform = RokuEngine_GetLocalTransform
  engine.RokuEngine_GetNodeCollider = RokuEngine_GetNodeCollider
  if engine.GetNodeCollider = invalid then engine.GetNodeCollider = RokuEngine_GetNodeCollider
  engine.RokuEngine_GetNodeScreenTransform = RokuEngine_GetNodeScreenTransform
  if engine.GetNodeScreenTransform = invalid then engine.GetNodeScreenTransform = RokuEngine_GetNodeScreenTransform
  engine.RokuEngine_GetRenderTraversalNodeIds = RokuEngine_GetRenderTraversalNodeIds
  if engine.GetRenderTraversalNodeIds = invalid then engine.GetRenderTraversalNodeIds = RokuEngine_GetRenderTraversalNodeIds
  engine.RokuEngine_GetResourceManifest = RokuEngine_GetResourceManifest
  if engine.GetResourceManifest = invalid then engine.GetResourceManifest = RokuEngine_GetResourceManifest
  engine.RokuEngine_GetUiTraversalNodeIds = RokuEngine_GetUiTraversalNodeIds
  if engine.GetUiTraversalNodeIds = invalid then engine.GetUiTraversalNodeIds = RokuEngine_GetUiTraversalNodeIds
  engine.RokuEngine_GetWorldTransform = RokuEngine_GetWorldTransform
  if engine.GetWorldTransform = invalid then engine.GetWorldTransform = RokuEngine_GetWorldTransform
  engine.RokuEngine_HandleAudioEvent = RokuEngine_HandleAudioEvent
  if engine.HandleAudioEvent = invalid then engine.HandleAudioEvent = RokuEngine_HandleAudioEvent
  engine.RokuEngine_HandleButtonCode = RokuEngine_HandleButtonCode
  if engine.HandleButtonCode = invalid then engine.HandleButtonCode = RokuEngine_HandleButtonCode
  engine.RokuEngine_HandleComponentInput = RokuEngine_HandleComponentInput
  if engine.HandleComponentInput = invalid then engine.HandleComponentInput = RokuEngine_HandleComponentInput
  engine.RokuEngine_HandleFocusInput = RokuEngine_HandleFocusInput
  if engine.HandleFocusInput = invalid then engine.HandleFocusInput = RokuEngine_HandleFocusInput
  engine.RokuEngine_HandleInputEvent = RokuEngine_HandleInputEvent
  if engine.HandleInputEvent = invalid then engine.HandleInputEvent = RokuEngine_HandleInputEvent
  engine.RokuEngine_InitializeFocusManager = RokuEngine_InitializeFocusManager
  if engine.InitializeFocusManager = invalid then engine.InitializeFocusManager = RokuEngine_InitializeFocusManager
  engine.RokuEngine_InitializeHighScores = RokuEngine_InitializeHighScores
  if engine.InitializeHighScores = invalid then engine.InitializeHighScores = RokuEngine_InitializeHighScores
  engine.RokuEngine_InitializeOptions = RokuEngine_InitializeOptions
  if engine.InitializeOptions = invalid then engine.InitializeOptions = RokuEngine_InitializeOptions
  engine.RokuEngine_InitializeScreenManager = RokuEngine_InitializeScreenManager
  if engine.InitializeScreenManager = invalid then engine.InitializeScreenManager = RokuEngine_InitializeScreenManager
  engine.RokuEngine_InitializeStorage = RokuEngine_InitializeStorage
  if engine.InitializeStorage = invalid then engine.InitializeStorage = RokuEngine_InitializeStorage
  engine.RokuEngine_InitializeTransitionManager = RokuEngine_InitializeTransitionManager
  if engine.InitializeTransitionManager = invalid then engine.InitializeTransitionManager = RokuEngine_InitializeTransitionManager
  engine.RokuEngine_InitializeUiRuntime = RokuEngine_InitializeUiRuntime
  if engine.InitializeUiRuntime = invalid then engine.InitializeUiRuntime = RokuEngine_InitializeUiRuntime
  engine.RokuEngine_InvokeComponentPhase = RokuEngine_InvokeComponentPhase
  if engine.InvokeComponentPhase = invalid then engine.InvokeComponentPhase = RokuEngine_InvokeComponentPhase
  engine.RokuEngine_IsNodeFocusable = RokuEngine_IsNodeFocusable
  if engine.IsNodeFocusable = invalid then engine.IsNodeFocusable = RokuEngine_IsNodeFocusable
  engine.RokuEngine_LoadImageAsset = RokuEngine_LoadImageAsset
  if engine.LoadImageAsset = invalid then engine.LoadImageAsset = RokuEngine_LoadImageAsset
  engine.RokuEngine_LoadScene = RokuEngine_LoadScene
  if engine.LoadScene = invalid then engine.LoadScene = RokuEngine_LoadScene
  engine.RokuEngine_LoadSceneAsset = RokuEngine_LoadSceneAsset
  if engine.LoadSceneAsset = invalid then engine.LoadSceneAsset = RokuEngine_LoadSceneAsset
  engine.RokuEngine_LoadScreensFromManifest = RokuEngine_LoadScreensFromManifest
  if engine.LoadScreensFromManifest = invalid then engine.LoadScreensFromManifest = RokuEngine_LoadScreensFromManifest
  engine.RokuEngine_LoadSpriteSheetTile = RokuEngine_LoadSpriteSheetTile
  if engine.LoadSpriteSheetTile = invalid then engine.LoadSpriteSheetTile = RokuEngine_LoadSpriteSheetTile
  engine.RokuEngine_MarkNodeTransformDirty = RokuEngine_MarkNodeTransformDirty
  if engine.MarkNodeTransformDirty = invalid then engine.MarkNodeTransformDirty = RokuEngine_MarkNodeTransformDirty
  engine.RokuEngine_MarkPhaseCachesDirty = RokuEngine_MarkPhaseCachesDirty
  if engine.MarkPhaseCachesDirty = invalid then engine.MarkPhaseCachesDirty = RokuEngine_MarkPhaseCachesDirty
  engine.RokuEngine_MarkSubtreeDirty = RokuEngine_MarkSubtreeDirty
  if engine.MarkSubtreeDirty = invalid then engine.MarkSubtreeDirty = RokuEngine_MarkSubtreeDirty
  engine.RokuEngine_MarkUIClean = RokuEngine_MarkUIClean
  if engine.MarkUIClean = invalid then engine.MarkUIClean = RokuEngine_MarkUIClean
  engine.RokuEngine_MarkUIDirty = RokuEngine_MarkUIDirty
  if engine.MarkUIDirty = invalid then engine.MarkUIDirty = RokuEngine_MarkUIDirty
  engine.RokuEngine_MoveFocus = RokuEngine_MoveFocus
  if engine.MoveFocus = invalid then engine.MoveFocus = RokuEngine_MoveFocus
  engine.RokuEngine_MoveFocusDirection = RokuEngine_MoveFocusDirection
  if engine.MoveFocusDirection = invalid then engine.MoveFocusDirection = RokuEngine_MoveFocusDirection
  engine.RokuEngine_NormalizeActionMap = RokuEngine_NormalizeActionMap
  if engine.NormalizeActionMap = invalid then engine.NormalizeActionMap = RokuEngine_NormalizeActionMap
  engine.RokuEngine_OverlapsCollider = RokuEngine_OverlapsCollider
  if engine.OverlapsCollider = invalid then engine.OverlapsCollider = RokuEngine_OverlapsCollider
  engine.RokuEngine_PlayNodeAudio = RokuEngine_PlayNodeAudio
  if engine.PlayNodeAudio = invalid then engine.PlayNodeAudio = RokuEngine_PlayNodeAudio
  engine.RokuEngine_PoolAcquire = RokuEngine_PoolAcquire
  if engine.PoolAcquire = invalid then engine.PoolAcquire = RokuEngine_PoolAcquire
  engine.RokuEngine_PoolActiveCount = RokuEngine_PoolActiveCount
  if engine.PoolActiveCount = invalid then engine.PoolActiveCount = RokuEngine_PoolActiveCount
  engine.RokuEngine_PoolGetActive = RokuEngine_PoolGetActive
  if engine.PoolGetActive = invalid then engine.PoolGetActive = RokuEngine_PoolGetActive
  engine.RokuEngine_PoolRelease = RokuEngine_PoolRelease
  if engine.PoolRelease = invalid then engine.PoolRelease = RokuEngine_PoolRelease
  engine.RokuEngine_PoolReleaseAll = RokuEngine_PoolReleaseAll
  if engine.PoolReleaseAll = invalid then engine.PoolReleaseAll = RokuEngine_PoolReleaseAll
  engine.RokuEngine_PoolReleaseAllPools = RokuEngine_PoolReleaseAllPools
  if engine.PoolReleaseAllPools = invalid then engine.PoolReleaseAllPools = RokuEngine_PoolReleaseAllPools
  engine.RokuEngine_PopScene = RokuEngine_PopScene
  if engine.PopScene = invalid then engine.PopScene = RokuEngine_PopScene
  engine.RokuEngine_ProcessCollisions = RokuEngine_ProcessCollisions
  if engine.ProcessCollisions = invalid then engine.ProcessCollisions = RokuEngine_ProcessCollisions
  engine.RokuEngine_ProcessComponentPhaseEntry = RokuEngine_ProcessComponentPhaseEntry
  if engine.ProcessComponentPhaseEntry = invalid then engine.ProcessComponentPhaseEntry = RokuEngine_ProcessComponentPhaseEntry
  engine.RokuEngine_ProcessInputPhase = RokuEngine_ProcessInputPhase
  if engine.ProcessInputPhase = invalid then engine.ProcessInputPhase = RokuEngine_ProcessInputPhase
  engine.RokuEngine_ProcessMessages = RokuEngine_ProcessMessages
  if engine.ProcessMessages = invalid then engine.ProcessMessages = RokuEngine_ProcessMessages
  engine.RokuEngine_ProcessNodeComponents = RokuEngine_ProcessNodeComponents
  if engine.ProcessNodeComponents = invalid then engine.ProcessNodeComponents = RokuEngine_ProcessNodeComponents
  engine.RokuEngine_PumpPlatformMessages = RokuEngine_PumpPlatformMessages
  if engine.PumpPlatformMessages = invalid then engine.PumpPlatformMessages = RokuEngine_PumpPlatformMessages
  engine.RokuEngine_PushScene = RokuEngine_PushScene
  if engine.PushScene = invalid then engine.PushScene = RokuEngine_PushScene
  engine.RokuEngine_QueueSceneChange = RokuEngine_QueueSceneChange
  if engine.QueueSceneChange = invalid then engine.QueueSceneChange = RokuEngine_QueueSceneChange
  engine.RokuEngine_RebuildFocusables = RokuEngine_RebuildFocusables
  if engine.RebuildFocusables = invalid then engine.RebuildFocusables = RokuEngine_RebuildFocusables
  engine.RokuEngine_RebuildPhaseCaches = RokuEngine_RebuildPhaseCaches
  if engine.RebuildPhaseCaches = invalid then engine.RebuildPhaseCaches = RokuEngine_RebuildPhaseCaches
  engine.RokuEngine_RebuildUiRuntime = RokuEngine_RebuildUiRuntime
  if engine.RebuildUiRuntime = invalid then engine.RebuildUiRuntime = RokuEngine_RebuildUiRuntime
  engine.RokuEngine_RefreshSceneCaches = RokuEngine_RefreshSceneCaches
  if engine.RefreshSceneCaches = invalid then engine.RefreshSceneCaches = RokuEngine_RefreshSceneCaches
  engine.RokuEngine_RegisterBuiltinComponents = RokuEngine_RegisterBuiltinComponents
  if engine.RegisterBuiltinComponents = invalid then engine.RegisterBuiltinComponents = RokuEngine_RegisterBuiltinComponents
  engine.RokuEngine_RegisterComponentDefinition = RokuEngine_RegisterComponentDefinition
  if engine.RegisterComponentDefinition = invalid then engine.RegisterComponentDefinition = RokuEngine_RegisterComponentDefinition
  engine.RokuEngine_ReloadScene = RokuEngine_ReloadScene
  if engine.ReloadScene = invalid then engine.ReloadScene = RokuEngine_ReloadScene
  engine.RokuEngine_RemoveAllCompositorSprites = RokuEngine_RemoveAllCompositorSprites
  if engine.RemoveAllCompositorSprites = invalid then engine.RemoveAllCompositorSprites = RokuEngine_RemoveAllCompositorSprites
  engine.RokuEngine_RemoveNodeCompositorSprite = RokuEngine_RemoveNodeCompositorSprite
  if engine.RemoveNodeCompositorSprite = invalid then engine.RemoveNodeCompositorSprite = RokuEngine_RemoveNodeCompositorSprite
  engine.RokuEngine_Render = RokuEngine_Render
  if engine.Render = invalid then engine.Render = RokuEngine_Render
  engine.RokuEngine_RenderDebugNode = RokuEngine_RenderDebugNode
  if engine.RenderDebugNode = invalid then engine.RenderDebugNode = RokuEngine_RenderDebugNode
  engine.RokuEngine_RenderPassOverlay = RokuEngine_RenderPassOverlay
  if engine.RenderPassOverlay = invalid then engine.RenderPassOverlay = RokuEngine_RenderPassOverlay
  engine.RokuEngine_RenderPassTileMaps = RokuEngine_RenderPassTileMaps
  if engine.RenderPassTileMaps = invalid then engine.RenderPassTileMaps = RokuEngine_RenderPassTileMaps
  engine.RokuEngine_RenderPassUI = RokuEngine_RenderPassUI
  if engine.RenderPassUI = invalid then engine.RenderPassUI = RokuEngine_RenderPassUI
  engine.RokuEngine_RenderPassWorldDebug = RokuEngine_RenderPassWorldDebug
  if engine.RenderPassWorldDebug = invalid then engine.RenderPassWorldDebug = RokuEngine_RenderPassWorldDebug
  engine.RokuEngine_RenderPassWorldSprites = RokuEngine_RenderPassWorldSprites
  if engine.RenderPassWorldSprites = invalid then engine.RenderPassWorldSprites = RokuEngine_RenderPassWorldSprites
  engine.RokuEngine_RenderTransitionOverlay = RokuEngine_RenderTransitionOverlay
  if engine.RenderTransitionOverlay = invalid then engine.RenderTransitionOverlay = RokuEngine_RenderTransitionOverlay
  engine.RokuEngine_RenderUiNode = RokuEngine_RenderUiNode
  if engine.RenderUiNode = invalid then engine.RenderUiNode = RokuEngine_RenderUiNode
  engine.RokuEngine_RenderUiPass = RokuEngine_RenderUiPass
  if engine.RenderUiPass = invalid then engine.RenderUiPass = RokuEngine_RenderUiPass
  engine.RokuEngine_ResetSceneFrameStats = RokuEngine_ResetSceneFrameStats
  if engine.ResetSceneFrameStats = invalid then engine.ResetSceneFrameStats = RokuEngine_ResetSceneFrameStats
  engine.RokuEngine_ResolveRigidBodyCollisions = RokuEngine_ResolveRigidBodyCollisions
  if engine.ResolveRigidBodyCollisions = invalid then engine.ResolveRigidBodyCollisions = RokuEngine_ResolveRigidBodyCollisions
  engine.RokuEngine_RootNodeIds = RokuEngine_RootNodeIds
  if engine.RootNodeIds = invalid then engine.RootNodeIds = RokuEngine_RootNodeIds
  engine.RokuEngine_Run = RokuEngine_Run
  if engine.Run = invalid then engine.Run = RokuEngine_Run
  engine.RokuEngine_RunCollisionPass = RokuEngine_RunCollisionPass
  if engine.RunCollisionPass = invalid then engine.RunCollisionPass = RokuEngine_RunCollisionPass
  engine.RokuEngine_RunComponentPhase = RokuEngine_RunComponentPhase
  if engine.RunComponentPhase = invalid then engine.RunComponentPhase = RokuEngine_RunComponentPhase
  engine.RokuEngine_RunFixedStep = RokuEngine_RunFixedStep
  if engine.RunFixedStep = invalid then engine.RunFixedStep = RokuEngine_RunFixedStep
  engine.RokuEngine_RunFixedStepLoop = RokuEngine_RunFixedStepLoop
  if engine.RunFixedStepLoop = invalid then engine.RunFixedStepLoop = RokuEngine_RunFixedStepLoop
  engine.RokuEngine_RunFrame = RokuEngine_RunFrame
  if engine.RunFrame = invalid then engine.RunFrame = RokuEngine_RunFrame
  engine.RokuEngine_RunLateUpdatePhase = RokuEngine_RunLateUpdatePhase
  if engine.RunLateUpdatePhase = invalid then engine.RunLateUpdatePhase = RokuEngine_RunLateUpdatePhase
  engine.RokuEngine_RunPreUpdatePhase = RokuEngine_RunPreUpdatePhase
  if engine.RunPreUpdatePhase = invalid then engine.RunPreUpdatePhase = RokuEngine_RunPreUpdatePhase
  engine.RokuEngine_RunScriptHooks = RokuEngine_RunScriptHooks
  if engine.RunScriptHooks = invalid then engine.RunScriptHooks = RokuEngine_RunScriptHooks
  engine.RokuEngine_RunVariableUpdatePhase = RokuEngine_RunVariableUpdatePhase
  if engine.RunVariableUpdatePhase = invalid then engine.RunVariableUpdatePhase = RokuEngine_RunVariableUpdatePhase
  engine.RokuEngine_ScanAuthoredTransformChanges = RokuEngine_ScanAuthoredTransformChanges
  if engine.ScanAuthoredTransformChanges = invalid then engine.ScanAuthoredTransformChanges = RokuEngine_ScanAuthoredTransformChanges
  engine.RokuEngine_SetFocusToScreen = RokuEngine_SetFocusToScreen
  if engine.SetFocusToScreen = invalid then engine.SetFocusToScreen = RokuEngine_SetFocusToScreen
  engine.RokuEngine_SetFocusedNode = RokuEngine_SetFocusedNode
  if engine.SetFocusedNode = invalid then engine.SetFocusedNode = RokuEngine_SetFocusedNode
  engine.RokuEngine_SetPaused = RokuEngine_SetPaused
  if engine.SetPaused = invalid then engine.SetPaused = RokuEngine_SetPaused
  engine.RokuEngine_SetPhysicsPaused = RokuEngine_SetPhysicsPaused
  if engine.SetPhysicsPaused = invalid then engine.SetPhysicsPaused = RokuEngine_SetPhysicsPaused
  engine.RokuEngine_SetTimeScale = RokuEngine_SetTimeScale
  if engine.SetTimeScale = invalid then engine.SetTimeScale = RokuEngine_SetTimeScale
  engine.RokuEngine_ShowStartupScreen = RokuEngine_ShowStartupScreen
  if engine.ShowStartupScreen = invalid then engine.ShowStartupScreen = RokuEngine_ShowStartupScreen
  engine.RokuEngine_SpawnNode = RokuEngine_SpawnNode
  if engine.SpawnNode = invalid then engine.SpawnNode = RokuEngine_SpawnNode
  engine.RokuEngine_StageInputEvents = RokuEngine_StageInputEvents
  if engine.StageInputEvents = invalid then engine.StageInputEvents = RokuEngine_StageInputEvents
  engine.RokuEngine_SyncCompositorSprites = RokuEngine_SyncCompositorSprites
  if engine.SyncCompositorSprites = invalid then engine.SyncCompositorSprites = RokuEngine_SyncCompositorSprites
  engine.RokuEngine_SyncNodeSprite = RokuEngine_SyncNodeSprite
  if engine.SyncNodeSprite = invalid then engine.SyncNodeSprite = RokuEngine_SyncNodeSprite
  engine.RokuEngine_SyncRenderState = RokuEngine_SyncRenderState
  if engine.SyncRenderState = invalid then engine.SyncRenderState = RokuEngine_SyncRenderState
  engine.RokuEngine_Update = RokuEngine_Update
  if engine.Update = invalid then engine.Update = RokuEngine_Update
  engine.RokuEngine_UpdateActiveCameraNode = RokuEngine_UpdateActiveCameraNode
  if engine.UpdateActiveCameraNode = invalid then engine.UpdateActiveCameraNode = RokuEngine_UpdateActiveCameraNode
  engine.RokuEngine_UpdateAnimationComponents = RokuEngine_UpdateAnimationComponents
  if engine.UpdateAnimationComponents = invalid then engine.UpdateAnimationComponents = RokuEngine_UpdateAnimationComponents
  engine.RokuEngine_UpdateAudioComponents = RokuEngine_UpdateAudioComponents
  if engine.UpdateAudioComponents = invalid then engine.UpdateAudioComponents = RokuEngine_UpdateAudioComponents
  engine.RokuEngine_UpdateComponents = RokuEngine_UpdateComponents
  if engine.UpdateComponents = invalid then engine.UpdateComponents = RokuEngine_UpdateComponents
  engine.RokuEngine_UpdateFocusState = RokuEngine_UpdateFocusState
  if engine.UpdateFocusState = invalid then engine.UpdateFocusState = RokuEngine_UpdateFocusState
  engine.RokuEngine_UpdateHighScoreBindings = RokuEngine_UpdateHighScoreBindings
  if engine.UpdateHighScoreBindings = invalid then engine.UpdateHighScoreBindings = RokuEngine_UpdateHighScoreBindings
  engine.RokuEngine_UpdateInputComponents = RokuEngine_UpdateInputComponents
  if engine.UpdateInputComponents = invalid then engine.UpdateInputComponents = RokuEngine_UpdateInputComponents
  engine.RokuEngine_UpdateMovementComponents = RokuEngine_UpdateMovementComponents
  if engine.UpdateMovementComponents = invalid then engine.UpdateMovementComponents = RokuEngine_UpdateMovementComponents
  engine.RokuEngine_UpdateNodeWorldTransform = RokuEngine_UpdateNodeWorldTransform
  if engine.UpdateNodeWorldTransform = invalid then engine.UpdateNodeWorldTransform = RokuEngine_UpdateNodeWorldTransform
  engine.RokuEngine_UpdateOptionBindings = RokuEngine_UpdateOptionBindings
  if engine.UpdateOptionBindings = invalid then engine.UpdateOptionBindings = RokuEngine_UpdateOptionBindings
  engine.RokuEngine_UpdatePhysicsComponents = RokuEngine_UpdatePhysicsComponents
  if engine.UpdatePhysicsComponents = invalid then engine.UpdatePhysicsComponents = RokuEngine_UpdatePhysicsComponents
  engine.RokuEngine_UpdateTransition = RokuEngine_UpdateTransition
  if engine.UpdateTransition = invalid then engine.UpdateTransition = RokuEngine_UpdateTransition
  engine.RokuEngine_UpdateUiBindings = RokuEngine_UpdateUiBindings
  if engine.UpdateUiBindings = invalid then engine.UpdateUiBindings = RokuEngine_UpdateUiBindings
  engine.RokuEngine_UpdateWorldTransforms = RokuEngine_UpdateWorldTransforms
  if engine.UpdateWorldTransforms = invalid then engine.UpdateWorldTransforms = RokuEngine_UpdateWorldTransforms
  engine._FM_DispatchNamedAction = _FM_DispatchNamedAction
  engine._FM_FindSpatialNearest = _FM_FindSpatialNearest
  engine._FM_FlushActionQueue = _FM_FlushActionQueue
  engine._FM_GetNodeRect = _FM_GetNodeRect
  engine._FM_QueueAction = _FM_QueueAction
  engine._FM_ResolveNodeIdByIdOrName = _FM_ResolveNodeIdByIdOrName
  engine._HS_EnsureTable = _HS_EnsureTable
  engine._HS_LoadDefs = _HS_LoadDefs
  engine._HS_LoadEntriesFromStorage = _HS_LoadEntriesFromStorage
  engine._HS_SaveEntriesToStorage = _HS_SaveEntriesToStorage
  engine._OPT_LoadDefs = _OPT_LoadDefs
  engine._OPT_LoadValues = _OPT_LoadValues
  engine._OPT_RegisterDef = _OPT_RegisterDef
  engine._SM_DiscoverScreensFromNodes = _SM_DiscoverScreensFromNodes
  engine._SM_FireEvent = _SM_FireEvent
  engine._SM_GetDef = _SM_GetDef
  engine._SM_HideAllScreenRoots = _SM_HideAllScreenRoots
  engine._SM_NodeBelongsToScreen = _SM_NodeBelongsToScreen
  engine._SM_PushStack = _SM_PushStack
  engine._SM_SetScreenVisible = _SM_SetScreenVisible
  engine._SM_ShowAllScreenRoots = _SM_ShowAllScreenRoots
  engine._SM_TopStackName = _SM_TopStackName
  engine._STG_GetSection = _STG_GetSection
  engine._TM_DrawLoadingScreen = _TM_DrawLoadingScreen
  engine._TM_ExecutePendingAction = _TM_ExecutePendingAction
  engine._TM_Finish = _TM_Finish
end sub
