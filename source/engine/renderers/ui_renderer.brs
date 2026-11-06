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
        if node.visible = false then continue for
        screen_tf = m.GetNodeScreenTransform(nodeId)
        ' Visibility filtering
        if screen_tf.visible = false then continue for
        if screen_tf.opacity <= 0.0 then continue for
        clip = RokuUi_AncestorClip(m,node)
        if clip = invalid then
          m.RenderUiNode(node, screen_tf)
        else if clip.w > 0 and clip.h > 0 then
          if m.uiClipSurface = invalid then m.uiClipSurface = CreateObject("roBitmap",{width:m.width,height:m.height,alphaEnable:true})
          if m.uiClipSurface <> invalid then
            originalScreen = m.screen
            m.uiClipSurface.Clear(&h00000000)
            m.screen = m.uiClipSurface
            m.RenderUiNode(node,screen_tf)
            m.screen = originalScreen
            clipped = CreateObject("roRegion",m.uiClipSurface,clip.x,clip.y,clip.w,clip.h)
            if clipped <> invalid then m.screen.DrawObject(clip.x,clip.y,clipped)
          end if
        end if
      end if
    end if
  end for
end sub

function RokuUi_AncestorClip(engine as Object,node as Object) as Dynamic
  clip = {x:0,y:0,w:engine.width,h:engine.height} : found = false : seen = {}
  parentId = node.parentId
  while parentId <> invalid and parentId <> "" and engine.scene.nodeMap.DoesExist(parentId)
    if seen.DoesExist(parentId) then exit while
    seen[parentId] = true : parent = engine.scene.nodeMap[parentId]
    if parent.type = "ScrollContainer" or (parent.properties <> invalid and parent.properties.clipContent = true) then
      tf = engine.GetNodeScreenTransform(parentId)
      right = clip.x+clip.w : bottom = clip.y+clip.h
      px = Int(tf.x) : py = Int(tf.y) : pr = Int(tf.x+tf.width*tf.scaleX) : pb = Int(tf.y+tf.height*tf.scaleY)
      if px > clip.x then clip.x = px
      if py > clip.y then clip.y = py
      if pr < right then right = pr
      if pb < bottom then bottom = pb
      clip.w = right-clip.x : clip.h = bottom-clip.y : found = true
    end if
    parentId = parent.parentId
  end while
  if not found then return invalid
  return clip
end function

' ── Per-node dispatch ─────────────────────────────────────────────────────────

