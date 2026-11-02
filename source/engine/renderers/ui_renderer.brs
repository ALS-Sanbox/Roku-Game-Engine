' ui_renderer.brs - Screen-space UI drawing (Phase 4: Nine-Slice Style support)
' Renders UI nodes in screen-space after world rendering.
' Panel, Button, and NineSlicePanel can optionally carry a nineSliceStyleId
' that references a NineSliceStyle in the resource manifest. When present,
' the nine-slice renderer is used instead of the plain colored rect fallback.

' ── Main UI render pass ───────────────────────────────────────────────────────

sub RokuEngine_RenderUiPass()
  if m.scene = invalid then return
  m.InitializeUiRuntime()
  m.InitializeFocusManager()
  uiIds = m.GetUiTraversalNodeIds()
  if type(uiIds) <> "roArray" then return
  for each nodeId in uiIds
    if m.scene.nodeMap <> invalid and m.scene.nodeMap.DoesExist(nodeId) then
      node = m.scene.nodeMap[nodeId]
      if node <> invalid then
        screen_tf = m.GetNodeScreenTransform(nodeId)
        ' Visibility filtering
        if screen_tf.visible = false then continue for
        if screen_tf.opacity <= 0.0 then continue for
        m.RenderUiNode(node, screen_tf)
      end if
    end if
  end for
end sub

' ── Per-node dispatch ─────────────────────────────────────────────────────────

