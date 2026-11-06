' sprite_renderer.brs - compositor sprite lifecycle and sprite sync

sub RokuEngine_SyncCompositorSprites()
  if m.scene = invalid then return
  if m.scene.hasWorldNodes = false then return
  m.UpdateWorldTransforms(m.scene)
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

    nodeWidth = 0
    nodeHeight = 0
    if props.width <> invalid then nodeWidth = props.width
    if props.height <> invalid then nodeHeight = props.height
    rect = RokuEngine_WorldRect(world, nodeWidth, nodeHeight)
    drawX = Int((rect.x - m.scene.cameraX) * m.scene.cameraZoom)
    drawY = Int((rect.y - m.scene.cameraY) * m.scene.cameraZoom)
    repeated = RokuGameplay_HasRepeat(m, node)
    if world.visible = false or world.opacity <= 0 or (not repeated and nodeWidth > 0 and nodeHeight > 0 and not RokuEngine_IsWorldRectVisible(world, nodeWidth, nodeHeight, m.scene.cameraX, m.scene.cameraY, m.width / m.scene.cameraZoom, m.height / m.scene.cameraZoom)) then
      m.RemoveNodeCompositorSprite(node)
    else if node.type = "Sprite2D" then
      bitmap = m.LoadImageAsset(props.imagePath)
      if bitmap = invalid then
        m.RemoveNodeCompositorSprite(node)
      else
        sourceX = 0 : sourceY = 0 : sourceW = bitmap.GetWidth() : sourceH = bitmap.GetHeight()
        sourceBitmap = bitmap
        baseX = 0 : baseY = 0
        if type(bitmap) = "roRegion" then
          sourceBitmap = bitmap.GetBitmap()
          baseX = bitmap.GetX() : baseY = bitmap.GetY()
        end if
        if props.sourceRect <> invalid then
          crop = props.sourceRect
          if crop.w <> invalid and crop.h <> invalid and crop.w > 0 and crop.h > 0 then
            if crop.x <> invalid then sourceX = Int(crop.x)
            if crop.y <> invalid then sourceY = Int(crop.y)
            if sourceX < 0 then sourceX = 0
            if sourceY < 0 then sourceY = 0
            if sourceX >= sourceW then sourceX = sourceW - 1
            if sourceY >= sourceH then sourceY = sourceH - 1
            sourceW = sourceW - sourceX : sourceH = sourceH - sourceY
            if crop.w < sourceW then sourceW = Int(crop.w)
            if crop.h < sourceH then sourceH = Int(crop.h)
          end if
        end if
        textureKey = "sprite|"
        if props.imagePath <> invalid then textureKey = textureKey + props.imagePath
        textureKey = textureKey + "|" + sourceX.ToStr() + "," + sourceY.ToStr() + "," + sourceW.ToStr() + "," + sourceH.ToStr()
        needsCreate = (spriteState.member = invalid or spriteState.kind <> "sprite" or spriteState.textureKey <> textureKey or spriteState.layer <> layer)
        if needsCreate then
          m.RemoveNodeCompositorSprite(node)
          spriteState = m.EnsureSpriteNodeRuntime(node)
          drawable = CreateObject("roRegion", sourceBitmap, baseX + sourceX, baseY + sourceY, sourceW, sourceH)
          spriteState.member = m.compositor.NewSprite(drawX, drawY, drawable, layer)
          spriteState.sourceRegion = drawable
          spriteState.kind = "sprite"
          spriteState.textureKey = textureKey
          spriteState.layer = layer
          spriteState.baseWidth = sourceW
          spriteState.baseHeight = sourceH
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
        animationRuntime = m.EnsureNodeRuntime(node)
        if animationRuntime.currentAnimationFrameIndex <> invalid then frameIndex = animationRuntime.currentAnimationFrameIndex
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
        if animationRuntime.graphController <> invalid then propsKey = propsKey+"|graph:"+animationRuntime.graphController.currentStateId

        needsCreate = (spriteState.member = invalid or spriteState.kind <> "animated_frame" or spriteState.textureKey <> propsKey or spriteState.layer <> layer)
        if needsCreate then
          m.RemoveNodeCompositorSprite(node)
          spriteState = m.EnsureSpriteNodeRuntime(node)
          spriteState.member = m.compositor.NewSprite(drawX, drawY, frame, layer)
          spriteState.sourceRegion = frame
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
  spriteState.drawX = drawX : spriteState.drawY = drawY
  scale = m.ComputeSpriteScale(node, world, spriteState)
  if scale = invalid or spriteState.sourceRegion = invalid then return
  ' roSprite has no SetScale method. Cache a scaled bitmap/region instead.
  angle = world.rotation
  tint = _BRS_StrCoalesce(node.properties.tint, "#ffffff")
  color = RokuEngine_HexToRgba(tint, world.opacity)
  if spriteState.appliedScaleX = scale.x and spriteState.appliedScaleY = scale.y and spriteState.appliedAngle = angle and spriteState.appliedColor = color then return
  if m.scaledSpriteBytes = invalid then m.scaledSpriteBytes = 0
  if spriteState.scaledBytes <> invalid then m.scaledSpriteBytes = m.scaledSpriteBytes - spriteState.scaledBytes
  spriteState.scaledBytes = 0
  spriteState.scaledBitmap = invalid
  spriteState.appliedScaleX = scale.x
  spriteState.appliedScaleY = scale.y
  spriteState.appliedAngle = angle
  spriteState.appliedColor = color
  if scale.x = 1 and scale.y = 1 and angle = 0 and color = &hFFFFFFFF then
    spriteState.member.SetRegion(spriteState.sourceRegion)
    spriteState.drawable = spriteState.sourceRegion
    return
  end if
  rect = RokuEngine_WorldRect(world, _BRS_NumCoalesce(node.properties.width, spriteState.baseWidth), _BRS_NumCoalesce(node.properties.height, spriteState.baseHeight))
  width = Int(rect.width * m.scene.cameraZoom + 0.9999)
  height = Int(rect.height * m.scene.cameraZoom + 0.9999)
  ' One bitmap per visible node; maximum 2048 per axis / 4 MiB per node.
  if width < 1 or height < 1 or width > 2048 or height > 2048 or width * height > 1048576 or m.scaledSpriteBytes + width * height * 4 > 16777216 then
    spriteState.member.SetRegion(spriteState.sourceRegion)
    spriteState.drawable = spriteState.sourceRegion
    if spriteState.warnedLimit <> true then print "RokuEngine warning: scaled sprite cache limit: "; node.name
    spriteState.warnedLimit = true
    return
  end if
  scaled = CreateObject("roBitmap", {width: width, height: height, alphaEnable: true})
  if scaled = invalid then return
  scaled.Clear(&h00000000)
  originX = (world.x - rect.x) * m.scene.cameraZoom
  originY = (world.y - rect.y) * m.scene.cameraZoom
  scaled.DrawTransformedObject(Int(originX), Int(originY), -angle, scale.x, scale.y, spriteState.sourceRegion, color)
  spriteState.scaledBytes = width * height * 4
  m.scaledSpriteBytes = m.scaledSpriteBytes + spriteState.scaledBytes
  spriteState.scaledBitmap = scaled
  spriteState.drawable = CreateObject("roRegion", scaled, 0, 0, width, height)
  spriteState.member.SetRegion(spriteState.drawable)
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
  return { x: targetWidth * world.scaleX / baseWidth * m.scene.cameraZoom, y: targetHeight * world.scaleY / baseHeight * m.scene.cameraZoom }