sub RokuEngine_RenderUiNode(node as Object, screenTransform as Object)
  if node = invalid or screenTransform = invalid then return

  props = node.properties
  if props = invalid then props = {}

  x = Int(screenTransform.x)
  y = Int(screenTransform.y)
  width  = 0
  height = 0
  width = Int(screenTransform.width * screenTransform.scaleX)
  height = Int(screenTransform.height * screenTransform.scaleY)

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
    m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, props.fontSize, props.align, props.valign, opacity, props)

  else if node.type = "TextureRect" then
    region = m.LoadImageAsset(props.imagePath)
    if region <> invalid then
      if width > 0 and height > 0 then
        sourceX = 0.0 : sourceY = 0.0
        sourceW = region.GetWidth() * 1.0 : sourceH = region.GetHeight() * 1.0
        bitmap = region
        if type(region) = "roRegion" then
          bitmap = region.GetBitmap()
          sourceX = region.GetX() : sourceY = region.GetY()
        end if
        if props.sourceRect <> invalid then
          rr = props.sourceRect
          if _BRS_NumCoalesce(rr.w, 0) > 0 and _BRS_NumCoalesce(rr.h, 0) > 0 then
            sourceX = sourceX + _BRS_NumCoalesce(rr.x, 0) : sourceY = sourceY + _BRS_NumCoalesce(rr.y, 0)
            sourceW = rr.w : sourceH = rr.h
          end if
        end if
        drawX = x * 1.0 : drawY = y * 1.0 : drawW = width * 1.0 : drawH = height * 1.0
        mode = props.fitMode
        if mode = invalid or mode = "" then mode = "contain"
        if mode = "contain" then
          factor = width / sourceW
          if height / sourceH < factor then factor = height / sourceH
          drawW = sourceW * factor : drawH = sourceH * factor
          drawX = drawX + (width - drawW) / 2 : drawY = drawY + (height - drawH) / 2
        else if mode = "cover" then
          factor = width / sourceW
          if height / sourceH > factor then factor = height / sourceH
          cropW = width / factor : cropH = height / factor
          sourceX = sourceX + (sourceW - cropW) / 2 : sourceY = sourceY + (sourceH - cropH) / 2
          sourceW = cropW : sourceH = cropH
        end if
        textureRegion = CreateObject("roRegion", bitmap, Int(sourceX), Int(sourceY), Int(sourceW), Int(sourceH))
        tint = "#ffffff"
        if props.tint <> invalid and props.tint <> "" then tint = props.tint
        if textureRegion <> invalid then m.screen.DrawScaledObject(Int(drawX), Int(drawY), drawW / textureRegion.GetWidth(), drawH / textureRegion.GetHeight(), textureRegion, RokuEngine_HexToRgba(tint, opacity))
      else
        m.screen.DrawObject(x, y, region)
      end if
    else
      ' Missing texture fallback: magenta placeholder so it is visible on device
      m.screen.DrawRect(x, y, width, height, RokuEngine_ApplyAlpha(&hFF00FFFF, opacity * 0.6))
      RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, RokuEngine_ApplyAlpha(&hFFFFFFFF, opacity))
      m.DrawUiText("?tex", x + 4, y + Int(height * 0.5), "#ffffff")
    end if

  else if node.type = "Button" or node.type = "CircleButton" or node.type = "TriangleButton" or node.type = "OvalButton" then
    ' Try nine-slice style first (uses focused/pressed state color tinting)
    if props.nineSliceStyleId <> invalid and props.nineSliceStyleId <> "" then
      style = RokuEngine_ResolveNineSliceStyle(m, RokuEngine_Trim(RokuEngine_ToString(props.nineSliceStyleId)))
      if style <> invalid then
        stateRegion = ""
        if style.buttonStates <> invalid then
          stateRegion = _BRS_StrCoalesce(style.buttonStates.normal,"")
          if focused and _BRS_StrCoalesce(style.buttonStates.hover,"") <> "" then stateRegion = style.buttonStates.hover
          if pressed and _BRS_StrCoalesce(style.buttonStates.pressed,"") <> "" then stateRegion = style.buttonStates.pressed
          if props.disabled = true and _BRS_StrCoalesce(style.buttonStates.disabled,"") <> "" then stateRegion = style.buttonStates.disabled
        end if
        if stateRegion <> "" then
          stateStyle = RokuEngine_ResolveNineSliceStyle(m,stateRegion)
          if stateStyle <> invalid then style = stateStyle
        end if
        RokuEngine_DrawNineSliceStyled(m.screen, m, node, style, x, y, width, height, opacity)
        m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, _BRS_NumCoalesce(props.fontSize, 22), _BRS_StrCoalesce(props.align, "center"), _BRS_StrCoalesce(props.valign, "center"), opacity, props)
        return
      end if
    end if
    ' Fallback: plain colored button
    colorHex = props.normalColor
    if focused  then colorHex = props.focusedColor
    if pressed  then colorHex = props.pressedColor
    if props.disabled = true then colorHex = props.disabledColor
    fillColor = RokuEngine_HexToRgba(colorHex, opacity)
    btnBorderColor = &hDCE7F4FF
    if focused then btnBorderColor = &hF6D365FF
    borderColor = RokuEngine_ApplyAlpha(btnBorderColor, opacity)
    RokuUi_DrawButtonShape(m.screen, node.type, x, y, width, height, fillColor, borderColor)
    m.DrawUiTextAligned(props.text, x, y, width, height, props.textColor, _BRS_NumCoalesce(props.fontSize, 22), _BRS_StrCoalesce(props.align, "center"), _BRS_StrCoalesce(props.valign, "center"), opacity, props)

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
  RokuEngine_DrawNineSliceStyled(screen,engine,node,props,x,y,w,h,opacity)

end sub

' ── MenuList drawing ──────────────────────────────────────────────────────────

