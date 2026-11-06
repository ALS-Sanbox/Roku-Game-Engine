' resource_manager.brs - centralized runtime resource system

function RokuEngine_CreateResourceManager(engine as Object) as Object
  manager = {
    engine: engine
    manifestPath: "pkg:/assets/resources.json"
    manifest: invalid
    jsonCache: {}
    bitmapCache: {}
    regionCache: {}
    transformedTileCache: {}
    sceneCache: {}
    sceneManifest: {}
    textureManifest: {}
    spriteSheetManifest: {}
    spriteFramesManifest: {}
    tilesetManifest: {}
    audioManifest: {}
    preloadGroups: {}
    LoadManifest: RokuEngine_Resources_LoadManifest
    EnsureManifest: RokuEngine_Resources_EnsureManifest
    GetJsonDocument: RokuEngine_Resources_GetJsonDocument
    GetScene: RokuEngine_Resources_GetScene
    GetBitmap: RokuEngine_Resources_GetBitmap
    GetTexture: RokuEngine_Resources_GetTexture
    GetSpriteSheet: RokuEngine_Resources_GetSpriteSheet
    GetSpriteFramesLibrary: RokuEngine_Resources_GetSpriteFramesLibrary
    GetTileset: RokuEngine_Resources_GetTileset
    GetTilesetTileRegion: RokuEngine_Resources_GetTilesetTileRegion
    GetTilesetTileDrawable: RokuEngine_Resources_GetTilesetTileDrawable
    NormalizeCellTransform: RokuEngine_Resources_NormalizeCellTransform
    BuildTransformedTileBitmap: RokuEngine_Resources_BuildTransformedTileBitmap
    GetAudio: RokuEngine_Resources_GetAudio
    GetAudioByPath: RokuEngine_Resources_GetAudioByPath
    FindSpriteSheetByResourcePath: RokuEngine_Resources_FindSpriteSheetByResourcePath
    GetSpriteSheetTile: RokuEngine_Resources_GetSpriteSheetTile
    ResolveBitmapPath: RokuEngine_Resources_ResolveBitmapPath
    ResolvePkgPath: RokuEngine_Resources_ResolvePkgPath
    PreloadGroup: RokuEngine_Resources_PreloadGroup
    GetTilemapLayerCell: RokuEngine_Resources_GetTilemapLayerCell
    GetTilemapCellTileIndex: RokuEngine_Resources_GetTilemapCellTileIndex
    GetTilemapCellTransform: RokuEngine_Resources_GetTilemapCellTransform
  }
  return manager
end function

sub RokuEngine_Resources_LoadManifest(path = invalid as Dynamic)
  manifestPath = m.manifestPath
  if path <> invalid and path <> "" then manifestPath = path
  m.manifestPath = manifestPath

  manifestDoc = m.GetJsonDocument(manifestPath)
  if manifestDoc = invalid then manifestDoc = RokuEngine_Resources_BuildLegacyManifest(m)
  if manifestDoc = invalid then manifestDoc = {}

  m.manifest = manifestDoc
  if type(manifestDoc.scenes) = "roAssociativeArray" then m.sceneManifest = manifestDoc.scenes else m.sceneManifest = {}
  if type(manifestDoc.textures) = "roAssociativeArray" then m.textureManifest = manifestDoc.textures else m.textureManifest = {}
  if type(manifestDoc.spriteSheets) = "roAssociativeArray" then m.spriteSheetManifest = manifestDoc.spriteSheets else m.spriteSheetManifest = {}
  if type(manifestDoc.spriteFrames) = "roAssociativeArray" then m.spriteFramesManifest = manifestDoc.spriteFrames else m.spriteFramesManifest = {}
  if type(manifestDoc.tilesets) = "roAssociativeArray" then m.tilesetManifest = manifestDoc.tilesets else m.tilesetManifest = {}
  if type(manifestDoc.audio) = "roAssociativeArray" then m.audioManifest = manifestDoc.audio else m.audioManifest = {}
  if type(manifestDoc.nineSliceStyles) = "roAssociativeArray" then m.nineSliceStyleManifest = manifestDoc.nineSliceStyles else m.nineSliceStyleManifest = {}
  if type(manifestDoc.uiOptionDefs)    = "roAssociativeArray" then m.uiOptionDefs     = manifestDoc.uiOptionDefs    else m.uiOptionDefs     = {}
  if type(manifestDoc.uiHighScoreTable)= "roAssociativeArray" then m.uiHighScoreTable = manifestDoc.uiHighScoreTable else m.uiHighScoreTable = {}
  if type(manifestDoc.uiScreens)       = "roAssociativeArray" then m.uiScreensManifest = manifestDoc.uiScreens      else m.uiScreensManifest = {}
  if type(manifestDoc.uiTransitionPresets) = "roAssociativeArray" then m.uiTransitionPresets = manifestDoc.uiTransitionPresets else m.uiTransitionPresets = {}
  if type(manifestDoc.preloadGroups) = "roAssociativeArray" then m.preloadGroups = manifestDoc.preloadGroups else m.preloadGroups = {}
