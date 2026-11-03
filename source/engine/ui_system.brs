' ui_system.brs - UI runtime foundation (Phase 1)
' Screen-space UI tree management, layer/z-index sorting, visibility filtering.

' ── Type helpers ──────────────────────────────────────────────────────────────

function RokuEngine_IsUiNodeType(nodeType as Dynamic) as Boolean
  key = RokuEngine_Trim(RokuEngine_ToString(nodeType))
  return key = "CanvasLayer" or key = "Control" or key = "Label" or key = "Panel" or key = "TextureRect" or key = "Button" or key = "NineSlicePanel" or key = "MenuList" or key = "ProgressBar" or key = "CheckBox" or key = "Slider"
end function

function RokuEngine_IsWorldNodeType(nodeType as Dynamic) as Boolean
  return not RokuEngine_IsUiNodeType(nodeType) and RokuEngine_Trim(RokuEngine_ToString(nodeType)) <> "SceneRoot"
end function

' ── Screen-space transform ────────────────────────────────────────────────────
' UI nodes use screen-space coordinates (not affected by world camera).
' Returns a transform AA {x, y, scaleX, scaleY, opacity, visible}.

function RokuEngine_GetNodeScreenTransform(nodeId as String) as Object
  result = {x: 0.0, y: 0.0, width: m.width * 1.0, height: m.height * 1.0, scaleX: 1.0, scaleY: 1.0, opacity: 1.0, visible: true}
  if m.scene = invalid or not m.scene.nodeMap.DoesExist(nodeId) then return result
  ancestors = []
  current = m.scene.nodeMap[nodeId]
  while current <> invalid
    if current.visible = false then result.visible = false : return result
    ancestors.Unshift(current)
    ' CanvasLayer resets world ancestry: HUD coordinates never inherit camera.
    if current.type = "CanvasLayer" then exit while
    if current.parentId = invalid or not m.scene.nodeMap.DoesExist(current.parentId) then exit while
    current = m.scene.nodeMap[current.parentId]
  end while
  for each ancestor in ancestors
    t = ancestor.transform
    if t = invalid then t = {}
    p = ancestor.properties
    if p = invalid then p = {}
    x = _BRS_NumCoalesce(t.x, 0)
    y = _BRS_NumCoalesce(t.y, 0)
    anchored = false
    w = _BRS_NumCoalesce(p.width, result.width)
    h = _BRS_NumCoalesce(p.height, result.height)
    if ancestor.type = "CanvasLayer" then
      w = m.width : h = m.height
    else
      al = _BRS_NumCoalesce(p.anchorLeft, 0) : ar = _BRS_NumCoalesce(p.anchorRight, 0)
      at = _BRS_NumCoalesce(p.anchorTop, 0) : ab = _BRS_NumCoalesce(p.anchorBottom, 0)
      ml = _BRS_NumCoalesce(p.marginLeft, 0) : mr = _BRS_NumCoalesce(p.marginRight, 0)
      mt = _BRS_NumCoalesce(p.marginTop, 0) : mb = _BRS_NumCoalesce(p.marginBottom, 0)
      if p.anchorPreset <> invalid and p.anchorPreset <> "" and p.anchorPreset <> "top_left" and al = 0 and ar = 0 and at = 0 and ab = 0 then
        anchors = RokuEngine_ResolveAnchorPreset(p.anchorPreset)
        al = anchors.left : ar = anchors.right : at = anchors.top : ab = anchors.bottom
      end if
      if al <> 0 or ar <> 0 or at <> 0 or ab <> 0 or ml <> 0 or mr <> 0 or mt <> 0 or mb <> 0 then
        anchored = true
        x = al * result.width + ml
        y = at * result.height + mt
        if ar <> al then w = (ar - al) * result.width + mr - ml
        if ab <> at then h = (ab - at) * result.height + mb - mt
      end if
    end if
    sx = _BRS_NumCoalesce(t.scaleX, 1) : sy = _BRS_NumCoalesce(t.scaleY, 1)
    if not anchored then
      x = x - _BRS_NumCoalesce(t.pivotX, 0) * sx
      y = y - _BRS_NumCoalesce(t.pivotY, 0) * sy
    end if
    result.x = result.x + x * result.scaleX
    result.y = result.y + y * result.scaleY
    result.scaleX = result.scaleX * sx : result.scaleY = result.scaleY * sy
    result.width = w : result.height = h
    result.opacity = result.opacity * _BRS_NumCoalesce(p.opacity, 1)
    if ancestor.visible = false then result.visible = false
  end for
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
  m.RokuEngine_UpdateOptionBindings()
  m.RokuEngine_UpdateHighScoreBindings()
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
  m.scene.ui.focusDirty = false
  if m.focus <> invalid then m.focus.dirty = true
end sub

' ── Public accessor ───────────────────────────────────────────────────────────

function RokuEngine_GetUiTraversalNodeIds() as Object
  if m.scene = invalid then return []
  m.InitializeUiRuntime()
  if m.scene.ui.traversalIds = invalid or type(m.scene.ui.traversalIds) <> "roArray" or m.scene.ui.focusDirty = true then
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