sub RokuEngine_DrawMenuList(screen as Object, engine as Object, node as Object, props as Object, x as Integer, y as Integer, w as Integer, h as Integer, opacity as Float, runtime as Object, focused as Boolean)
  items = props.items
  if type(items) <> "roArray" then items = []
  selectedIndex = _BRS_IntOr(props.selectedIndex, 0)
  itemH = _BRS_IntOr(props.itemHeight, 48)
  if itemH < 1 then itemH = 1
  normalColor   = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.normalColor, "#263247"), opacity)
  selectedColor = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.selectedColor, "#375a7f"), opacity)
  textColor     = _BRS_StrCoalesce(props.textColor, "#e7eef7")
  selTextColor  = _BRS_StrCoalesce(props.selectedTextColor, "#ffffff")
  fontSize      = _BRS_IntOr(props.fontSize, 22)

  ' Background
  screen.DrawRect(x, y, w, h, normalColor)

  maxVisible = Int(h / itemH)
  firstVisible = 0
  if selectedIndex >= maxVisible then firstVisible = selectedIndex-maxVisible+1
  for i = firstVisible to items.Count() - 1
    if i-firstVisible >= maxVisible then exit for
    iy = y + ((i-firstVisible) * itemH)
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
    if i < items.Count() - 1 and i-firstVisible < maxVisible - 1 then
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
  if props.nineSliceStyleId <> invalid then
    style = RokuEngine_ResolveNineSliceStyle(engine,props.nineSliceStyleId)
    if style <> invalid and style.progressRegions <> invalid then
      regions = style.progressRegions
      background = RokuEngine_ResolveNineSliceStyle(engine,_BRS_StrCoalesce(regions.background,""))
      fill = RokuEngine_ResolveNineSliceStyle(engine,_BRS_StrCoalesce(regions.fill,""))
      thumb = RokuEngine_ResolveNineSliceStyle(engine,_BRS_StrCoalesce(regions.thumb,""))
      if background <> invalid then RokuEngine_DrawNineSliceStyled(screen,engine,node,background,x,y,w,h,opacity)
      if fill <> invalid and fillW > 0 then RokuEngine_DrawNineSliceStyled(screen,engine,node,fill,x,y,fillW,h,opacity)
      if thumb <> invalid then
        thumbW = h
        if thumb.sourceRect <> invalid and thumb.sourceRect.w > 0 then thumbW = Int(thumb.sourceRect.w)
        RokuEngine_DrawNineSliceStyled(screen,engine,node,thumb,x+fillW-Int(thumbW*0.5),y,thumbW,h,opacity)
      end if
    end if
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

sub RokuEngine_DrawUiTextAligned(textValue as Dynamic, x as Integer, y as Integer, w as Integer, h as Integer, colorHex as Dynamic, fontSize as Dynamic, align as Dynamic, valign as Dynamic, opacity as Dynamic, textStyle = invalid as Dynamic)
  if m.screen = invalid then return
  if fontSize = invalid then fontSize = 22
  if align = invalid or align = "" then align = "left"
  if valign = invalid or valign = "" then valign = "center"
  if opacity = invalid then opacity = 1.0
  if m.uiFontRegistry = invalid then m.uiFontRegistry = CreateObject("roFontRegistry")
  fontRegistry = m.uiFontRegistry
  bold = false : italic = false : family = "" : fontPath = ""
  if textStyle <> invalid
    bold = textStyle.fontBold = true : italic = textStyle.fontItalic = true
    family = _BRS_StrCoalesce(textStyle.fontFamily, "")
    fontPath = _BRS_StrCoalesce(textStyle.fontPath, "")
  end if
  if m.uiRegisteredFonts = invalid then m.uiRegisteredFonts = {}
  if fontPath <> ""
    if not m.uiRegisteredFonts.DoesExist(fontPath)
      pkgPath = fontPath
      if Left(pkgPath, 6) = "res://" then pkgPath = "pkg:/" + Mid(pkgPath, 7)
      m.uiRegisteredFonts[fontPath] = ""
      if fontRegistry.Register(pkgPath)
        families = fontRegistry.GetFamilies()
        if families.Count() > 0 then m.uiRegisteredFonts[fontPath] = families[families.Count() - 1]
      end if
    end if
    if family = "" then family = m.uiRegisteredFonts[fontPath]
  end if
  font = invalid
  if family <> "" then font = fontRegistry.GetFont(family, Int(fontSize), bold, italic)
  if font = invalid then font = fontRegistry.GetDefaultFont(fontSize, bold, italic)
  if font = invalid then font = fontRegistry.GetDefaultFont()
  color = RokuEngine_HexToRgba(_BRS_StrCoalesce(colorHex, "#ffffff"), opacity)
  text = _BRS_StrCoalesce(textValue, "")

  ' Compute text dimensions for alignment
  textH = font.GetOneLineHeight()
  lines = text.Replace(Chr(13), "").Split(Chr(10))
  blockH = textH * lines.Count()
  ty = y + 8
  if valign = "center" then ty = y + Int((h - blockH) / 2)
  if valign = "bottom" then ty = y + h - blockH - 4
  for each line in lines
    textW = font.GetOneLineWidth(line, w)
    tx = x + 8
    if align = "center" then tx = x + Int((w - textW) / 2)
    if align = "right" then tx = x + w - textW - 8
    m.screen.DrawText(line, tx, ty, color, font)
    ty = ty + textH
  end for
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