end sub

sub RokuEngine_Resources_EnsureManifest()
  if m.manifest = invalid then m.LoadManifest()
end sub

function RokuEngine_Resources_GetJsonDocument(path as String) as Dynamic
  if path = invalid or path = "" then return invalid
  if m.jsonCache.DoesExist(path) then return m.jsonCache[path]
  raw = ReadAsciiFile(path)
  if raw = invalid or raw = "" then return invalid
  ' Runtime documents are edited through BrightScript's case-insensitive members.
  parsed = ParseJson(raw, "i")
  if parsed = invalid then return invalid
  m.jsonCache[path] = parsed
  return parsed
end function

function RokuEngine_Resources_GetScene(sceneName as String) as Dynamic
  if sceneName = invalid or sceneName = "" then return invalid
  m.EnsureManifest()
  cacheKey = sceneName
  if m.sceneCache.DoesExist(cacheKey) then return m.sceneCache[cacheKey]

  scenePath = "pkg:/assets/scenes/" + sceneName + ".json"
  if m.sceneManifest.DoesExist(sceneName) then
    sceneMeta = m.sceneManifest[sceneName]
    if sceneMeta <> invalid and sceneMeta.path <> invalid and sceneMeta.path <> "" then scenePath = sceneMeta.path
  end if

  sceneDoc = m.GetJsonDocument(scenePath)
  if sceneDoc <> invalid then m.sceneCache[cacheKey] = sceneDoc
  return sceneDoc
end function

function RokuEngine_Resources_GetTexture(textureId as String) as Dynamic
  m.EnsureManifest()
  if textureId = invalid or textureId = "" then return invalid
  if m.textureManifest.DoesExist(textureId) then return m.textureManifest[textureId]
  return invalid
end function

function RokuEngine_Resources_ResolvePkgPath(resourcePath as Dynamic) as Dynamic
  if resourcePath = invalid then return invalid
  pathValue = RokuEngine_Trim(RokuEngine_ToString(resourcePath))
  if pathValue = "" then return invalid
  if Left(pathValue, 6) = "res://" then return "pkg:/" + Mid(pathValue, 7)
  return pathValue
end function

function RokuEngine_Resources_ResolveBitmapPath(resourceIdOrPath as Dynamic) as Dynamic
  if resourceIdOrPath = invalid then return invalid
  value = RokuEngine_Trim(RokuEngine_ToString(resourceIdOrPath))
  if value = "" then return invalid
  texture = m.GetTexture(value)
  if texture <> invalid and texture.path <> invalid and texture.path <> "" then return m.ResolvePkgPath(texture.path)
  return m.ResolvePkgPath(value)
end function

function RokuEngine_Resources_GetBitmap(resourceIdOrPath as Dynamic) as Dynamic
  if resourceIdOrPath = invalid or resourceIdOrPath = "" then return invalid
  resolvedPath = m.ResolveBitmapPath(resourceIdOrPath)
  if resolvedPath = invalid or resolvedPath = "" then return invalid
  cacheKey = resolvedPath
  if m.bitmapCache.DoesExist(cacheKey) then
    bitmap = m.bitmapCache[cacheKey]
    if m.engine.assetStream <> invalid then m.engine.assetStream.TrackBitmap(cacheKey, bitmap)
    return bitmap
  end if

  bitmap = CreateObject("roBitmap", resolvedPath)
  if bitmap = invalid then return invalid
  m.bitmapCache[cacheKey] = bitmap
  if m.engine.assetStream <> invalid then m.engine.assetStream.TrackBitmap(cacheKey, bitmap)
  return bitmap
