' FocusGroup scopes directional navigation and remembers selection across reopen.
function RokuFocusGroup_Owner(engine as Object, node as Dynamic) as Dynamic
  seen = {}
  while node <> invalid
    if seen.DoesExist(node.id) then return invalid
    seen[node.id] = true
    if node.type = "FocusGroup" then return node
    node = RokuGameplay_Resolve(engine, node.parentId)
  end while
  return invalid
end function

function RokuFocusGroup_Available(engine as Object, node as Dynamic) as Boolean
  seen = {}
  while node <> invalid
    if seen.DoesExist(node.id) then return false
    seen[node.id] = true
    if node.type = "FocusGroup" and node.properties.enabled = false then return false
    node = RokuGameplay_Resolve(engine, node.parentId)
  end while
  return true
end function

sub RokuFocusGroup_Update(engine as Object)
  if engine.scene = invalid then return
  for each node in engine.scene.doc.nodes
    if node.type <> "FocusGroup" then continue for
    rt = engine.EnsureNodeRuntime(node)
    wasShown = (rt.focusGroupShown = true)
    tf = engine.GetNodeScreenTransform(node.id)
    shown = tf.visible and tf.opacity > 0.001 and RokuFocusGroup_Available(engine, node)
    if rt.focusGroupShown = invalid or rt.focusGroupShown <> shown then
      engine.focus.dirty = true
      rt.focusGroupShown = shown
      if shown then engine.focus.pendingGroup = node.id
    end if
    if shown and wasShown then
      focused = RokuGameplay_Resolve(engine, engine.focus.focusedNodeId)
      owner = RokuFocusGroup_Owner(engine, focused)
      if owner <> invalid and owner.id = node.id then rt.lastFocus = focused.id
    end if
  end for
end sub

sub RokuFocusGroup_Restore(engine as Object)
  if engine.focus.pendingGroup = invalid or engine.focus.pendingGroup = "" then return
  group = RokuGameplay_Resolve(engine, engine.focus.pendingGroup)
  engine.focus.pendingGroup = ""
  if group = invalid then return
  rt = engine.EnsureNodeRuntime(group)
  if rt.focusGroupShown <> true then return
  initial = RokuGameplay_Resolve(engine, group.properties.initialFocus)
  desired = invalid
  if group.properties.restoreFocus <> false and rt.lastFocus <> invalid then
    remembered = RokuGameplay_Resolve(engine, rt.lastFocus)
    if remembered <> invalid then desired = remembered
  end if
  first = ""
  initialId = ""
  for each id in engine.focus.focusableIds
    owner = RokuFocusGroup_Owner(engine, RokuGameplay_Resolve(engine, id))
    if owner = invalid or owner.id <> group.id then continue for
    if first = "" then first = id
    if initial <> invalid and initial.id = id then initialId = id
    if desired <> invalid and desired.id = id then engine.focus.focusedNodeId = id : return
  end for
  if initialId <> "" then
    engine.focus.focusedNodeId = initialId
  else if first <> "" then
    engine.focus.focusedNodeId = first
  end if
end sub

function RokuFocusGroup_Wrap(engine as Object, fromId as String, direction as String, ids as Object) as String
  best = "" : bestScore = 1e18
  fromNode = RokuGameplay_Resolve(engine, fromId)
  if fromNode = invalid then return ""
  fromRect = engine._FM_GetNodeRect(fromNode, fromId)
  for each id in ids
    if id = fromId then continue for
    node = RokuGameplay_Resolve(engine, id)
    if node = invalid then continue for
    rect = engine._FM_GetNodeRect(node, id)
    score = 0.0
    if direction = "right" then score = rect.cx*10000+Abs(rect.cy-fromRect.cy)
    if direction = "left" then score = -rect.cx*10000+Abs(rect.cy-fromRect.cy)
    if direction = "down" then score = rect.cy*10000+Abs(rect.cx-fromRect.cx)
    if direction = "up" then score = -rect.cy*10000+Abs(rect.cx-fromRect.cx)
    if score < bestScore then bestScore = score : best = id
  end for
  return best
end function
