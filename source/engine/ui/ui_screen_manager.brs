' ui_screen_manager.brs — RGE Phase 6: UI Screen Manager
'
' Manages named UI screens (TitleScreen, PauseMenu, OptionsMenu, etc.).
' Each screen definition in the resource manifest maps a screen name to
' one or more CanvasLayer node ids in the current scene document.
'
' Screen lifecycle events (fired via script hooks):
'   UIScreen_Enter  {screenName, previous}
'   UIScreen_Exit   {screenName, next}
'   UIScreen_Pause  {screenName}  — screen goes behind another (push)
'   UIScreen_Resume {screenName}  — screen comes back to top (pop)
'
' Screen stack:
'   ChangeScreen  — pops all, loads new (replaces current)
'   PushScreen    — overlays new screen on top (current paused)
'   PopScreen     — returns to previous (resume)
'   ShowScreen    — makes screen visible without stack change (overlay)
'   HideScreen    — hides screen without stack change
'
' CanvasLayer nodes are linked to screens via node.properties.uiScreenName.
' Hidden screens have all their root CanvasLayers set invisible.

' ── Init ──────────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeScreenManager()
  if m.screenMgr = invalid then
    m.screenMgr = {
      screenStack:    []   ' [{name, rootIds[]}]
      visibleScreens: {}   ' {screenName: true}
      allScreens:     {}   ' {screenName: {name, type, rootNodeIds[], startupScreen}}
      startupScreen:  ""
      initialized:    false
    }
  end if
end sub

' ── Load screens from manifest ─────────────────────────────────────────────────
' Called once after scene load. Reads uiScreens from the resource manifest,
' then discovers which CanvasLayer nodes in the scene belong to each screen.

sub RokuEngine_LoadScreensFromManifest()
  m.InitializeScreenManager()
  m.screenMgr.allScreens  = {}
  m.screenMgr.startupScreen = ""

  manifest = invalid
  if m.resources <> invalid then manifest = m.resources.manifest
  if manifest = invalid then manifest = {}

  uiScreens = manifest.uiScreens
  if uiScreens = invalid or type(uiScreens) <> "roAssociativeArray" then uiScreens = {}

  for each screenName in uiScreens
    entry = uiScreens[screenName]
    if entry = invalid then continue for
    screenDef = {
      name:          screenName
      screenType:    _BRS_StrCoalesce(entry.screenType, "CustomScreen")
      rootNodeIds:   []
      startupScreen: (entry.startupScreen = true)
    }
    ' Collect explicitly listed rootNodeIds from manifest
    if type(entry.rootNodeIds) = "roArray" then
      for each nid in entry.rootNodeIds
        screenDef.rootNodeIds.Push(RokuEngine_Trim(RokuEngine_ToString(nid)))
      end for
    end if
    m.screenMgr.allScreens[screenName] = screenDef
    if screenDef.startupScreen and m.screenMgr.startupScreen = "" then
      m.screenMgr.startupScreen = screenName
    end if
  end for

  ' Also discover from scene nodes: any CanvasLayer with uiScreenName property
  m._SM_DiscoverScreensFromNodes()
  m.screenMgr.initialized = true
end sub

' Walk scene nodes and register any CanvasLayer that has uiScreenName set
sub _SM_DiscoverScreensFromNodes()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return
  for each node in m.scene.doc.nodes
    if node = invalid or node.type <> "CanvasLayer" then continue for
    props = node.properties
    if props = invalid then continue for
    screenName = ""
    if props.uiScreenName <> invalid then screenName = RokuEngine_Trim(RokuEngine_ToString(props.uiScreenName))
    if screenName = "" then continue for
    ' Create screen def if it doesn't exist yet
    if not m.screenMgr.allScreens.DoesExist(screenName) then
      m.screenMgr.allScreens[screenName] = {
        name:          screenName
        screenType:    "CustomScreen"
        rootNodeIds:   []
        startupScreen: false
      }
    end if
    def = m.screenMgr.allScreens[screenName]
    ' Add this node id if not already listed
    alreadyListed = false
    for each rid in def.rootNodeIds
      if rid = node.id then alreadyListed = true
    end for
    if not alreadyListed then def.rootNodeIds.Push(node.id)
  end for
end sub

' ── Startup ───────────────────────────────────────────────────────────────────

