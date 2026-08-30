' transform_system.brs - generated classic 2D runtime

function RokuEngine_CreateIdentityTransform() as Object
  return {
    x: 0.0
    y: 0.0
    rotation: 0.0
    scaleX: 1.0
    scaleY: 1.0
    visible: true
    opacity: 1.0
  }
end function

function RokuEngine_CreateTransformRuntimeState() as Object
  return {
    localTransforms: {}
    worldTransforms: {}
    transformFlags: {}
    transformVersions: {}
    parentWorldVersions: {}
    authoredSignatures: {}
    worldVersionCounter: 0
    lastUpdateFrame: -1
  }
end function

sub RokuEngine_EnsureTransformRuntime(scene as Object)
  if scene = invalid then return
  if scene.runtime = invalid then scene.runtime = {}
  if scene.runtime.transforms = invalid then scene.runtime.transforms = RokuEngine_CreateTransformRuntimeState()
end sub

function RokuEngine_CreateAuthoredLocalTransform(node as Object) as Object
  transform = invalid
  if node <> invalid then transform = node.transform
  if transform = invalid then transform = {}
  props = invalid
  if node <> invalid then props = node.properties
  if props = invalid then props = {}

  localVisible = true
  if node <> invalid and node.visible = false then localVisible = false

  localOpacity = 1.0
  if props.opacity <> invalid then localOpacity = props.opacity

  localX = 0.0
  localY = 0.0
  localRotation = 0.0
  localScaleX = 1.0
  localScaleY = 1.0
  if transform.x <> invalid then localX = transform.x
  if transform.y <> invalid then localY = transform.y
  if transform.rotation <> invalid then localRotation = transform.rotation
  if transform.scaleX <> invalid then localScaleX = transform.scaleX
  if transform.scaleY <> invalid then localScaleY = transform.scaleY

  return {
    x: localX
    y: localY
    rotation: localRotation
    scaleX: localScaleX
    scaleY: localScaleY
    visible: localVisible
    opacity: localOpacity
  }
end function

function RokuEngine_BuildLocalTransformSignature(localTransform as Object) as String
  if localTransform = invalid then return ""
  return Str(localTransform.x) + "|" + Str(localTransform.y) + "|" + Str(localTransform.rotation) + "|" + Str(localTransform.scaleX) + "|" + Str(localTransform.scaleY) + "|" + LCase(Str(localTransform.visible)) + "|" + Str(localTransform.opacity)
end function

sub RokuEngine_MarkNodeTransformDirty(nodeId as String)
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return
  m.EnsureTransformRuntime(m.scene)
  transforms = m.scene.runtime.transforms
  if transforms = invalid then return
  if transforms.transformFlags = invalid then transforms.transformFlags = {}
  transforms.transformFlags[nodeId] = true
end sub

sub RokuEngine_MarkSubtreeDirty(nodeId as String)
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return
  m.EnsureTransformRuntime(m.scene)
  stack = [nodeId]
  while stack.Count() > 0
    currentId = stack.Pop()
    m.MarkNodeTransformDirty(currentId)
    if m.scene.childrenByParent <> invalid and m.scene.childrenByParent.DoesExist(currentId) then
      children = m.scene.childrenByParent[currentId]
      if type(children) = "roArray" then
        for each childId in children
          if childId <> invalid and childId <> "" then stack.Push(childId)
        end for
      end if
    end if
  end while
end sub

sub RokuEngine_ScanAuthoredTransformChanges(scene as Object)
  if scene = invalid or type(scene.doc.nodes) <> "roArray" then return
  m.EnsureTransformRuntime(scene)
  transforms = scene.runtime.transforms
  for each node in scene.doc.nodes
    if node = invalid or node.id = invalid or node.id = "" then continue for
    localTransform = RokuEngine_CreateAuthoredLocalTransform(node)
    signature = RokuEngine_BuildLocalTransformSignature(localTransform)
    previousSignature = invalid
    if transforms.authoredSignatures.DoesExist(node.id) then previousSignature = transforms.authoredSignatures[node.id]
    if previousSignature = invalid or previousSignature <> signature or transforms.localTransforms.DoesExist(node.id) <> true then
      transforms.localTransforms[node.id] = localTransform
      transforms.authoredSignatures[node.id] = signature
      m.MarkSubtreeDirty(node.id)
    end if
  end for
end sub

sub RokuEngine_UpdateWorldTransforms(scene as Object)
  if scene = invalid then return
  m.EnsureTransformRuntime(scene)
  transforms = scene.runtime.transforms
  if transforms = invalid then return
  if scene.debugStats <> invalid then scene.debugStats.transformUpdateCount = 0

  m.ScanAuthoredTransformChanges(scene)

  identity = RokuEngine_CreateIdentityTransform()
  rootIds = m.RootNodeIds()
  for each rootId in rootIds
    if rootId <> invalid and rootId <> "" then m.UpdateNodeWorldTransform(scene, rootId, identity, -1, false)
  end for
  transforms.lastUpdateFrame = m.frameNumber
end sub