sub RokuEngine_RenderUiNode(node as Object, screenTransform as Object)
  if node = invalid or screenTransform = invalid then return

  props = node.properties
  if props = invalid then props = {}

  x = Int(screenTransform.x)
  y = Int(screenTransform.y)
  width  = 0
  height = 0
  if props.width  <> invalid then width  = Int(props.width  * screenTransform.scaleX)
  if props.height <> invalid then height = Int(props.height * screenTransform.scaleY)

  opacity = screenTransform.opacity
  runtime = m.EnsureNodeRuntime(node)
  focused = (runtime.uiFocused = true)
  pressed = (runtime.uiPressed = true)

  if node.type = "CanvasLayer" then
    ' CanvasLayer is a logical grouping root — not drawn itself.
    return

  else if node.type = "Control" then
    ' Transparent container with a subtle outline.
    m.screen.DrawRect(x, y, width, height, RokuEngine_ApplyAlpha(&h0F2338FF, opacity))
    RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, RokuEngine_ApplyAlpha(&h506580FF, opacity))

  else if node.type = "Panel" then
    ' Try nine-slice style first
    if props.nineSliceStyleId <> invalid and props.nineSliceStyleId <> "" then
      style = RokuEngine_ResolveNineSliceStyle(m, RokuEngine_Trim(RokuEngine_ToString(props.nineSliceStyleId)))
      if style <> invalid then
        RokuEngine_DrawNineSliceStyled(m.screen, m, node, style, x, y, width, height, opacity)
        return
      end if
    end if
    ' Fallback: plain colored rect
    fillColor   = RokuEngine_HexToRgba(props.color,        opacity)
    borderColor = RokuEngine_HexToRgba(props.borderColor,  opacity)
    m.screen.DrawRect(x, y, width, height, fillColor)
    bw = 1
    if props.borderWidth <> invalid and Int(props.borderWidth) > 0 then bw = Int(props.borderWidth)
    for i = 0 to bw - 1
      RokuEngine_DrawUiOutlineRect(m.screen, x + i, y + i, width - (i * 2), height - (i * 2), borderColor)
    end for

  else if node.type = "Label" then
    m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, props.fontSize, props.align, props.valign, opacity)

  else if node.type = "TextureRect" then
    region = m.LoadImageAsset(props.imagePath)
    if region <> invalid then
      if width > 0 and height > 0 then
        m.screen.DrawScaledObject(x, y, width / region.GetWidth(), height / region.GetHeight(), region)
      else
        m.screen.DrawObject(x, y, region)
      end if
    else
      ' Missing texture fallback: magenta placeholder so it is visible on device
      m.screen.DrawRect(x, y, width, height, RokuEngine_ApplyAlpha(&hFF00FFFF, opacity * 0.6))
      RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, RokuEngine_ApplyAlpha(&hFFFFFFFF, opacity))
      m.DrawUiText("?tex", x + 4, y + Int(height * 0.5), "#ffffff")
    end if

  else if node.type = "Button" then
    ' Try nine-slice style first (uses focused/pressed state color tinting)
    if props.nineSliceStyleId <> invalid and props.nineSliceStyleId <> "" then
      style = RokuEngine_ResolveNineSliceStyle(m, RokuEngine_Trim(RokuEngine_ToString(props.nineSliceStyleId)))
      if style <> invalid then
        RokuEngine_DrawNineSliceStyled(m.screen, m, node, style, x, y, width, height, opacity)
        m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, _BRS_NumCoalesce(props.fontSize, 22), "center", "center", opacity)
        return
      end if
    end if
    ' Fallback: plain colored button
    colorHex = props.normalColor
    if focused  then colorHex = props.focusedColor
    if pressed  then colorHex = props.pressedColor
    if props.disabled = true then colorHex = props.disabledColor
    fillColor = RokuEngine_HexToRgba(colorHex, opacity)
    btnBorderColor = &hDCE7F4
    if focused then btnBorderColor = &hF6D365
    borderColor = RokuEngine_ApplyAlpha(btnBorderColor, opacity)
    m.screen.DrawRect(x, y, width, height, fillColor)
    RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, borderColor)
    m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, _BRS_NumCoalesce(props.fontSize, 22), "center", "center", opacity)

  else if node.type = "NineSlicePanel" then
    ' Try named style first, then inline slice props
    if props.nineSliceStyleId <> invalid and props.nineSliceStyleId <> "" then
      style = RokuEngine_ResolveNineSliceStyle(m, RokuEngine_Trim(RokuEngine_ToString(props.nineSliceStyleId)))
      if style <> invalid then
        RokuEngine_DrawNineSliceStyled(m.screen, m, node, style, x, y, width, height, opacity)
        return
      end if
    end if
    ' Fallback: inline props
    RokuEngine_DrawNineSliceInline(m.screen, m, node, props, x, y, width, height, opacity)

  else if node.type = "MenuList" then
    RokuEngine_DrawMenuList(m.screen, m, node, props, x, y, width, height, opacity, runtime, focused)

  else if node.type = "ProgressBar" then
    RokuEngine_DrawProgressBar(m.screen, m, node, props, x, y, width, height, opacity)

  end if
end sub

' ── Inline nine-slice (uses props.imagePath + slice margins directly) ─────────
' Used when there is no named style — properties on the node itself drive rendering.

sub RokuEngine_DrawNineSliceInline(screen as Object, engine as Object, node as Object, props as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float)
  region = engine.LoadImageAsset(props.imagePath)
  if region = invalid then
    screen.DrawRect(x, y, w, h, RokuEngine_ApplyAlpha(&h1E2F45FF, opacity))
    RokuEngine_DrawUiOutlineRect(screen, x, y, w, h, RokuEngine_ApplyAlpha(&h5e7594FF, opacity))
    return
  end if

  sl = _BRS_IntOr(props.sliceLeft, 16)
  st = _BRS_IntOr(props.sliceTop, 16)
  sr = _BRS_IntOr(props.sliceRight, 16)
  sb = _BRS_IntOr(props.sliceBottom, 16)

  centerMode = "stretch"
  if props.centerMode <> invalid then centerMode = LCase(RokuEngine_Trim(RokuEngine_ToString(props.centerMode)))
  edgeMode = "stretch"
  if props.edgeMode <> invalid then edgeMode = LCase(RokuEngine_Trim(RokuEngine_ToString(props.edgeMode)))

  RokuEngine_DrawNineSliceRegions(screen, engine, region, sl, st, sr, sb, x, y, w, h, centerMode, edgeMode, opacity)
