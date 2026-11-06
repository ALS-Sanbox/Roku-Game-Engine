' asset_stream.brs — RGE v91
' Runtime asset streaming + cache management for Roku.
'
' Augments resource_manager.brs with:
'  - Preload group execution
'  - Lazy load queue (processes N assets per frame)
'  - Cache eviction by LRU when texture budget exceeded
'  - Missing asset recovery (fallback to placeholder)
'  - Asset version validation against manifest

' ── Stream manager factory ────────────────────────────────────────────────────

function RokuStream_Create(engine as Object) as Object
  sm = {
    engine:         engine
    lazyQueue:      []
    loadedGuids:    {}
    accessTimes:    {}
    sizesKb:        {}
    accessCounter:  0
    paths:          {}
    lastWarning:    ""
    totalKb:        0
    budgetKb:       81920   ' 80 MB
    batchSize:      3       ' assets per frame
    placeholderBm:  invalid

    PreloadGroup:   RokuStream_PreloadGroup
    EnqueueLazy:    RokuStream_EnqueueLazy
    ProcessQueue:   RokuStream_ProcessQueue
    TrackBitmap:    RokuStream_TrackBitmap
    IsPinned:       RokuStream_IsPinned
    LoadAsset:      RokuStream_LoadAsset
    EvictLRU:       RokuStream_EvictLRU
    IsLoaded:       RokuStream_IsLoaded
    MarkAccess:     RokuStream_MarkAccess
    GetPlaceholder: RokuStream_GetPlaceholder
    ValidateManifest: RokuStream_ValidateManifest
  }
  sm.placeholderBm = RokuStream_MakePlaceholder()
  return sm
end function

' ── Placeholder ───────────────────────────────────────────────────────────────

function RokuStream_MakePlaceholder() as Dynamic
  bm = CreateObject("roBitmap", { width: 16, height: 16, alphaEnable: true })
  if bm = invalid then return invalid
  bm.Clear(&hFF00FFFF)  ' magenta = missing
  return bm
end function

' ── Preload group ─────────────────────────────────────────────────────────────

sub RokuStream_PreloadGroup(groupId as String, lazy = false as Boolean)
  engine = m.engine
  if engine = invalid or engine.resources = invalid then return
  rm = engine.resources
  manifest = rm.manifest
  if manifest = invalid then return

  ' Look up preloadGroups section
  pGroups = manifest.preloadGroups
  if type(pGroups) <> "roAssociativeArray" then return
  group = pGroups[groupId]
  if group = invalid then return

  ' Preload textures
  if type(group.textures) = "roArray" then
    for each guid in group.textures
      if not m.IsLoaded(guid) then
        entry = rm.textureManifest[guid]
        if entry <> invalid and entry.path <> invalid then
          if lazy then
            m.EnqueueLazy(guid, entry.path, "texture")
          else
            m.LoadAsset(guid, entry.path, "texture")
          end if
        end if
      end if
    end for
  end if

  ' Preload audio
  if type(group.audio) = "roArray" then
    for each guid in group.audio
      if not m.IsLoaded(guid) then
        entry = rm.GetAudio(guid)
      end if
    end for
  end if
  if type(group.scenes) = "roArray" then
    for each sceneName in group.scenes
      sceneDocument = rm.GetScene(sceneName)
    end for
  end if
end sub

' ── Lazy queue ────────────────────────────────────────────────────────────────

sub RokuStream_EnqueueLazy(guid as String, path as String, kind as String)
  if m.IsLoaded(guid) then return
  ' Check not already queued
  for each item in m.lazyQueue
    if item.guid = guid then return
  end for
  m.lazyQueue.Push({ guid: guid, path: path, kind: kind })
end sub

' Call once per frame from engine update loop
sub RokuStream_ProcessQueue()
  processed = 0
  toRemove = []
  for each item in m.lazyQueue
    if processed >= m.batchSize then exit for
    m.LoadAsset(item.guid, item.path, item.kind)
    toRemove.Push(item.guid)
    processed = processed + 1
  end for
  ' Remove processed items
  filtered = []
  for each item in m.lazyQueue
    keep = true
    for each guid in toRemove
      if item.guid = guid then keep = false
    end for
    if keep then filtered.Push(item)
  end for
  m.lazyQueue = filtered
  m.EvictLRU()
end sub

' ── Load ─────────────────────────────────────────────────────────────────────

function RokuStream_LoadAsset(guid as String, path as String, kind as String) as Boolean
  if guid = "" or path = "" then return false
  rm = m.engine.resources
  if rm = invalid then return false
  if kind = "audio" then return rm.GetAudio(guid) <> invalid
  bitmap = rm.GetBitmap(path)
  if bitmap = invalid then return false
  key = rm.ResolveBitmapPath(path)
  m.paths[guid] = key
  m.TrackBitmap(key, bitmap)
  return true
end function

function RokuStream_IsLoaded(guid as String) as Boolean
  key = guid
  if m.paths.DoesExist(guid) then key = m.paths[guid]
  return m.loadedGuids.DoesExist(key)