end function

function RokuEngine_Resources_GetSpriteSheet(sheetId as String) as Dynamic
  m.EnsureManifest()
  if sheetId = invalid or sheetId = "" then return invalid
  if m.spriteSheetManifest.DoesExist(sheetId) then return m.spriteSheetManifest[sheetId]
  return invalid
end function

function RokuEngine_Resources_GetSpriteFramesLibrary(libraryId as String) as Dynamic
  m.EnsureManifest()
  if libraryId = invalid or libraryId = "" then return invalid
  if m.spriteFramesManifest.DoesExist(libraryId) then return m.spriteFramesManifest[libraryId]
  return invalid
end function



function RokuEngine_Resources_GetTileset(tilesetId as String) as Dynamic
  m.EnsureManifest()
  if tilesetId = invalid or tilesetId = "" then return invalid
  if m.tilesetManifest.DoesExist(tilesetId) then return m.tilesetManifest[tilesetId]
  return invalid
end function

function RokuEngine_Resources_GetTilesetTileRegion(tilesetId as String, tileIndex as Integer) as Dynamic
  if tilesetId = invalid or tilesetId = "" or tileIndex < 0 then return invalid
  cacheKey = "tileset|" + RokuEngine_Trim(RokuEngine_ToString(tilesetId)) + "|" + StrI(tileIndex)
  if m.regionCache.DoesExist(cacheKey) then return m.regionCache[cacheKey]

  tileset = m.GetTileset(tilesetId)
  if tileset = invalid then return invalid
  spriteSheetId = ""
  if tileset.spriteSheetId <> invalid then spriteSheetId = RokuEngine_Trim(RokuEngine_ToString(tileset.spriteSheetId))
  if spriteSheetId = "" then return invalid
  sheet = m.GetSpriteSheet(spriteSheetId)
  if sheet = invalid then return invalid
  basePath = ""
  if sheet.resourcePath <> invalid and sheet.resourcePath <> "" then basePath = RokuEngine_Trim(RokuEngine_ToString(sheet.resourcePath)) else if sheet.filePath <> invalid then basePath = RokuEngine_Trim(RokuEngine_ToString(sheet.filePath))
  if basePath = "" then return invalid
  bitmap = m.GetBitmap(basePath)
  if bitmap = invalid then return invalid

  tileWidth = Int(tileset.tileWidth)
  tileHeight = Int(tileset.tileHeight)
  padding = 0
  if tileset.padding <> invalid then padding = Int(tileset.padding)
  offsetX = 0 : offsetY = 0
  if sheet.offsetX <> invalid then offsetX = Int(sheet.offsetX)
  if sheet.offsetY <> invalid then offsetY = Int(sheet.offsetY)
  if tileWidth <= 0 or tileHeight <= 0 then return invalid

  columns = 1
  if sheet.columns <> invalid and Int(sheet.columns) > 0 then
    columns = Int((Int(sheet.imageWidth) - offsetX + padding) / (tileWidth + padding))
    if columns <= 0 then columns = Int(sheet.columns)
  else
    columns = Int((Int(sheet.imageWidth) - offsetX + padding) / (tileWidth + padding))
  end if
  if columns <= 0 then columns = 1

  col = tileIndex Mod columns
  row = Int(tileIndex / columns)
  x = offsetX + col * (tileWidth + padding)
  y = offsetY + row * (tileHeight + padding)
  w = tileWidth
  h = tileHeight

  metaMap = invalid
  if tileset.tileMetadata <> invalid and GetInterface(tileset.tileMetadata, "ifAssociativeArray") <> invalid then metaMap = tileset.tileMetadata
  if metaMap <> invalid then
    metaKey = StrI(tileIndex)
    if metaMap.DoesExist(metaKey) then
      meta = metaMap[metaKey]
      if meta <> invalid then
        if meta.atlasX <> invalid and meta.atlasX <> "" then x = offsetX + Int(meta.atlasX)
        if meta.atlasY <> invalid and meta.atlasY <> "" then y = offsetY + Int(meta.atlasY)
        if meta.atlasW <> invalid and meta.atlasW <> "" and Int(meta.atlasW) > 0 then w = Int(meta.atlasW)
        if meta.atlasH <> invalid and meta.atlasH <> "" and Int(meta.atlasH) > 0 then h = Int(meta.atlasH)
      end if
    end if
  end if

  region = CreateObject("roRegion", bitmap, x, y, w, h)
  if region <> invalid then m.regionCache[cacheKey] = region
  return region
