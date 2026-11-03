' ui_focus_manager.brs — RGE Phase 5: UI Focus, Navigation & Action Dispatch
'
' Manages which UI node is currently focused and handles all directional
' navigation (up/down/left/right) and action (accept/back) events.
'
' Focus states (stored per-node in runtime AA):
'   uiFocused    : Boolean — node currently has keyboard/remote focus
'   uiPressed    : Boolean — action button was pressed this frame
'   uiHovered    : Boolean — pointer is over this node (for future use)
'   uiDisabled   : Boolean — mirrors props.disabled, set during focus rebuild
'
' Navigation priority (per direction):
'   1. Manual link on the node  (props.focusUp / focusDown / focusLeft / focusRight)
'   2. Spatial nearest-neighbour in the requested direction
'
' Focusable node types (by default):
'   Button   — focusMode defaults to "all"
'   MenuList — focusMode defaults to "all"
'   Control  — focusable when props.focusMode = "all"
'   CheckBox — focusMode defaults to "all"
'   Slider   — focusMode defaults to "all"
'   Any node — if props.focusable = true  (escape hatch)
'
' Default focused node:
'   Scene may mark one node with  props.defaultFocus = true.
'   On initial load (or scene reset) that node receives focus first.
'   Without a defaultFocus node, the first focusable in traversal order wins.

' ── Initialise ────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeFocusManager()
  if m.focus = invalid then
    m.focus = {
      focusedNodeId:   ""
      focusableIds:    []
      dirty:           true
      defaultFocusSet: false
      actionQueue:     []
    }
  end if
  if m.focus.actionQueue = invalid then m.focus.actionQueue = []
end sub

' ── Focusability test ─────────────────────────────────────────────────────────

function RokuEngine_IsNodeFocusable(node as Object) as Boolean
  if node = invalid then return false
  if not m.IsUiNodeType(node.type) then return false
  props = node.properties
  if props = invalid then props = {}

  ' Hard-disabled nodes are never focusable
  if props.disabled = true then return false
  if node.visible = false then return false

  ' Explicit escape hatch: props.focusable = true overrides everything
  if props.focusable = true then return true

  ' Per-type defaults
  ntype = node.type
  if ntype = "Button" then return true
  if ntype = "MenuList" then return true
  if ntype = "CheckBox" then return true
  if ntype = "Slider"   then return true

  ' Control / generic: honour focusMode
  focusMode = "none"
  if props.focusMode <> invalid and props.focusMode <> "" then
    focusMode = LCase(RokuEngine_Trim(RokuEngine_ToString(props.focusMode)))
  end if
  return focusMode = "all"
end function

' ── Rebuild focusable list ────────────────────────────────────────────────────

sub RokuEngine_RebuildFocusables()
  m.InitializeFocusManager()
  ids = []
  defaultFocusId = ""

  uiIds = m.GetUiTraversalNodeIds()
  if type(uiIds) <> "roArray" then uiIds = []

  for each nodeId in uiIds
    if m.scene = invalid or m.scene.nodeMap = invalid then continue for
    if not m.scene.nodeMap.DoesExist(nodeId) then continue for
    node = m.scene.nodeMap[nodeId]
    if node = invalid then continue for
    if not m.IsNodeFocusable(node) then continue for

    ' Visibility + opacity gate
    tf = m.GetNodeScreenTransform(nodeId)
    if tf.visible = false or tf.opacity <= 0.001 then continue for

    ' Mark runtime disabled flag so renderer can read it
    runtime = m.EnsureNodeRuntime(node)
    props = node.properties
    if props = invalid then props = {}
    runtime.uiDisabled = (props.disabled = true)

    if m.IsNodeFocusable(node) then
      ids.Push(nodeId)
      if props.defaultFocus = true and defaultFocusId = "" then
        defaultFocusId = nodeId
      end if
    end if
  end for

  m.focus.focusableIds = ids
  m.focus.dirty        = false

  ' Resolve current focused node
  if ids.Count() = 0 then
    m.focus.focusedNodeId = ""
    return
  end if

  ' First scene load: honour defaultFocus, then traversal order
  if not m.focus.defaultFocusSet then
    m.focus.defaultFocusSet = true
    if defaultFocusId <> "" then
      m.focus.focusedNodeId = defaultFocusId
    else
      m.focus.focusedNodeId = ids[0]
    end if
    return
  end if

  ' Subsequent rebuilds: keep current if still valid
  if m.focus.focusedNodeId <> "" then
    for each fid in ids
      if fid = m.focus.focusedNodeId then return  ' still valid
    end for
  end if
  ' Lost — fall back to first or defaultFocus
  if defaultFocusId <> "" then
    m.focus.focusedNodeId = defaultFocusId
  else
    m.focus.focusedNodeId = ids[0]
  end if
