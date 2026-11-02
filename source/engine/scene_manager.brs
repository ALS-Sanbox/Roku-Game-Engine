' scene_manager.brs - generated classic 2D runtime

function RokuEngine_LoadScene(sceneName as String) as Object
  m.RemoveAllCompositorSprites()
  sceneDoc = invalid
  if m.resources <> invalid then sceneDoc = m.resources.GetScene(sceneName)
  if sceneDoc = invalid then
    print "RokuEngine: failed to load scene "; sceneName
    return invalid
  end if

  if GetInterface(sceneDoc, "ifAssociativeArray") = invalid then return invalid
  if type(sceneDoc.nodes) <> "roArray" then return invalid

  sceneState = {
    name: sceneName
    doc: sceneDoc
    nodeMap: {}
    childrenByParent: {}
    namedNodeMap: {}
    rootNodeId: sceneDoc.scene.rootNodeId
    cameraX: 0.0
    cameraY: 0.0
    backgroundColor: &h101820FF
    paused: false
    physicsPaused: false
    timeScale: 1.0
    uiUpdatesWhenPaused: false
    pendingSceneChange: invalid
    phaseLists: m.CreateEmptyPhaseLists()
    phaseCacheDirty: true
    componentOrderVersion: 0
    nodeTraversalOrder: {}
    runtime: { nodes: {}, transforms: RokuEngine_CreateTransformRuntimeState() }
    debugStats: {
      frameNumber: 0
      rawDt: 0.0
      scaledDt: 0.0
      lastDt: 0.0
      fixedDt: 0.0
      fixedSteps: 0
      fps: 0.0
      frameMs: 0.0
      updateMs: 0.0
      physicsMs: 0.0
      renderMs: 0.0
      messagePumpMs: 0.0
      audioMs: 0.0
      spriteCount: 0
      collisionPairCount: 0
      lastColliderCount: 0
      lastInputEventCount: 0
      droppedPhysicsSteps: 0
      accumulator: 0.0
      transformUpdateCount: 0
    }
  }

  m.scene = sceneState
  m.accumulator = 0.0
  m.InitializeUiRuntime()
  m.InitializeFocusManager()
  m.collisionPairsPrevious = {}
  m.RefreshSceneCaches()
  for each node in sceneState.doc.nodes
    if node <> invalid and node.id <> invalid then m.MarkNodeTransformDirty(node.id)
  end for
  m.UpdateWorldTransforms(m.scene)
  m.UpdateActiveCameraNode()
  ' Show the startup screen (or all layers if no screens defined)
  m.ShowStartupScreen()
  return m.scene
end function

sub RokuEngine_RefreshSceneCaches()
  if m.scene = invalid then return
  m.scene.nodeMap = m.BuildNodeMap(m.scene.doc.nodes)
  m.scene.childrenByParent = m.BuildChildrenMap(m.scene.doc.nodes)
  m.scene.namedNodeMap = m.BuildNamedNodeMap(m.scene.doc.nodes)
  m.EnsureTransformRuntime(m.scene)
  m.MarkPhaseCachesDirty()
  if m.scene.ui <> invalid then m.scene.ui.focusDirty = true
  if m.focus <> invalid then m.focus.dirty = true
  for each node in m.scene.doc.nodes
    if node <> invalid and node.id <> invalid then m.MarkNodeTransformDirty(node.id)
  end for
end sub

function RokuEngine_BuildNodeMap(nodes as Object) as Object
  map = {}
  for each node in nodes
    if node <> invalid and node.id <> invalid then map[node.id] = node
  end for
  return map
end function

function RokuEngine_BuildChildrenMap(nodes as Object) as Object
  map = {}
  if type(nodes) <> "roArray" then return map
  for each node in nodes
    if node = invalid then continue for
    parentKey = ""
    if node.parentId <> invalid then parentKey = node.parentId
    if map.DoesExist(parentKey) <> true then map[parentKey] = []
    map[parentKey].Push(node.id)
  end for
  return map
end function

