' ui_system.brs - UI runtime foundation (Phase 1)
' Screen-space UI tree management, layer/z-index sorting, visibility filtering.

' ── Type helpers ──────────────────────────────────────────────────────────────

function RokuEngine_IsUiNodeType(nodeType as Dynamic) as Boolean
  key = Trim(Str(nodeType))
  return key = "CanvasLayer" _
    or key = "Control" _
    or key = "Label" _
    or key = "Panel" _
    or key = "TextureRect" _
    or key = "Button" _
    or key = "NineSlicePanel" _
    or key = "MenuList" _
    or key = "ProgressBar" _
    or key = "CheckBox" _
    or key = "Slider"
end function

function RokuEngine_IsWorldNodeType(nodeType as Dynamic) as Boolean
  return not RokuEngine_IsUiNodeType(nodeType) and Trim(Str(nodeType)) <> "SceneRoot"
end function

' ── Screen-space transform ────────────────────────────────────────────────────
' UI nodes use screen-space coordinates (not affected by world camera).
' Returns a transform AA {x, y, scaleX, scaleY, opacity, visible}.

function RokuEngine_GetNodeScreenTransform(nodeId as String) as Object
  result = {x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, opacity: 1.0, visible: true}
  if m.scene = invalid then return result
  if m.scene.nodeMap = invalid or not m.scene.nodeMap.DoesExist(nodeId) then return result

  node = m.scene.nodeMap[nodeId]
  if node = invalid then return result

  ' Accumulate transform up through ancestors
  ancestors = []
  current = node
  while current <> invalid
    ancestors.Unshift(current)
    if current.parentId = invalid or current.parentId = "" then exit while
    if m.scene.nodeMap.DoesExist(current.parentId) then
      current = m.scene.nodeMap[current.parentId]
    else
      exit while
    end if
  end while

  accX = 0.0
  accY = 0.0
  accOpacity = 1.0
  accVisible = true

  for each ancestor in ancestors
    if ancestor = invalid then continue for
    t = ancestor.transform
    if t = invalid then t = {}
    accX = accX + _BRS_IntOr(t.x, 0)
    accY = accY + _BRS_IntOr(t.y, 0)
    if ancestor.properties <> invalid and ancestor.properties.opacity <> invalid then
      accOpacity = accOpacity * Float(ancestor.properties.opacity)
    end if
    if ancestor.visible = false then accVisible = false
  end for

  result.x = accX
  result.y = accY
  result.scaleX = 1.0
  result.scaleY = 1.0
  result.opacity = accOpacity
  result.visible = accVisible
  return result
end function

' ── Canvas-layer order value ──────────────────────────────────────────────────

function RokuEngine_GetCanvasLayerOrderValue(node as Object) as Integer
  if node = invalid or node.properties = invalid then return 0
  if node.properties.layer <> invalid then return Int(node.properties.layer)
  return 0
end function

' ── UI traversal (all visible UI nodes in scene) ─────────────────────────────

function RokuEngine_BuildUiTraversalNodeIds() as Object
  ids = []
  if m.scene = invalid then return ids
  traversalIds = m.BuildTraversalNodeIds()
  if type(traversalIds) <> "roArray" then return ids
  for each nodeId in traversalIds
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      if node <> invalid and m.IsUiNodeType(node.type) then
        ids.Push(nodeId)
      end if
    end if
  end for
  return ids
end function

' ── UI runtime init ───────────────────────────────────────────────────────────

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
  ' Initialize screen manager on first UI runtime init
  m.InitializeScreenManager()
  ' Phase 8: initialise persistent storage, options and high scores
  m.InitializeStorage()
  m.InitializeOptions()
  m.InitializeHighScores()
end sub

' Phase 8: call binding updates each frame (called from UpdateFocusState)
sub RokuEngine_UpdateUiBindings()
  RokuEngine_UpdateOptionBindings()
  RokuEngine_UpdateHighScoreBindings()
