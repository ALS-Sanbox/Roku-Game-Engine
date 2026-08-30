' ui_renderer.brs - screen-space UI drawing

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
        screen = m.GetNodeScreenTransform(nodeId)
        m.RenderUiNode(node, screen)
      end if
    end if
  end for
end sub

sub RokuEngine_RenderUiNode(node as Object, screenTransform as Object)
  if node = invalid or screenTransform = invalid then return
  if screenTransform.visible = false or screenTransform.opacity <= 0 then return
  props = node.properties
  if props = invalid then props = {}
  x = Int(screenTransform.x)
  y = Int(screenTransform.y)
  width = 0
  height = 0
  if props.width <> invalid then width = Int(props.width * screenTransform.scaleX)
  if props.height <> invalid then height = Int(props.height * screenTransform.scaleY)
  runtime = m.EnsureNodeRuntime(node)
  focused = (runtime.uiFocused = true)
  pressed = (runtime.uiPressed = true)

  if node.type = "CanvasLayer" then
    return
  else if node.type = "Control" then
    m.screen.DrawRect(x, y, width, height, &h0F2338AA)
    RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, &h506580FF)
  else if node.type = "Panel" then
    fillColor = RokuEngine_HexToRgba(props.color, screenTransform.opacity)
    borderColor = RokuEngine_HexToRgba(props.borderColor, screenTransform.opacity)
    m.screen.DrawRect(x, y, width, height, fillColor)
    borderWidth = 1
    if props.borderWidth <> invalid and Int(props.borderWidth) > 0 then borderWidth = Int(props.borderWidth)
    for i = 0 to borderWidth - 1
      RokuEngine_DrawUiOutlineRect(m.screen, x + i, y + i, width - (i * 2), height - (i * 2), borderColor)
    end for
  else if node.type = "Label" then
    m.DrawUiText(props.text, x + 8, y + Int(height * 0.7), props.textColor)
  else if node.type = "TextureRect" then
    region = m.LoadImageAsset(props.imagePath)
    if region <> invalid then
      if width > 0 and height > 0 then
        m.screen.DrawScaledObject(x, y, width, height, region)
      else
        m.screen.DrawObject(x, y, region)
      end if
    else
      m.screen.DrawRect(x, y, width, height, &h1E2F45AA)
      RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, &h6DB5FFFF)
    end if
  else if node.type = "Button" then
    colorHex = props.normalColor
    if focused then colorHex = props.focusedColor
    if pressed then colorHex = props.pressedColor
    if props.disabled = true then colorHex = props.disabledColor
    fillColor = RokuEngine_HexToRgba(colorHex, screenTransform.opacity)
    borderColor = &hDCE7F4FF
    if focused then borderColor = &hF6D365FF
    m.screen.DrawRect(x, y, width, height, fillColor)
    RokuEngine_DrawUiOutlineRect(m.screen, x, y, width, height, borderColor)
    m.DrawUiText(props.text, x + 12, y + Int(height * 0.7), props.textColor)
  end if
end sub

sub RokuEngine_DrawUiText(textValue as Dynamic, x as Integer, y as Integer, colorHex = invalid as Dynamic)
  fontRegistry = CreateObject("roFontRegistry")
  font = fontRegistry.GetDefaultFont()
  color = &hFFFFFFFF
  if colorHex <> invalid and colorHex <> "" then color = RokuEngine_HexToRgba(colorHex, 1.0)
  m.screen.DrawText(Trim(Str(textValue)), x, y, color, font)
end sub


sub RokuEngine_DrawUiOutlineRect(screen as Object, x as Integer, y as Integer, width as Integer, height as Integer, color as Integer)
  if screen = invalid then return
  if width <= 0 or height <= 0 then return
  screen.DrawLine(x, y, x + width, y, color)
  screen.DrawLine(x, y, x, y + height, color)
  screen.DrawLine(x + width, y, x + width, y + height, color)
  screen.DrawLine(x, y + height, x + width, y + height, color)
end sub