end function

function RokuEngine_Resources_GetAudio(audioId as String) as Dynamic
  m.EnsureManifest()
  if audioId = invalid or audioId = "" then return invalid
  if m.engine.scene <> invalid then
    scoped = m.engine.scene.name+"::"+audioId
    if m.audioManifest.DoesExist(scoped) then return m.audioManifest[scoped]
  end if
  if m.audioManifest.DoesExist(audioId) then return m.audioManifest[audioId]
  return invalid
end function

function RokuEngine_Resources_GetAudioByPath(path as String) as Dynamic
  m.EnsureManifest()
  if path = invalid or path = "" then return invalid
  for each audioId in m.audioManifest
    entry = m.audioManifest[audioId]
    if entry <> invalid and RokuEngine_NormalizeScriptPath(entry.path) = RokuEngine_NormalizeScriptPath(path) then
      if entry.sceneName = invalid or m.engine.scene = invalid or entry.sceneName = m.engine.scene.name then return entry
    end if
  end for
  return invalid
end function

function RokuEngine_Resources_FindSpriteSheetByResourcePath(basePath as String) as Dynamic
  m.EnsureManifest()
  if basePath = invalid or basePath = "" then return invalid
  for each sheetId in m.spriteSheetManifest
    sheet = m.spriteSheetManifest[sheetId]
    if sheet = invalid then continue for
    if sheet.resourcePath = basePath or sheet.filePath = basePath then return sheet
  end for
  return invalid
end function

function RokuEngine_Resources_GetSpriteSheetTile(basePath as String, tileIndex as Integer) as Dynamic
  if basePath = invalid or basePath = "" or tileIndex < 0 then return invalid
  cacheKey = RokuEngine_Trim(RokuEngine_ToString(basePath)) + "#tile:" + StrI(tileIndex)
  if m.regionCache.DoesExist(cacheKey) then return m.regionCache[cacheKey]

  sheet = m.FindSpriteSheetByResourcePath(basePath)
  if sheet = invalid then return invalid
  bitmap = m.GetBitmap(basePath)
  if bitmap = invalid then return invalid

  tileWidth = 0 : tileHeight = 0 : columns = 0 : padding = 0 : offsetX = 0 : offsetY = 0
  if sheet.tileWidth <> invalid then tileWidth = Int(sheet.tileWidth)
  if sheet.tileHeight <> invalid then tileHeight = Int(sheet.tileHeight)
  if sheet.columns <> invalid then columns = Int(sheet.columns)
  if sheet.padding <> invalid then padding = Int(sheet.padding)
  if sheet.offsetX <> invalid then offsetX = Int(sheet.offsetX)
  if sheet.offsetY <> invalid then offsetY = Int(sheet.offsetY)
  if tileWidth <= 0 or tileHeight <= 0 or columns <= 0 then return invalid

  col = tileIndex Mod columns
  row = Int(tileIndex / columns)
  x = offsetX + col * (tileWidth + padding)
  y = offsetY + row * (tileHeight + padding)
  region = CreateObject("roRegion", bitmap, x, y, tileWidth, tileHeight)
  if region <> invalid then m.regionCache[cacheKey] = region
  return region
end function

sub RokuEngine_Resources_PreloadGroup(groupName as String)
  m.EnsureManifest()
  if groupName = invalid or groupName = "" then return
  if m.preloadGroups.DoesExist(groupName) <> true then return
  group = m.preloadGroups[groupName]
  if group = invalid then return

  if type(group.scenes) = "roArray" then
    for each sceneName in group.scenes
      if sceneName <> invalid and sceneName <> "" then dummy = m.GetScene(sceneName)
    end for
  end if
  if type(group.textures) = "roArray" then
    for each textureId in group.textures
      if textureId <> invalid and textureId <> "" then dummy = m.GetBitmap(textureId)
    end for
  end if
  if type(group.audio) = "roArray" then
    for each audioId in group.audio
      if audioId <> invalid and audioId <> "" then dummy = m.GetAudio(audioId)
    end for
  end if
