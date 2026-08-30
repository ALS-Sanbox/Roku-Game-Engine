' ui_high_scores.brs — RGE Phase 8: High Score System
'
' Manages one or more named score tables.
' Each table definition (from manifest uiHighScoreTable):
'   tableId      — unique string id
'   maxEntries   — max rows kept (default 10)
'   sortOrder    — "desc" (highest first) or "asc" (lowest first)
'
' Each score entry:
'   initials  — up to 3 chars, uppercase
'   score     — integer
'   date      — YYYYMMDD string (from roDateTime if available)
'   extra     — optional freeform string (level, wave, etc.)
'
' Storage namespace: "rge.scores.<tableId>"
' Entries stored as JSON-encoded array; key = "entries"

' ── Namespace builder ─────────────────────────────────────────────────────────

function _HS_NS(tableId as String) as String
  return "rge.scores." + Left(Trim(tableId), 20)
end function

' ── Init ──────────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeHighScores()
  if m.highScores = invalid then
    m.highScores = {
      tables:  {}   ' {tableId: {def, entries[]}}
      loaded:  false
    }
  end if
  if not m.highScores.loaded then
    _HS_LoadDefs()
    m.highScores.loaded = true
  end if
end sub

sub _HS_LoadDefs()
  ' Default table always exists
  _HS_EnsureTable("default", 10, "desc")

  manifest = invalid
  if m.resources <> invalid then manifest = m.resources.manifest
  if manifest = invalid then return

  tables = manifest.uiHighScoreTable
  if tables = invalid or type(tables) <> "roAssociativeArray" then
    ' Also check uiHighScoreTables (plural)
    tables = manifest.uiHighScoreTables
    if tables = invalid or type(tables) <> "roAssociativeArray" then return
  end if

  for each tableId in tables
    entry = tables[tableId]
    if entry = invalid then continue for
    maxEntries = 10
    if entry.maxEntries <> invalid then maxEntries = Int(entry.maxEntries)
    if maxEntries < 1  then maxEntries = 1
    if maxEntries > 100 then maxEntries = 100
    sortOrder = "desc"
    if entry.sortOrder <> invalid then sortOrder = LCase(Trim(Str(entry.sortOrder)))
    _HS_EnsureTable(tableId, maxEntries, sortOrder)
  end for
end sub

sub _HS_EnsureTable(tableId as String, maxEntries as Integer, sortOrder as String)
  if m.highScores.tables.DoesExist(tableId) then return
  entries = _HS_LoadEntriesFromStorage(tableId)
  m.highScores.tables[tableId] = {
    tableId:    tableId
    maxEntries: maxEntries
    sortOrder:  sortOrder
    entries:    entries
  }
end sub

' ── Storage serialisation ─────────────────────────────────────────────────────

function _HS_LoadEntriesFromStorage(tableId as String) as Object
  raw = RGE_Storage_Load(_HS_NS(tableId), "entries", "[]")
  if raw = "" or raw = "[]" then return []
  parsed = ParseJson(raw)
  if parsed = invalid or type(parsed) <> "roArray" then return []
  result = []
  for each e in parsed
    if e <> invalid and e.score <> invalid then
      entry = {
        initials: _HS_Coerce(e.initials, "AAA")
        score:    Int(e.score)
        date:     _HS_Coerce(e.date, "")
        extra:    _HS_Coerce(e.extra, "")
      }
      result.Push(entry)
    end if
  end for
  return result
end function

sub _HS_SaveEntriesToStorage(tableId as String, entries as Object)
  ' Roku has no FormatJson built-in on older firmware; we build JSON manually.
  parts = []
  for each e in entries
    escaped_init  = _HS_JsonStr(e.initials)
    escaped_date  = _HS_JsonStr(e.date)
    escaped_extra = _HS_JsonStr(e.extra)
    rowJson = "{""initials"":" + escaped_init + ",""score"":" + Trim(Str(e.score)) + ",""date"":" + escaped_date + ",""extra"":" + escaped_extra + "}"
    parts.Push(rowJson)
  end for
  raw = "[" + _HS_Join(parts, ",") + "]"
  RGE_Storage_Save(_HS_NS(tableId), "entries", raw)
end sub