sub RokuEngine_UpdateNodeWorldTransform(scene as Object, nodeId as String, parentWorld as Object, parentWorldVersion as Integer, parentDirty as Boolean)
  if scene = invalid or nodeId = invalid or nodeId = "" then return
  if scene.nodeMap = invalid or scene.nodeMap.DoesExist(nodeId) <> true then return
  m.EnsureTransformRuntime(scene)
  transforms = scene.runtime.transforms
  node = scene.nodeMap[nodeId]

  localTransform = RokuEngine_CreateAuthoredLocalTransform(node)
  if transforms.localTransforms.DoesExist(nodeId) then
    localTransform = transforms.localTransforms[nodeId]
  else
    transforms.localTransforms[nodeId] = localTransform
    transforms.authoredSignatures[nodeId] = RokuEngine_BuildLocalTransformSignature(localTransform)
  end if

  selfDirty = parentDirty
  if transforms.transformFlags.DoesExist(nodeId) and transforms.transformFlags[nodeId] = true then selfDirty = true
  storedParentVersion = invalid
  if transforms.parentWorldVersions.DoesExist(nodeId) then storedParentVersion = transforms.parentWorldVersions[nodeId]
  if storedParentVersion = invalid or storedParentVersion <> parentWorldVersion then selfDirty = true
  if transforms.worldTransforms.DoesExist(nodeId) <> true then selfDirty = true

  currentWorldVersion = invalid
  if selfDirty then
    world = {
      x: parentWorld.x + localTransform.x * parentWorld.scaleX
      y: parentWorld.y + localTransform.y * parentWorld.scaleY
      rotation: parentWorld.rotation + localTransform.rotation
      scaleX: parentWorld.scaleX * localTransform.scaleX
      scaleY: parentWorld.scaleY * localTransform.scaleY
      visible: parentWorld.visible and localTransform.visible
      opacity: parentWorld.opacity * localTransform.opacity
    }
    transforms.worldTransforms[nodeId] = world
    if scene.debugStats <> invalid then scene.debugStats.transformUpdateCount = scene.debugStats.transformUpdateCount + 1
    transforms.transformFlags[nodeId] = false
    transforms.parentWorldVersions[nodeId] = parentWorldVersion
    transforms.worldVersionCounter = transforms.worldVersionCounter + 1
    currentWorldVersion = transforms.worldVersionCounter
    transforms.transformVersions[nodeId] = currentWorldVersion
  else
    currentWorldVersion = transforms.transformVersions[nodeId]
    if currentWorldVersion = invalid then
      transforms.worldVersionCounter = transforms.worldVersionCounter + 1
      currentWorldVersion = transforms.worldVersionCounter
      transforms.transformVersions[nodeId] = currentWorldVersion
    end if
  end if

  worldForChildren = transforms.worldTransforms[nodeId]
  if scene.childrenByParent <> invalid and scene.childrenByParent.DoesExist(nodeId) then
    children = scene.childrenByParent[nodeId]
    if type(children) = "roArray" then
      for each childId in children
        if childId <> invalid and childId <> "" then m.UpdateNodeWorldTransform(scene, childId, worldForChildren, currentWorldVersion, selfDirty)
      end for
    end if
  end if
end sub

function RokuEngine_GetLocalTransform(nodeId as String) as Object
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return RokuEngine_CreateIdentityTransform()
  m.EnsureTransformRuntime(m.scene)
  transforms = m.scene.runtime.transforms
  if transforms.localTransforms.DoesExist(nodeId) <> true then
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      transforms.localTransforms[nodeId] = RokuEngine_CreateAuthoredLocalTransform(m.scene.nodeMap[nodeId])
      transforms.authoredSignatures[nodeId] = RokuEngine_BuildLocalTransformSignature(transforms.localTransforms[nodeId])
    else
      return RokuEngine_CreateIdentityTransform()
    end if
  end if
  return transforms.localTransforms[nodeId]
end function

function RokuEngine_GetWorldTransform(nodeId as String) as Object
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return RokuEngine_CreateIdentityTransform()
  m.UpdateWorldTransforms(m.scene)
  transforms = m.scene.runtime.transforms
  if transforms = invalid or transforms.worldTransforms.DoesExist(nodeId) <> true then return RokuEngine_CreateIdentityTransform()
  return transforms.worldTransforms[nodeId]
end function

function RokuEngine_ComputeWorldTransform(node as Object, parentTransform as Object) as Object
  if node <> invalid and node.id <> invalid and m.scene <> invalid then
    return m.GetWorldTransform(node.id)
  end if
  if parentTransform = invalid then parentTransform = RokuEngine_CreateIdentityTransform()
  localTransform = RokuEngine_CreateAuthoredLocalTransform(node)
  return {
    x: parentTransform.x + localTransform.x * parentTransform.scaleX
    y: parentTransform.y + localTransform.y * parentTransform.scaleY
    rotation: parentTransform.rotation + localTransform.rotation
    scaleX: parentTransform.scaleX * localTransform.scaleX
    scaleY: parentTransform.scaleY * localTransform.scaleY
    visible: parentTransform.visible and localTransform.visible
    opacity: parentTransform.opacity * localTransform.opacity
  }
end function
