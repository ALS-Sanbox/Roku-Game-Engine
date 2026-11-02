' ui_compat.brs — RGE BrightScript Compatibility Helpers
'
' These functions replace the BrightScript ?? (null-coalescing) operator,
' which is only available on firmware 9.2+ and may not compile on all targets.
'
' Usage:
'   _BRS_IntOr(value, defaultInt)    → Int if value<>invalid else defaultInt
'   _BRS_FloatOr(value, defaultFlt)  → Float if value<>invalid else defaultFlt
'   _BRS_NumCoalesce(value, default) → value as-is if <>invalid else default
'   _BRS_StrCoalesce(value, default) → value as String if <>invalid else default

' ── Integer coalesce ──────────────────────────────────────────────────────────

function _BRS_IntOr(value as Dynamic, defaultVal as Integer) as Integer
  if value = invalid then return defaultVal
  return Int(value)
end function

' ── Float coalesce ────────────────────────────────────────────────────────────

function _BRS_FloatOr(value as Dynamic, defaultVal as Float) as Float
  if value = invalid then return defaultVal
  return RokuEngine_ToFloat(value)
end function

' ── Numeric coalesce (returns Dynamic — use when type varies) ─────────────────

function _BRS_NumCoalesce(value as Dynamic, defaultVal as Dynamic) as Dynamic
  if value = invalid then return defaultVal
  return value
end function

' ── String coalesce ───────────────────────────────────────────────────────────

function _BRS_StrCoalesce(value as Dynamic, defaultVal as String) as String
  if value = invalid then return defaultVal
  return RokuEngine_Trim(RokuEngine_ToString(value))
end function

' BrightScript uses string methods rather than JavaScript-style Trim/Float globals.
function RokuEngine_ToString(value as Dynamic) as String
  if value = invalid then return ""
  if GetInterface(value, "ifString") <> invalid then return value
  if GetInterface(value, "ifInt") <> invalid or GetInterface(value, "ifFloat") <> invalid or GetInterface(value, "ifDouble") <> invalid or GetInterface(value, "ifBoolean") <> invalid then return value.ToStr()
  return ""
end function

function RokuEngine_Trim(value as Dynamic) as String
  text = RokuEngine_ToString(value)
  return text.Trim()
end function

function RokuEngine_ToFloat(value as Dynamic) as Float
  if value = invalid then return 0.0
  if GetInterface(value, "ifString") <> invalid then return Val(value)
  return value * 1.0
end function
