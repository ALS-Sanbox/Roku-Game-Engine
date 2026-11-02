' input.brs - generated classic 2D runtime

function RokuEngine_DefaultActionMap() as Object
  return {
    move_up: "up"
    move_down: "down"
    move_left: "left"
    move_right: "right"
    action: "ok"
    pause: "play"
    back: "back"
  }
end function

function RokuEngine_ButtonNameToCode(buttonName as Dynamic) as Integer
  key = LCase(RokuEngine_Trim(RokuEngine_ToString(buttonName)))
  if key = "up" then return 2
  if key = "down" then return 3
  if key = "left" then return 4
  if key = "right" then return 5
  if key = "ok" then return 6
  if key = "back" then return 0
  if key = "play" or key = "playpause" or key = "play_pause" then return 13
  if key = "rev" or key = "rewind" then return 8
  if key = "fwd" or key = "fastforward" then return 9
  if key = "options" or key = "star" then return 10
  if Val(key) > 0 then return Val(key)
  return -1
end function

function RokuEngine_CodeToDefaultButtonName(code as Integer) as String
  if code = 2 then return "up"
  if code = 3 then return "down"
  if code = 4 then return "left"
  if code = 5 then return "right"
  if code = 6 then return "ok"
  if code = 0 then return "back"
  if code = 13 then return "play"
  if code = 8 then return "rev"
  if code = 9 then return "fwd"
  if code = 10 then return "options"
  return ""
end function

function RokuEngine_NormalizeActionMap(actionMap as Dynamic) as Object
  defaultMap = RokuEngine_DefaultActionMap()
  normalized = {}
  source = actionMap
  if source = invalid then
    source = {}
    if m <> invalid and m.projectSettings <> invalid and m.projectSettings.input <> invalid and m.projectSettings.input.actionMap <> invalid then
      source = m.projectSettings.input.actionMap
    end if
  end if

  for each actionName in defaultMap
    buttonName = defaultMap[actionName]
    if source.DoesExist(actionName) and source[actionName] <> invalid and source[actionName] <> "" then buttonName = source[actionName]
    normalized[actionName] = LCase(RokuEngine_Trim(RokuEngine_ToString(buttonName)))
  end for
  return normalized
end function

function RokuEngine_GetActionForButtonCode(code as Integer) as String
  buttonName = RokuEngine_CodeToDefaultButtonName(code)
  if buttonName = "" then return ""
  actionMap = m.inputActionMap
  if actionMap = invalid then actionMap = RokuEngine_DefaultActionMap()
  for each actionName in actionMap
    mappedName = LCase(RokuEngine_Trim(RokuEngine_ToString(actionMap[actionName])))
    if mappedName = buttonName then return actionName
  end for
  return buttonName
end function

sub RokuEngine_PumpPlatformMessages()
  msg = m.port.GetMessage()
  while msg <> invalid
    m.ProcessMessages(msg)
    msg = m.port.GetMessage()
  end while
end sub

sub RokuEngine_ProcessMessages(msg as Dynamic)
  if msg = invalid then return

  msgType = type(msg)
  if msgType = "roUniversalControlEvent" then
    m.HandleInputEvent(msg)
    return
  end if

  if msgType = "roAudioPlayerEvent" then
    if m.HandleAudioEvent <> invalid then m.HandleAudioEvent(msg)
    return
  end if

  if msgType = "roScreenEvent" then
    if msg.isScreenClosed() then m.running = false
    return
  end if
end sub

sub RokuEngine_HandleInputEvent(msg as Object)
  if msg = invalid then return
  code = msg.GetInt()
  isPress = true
  isRelease = false
  if msg.isPress <> invalid then isPress = msg.isPress()
  if msg.isRelease <> invalid then isRelease = msg.isRelease()
  if isRelease then isPress = false
  m.HandleButtonCode(code, isPress, isRelease)
end sub

sub RokuEngine_HandleButtonCode(code as Integer, isPress as Dynamic, isRelease as Dynamic)
  if isPress = invalid then isPress = true
  if isRelease = invalid then isRelease = false
  ' Back button (code 0) — only quit if UI focus manager doesn't consume it
  ' The focus manager will call PopScene/QueueSceneChange for "back" actions.
  ' We still need to handle the case where no UI is active.
  if code = 0 then
    ' Queue back as a regular action; the focus manager and scripts handle it.
    ' If nothing consumes it, the scene stack pop / quit happens in _FM_DispatchNamedAction.
    ' For scenes with no UI, we maintain original behaviour via the fallthrough below.
  end if

  if m.inputState = invalid then m.inputState = { rawEvents: [], frameEvents: [], pressedActions: {}, releasedActions: {}, heldActions: {} }
  if m.inputState.rawEvents = invalid or type(m.inputState.rawEvents) <> "roArray" then m.inputState.rawEvents = []

  actionName = m.GetActionForButtonCode(code)
  rawEvent = {
    code: code
    action: actionName
    raw: RokuEngine_CodeToDefaultButtonName(code)
    frame: m.frameNumber
    isPress: (isPress <> false)
    isRelease: (isRelease = true)
    consumed: false
  }
  m.inputState.rawEvents.Push(rawEvent)
end sub