end sub

function RokuEngine_Resources_BuildLegacyManifest(manager as Object) as Object
  scenes = {}
  textures = {}
  spriteSheets = {}
  spriteFrames = {}
  tilesets = {}
  audio = {}

  sheetsDoc = manager.GetJsonDocument("pkg:/assets/spritesheets.json")
  if sheetsDoc <> invalid and type(sheetsDoc.sheets) = "roArray" then
    for each sheet in sheetsDoc.sheets
      if sheet = invalid or sheet.id = invalid or sheet.id = "" then continue for
      spriteSheets[sheet.id] = sheet
      texturePath = ""
      if sheet.resourcePath <> invalid and sheet.resourcePath <> "" then texturePath = sheet.resourcePath else if sheet.filePath <> invalid then texturePath = sheet.filePath
      if texturePath <> "" then textures[sheet.id] = { id: sheet.id, path: texturePath, kind: "image" }
    end for
  end if

  libsDoc = manager.GetJsonDocument("pkg:/assets/spriteframes.json")
  if libsDoc <> invalid and type(libsDoc.libraries) = "roArray" then
    for each lib in libsDoc.libraries
      if lib = invalid or lib.id = invalid or lib.id = "" then continue for
      spriteFrames[lib.id] = lib
    end for
  end if

  tilesetsDoc = manager.GetJsonDocument("pkg:/assets/tilesets.json")
  if tilesetsDoc <> invalid and type(tilesetsDoc.tilesets) = "roArray" then
    for each tileset in tilesetsDoc.tilesets
      if tileset = invalid or tileset.id = invalid or tileset.id = "" then continue for
      tilesets[tileset.id] = tileset
    end for
  end if

  return {
    formatVersion: 1
    scenes: scenes
    textures: textures
    spriteSheets: spriteSheets
    spriteFrames: spriteFrames
    tilesets: tilesets
    audio: audio
    preloadGroups: { boot: { scenes: [], textures: [], audio: [] } }
  }
end function


function RokuEngine_Resources_NormalizeCellTransform(transform as Dynamic) as Object
  normalized = {
    flipX: false
    flipY: false
    rotation: 0
  }
  if GetInterface(transform, "ifAssociativeArray") = invalid then return normalized
  normalized.flipX = (transform.flipX = true)
  normalized.flipY = (transform.flipY = true)
  rotation = 0
  if transform.rotation <> invalid then rotation = Int(transform.rotation)
  rotation = rotation Mod 360
  if rotation < 0 then rotation = rotation + 360
  if rotation <> 0 and rotation <> 90 and rotation <> 180 and rotation <> 270 then rotation = 0
  normalized.rotation = rotation
  return normalized
end function

function RokuEngine_Resources_GetTilesetTileDrawable(tilesetId as String, tileIndex as Integer, cellTransform as Dynamic) as Dynamic
  baseRegion = m.GetTilesetTileRegion(tilesetId, tileIndex)
  if baseRegion = invalid then return invalid
  transform = m.NormalizeCellTransform(cellTransform)
  if transform.flipX = false and transform.flipY = false and transform.rotation = 0 then return baseRegion
  cacheKey = "tilexform|" + RokuEngine_Trim(RokuEngine_ToString(tilesetId)) + "|" + StrI(tileIndex) + "|" + LCase(RokuEngine_ToString(transform.flipX)) + "|" + LCase(RokuEngine_ToString(transform.flipY)) + "|" + StrI(transform.rotation)
  if m.transformedTileCache <> invalid and m.transformedTileCache.DoesExist(cacheKey) then return m.transformedTileCache[cacheKey]
  transformed = m.BuildTransformedTileBitmap(baseRegion, transform)
  if transformed <> invalid then
    if m.transformedTileCache = invalid then m.transformedTileCache = {}
    m.transformedTileCache[cacheKey] = transformed
    return transformed
  end if
  return baseRegion
end function