end sub

' ── MenuList drawing ──────────────────────────────────────────────────────────

sub RokuEngine_DrawMenuList(screen as Object, engine as Object, node as Object, props as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float, runtime as Object, focused as Boolean)
  items = props.items
  if type(items) <> "roArray" then items = []
  selectedIndex = _BRS_IntOr(props.selectedIndex, 0)
  itemH = _BRS_IntOr(props.itemHeight, 48)
  normalColor   = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.normalColor, "#263247"), opacity)
  selectedColor = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.selectedColor, "#375a7f"), opacity)
  textColor     = _BRS_StrCoalesce(props.textColor, "#e7eef7")
  selTextColor  = _BRS_StrCoalesce(props.selectedTextColor, "#ffffff")
  fontSize      = _BRS_IntOr(props.fontSize, 22)

  ' Background
  screen.DrawRect(x, y, w, h, normalColor)

  maxVisible = Int(h / itemH)
  for i = 0 to items.Count() - 1
    if i >= maxVisible then exit for
    iy = y + (i * itemH)
    isSelected = (i = selectedIndex)
    if isSelected then
      screen.DrawRect(x, iy, w, itemH, selectedColor)
    end if
    label = ""
    item = items[i]
    if type(item) = "roString" then label = item
    if type(item) = "roAssociativeArray" and item.label <> invalid then label = RokuEngine_ToString(item.label)
    color = textColor
    if isSelected then color = selTextColor
    engine.DrawUiText(label, x + 12, iy + Int(itemH * 0.7), color)
    ' Divider line
    if i < items.Count() - 1 and i < maxVisible - 1 then
      screen.DrawLine(x, iy + itemH - 1, x + w, iy + itemH - 1, RokuEngine_ApplyAlpha(&h4a5568FF, opacity))
    end if
  end for

  if focused then
    RokuEngine_DrawUiOutlineRect(screen, x, y, w, h, RokuEngine_ApplyAlpha(&hF6D365FF, opacity))
  else
    RokuEngine_DrawUiOutlineRect(screen, x, y, w, h, RokuEngine_ApplyAlpha(&h5e7594FF, opacity))
  end if
end sub

' ── ProgressBar drawing ───────────────────────────────────────────────────────

sub RokuEngine_DrawProgressBar(screen as Object, engine as Object, node as Object, props as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float)
  minV  = _BRS_FloatOr(props.minValue, 0)
  maxV  = _BRS_FloatOr(props.maxValue, 1)
  value = _BRS_FloatOr(props.value, 0.5)

  ' Clamp
  if value < minV then value = minV
  if value > maxV then value = maxV
  fraction = 0.0
  if maxV > minV then fraction = (value - minV) / (maxV - minV)

  trackColor  = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.trackColor, "#1a2638"), opacity)
  fillColor   = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.fillColor, "#4a90d9"), opacity)
  borderColor = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.borderColor, "#5e7594"), opacity)
  bw = _BRS_IntOr(props.borderWidth, 1)

  ' Track
  screen.DrawRect(x, y, w, h, trackColor)
  ' Fill
  fillW = Int(w * fraction)
  if fillW > 0 then
    screen.DrawRect(x, y, fillW, h, fillColor)
  end if
  ' Border
  for i = 0 to bw - 1
    RokuEngine_DrawUiOutlineRect(screen, x + i, y + i, w - (i * 2), h - (i * 2), borderColor)
  end for
  ' Optional label
  if props.showLabel = true then
    pct = Int(fraction * 100)
    label = RokuEngine_ToString(pct) + "%"
    engine.DrawUiText(label, x + Int(w * 0.5) - 16, y + Int(h * 0.7), _BRS_StrCoalesce(props.labelColor, "#e7eef7"))
  end if
end sub

' ── Text helpers ──────────────────────────────────────────────────────────────