end sub


sub RokuEngine_RebuildUiRuntime()
  if m.scene = invalid then return
  m.InitializeUiRuntime()
  raw = m.BuildUiTraversalNodeIds()

  ' Build sortable list
  entries = []
  for each nodeId in raw
    node = invalid
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
    end if
    layerVal = 0
    zVal = 0
    if node <> invalid then
      if node.type = "CanvasLayer" and node.properties <> invalid and node.properties.layer <> invalid then
        layerVal = Int(node.properties.layer)
      end if
      ' Inherit parent CanvasLayer layer for children
      if node.type <> "CanvasLayer" then
        parentId = node.parentId
        steps = 0
        while parentId <> invalid and parentId <> "" and steps < 20
          if m.scene.nodeMap.DoesExist(parentId) then
            parent = m.scene.nodeMap[parentId]
            if parent <> invalid and parent.type = "CanvasLayer" and parent.properties <> invalid then
              layerVal = _BRS_IntOr(parent.properties.layer, 0)
              exit while
            end if
            parentId = parent.parentId
          else
            exit while
          end if
          steps = steps + 1
        end while
      end if
      if node.zIndex <> invalid then zVal = Int(node.zIndex)
    end if
    entries.Push({id: nodeId, layer: layerVal, z: zVal})
  end for

  ' Insertion sort (stable)
  for i = 1 to entries.Count() - 1
    cur = entries[i]
    j = i - 1
    while j >= 0
      prev = entries[j]
      ' Compare: layer first, then z
      less = prev.layer > cur.layer or (prev.layer = cur.layer and prev.z > cur.z)
      if not less then exit while
      entries[j + 1] = entries[j]
      j = j - 1
    end while
    entries[j + 1] = cur
  end for

  sorted = []
  for each entry in entries
    sorted.Push(entry.id)
  end for

  m.scene.ui.traversalIds = sorted
  m.scene.ui.focusDirty = true
end sub

' ── Public accessor ───────────────────────────────────────────────────────────

function RokuEngine_GetUiTraversalNodeIds() as Object
  if m.scene = invalid then return []
  m.InitializeUiRuntime()
  if m.scene.ui.traversalIds = invalid _
    or type(m.scene.ui.traversalIds) <> "roArray" _
    or m.scene.ui.focusDirty = true then
    m.RebuildUiRuntime()
  end if
  return m.scene.ui.traversalIds
end function

' ── Anchor preset helper ─────────────────────────────────────────────────────
' Resolves an anchor preset string to {left, top, right, bottom} fractions.

function RokuEngine_ResolveAnchorPreset(preset as String) as Object
  if preset = "full_rect"      then return {left: 0.0, top: 0.0, right: 1.0, bottom: 1.0}
  if preset = "top_left"       then return {left: 0.0, top: 0.0, right: 0.0, bottom: 0.0}
  if preset = "top_center"     then return {left: 0.5, top: 0.0, right: 0.5, bottom: 0.0}
  if preset = "top_right"      then return {left: 1.0, top: 0.0, right: 1.0, bottom: 0.0}
  if preset = "center_left"    then return {left: 0.0, top: 0.5, right: 0.0, bottom: 0.5}
  if preset = "center"         then return {left: 0.5, top: 0.5, right: 0.5, bottom: 0.5}
  if preset = "center_right"   then return {left: 1.0, top: 0.5, right: 1.0, bottom: 0.5}
  if preset = "bottom_left"    then return {left: 0.0, top: 1.0, right: 0.0, bottom: 1.0}
  if preset = "bottom_center"  then return {left: 0.5, top: 1.0, right: 0.5, bottom: 1.0}
  if preset = "bottom_right"   then return {left: 1.0, top: 1.0, right: 1.0, bottom: 1.0}
  ' Default: top-left
  return {left: 0.0, top: 0.0, right: 0.0, bottom: 0.0}
end function
