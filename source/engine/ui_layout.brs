' Container geometry is resolved on demand, without rewriting authored child data.
function RokuUi_LayoutChild(engine as Object, parent as Object, child as Object, width as Float, height as Float) as Dynamic
  p = parent.properties : cp = child.properties : t = child.transform
  if p = invalid then p = {}
  if cp = invalid then cp = {}
  if t = invalid then t = {}
  kind = parent.type
  if kind = "MarginContainer" then
    left = _BRS_NumCoalesce(p.paddingLeft, 8) : top = _BRS_NumCoalesce(p.paddingTop, 8)
    w = width-left-_BRS_NumCoalesce(p.paddingRight, 8) : h = height-top-_BRS_NumCoalesce(p.paddingBottom, 8)
    if w < 1 then w = 1
    if h < 1 then h = 1
    return { x: left, y: top, width: w, height: h }
  end if
  if kind = "ScrollContainer" then
    sx = _BRS_NumCoalesce(t.scaleX, 1) : sy = _BRS_NumCoalesce(t.scaleY, 1)
    return { x: -_BRS_NumCoalesce(p.scrollOffsetX, 0), y: -_BRS_NumCoalesce(p.scrollOffsetY, 0), width: _BRS_NumCoalesce(cp.width, width), height: _BRS_NumCoalesce(cp.height, height) }
  end if
  if kind <> "HBoxContainer" and kind <> "VBoxContainer" then return invalid
  children = [] : total = 0.0
  for each node in engine.scene.doc.nodes
    if node.parentId <> parent.id or node.visible = false or not engine.IsUiNodeType(node.type) then continue for
    natural = _BRS_NumCoalesce(node.properties.width, 80)
    if kind = "VBoxContainer" then natural = _BRS_NumCoalesce(node.properties.height, 40)
    if natural < 1 then natural = 1
    children.Push({ id: node.id, size: natural }) : total = total+natural
  end for
  separation = _BRS_NumCoalesce(p.separation, 4)
  if separation < 0 then separation = 0
  extent = width
  if kind = "VBoxContainer" then extent = height
  available = extent-separation*(children.Count()-1)
  if available < 0 then available = 0
  scale = 1.0
  if total > available and total > 0 then scale = available/total
  totalFinal = 0.0
  for each entry in children
    entry.size = Int(entry.size*scale+0.5)
    if entry.size < 1 then entry.size = 1
    totalFinal = totalFinal+entry.size
  end for
  cursor = 0.0 : remaining = extent-totalFinal-separation*(children.Count()-1)
  if p.alignment = "center" then cursor = Int(remaining/2+0.5)
  if p.alignment = "end" then cursor = remaining
  for each entry in children
    if entry.id = child.id then
      if kind = "HBoxContainer" then return { x: cursor, y: 0, width: entry.size, height: height }
      return { x: 0, y: cursor, width: width, height: entry.size }
    end if
    cursor = cursor+entry.size+separation
  end for
  return invalid
end function

sub RokuUi_DrawButtonShape(screen as Object, kind as String, x as Integer, y as Integer, width as Integer, height as Integer, fill as Integer, border as Integer)
  if width <= 0 or height <= 0 then return
  if kind = "Button" then
    screen.DrawRect(x, y, width, height, fill)
    RokuEngine_DrawUiOutlineRect(screen, x, y, width, height, border)
    return
  end if
  ' Scanlines use only roScreen primitives and preserve alpha on every row.
  for row = 0 to height-1
    if kind = "TriangleButton" then
      half = (width-1)*0.5*row/(height-1+0.000001)
    else
      normalized = (row+0.5-height*0.5)/(height*0.5)
      value = 1-normalized*normalized
      if value < 0 then value = 0
      half = width*0.5*Sqr(value)
    end if
    left = Int(x+width*0.5-half) : right = Int(x+width*0.5+half)
    if right >= x+width then right = x+width-1
    screen.DrawLine(left, y+row, right, y+row, fill)
    screen.DrawLine(left, y+row, left, y+row, border)
    screen.DrawLine(right, y+row, right, y+row, border)
  end for
  if kind = "TriangleButton" then screen.DrawLine(x, y+height-1, x+width-1, y+height-1, border)
end sub

function RokuUi_MenuInput(engine as Object, node as Object, action as String) as Boolean
  p = node.properties : items = p.items
  if type(items) <> "roArray" or items.Count() = 0 then return false
  index = Int(_BRS_NumCoalesce(p.selectedIndex, 0))
  if index < 0 then index = 0
  if index >= items.Count() then index = items.Count()-1
  if action = "move_up" or action = "move_down" then
    stepValue = 1
    if action = "move_up" then stepValue = -1
    candidate = index
    for i = 1 to items.Count()
      candidate = candidate+stepValue
      if p.wrap = false and (candidate < 0 or candidate >= items.Count()) then return true
      candidate = (candidate+items.Count()) mod items.Count()
      item = items[candidate]
      disabled = false
      if GetInterface(item, "ifAssociativeArray") <> invalid then disabled = item.disabled = true
      if not disabled then
        p.selectedIndex = candidate
        engine.MarkUIDirty()
        RokuGameplay_Emit(engine, node, "MenuSelectionChanged", 0, { index: candidate, item: item })
        return true
      end if
    end for
    return true
  end if
  if action <> "action" then return false
  item = items[index] : itemAction = _BRS_StrCoalesce(p.action, "")
  if GetInterface(item, "ifAssociativeArray") <> invalid then
    if item.disabled = true then return true
    if item.action <> invalid and item.action <> "" then itemAction = item.action
  end if
  p.selectedIndex = index
  runtime = engine.EnsureNodeRuntime(node)
  runtime.uiPressed = true : runtime.uiPressedFrame = engine.frameNumber
  RokuGameplay_Emit(engine, node, "MenuItemSelected", 0, { index: index, item: item, action: itemAction })
  if itemAction <> "" then engine.focus.actionQueue.Push({ nodeId: node.id, action: itemAction, nodeName: node.name })
  return true
end function
