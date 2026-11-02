' ui_options.brs — RGE Phase 8: Options / Settings System
'
' Loads option definitions from the resource manifest (uiOptionDefs).
' Each option has: key, defaultValue, allowedValues[], type ("float"|"int"|"bool"|"string")
'
' Built-in options (always present even without manifest entries):
'   music_volume    0.0–1.0   (float, default 1.0)
'   sound_volume    0.0–1.0   (float, default 1.0)
'   difficulty      easy|medium|hard  (string, default "medium")
'   display_mode    normal|fullscreen  (string, default "normal")
'
' Storage namespace:  "rge.options"
' UI binding: nodes with properties.boundOptionKey receive their display
'   text updated each frame from the current option value.

' ── Namespaces ────────────────────────────────────────────────────────────────

' Storage namespace for all game options
' (BrightScript has no const; define as function to avoid global mutable state)

function _OPT_Namespace() as String
  return "rge.options"
end function

' ── Init ──────────────────────────────────────────────────────────────────────

sub RokuEngine_InitializeOptions()
  if m.options = invalid then
    m.options = {
      defs:    {}   ' {key: {key, type, defaultValue, allowedValues[]}}
      current: {}   ' {key: value}  — runtime value cache
      loaded:  false
    }
  end if
  if not m.options.loaded then
    m._OPT_LoadDefs()
    m._OPT_LoadValues()
    m.options.loaded = true
  end if
end sub

' ── Load definitions from manifest ────────────────────────────────────────────

sub _OPT_LoadDefs()
  ' Built-in defaults
  m._OPT_RegisterDef("music_volume",  "float",  "1.0",    [])
  m._OPT_RegisterDef("sound_volume",  "float",  "1.0",    [])
  m._OPT_RegisterDef("difficulty",    "string", "medium", ["easy", "medium", "hard"])
  m._OPT_RegisterDef("display_mode",  "string", "normal", ["normal", "fullscreen"])

  ' Custom defs from manifest
  manifest = invalid
  if m.resources <> invalid then manifest = m.resources.manifest
  if manifest = invalid then return
  defs = manifest.uiOptionDefs
  if defs = invalid or type(defs) <> "roAssociativeArray" then return

  for each key in defs
    entry = defs[key]
    if entry = invalid then continue for
    defType = "string"
    if entry.optionType <> invalid then defType = LCase(RokuEngine_Trim(RokuEngine_ToString(entry.optionType)))
    defVal = ""
    if entry.defaultValue <> invalid then defVal = RokuEngine_Trim(RokuEngine_ToString(entry.defaultValue))
    allowed = []
    if type(entry.allowedValues) = "roArray" then
      for each av in entry.allowedValues
        allowed.Push(RokuEngine_Trim(RokuEngine_ToString(av)))
      end for
    end if
    m._OPT_RegisterDef(key, defType, defVal, allowed)
  end for
end sub

sub _OPT_RegisterDef(key as String, optionType as String, defaultValue as String, allowedValues as Object)
  m.options.defs[key] = {
    key:           key
    optionType:    optionType
    defaultValue:  defaultValue
    allowedValues: allowedValues
  }
end sub

' ── Load persisted values ─────────────────────────────────────────────────────

sub _OPT_LoadValues()
  for each key in m.options.defs
    def   = m.options.defs[key]
    saved = m.RGE_Storage_Load(_OPT_Namespace(), key, def.defaultValue)
    m.options.current[key] = saved
  end for
end sub

' ── Public get/set API ────────────────────────────────────────────────────────

function RGE_Options_Get(key as String) as String
  m.InitializeOptions()
  if m.options.current.DoesExist(key) then return m.options.current[key]
  if m.options.defs.DoesExist(key) then return m.options.defs[key].defaultValue
  return ""
end function

function RGE_Options_GetFloat(key as String) as Float
  return RokuEngine_ToFloat(Val(m.RGE_Options_Get(key)))
end function

function RGE_Options_GetInt(key as String) as Integer
  return Int(Val(m.RGE_Options_Get(key)))
end function

