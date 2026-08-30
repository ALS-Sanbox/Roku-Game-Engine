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
    totalKb:        0
    budgetKb:       81920   ' 80 MB
    batchSize:      3       ' assets per frame
    placeholderBm:  invalid

    PreloadGroup:   RokuStream_PreloadGroup
    EnqueueLazy:    RokuStream_EnqueueLazy
    ProcessQueue:   RokuStream_ProcessQueue
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

sub RokuStream_PreloadGroup(groupId as String)
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
        entry = manifest.assets[guid]
        if entry <> invalid and entry.path <> invalid then
          m.LoadAsset(guid, entry.path, entry.kind)
        end if
      end if
    end for
  end if

  ' Preload audio
  if type(group.audio) = "roArray" then
    for each guid in group.audio
      if not m.IsLoaded(guid) then
        entry = manifest.assets[guid]
        if entry <> invalid then m.LoadAsset(guid, entry.path, entry.kind)
      end if
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
end sub

' ── Load ─────────────────────────────────────────────────────────────────────

sub RokuStream_LoadAsset(guid as String, path as String, kind as String)
  if guid = "" or path = "" then return
  if m.IsLoaded(guid) then
    m.MarkAccess(guid)
    return
  end if

  engine = m.engine
  rm     = engine.resources
  if rm = invalid then return

  sizeKb = 0

  if kind = "texture" or kind = "spritesheet" or kind = "atlas" then
    bm = rm.GetBitmap(path)
    if bm <> invalid then
      sizeKb = (bm.GetWidth() * bm.GetHeight() * 4) / 1024
    end if
  end if

  if kind = "audio" then
    ' Audio loaded on demand by audio system; register presence
    sizeKb = 64  ' conservative 64 KB placeholder
  end if

  m.loadedGuids[guid] = true
  m.sizesKb[guid]     = sizeKb
  m.totalKb           = m.totalKb + sizeKb
  m.MarkAccess(guid)

  if m.totalKb > m.budgetKb then m.EvictLRU()
end sub

function RokuStream_IsLoaded(guid as String) as Boolean
  return m.loadedGuids[guid] = true
end function

sub RokuStream_MarkAccess(guid as String)
  m.accessTimes[guid] = CreateObject("roTimespan").TotalMilliseconds()
end sub

' ── LRU eviction ─────────────────────────────────────────────────────────────

sub RokuStream_EvictLRU()
  ' Collect evictable entries sorted by access time
  entries = []
  for each guid in m.loadedGuids
    t = m.accessTimes[guid]
    if t = invalid then t = 0
    entries.Push({ guid: guid, t: t, kb: m.sizesKb[guid] })
  end for

  ' Sort ascending by access time (oldest first) — BrightScript has no built-in sort
  n = entries.Count()
  for i = 0 to n - 2
    for j = 0 to n - 2 - i
      if entries[j].t > entries[j + 1].t then
        tmp         = entries[j]
        entries[j]  = entries[j + 1]
        entries[j + 1] = tmp
      end if
    end for
  end for

  target = m.totalKb - m.budgetKb
  freed  = 0
  for each e in entries
    if freed >= target then exit for
    m.loadedGuids.Delete(e.guid)
    m.accessTimes.Delete(e.guid)
    freed = freed + e.kb
    m.totalKb = m.totalKb - e.kb
    m.sizesKb.Delete(e.guid)
  end for
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

  if type(manifest.assets) <> "roAssociativeArray" then
    result.warnings.Push("No assets table in manifest")
    return result
  end if

  for each guid in manifest.assets
    entry = manifest.assets[guid]
    if entry = invalid or entry.path = invalid or entry.path = "" then
      result.missing.Push(guid)
      result.valid = false
    end if
  end for

  return result
end function
