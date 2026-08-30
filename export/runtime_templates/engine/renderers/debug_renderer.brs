' debug_renderer.brs - debug/world helper rendering and overlay text

sub RokuEngine_RenderDebugNode(node as Object, world as Object)
  if node = invalid or world = invalid then return
  if world.visible = false then return

  props = node.properties
  if props = invalid then props = {}
  opacity = world.opacity
  if opacity <= 0 then return

  if node.type = "Node2D" or node.type = "SceneInstance" or node.type = "SceneRoot" or node.type = "Camera2D" then
    width = props.width
    height = props.height
    if width = invalid then width = 0
    if height = invalid then height = 0
    if width > 0 and height > 0 then
      if not RokuEngine_IsWorldRectVisible(world, width, height, m.scene.cameraX, m.scene.cameraY, m.width, m.height) then return
      tint = props.tint
      if tint = invalid or tint = "" then tint = "#5e7594"
      color = RokuEngine_HexToRgba(tint, opacity)
      m.screen.DrawRect(Int(world.x - m.scene.cameraX), Int(world.y - m.scene.cameraY), Int(width * world.scaleX), Int(height * world.scaleY), color)
    end if
  end if
  end if
end sub

sub RokuEngine_DrawDebugText()
  fontRegistry = CreateObject("roFontRegistry")
  font = fontRegistry.GetDefaultFont()
  stats = m.scene.debugStats
  line1 = "Scene: " + m.scene.name + "  fps=" + StrI(Int(stats.fps)) + "  rawDt=" + StrI(Int(stats.rawDt * 1000)) + "ms  scaledDt=" + StrI(Int(stats.scaledDt * 1000)) + "ms"
  line2 = "fixedSteps=" + StrI(stats.fixedSteps) + "  collisions=" + StrI(stats.collisionPairCount) + "  colliders=" + StrI(stats.lastColliderCount) + "  input=" + StrI(stats.lastInputEventCount) + "  sprites=" + StrI(stats.spriteCount) + "  xforms=" + StrI(stats.transformUpdateCount)
  line3 = "frame=" + StrI(Int(stats.frameMs)) + "ms  update=" + StrI(Int(stats.updateMs)) + "ms  physics=" + StrI(Int(stats.physicsMs)) + "ms  render=" + StrI(Int(stats.renderMs)) + "ms"
  m.screen.DrawText(line1, 24, 32, &hFFFFFFFF, font)
  m.screen.DrawText(line2, 24, 52, &hC8D6E5FF, font)
  m.screen.DrawText(line3, 24, 72, &hC8D6E5FF, font)
end sub

function RokuEngine_HexToRgba(hexValue as String, opacity = 1.0 as Dynamic) as Integer
  value = hexValue
  if value = invalid or value = "" then value = "#ffffff"
  if Left(value, 1) = "#" then value = Mid(value, 2)
  if Len(value) <> 6 then value = "ffffff"

  r = Val("&h" + Mid(value, 1, 2))
  g = Val("&h" + Mid(value, 3, 2))
  b = Val("&h" + Mid(value, 5, 2))
  a = Int(255 * opacity)
  if a < 0 then a = 0
  if a > 255 then a = 255
  return (r * 16777216) + (g * 65536) + (b * 256) + a
end function

function RokuEngine_IsWorldRectVisible(world as Object, width as Dynamic, height as Dynamic, cameraX as Dynamic, cameraY as Dynamic, viewWidth as Dynamic, viewHeight as Dynamic) as Boolean
  if world = invalid then return false
  w = width
  h = height
  if w = invalid then w = 0
  if h = invalid then h = 0
  if w <= 0 and h <= 0 then return true
  left = world.x - cameraX
  top = world.y - cameraY
  right = left + (w * world.scaleX)
  bottom = top + (h * world.scaleY)
  if right < 0 then return false
  if bottom < 0 then return false
  if left > viewWidth then return false
  if top > viewHeight then return false
  return true
end function