function _HS_JsonStr(s as Dynamic) as String
  v = Trim(Str(s))
  ' Escape backslashes and double-quotes
  v = v.Replace("\", "\\").Replace(Chr(34), "\" + Chr(34))
  return Chr(34) + v + Chr(34)
end function

function _HS_Join(arr as Object, sep as String) as String
  result = ""
  for i = 0 to arr.Count() - 1
    if i > 0 then result = result + sep
    result = result + arr[i]
  end for
  return result
end function

' ── Public API ────────────────────────────────────────────────────────────────

' Add a new score. Returns true if it made the table.
function RGE_HighScores_Add(tableId as String, score as Integer, initials as String, extra as Dynamic) as Boolean
  if extra = invalid then extra = ""
  m.InitializeHighScores()
  _HS_EnsureTable(tableId, 10, "desc")
  table = m.highScores.tables[tableId]

  ' Normalise initials: uppercase, max 3 chars, pad to 3
  inits = UCase(Left(Trim(initials), 3))
  while Len(inits) < 3
    inits = inits + " "
  end while

  ' Get current date
  dateStr = ""
  dt = CreateObject("roDateTime")
  if dt <> invalid then
    year  = Trim(Str(dt.GetYear()))
    month = Trim(Str(dt.GetMonth()))
    day   = Trim(Str(dt.GetDayOfMonth()))
    if Len(month) = 1 then month = "0" + month
    if Len(day)   = 1 then day   = "0" + day
    dateStr = year + month + day
  end if

  entry = { initials: inits, score: score, date: dateStr, extra: Trim(extra) }
  table.entries.Push(entry)

  ' Sort
  _HS_Sort(table)

  ' Trim to maxEntries
  while table.entries.Count() > table.maxEntries
    table.entries.Pop()
  end while

  ' Check if our entry survived
  survived = false
  for each e in table.entries
    if e.initials = inits and e.score = score then survived = true
  end for

  _HS_SaveEntriesToStorage(tableId, table.entries)
  return survived
end function

' Get all entries for a table (sorted, trimmed)
function RGE_HighScores_GetEntries(tableId as String) as Object
  m.InitializeHighScores()
  _HS_EnsureTable(tableId, 10, "desc")
  return m.highScores.tables[tableId].entries
end function

' Clear all entries from a table
sub RGE_HighScores_Clear(tableId as String)
  m.InitializeHighScores()
  if m.highScores.tables.DoesExist(tableId) then
    m.highScores.tables[tableId].entries = []
  end if
  RGE_Storage_ClearNamespace(_HS_NS(tableId))
end sub

' Is a score good enough to make the table?
function RGE_HighScores_IsHighScore(tableId as String, score as Integer) as Boolean
  m.InitializeHighScores()
  _HS_EnsureTable(tableId, 10, "desc")
  table = m.highScores.tables[tableId]
  entries = table.entries
  if entries.Count() < table.maxEntries then return true
  worstEntry = entries[entries.Count() - 1]
  if table.sortOrder = "asc" then
    return score < worstEntry.score
  end if
  return score > worstEntry.score
end function

' Get a formatted display row string  "1. AAA  98765  20250101"
function RGE_HighScores_GetRowText(tableId as String, rank as Integer) as String
  m.InitializeHighScores()
  entries = RGE_HighScores_GetEntries(tableId)
  idx = rank - 1
  if idx < 0 or idx >= entries.Count() then return ""
  e = entries[idx]
  scoreStr = Trim(Str(e.score))
  dateStr  = e.date
  if dateStr = "" then dateStr = "--------"
  return Trim(Str(rank)) + ". " + e.initials + "  " + scoreStr + "  " + dateStr
end function

' ── Sorting ───────────────────────────────────────────────────────────────────

sub _HS_Sort(table as Object)
  entries = table.entries
  n = entries.Count()
  if n < 2 then return
  ' Insertion sort (stable, fine for max 100 entries)
  desc = (table.sortOrder = "desc")
  for i = 1 to n - 1
    cur = entries[i]
    j   = i - 1
    while j >= 0
      prev = entries[j]
      if desc then swap = prev.score < cur.score else swap = prev.score > cur.score
      if not swap then exit while
      entries[j + 1] = prev
      j = j - 1
    end while
    entries[j + 1] = cur
  end for
end sub

' ── UI node binding update ────────────────────────────────────────────────────
' Nodes with properties.boundHighScoreTable + properties.boundHighScoreRank
' get their text updated each frame.

sub RokuEngine_UpdateHighScoreBindings()
  m.InitializeHighScores()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return

  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    props = node.properties
    if props = invalid then continue for
    tableId = ""
    if props.boundHighScoreTable <> invalid then tableId = Trim(Str(props.boundHighScoreTable))
    if tableId = "" then continue for

    rank = 1
    if props.boundHighScoreRank <> invalid then rank = Int(props.boundHighScoreRank)
    props.text = RGE_HighScores_GetRowText(tableId, rank)
  end for
end sub

' ── Utility helpers ───────────────────────────────────────────────────────────

function _HS_Coerce(v as Dynamic, defaultVal as String) as String
  if v = invalid then return defaultVal
  return Trim(Str(v))
end function