end sub

' ── Accessors ─────────────────────────────────────────────────────────────────

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

' ── Spatial navigation ────────────────────────────────────────────────────────
' Finds the nearest focusable node in the requested direction from the current
' focus position. Uses centre-point distance with a directional bias.
'
' direction: "up" | "down" | "left" | "right"

sub RokuEngine_MoveFocusDirection(direction as String)
  m.InitializeFocusManager()
  if m.focus.dirty = true then m.RebuildFocusables()
  ids = m.focus.focusableIds
  if type(ids) <> "roArray" or ids.Count() = 0 then return

  currentId = m.focus.focusedNodeId

  ' Check for manual navigation link first
  if currentId <> "" and m.scene <> invalid and m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(currentId) then
    currentNode = m.scene.nodeMap[currentId]
    if currentNode <> invalid and currentNode.properties <> invalid then
      props = currentNode.properties
      manualTarget = ""
      if direction = "up"    and props.focusUp    <> invalid and props.focusUp    <> "" then manualTarget = RokuEngine_Trim(RokuEngine_ToString(props.focusUp))
      if direction = "down"  and props.focusDown  <> invalid and props.focusDown  <> "" then manualTarget = RokuEngine_Trim(RokuEngine_ToString(props.focusDown))
      if direction = "left"  and props.focusLeft  <> invalid and props.focusLeft  <> "" then manualTarget = RokuEngine_Trim(RokuEngine_ToString(props.focusLeft))
      if direction = "right" and props.focusRight <> invalid and props.focusRight <> "" then manualTarget = RokuEngine_Trim(RokuEngine_ToString(props.focusRight))

      if manualTarget <> "" then
        ' Resolve by id or by name
        resolved = m._FM_ResolveNodeIdByIdOrName(manualTarget)
        if resolved <> "" then
          m.focus.focusedNodeId = resolved
          return
        end if
      end if
    end if
  end if

  ' Spatial search
  bestId = m._FM_FindSpatialNearest(currentId, direction, ids)
  if bestId <> "" then m.focus.focusedNodeId = bestId
end sub

' Legacy: move focus by linear directionStep (up/left = -1, down/right = +1)
sub RokuEngine_MoveFocus(directionStep as Integer)
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
    currentIndex = currentIndex + directionStep
    if currentIndex < 0 then currentIndex = ids.Count() - 1
    if currentIndex >= ids.Count() then currentIndex = 0
  end if
  m.focus.focusedNodeId = ids[currentIndex]
end sub

' ── Spatial nearest-neighbour search ─────────────────────────────────────────

function _FM_FindSpatialNearest(fromId as String, direction as String, ids as Object) as String
  ' Get bounding rect of the current node
  fromCx = 0.0
  fromCy = 0.0
  fromR  = invalid
  if fromId <> "" and m.scene <> invalid and m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(fromId) then
    fromNode = m.scene.nodeMap[fromId]
    fromR = m._FM_GetNodeRect(fromNode, fromId)
    fromCx = fromR.cx
    fromCy = fromR.cy
  end if

  bestId    = ""
  bestScore = 1e18   ' lower = better

  for each candidateId in ids
    if candidateId = fromId then continue for
    if m.scene = invalid or m.scene.nodeMap = invalid then continue for
    if not m.scene.nodeMap.DoesExist(candidateId) then continue for
    node = m.scene.nodeMap[candidateId]
    if node = invalid then continue for
    cr = m._FM_GetNodeRect(node, candidateId)

    ' Direction gate: candidate must be roughly in the requested direction
    dx = cr.cx - fromCx
    dy = cr.cy - fromCy
    inDirection = false
    if direction = "up"    and dy < -4   then inDirection = true
    if direction = "down"  and dy >  4   then inDirection = true
    if direction = "left"  and dx < -4   then inDirection = true
    if direction = "right" and dx >  4   then inDirection = true
    if not inDirection then continue for

    ' Score: primary axis distance + smaller secondary axis penalty
    primaryDist = 0.0
    secondaryDist = 0.0
    if direction = "up"   or direction = "down"  then primaryDist = Abs(dy) : secondaryDist = Abs(dx)
    if direction = "left" or direction = "right" then primaryDist = Abs(dx) : secondaryDist = Abs(dy)

    score = primaryDist + secondaryDist * 0.5
    if score < bestScore then
      bestScore = score
      bestId    = candidateId
    end if
  end for

  return bestId