end function

sub RokuStream_MarkAccess(guid as String)
  m.accessCounter = m.accessCounter+1
  m.accessTimes[guid] = m.accessCounter
end sub

' ── LRU eviction ─────────────────────────────────────────────────────────────

sub RokuStream_EvictLRU()
  m.lastWarning = ""
  while m.totalKb > m.budgetKb
    oldest = "" : age = 1e30
    for each key in m.loadedGuids
      if not m.IsPinned(key) and m.accessTimes[key] < age then oldest = key : age = m.accessTimes[key]
    end for
    if oldest = "" then
      m.lastWarning = "Active scene textures exceed the streaming budget; pinned assets retained."
      exit while
    end if
    m.engine.resources.bitmapCache.Delete(oldest)
    m.engine.resources.regionCache.Clear()
    m.engine.resources.transformedTileCache.Clear()
    m.totalKb = m.totalKb-m.sizesKb[oldest]
    m.loadedGuids.Delete(oldest) : m.accessTimes.Delete(oldest) : m.sizesKb.Delete(oldest)
  end while
end sub

' ── Placeholder fallback ──────────────────────────────────────────────────────

function RokuStream_GetPlaceholder() as Dynamic
  return m.placeholderBm
end function

' ── Manifest validation ───────────────────────────────────────────────────────

function RokuStream_ValidateManifest(manifest as Dynamic) as Object
  result = { valid: true, missing: [], warnings: [] }
  if manifest = invalid then
    result.valid = false
    result.missing.Push("manifest itself is missing")
    return result
  end if

  if type(manifest.textures) <> "roAssociativeArray" then
    result.warnings.Push("No textures table in manifest")
    return result
  end if

  for each guid in manifest.textures
    entry = manifest.textures[guid]
    if entry = invalid or entry.path = invalid or entry.path = "" then
      result.missing.Push(guid)
      result.valid = false
    end if
  end for

  return result
end function

sub RokuStream_TrackBitmap(key as String, bitmap as Object)
  if bitmap = invalid then return
  if m.loadedGuids.DoesExist(key) <> true then
    kb = bitmap.GetWidth()*bitmap.GetHeight()*4.0/1024.0
    m.loadedGuids[key] = true : m.sizesKb[key] = kb : m.totalKb = m.totalKb+kb
  end if
  m.MarkAccess(key)
end sub

function RokuStream_IsPinned(path as String) as Boolean
  engine = m.engine : rm = engine.resources
  if engine.scene = invalid then return false
  for each node in engine.scene.doc.nodes
    p = node.properties
    if p = invalid then continue for
    if p.imagePath <> invalid and p.imagePath <> "" then
      if rm.ResolveBitmapPath(p.imagePath) = path then return true
    end if
    sheets = []
    if p.spriteSheetId <> invalid then sheets.Push(p.spriteSheetId)
    libraries = []
    if p.spriteFramesId <> invalid then libraries.Push(p.spriteFramesId)
    if engine.scene.runtime <> invalid and engine.scene.runtime.nodes <> invalid then
      runtime = engine.scene.runtime.nodes[node.id]
      if runtime <> invalid and runtime.graphController <> invalid then
        for each clipId in runtime.graphController.graph.clips
          graphClip = runtime.graphController.graph.clips[clipId]
          if graphClip.spriteFramesId <> invalid then libraries.Push(graphClip.spriteFramesId)
        end for
      end if
    end if
    for each libraryId in libraries
      if not rm.spriteFramesManifest.DoesExist(libraryId) then continue for
      library = rm.spriteFramesManifest[libraryId]
      if library.defaultSheetId <> invalid then sheets.Push(library.defaultSheetId)
      if type(library.clips) = "roArray" then
        for each clip in library.clips
          if clip.spriteSheetId <> invalid then sheets.Push(clip.spriteSheetId)
        end for
      end if
    end for
    if p.tilesetId <> invalid and rm.tilesetManifest.DoesExist(p.tilesetId) then
      tileset = rm.tilesetManifest[p.tilesetId]
      if tileset.spriteSheetId <> invalid then sheets.Push(tileset.spriteSheetId)
      if tileset.imagePath <> invalid and tileset.imagePath <> "" then
        if rm.ResolveBitmapPath(tileset.imagePath) = path then return true
      end if
    end if
    for each id in sheets
      if rm.spriteSheetManifest.DoesExist(id) then
        sheet = rm.spriteSheetManifest[id]
        if sheet.resourcePath <> invalid and rm.ResolveBitmapPath(sheet.resourcePath) = path then return true
      end if
    end for
    if p.nineSliceStyleId <> invalid and p.nineSliceStyleId <> "" then
      for each id in rm.nineSliceStyleManifest
        style = rm.nineSliceStyleManifest[id]
        if style.imagePath <> invalid and rm.ResolveBitmapPath(style.imagePath) = path then return true
      end for
    end if
  end for
  return false
end function
