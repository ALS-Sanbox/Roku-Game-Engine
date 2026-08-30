' ui_storage.brs — RGE Phase 8: Persistent Storage Wrapper
'
' Wraps Roku's roRegistry with a clean namespace-keyed API.
' All operations are safely guarded — if the registry is unavailable
' (e.g. unit test environments) every operation silently no-ops.
'
' Namespace: string prefix that groups related keys (e.g. "rge.options").
' Key:       string name within the namespace.
' Value:     stored as a string; callers parse as needed.
'
' Registry section names may not exceed 64 chars on some Roku versions,
' so namespaces are truncated to 40 chars before use.

' ── Init ──────────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeStorage()
  if m.storage = invalid then
    m.storage = {
      available:  false
      registry:   invalid
      cache:      {}   ' {namespace: {key: value}} — in-memory write-through cache
    }
    reg = CreateObject("roRegistry")
    if reg <> invalid then
      m.storage.available = true
      m.storage.registry  = reg
    end if
  end if
end sub

' ── Low-level section access ──────────────────────────────────────────────────

function _STG_GetSection(namespace as String) as Dynamic
  if not m.storage.available then return invalid
  ns = Left(Trim(namespace), 40)
  if ns = "" then return invalid
  section = CreateObject("roRegistrySection", ns)
  return section
end function

' ── Save ──────────────────────────────────────────────────────────────────────

sub RGE_Storage_Save(namespace as String, key as String, value as Dynamic)
  m.InitializeStorage()

  ' Cache write-through
  ns = Left(Trim(namespace), 40)
  if m.storage.cache.DoesExist(ns) <> true then m.storage.cache[ns] = {}
  m.storage.cache[ns][key] = _BRS_StrCoalesce(value, "")

  if not m.storage.available then return
  section = _STG_GetSection(namespace)
  if section = invalid then return
  section.Write(key, _BRS_StrCoalesce(value, ""))
  section.Flush()
end sub

' ── Load ──────────────────────────────────────────────────────────────────────

function RGE_Storage_Load(namespace as String, key as String, defaultValue as Dynamic) as String
  if defaultValue = invalid then defaultValue = ""
  m.InitializeStorage()
  ns = Left(Trim(namespace), 40)

  ' Check cache first
  if m.storage.cache.DoesExist(ns) and m.storage.cache[ns].DoesExist(key) then
    return m.storage.cache[ns][key]
  end if

  if not m.storage.available then return _BRS_StrCoalesce(defaultValue, "")
  section = _STG_GetSection(namespace)
  if section = invalid then return _BRS_StrCoalesce(defaultValue, "")

  if section.Exists(key) then
    val = section.Read(key)
    ' Populate cache
    if m.storage.cache.DoesExist(ns) <> true then m.storage.cache[ns] = {}
    m.storage.cache[ns][key] = val
    return val
  end if
  return _BRS_StrCoalesce(defaultValue, "")
end function

' ── Load typed variants ───────────────────────────────────────────────────────

function RGE_Storage_LoadFloat(namespace as String, key as String, defaultValue as Dynamic) as Float
  if defaultValue = invalid then defaultValue = 0.0
  raw = RGE_Storage_Load(namespace, key, Trim(Str(defaultValue)))
  v = Val(raw)
  if v = invalid then return defaultValue
  return Float(v)
end function

function RGE_Storage_LoadInt(namespace as String, key as String, defaultValue as Dynamic) as Integer
  if defaultValue = invalid then defaultValue = 0
  raw = RGE_Storage_Load(namespace, key, Trim(Str(defaultValue)))
  return Int(Val(raw))
end function

function RGE_Storage_LoadBool(namespace as String, key as String, defaultValue as Dynamic) as Boolean
  if defaultValue = invalid then defaultValue = false
  raw = LCase(Trim(RGE_Storage_Load(namespace, key, _STG_BoolToStr(defaultValue))))
  return raw = "true" or raw = "1" or raw = "yes"
end function

' ── Delete ────────────────────────────────────────────────────────────────────

sub RGE_Storage_Delete(namespace as String, key as String)
  m.InitializeStorage()
  ns = Left(Trim(namespace), 40)

  ' Remove from cache
  if m.storage.cache.DoesExist(ns) and m.storage.cache[ns].DoesExist(key) then
    m.storage.cache[ns].Delete(key)
  end if

  if not m.storage.available then return
  section = _STG_GetSection(namespace)
  if section = invalid then return
  if section.Exists(key) then
    section.Delete(key)
    section.Flush()
  end if
end sub

' ── Clear namespace ───────────────────────────────────────────────────────────

sub RGE_Storage_ClearNamespace(namespace as String)
  m.InitializeStorage()
  ns = Left(Trim(namespace), 40)

  ' Clear cache
  m.storage.cache[ns] = {}

  if not m.storage.available then return
  section = _STG_GetSection(namespace)
  if section = invalid then return
  keys = section.GetKeyList()
  if type(keys) <> "roArray" then return
  for each k in keys
    section.Delete(k)
  end for
  section.Flush()
end sub

' ── List keys in namespace ────────────────────────────────────────────────────

function RGE_Storage_ListKeys(namespace as String) as Object
  m.InitializeStorage()
  if not m.storage.available then return []
  section = _STG_GetSection(namespace)
  if section = invalid then return []
  keys = section.GetKeyList()
  if type(keys) <> "roArray" then return []
  return keys
end function

' ── Exists ────────────────────────────────────────────────────────────────────

function RGE_Storage_Exists(namespace as String, key as String) as Boolean
  m.InitializeStorage()
  ns = Left(Trim(namespace), 40)
  if m.storage.cache.DoesExist(ns) and m.storage.cache[ns].DoesExist(key) then return true
  if not m.storage.available then return false
  section = _STG_GetSection(namespace)
  if section = invalid then return false
  return section.Exists(key) = true
end function

function _STG_BoolToStr(b as Dynamic) as String
  if b = true then return "true"
  return "false"
end function