function RokuEngine_BuildNamedNodeMap(nodes as Object) as Object
  map = {}
  if type(nodes) <> "roArray" then return map
  for each node in nodes
    if node <> invalid and node.name <> invalid and RokuEngine_Trim(RokuEngine_ToString(node.name)) <> "" then map[LCase(RokuEngine_Trim(RokuEngine_ToString(node.name)))] = node.id
  end for
  return map
end function

function RokuEngine_FindNodeByName(nodeName as String) as Dynamic
  if m.scene = invalid then return invalid
  key = LCase(RokuEngine_Trim(RokuEngine_ToString(nodeName)))
  if key = "" then return invalid
  nodeId = invalid
  if m.scene.namedNodeMap <> invalid and m.scene.namedNodeMap.DoesExist(key) then nodeId = m.scene.namedNodeMap[key]
  if nodeId = invalid then return invalid
  if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then return m.scene.nodeMap[nodeId]
  return invalid
end function

function RokuEngine_LoadSceneAsset(path as String) as Dynamic
  if path = invalid or path = "" then return invalid
  if m.resources = invalid then return invalid
  return m.resources.GetJsonDocument(path)
end function

function RokuEngine_RootNodeIds() as Object
  ids = []
  if m.scene = invalid then return ids
  rootId = m.scene.rootNodeId
  if m.scene.childrenByParent <> invalid then
    if m.scene.childrenByParent.DoesExist(rootId) then return m.scene.childrenByParent[rootId]
    if m.scene.childrenByParent.DoesExist("") then return m.scene.childrenByParent[""]
  end if
  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    parentId = ""
    if node.parentId <> invalid then parentId = node.parentId
    if node.id = rootId then continue for
    if parentId = "" or parentId = invalid or parentId = rootId then ids.Push(node.id)
  end for
  return ids
end function

sub RokuEngine_UpdateActiveCameraNode()
  if m.scene = invalid then
    m.activeCameraNodeId = ""
    return
  end if
  m.activeCameraNodeId = ""
  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    if node.type <> "Camera2D" then continue for
    props = node.properties
    if props = invalid then props = {}
    if props.current = true then
      m.activeCameraNodeId = node.id
      return
    end if
  end for
end sub

sub RokuEngine_ApplyCameraFollow(dt as Float)
  if m.scene = invalid then return
  if m.activeCameraNodeId = invalid or m.activeCameraNodeId = "" then m.UpdateActiveCameraNode()
  if m.activeCameraNodeId = invalid or m.activeCameraNodeId = "" then return
  if m.scene.nodeMap.DoesExist(m.activeCameraNodeId) <> true then return
  cameraNode = m.scene.nodeMap[m.activeCameraNodeId]
  if cameraNode = invalid or cameraNode.properties = invalid then return
  props = cameraNode.properties
  if props.enabled = false then return
  targetName = ""
  if props.followTargetName <> invalid then targetName = RokuEngine_Trim(RokuEngine_ToString(props.followTargetName))
  if targetName = "" then return
  targetNode = m.FindNodeByName(targetName)
  if targetNode = invalid then return

  m.UpdateWorldTransforms(m.scene)
  targetWorld = m.GetWorldTransform(targetNode.id)
  targetProps = targetNode.properties
  if targetProps = invalid then targetProps = {}
  targetWidth = 0.0
  targetHeight = 0.0
  if targetProps.width <> invalid then targetWidth = targetProps.width
  if targetProps.height <> invalid then targetHeight = targetProps.height

  offsetX = 0.0
  offsetY = 0.0
  if props.offsetX <> invalid then offsetX = props.offsetX
  if props.offsetY <> invalid then offsetY = props.offsetY
  desiredX = targetWorld.x + (targetWidth * 0.5) + offsetX - (m.width * 0.5)
  desiredY = targetWorld.y + (targetHeight * 0.5) + offsetY - (m.height * 0.5)

  deadzoneW = 0.0
  deadzoneH = 0.0
  if props.deadzoneWidth <> invalid then deadzoneW = props.deadzoneWidth
  if props.deadzoneHeight <> invalid then deadzoneH = props.deadzoneHeight
  if deadzoneW > 0 then
    camCenterX = m.scene.cameraX + (m.width * 0.5)
    if Abs((targetWorld.x + targetWidth * 0.5) - camCenterX) <= deadzoneW * 0.5 then desiredX = m.scene.cameraX
  end if
  if deadzoneH > 0 then
    camCenterY = m.scene.cameraY + (m.height * 0.5)
    if Abs((targetWorld.y + targetHeight * 0.5) - camCenterY) <= deadzoneH * 0.5 then desiredY = m.scene.cameraY
  end if

  lerp = 1.0
  if props.followLerp <> invalid then lerp = props.followLerp
  if lerp < 0 then lerp = 0
  if lerp > 1 then lerp = 1
  if lerp >= 1 then
    m.scene.cameraX = desiredX
    m.scene.cameraY = desiredY
  else
    m.scene.cameraX = m.scene.cameraX + ((desiredX - m.scene.cameraX) * lerp)
    m.scene.cameraY = m.scene.cameraY + ((desiredY - m.scene.cameraY) * lerp)
  end if
