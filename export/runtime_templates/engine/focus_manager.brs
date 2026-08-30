' focus_manager.brs - Roku-friendly focus navigation for UI nodes

sub RokuEngine_InitializeFocusManager()
  if m.focus = invalid then
    m.focus = {
      focusedNodeId: ""
      focusableIds: []
      dirty: true
    }
  end if
end sub

function RokuEngine_IsNodeFocusable(node as Object) as Boolean
  if node = invalid then return false
  if not m.IsUiNodeType(node.type) then return false
  props = node.properties
  if props = invalid then props = {}
  if props.disabled = true then return false
  focusMode = "none"
  if props.focusMode <> invalid and props.focusMode <> "" then focusMode = LCase(Trim(Str(props.focusMode)))
  if node.type = "Button" and focusMode = "none" then focusMode = "all"
  return focusMode = "all"
end function

sub RokuEngine_RebuildFocusables()
  m.InitializeFocusManager()
  ids = []
  uiIds = m.GetUiTraversalNodeIds()
  if type(uiIds) <> "roArray" then uiIds = []
  for each nodeId in uiIds
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      world = m.GetNodeScreenTransform(nodeId)
      if node <> invalid and world.visible <> false and world.opacity > 0 and m.IsNodeFocusable(node) then ids.Push(nodeId)
    end if
  end for
  m.focus.focusableIds = ids
  m.focus.dirty = false
  if ids.Count() = 0 then
    m.focus.focusedNodeId = ""
  else if m.focus.focusedNodeId = "" then
    m.focus.focusedNodeId = ids[0]
  else
    exists = false
    for each focusId in ids
      if focusId = m.focus.focusedNodeId then exists = true
    end for
    if not exists then m.focus.focusedNodeId = ids[0]
  end if
end sub

function RokuEngine_GetFocusedNodeId() as String
  m.InitializeFocusManager()
  if m.focus.dirty = true then m.RebuildFocusables()
  return m.focus.focusedNodeId
end function

function RokuEngine_GetFocusedNode() as Dynamic
  nodeId = m.GetFocusedNodeId()
  if nodeId = "" or m.scene = invalid or m.scene.nodeMap = invalid then return invalid
  if m.scene.nodeMap.DoesExist(nodeId) then return m.scene.nodeMap[nodeId]
  return invalid
end function

sub RokuEngine_SetFocusedNode(nodeId as String)
  m.InitializeFocusManager()
  if nodeId = invalid then nodeId = ""
  m.focus.focusedNodeId = nodeId
end sub

sub RokuEngine_MoveFocus(step as Integer)
  m.InitializeFocusManager()
  if m.focus.dirty = true then m.RebuildFocusables()
  ids = m.focus.focusableIds
  if type(ids) <> "roArray" or ids.Count() = 0 then
    m.focus.focusedNodeId = ""
    return
  end if
  currentIndex = -1
  for i = 0 to ids.Count() - 1
    if ids[i] = m.focus.focusedNodeId then
      currentIndex = i
      exit for
    end if
  end for
  if currentIndex < 0 then
    currentIndex = 0
  else
    currentIndex = currentIndex + step
    if currentIndex < 0 then currentIndex = ids.Count() - 1
    if currentIndex >= ids.Count() then currentIndex = 0
  end if
  m.focus.focusedNodeId = ids[currentIndex]
end sub

sub RokuEngine_HandleFocusInput(event as Object)
  if m.scene = invalid or event = invalid then return
  actionName = ""
  if event.action <> invalid then actionName = LCase(Trim(Str(event.action)))
  if actionName = "" then return
  if event.isPress <> true then return
  m.InitializeFocusManager()
  if actionName = "move_up" or actionName = "move_left" then
    m.MoveFocus(-1)
    event.consumed = true
  else if actionName = "move_down" or actionName = "move_right" then
    m.MoveFocus(1)
    event.consumed = true
  else if actionName = "action" then
    focused = m.GetFocusedNode()
    if focused <> invalid then
      runtime = m.EnsureNodeRuntime(focused)
      runtime.uiPressed = true
      runtime.uiPressedFrame = m.frameNumber
      event.consumed = true
    end if
  end if
end sub

sub RokuEngine_UpdateFocusState()
  m.InitializeFocusManager()
  if m.focus.dirty = true then m.RebuildFocusables()
  focusedId = m.GetFocusedNodeId()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return
  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    runtime = m.EnsureNodeRuntime(node)
    runtime.uiFocused = (node.id = focusedId)
    if runtime.uiPressed = true and runtime.uiPressedFrame <> m.frameNumber then runtime.uiPressed = false
  end for
end sub