sub RokuEngine_ShowStartupScreen()
  m.InitializeScreenManager()
  m.LoadScreensFromManifest()

  ' Hide all screens initially
  m._SM_HideAllScreenRoots()

  startupName = m.screenMgr.startupScreen
  if startupName <> "" then
    m.ChangeScreen(startupName)
  else
    ' No startup screen defined — show all CanvasLayers (legacy behaviour)
    m._SM_ShowAllScreenRoots()
  end if
end sub

' ── Core API ──────────────────────────────────────────────────────────────────

' ChangeScreen — replaces current stack entirely with the named screen
sub RGE_UI_ChangeScreen(screenName as String)
  m.InitializeScreenManager()
  if screenName = invalid or screenName = "" then return
  prev = m._SM_TopStackName()

  ' Exit current
  if prev <> "" and prev <> screenName then
    m._SM_FireEvent("UIScreen_Exit", prev, screenName)
    m._SM_SetScreenVisible(prev, false)
  end if

  ' Clear stack
  m.screenMgr.screenStack = []
  m.screenMgr.visibleScreens = {}

  ' Push new
  m._SM_PushStack(screenName)
  m._SM_SetScreenVisible(screenName, true)
  m._SM_FireEvent("UIScreen_Enter", screenName, prev)
  m.SetFocusToScreen(screenName)
end sub

' PushScreen — overlays a new screen on top; current screen is paused
sub RGE_UI_PushScreen(screenName as String)
  m.InitializeScreenManager()
  if screenName = invalid or screenName = "" then return
  prev = m._SM_TopStackName()

  ' Pause current
  if prev <> "" then m._SM_FireEvent("UIScreen_Pause", prev, screenName)

  m._SM_PushStack(screenName)
  m._SM_SetScreenVisible(screenName, true)
  m._SM_FireEvent("UIScreen_Enter", screenName, prev)
  m.SetFocusToScreen(screenName)
end sub

' PopScreen — removes top screen, resumes the one beneath
function RGE_UI_PopScreen() as Boolean
  m.InitializeScreenManager()
  stack = m.screenMgr.screenStack
  if type(stack) <> "roArray" or stack.Count() = 0 then return false

  topEntry = stack.Pop()
  topName  = topEntry.name
  m._SM_FireEvent("UIScreen_Exit", topName, m._SM_TopStackName())
  m._SM_SetScreenVisible(topName, false)

  prevName = m._SM_TopStackName()
  if prevName <> "" then
    m._SM_SetScreenVisible(prevName, true)
    m._SM_FireEvent("UIScreen_Resume", prevName, topName)
    m.SetFocusToScreen(prevName)
  end if
  return true
end function

' ShowScreen — make a screen visible without modifying the stack
sub RGE_UI_ShowScreen(screenName as String)
  m.InitializeScreenManager()
  if screenName = invalid or screenName = "" then return
  m._SM_SetScreenVisible(screenName, true)
  m._SM_FireEvent("UIScreen_Enter", screenName, "")
end sub

' HideScreen — make a screen invisible without modifying the stack
sub RGE_UI_HideScreen(screenName as String)
  m.InitializeScreenManager()
  if screenName = invalid or screenName = "" then return
  m._SM_SetScreenVisible(screenName, false)
  m._SM_FireEvent("UIScreen_Exit", screenName, "")
end sub

' GetCurrentScreen — returns name of the top-of-stack screen
function RGE_UI_GetCurrentScreen() as String
  m.InitializeScreenManager()
  return m._SM_TopStackName()
end function

' IsScreenVisible — returns true if the named screen is currently shown
function RGE_UI_IsScreenVisible(screenName as String) as Boolean
  m.InitializeScreenManager()
  if screenName = invalid or screenName = "" then return false
  return m.screenMgr.visibleScreens.DoesExist(screenName) and m.screenMgr.visibleScreens[screenName] = true
end function

' ChangeScreen as alias for action dispatcher compatibility
sub RokuEngine_ChangeScreen(screenName as String)
  m.RGE_UI_ChangeScreen(screenName)
end sub

' ── Focus routing ─────────────────────────────────────────────────────────────
' When a screen becomes active, move focus to its first focusable node.