end function

function RokuEngine_ParseTileAssetPath(resourcePath as Dynamic) as Dynamic
  if resourcePath = invalid then return invalid
  value = RokuEngine_Trim(RokuEngine_ToString(resourcePath))
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


sub RokuEngine_RenderPassTileMaps(onlyNodeId = "" as String)
  if m.scene = invalid then return
  traversalIds = m.GetRenderTraversalNodeIds()
  for each nodeId in traversalIds
    if m.scene.nodeMap.DoesExist(nodeId) <> true then continue for
    node = m.scene.nodeMap[nodeId]
    if node = invalid or node.type <> "TileMap" then continue for
    if onlyNodeId <> "" and nodeId <> onlyNodeId then continue for
    world = m.GetWorldTransform(node.id)
    if world = invalid or world.visible = false or world.opacity <= 0 then continue for
    props = node.properties
    if props = invalid then props = {}
    tileWidth = 32 : tileHeight = 32 : mapWidth = 0 : mapHeight = 0
    if props.tileWidth <> invalid and Int(props.tileWidth) > 0 then tileWidth = Int(props.tileWidth)
    if props.tileHeight <> invalid and Int(props.tileHeight) > 0 then tileHeight = Int(props.tileHeight)
    if props.mapWidth <> invalid then mapWidth = Int(props.mapWidth)
    if props.mapHeight <> invalid then mapHeight = Int(props.mapHeight)
    defaultTilesetId = ""
    if props.tilesetId <> invalid then defaultTilesetId = RokuEngine_Trim(RokuEngine_ToString(props.tilesetId))
    if GetInterface(props.layers, "ifArray") = invalid then continue for
    for each layer in props.layers
      if layer = invalid then continue for
      if layer.visible = false then continue for
      tilesetId = defaultTilesetId
      if layer.tilesetId <> invalid and RokuEngine_Trim(RokuEngine_ToString(layer.tilesetId)) <> "" then tilesetId = RokuEngine_Trim(RokuEngine_ToString(layer.tilesetId))
      if tilesetId = "" then continue for
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
          cellTransform = invalid
          if GetInterface(layer.cellData, "ifArray") <> invalid and row < layer.cellData.Count() then
            rowCellData = layer.cellData[row]
            if GetInterface(rowCellData, "ifArray") <> invalid and col < rowCellData.Count() then
              cell = rowCellData[col]
              if GetInterface(cell, "ifAssociativeArray") <> invalid and cell.transform <> invalid then cellTransform = cell.transform
            end if
          end if
          tileRegion = m.resources.GetTilesetTileDrawable(tilesetId, tileIndex, cellTransform)
          if tileRegion = invalid then continue for
          rect = RokuEngine_WorldRect(world, tileWidth, tileHeight, col * tileWidth, row * tileHeight)
          drawX = Int((rect.x - m.scene.cameraX) * m.scene.cameraZoom)
          drawY = Int((rect.y - m.scene.cameraY) * m.scene.cameraZoom)
          if not RokuEngine_IsWorldRectVisible(world, mapWidth * tileWidth, mapHeight * tileHeight, m.scene.cameraX, m.scene.cameraY, m.width / m.scene.cameraZoom, m.height / m.scene.cameraZoom) then exit for
          originX = world.x + world.a * col * tileWidth + world.c * row * tileHeight
          originY = world.y + world.b * col * tileWidth + world.d * row * tileHeight
          color = RokuEngine_HexToRgba(_BRS_StrCoalesce(props.tint,"#ffffff"),opacity)
          m.screen.DrawTransformedObject(Int((originX-m.scene.cameraX)*m.scene.cameraZoom),Int((originY-m.scene.cameraY)*m.scene.cameraZoom),-world.rotation,tileWidth*world.scaleX*m.scene.cameraZoom/tileRegion.GetWidth(),tileHeight*world.scaleY*m.scene.cameraZoom/tileRegion.GetHeight(),tileRegion,color)
          if m.scene.debugStats <> invalid then m.scene.debugStats.spriteCount = m.scene.debugStats.spriteCount + 1
          m.stats.spriteCount = m.stats.spriteCount + 1
        end for
      end for
    end for
  end for
end sub