sub RokuEngine_DrawUiText(textValue as Dynamic, x as Integer, y as Integer, colorHex as Dynamic)
  if m.uiFontRegistry = invalid then m.uiFontRegistry = CreateObject("roFontRegistry")
  fontRegistry = m.uiFontRegistry
  font = fontRegistry.GetDefaultFont()
  color = &hFFFFFFFF
  if colorHex <> invalid and colorHex <> "" then color = RokuEngine_HexToRgba(colorHex, 1.0)
  m.screen.DrawText(RokuEngine_Trim(RokuEngine_ToString(textValue)), x, y, color, font)
end sub

sub RokuEngine_DrawUiTextAligned(textValue as Dynamic, x as Integer, y as Integer, w as Integer, h as Integer, colorHex as Dynamic, fontSize as Dynamic, align as Dynamic, valign as Dynamic, opacity as Dynamic)
  if m.screen = invalid then return
  if fontSize = invalid then fontSize = 22
  if align = invalid or align = "" then align = "left"
  if valign = invalid or valign = "" then valign = "center"
  if opacity = invalid then opacity = 1.0
  if m.uiFontRegistry = invalid then m.uiFontRegistry = CreateObject("roFontRegistry")
  fontRegistry = m.uiFontRegistry
  font = fontRegistry.GetDefaultFont(fontSize, false, false)
  if font = invalid then font = fontRegistry.GetDefaultFont()
  color = RokuEngine_HexToRgba(_BRS_StrCoalesce(colorHex, "#ffffff"), opacity)
  text = _BRS_StrCoalesce(textValue, "")

  ' Compute text dimensions for alignment
  textW = font.GetOneLineWidth(text, w)
  textH = font.GetOneLineHeight()

  tx = x + 8
  if align = "center" then tx = x + Int((w - textW) / 2)
  if align = "right"  then tx = x + w - textW - 8

  ty = y + 8
  if valign = "center" then ty = y + Int((h - textH) / 2)
  if valign = "bottom" then ty = y + h - textH - 4

  m.screen.DrawText(text, tx, ty, color, font)
end sub

' ── Drawing utilities ─────────────────────────────────────────────────────────

sub RokuEngine_DrawUiOutlineRect(screen as Object, x as Integer, y as Integer, width as Integer, height as Integer, color as Integer)
  if screen = invalid then return
  if width <= 0 or height <= 0 then return
  screen.DrawLine(x,         y,          x + width, y,          color)
  screen.DrawLine(x,         y,          x,         y + height, color)
  screen.DrawLine(x + width, y,          x + width, y + height, color)
  screen.DrawLine(x,         y + height, x + width, y + height, color)
end sub

' ── Color utilities ───────────────────────────────────────────────────────────

function RokuEngine_HexToRgba(hexStr as Dynamic, opacity as Dynamic) as Integer
  if opacity = invalid then opacity = 1.0
  if hexStr = invalid or hexStr = "" then return &hFFFFFFFF
  s = RokuEngine_Trim(RokuEngine_ToString(hexStr))
  if Left(s, 1) = "#" then s = Mid(s, 2)
  if Len(s) = 6 then s = s + "FF"
  if Len(s) <> 8 then return &hFFFFFFFF
  r = Val(Left(s, 2), 16)
  g = Val(Mid(s, 3, 2), 16)
  b = Val(Mid(s, 5, 2), 16)
  a = Int(Val(Mid(s, 7, 2), 16) * opacity)
  if a < 0 then a = 0
  if a > 255 then a = 255
  return (r * 16777216) + (g * 65536) + (b * 256) + a
end function

function RokuEngine_ApplyAlpha(rgba as Integer, opacity as Float) as Integer
  r = Int(rgba / 16777216) and 255
  g = Int(rgba / 65536)    and 255
  b = Int(rgba / 256)      and 255
  a = rgba                 and 255
  a = Int(a * opacity)
  if a < 0   then a = 0
  if a > 255 then a = 255
  return (r * 16777216) + (g * 65536) + (b * 256) + a
end function