sub RokuEngine_SetFocusToScreen(screenName as String)
  if m.focus = invalid then return
  def = m._SM_GetDef(screenName)
  if def = invalid then return

  ' Collect all focusable node ids belonging to this screen's roots
  bestId = ""
  bestIsDefault = false
  uiIds = m.GetUiTraversalNodeIds()
  if type(uiIds) <> "roArray" then return

  ' Build set of root node ids for this screen
  rootSet = {}
  for each rid in def.rootNodeIds
    rootSet[rid] = true
  end for

  for each nodeId in uiIds
    if m.scene = invalid or m.scene.nodeMap = invalid then continue for
    if not m.scene.nodeMap.DoesExist(nodeId) then continue for
    node = m.scene.nodeMap[nodeId]
    if node = invalid then continue for
    ' Check ancestry to see if it belongs to this screen
    if not m._SM_NodeBelongsToScreen(node, rootSet) then continue for
    if m.IsNodeFocusable(node) then
      if bestId = "" then bestId = nodeId
      props = node.properties
      if props <> invalid and props.defaultFocus = true and not bestIsDefault then
        bestId = nodeId
        bestIsDefault = true
      end if
    end if
  end for

  if bestId <> "" then
    m.focus.focusedNodeId = bestId
    m.focus.defaultFocusSet = true
  end if
end sub

function _SM_NodeBelongsToScreen(node as Object, rootSet as Object) as Boolean
  ' Walk ancestor chain to find if any is in rootSet
  current = node
  steps = 0
  while current <> invalid and steps < 20
    if rootSet.DoesExist(current.id) then return true
    pid = current.parentId
    if pid = invalid or pid = "" then return false
    if m.scene = invalid or m.scene.nodeMap = invalid then return false
    if not m.scene.nodeMap.DoesExist(pid) then return false
    current = m.scene.nodeMap[pid]
    steps = steps + 1
  end while
  return false
end function

' ── Helpers ───────────────────────────────────────────────────────────────────

function _SM_GetDef(screenName as String) as Dynamic
  if m.screenMgr = invalid or screenName = "" then return invalid
  if m.screenMgr.allScreens.DoesExist(screenName) then return m.screenMgr.allScreens[screenName]
  return invalid
end function

function _SM_TopStackName() as String
  stack = m.screenMgr.screenStack
  if type(stack) <> "roArray" or stack.Count() = 0 then return ""
  return stack[stack.Count() - 1].name
end function

sub _SM_PushStack(screenName as String)
  if m.screenMgr.screenStack = invalid then m.screenMgr.screenStack = []
  m.screenMgr.screenStack.Push({ name: screenName })
end sub

' Show/hide all CanvasLayer roots belonging to this screen
sub _SM_SetScreenVisible(screenName as String, visible as Boolean)
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return
  def = m._SM_GetDef(screenName)
  if def = invalid then return

  if visible then
    m.screenMgr.visibleScreens[screenName] = true
  else
    if m.screenMgr.visibleScreens.DoesExist(screenName) then
      m.screenMgr.visibleScreens.Delete(screenName)
    end if
  end if

  rootSet = {}
  for each rid in def.rootNodeIds
    rootSet[rid] = true
  end for

  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    if node.type <> "CanvasLayer" then continue for
    if rootSet.DoesExist(node.id) then
      node.visible = visible
      ' Mark render caches dirty
      if m.scene.ui <> invalid then m.scene.ui.focusDirty = true
      if m.focus <> invalid then m.focus.dirty = true
    end if
  end for
end sub

sub _SM_HideAllScreenRoots()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return
  for each node in m.scene.doc.nodes
    if node = invalid or node.type <> "CanvasLayer" then continue for
    props = node.properties
    if props = invalid then continue for
    if props.uiScreenName <> invalid and RokuEngine_Trim(RokuEngine_ToString(props.uiScreenName)) <> "" then
      node.visible = false
    end if
  end for
end sub

sub _SM_ShowAllScreenRoots()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return
  for each node in m.scene.doc.nodes
    if node = invalid or node.type <> "CanvasLayer" then continue for
    node.visible = true
  end for
end sub

sub _SM_FireEvent(eventName as String, screenName as String, otherScreen as String)
  if m.scene = invalid then return
  m.RunScriptHooks(0.0, {
    name:        eventName
    phase:       "ui_screen"
    screenName:  screenName
    otherScreen: otherScreen
  })
end sub