function RokuEngine_Resources_BuildTransformedTileBitmap(region as Dynamic, transform as Object) as Dynamic
  if region = invalid then return invalid
  width = region.GetWidth()
  height = region.GetHeight()
  if width <= 0 or height <= 0 then return invalid

  working = region
  if transform.flipX or transform.flipY then
    flipped = CreateObject("roBitmap", { width: width, height: height, AlphaEnable: true })
    if flipped <> invalid then
      drawX = 0.0
      drawY = 0.0
      scaleX = 1.0
      scaleY = 1.0
      if transform.flipX then
        drawX = width
        scaleX = -1.0
      end if
      if transform.flipY then
        drawY = height
        scaleY = -1.0
      end if
      flipped.DrawScaledObject(drawX, drawY, scaleX, scaleY, region)
      working = CreateObject("roRegion", flipped, 0, 0, width, height)
    end if
  end if

  if transform.rotation <> 0 then
    rotated = CreateObject("roBitmap", { width: width, height: height, AlphaEnable: true })
    if rotated <> invalid then
      rotated.DrawRotatedObject(Int(width / 2), Int(height / 2), transform.rotation, working)
      working = CreateObject("roRegion", rotated, 0, 0, width, height)
    end if
  end if

  return working
end function

' ── Tilemap cell terrain helpers (Patch v35.5) ───────────────────────────────
'
' The editor pre-resolves all terrain-painted cells into final tileIndex and
' transform values before export.  These helpers let game scripts read that
' resolved data at runtime without needing any terrain rule solver.
'
' Cell shape (written by the editor exporter):
'   { terrainTypeId, terrainSetId, tileIndex, transform: { flipX, flipY, rotation } }
'
' Usage example:
'   layer = props.layers[layerIndex]
'   tileIndex = resources.GetTilemapCellTileIndex(layer, col, row)
'   transform = resources.GetTilemapCellTransform(layer, col, row)
'   drawable  = resources.GetTilesetTileDrawable(tilesetId, tileIndex, transform)

' Return the cellData entry for (col, row) in a layer, or invalid.
function RokuEngine_Resources_GetTilemapLayerCell(layer as Dynamic, col as Integer, row as Integer) as Dynamic
  if layer = invalid then return invalid
  cellData = layer.cellData
  if GetInterface(cellData, "ifArray") = invalid then return invalid
  if row < 0 or row >= cellData.Count() then return invalid
  rowArr = cellData[row]
  if GetInterface(rowArr, "ifArray") = invalid then return invalid
  if col < 0 or col >= rowArr.Count() then return invalid
  cell = rowArr[col]
  if GetInterface(cell, "ifAssociativeArray") = invalid then return invalid
  return cell
end function

' Return the resolved tileIndex for (col, row), or -1 when empty / unresolved.
' For non-terrain cells, falls back to layer.tiles[row][col].
function RokuEngine_Resources_GetTilemapCellTileIndex(layer as Dynamic, col as Integer, row as Integer) as Integer
  cell = m.GetTilemapLayerCell(layer, col, row)
  if cell <> invalid then
    if cell.tileIndex <> invalid then
      idx = Int(cell.tileIndex)
      if idx >= 0 then return idx
    end if
  end if
  ' Fallback: read from the flat tiles grid
  if layer = invalid then return -1
  tilesArr = layer.tiles
  if GetInterface(tilesArr, "ifArray") = invalid then return -1
  if row < 0 or row >= tilesArr.Count() then return -1
  rowArr = tilesArr[row]
  if GetInterface(rowArr, "ifArray") = invalid then return -1
  if col < 0 or col >= rowArr.Count() then return -1
  val = rowArr[col]
  if val = invalid then return -1
  return Int(val)
end function

' Return the resolved transform for (col, row).
' Returns a normalized { flipX, flipY, rotation } object.
' Never returns invalid — defaults to identity transform.
function RokuEngine_Resources_GetTilemapCellTransform(layer as Dynamic, col as Integer, row as Integer) as Object
  cell = m.GetTilemapLayerCell(layer, col, row)
  if cell <> invalid and cell.transform <> invalid then
    return m.NormalizeCellTransform(cell.transform)
  end if
  return { flipX: false, flipY: false, rotation: 0 }
end function