end function

function _FM_GetNodeRect(node as Object, nodeId as String) as Object
  tf = m.GetNodeScreenTransform(nodeId)
  props = node.properties
  w = 80.0 : h = 40.0
  if props <> invalid then
    if props.width  <> invalid then w = RokuEngine_ToFloat(props.width)
    if props.height <> invalid then h = RokuEngine_ToFloat(props.height)
  end if
  w = tf.width * tf.scaleX : h = tf.height * tf.scaleY
  return { x: tf.x, y: tf.y, w: w, h: h, cx: tf.x + w * 0.5, cy: tf.y + h * 0.5 }
end function

function _FM_ResolveNodeIdByIdOrName(target as String) as String
  if m.scene = invalid or m.scene.nodeMap = invalid then return ""
  ' Try direct ID match
  if m.scene.nodeMap.DoesExist(target) then return target
  ' Try name match
  if type(m.scene.doc.nodes) = "roArray" then
    for each node in m.scene.doc.nodes
      if node <> invalid and RokuEngine_Trim(RokuEngine_ToString(node.name)) = target then return node.id
    end for
  end if
  return ""
end function

' ── Input handling ────────────────────────────────────────────────────────────

sub RokuEngine_HandleFocusInput(event as Object)
  if m.scene = invalid or event = invalid then return
  if event.isPress <> true then return

  actionName = ""
  if event.action <> invalid then actionName = LCase(RokuEngine_Trim(RokuEngine_ToString(event.action)))
  if actionName = "" then return

  m.InitializeFocusManager()

  if m.GetFocusedNode() = invalid and actionName <> "back" then return

  ' Directional navigation
  if actionName = "move_up"    then m.MoveFocusDirection("up")    : event.consumed = true : return
  if actionName = "move_down"  then m.MoveFocusDirection("down")  : event.consumed = true : return
  if actionName = "move_left"  then m.MoveFocusDirection("left")  : event.consumed = true : return
  if actionName = "move_right" then m.MoveFocusDirection("right") : event.consumed = true : return

  ' Accept / action
  if actionName = "action" then
    focused = m.GetFocusedNode()
    if focused <> invalid and focused.properties <> invalid then
      if focused.properties.disabled <> true then
        runtime = m.EnsureNodeRuntime(focused)
        runtime.uiPressed      = true
        runtime.uiPressedFrame = m.frameNumber
        ' Queue the action for the frame-end dispatcher
        m._FM_QueueAction(focused)
        event.consumed = true
      end if
    end if
    return
  end if

  ' Back / cancel
  if actionName = "back" then
    focused = m.GetFocusedNode()
    if focused <> invalid and focused.properties <> invalid then
      backAction = focused.properties.actionBack
      if backAction <> invalid and backAction <> "" then
        m._FM_DispatchNamedAction(backAction)
        event.consumed = true
        return
      end if
    end if
    ' Default back: let it fall through to normal back handling (scene pop)
    m._FM_DispatchNamedAction("back")
  end if
end sub

' ── Action dispatch ───────────────────────────────────────────────────────────

sub _FM_QueueAction(node as Object)
  m.InitializeFocusManager()
  if node = invalid then return
  props = node.properties
  if props = invalid then return
  actionStr = ""
  if props.action <> invalid then actionStr = RokuEngine_Trim(RokuEngine_ToString(props.action))
  if actionStr = "" then return
  m.focus.actionQueue.Push({ nodeId: node.id, action: actionStr, nodeName: node.name })
end sub

' Called at end of frame (from UpdateFocusState) to process queued actions
sub _FM_FlushActionQueue()
  if m.focus = invalid or m.focus.actionQueue = invalid then return
  for each entry in m.focus.actionQueue
    if entry <> invalid then m._FM_DispatchNamedAction(entry.action)
  end for
  m.focus.actionQueue = []
end sub

