' ui_system.brs - UI/runtime node family helpers

function RokuEngine_IsUiNodeType(nodeType as Dynamic) as Boolean
  key = Trim(Str(nodeType))
  return key = "CanvasLayer" or key = "Control" or key = "Label" or key = "Panel" or key = "TextureRect" or key = "Button"
end function

function RokuEngine_IsWorldNodeType(nodeType as Dynamic) as Boolean
  return not RokuEngine_IsUiNodeType(nodeType) and Trim(Str(nodeType)) <> "SceneRoot"
end function

function RokuEngine_GetNodeScreenTransform(nodeId as String) as Object
  return m.GetWorldTransform(nodeId)
end function

function RokuEngine_BuildUiTraversalNodeIds() as Object
  ids = []
  if m.scene = invalid then return ids
  traversalIds = m.BuildTraversalNodeIds()
  if type(traversalIds) <> "roArray" then return ids
  for each nodeId in traversalIds
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      if node <> invalid and m.IsUiNodeType(node.type) then ids.Push(nodeId)
    end if
  end for
  return ids
end function

function RokuEngine_GetCanvasLayerOrderValue(node as Object) as Integer
  if node = invalid or node.properties = invalid then return 0
  if node.properties.layer <> invalid then return Int(node.properties.layer)
  return 0
end function

sub RokuEngine_InitializeUiRuntime()
  if m.scene = invalid then return
  if m.scene.ui = invalid then
    m.scene.ui = {
      traversalIds: []
      canvasLayers: {}
      focusDirty: true
      lastFocusActionFrame: -1
    }
  end if
end sub

sub RokuEngine_RebuildUiRuntime()
  if m.scene = invalid then return
  m.InitializeUiRuntime()
  traversal = m.BuildUiTraversalNodeIds()
  ordered = []
  for each nodeId in traversal
    ordered.Push(nodeId)
  end for
  for i = 1 to ordered.Count() - 1
    currentId = ordered[i]
    currentValue = 0
    if m.scene.nodeMap.DoesExist(currentId) then currentValue = m.GetCanvasLayerOrderValue(m.scene.nodeMap[currentId])
    j = i - 1
    while j >= 0
      prevId = ordered[j]
      prevValue = 0
      if m.scene.nodeMap.DoesExist(prevId) then prevValue = m.GetCanvasLayerOrderValue(m.scene.nodeMap[prevId])
      if prevValue <= currentValue then exit while
      ordered[j + 1] = ordered[j]
      j = j - 1
    end while
    ordered[j + 1] = currentId
  end for
  m.scene.ui.traversalIds = ordered
  m.scene.ui.focusDirty = true
end sub

function RokuEngine_GetUiTraversalNodeIds() as Object
  if m.scene = invalid then return []
  m.InitializeUiRuntime()
  if m.scene.ui.traversalIds = invalid or type(m.scene.ui.traversalIds) <> "roArray" or m.scene.ui.focusDirty = true then
    m.RebuildUiRuntime()
  end if
  return m.scene.ui.traversalIds
end function