function RGE_Options_GetBool(key as String) as Boolean
  return LCase(RokuEngine_Trim(m.RGE_Options_Get(key))) = "true" or LCase(RokuEngine_Trim(m.RGE_Options_Get(key))) = "1"
end function

sub RGE_Options_Set(key as String, value as Dynamic)
  m.InitializeOptions()
  strVal = _BRS_StrCoalesce(value, "")

  ' Validate against allowedValues if present
  if m.options.defs.DoesExist(key) then
    def = m.options.defs[key]
    if type(def.allowedValues) = "roArray" and def.allowedValues.Count() > 0 then
      found = false
      for each av in def.allowedValues
        if av = strVal then found = true
      end for
      if not found then strVal = def.defaultValue
    end if
  end if

  m.options.current[key] = strVal
  m.RGE_Storage_Save(_OPT_Namespace(), key, strVal)
end sub

sub RGE_Options_Reset(key as String)
  m.InitializeOptions()
  if m.options.defs.DoesExist(key) then
    def = m.options.defs[key]
    m.options.current[key] = def.defaultValue
    m.RGE_Storage_Delete(_OPT_Namespace(), key)
  end if
end sub

sub RGE_Options_ResetAll()
  m.InitializeOptions()
  for each key in m.options.defs
    m.RGE_Options_Reset(key)
  end for
end sub

' Cycle to next allowed value (useful for MenuList / Button)
function RGE_Options_Cycle(key as String) as String
  m.InitializeOptions()
  if not m.options.defs.DoesExist(key) then return m.RGE_Options_Get(key)
  def     = m.options.defs[key]
  allowed = def.allowedValues
  if type(allowed) <> "roArray" or allowed.Count() = 0 then return m.RGE_Options_Get(key)

  cur   = m.RGE_Options_Get(key)
  idx   = 0
  for i = 0 to allowed.Count() - 1
    if allowed[i] = cur then idx = i
  end for
  nextIdx = (idx + 1) mod allowed.Count()
  nextVal = allowed[nextIdx]
  m.RGE_Options_Set(key, nextVal)
  return nextVal
end function

' Get display label for current value (key → "Music Volume: 80%")
function RGE_Options_GetDisplayText(key as String) as String
  m.InitializeOptions()
  val = m.RGE_Options_Get(key)

  ' Format float as percentage if 0–1 range
  if m.options.defs.DoesExist(key) then
    def = m.options.defs[key]
    if def.optionType = "float" then
      fv = RokuEngine_ToFloat(Val(val))
      if fv >= 0.0 and fv <= 1.0 then return RokuEngine_Trim(RokuEngine_ToString(Int(fv * 100))) + "%"
      return RokuEngine_Trim(RokuEngine_ToString(Int(fv)))
    end if
    if def.optionType = "int" then return RokuEngine_Trim(RokuEngine_ToString(Int(Val(val))))
    if def.optionType = "bool" then
      if val = "true" or val = "1" then return "On"
  return "Off"
    end if
  end if
  ' Capitalise first letter for string values
  if Len(val) > 0 then
    return UCase(Left(val, 1)) + Mid(val, 2)
  end if
  return val
end function

' ── UI node binding update ────────────────────────────────────────────────────
' Call each frame from UpdateFocusState or a dedicated UI update pass.
' Nodes with properties.boundOptionKey get their text updated automatically.

sub RokuEngine_UpdateOptionBindings()
  m.InitializeOptions()
  if m.scene = invalid or type(m.scene.doc.nodes) <> "roArray" then return

  for each node in m.scene.doc.nodes
    if node = invalid then continue for
    props = node.properties
    if props = invalid then continue for
    boundKey = ""
    if props.boundOptionKey <> invalid then boundKey = RokuEngine_Trim(RokuEngine_ToString(props.boundOptionKey))
    if boundKey = "" then continue for

    ' Format and set display text
    displayText = m.RGE_Options_GetDisplayText(boundKey)
    prefix = ""
    if props.boundOptionPrefix <> invalid then prefix = RokuEngine_Trim(RokuEngine_ToString(props.boundOptionPrefix))
    props.text = prefix + displayText
  end for
end sub
