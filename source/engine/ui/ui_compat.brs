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
  return Float(value)
end function

' ── Numeric coalesce (returns Dynamic — use when type varies) ─────────────────

function _BRS_NumCoalesce(value as Dynamic, defaultVal as Dynamic) as Dynamic
  if value = invalid then return defaultVal
  return value
end function

' ── String coalesce ───────────────────────────────────────────────────────────

function _BRS_StrCoalesce(value as Dynamic, defaultVal as String) as String
  if value = invalid then return defaultVal
  return Trim(Str(value))
end function
