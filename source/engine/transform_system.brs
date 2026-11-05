' transform_system.brs - generated classic 2D runtime

function RokuEngine_CreateIdentityTransform() as Object
  return {
    a: 1.0
    b: 0.0
    c: 0.0
    d: 1.0
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
    pivotX: _BRS_NumCoalesce(transform.pivotX, 0)
    pivotY: _BRS_NumCoalesce(transform.pivotY, 0)
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
  return RokuEngine_ToString(localTransform.pivotX) + "|" + RokuEngine_ToString(localTransform.pivotY) + "|" + RokuEngine_ToString(localTransform.x) + "|" + RokuEngine_ToString(localTransform.y) + "|" + RokuEngine_ToString(localTransform.rotation) + "|" + RokuEngine_ToString(localTransform.scaleX) + "|" + RokuEngine_ToString(localTransform.scaleY) + "|" + LCase(RokuEngine_ToString(localTransform.visible)) + "|" + RokuEngine_ToString(localTransform.opacity)
end function

sub RokuEngine_MarkNodeTransformDirty(nodeId as String)
  if m.scene = invalid or nodeId = invalid or nodeId = "" then return
  m.EnsureTransformRuntime(m.scene)
  transforms = m.scene.runtime.transforms
  if transforms = invalid then return
  if transforms.transformFlags = invalid then transforms.transformFlags = {}
  transforms.transformFlags[nodeId] = true
  m.scene.worldTransformsDirty = true
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
  ' Canvas-only scenes calculate their transforms in the UI renderer.
  if scene.hasWorldNodes = false then scene.worldTransformsDirty = false : return
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
  scene.worldTransformsDirty = false
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
    world = RokuEngine_ComposeTransform(parentWorld, localTransform)
    world = RokuGameplay_ParallaxWorld(m, node, world)
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
  if m.scene.worldTransformsDirty = true then m.UpdateWorldTransforms(m.scene)
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
  return RokuEngine_ComposeTransform(parentTransform, localTransform)
end function

' Affine matrices include the authored pixel pivot, so every consumer shares
' the same geometry. Arbitrary rotated artwork uses its enclosing rectangle.
function RokuEngine_ComposeTransform(parent as Object, local as Object) as Object
  angle = local.rotation * 0.0174532925199433
  ca = Cos(angle)
  sa = Sin(angle)
  la = ca * local.scaleX
  lb = sa * local.scaleX
  lc = -sa * local.scaleY
  ld = ca * local.scaleY
  a = parent.a * la + parent.c * lb
  b = parent.b * la + parent.d * lb
  c = parent.a * lc + parent.c * ld
  d = parent.b * lc + parent.d * ld
  x = parent.x + parent.a * local.x + parent.c * local.y - a * local.pivotX - c * local.pivotY
  y = parent.y + parent.b * local.x + parent.d * local.y - b * local.pivotX - d * local.pivotY
  return {a: a, b: b, c: c, d: d, x: x, y: y, rotation: parent.rotation + local.rotation, scaleX: parent.scaleX * local.scaleX, scaleY: parent.scaleY * local.scaleY, visible: parent.visible and local.visible, opacity: parent.opacity * local.opacity}
end function

function RokuEngine_WorldRect(world as Object, width as Float, height as Float, offsetX = 0.0 as Float, offsetY = 0.0 as Float) as Object
  xs = [] : ys = []
  for each point in [[offsetX, offsetY], [offsetX + width, offsetY], [offsetX, offsetY + height], [offsetX + width, offsetY + height]]
    xs.Push(world.x + world.a * point[0] + world.c * point[1])
    ys.Push(world.y + world.b * point[0] + world.d * point[1])
  end for
  left = xs[0] : right = xs[0] : top = ys[0] : bottom = ys[0]
  for i = 1 to 3
    if xs[i] < left then left = xs[i]
    if xs[i] > right then right = xs[i]
    if ys[i] < top then top = ys[i]
    if ys[i] > bottom then bottom = ys[i]
  end for
  return {x: left, y: top, width: right-left, height: bottom-top}
end function
