' sprite_renderer.brs - compositor sprite lifecycle and sprite sync

sub RokuEngine_SyncCompositorSprites()
  if m.scene = invalid then return
  if m.compositorSprites = invalid then m.compositorSprites = {}

  tickMs = Int(m.scene.debugStats.scaledDt * 1000)
  if tickMs < 0 then tickMs = 0
  m.compositorTickMs = tickMs

  active = {}
  traversalIds = m.GetRenderTraversalNodeIds()
  layer = 0
  for each nodeId in traversalIds
    m.SyncNodeSprite(nodeId, active, layer)
    layer = layer + 1
  end for

  staleIds = []
  for each spriteNodeId in m.compositorSprites
    if not active.DoesExist(spriteNodeId) then staleIds.Push(spriteNodeId)
  end for
  for each staleId in staleIds
    if m.scene.nodeMap.DoesExist(staleId) then
      m.RemoveNodeCompositorSprite(m.scene.nodeMap[staleId])
    else
      member = m.compositorSprites[staleId]
      if member <> invalid then member.Remove()
      m.compositorSprites.Delete(staleId)
    end if
  end for
end sub

sub RokuEngine_SyncNodeSprite(nodeId as String, active as Object, layer as Integer)
  node = invalid
  if m.scene = invalid then return
  if m.scene.nodeMap.DoesExist(nodeId) then node = m.scene.nodeMap[nodeId]
  if node = invalid then return

  world = m.GetWorldTransform(node.id)
  if node.type = "Sprite2D" or node.type = "AnimatedSprite2D" then
    active[node.id] = true
    spriteState = m.EnsureSpriteNodeRuntime(node)
    props = node.properties
    if props = invalid then props = {}
    drawX = Int(world.x - m.scene.cameraX)
    drawY = Int(world.y - m.scene.cameraY)
    nodeWidth = 0
    nodeHeight = 0
    if props.width <> invalid then nodeWidth = props.width
    if props.height <> invalid then nodeHeight = props.height
    if world.visible = false or world.opacity <= 0 or (nodeWidth > 0 and nodeHeight > 0 and not RokuEngine_IsWorldRectVisible(world, nodeWidth, nodeHeight, m.scene.cameraX, m.scene.cameraY, m.width, m.height)) then
      m.RemoveNodeCompositorSprite(node)
    else if node.type = "Sprite2D" then
      bitmap = m.LoadImageAsset(props.imagePath)
      if bitmap = invalid then
        m.RemoveNodeCompositorSprite(node)
      else
        textureKey = "sprite|"
        if props.imagePath <> invalid then textureKey = textureKey + props.imagePath
        needsCreate = (spriteState.member = invalid or spriteState.kind <> "sprite" or spriteState.textureKey <> textureKey or spriteState.layer <> layer)
        if needsCreate then
          m.RemoveNodeCompositorSprite(node)
          spriteState = m.EnsureSpriteNodeRuntime(node)
          spriteState.member = m.compositor.NewSprite(drawX, drawY, bitmap, layer)
          spriteState.kind = "sprite"
          spriteState.textureKey = textureKey
          spriteState.layer = layer
          spriteState.baseWidth = bitmap.GetWidth()
          spriteState.baseHeight = bitmap.GetHeight()
          m.compositorSprites[node.id] = spriteState.member
        end if
        m.ApplySpriteTransform(node, world, spriteState, drawX, drawY)
        if m.scene.debugStats <> invalid then m.scene.debugStats.spriteCount = m.scene.debugStats.spriteCount + 1
        m.stats.spriteCount = m.stats.spriteCount + 1
      end if
    else if node.type = "AnimatedSprite2D" then
      frames = m.BuildAnimationFrames(node)
      frameCount = frames.Count()
      if frameCount <= 0 then
        m.RemoveNodeCompositorSprite(node)
      else
        frameIndex = 0
        if spriteState.currentFrameIndex <> invalid then frameIndex = spriteState.currentFrameIndex
        if node.runtime <> invalid and node.runtime.currentAnimationFrameIndex <> invalid then frameIndex = node.runtime.currentAnimationFrameIndex
        if frameIndex < 0 then frameIndex = 0
        if frameIndex >= frameCount then frameIndex = frameCount - 1
        frame = frames[frameIndex]

        propsKey = "anim|"
        if props.spriteFramesId <> invalid then propsKey = propsKey + props.spriteFramesId
        propsKey = propsKey + "|"
        if props.animation <> invalid then propsKey = propsKey + props.animation
        propsKey = propsKey + "|"
        if props.spriteSheetId <> invalid then propsKey = propsKey + props.spriteSheetId
        propsKey = propsKey + "|" + StrI(frameCount) + "|" + StrI(frameIndex)

        needsCreate = (spriteState.member = invalid or spriteState.kind <> "animated_frame" or spriteState.textureKey <> propsKey or spriteState.layer <> layer)
        if needsCreate then
          m.RemoveNodeCompositorSprite(node)
          spriteState = m.EnsureSpriteNodeRuntime(node)
          spriteState.member = m.compositor.NewSprite(drawX, drawY, frame, layer)
          spriteState.kind = "animated_frame"
          spriteState.textureKey = propsKey
          spriteState.layer = layer
          spriteState.currentFrameIndex = frameIndex
          if frame <> invalid and frame.GetWidth() <> invalid then
            spriteState.baseWidth = frame.GetWidth()
            spriteState.baseHeight = frame.GetHeight()
          else
            spriteState.baseWidth = 1
            spriteState.baseHeight = 1
          end if
          m.compositorSprites[node.id] = spriteState.member
        end if
        m.ApplySpriteTransform(node, world, spriteState, drawX, drawY)
        if m.scene.debugStats <> invalid then m.scene.debugStats.spriteCount = m.scene.debugStats.spriteCount + 1
        m.stats.spriteCount = m.stats.spriteCount + 1
      end if
    end if
  else if world.visible = false then
    if node.type = "Sprite2D" or node.type = "AnimatedSprite2D" then m.RemoveNodeCompositorSprite(node)
  end if