end sub

sub RokuEngine_QueueSceneChange(mode as String, sceneName = invalid as Dynamic)
  if m.scene = invalid then return
  if sceneName = invalid and mode <> "reload" and mode <> "pop" then
    sceneName = mode
    mode = "change"
  end if
  request = { mode: mode }
  if sceneName <> invalid then request.sceneName = sceneName
  m.scene.pendingSceneChange = request
end sub

sub RokuEngine_ApplyPendingSceneChange()
  if m.scene = invalid or m.scene.pendingSceneChange = invalid then return
  request = m.scene.pendingSceneChange
  m.scene.pendingSceneChange = invalid
  currentScene = m.scene
  nextSceneName = invalid

  if request.mode = "change" then
    nextSceneName = request.sceneName
  else if request.mode = "reload" then
    nextSceneName = currentScene.name
  else if request.mode = "push" then
    if m.sceneStack = invalid or type(m.sceneStack) <> "roArray" then m.sceneStack = []
    if currentScene.name <> invalid and currentScene.name <> "" then m.sceneStack.Push(currentScene.name)
    nextSceneName = request.sceneName
  else if request.mode = "pop" then
    if type(m.sceneStack) <> "roArray" or m.sceneStack.Count() = 0 then return
    nextSceneName = m.sceneStack.Pop()
  end if

  if nextSceneName = invalid or nextSceneName = "" then return

  if currentScene <> invalid then
    m.RunScriptHooks(0.0, { name: "SceneExit", phase: "scene_exit", sceneName: currentScene.name })
  end if

  nextScene = m.LoadScene(nextSceneName)
  if nextScene = invalid then
    if currentScene <> invalid then m.scene = currentScene
    return
  end if

  m.RunScriptHooks(0.0, { name: "SceneEnter", phase: "scene_enter", sceneName: nextSceneName })
end sub

function RokuEngine_ChangeScene(sceneName as String) as Boolean
  if sceneName = invalid or sceneName = "" then return false
  if m.scene = invalid then
    nextScene = m.LoadScene(sceneName)
    if nextScene = invalid then return false
    m.scene = nextScene
    return true
  end if
  m.QueueSceneChange("change", sceneName)
  return true
end function

function RokuEngine_ReloadScene() as Boolean
  if m.scene = invalid or m.scene.name = invalid or m.scene.name = "" then return false
  m.QueueSceneChange("reload")
  return true
end function

function RokuEngine_PushScene(sceneName as String) as Boolean
  if sceneName = invalid or sceneName = "" then return false
  if m.scene = invalid then return m.ChangeScene(sceneName)
  m.QueueSceneChange("push", sceneName)
  return true
end function

function RokuEngine_PopScene() as Boolean
  if type(m.sceneStack) <> "roArray" or m.sceneStack.Count() = 0 then return false
  m.QueueSceneChange("pop")
  return true
end function