sub _FM_DispatchNamedAction(actionStr as String)
  if actionStr = invalid or actionStr = "" then return
  action = LCase(RokuEngine_Trim(actionStr))

  ' Built-in actions
  if action = "back" then
    m.PopScene()
    return
  end if
  if action = "quit_to_title" or action = "quit" then
    m.QueueSceneChange(m.initialSceneName)
    return
  end if
  if action = "start_game" then
    m.QueueSceneChange("Game")
    return
  end if
  if action = "resume_game" then
    m.SetPaused(false)
    return
  end if
  if action = "open_options" then
    m.PushScene("Options")
    return
  end if
  if action = "close" or action = "close_dialog" then
    m.PopScene()
    return
  end if

  ' Scene change: "scene:SceneName"
  if Left(action, 6) = "scene:" then
    sceneName = RokuEngine_Trim(Mid(actionStr, 7))
    if sceneName <> "" then m.QueueSceneChange(sceneName)
    return
  end if

  ' Push scene: "push:SceneName"
  if Left(action, 5) = "push:" then
    sceneName = RokuEngine_Trim(Mid(actionStr, 6))
    if sceneName <> "" then m.PushScene(sceneName)
    return
  end if

  ' UI Screen change: "screen:ScreenName"
  if Left(action, 7) = "screen:" then
    screenName = RokuEngine_Trim(Mid(actionStr, 8))
    if screenName <> "" then m.RGE_UI_ChangeScreen(screenName)
    return
  end if

  ' UI Screen push: "pushscreen:ScreenName"
  if Left(action, 11) = "pushscreen:" then
    screenName = RokuEngine_Trim(Mid(actionStr, 12))
    if screenName <> "" then m.RGE_UI_PushScreen(screenName)
    return
  end if

  ' UI Screen pop: "popscreen"
  if action = "popscreen" then
    m.RGE_UI_PopScreen()
    return
  end if

  ' UI Transition to screen: "transition_screen:ScreenName" (uses default fade)
  if Left(action, 18) = "transition_screen:" then
    screenName = RokuEngine_Trim(Mid(actionStr, 19))
    if screenName <> "" then m.RGE_UI_TransitionToScreen(screenName, invalid)
    return
  end if

  ' UI Transition to scene: "transition_scene:SceneName"
  if Left(action, 17) = "transition_scene:" then
    sceneName = RokuEngine_Trim(Mid(actionStr, 18))
    if sceneName <> "" then m.RGE_UI_TransitionToScene(sceneName, invalid)
    return
  end if

  ' Script event: fire a custom SceneExit-style event that scripts can handle
  ' "custom:EventName" — emits the event to all ScriptComponent listeners
  if Left(action, 7) = "custom:" then
    eventName = RokuEngine_Trim(Mid(actionStr, 8))
    if eventName <> "" then
      m.RunScriptHooks(0.0, { name: eventName, phase: "ui_action", action: actionStr })
    end if
    return
  end if

  ' Cycle option value: "option_cycle:optionKey"
  if Left(action, 13) = "option_cycle:" then
    optKey = RokuEngine_Trim(Mid(actionStr, 14))
    if optKey <> "" then m.RGE_Options_Cycle(optKey)
    return
  end if

  ' Set option: "option_set:optionKey=value"
  if Left(action, 11) = "option_set:" then
    rest = RokuEngine_Trim(Mid(actionStr, 12))
    eqIdx = InStr(rest, "=")
    if eqIdx > 0 then
      optKey = Left(rest, eqIdx - 1)
      optVal = Mid(rest, eqIdx + 1)
      m.RGE_Options_Set(optKey, optVal)
    end if
    return
  end if

  ' Reset all options: "options_reset"
  if action = "options_reset" then
    m.RGE_Options_ResetAll()
    return
  end if

  ' Unknown actions are forwarded as custom events to scripts
  m.RunScriptHooks(0.0, { name: "UIAction", phase: "ui_action", action: actionStr })
end sub

' ── Focus state update (called every frame) ───────────────────────────────────

sub RokuEngine_UpdateFocusState()
  m.InitializeFocusManager()
  if m.focus.dirty = true then m.RebuildFocusables()

  focusedId = m.GetFocusedNodeId()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return

  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    runtime = m.EnsureNodeRuntime(node)
    runtime.uiFocused = (node.id = focusedId)

    ' Clear press after one frame
    if runtime.uiPressed = true and runtime.uiPressedFrame <> m.frameNumber then
      runtime.uiPressed = false
    end if
  end for

  ' Phase 8: update option and high-score label bindings
  m.UpdateUiBindings()

  ' Dispatch queued actions at the end of the state update
  m._FM_FlushActionQueue()
end sub