end sub

sub RokuEngine_ApplySpriteTransform(node as Object, world as Object, spriteState as Object, drawX as Integer, drawY as Integer)
  if spriteState = invalid or spriteState.member = invalid then return
  spriteState.member.MoveTo(drawX, drawY)
  scale = m.ComputeSpriteScale(node, world, spriteState)
  if scale <> invalid then
    spriteState.member.SetScale(scale.x, scale.y)
  end if
end sub

function RokuEngine_ComputeSpriteScale(node as Object, world as Object, spriteState as Object) as Object
  props = node.properties
  if props = invalid then props = {}
  baseWidth = 1.0
  baseHeight = 1.0
  if spriteState.baseWidth <> invalid and spriteState.baseWidth > 0 then baseWidth = spriteState.baseWidth
  if spriteState.baseHeight <> invalid and spriteState.baseHeight > 0 then baseHeight = spriteState.baseHeight
  targetWidth = baseWidth
  targetHeight = baseHeight
  if props.width <> invalid and props.width > 0 then targetWidth = props.width
  if props.height <> invalid and props.height > 0 then targetHeight = props.height
  return {
    x: (targetWidth / baseWidth) * world.scaleX
    y: (targetHeight / baseHeight) * world.scaleY
  }
end function

function RokuEngine_ParseTileAssetPath(resourcePath as Dynamic) as Dynamic
  if resourcePath = invalid then return invalid
  value = Trim(Str(resourcePath))
  marker = Instr(1, value, "#tile:")
  if marker <= 0 then return invalid
  basePath = Left(value, marker - 1)
  tileValue = Mid(value, marker + 6)
  tileIndex = Val(tileValue)
  if basePath = "" then return invalid
  return { basePath: basePath, tileIndex: tileIndex }
end function

function RokuEngine_FindSpriteSheetByResourcePath(basePath as String) as Dynamic
  if m.resources = invalid then return invalid
  return m.resources.FindSpriteSheetByResourcePath(basePath)
end function

function RokuEngine_LoadSpriteSheetTile(basePath as String, tileIndex as Integer) as Dynamic
  if m.resources = invalid then return invalid
  return m.resources.GetSpriteSheetTile(basePath, tileIndex)
end function

function RokuEngine_LoadImageAsset(resourcePath as Dynamic) as Dynamic
  if resourcePath = invalid or resourcePath = "" or m.resources = invalid then return invalid
  tileSpec = m.ParseTileAssetPath(resourcePath)
  if tileSpec <> invalid then return m.resources.GetSpriteSheetTile(tileSpec.basePath, tileSpec.tileIndex)
  return m.resources.GetBitmap(resourcePath)
end function


sub RokuEngine_RenderPassTileMaps()
  if m.scene = invalid then return
  traversalIds = m.GetRenderTraversalNodeIds()
  for each nodeId in traversalIds
    if m.scene.nodeMap.DoesExist(nodeId) <> true then continue for
    node = m.scene.nodeMap[nodeId]
    if node = invalid or node.type <> "TileMap" then continue for
    world = m.GetWorldTransform(node.id)
    if world = invalid or world.visible = false or world.opacity <= 0 then continue for
    props = node.properties
    if props = invalid then props = {}
    tileWidth = 32 : tileHeight = 32 : mapWidth = 0 : mapHeight = 0
    if props.tileWidth <> invalid and Int(props.tileWidth) > 0 then tileWidth = Int(props.tileWidth)
    if props.tileHeight <> invalid and Int(props.tileHeight) > 0 then tileHeight = Int(props.tileHeight)
    if props.mapWidth <> invalid then mapWidth = Int(props.mapWidth)
    if props.mapHeight <> invalid then mapHeight = Int(props.mapHeight)
    tilesetId = ""
    if props.tilesetId <> invalid then tilesetId = Trim(Str(props.tilesetId))
    if tilesetId = "" then continue for
    if GetInterface(props.layers, "ifArray") = invalid then continue for
    for each layer in props.layers
      if layer = invalid then continue for
      if layer.visible = false then continue for
      opacity = world.opacity
      if layer.opacity <> invalid then opacity = opacity * layer.opacity
      if opacity <= 0 then continue for
      tiles = layer.tiles
      if GetInterface(tiles, "ifArray") = invalid then continue for
      for row = 0 to mapHeight - 1
        rowTiles = invalid
        if row < tiles.Count() then rowTiles = tiles[row]
        if GetInterface(rowTiles, "ifArray") = invalid then continue for
        for col = 0 to mapWidth - 1
          tileIndex = -1
          if col < rowTiles.Count() then tileIndex = Int(rowTiles[col])
          if tileIndex < 0 then continue for
          tileRegion = m.resources.GetTilesetTileRegion(tilesetId, tileIndex)
          if tileRegion = invalid then continue for
          drawX = Int(world.x + col * tileWidth - m.scene.cameraX)
          drawY = Int(world.y + row * tileHeight - m.scene.cameraY)
          if not RokuEngine_IsWorldRectVisible(world, mapWidth * tileWidth, mapHeight * tileHeight, m.scene.cameraX, m.scene.cameraY, m.width, m.height) then exit for
          m.screen.DrawObject(drawX, drawY, tileRegion)
          if m.scene.debugStats <> invalid then m.scene.debugStats.spriteCount = m.scene.debugStats.spriteCount + 1
          m.stats.spriteCount = m.stats.spriteCount + 1
        end for
      end for
    end for
  end for
end sub
